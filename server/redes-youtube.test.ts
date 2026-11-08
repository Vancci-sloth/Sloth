import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import test, { type TestContext } from 'node:test'
import { huella } from './disco.ts'
import { descripcionShort, tituloShort, youtubeShorts } from './redes/youtube.ts'

const URL_SUBIDA = 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=prueba'
const canal = { cuenta: () => ({ id: 'UC1', nombre: 'Mi canal' }), token: async () => 'prueba' }

function preparar(t: TestContext) {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const app = mkdtempSync(join(base, 'prueba-shorts-'))
  t.after(() => { assert.ok(app.startsWith(base + sep)); rmSync(app, { recursive: true, force: true }) })
  const ruta = join(app, 'corte.mp4')
  writeFileSync(ruta, Buffer.alloc(300, 7))
  return { app, ruta }
}
const nav = async () => { throw new Error('YouTube no usa el navegador') }

test('el título cabe en los 100 caracteres de YouTube, y la descripción lleva los hashtags y #Shorts', () => {
  assert.equal(tituloShort('Pidió frenar a los hackers. El hacker era él.'), 'Pidió frenar a los hackers. El hacker era él.')
  const largo = 'Prometió que su IA haría todo el trabajo de la oficina sin errores. Al día siguiente borró la base de datos de la empresa entera.'
  assert.equal(tituloShort(largo), 'Prometió que su IA haría todo el trabajo de la oficina sin errores.')
  assert.ok([...tituloShort('a '.repeat(80))].length <= 100)
  assert.equal(descripcionShort('Texto <con> signos', ['IA', 'shorts']), 'Texto con signos\n\n#IA #Shorts')
})

test('no publica Shorts hasta que se activa, y pide el canal de YouTube conectado', async (t) => {
  const { app } = preparar(t)
  const sinCanal = youtubeShorts(app, { cuenta: () => null, token: canal.token })
  await assert.rejects(sinCanal.token!('si'), /conecta tu canal/)
  const red = youtubeShorts(app, canal)
  assert.deepEqual(await red.cuenta(nav), { cuenta: null })
  assert.equal(await red.token!('si'), 'Mi canal')
  assert.deepEqual(await red.cuenta(nav), { cuenta: 'Mi canal' })
  assert.equal(await red.token!(null), null)
  assert.deepEqual(await youtubeShorts(app, canal).cuenta(nav), { cuenta: null })
})

test('sube el Short privado con su hora, y al moverlo solo cambia la hora', async (t) => {
  const { app, ruta } = preparar(t)
  const red = youtubeShorts(app, canal)
  await red.token!('si')
  const llamadas: string[] = []
  let publishAt = ''
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit = {}) => {
    llamadas.push(`${init.method ?? 'GET'} ${url.split('?')[0].split('/').pop()}`)
    if (init.method === 'POST') {
      const b = JSON.parse(String(init.body))
      assert.equal(b.status.privacyStatus, 'private')
      assert.equal(b.snippet.title, 'Pidió frenar a los hackers.')
      assert.match(b.snippet.description, /#IA #Shorts$/)
      assert.equal(b.status.selfDeclaredMadeForKids, false)
      assert.equal(b.status.containsSyntheticMedia, true)
      publishAt = b.status.publishAt
      return new Response(null, { headers: { location: URL_SUBIDA } })
    }
    if (url === URL_SUBIDA) return Response.json({ id: 'short-1' })
    if (init.method === 'PUT') {
      const status = JSON.parse(String(init.body)).status
      // Al cambiar la hora, lo declarado sigue igual: YouTube borraría lo que no se manda.
      assert.equal(status.containsSyntheticMedia, true)
      assert.equal(status.selfDeclaredMadeForKids, false)
      publishAt = status.publishAt
      return Response.json({})
    }
    return Response.json({ items: [{ id: 'short-1', status: { privacyStatus: 'private', publishAt } }] })
  })
  const p = { ruta, huella: huella(ruta), texto: 'Pidió frenar a los hackers.', tags: ['IA'], cuando: '2099-01-02 12:00', ref: 'r1', reintento: false, sintetico: true }
  await red.programar(nav, p)
  assert.equal(Date.parse(publishAt), new Date('2099-01-02T12:00').getTime())
  assert.deepEqual(llamadas, ['POST videos', 'PUT videos'])
  // «Pasar al ritmo nuevo»: el mismo `ref`, otra hora. No se sube otra vez.
  llamadas.length = 0
  await red.programar(nav, { ...p, cuando: '2099-01-03 18:00', reintento: true })
  assert.deepEqual(llamadas, ['GET videos', 'PUT videos'])
  assert.equal(Date.parse(publishAt), new Date('2099-01-03T18:00').getTime())
  assert.ok(existsSync(join(app, 'data', 'redes', 'youtube.json')))
})

test('ve qué ya salió o qué rechazó YouTube, y quitar borra el video del canal', async (t) => {
  const { app } = preparar(t)
  mkdirSync(join(app, 'data', 'redes'), { recursive: true })
  const subida = (id: string) => ({ canal: 'UC1', id, estado: 'terminado', enviados: 1, total: 1, datos: { titulo: 'x', descripcion: '', privacidad: 'private', infantil: false, sintetico: false } })
  writeFileSync(join(app, 'data', 'redes', 'youtube.json'), JSON.stringify({ activo: true, subidas: { a: subida('va'), b: subida('vb'), c: subida('vc'), d: subida('vd') } }))
  const borrados: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit = {}) => {
    if (init.method === 'DELETE') return borrados.push(new URL(url).searchParams.get('id')!), new Response(null, { status: 204 })
    return Response.json({ items: [
      { id: 'va', status: { privacyStatus: 'public' } },
      { id: 'vb', status: { privacyStatus: 'private', uploadStatus: 'rejected', rejectionReason: 'duplicate' } },
      { id: 'vd', status: { privacyStatus: 'private', uploadStatus: 'processed' } },
    ] })
  })
  const red = youtubeShorts(app, canal)
  const estados = await red.estados!()
  assert.deepEqual(estados.a, { estado: 'publicado' })
  assert.equal(estados.b?.estado, 'error')
  assert.match(estados.c && 'error' in estados.c ? estados.c.error : '', /Ya no está/)
  assert.equal(estados.d, undefined)
  await red.quitar!('d')
  assert.deepEqual(borrados, ['vd'])
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(app, 'data', 'redes', 'youtube.json'), 'utf8')).subidas), ['b', 'c'])
})
