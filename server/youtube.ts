import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, relative, resolve, isAbsolute } from 'node:path'
import type { Card, Model, VideoHecho } from '../shared/types.ts'
import type { BorradorYoutube, CalendarioYoutube, CatalogoYoutube, ConexionYoutube, CuentaYoutube, DatosYoutube, EstadoSubidaYoutube, VideoParaYoutube } from '../shared/youtube.ts'
import { aLaPapelera, guardar, huella } from './disco.ts'
import { folderOf, servir, videosDe } from './etapas.ts'
import { leer, escribir } from './opciones.ts'
import type { Sessions } from './sessions.ts'
import { errorYoutube, subirYoutube, type SubidaYoutube } from './youtube-subida.ts'
import { carpetaYoutube, formaYoutube, miniaturasYoutube, propuestaYoutube, validarMiniatura } from './youtube-catalogo.ts'
import { programarYoutube } from './youtube-publicacion.ts'
import { textosDeEntrega } from './youtube-entrega.ts'
import { recomendacionesYoutube } from './youtube-recomendar.ts'
import { llaveYoutube } from './opciones.ts'
import { modeloYoutube } from './youtube-modelo.ts'

/**
 * YouTube para videos largos, separado del calendario de verticales: autorización OAuth de escritorio con PKCE,
 * elección explícita de privacidad y subida reanudable. Las credenciales viven en el entorno del usuario, como las
 * llaves de Opciones; el avance y las sesiones de subida, en data/youtube.json. Solo acepta videos terminados de Sloth.
 */
const CLIENTE = 'YOUTUBE_CLIENT_ID'
const SECRETO = 'YOUTUBE_CLIENT_SECRET'
const REFRESH = 'YOUTUBE_REFRESH_TOKEN'
const PERMISOS = 'YOUTUBE_SCOPES'
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl'
const TOKEN = 'https://oauth2.googleapis.com/token'
type Credenciales = { leer(nombre: string): string; escribir(nombre: string, valor: string | null): void }
type Datos = { cuenta: CuentaYoutube | null; subidas: Record<string, SubidaYoutube>; borradores: Partial<Record<string, BorradorYoutube>> }

export function youtube(app: string, sessions: Sessions, cards: () => Card[], retorno: string, credenciales: Credenciales = {
  leer: (nombre) => process.env[nombre] || leer(nombre), escribir
}, modelos: () => Model[] = () => [], papelera: typeof aLaPapelera = aLaPapelera) {
  const archivo = join(app, 'data', 'youtube.json')
  let datos: Datos = { cuenta: null, subidas: {}, borradores: {} }
  let roto = false
  try {
    if (existsSync(archivo)) {
      datos = JSON.parse(readFileSync(archivo, 'utf8')) as Datos
      if (!datos || !datos.subidas || typeof datos.subidas !== 'object' || Array.isArray(datos.subidas)) throw new Error('Datos inválidos')
      datos.borradores ??= {}
      for (const subida of Object.values(datos.subidas)) if (subida.estado === 'subiendo' || subida.estado === 'preparando') {
        subida.estado = subida.datos.cuando ? 'cola' : 'error'
        subida.error = 'Sloth se cerró durante la subida. Pulsa «Reintentar» para retomarla.'
      }
    }
  } catch { roto = true }
  function guardarDatos() {
    mkdirSync(join(app, 'data'), { recursive: true })
    guardar(archivo, JSON.stringify(datos, null, 2))
  }
  let permiso: { state: string; verifier: string; hasta: number } | null = null
  let error: string | undefined
  let acceso: { token: string; hasta: number } | null = null
  let renovando: Promise<string> | null = null
  let autorizando = false
  let activa: string | null = null
  let procesando = false
  let eliminando = false
  const conectado = () => !!credenciales.leer(REFRESH)
  const puedeProgramar = () => conectado() && credenciales.leer(PERMISOS).split(' ').includes('https://www.googleapis.com/auth/youtube.force-ssl')
  function estado(): ConexionYoutube {
    if (permiso && permiso.hasta < Date.now()) { permiso = null; error = 'La conexión con Google venció. Pulsa «Conectar canal» para intentarlo otra vez.' }
    return { cliente: !!credenciales.leer(CLIENTE), cuenta: conectado() ? datos.cuenta : null, conectando: !!permiso || autorizando, error, programar: puedeProgramar() }
  }
  async function canjear(body: URLSearchParams) {
    const res = await fetch(TOKEN, { method: 'POST', body, signal: AbortSignal.timeout(30_000) })
    const j = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; scope?: string }
    if (!res.ok || !j.access_token) {
      if (j.error === 'invalid_grant') error = 'Google retiró el permiso o caducó. Vuelve a conectar el canal.'
      throw new Error(error ?? 'Google no pudo autorizar el canal. Revisa las credenciales OAuth de escritorio y vuelve a conectarlo.')
    }
    acceso = { token: j.access_token, hasta: Date.now() + (j.expires_in ?? 3600) * 1000 }
    return j
  }
  async function token(): Promise<string> {
    if (acceso && acceso.hasta > Date.now() + 60_000) return acceso.token
    if (renovando) return renovando
    const refresh = credenciales.leer(REFRESH)
    if (!refresh) throw new Error('Conecta tu canal de YouTube en Opciones antes de subir un video.')
    renovando = canjear(new URLSearchParams({ client_id: credenciales.leer(CLIENTE), client_secret: credenciales.leer(SECRETO), refresh_token: refresh, grant_type: 'refresh_token' }))
      .then((j) => j.access_token!)
    try { return await renovando } finally { renovando = null }
  }
  async function cuenta(): Promise<CuentaYoutube> {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw await errorYoutube(res)
    const j = await res.json() as { items?: { id: string; snippet: { title: string } }[] }
    const canal = j.items?.[0]
    if (!canal) throw new Error('La cuenta elegida no tiene un canal de YouTube. Conecta la cuenta que lo administra.')
    return { id: canal.id, nombre: canal.snippet.title }
  }
  const recomendar = recomendacionesYoutube(app, async (recurso, params) => {
    const q = new URLSearchParams(params)
    const llave = llaveYoutube()
    const headers: Record<string, string> = {}
    if (llave) q.set('key', llave)
    else headers.authorization = `Bearer ${await token()}`
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${recurso}?${q}`, { headers, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`YouTube no permitió consultar ${recurso} (${res.status}). Revisa la llave de Ideas o la conexión del canal.`)
    return res.json()
  })
  const entregasLeidas = new Map<string, { fecha: number; textos: string[] }>()
  async function entregas(v: VideoHecho): Promise<string[]> {
    const folder = carpetaYoutube(v).toLowerCase()
    const textos: string[] = []
    for (const m of sessions.list().filter((s) => s.cardId === v.cardId && folderOf(s).toLowerCase() === folder).sort((a, b) => a.updatedAt - b.updatedAt).slice(-8)) {
      let leida = entregasLeidas.get(m.id)
      if (!leida || leida.fecha !== m.updatedAt) {
        leida = { fecha: m.updatedAt, textos: textosDeEntrega((await sessions.historial(m.id))?.events ?? []) }
        entregasLeidas.set(m.id, leida)
      }
      textos.push(...leida.textos)
    }
    return textos
  }
  const publico = (s: SubidaYoutube): EstadoSubidaYoutube => ({ estado: s.datos.cuando && s.estado === 'terminado' ? 'preparando' : s.estado, enviados: s.enviados, total: s.total, id: s.id, error: s.error, datos: s.datos })
  function todos(cardId?: string) {
    const unicos = new Map<string, VideoHecho>()
    for (const c of cards()) if (c.etapas?.length && (!cardId || c.id === cardId))
      for (const v of videosDe(c, sessions)) if (!unicos.has(huella(v.ruta))) unicos.set(huella(v.ruta), v)
    return [...unicos.values()]
  }
  function buscar(cardId: unknown, ruta: unknown): VideoHecho {
    const card = cards().find((c) => c.id === cardId)
    const v = card?.etapas?.length && typeof ruta === 'string' && videosDe(card, sessions).find((v) => v.ruta.toLowerCase() === resolve(ruta).toLowerCase())
    if (!v) throw new Error('Este archivo no es un video terminado de Sloth.')
    return v
  }
  const claveDe = (v: VideoHecho) => `${datos.cuenta!.id}:${huella(v.ruta)}`
  function enUso(v: VideoHecho) {
    return sessions.list().some((m) => {
      if (m.cardId !== v.cardId || !(m.running || m.background?.length || m.pendiente)) return false
      const r = relative(folderOf(m), v.ruta)
      return !r.startsWith('..') && !isAbsolute(r)
    })
  }
  function puedeEliminar(v: VideoHecho, h: string): boolean {
    const subida = datos.cuenta && datos.subidas[`${datos.cuenta.id}:${h}`]
    if (!h || !subida?.id || !['terminado', 'programado'].includes(publico(subida).estado) || enUso(v)) return false
    if (['cola', 'trabajando'].includes(recomendar.estado(h)?.estado ?? '')) return false
    return !Object.entries(datos.subidas).some(([k, s]) => (k === activa || ['cola', 'subiendo', 'preparando'].includes(s.estado)) && (s.huella === h || k.endsWith(`:${h}`)))
  }
  async function catalogo(cardId?: string): Promise<CatalogoYoutube> {
    const videos: VideoParaYoutube[] = []
    let verticales = 0
    const lista = todos(cardId)
    for (let i = 0; i < lista.length; i += 3) {
      const tanda = await Promise.all(lista.slice(i, i + 3).map(async (v) => {
        const forma = await formaYoutube(v)
        if (forma.formato === 'vertical') { verticales++; return null }
        const h = huella(v.ruta)
        const subida = datos.cuenta ? datos.subidas[`${datos.cuenta.id}:${h}`] : undefined
        const propuesta = propuestaYoutube(v, await entregas(v))
        const guardado = datos.borradores[h]
        const imagenes = miniaturasYoutube(app, v, guardado?.miniatura ?? subida?.datos.miniatura)
        const inicial = imagenes[0]
        const borrador: BorradorYoutube = { cardId: v.cardId, ruta: v.ruta, huella: h, titulo: propuesta.titulo, descripcion: propuesta.descripcion, privacidad: 'private', infantil: false, sintetico: false,
          miniatura: inicial?.ruta, huellaMiniatura: inicial?.huella, revisado: false, ...subida?.datos, ...guardado }
        return { ...forma, cardId: v.cardId, ruta: v.ruta, huella: h, src: v.src, titulo: v.titulo, estilo: cards().find((c) => c.id === v.cardId)?.title ?? v.cardId,
          miniaturas: imagenes, borrador, alternativas: propuesta.alternativas, propuesta: propuesta.propuesta, propuestaFuente: propuesta.propuestaFuente, miniaturaPropuesta: propuesta.miniaturaPropuesta,
          tituloPropuesto: propuesta.tituloPropuesto,
          recomendacion: recomendar.estado(h), subida: subida ? publico(subida) : undefined, eliminable: puedeEliminar(v, h) } satisfies VideoParaYoutube
      }))
      videos.push(...tanda.filter((v) => v !== null))
    }
    return { conexion: estado(), videos, verticales }
  }
  function fallo(subida: SubidaYoutube, e: unknown) {
    subida.estado = subida.id && !subida.datos.cuando ? 'terminado' : 'error'
    subida.error = e instanceof Error ? e.message : 'No se pudo completar la publicación.'
    if (/https?:\/\//i.test(subida.error)) subida.error = 'Se cortó la conexión con YouTube. Pulsa «Reintentar» para comprobar y retomar la publicación.'
    guardarDatos()
  }
  async function ejecutar(clave: string) {
    const s = datos.subidas[clave]
    activa = clave
    try {
      const v = buscar(s.cardId, s.ruta)
      if (s.huella !== huella(v.ruta)) throw new Error('El video cambió después de revisarlo. Esta versión no se subió: revisa la nueva antes de programar.')
      if (enUso(v)) throw new Error('El agente todavía trabaja en la carpeta de este video. Reintenta cuando termine.')
      s.estado = s.id ? 'preparando' : 'subiendo'
      delete s.error
      guardarDatos()
      if (!s.id) await subirYoutube(v.ruta, s, token, guardarDatos)
      if (s.datos.cuando) {
        s.estado = 'preparando'
        guardarDatos()
        await programarYoutube(s, token, guardarDatos)
      }
    } catch (e) { fallo(s, e) }
    finally { activa = null }
  }
  async function seguir() {
    if (roto || activa || procesando || !datos.cuenta || !puedeProgramar() || permiso || autorizando) return
    procesando = true
    try {
      for (let siguiente = Object.keys(datos.subidas).find((k) => k.startsWith(`${datos.cuenta!.id}:`) && datos.subidas[k].estado === 'cola'); siguiente;
        siguiente = Object.keys(datos.subidas).find((k) => k.startsWith(`${datos.cuenta!.id}:`) && datos.subidas[k].estado === 'cola')) await ejecutar(siguiente)
    } catch { error = 'No se pudo guardar la cola de YouTube. Revisa el espacio libre en disco.' }
    finally { procesando = false }
  }
  async function leerBorrador(input: Record<string, unknown>, paraProgramar = false): Promise<{ v: VideoHecho; b: BorradorYoutube }> {
    const v = buscar(input.cardId, input.ruta)
    const h = huella(v.ruta)
    if (input.huella !== h) throw new Error('El video cambió desde que abriste la revisión. Vuelve a abrirla para revisar la nueva versión.')
    if (typeof input.titulo !== 'string' || typeof input.descripcion !== 'string' || typeof input.infantil !== 'boolean' || typeof input.sintetico !== 'boolean') throw new Error('Revisa los datos de la publicación.')
    if (input.titulo.length > 500 || input.descripcion.length > 10_000) throw new Error('El título o la descripción son demasiado largos.')
    let miniatura: ReturnType<typeof validarMiniatura> | undefined
    if (typeof input.miniatura === 'string' && input.miniatura) miniatura = validarMiniatura(app, v, input.miniatura)
    if (input.revisado === true && (!miniatura || input.huellaMiniatura !== miniatura.huella)) throw new Error('Elige y revisa la miniatura actual antes de marcar esta publicación como revisada.')
    const b: BorradorYoutube = { cardId: v.cardId, ruta: v.ruta, huella: h, titulo: input.titulo, descripcion: input.descripcion, privacidad: 'private', infantil: input.infantil, sintetico: input.sintetico,
      miniatura: miniatura?.ruta, huellaMiniatura: miniatura?.huella, revisado: input.revisado === true, cuando: typeof input.cuando === 'string' && input.cuando ? input.cuando : undefined }
    if (paraProgramar) {
      const peso = statSync(v.ruta).size
      if (!peso || peso > 256 * 1024 ** 3) throw new Error('El video está vacío o supera los 256 GB que acepta YouTube.')
      datosYoutube(b as unknown as Record<string, unknown>)
      if (!b.revisado || !b.miniatura) throw new Error('Marca «Título y miniatura revisados» en cada video seleccionado.')
      if ((await formaYoutube(v)).formato !== 'horizontal') throw new Error('Este video no se pudo identificar como horizontal. Revisa su archivo antes de programar.')
      if (!b.cuando || !/(Z|[+-]\d{2}:\d{2})$/.test(b.cuando) || !Number.isFinite(Date.parse(b.cuando)) || Date.parse(b.cuando) < Date.now() + 120_000) throw new Error('Elige una fecha futura, al menos dos minutos después de ahora, para cada video seleccionado.')
      b.cuando = new Date(b.cuando).toISOString()
      if (enUso(v)) throw new Error('Un agente todavía trabaja en uno de los videos seleccionados. Reintenta cuando termine.')
    }
    return { v, b }
  }
  function json(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(data))
    return true
  }
  async function body(req: IncomingMessage) {
    let texto = ''
    for await (const chunk of req) {
      texto += chunk
      if (texto.length > 2_000_000) throw new Error('La petición es demasiado grande.')
    }
    return JSON.parse(texto || '{}')
  }
  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/api/youtube')) return false
    if (roto) return json(res, 500, { error: 'data/youtube.json no se pudo leer. Recupéralo antes de subir, para no repetir videos.' })
    const post = req.method === 'POST'
    if (post && req.headers.origin && ![new URL(retorno).origin, new URL(retorno).origin.replace('127.0.0.1', 'localhost')].includes(req.headers.origin))
      return json(res, 403, { error: 'La petición tiene que venir de Sloth.' })
    if (post && eliminando) return json(res, 409, { error: 'Espera a que termine de enviar los videos a la Papelera.' })
    try {
      if (url.pathname === '/api/youtube' && req.method === 'GET') return json(res, 200, estado())
      // El calendario sale del registro de YouTube, incluso cuando el MP4 local ya fue enviado a la Papelera.
      if (url.pathname === '/api/youtube/calendario' && req.method === 'GET') {
        const delCanal = datos.cuenta ? Object.entries(datos.subidas).filter(([k]) => k.startsWith(`${datos.cuenta!.id}:`)).map(([, s]) => s) : []
        const publicaciones = new Map<string, CalendarioYoutube['publicaciones'][number]>()
        for (const s of delCanal) if (s.estado === 'programado' && s.id && s.datos.cuando && Number.isFinite(Date.parse(s.datos.cuando))) publicaciones.set(s.id, { id: s.id, titulo: s.datos.titulo, cuando: s.datos.cuando })
        const pendientes = delCanal.filter((s) => ['cola', 'subiendo', 'preparando'].includes(publico(s).estado) && s.datos.cuando && Date.parse(s.datos.cuando) > Date.now()).length
        return json(res, 200, { cuenta: datos.cuenta, publicaciones: [...publicaciones.values()].sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando)), pendientes } satisfies CalendarioYoutube)
      }
      if (url.pathname === '/api/youtube/catalogo' && req.method === 'GET') return json(res, 200, await catalogo(url.searchParams.get('cardId') ?? undefined))
      // Solo el MP4 ya confirmado en YouTube va a la Papelera. Se conservan la publicación y su registro para no subirlo otra vez.
      if (url.pathname === '/api/youtube/eliminar' && post) {
        eliminando = true
        try {
          const lista = (await body(req)).videos
          if (!Array.isArray(lista) || !lista.length || lista.length > 200) throw new Error('Selecciona entre 1 y 200 videos subidos.')
          const seleccionados: { v: VideoHecho; h: string }[] = []
          const rutas = new Set<string>()
          for (const item of lista) {
            if (!item || typeof item.huella !== 'string' || !/^[a-f0-9]{64}$/.test(item.huella)) throw new Error('Falta la versión del archivo que quieres eliminar. Vuelve a abrir la galería.')
            const v = buscar(item.cardId, item.ruta)
            const ruta = resolve(v.ruta).toLowerCase()
            if (rutas.has(ruta)) throw new Error('Un video aparece dos veces en la selección.')
            rutas.add(ruta)
            seleccionados.push({ v, h: item.huella })
          }
          const listas = seleccionados.filter(({ v, h }) => huella(v.ruta) === h && puedeEliminar(v, h)).map(({ v }) => resolve(v.ruta))
          const siguen = listas.length ? await papelera(listas) : []
          return json(res, 200, { borrados: listas.length - siguen.length, quedan: seleccionados.length - listas.length + siguen.length })
        } finally { eliminando = false }
      }
      const imagenAnalisis = /^\/api\/youtube\/analisis\/([a-f0-9]{64})\/(fotograma-[0-2]|[\w-]{11})\.jpg$/.exec(url.pathname)
      if (imagenAnalisis && req.method === 'GET') return servir(req, res, join(app, 'data', 'youtube', 'analisis', imagenAnalisis[1], `${imagenAnalisis[2]}.jpg`))
      if (url.pathname === '/api/youtube/recomendacion' && req.method === 'GET') {
        const v = buscar(url.searchParams.get('cardId'), url.searchParams.get('ruta'))
        return json(res, 200, recomendar.estado(huella(v.ruta)) ?? null)
      }
      if (url.pathname === '/api/youtube/recomendar' && post) {
        const b = await body(req)
        const v = buscar(b.cardId, b.ruta)
        const card = cards().find((c) => c.id === v.cardId)!
        if (!['titulo', 'miniatura', 'descripcion'].includes(b.tipo)) throw new Error('Elige título, miniatura o descripción.')
        if (b.titulo !== undefined && (typeof b.titulo !== 'string' || !b.titulo.trim() || [...b.titulo].length > 100 || /[<>]/.test(b.titulo))) throw new Error('El título debe tener entre 1 y 100 caracteres, sin < ni >.')
        if (b.tema !== undefined && (typeof b.tema !== 'string' || b.tema.length > 200)) throw new Error('El tema debe ser un texto de hasta 200 caracteres.')
        if (enUso(v)) throw new Error('Espera a que el agente termine de trabajar en este video antes de analizarlo.')
        const s = datos.cuenta && datos.subidas[claveDe(v)]
        if (s && ['cola', 'subiendo', 'preparando', 'programado'].includes(s.estado)) throw new Error('Este video ya está en cola o programado. Revisa sus datos en YouTube Studio.')
        const elegido = modeloYoutube(b, modelos())
        return json(res, 202, recomendar.iniciar(v, card, elegido.model, await entregas(v), b.tema, datos.cuenta, { tipo: b.tipo, titulo: b.titulo, effort: elegido.effort }))
      }
      if (url.pathname === '/api/youtube/miniatura' && req.method === 'GET') {
        const v = buscar(url.searchParams.get('cardId'), url.searchParams.get('ruta'))
        const imagen = validarMiniatura(app, v, url.searchParams.get('imagen') ?? '')
        return servir(req, res, imagen.ruta)
      }
      if (url.pathname === '/api/youtube/elegir-miniatura' && post) {
        const b = await body(req)
        const v = buscar(b.cardId, b.ruta)
        const imagen = validarMiniatura(app, v, b.imagen)
        return json(res, 200, miniaturasYoutube(app, v, imagen.ruta).find((m) => m.ruta === imagen.ruta))
      }
      if ((url.pathname === '/api/youtube/borradores' || url.pathname === '/api/youtube/programar') && post) {
        const programar = url.pathname.endsWith('/programar')
        if (programar && (!datos.cuenta || !puedeProgramar())) return json(res, 400, { error: 'Vuelve a conectar YouTube en Opciones para conceder el permiso de programar publicaciones.' })
        const lista = (await body(req)).borradores
        if (!Array.isArray(lista) || !lista.length || lista.length > 200) throw new Error('Selecciona entre 1 y 200 publicaciones.')
        const revisados = []
        for (const input of lista) revisados.push(await leerBorrador(input, programar))
        const fechas = new Set<string>()
        const huellas = new Set<string>()
        if (programar) for (const { v, b } of revisados) {
          if (huellas.has(b.huella)) throw new Error('Un video aparece dos veces en la selección. Revisa el lote antes de programar.')
          huellas.add(b.huella)
          const previa = datos.subidas[claveDe(v)]
          if (previa && ['cola', 'subiendo', 'preparando', 'programado'].includes(previa.estado)) throw new Error('Uno de estos videos ya está en cola o programado. Actualiza la revisión antes de confirmar.')
          if (previa?.id && !previa.datos.cuando && previa.datos.privacidad !== 'private') throw new Error('Uno de estos videos ya se subió como público o no listado. Revisa su fecha en YouTube Studio.')
          if (fechas.has(b.cuando!) || Object.entries(datos.subidas).some(([k, s]) => k !== claveDe(v) && k.startsWith(`${datos.cuenta!.id}:`) && s.datos.cuando === b.cuando && s.estado !== 'error')) throw new Error('Dos publicaciones tienen la misma fecha y hora. Ajusta sus fechas antes de programarlas.')
          fechas.add(b.cuando!)
        }
        const anteriores = { borradores: { ...datos.borradores }, subidas: { ...datos.subidas } }
        for (const { v, b } of revisados) {
          datos.borradores[b.huella] = b
          if (programar) {
            const clave = claveDe(v)
            const anterior = datos.subidas[clave]
            datos.subidas[clave] = { ...anterior, estado: 'cola', enviados: anterior?.enviados ?? 0, total: statSync(v.ruta).size, datos: b, ruta: v.ruta, cardId: v.cardId, huella: b.huella,
              miniaturaPuesta: anterior?.datos.huellaMiniatura === b.huellaMiniatura && anterior?.miniaturaPuesta, error: undefined }
          }
        }
        try { guardarDatos() } catch (e) { Object.assign(datos, anteriores); throw e }
        if (programar) void seguir()
        return json(res, 200, { guardados: revisados.length, encolados: programar ? revisados.length : 0 })
      }
      if (url.pathname === '/api/youtube/quitar' && post) {
        const b = await body(req)
        const v = buscar(b.cardId, b.ruta)
        if (!datos.cuenta) throw new Error('Conecta el canal para ver su cola.')
        const clave = claveDe(v)
        const s = datos.subidas[clave]
        if (s?.estado !== 'cola' || s.id) throw new Error('Solo se pueden quitar los videos que esperan y todavía no llegaron a YouTube.')
        delete datos.subidas[clave]
        guardarDatos()
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/api/youtube/cliente' && post) {
        if (activa || autorizando || recomendar.ocupado()) return json(res, 409, { error: 'Espera a que termine la subida, el análisis o la conexión.' })
        const cliente = clienteYoutube((await body(req)).cliente)
        credenciales.escribir(CLIENTE, cliente.id)
        credenciales.escribir(SECRETO, cliente.secreto)
        credenciales.escribir(REFRESH, null)
        credenciales.escribir(PERMISOS, null)
        datos.cuenta = null
        acceso = null
        permiso = null
        error = undefined
        guardarDatos()
        return json(res, 200, estado())
      }
      if (url.pathname === '/api/youtube/conectar' && post) {
        if (activa || autorizando || recomendar.ocupado()) return json(res, 409, { error: 'Espera a que termine la subida, el análisis o la conexión.' })
        const id = credenciales.leer(CLIENTE)
        if (!id) return json(res, 400, { error: 'Importa primero el JSON de las credenciales OAuth de escritorio de Google Cloud.' })
        permiso = { state: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url'), hasta: Date.now() + 10 * 60_000 }
        error = undefined
        const q = new URLSearchParams({ client_id: id, redirect_uri: retorno, response_type: 'code',
          scope: SCOPES,
          state: permiso.state, code_challenge: createHash('sha256').update(permiso.verifier).digest('base64url'), code_challenge_method: 'S256',
          access_type: 'offline', prompt: 'consent select_account'
        })
        return json(res, 200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` })
      }
      if (url.pathname === '/api/youtube/oauth' && req.method === 'GET') {
        const p = permiso
        if (!p || p.hasta < Date.now() || url.searchParams.get('state') !== p.state) return json(res, 400, { error: 'La conexión no es válida o venció. Vuelve a iniciarla desde Sloth.' })
        permiso = null
        autorizando = true
        try {
          if (url.searchParams.has('error')) throw new Error('No se concedió el permiso a Sloth. Puedes conectar el canal de nuevo.')
          const code = url.searchParams.get('code')
          if (!code) throw new Error('Google no devolvió la autorización del canal.')
          const j = await canjear(new URLSearchParams({ client_id: credenciales.leer(CLIENTE), client_secret: credenciales.leer(SECRETO), code,
            code_verifier: p.verifier, redirect_uri: retorno, grant_type: 'authorization_code' }))
          if (!j.refresh_token) throw new Error('Google no devolvió el permiso para futuras subidas. Vuelve a conectar el canal.')
          const canal = await cuenta()
          credenciales.escribir(REFRESH, j.refresh_token)
          credenciales.escribir(PERMISOS, j.scope ?? SCOPES)
          datos.cuenta = canal
          guardarDatos()
          error = undefined
          void seguir()
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
          res.end('Canal de YouTube conectado. Puedes cerrar esta pestaña y volver a Sloth.')
          return true
        } catch (e) {
          acceso = null
          error = e instanceof Error ? e.message : 'No se pudo conectar YouTube.'
          return json(res, 400, { error })
        } finally { autorizando = false; void seguir() }
      }
      if (url.pathname === '/api/youtube/desconectar' && post) {
        if (activa || autorizando || recomendar.ocupado()) return json(res, 409, { error: 'Espera a que termine la subida, el análisis o la conexión.' })
        credenciales.escribir(REFRESH, null)
        credenciales.escribir(PERMISOS, null)
        datos.cuenta = null
        acceso = null
        permiso = null
        error = undefined
        guardarDatos()
        return json(res, 200, estado())
      }
      if (url.pathname === '/api/youtube/subida' && (post || req.method === 'GET')) {
        const b = post ? await body(req) : Object.fromEntries(url.searchParams)
        const card = cards().find((c) => c.id === b.cardId)
        const video = card?.etapas?.length && typeof b.ruta === 'string' && videosDe(card, sessions).find((v) => v.ruta.toLowerCase() === resolve(b.ruta).toLowerCase())
        if (!video) return json(res, 404, { error: 'Este archivo no es un video terminado de Sloth.' })
        if (!conectado() || !datos.cuenta) return post ? json(res, 400, { error: 'Conecta tu canal de YouTube en Opciones antes de subir.' }) : json(res, 200, null)
        const clave = `${datos.cuenta.id}:${huella(video.ruta)}`
        let s = datos.subidas[clave]
        if (!post) return json(res, 200, s ? publico(s) : null)
        if (s && ['terminado', 'programado', 'subiendo', 'cola', 'preparando'].includes(s.estado)) return json(res, 200, publico(s))
        if (activa || procesando || permiso || autorizando) return json(res, 409, { error: 'Espera a que termine la otra subida o la conexión del canal.' })
        if (sessions.list().some((m) => m.cardId === card!.id && (m.running || m.background?.length || m.pendiente)))
          return json(res, 409, { error: 'Espera a que el agente termine de trabajar en este estilo antes de subir el video.' })
        const d = datosYoutube(b)
        // Con sesión ya creada, conserva los datos que Google recibió antes del corte.
        const total = statSync(video.ruta).size
        if (!total || total > 256 * 1024 ** 3) return json(res, 400, { error: 'El video está vacío o supera los 256 GB que acepta YouTube.' })
        if (!s || !s.url) s = datos.subidas[clave] = { estado: 'subiendo', enviados: 0, total, datos: d }
        Object.assign(s, { ruta: video.ruta, cardId: video.cardId, huella: huella(video.ruta) })
        s.estado = 'subiendo'
        delete s.error
        activa = clave
        try { guardarDatos() } catch (e) { activa = null; s.estado = 'error'; s.error = 'No se pudo guardar la subida. Revisa el espacio libre en disco.'; throw e }
        void ejecutar(clave).then(seguir).catch(() => { error = 'No se pudo guardar el avance de la subida. Revisa el espacio libre en disco.' })
        return json(res, 202, publico(s))
      }
      return json(res, 404, { error: 'No existe esta función de YouTube.' })
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : 'No se pudo completar la petición de YouTube.' })
    }
  }
  setTimeout(() => { void seguir() }, 0).unref()
  /** El canal conectado y un token para leer sus números (Ideas → «Tus videos»). */
  const lectura = { canal: () => (conectado() ? datos.cuenta?.id : undefined), token }
  return { api, lectura, ocupado: () => eliminando ? 'Se están enviando videos de YouTube a la Papelera.' : activa || procesando ? 'Se está preparando una publicación de YouTube. Espera a que termine.' : recomendar.ocupado() ?? (autorizando || permiso && permiso.hasta > Date.now() ? 'Se está conectando el canal de YouTube.' : null) }
}

/** Acepta el JSON descargado para una aplicación de escritorio, nunca una llave de API ni un cliente web. */
export function clienteYoutube(input: unknown): { id: string; secreto: string } {
  const c = (input as { installed?: { client_id?: unknown; client_secret?: unknown } } | null)?.installed
  if (!c || typeof c.client_id !== 'string' || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(c.client_id) || typeof c.client_secret !== 'string' || !c.client_secret.trim())
    throw new Error('Elige el JSON de un cliente OAuth de tipo «Aplicación de escritorio» en Google Cloud. La llave de API de Ideas no sirve para subir videos.')
  return { id: c.client_id, secreto: c.client_secret }
}

function datosYoutube(b: Record<string, unknown>): DatosYoutube {
  if (typeof b.titulo !== 'string' || !b.titulo.trim() || [...b.titulo.trim()].length > 100 || /[<>]/.test(b.titulo)) throw new Error('El título debe tener entre 1 y 100 caracteres, sin < ni >.')
  if (typeof b.descripcion !== 'string' || Buffer.byteLength(b.descripcion) > 5000 || /[<>]/.test(b.descripcion)) throw new Error('La descripción debe ocupar como máximo 5000 bytes, sin < ni >.')
  if (!['private', 'unlisted', 'public'].includes(String(b.privacidad))) throw new Error('Elige la privacidad del video.')
  if (typeof b.infantil !== 'boolean' || typeof b.sintetico !== 'boolean') throw new Error('Indica si el video es infantil y si contiene material sintético realista.')
  return { titulo: b.titulo.trim(), descripcion: b.descripcion, privacidad: b.privacidad as DatosYoutube['privacidad'], infantil: b.infantil, sintetico: b.sintetico }
}
