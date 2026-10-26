import assert from 'node:assert/strict'
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { adjuntosSueltos, bajados, cachesViejas, compartir, mismoArbol, regenerables } from './espacio.ts'

function carpeta(t: { after(fn: () => void): void }) {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-espacio-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const poner = (ruta: string, texto = 'x') => {
    mkdirSync(join(raiz, ruta, '..'), { recursive: true })
    writeFileSync(join(raiz, ruta), texto)
  }
  return { raiz, poner }
}

const lock = (paquetes: Record<string, unknown>, nombre = 'video') => JSON.stringify({ name: nombre, lockfileVersion: 3, packages: { '': { name: nombre }, ...paquetes } })

test('de out/ solo cuenta lo que un render rehace, nunca el video final', (t) => {
  const { raiz, poner } = carpeta(t)
  poner('out/el-diff-final.mp4')
  poner('out/partes/tramo-1.mov')
  poner('out/redes/partes/a.mov')
  poner('out/redes/_bundle_rev/index.html')
  poner('out/_render-123.mp4')
  poner('out/_viejo-1-final.mp4')
  poner('out/video.mp4.remotion-in-progress')
  poner('public/partes/no.mov') // fuera de out/
  const hallados = regenerables(raiz).map((r) => r.slice(raiz.length + 1).replaceAll('\\', '/')).sort()
  assert.deepEqual(hallados, ['out/_render-123.mp4', 'out/_viejo-1-final.mp4', 'out/partes', 'out/redes/_bundle_rev', 'out/redes/partes', 'out/video.mp4.remotion-in-progress'])
})

test('los videos bajados se cuentan una vez aunque estén enlazados en dos carpetas', (t) => {
  const { raiz, poner } = carpeta(t)
  poner('a/fuentes/tema/video.mp4', '1234567890')
  poner('a/fuentes/tema/video.info.json', '{}')
  poner('a/fuentes/voz/video.mp4', 'mi voz') // sin video.info.json: no se bajó, se queda
  mkdirSync(join(raiz, 'b', 'fuentes', 'tema'), { recursive: true })
  linkSync(join(raiz, 'a/fuentes/tema/video.mp4'), join(raiz, 'b/fuentes/tema/video.mp4'))
  poner('b/fuentes/tema/video.info.json', '{}')
  const vistos = new Set<string>()
  const a = bajados(join(raiz, 'a'), vistos)
  const b = bajados(join(raiz, 'b'), vistos)
  assert.deepEqual(a.map((v) => v.bytes), [10])
  assert.deepEqual(b.map((v) => v.bytes), [0])
})

test('el mismo árbol de paquetes aunque cambie la raíz o el orden', (t) => {
  const { raiz, poner } = carpeta(t)
  poner('a.json', lock({ 'node_modules/remotion': { version: '4.0.532', resolved: 'r' } }, 'uno'))
  poner('b.json', JSON.stringify({ packages: { 'node_modules/remotion': { resolved: 'r', version: '4.0.532' }, '': { name: 'dos' } } }))
  poner('c.json', lock({ 'node_modules/remotion': { version: '4.0.533' } }))
  assert.ok(mismoArbol(join(raiz, 'a.json'), join(raiz, 'b.json')))
  assert.ok(!mismoArbol(join(raiz, 'a.json'), join(raiz, 'c.json')))
  assert.ok(!mismoArbol(join(raiz, 'a.json'), join(raiz, 'no-existe.json')))
})

test('de las cachés de webpack quedan las dos más nuevas de cada tipo', (t) => {
  const { raiz, poner } = carpeta(t)
  const nm = join(raiz, 'node_modules')
  ;['vieja', 'media', 'nueva'].forEach((h, i) => {
    poner(`node_modules/.cache/webpack/remotion-production-4.0.532/${h}/0.pack`)
    const d = join(nm, '.cache/webpack/remotion-production-4.0.532', h)
    utimesSync(d, new Date(1e12 + i * 1e6), new Date(1e12 + i * 1e6))
  })
  poner('node_modules/.cache/webpack/remotion-development-4.0.532/sola/0.pack')
  assert.deepEqual(cachesViejas(nm).map((d) => d.split(/[\\/]/).pop()), ['vieja'])
})

test('una copia propia de node_modules pasa a ser la compartida y luego se enlaza', async (t) => {
  const { raiz, poner } = carpeta(t)
  for (const f of ['package.json', 'package-lock.json']) poner(`plantilla/${f}`, '{}')
  for (const v of ['uno', 'dos']) {
    poner(`${v}/node_modules/remotion/index.js`, v)
    poner(`${v}/node_modules/@remotion/cli/index.js`)
  }
  const casa = join(raiz, 'casa')
  await compartir(join(raiz, 'uno', 'node_modules'), casa, join(raiz, 'plantilla'))
  // La primera no copia: la suya pasa a la casa, y la del segundo se borra y se enlaza a esa.
  assert.equal(readFileSync(join(casa, 'node_modules/remotion/index.js'), 'utf8'), 'uno')
  await compartir(join(raiz, 'dos', 'node_modules'), casa, join(raiz, 'plantilla'))
  for (const v of ['uno', 'dos']) {
    assert.ok(lstatSync(join(raiz, v, 'node_modules')).isSymbolicLink())
    assert.equal(realpathSync(join(raiz, v, 'node_modules')).toLowerCase(), realpathSync(join(casa, 'node_modules')).toLowerCase())
  }
  assert.equal(readFileSync(join(raiz, 'dos/node_modules/remotion/index.js'), 'utf8'), 'uno')
  assert.ok(existsSync(join(casa, 'package-lock.json')))
})

test('los adjuntos viejos que ningún hilo nombra son los sueltos', async (t) => {
  const { raiz, poner } = carpeta(t)
  poner('data/attachments/1700000000001-foto.png')
  poner('data/attachments/1700000000002-otra foto.png')
  poner('data/attachments/1700000000003-portada.png')
  poner('data/attachments/1900000000004-nueva.png')
  poner('data/sessions/a.jsonl', '{"texto":"C:\\\\app\\\\data\\\\attachments\\\\1700000000001-foto.png"}')
  poner('data/redes.json', '{"miniatura":"1700000000003-portada.png"}')
  const viejo = new Date(1.7e12)
  for (const n of ['1700000000001-foto.png', '1700000000002-otra foto.png', '1700000000003-portada.png']) utimesSync(join(raiz, 'data/attachments', n), viejo, viejo)
  const sueltos = await adjuntosSueltos(raiz, 1.75e12)
  assert.deepEqual(sueltos.map((s) => s.split(/[\\/]/).pop()), ['1700000000002-otra foto.png'])
})
