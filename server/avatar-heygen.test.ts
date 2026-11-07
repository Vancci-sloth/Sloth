import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { bajarVideo, crearVideo, estadoVideo, listarAvatares, listarVoces, probar, subirAsset } from './avatar/heygen.ts'

interface Llamada {
  url: string
  metodo: string
  llave: string | null
  cuerpo?: any
  forma?: FormData
}

/** Un HeyGen de mentira: responde por ruta y apunta lo que le piden. */
function simulado(rutas: Record<string, (q: URL, l: Llamada) => { status?: number; json?: unknown; bytes?: Uint8Array }>) {
  const llamadas: Llamada[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url))
    const l: Llamada = { url: String(url), metodo: init?.method ?? 'GET', llave: new Headers(init?.headers).get('x-api-key') }
    if (init?.body instanceof FormData) l.forma = init.body
    else if (typeof init?.body === 'string') l.cuerpo = JSON.parse(init.body)
    llamadas.push(l)
    const r = rutas[u.pathname]
    if (!r) return new Response('{}', { status: 404 })
    const { status = 200, json, bytes } = r(u, l)
    return bytes ? new Response(Buffer.from(bytes), { status }) : new Response(JSON.stringify(json ?? {}), { status })
  }) as typeof fetch
  return { f, llamadas }
}

test('probar: GET /v3/users/me con X-Api-Key', async () => {
  const { f, llamadas } = simulado({ '/v3/users/me': () => ({ json: { data: { email: 'a@b.mx', plan: 'api' } } }) })
  assert.deepEqual(await probar('HK', f), { usuario: 'a@b.mx', plan: 'api' })
  assert.equal(llamadas[0].llave, 'HK')
  assert.equal(llamadas[0].url, 'https://api.heygen.com/v3/users/me')
})

test('listarAvatares: junta las páginas de los propios y deja los públicos después', async () => {
  const { f, llamadas } = simulado({
    '/v3/avatars/looks': (q) => {
      if (q.searchParams.get('ownership') === 'public') return { json: { data: [{ id: 'p1', name: 'Monica' }], has_more: false } }
      return q.searchParams.get('token')
        ? { json: { data: [{ id: 'm2', name: 'Yo (traje)' }], has_more: false } }
        : { json: { data: [{ id: 'm1', name: 'Yo', group_name: 'Mis avatares' }], has_more: true, next_token: 'T2' } }
    }
  })
  const a = await listarAvatares('HK', f)
  assert.deepEqual(a.map((x) => [x.id, x.propio]), [['m1', true], ['m2', true], ['p1', false]])
  assert.equal(a[0].grupo, 'Mis avatares')
  assert.ok(llamadas.some((l) => l.url.includes('token=T2')))
})

test('listarVoces: filtra por idioma y por clones propios', async () => {
  const { f, llamadas } = simulado({ '/v3/voices': () => ({ json: { data: [{ voice_id: 'x', name: 'Sara', language: 'Spanish', type: 'public' }] } }) })
  const v = await listarVoces('HK', f, { idioma: 'Spanish' })
  assert.deepEqual(v, [{ id: 'x', nombre: 'Sara', idioma: 'Spanish', tipo: 'public' }])
  assert.ok(llamadas[0].url.includes('type=public') && llamadas[0].url.includes('language=Spanish'))
})

test('crearVideo con audio propio: sube el archivo y pide un video tipo avatar con su asset_id', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-heygen-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const audio = join(dir, 'voz.wav')
  writeFileSync(audio, Buffer.from('RIFFxxxx'))
  const { f, llamadas } = simulado({
    '/v3/assets': () => ({ json: { data: { asset_id: 'as1' } } }),
    '/v3/videos': () => ({ json: { data: { video_id: 'v1', status: 'waiting' } } })
  })
  assert.equal(await crearVideo('HK', { avatar: 'look1', audio, formato: '16:9' }, f), 'v1')
  const subida = llamadas.find((l) => l.url.endsWith('/v3/assets'))!
  assert.equal((subida.forma!.get('file') as File).name, 'voz.wav')
  assert.equal((subida.forma!.get('file') as File).type, 'audio/wav')
  const crear = llamadas.find((l) => l.url.endsWith('/v3/videos'))!
  assert.deepEqual({ ...crear.cuerpo, title: undefined }, { type: 'avatar', avatar_id: 'look1', audio_asset_id: 'as1', title: undefined, aspect_ratio: '16:9', resolution: '1080p' })
})

test('crearVideo con guion y voz de HeyGen no sube nada; sin audio ni guion avisa', async () => {
  const { f, llamadas } = simulado({ '/v3/videos': () => ({ json: { data: { video_id: 'v2' } } }) })
  assert.equal(await crearVideo('HK', { avatar: 'look1', guion: 'Hola', voz: 'voz1' }, f), 'v2')
  assert.equal(llamadas.length, 1)
  assert.deepEqual([llamadas[0].cuerpo.script, llamadas[0].cuerpo.voice_id, llamadas[0].cuerpo.aspect_ratio], ['Hola', 'voz1', '9:16'])
  await assert.rejects(crearVideo('HK', { avatar: 'look1' }, f), /audio, o un guion/)
})

test('subirAsset rechaza lo que HeyGen no acepta', async () => {
  await assert.rejects(subirAsset('HK', join(tmpdir(), 'nota.txt'), simulado({}).f), /solo acepta mp3, wav, png, jpg o mp4/)
})

test('estadoVideo traduce los estados y bajarVideo guarda el MP4', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-heygen-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  let estado = 'processing'
  const { f } = simulado({
    '/v3/videos/v1': () => ({ json: { data: estado === 'completed' ? { id: 'v1', status: 'completed', video_url: 'https://files.heygen.ai/v.mp4', duration: 12.5 } : { id: 'v1', status: estado, failure_message: 'sin rostro' } } }),
    '/v.mp4': () => ({ bytes: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]) })
  })
  assert.equal((await estadoVideo('HK', 'v1', f)).estado, 'procesando')
  estado = 'failed'
  assert.deepEqual(await estadoVideo('HK', 'v1', f), { id: 'v1', estado: 'error', url: undefined, duracion: undefined, error: 'sin rostro' })
  estado = 'completed'
  const fin = await estadoVideo('HK', 'v1', f)
  assert.equal(fin.estado, 'lista')
  assert.equal(fin.duracion, 12.5)
  await bajarVideo(fin.url!, join(dir, 'a', 'avatar.mp4'), f)
  assert.equal(readFileSync(join(dir, 'a', 'avatar.mp4')).length, 8)
})

test('los errores de HeyGen: llave mala y créditos, en español', async () => {
  await assert.rejects(probar('MALA', simulado({ '/v3/users/me': () => ({ status: 401, json: { error: { message: 'invalid' } } }) }).f), /no aceptó esa llave/)
  const creditos = simulado({ '/v3/videos': () => ({ status: 402, json: { error: { message: 'insufficient credit' } } }) }).f
  await assert.rejects(crearVideo('HK', { avatar: 'a', guion: 'x', voz: 'v' }, creditos), /faltan créditos.*no compra nada/)
})
