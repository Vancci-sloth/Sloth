import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'
import type { Card } from '../shared/types.ts'
import { Sessions } from './sessions.ts'
import { clienteYoutube, youtube } from './youtube.ts'
import { peticionDeConfianza } from './origen.ts'

test('las credenciales deben ser OAuth de escritorio, nunca la llave de Ideas', () => {
  assert.throws(() => clienteYoutube('llave-de-api'), /Aplicación de escritorio/)
  assert.throws(() => clienteYoutube({ web: { client_id: '123.apps.googleusercontent.com', client_secret: 'prueba' } }), /Aplicación de escritorio/)
  assert.deepEqual(clienteYoutube({ installed: { client_id: '123.apps.googleusercontent.com', client_secret: 'prueba' } }), { id: '123.apps.googleusercontent.com', secreto: 'prueba' })
})

test('OAuth comprueba el estado y el canal; solo sube finales y evita repetir una subida terminada', async (t) => {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-youtube-api-'))
  const cwd = join(dir, 'trabajo')
  mkdirSync(join(cwd, 'episodio'), { recursive: true })
  const ruta = join(cwd, 'episodio', 'video.mp4')
  writeFileSync(ruta, 'video de prueba')
  utimesSync(ruta, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
  const cards: Card[] = [{ id: 'prueba', title: 'Prueba', description: '', cwd, etapas: [{ nombre: 'Video', listo: 'video.mp4', muestra: 'video.mp4' }] }]
  const sessions = new Sessions(join(dir, 'sesiones'), () => {}, () => {}, () => {}, () => {})
  let trabajandoRuta = ''
  t.mock.method(sessions, 'list', () => trabajandoRuta ? [{ id: 'agente-ocupado', cardId: 'prueba', title: 'Trabajo en el video', model: 'sonnet', cwd: resolve(trabajandoRuta, '..'), createdAt: 0, updatedAt: 0, running: true }] : [])
  const credenciales = new Map<string, string>()
  const enviadosPapelera: string[][] = []
  let empezarPapelera!: () => void
  const papeleraEmpezada = new Promise<void>((ok) => { empezarPapelera = ok })
  let terminarPapelera!: () => void
  const permisoPapelera = new Promise<void>((ok) => { terminarPapelera = ok })
  const papelera = async (rutas: string[]) => {
    enviadosPapelera.push(rutas)
    assert.ok(rutas.every((r) => resolve(r).startsWith(dir + sep)))
    empezarPapelera()
    await permisoPapelera
    // Simula el movimiento a la Papelera y un segundo archivo que Windows no dejó mover.
    renameSync(rutas[0], join(dir, 'papelera-simulada.mp4'))
    return rutas.slice(1)
  }
  const originales = globalThis.fetch
  let insertados = 0
  let solicitudToken: URLSearchParams | undefined
  const remotos: Record<string, { privacyStatus: string; publishAt?: string }> = {}
  let fallarMiniatura = true
  let completar!: () => void
  const permisoSubida = new Promise<void>((ok) => { completar = ok })
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('http://127.0.0.1:')) return originales(input, init)
    if (url === 'https://oauth2.googleapis.com/token') {
      solicitudToken = init!.body as URLSearchParams
      return Response.json({ access_token: 'acceso-de-prueba', refresh_token: 'refresh-de-prueba', expires_in: 3600 })
    }
    if (url.includes('/channels?')) return Response.json({ items: [{ id: 'canal-prueba', snippet: { title: 'Mi canal' } }] })
    if (url.includes('/videos?part=status')) {
      const id = new URL(url).searchParams.get('id')!
      return Response.json({ items: remotos[id] ? [{ status: remotos[id] }] : [] })
    }
    if (url.includes('/thumbnails/set')) {
      if (new URL(url).searchParams.get('videoId') === 'video-2' && fallarMiniatura) { fallarMiniatura = false; return Response.json({}, { status: 403 }) }
      return Response.json({ items: [{}] })
    }
    if (init?.method === 'POST' && url.includes('/upload/youtube/v3/videos')) {
      insertados++
      const id = insertados === 1 ? 'video-final' : `video-${insertados}`
      const j = JSON.parse(String(init.body))
      assert.equal(j.status.privacyStatus, 'private')
      assert.equal(j.status.publishAt, undefined)
      remotos[id] = { privacyStatus: 'private' }
      return new Response(null, { headers: { location: `https://www.googleapis.com/upload/youtube/v3/videos?upload_id=privado-${insertados}` } })
    }
    if (init?.method === 'PUT' && url.includes('/videos?part=snippet,status')) {
      const j = JSON.parse(String(init.body))
      remotos[j.id] = j.status
      return Response.json(j)
    }
    if (init?.method === 'PUT') { await permisoSubida; const n = Number(new URL(url).searchParams.get('upload_id')!.split('-').at(-1)); return Response.json({ id: n === 1 ? 'video-final' : `video-${n}` }) }
    throw new Error('Petición inesperada')
  })
  let servicio!: ReturnType<typeof youtube>
  const server = createServer((req, res) => {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    if (!peticionDeConfianza(req, address.port)) { res.writeHead(403); res.end(JSON.stringify({ error: 'Sloth solo atiende a su propia ventana.' })); return }
    void servicio.api(req, res, new URL(req.url!, 'http://localhost')).catch(() => { res.writeHead(500); res.end() })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origen = `http://127.0.0.1:${address.port}`
  const retorno = `${origen}/api/youtube/oauth`
  const crear = () => youtube(dir, sessions, () => cards, retorno, { leer: (n) => credenciales.get(n) ?? '', escribir: (n, v) => { if (v) credenciales.set(n, v); else credenciales.delete(n) } }, undefined, papelera)
  servicio = crear()
  t.after(async () => {
    await new Promise<void>((ok) => server.close(() => ok()))
    sessions.closeAll()
    assert.ok(dir.startsWith(base + sep))
    rmSync(dir, { recursive: true, force: true })
  })
  async function pedir(path: string, body?: unknown, headers?: Record<string, string>) {
    // Fetch añade Sec-Fetch-Mode: cors; la redirección real es una navegación de documento.
    return new Promise<{ status: number; texto: string }>((ok, mal) => {
      const req = request(`${origen}/api/youtube${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, 'content-type': 'application/json' } }, (res) => {
        let texto = ''
        res.setEncoding('utf8').on('data', (s) => { texto += s }).on('end', () => ok({ status: res.statusCode!, texto }))
      })
      req.on('error', mal)
      req.end(body === undefined ? undefined : JSON.stringify(body))
    })
  }
  assert.equal((await pedir('/cliente', { cliente: { installed: { client_id: '123.apps.googleusercontent.com', client_secret: 'secreto-de-prueba' } } })).status, 200)
  const auth = new URL(JSON.parse((await pedir('/conectar', {})).texto).url)
  assert.equal(auth.searchParams.get('redirect_uri'), retorno)
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256')
  const redireccion = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  assert.equal((await pedir('/oauth?state=incorrecto&code=prueba', undefined, redireccion)).status, 400)
  assert.equal(solicitudToken, undefined)
  assert.equal((await pedir(`/oauth?${new URLSearchParams({ state: auth.searchParams.get('state')!, code: 'prueba' })}`, undefined, redireccion)).status, 200)
  assert.equal(createHash('sha256').update(solicitudToken!.get('code_verifier')!).digest('base64url'), auth.searchParams.get('code_challenge'))
  assert.equal(credenciales.get('YOUTUBE_REFRESH_TOKEN'), 'refresh-de-prueba')
  const conexion = await pedir('')
  assert.equal(JSON.parse(conexion.texto).cuenta.nombre, 'Mi canal')
  assert.ok(!conexion.texto.includes('secreto-de-prueba') && !conexion.texto.includes('refresh-de-prueba'))
  const datos = { cardId: 'prueba', ruta, titulo: 'Mi episodio', descripcion: 'Descripción', privacidad: 'private', infantil: false, sintetico: false }
  assert.equal((await pedir('/subida', { ...datos, ruta: join(dir, 'fuera.mp4') })).status, 404)
  assert.equal((await pedir('/subida', { ...datos, titulo: '' })).status, 400)
  assert.equal(insertados, 0)
  assert.equal((await pedir('/subida', datos)).status, 202)
  assert.ok(servicio.ocupado())
  completar()
  let estado = JSON.parse((await pedir(`/subida?${new URLSearchParams({ cardId: 'prueba', ruta })}`)).texto)
  for (let n = 0; estado.estado === 'subiendo' && n < 30; n++) {
    await new Promise((r) => setTimeout(r, 10))
    estado = JSON.parse((await pedir(`/subida?${new URLSearchParams({ cardId: 'prueba', ruta })}`)).texto)
  }
  assert.equal(estado.id, 'video-final')
  assert.equal(estado.estado, 'terminado')
  assert.equal(estado.url, undefined)
  assert.equal(servicio.ocupado(), null)
  servicio = crear()
  assert.equal((await pedir('/subida', datos)).status, 200)
  assert.equal(insertados, 1)
  const rechazado = await originales(`${origen}/api/youtube/desconectar`, { method: 'POST', headers: { origin: 'https://otro.example' }, body: '{}' })
  assert.equal(rechazado.status, 403)
  // El lote usa archivos reales para recorrer la misma identificación de formato que la galería.
  for (const [nombre, color, forma] of [['primero', 'red', '320x180'], ['segundo', 'blue', '320x180'], ['vertical', 'green', '180x320']]) {
    const carpeta = join(cwd, nombre)
    mkdirSync(carpeta)
    const video = join(carpeta, 'video.mp4')
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=${forma}:d=0.1`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { windowsHide: true })
    utimesSync(video, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
    writeFileSync(join(carpeta, 'miniatura.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQXcAAAAASUVORK5CYII=', 'base64'))
    writeFileSync(join(carpeta, 'publicacion.md'), `## Título recomendado\n\n**Título ${nombre}**\n\n## Descripción propuesta\n\nDescripción ${nombre}.`)
  }
  const catalogo = JSON.parse((await pedir('/catalogo')).texto)
  assert.equal(catalogo.verticales, 1)
  const largos = catalogo.videos.filter((v: { formato: string }) => v.formato === 'horizontal')
  assert.equal(largos.length, 2)
  assert.equal(largos[0].eliminable, false)
  const eliminarSinSubir = await pedir('/eliminar', { videos: [largos[0]] })
  assert.deepEqual(JSON.parse(eliminarSinSubir.texto), { borrados: 0, quedan: 1 })
  assert.equal(enviadosPapelera.length, 0)
  const sinElegir = await pedir('/recomendar', { cardId: largos[0].cardId, ruta: largos[0].ruta, tipo: 'descripcion' })
  assert.equal(sinElegir.status, 400)
  assert.match(JSON.parse(sinElegir.texto).error, /Elige el agente/)
  const modeloInvalido = await pedir('/recomendar', { cardId: largos[0].cardId, ruta: largos[0].ruta, tipo: 'titulo', model: 'inventado' })
  assert.equal(modeloInvalido.status, 400)
  assert.match(JSON.parse(modeloInvalido.texto).error, /catálogo/)
  assert.equal(servicio.ocupado(), null)
  const borradores = largos.map((v: { borrador: object }, n: number) => ({ ...v.borrador, revisado: true, cuando: new Date(Date.now() + (n + 2) * 86_400_000).toISOString() }))
  assert.equal((await pedir('/programar', { borradores: [{ ...borradores[0], revisado: false }, borradores[1]] })).status, 400)
  assert.equal(insertados, 1)
  assert.equal((await pedir('/programar', { borradores })).status, 200)
  async function esperarCola() {
    for (let n = 0; servicio.ocupado() && n < 100; n++) await new Promise((r) => setTimeout(r, 10))
    assert.equal(servicio.ocupado(), null)
  }
  await esperarCola()
  const terminado = JSON.parse((await pedir('/catalogo')).texto)
  const conError = terminado.videos.find((v: { subida?: { estado: string } }) => v.subida?.estado === 'error')
  assert.ok(conError.subida.id)
  assert.equal(conError.eliminable, false)
  assert.deepEqual(JSON.parse((await pedir('/eliminar', { videos: [conError] })).texto), { borrados: 0, quedan: 1 })
  assert.equal(enviadosPapelera.length, 0)
  assert.equal(terminado.videos.filter((v: { subida?: { estado: string } }) => v.subida?.estado === 'programado').length, 1)
  const calendarioParcial = JSON.parse((await pedir('/calendario')).texto)
  assert.equal(calendarioParcial.publicaciones.length, 1)
  assert.equal(calendarioParcial.publicaciones.some((p: { id: string }) => p.id === conError.subida.id), false)
  assert.equal(insertados, 3)
  assert.equal((await pedir('/programar', { borradores: [conError.borrador] })).status, 200)
  await esperarCola()
  assert.equal(insertados, 3)
  assert.equal(JSON.parse((await pedir('/catalogo')).texto).videos.filter((v: { subida?: { estado: string } }) => v.subida?.estado === 'programado').length, 2)
  const subidos = JSON.parse((await pedir('/catalogo')).texto).videos.filter((v: { formato: string }) => v.formato === 'horizontal')
  assert.equal(subidos.filter((v: { eliminable: boolean }) => v.eliminable).length, 2)
  trabajandoRuta = subidos[0].ruta
  assert.deepEqual(JSON.parse((await pedir('/eliminar', { videos: [subidos[0]] })).texto), { borrados: 0, quedan: 1 })
  assert.equal(enviadosPapelera.length, 0)
  trabajandoRuta = ''
  const obsoleto = await pedir('/eliminar', { videos: [{ ...subidos[0], huella: 'f'.repeat(64) }] })
  assert.deepEqual(JSON.parse(obsoleto.texto), { borrados: 0, quedan: 1 })
  const ajeno = await pedir('/eliminar', { videos: [subidos[0], { cardId: 'prueba', ruta: join(dir, 'no-es-un-video.mp4'), huella: subidos[0].huella }] })
  assert.equal(ajeno.status, 400)
  assert.equal(enviadosPapelera.length, 0)
  const antesLimpiar = JSON.parse(readFileSync(join(dir, 'data', 'youtube.json'), 'utf8'))
  const calendarioCompleto = JSON.parse((await pedir('/calendario')).texto)
  assert.equal(calendarioCompleto.publicaciones.length, 2)
  assert.equal(calendarioCompleto.cuenta.nombre, 'Mi canal')
  const limpiando = pedir('/eliminar', { videos: subidos })
  await papeleraEmpezada
  assert.ok(servicio.ocupado()?.includes('Papelera'))
  assert.equal((await pedir('/programar', { borradores })).status, 409)
  assert.equal((await pedir('/eliminar', { videos: subidos })).status, 409)
  terminarPapelera()
  assert.deepEqual(JSON.parse((await limpiando).texto), { borrados: 1, quedan: 1 })
  assert.equal(enviadosPapelera.length, 1)
  assert.equal(existsSync(subidos[0].ruta), false)
  assert.equal(existsSync(subidos[1].ruta), true)
  assert.equal(existsSync(join(resolve(subidos[0].ruta, '..'), 'miniatura.png')), true)
  assert.equal(existsSync(join(resolve(subidos[0].ruta, '..'), 'publicacion.md')), true)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'data', 'youtube.json'), 'utf8')), antesLimpiar)
  assert.deepEqual(JSON.parse((await pedir('/calendario')).texto), calendarioCompleto)
  assert.equal(JSON.parse((await pedir('/catalogo')).texto).videos.filter((v: { formato: string }) => v.formato === 'horizontal').length, 1)
  // Otro ritmo no mueve nada solo; «Pasar al ritmo nuevo» cambia la fecha en YouTube sin subir otra vez, aunque el
  // archivo ya esté en la Papelera.
  assert.equal((await pedir('/ritmo', { porDia: 3, cadaDias: 1, desde: '23:30', cadaMin: 30 })).status, 400)
  const ritmo = JSON.parse((await pedir('/ritmo', { porDia: 2, cadaDias: 1, desde: '09:00', cadaMin: 60 })).texto)
  assert.equal(ritmo.cambian, 2)
  assert.deepEqual(JSON.parse((await pedir('/calendario')).texto).publicaciones, calendarioCompleto.publicaciones)
  assert.equal(JSON.parse((await pedir('/reacomodar', {})).texto).movidas, 2)
  await esperarCola()
  const movidos = Object.values(JSON.parse(readFileSync(join(dir, 'data', 'youtube.json'), 'utf8')).subidas as Record<string, { id: string; estado: string; datos: { cuando: string } }>).filter((s) => s.estado === 'programado')
  assert.equal(movidos.length, 2)
  for (const s of movidos) {
    assert.equal(Date.parse(remotos[s.id].publishAt!), Date.parse(s.datos.cuando))
    assert.match(new Date(s.datos.cuando).toTimeString(), /^(09|10):00/)
  }
  assert.equal(JSON.parse((await pedir('/ritmo')).texto).cambian, 0)
  assert.equal(insertados, 3)
  // Recuperarlo de la Papelera conserva el registro y no dispara una segunda subida.
  renameSync(join(dir, 'papelera-simulada.mp4'), subidos[0].ruta)
  assert.equal((await pedir('/subida', { ...datos, ruta: subidos[0].ruta })).status, 200)
  assert.equal(insertados, 3)
})
