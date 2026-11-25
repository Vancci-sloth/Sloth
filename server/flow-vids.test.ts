import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { test } from 'node:test'
import { MODELO_VIDS } from '../shared/flow.ts'
import { flow } from './flow/index.ts'

// Lo que el servidor no deja pedir a Google Vids, antes de abrir nada: así no se gasta su cupo en un pedido que no sirve.
test('un video de Google Vids dura de 3 a 15 s, toma hasta 3 referencias PNG o JPEG y no parte de un primer cuadro', async () => {
  const app = await mkdtemp(join(tmpdir(), 'sloth-vids-'))
  try {
    const servicio = flow(app, {
      cuenta: () => 'una@gmail.com',
      enEdge: async () => {
        throw new Error('No debe abrir Google')
      },
      abrirEnEdge: async () => {}
    })
    const pedir = async (cuerpo: object) => {
      const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(cuerpo))]), { method: 'POST', url: '/api/flow/generar' })
      const partes: Buffer[] = []
      let status = 0
      const res = Object.assign(new Writable({ write: (t: Buffer, _e, listo) => (partes.push(t), listo()) }), { writeHead: (c: number) => void (status = c) })
      await servicio.api(req as unknown as IncomingMessage, res as unknown as ServerResponse, '/api/flow/generar')
      return { status, error: (JSON.parse(Buffer.concat(partes).toString()) as { error?: string }).error ?? '' }
    }
    const png = join(app, 'perro.png')
    const webp = join(app, 'perro.webp')
    await writeFile(png, 'x')
    await writeFile(webp, 'x')
    const video = { tipo: 'video', prompt: 'un perezoso', modelo: MODELO_VIDS, salida: join(app, 'clip.mp4') }

    assert.match((await pedir({ ...video, segundos: 2 })).error, /de 3 a 15 s/)
    assert.match((await pedir({ ...video, segundos: 16 })).error, /de 3 a 15 s/)
    assert.match((await pedir({ ...video, primerCuadro: png })).error, /no parte de un primer cuadro/)
    assert.match((await pedir({ ...video, referencias: [png, png, png, png] })).error, /hasta 3 referencias/)
    assert.match((await pedir({ ...video, referencias: [webp] })).error, /solo toma PNG y JPEG/)
    // Las referencias piden la confirmación de derechos, como en Flow.
    assert.equal((await pedir({ ...video, referencias: [png] })).status, 409)
    // Los de Flow duran 8 s: la duración es solo de Vids.
    assert.match((await pedir({ ...video, modelo: 'Veo 3.1 - Lite', segundos: 5 })).error, /solo de Google Vids/)
  } finally {
    await rm(app, { recursive: true, force: true })
  }
})
