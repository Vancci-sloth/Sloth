import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { leerForma, nombreDeDescarga } from './etapas.ts'

/** Una caja de MP4: su largo, su tipo y lo de dentro. */
const caja = (tipo: string, ...dentro: Buffer[]) => {
  const cuerpo = Buffer.concat(dentro)
  const cab = Buffer.alloc(8)
  cab.writeUInt32BE(8 + cuerpo.length)
  cab.write(tipo, 4, 'latin1')
  return Buffer.concat([cab, cuerpo])
}
/** `mvhd` versión 0: escala en 12 y duración en 16. */
const mvhd = (escala: number, duracion: number) => {
  const b = Buffer.alloc(100)
  b.writeUInt32BE(escala, 12)
  b.writeUInt32BE(duracion, 16)
  return caja('mvhd', b)
}
/** `tkhd` versión 0, con el ancho y el alto (16.16) al final. */
const tkhd = (ancho: number, alto: number) => {
  const b = Buffer.alloc(84)
  b.writeUInt32BE(ancho * 65536, 76)
  b.writeUInt32BE(alto * 65536, 80)
  return caja('tkhd', b)
}

test('de la cabecera de un MP4 sale si es vertical y cuánto dura, con el moov al final y una pista de audio delante', () => {
  const dir = mkdtempSync(join(tmpdir(), 'forma-'))
  try {
    const archivo = join(dir, 'v.mp4')
    const audio = caja('trak', tkhd(0, 0))
    const video = caja('trak', tkhd(1080, 1920))
    writeFileSync(archivo, Buffer.concat([caja('ftyp', Buffer.from('isom')), caja('mdat', Buffer.alloc(32)), caja('moov', mvhd(1000, 29_733), audio, video)]))
    assert.deepEqual(leerForma(archivo), { vertical: true, segundos: 29.7 })
    writeFileSync(archivo, Buffer.concat([caja('moov', mvhd(600, 600 * 75), caja('trak', tkhd(1920, 1080)))]))
    assert.deepEqual(leerForma(archivo), { vertical: false, segundos: 75 })
    assert.deepEqual(leerForma(join(dir, 'no-esta.mp4')), {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('la duración de un mvhd versión 1, y ninguna si es «desconocida», cero o la caja viene corta', () => {
  const dir = mkdtempSync(join(tmpdir(), 'forma-'))
  try {
    const archivo = join(dir, 'v.mp4')
    const v1 = (escala: number, duracion: bigint, largo = 112) => {
      const b = Buffer.alloc(largo)
      b[0] = 1
      if (largo >= 32) b.writeUInt32BE(escala, 20), b.writeBigUInt64BE(duracion, 24)
      return caja('mvhd', b)
    }
    writeFileSync(archivo, caja('moov', v1(90000, 90000n * 61n), caja('trak', tkhd(1080, 1920))))
    assert.deepEqual(leerForma(archivo), { vertical: true, segundos: 61 })
    writeFileSync(archivo, caja('moov', v1(90000, 0xffffffffffffffffn), caja('trak', tkhd(1080, 1920))))
    assert.deepEqual(leerForma(archivo), { vertical: true })
    writeFileSync(archivo, caja('moov', mvhd(1000, 0xffffffff), caja('trak', tkhd(1920, 1080))))
    assert.deepEqual(leerForma(archivo), { vertical: false })
    writeFileSync(archivo, caja('moov', mvhd(1000, 0), caja('trak', tkhd(1920, 1080))))
    assert.deepEqual(leerForma(archivo), { vertical: false })
    writeFileSync(archivo, caja('moov', v1(90000, 1n, 24), caja('trak', tkhd(1920, 1080))))
    assert.deepEqual(leerForma(archivo), { vertical: false })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('al bajarlo, el video lleva el nombre de su carpeta delante, salvo que ya se llame como ella', () => {
  assert.equal(nombreDeDescarga({ ruta: 'C:\\t\\video-explicativo\\pica-chile\\out\\pica-chile.mp4', archivo: 'out/pica-chile.mp4' }), 'pica-chile.mp4')
  assert.equal(nombreDeDescarga({ ruta: 'C:\\t\\video-el-diff\\serie-2\\out\\el-diff-final.mp4', archivo: 'out/el-diff-final.mp4' }), 'serie-2 - el-diff-final.mp4')
  assert.equal(nombreDeDescarga({ ruta: '/t/reels/reel-cielo/reel-cielo.mp4', archivo: 'reel-cielo.mp4' }), 'reel-cielo.mp4')
})
