import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import test, { type TestContext } from 'node:test'
import { subirYoutube, type SubidaYoutube } from './youtube-subida.ts'

const URL_SUBIDA = 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=prueba'

function video(t: TestContext, total: number) {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-youtube-'))
  const ruta = join(dir, 'video.mp4')
  writeFileSync(ruta, Buffer.alloc(total, 7))
  t.after(() => { assert.ok(dir.startsWith(base + sep)); rmSync(dir, { recursive: true, force: true }) })
  const subida: SubidaYoutube = { estado: 'subiendo', enviados: 0, total, datos: { titulo: 'Video largo', descripcion: 'Descripción', privacidad: 'private', infantil: false, sintetico: true } }
  return { ruta, subida }
}

test('sube un archivo grande por bloques y guarda la sesión antes de enviar el video', async (t) => {
  const total = 8 * 1024 * 1024 + 120
  const { ruta, subida } = video(t, total)
  const rangos: string[] = []
  let guardada = false
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const h = new Headers(init.headers)
    assert.equal(h.get('authorization'), 'Bearer prueba')
    if (init.method === 'POST') {
      const b = JSON.parse(String(init.body))
      assert.equal(b.status.privacyStatus, 'private')
      assert.equal(b.status.containsSyntheticMedia, true)
      assert.equal(h.get('x-upload-content-length'), String(total))
      return new Response(null, { status: 200, headers: { location: URL_SUBIDA } })
    }
    assert.equal(url, URL_SUBIDA)
    assert.ok(guardada)
    const rango = h.get('content-range')!
    rangos.push(rango)
    assert.equal((init.body as Uint8Array).length, Number(h.get('content-length')))
    return rangos.length === 1 ? new Response(null, { status: 308, headers: { range: 'bytes=0-8388607' } }) : Response.json({ id: 'video-subido' })
  })
  await subirYoutube(ruta, subida, async () => 'prueba', () => { if (subida.url) guardada = true })
  assert.deepEqual(rangos, [`bytes 0-8388607/${total}`, `bytes 8388608-${total - 1}/${total}`])
  assert.equal(subida.estado, 'terminado')
  assert.equal(subida.id, 'video-subido')
  assert.equal(subida.enviados, total)
  assert.equal(subida.url, undefined)
})

test('si se pierde la respuesta final, comprueba el resultado sin crear otro video', async (t) => {
  const { ruta, subida } = video(t, 256)
  const metodos: string[] = []
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    metodos.push(init.method!)
    if (init.method === 'POST') return new Response(null, { headers: { location: URL_SUBIDA } })
    if (new Headers(init.headers).get('content-range') === 'bytes */256') return Response.json({ id: 'ya-subido' })
    throw new Error('Respuesta perdida')
  })
  await subirYoutube(ruta, subida, async () => 'prueba', () => {})
  assert.deepEqual(metodos, ['POST', 'PUT', 'PUT'])
  assert.equal(subida.id, 'ya-subido')
})

test('al retomar una sesión usa los bytes confirmados por Google', async (t) => {
  const { ruta, subida } = video(t, 256)
  subida.url = URL_SUBIDA
  subida.enviados = 0
  const rangos: string[] = []
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(init.method, 'PUT')
    rangos.push(new Headers(init.headers).get('content-range')!)
    return rangos.length === 1 ? new Response(null, { status: 308, headers: { range: 'bytes=0-127' } }) : Response.json({ id: 'retomado' })
  })
  await subirYoutube(ruta, subida, async () => 'prueba', () => {})
  assert.deepEqual(rangos, ['bytes */256', 'bytes 128-255/256'])
  assert.equal(subida.estado, 'terminado')
})

test('una sesión guardada fuera de Google no recibe el token', async (t) => {
  const { ruta, subida } = video(t, 256)
  subida.url = 'https://otro.example/subida'
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('No debe llamarse') })
  await assert.rejects(subirYoutube(ruta, subida, async () => 'prueba', () => {}), /sesión.*no es válida/)
  assert.equal(fetch.mock.callCount(), 0)
})

test('un archivo cambiado durante la apertura de la sesión no se envía', async (t) => {
  const { ruta, subida } = video(t, 256)
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    writeFileSync(ruta, Buffer.alloc(128))
    return new Response(null, { headers: { location: URL_SUBIDA } })
  })
  await assert.rejects(subirYoutube(ruta, subida, async () => 'prueba', () => {}), /video cambió/)
  assert.equal(fetch.mock.callCount(), 1)
})
