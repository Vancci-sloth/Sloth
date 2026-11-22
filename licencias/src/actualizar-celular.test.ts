// Las actualizaciones del celular (`actualizar-celular.ts`): se publican con la llave de publicar y se sirven tal cual,
// en el multipart del protocolo Expo Updates con su firma.
import assert from 'node:assert/strict'
import test from 'node:test'
import worker from './index.ts'

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never
const LLAVE = 'a'.repeat(32)

function cobro() {
  const objetos = new Map<string, { datos: string; tipo?: string }>()
  const de = (k: string) => {
    const o = objetos.get(k)
    return o ? { body: o.datos, httpMetadata: { contentType: o.tipo }, json: async () => JSON.parse(o.datos) } : null
  }
  const DESCARGAS = {
    get: async (k: string) => de(k),
    head: async (k: string) => de(k),
    put: async (k: string, v: string | ReadableStream, opciones?: { httpMetadata?: { contentType?: string } }) => {
      objetos.set(k, { datos: typeof v === 'string' ? v : await new Response(v).text(), tipo: opciones?.httpMetadata?.contentType })
    }
  }
  const env = { PAYPAL_MODO: 'produccion', MONEDA: 'USD', ORIGEN: 'https://cobro.x', PUBLICAR: 'llave-de-publicar', DESCARGAS }
  const pedir = (ruta: string, init: RequestInit = {}) => worker.fetch(new Request(`https://cobro.x${ruta}`, init), env as never, ctx)
  const publicar = { authorization: 'Bearer llave-de-publicar' }
  const celular = (extra: Record<string, string> = {}) => ({ headers: { 'expo-protocol-version': '1', 'expo-platform': 'android', 'expo-runtime-version': '0.1.1', ...extra } })
  return { objetos, pedir, publicar, celular }
}

const manifiesto = JSON.stringify({ id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-11-22T00:00:00Z', runtimeVersion: '0.1.1', launchAsset: { key: LLAVE }, assets: [], metadata: {}, extra: {} })

test('sin actualización, 204; publicada, el manifiesto tal cual con su firma; ya puesta, 204', async () => {
  const c = cobro()
  assert.equal((await c.pedir('/celular/actualizacion', c.celular())).status, 204)

  const subir = (llaves: Record<string, string>) => c.pedir(`/celular/archivo/${LLAVE}`, { method: 'PUT', headers: { ...llaves, 'content-type': 'application/javascript' }, body: 'codigo' })
  assert.equal((await subir({})).status, 401, 'sin la llave de publicar')
  const sinArchivos = await c.pedir('/celular/actualizacion/android/0.1.1', { method: 'PUT', headers: c.publicar, body: JSON.stringify({ manifiesto, firma: 'sig="abc", keyid="main"' }) })
  assert.equal(sinArchivos.status, 409, 'primero los archivos')
  assert.equal(((await (await subir(c.publicar)).json()) as { nuevo: boolean }).nuevo, true)
  assert.equal(((await (await subir(c.publicar)).json()) as { nuevo: boolean }).nuevo, false, 'un archivo subido no se toca')
  const otraVersion = await c.pedir('/celular/actualizacion/android/0.2.0', { method: 'PUT', headers: c.publicar, body: JSON.stringify({ manifiesto, firma: 'sig="abc", keyid="main"' }) })
  assert.equal(otraVersion.status, 400)
  assert.equal((await c.pedir('/celular/actualizacion/android/0.1.1', { method: 'PUT', headers: c.publicar, body: JSON.stringify({ manifiesto, firma: 'sig="abc", keyid="main"' }) })).status, 200)

  const r = await c.pedir('/celular/actualizacion', c.celular())
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('expo-protocol-version'), '1')
  const limite = /boundary=(.+)$/.exec(r.headers.get('content-type') ?? '')?.[1]
  assert.ok(limite)
  const cuerpo = await r.text()
  assert.ok(cuerpo.includes('content-disposition: form-data; name="manifest"\r\n'))
  assert.ok(cuerpo.includes('expo-signature: sig="abc", keyid="main"\r\n\r\n' + manifiesto + `\r\n--${limite}--`), 'el manifiesto va idéntico a lo firmado')

  assert.equal((await c.pedir('/celular/actualizacion', c.celular({ 'expo-current-update-id': '11111111-2222-3333-4444-555555555555' }))).status, 204)
  assert.equal((await c.pedir('/celular/actualizacion', c.celular({ 'expo-runtime-version': '0.2.0' }))).status, 204, 'otra versión nativa no la recibe')

  const archivo = await c.pedir(`/celular/archivo/${LLAVE}`)
  assert.equal(await archivo.text(), 'codigo')
  assert.equal(archivo.headers.get('content-type'), 'application/javascript')
  assert.match(archivo.headers.get('cache-control') ?? '', /immutable/)
})
