import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, watch } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as servidorTcp } from 'node:net'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Card, Model, Reinicio, ServerPush } from '../shared/types.ts'
import { VENTA } from '../shared/venta.ts'
import { IMAGE_TYPES } from './agent.ts'
import { avances } from './avances.ts'
import { claudeModels, tituloCorto } from './claude.ts'
import { CambiosSloth } from './cambios-sloth.ts'
import { listaDeArchivos, mensajeCommit } from './git-mensaje.ts'
import { codexModels } from './codex.ts'
import { proveedorDe } from '../shared/providers.ts'
import { paraMandar } from '../shared/historial.ts'
import { cerrarCuentaCodex, conectandoCodex, conectarCodex, cuentaCodex, limitesCodex } from './cuenta-codex.ts'
import { conectando, conectarClaude, cuentaClaude, limitesClaude } from './cuenta.ts'
import { enlacesApi } from './enlaces.ts' // tarjeta de los enlaces
import { carpetaValida, carpetasApi, etapasApi, videosApi, videosDe } from './etapas.ts' // panel de etapas
import { ideas } from './ideas/index.ts' // ideas
import { modelos3d } from './modelos3d.ts' // modelos 3D
import { miniaturas } from './miniaturas.ts' // panel de etapas
import { guardarMeta, guardarYoutube, opciones } from './opciones.ts'
import { previas } from './previas.ts' // previas de las cards
import { radar } from './radar/index.ts' // radar
import { comunidad, llaveDelCreador } from './comunidad.ts' // comunidad
import { redes } from './redes/index.ts' // redes
import { youtube } from './youtube.ts'
import { peticionDeConfianza } from './origen.ts'
import { reinicioSolo } from './reinicio.ts'
import { actualizarYtDlp, instalandoAlgo, instalar, pythonSlothEntero, requisitos } from './requisitos.ts'
import { espacio } from './espacio.ts' // espacio en disco
import { licencia } from './licencia.ts' // suscripción
import { Sessions } from './sessions.ts'
import { eventosEnVivo } from './eventos-en-vivo.ts'
import { carpetaSkill, duplicateCard, enlazarSkills, enlazarSkillsCodex, readCards, removeCard, seriesDe, skillRef } from './skills.ts'
import { estaticos } from './estaticos.ts'
import { actualizar, type Agente, version } from './version.ts'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT ?? 4848)
const CARDS = join(APP, 'cards.json')
/** Las cards que solo viven en esta copia (el repo lo ignora y no van en la app que se vende), si las hay. */
const CARDS_PRIVADAS = join(APP, 'cards.privado.json')
const ATTACHMENTS = join(APP, 'data', 'attachments')
const ATTACHMENT_TYPES: Record<string, string> = { ...IMAGE_TYPES, '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' }
/** Código de salida que le pide a `scripts/start.mjs` que vuelva a levantar el servidor. */
const RESTART = 75
// Los scripts de las skills buscan aquí los procesos del Python de Sloth (`sloth.py`); sin esto, en `C:/dev/vancci-sloth`.
process.env.SLOTH_PROCESOS ??= join(APP, 'python', 'procesos')
// La app que se vende trae sus skills: las enlaza en ~/.claude/skills, donde las busca Claude.
if (VENTA) enlazarSkills(APP)
// Y Codex las lee de esas mismas carpetas, no de copias suyas.
enlazarSkillsCodex(APP)
// Y su clave: la cuenta gratis de la comunidad o el apoyo, que quita el recordatorio. Sloth abre sin ella.
const suscripcion = VENTA ? licencia(APP) : undefined // suscripción

const clients = new Set<WebSocket>()
const suscripciones = new Map<WebSocket, string | null>()
/** Barra lateral: el avance de cada video, que oye lo que se manda para saber cuándo mirarlo. Nace después que los hilos. */
let avance: ReturnType<typeof avances> | undefined
function broadcast(msg: ServerPush) {
  let text: string | undefined
  for (const ws of clients) {
    if ((msg.type === 'events' || msg.type === 'draft') && suscripciones.has(ws) && suscripciones.get(ws) !== msg.sessionId) continue
    ws.send(text ??= JSON.stringify(msg))
  }
  avance?.oir(msg)
}

const cambiosSloth = new CambiosSloth(APP)
const eventos = eventosEnVivo((sessionId, from, events) => broadcast({ type: 'events', sessionId, from, events }))
const sessions = new Sessions(
  join(APP, 'data', 'sessions'),
  eventos,
  (session) => broadcast({ type: 'session', session }),
  (sessionId) => broadcast({ type: 'removed', sessionId }),
  // Lo que va escribiendo un `Write` solo lo pintan el estudio y el panel de etapas: a los demás hilos no se les manda.
  (sessionId, draft) => conEtapas(sessionId) && broadcast({ type: 'draft', sessionId, draft }),
  cambiosSloth
)

/** Si el hilo es de un estilo de video: solo su estudio enseña lo que va escribiendo. */
const conEtapas = (id: string) => !!cards().find((c) => c.id === sessions.meta(id)?.cardId)?.etapas?.length

/**
 * Las cards de cards.json, más las de cards.privado.json si existe. Se releen solo si alguno cambió. Si quedó a medio escribir o con un error, siguen las
 * últimas buenas: una coma de más no puede dejarte sin «Detener» ni «Reiniciar backend», que pasan por aquí.
 */
let leidas: { mtime: number; cards: Card[] } | undefined
let mala = 0 // la fecha del cards.json que falló, para avisar una sola vez
function cards(): Card[] {
  let mtime = 0
  try {
    const privadas = existsSync(CARDS_PRIVADAS)
    mtime = statSync(CARDS).mtimeMs + (privadas ? statSync(CARDS_PRIVADAS).mtimeMs : 0)
    if (leidas?.mtime !== mtime && mala !== mtime) leidas = { mtime, cards: [...readCards(CARDS, APP), ...(privadas ? readCards(CARDS_PRIVADAS, APP) : [])] }
  } catch (error) {
    if (mala !== mtime) console.error(`cards.json tiene un error; siguen las cards de antes. ${error instanceof Error ? error.message : error}`)
    mala = mtime
  }
  return leidas?.cards ?? []
}

// Publicar los videos verticales terminados en TikTok e Instagram (y en las redes que se sumen), y los largos en YouTube.
// La app que se vende aún no publica.
const publicar = redes(APP, sessions, cards, broadcast) // redes
const subirLargos = youtube(APP, sessions, cards, `http://127.0.0.1:${PORT}/api/youtube/oauth`, undefined, () => modelos)

// Cada card de estilo enseña su último video terminado, en pequeño.
const previa = previas(join(APP, 'data', 'previas'), cards) // previas de las cards
// Las imágenes que el panel de etapas enseña en rejilla, en pequeño.
const { miniatura, cuadro } = miniaturas(join(APP, 'data', 'miniaturas')) // panel de etapas
// Ideas para YouTube: investigar el nicho de un canal y que Claude proponga videos con evidencia.
const idear = VENTA ? undefined : ideas(APP, sessions, broadcast, subirLargos?.lectura) // ideas
// La biblioteca de modelos 3D que llenan los videos, para verla: la de la skill que usan los agentes, que es donde guardan.
const biblioteca3d = modelos3d(carpetaSkill('modelos-3d') ?? join(APP, 'skills', 'modelos-3d')) // modelos 3D
// El buscador propio de noticias de tecnología: lee sus fuentes en segundo plano y las skills buscan ahí.
const noticias = radar(APP) // radar
// La comunidad: lo que la gente hace con Sloth y cómo. Entra cada cliente con su licencia, y el creador con su llave,
// también desde su copia instalada (publica en Anuncios); un cliente no la tiene.
const comunidadApi = comunidad(APP, {
  credencial: () => llaveDelCreador() ?? suscripcion?.credencial(),
  creador: !VENTA,
  sessions,
  video: (ruta) => cards().flatMap((c) => (c.etapas?.length ? videosDe(c, sessions) : [])).find((v) => v.ruta === ruta),
  cuadro,
  avisar: broadcast
}) // comunidad
// En qué fase va cada video y cuántas etapas lleva, para la barra lateral.
avance = avances(sessions, cards, broadcast)
// Opciones → Espacio en disco: lo que dejan los videos y ya no hace falta. Lo seguro lo borra solo, cada 6 horas.
const disco = espacio({ app: APP, venta: VENTA, sessions, cards, ocupado, python: () => pythonSlothEntero(APP) }) // espacio en disco

// Si el agente (o tú) edita cards.json, las cards se actualizan solas.
watch(CARDS, () => broadcast({ type: 'cards', cards: cards() }))
if (existsSync(CARDS_PRIVADAS)) watch(CARDS_PRIVADAS, () => broadcast({ type: 'cards', cards: cards() }))

/** Por qué ahora no se puede reiniciar el servidor: lo cortaría a medias. `null` si nada trabaja. */
function ocupado(): string | null {
  if (sessions.anyRunning()) return 'Hay un agente trabajando. Espera a que termine.'
  if (cambiosSloth.ocupado()) return 'Sloth está haciendo commit o push. Espera a que termine.'
  if (publicar?.ocupado()) return publicar.ocupado() // redes: una subida o un texto a medias
  if (subirLargos?.ocupado()) return subirLargos.ocupado()
  if (idear?.ocupado()) return idear.ocupado() // ideas: una investigación en curso
  if (actualizando) return actualizando
  return instalandoAlgo() ?? conectando() ?? conectandoCodex()
}
/** Mientras «Actualizar» corre npm install y la comprobación: qué se está actualizando. */
let actualizando: string | null = null

/** Vuelve a levantar el servidor (lo hace scripts/start.mjs), con lo que haya cambiado. Los agentes se retoman al volver. */
function reiniciar() {
  sessions.closeAll()
  process.exit(RESTART)
}

// Si cambia el servidor (lo edita el agente de la card Sloth), se reinicia solo en cuanto nada trabaja. Compilada, su
// código no cambia.
const auto = VENTA ? { estado: (): Reinicio => ({ pendiente: false }) } : reinicioSolo(APP, ocupado, (reinicio) => broadcast({ type: 'reinicio', reinicio }), reiniciar)

/**
 * Los modelos se preguntan a Claude Code y a Codex. La interfaz no los espera para enseñar cards y hilos: le
 * llegan por el WebSocket. Se piden al arrancar y, si fallaron, otra vez cuando alguien abre la app.
 */
let modelos: Model[] = []
let cargandoModelos = false
function pedirModelos() {
  if (cargandoModelos) return
  cargandoModelos = true
  // Cada proveedor llega por separado: el que tarda no tapa los modelos que ya se pueden elegir.
  void Promise.allSettled([claudeModels(), codexModels()].map(async (pedido, i) => {
    const lista = await pedido
    if (!lista.length) return
    modelos = [...modelos.filter((m) => proveedorDe(m.id) !== (i ? 'codex' : 'claude')), ...lista]
    broadcast({ type: 'models', models: modelos })
  })).finally(() => { cargandoModelos = false })
}
pedirModelos()

/**
 * Las carpetas de un lote: `lote-1007-1530-01`, `-02`… (mes, día, hora y minuto, y el número del video), con el prefijo
 * de la card delante. Si ese nombre ya lo usa otro lote, aunque sus carpetas aún no existan, va `-2`, `-3`…
 */
function carpetasDeLote(card: Card, n: number): string[] {
  const dos = (x: number) => String(x).padStart(2, '0')
  const d = new Date()
  const base = `${card.lote?.prefijo ?? ''}lote-${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`
  const usadas = [...readdirSync(card.cwd), ...sessions.list().flatMap((s) => (s.cwd === card.cwd && s.lote ? [s.lote.carpeta] : []))]
  let nombre = base
  for (let k = 2; usadas.some((u) => u.startsWith(`${nombre}-`)); k++) nombre = `${base}-${k}`
  return Array.from({ length: n }, (_, i) => `${nombre}-${String(i + 1).padStart(Math.max(2, String(n).length), '0')}`)
}

/** Lo que se dice al pedir un video y no dice de qué va: no entra en el nombre de su carpeta. */
const RELLENO = new Set(
  'a al ayudame como con crea de del el en es esta este esto haz hazme hacer hola la las lo los me mi oye para por porfavor favor puedas puedes que quiero rapido se sobre su un una unos video videos y ya'.split(' ')
)

/**
 * La carpeta de un video suelto, como las de un lote: unas palabras de su título (`t-rex-naciendo`), sin enlaces ni
 * duración, con el prefijo de la card delante; sin palabras que sirvan, `video-1007-1530` (mes, día, hora y minuto). Si
 * ese nombre ya lo usa una carpeta u otro hilo, aunque su carpeta aún no exista, va `-2`, `-3`…
 */
function carpetaDeVideo(card: Card, title: string): string {
  const palabras = title
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b\d+\s*(segundos?|minutos?)\b/gi, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !RELLENO.has(p))
  const dos = (x: number) => String(x).padStart(2, '0')
  const d = new Date()
  const base = `${card.lote?.prefijo ?? ''}${palabras.slice(0, 4).join('-') || `video-${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`}`
  const usadas = new Set(
    [...readdirSync(card.cwd), ...sessions.list().flatMap((s) => (s.cwd === card.cwd ? [s.carpeta ?? '', s.lote?.carpeta ?? ''] : []))].map((u) => u.toLowerCase())
  )
  let nombre = base
  for (let k = 2; usadas.has(nombre); k++) nombre = `${base}-${k}`
  return nombre
}

/** El audio en WAV, junto al original, con FFmpeg. `null` si no se pudo. */
function aWav(file: string): Promise<string | null> {
  const wav = `${file.slice(0, file.length - extname(file).length)}.wav`
  return new Promise((ok) => {
    const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vn', '-c:a', 'pcm_s16le', wav], { windowsHide: true })
    ffmpeg.on('error', () => ok(null))
    ffmpeg.on('exit', (codigo) => ok(codigo === 0 ? wav : null))
  })
}

async function body<T>(req: IncomingMessage): Promise<T> {
  let text = ''
  for await (const chunk of req) text += chunk
  return (text ? JSON.parse(text) : {}) as T
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (path === '/api/state' && method === 'GET') {
    if (!modelos.some((m) => proveedorDe(m.id) === 'claude') || !modelos.some((m) => proveedorDe(m.id) === 'codex')) pedirModelos()
    send(res, 200, { cards: cards(), sessions: sessions.list(), models: modelos, app: APP, reinicio: auto.estado(), avances: avance?.todos() ?? {} })
    return true
  }

  if (await disco.api(req, res, path)) return true // espacio en disco

  if (path === '/api/opciones' && method === 'GET') {
    send(res, 200, opciones())
    return true
  }

  if (path === '/api/codex/cuenta' && method === 'GET') {
    send(res, 200, await cuentaCodex())
    return true
  }
  if (path === '/api/codex/conectar' && method === 'POST') {
    send(res, 200, await conectarCodex())
    pedirModelos()
    return true
  }

  // `meta` es un token, no una llave, pero llega igual: `{ llave }`.
  const o = /^\/api\/opciones\/(youtube|meta)$/.exec(path)
  if (o && method === 'POST') {
    const { llave } = await body<{ llave: string | null }>(req)
    try {
      send(res, 200, await { youtube: guardarYoutube, meta: guardarMeta }[o[1] as 'youtube' | 'meta'](llave?.trim() || null))
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  // `?fresco` (Opciones) vuelve a mirar; sin él vale lo último que se vio bien.
  if (path === '/api/claude/cuenta' && method === 'GET') {
    send(res, 200, await cuentaClaude(APP, url.searchParams.has('fresco')))
    return true
  }

  if (path === '/api/claude/conectar' && method === 'POST') {
    send(res, 200, await conectarClaude(APP))
    return true
  }

  // Opciones y hover del contexto: cuotas reales de cada plan, como mucho una consulta por minuto.
  if ((path === '/api/claude/limites' || path === '/api/codex/limites') && method === 'GET') {
    try {
      send(res, 200, await (path === '/api/codex/limites' ? limitesCodex() : limitesClaude()))
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  if (path === '/api/requisitos' && method === 'GET') {
    send(res, 200, await requisitos(APP, url.searchParams.has('fresco'), url.searchParams.get('skill') ?? undefined))
    return true
  }

  // Sin `ids`, todo lo que falta; con `skill`, de lo que pide esa skill.
  if (path === '/api/requisitos/instalar' && method === 'POST') {
    const { ids, skill } = await body<{ ids?: string[]; skill?: string }>(req)
    send(res, 200, await instalar(APP, ids, skill))
    return true
  }

  const ver = /^\/api\/(claude|codex)\/(version|actualizar)$/.exec(path)
  if (ver?.[2] === 'version' && method === 'GET') return send(res, 200, await version(APP, ver[1] as Agente)), true
  if (ver?.[2] === 'actualizar' && method === 'POST') {
    // Se cierran los procesos del agente para reemplazarlo. Claude corre dentro de este servidor: luego se reinicia para
    // cargarlo. Codex se abre otra vez en cada uso: basta con volver a pedir sus modelos.
    const agente = ver[1] as Agente
    if (ocupado()) return send(res, 409, { error: ocupado() }), true
    sessions.closeAll()
    if (agente === 'codex') cerrarCuentaCodex()
    actualizando = `Se está actualizando ${agente === 'claude' ? 'Claude Code' : 'Codex'}. Espera a que termine.`
    try {
      await actualizar(APP, agente)
    } catch (error) {
      return send(res, 500, { error: error instanceof Error ? error.message : String(error) }), true
    } finally {
      actualizando = null
    }
    send(res, 200, { reinicia: agente === 'claude' })
    if (agente === 'claude') setTimeout(reiniciar, 100)
    else pedirModelos()
    return true
  }

  // Las series de la skill de una card, para elegir una al crear un video. Se leen cada vez: viven en la skill.
  const ser = /^\/api\/cards\/([\w-]+)\/series$/.exec(path)
  if (ser && method === 'GET') {
    const skill = cards().find((c) => c.id === ser[1])?.skill
    return send(res, 200, skill ? seriesDe(skill) : []), true
  }

  const c = /^\/api\/cards\/([\w-]+)\/(duplicate|delete)$/.exec(path)
  if (c && method === 'POST') {
    const [, id, action] = c
    if (action === 'duplicate') send(res, 200, { id: duplicateCard(CARDS, id) })
    else {
      removeCard(CARDS, id)
      send(res, 200, { ok: true })
    }
    return true
  }

  if (path === '/api/sessions' && method === 'POST') {
    const input = await body<{ cardId: string; model: string; effort?: string; text: string; images?: string[]; carpeta?: string }>(req)
    const card = cards().find((c) => c.id === input.cardId)
    if (!card) return send(res, 404, { error: 'No existe esa card' }), true
    // Mientras Sloth hace commit o push, un hilo suyo no puede empezar: se dice antes de crearlo, o quedaba un hilo vacío.
    if (cambiosSloth.esSloth({ cardId: card.id, cwd: card.cwd })) cambiosSloth.comprobarInicio('')
    mkdirSync(card.cwd, { recursive: true })
    // «Continuar un video»: el hilo nace con su carpeta, que ya existe. Se lo dice el mensaje, en palabras: así vale para
    // cualquier skill sin tocarlas (El Diff la afina el usuario a mano), y pesa más que su paso de crear una carpeta nueva.
    const sigue = input.carpeta ? carpetaValida(card.cwd, input.carpeta) : undefined // panel de etapas
    if (input.carpeta && !sigue) return send(res, 400, { error: `No hay una carpeta «${input.carpeta}» en ${card.cwd}` }), true
    // Uno que sale de Ideas se llama como la idea (su línea `Título:`); los demás, como su primer mensaje, hasta que llegue
    // el título corto.
    const titulo = /^Título: (.+)$/m.exec(input.text)?.[1].trim()
    const title = (titulo ?? input.text.split('\n')[0]).slice(0, 80) || (input.images?.length ? 'Imagen' : card.title)
    // Un video nuevo también nace con su carpeta, como los de un lote: la skill la crea con el nombre de la línea `Carpeta:`.
    const nueva = !sigue && card.etapas?.length ? carpetaDeVideo(card, title) : undefined // panel de etapas
    const meta = sessions.create({ cardId: card.id, title, model: input.model, effort: input.effort, cwd: card.cwd, carpeta: sigue ?? nueva })
    const text = sigue
      ? `${input.text}\n\nContinúa el video que ya está en la carpeta «${sigue}»: trabaja ahí, no crees otra, mira qué hay y sigue desde lo que te pido.`
      : [input.text, nueva && `Carpeta: ${nueva}`].filter(Boolean).join('\n\n')
    sessions.send(meta.id, text, card.skill ? skillRef(card.skill) : undefined, input.images)
    // El primer mensaje recortado se cambia por un título corto cuando llega, como un renombrado. Nadie lo espera; si
    // falla, o mientras alguien le puso otro nombre, se queda el que tiene. Sin las líneas que añade la app.
    const pedido = input.text.replace(/^(Formato|Subagentes): .*$/gm, '').trim()
    if (!titulo && pedido && proveedorDe(input.model) === 'claude')
      void tituloCorto(pedido)
        .then((corto) => corto && sessions.meta(meta.id)?.title === title && sessions.rename(meta.id, corto))
        .catch((e) => console.error('Título corto:', e instanceof Error ? e.message : e))
    send(res, 200, meta)
    return true
  }

  // Un lote: un hilo por enlace, cada uno con su carpeta ya nombrada. Esperan su turno en `sessions`.
  if (path === '/api/lotes' && method === 'POST') {
    const input = await body<{ cardId: string; model: string; effort?: string; text: string; enlaces: string[]; images?: string[] }>(req)
    const card = cards().find((c) => c.id === input.cardId)
    if (!card?.lote) return send(res, 404, { error: 'Esa card no hace lotes' }), true
    const n = input.enlaces.length
    if (n < 2) return send(res, 400, { error: 'Un lote lleva al menos dos enlaces' }), true
    // Todos los videos del lote copian a la misma carpeta, cada uno con el nombre de la suya.
    mkdirSync(card.cwd, { recursive: true })
    const videos = carpetasDeLote(card, n).map((carpeta, i) => ({
      carpeta,
      title: `${i + 1}/${n} · ${input.enlaces[i].replace(/^https?:\/\/(www\.)?/, '')}`.slice(0, 80),
      text: [input.text, `Enlace: ${input.enlaces[i]}`, `Lote: video ${i + 1} de ${n}. Carpeta: ${carpeta}`].filter(Boolean).join('\n\n')
    }))
    const { cardId, model, effort } = input
    const metas = sessions.crearLote({ cardId, model, effort, cwd: card.cwd }, videos, card.skill ? skillRef(card.skill) : undefined, input.images)
    send(res, 200, metas)
    return true
  }

  const l = /^\/api\/lotes\/([\w-]+)\/seguir$/.exec(path)
  if (l && method === 'POST') {
    sessions.seguirLote(l[1])
    send(res, 200, { ok: true })
    return true
  }

  if (await etapasApi(req, res, url, sessions, cards(), broadcast, miniatura)) return true // panel de etapas
  if (await videosApi(req, res, url, sessions, cards(), publicar?.marcas, cuadro)) return true // panel de etapas; `publicar.marcas`, de redes
  if (carpetasApi(req, res, url, sessions, cards())) return true // panel de etapas
  if (publicar && (await publicar.api(req, res, url))) return true // redes
  if (subirLargos && (await subirLargos.api(req, res, url))) return true // videos largos de YouTube
  if (await previa.api(req, res, url)) return true // previas de las cards
  if (idear && (await idear.api(req, res, url))) return true // ideas
  if (await biblioteca3d.api(req, res, url)) return true // modelos 3D
  if (await noticias.api(req, res, url)) return true // radar
  if (await comunidadApi.api(req, res, url)) return true // comunidad
  if (await enlacesApi(req, res, url)) return true // tarjeta de los enlaces

  const m = /^\/api\/sessions\/([\w-]+)(?:\/(\w+))?$/.exec(path)
  if (m) {
    const [, id, action] = m
    if (['cambios', 'diff', 'revertir', 'git'].includes(action)) {
      const meta = sessions.meta(id)
      if (!meta) return send(res, 404, { error: 'No existe ese hilo.' }), true
      if (!cambiosSloth.esSloth(meta)) return send(res, 403, { error: 'Los cambios y la reversión solo están disponibles en Sloth.' }), true
      if (action === 'cambios' && method === 'GET') return send(res, 200, cambiosSloth.listar(id)), true
      if (action === 'diff' && method === 'GET') return send(res, 200, await cambiosSloth.verAsync(id)), true
      if (action === 'git' && method === 'POST') {
        if (sessions.list().some((s) => resolve(s.cwd) === APP && (s.running || s.background?.length))) return send(res, 409, { error: 'Hay un agente cambiando la app. Espera a que termine o detenlo.' }), true
        const input = await body<{ operacion?: string; mensaje?: string; revision?: string }>(req)
        if (!['commit', 'commit-push', 'push', 'auto'].includes(input.operacion ?? '') || typeof input.revision !== 'string' || (input.mensaje !== undefined && typeof input.mensaje !== 'string')) return send(res, 400, { error: 'Acción de Git inválida.' }), true
        try {
          const result = await cambiosSloth.guardarGit(input.operacion as 'commit' | 'commit-push' | 'push' | 'auto', input.mensaje ?? '', input.revision, async () => {
            const archivos = cambiosSloth.ver(id).globales
            const mensaje = await mensajeCommit(meta, archivos)
            return `${mensaje}\n\nArchivos incluidos:\n${listaDeArchivos(archivos)}`
          })
          send(res, 200, result)
        } catch (error) {
          send(res, 409, { error: error instanceof Error ? error.message : String(error) })
        }
        return true
      }
      if (action === 'revertir' && method === 'POST') {
        const { cambioId } = await body<{ cambioId?: string }>(req)
        if (!cambioId) return send(res, 400, { error: 'Elige el cambio que quieres revertir.' }), true
        if (sessions.list().some((s) => resolve(s.cwd) === APP && (s.running || s.background?.length))) return send(res, 409, { error: 'Hay un agente cambiando la app. Espera a que termine o detenlo.' }), true
        try {
          const cambios = cambiosSloth.revertir(id, cambioId)
          sessions.avisarReversion(id)
          send(res, 200, cambios)
        } catch (error) {
          send(res, 409, { error: error instanceof Error ? error.message : String(error) })
        }
        return true
      }
      return send(res, 405, { error: 'Método no permitido.' }), true
    }
    if (action === 'historial' && method === 'GET') {
      const found = await sessions.historial(id)
      // Lo que no cambia nada va como hueco (`paraMandar`): la pantalla lo rellena.
      send(res, found ? 200 : 404, found ? { ...found, events: paraMandar(found.events) } : { error: 'No existe' })
    } else if (!action && method === 'GET') {
      const found = sessions.get(id)
      send(res, found ? 200 : 404, found ?? { error: 'No existe' })
    } else if (action === 'archive') {
      const { archived } = await body<{ archived: boolean }>(req)
      sessions.archive(id, archived)
      send(res, 200, { ok: true })
    } else if (action === 'rename') {
      // Una línea, del largo de los títulos que salen del primer mensaje.
      const { title } = await body<{ title?: string }>(req)
      const limpio = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (limpio) sessions.rename(id, limpio)
      send(res, limpio ? 200 : 400, limpio ? { ok: true } : { error: 'Escribe un nombre.' })
    } else if (action === 'delete') {
      try {
        sessions.remove(id)
        send(res, 200, { ok: true })
      } catch (error) {
        send(res, 409, { error: error instanceof Error ? error.message : String(error) })
      }
    } else if (action === 'compactar' && method === 'POST') {
      try {
        sessions.compactar(id)
        send(res, 200, { ok: true })
      } catch (error) {
        send(res, 409, { error: error instanceof Error ? error.message : String(error) })
      }
    } else if (action === 'send') {
      // Con el agente trabajando, le llega ya, en mitad del turno; si no, abre uno.
      const input = await body<{ text: string; images?: string[] }>(req)
      try {
        sessions.steer(id, input.text, input.images)
        send(res, 200, { ok: true })
      } catch (error) {
        send(res, 409, { error: error instanceof Error ? error.message : String(error) })
      }
    } else if (action === 'empezar') {
      sessions.empezarYa(id)
      send(res, 200, { ok: true })
    } else if (action === 'stop') {
      await sessions.interrupt(id)
      send(res, 200, { ok: true })
    } else if (action === 'model') {
      const { model, effort } = await body<{ model: string; effort?: string }>(req)
      try { sessions.setModel(id, model, effort) }
      catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : String(error) }), true }
      send(res, 200, { ok: true })
    } else return false
    return true
  }

  if (path === '/api/upload' && method === 'POST') {
    mkdirSync(ATTACHMENTS, { recursive: true })
    const file = join(ATTACHMENTS, `${Date.now()}-${basename(url.searchParams.get('name') ?? 'archivo')}`)
    await new Promise((ok, fail) => req.pipe(createWriteStream(file)).on('finish', ok).on('error', fail))
    // `wav`: la voz de una etapa que pide un WAV, como la grabó el celular (m4a, mp3…). Si FFmpeg no puede, va tal cual.
    const wav = url.searchParams.has('wav') && extname(file).toLowerCase() !== '.wav' ? await aWav(file) : null
    send(res, 200, { path: wav ?? file })
    return true
  }

  // Los adjuntos, para dibujarlos en el composer y en el mensaje, y oír en el panel de etapas lo que se entregó. Solo sirve
  // lo de `data/attachments`. Con su tamaño: sin él, un audio no sabe cuánto dura.
  const a = /^\/api\/attachments\/([^/]+)$/.exec(path)
  if (a && method === 'GET') {
    const file = join(ATTACHMENTS, basename(decodeURIComponent(a[1])))
    if (!existsSync(file)) return send(res, 404, { error: 'No existe' }), true
    res.writeHead(200, { 'content-type': ATTACHMENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': statSync(file).size, 'cache-control': 'max-age=31536000, immutable' })
    createReadStream(file).pipe(res)
    return true
  }

  if (path === '/api/open' && method === 'POST') {
    const { path: target } = await body<{ path: string }>(req)
    // Señalado en su carpeta: el Explorador y el Finder saben; en Linux se abre la carpeta que lo tiene.
    const [programa, ...args] =
      process.platform === 'win32' ? ['explorer.exe', `/select,${target}`] : process.platform === 'darwin' ? ['open', '-R', target] : ['xdg-open', existsSync(target) && statSync(target).isDirectory() ? target : dirname(target)]
    spawn(programa, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref()
    send(res, 200, { ok: true })
    return true
  }

  if (path === '/api/restart' && method === 'POST') {
    if (ocupado()) return send(res, 409, { error: ocupado() }), true
    send(res, 200, { ok: true })
    setTimeout(reiniciar, 100)
    return true
  }

  return false
}

const server = createServer()
// Compilada, la interfaz ya viene armada en `web/` (`scripts/compilar.mjs`); aquí la sirve Vite, que la recarga con cada cambio.
// Vite se importa en esta rama, que la compilada descarta: importado dentro de la función, la app que se vende lo pedía.
const interfaz = VENTA ? estaticos(join(APP, 'web')) : await interfazDelRepo(await import('vite'), (await import('@vitejs/plugin-react')).default)

/**
 * La interfaz del repo, con Vite: cada cambio en `web/` recarga la página. Con React de producción, como la que se vende:
 * el de desarrollo va dos o tres veces más lento en todo (escribir, cambiar de hilo, el streaming) y calienta la
 * computadora. Sin Fast Refresh, que solo funciona con el de desarrollo: el cambio se ve recargando, igual de rápido.
 * Vite y su plugin de React lo leen de `NODE_ENV` al arrancar; después vuelve a lo de antes, que es lo que heredan los
 * agentes y lo que lanzan.
 */
async function interfazDelRepo(vite: typeof import('vite'), react: typeof import('@vitejs/plugin-react').default) {
  const antes = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const produccion = { 'process.env.NODE_ENV': '"production"' }
    const servidor = await vite.createServer({
      root: join(APP, 'web'),
      configFile: false,
      plugins: [react()],
      define: produccion,
      // Las dependencias (React) también, aunque Vite las vuelva a armar más tarde, con `NODE_ENV` ya devuelto. Sin
      // `keepProcessEnv`, la huella de las dependencias armadas incluye `NODE_ENV`, que cambia al devolverlo: Vite las volvía
      // a armar en cada arranque, y recargaba la página.
      optimizeDeps: { rolldownOptions: { transform: { define: produccion } } },
      environments: { client: { keepProcessEnv: true } },
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa'
    })
    return servidor.middlewares
  } finally {
    // Vite lo dejaba en `development` cuando no venía puesto: así sigue para los agentes.
    process.env.NODE_ENV = antes ?? 'development'
  }
}

/**
 * Solo atiende a la propia app y a lo que corre en esta computadora fuera del navegador (curl, los scripts de las skills).
 * Escuchar en 127.0.0.1 no basta: cualquier página abierta en el navegador puede mandar peticiones a localhost, y aquí
 * una petición lanza un agente con todos los permisos. `Host` corta el DNS rebinding; `Sec-Fetch-Site` y `Origin`, las
 * peticiones que vienen de otra página.
 */
function deConfianza(req: IncomingMessage): boolean {
  return peticionDeConfianza(req, PORT)
}

server.on('request', async (req, res) => {
  if (!deConfianza(req)) return send(res, 403, { error: 'Sloth solo atiende a su propia ventana.' })
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  try {
    if (url.pathname.startsWith('/api/')) {
      if (suscripcion && (await suscripcion.api(req, res, url))) return // suscripción
      if (await api(req, res, url)) return
    }
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
  interfaz(req, res)
})

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') return
  // El WebSocket lleva todo lo que pasa en los hilos: ninguna otra página lo puede abrir.
  if (!deConfianza(req)) return void socket.destroy()
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws)
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'subscribe' && (msg.sessionId === null || (typeof msg.sessionId === 'string' && /^[\w-]+$/.test(msg.sessionId)))) suscripciones.set(ws, msg.sessionId)
      } catch { /* Un mensaje inválido no cambia la suscripción. */ }
    })
    ws.on('close', () => { clients.delete(ws); suscripciones.delete(ws) })
  })
})

// `localhost` también por IPv6 (::1), que Windows prueba primero: sin nadie escuchando ahí, cada conexión de curl o de un
// agente esperaba unos 200 ms antes de probar 127.0.0.1. Las conexiones van al mismo servidor. Sin IPv6, queda 127.0.0.1.
const v6 = servidorTcp((socket) => server.emit('connection', socket))
v6.on('error', () => {})
v6.listen(PORT, '::1')
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Sloth en http://localhost:${PORT}`)
  // La primera copia de Sloth lee todo el repo; luego solo lo que cambió. Mejor ahora que al mandar el primer mensaje.
  if (!VENTA) setTimeout(() => cambiosSloth.calentar(), 3000)
  // yt-dlp al día, una vez al día: se mira cada hora por si a esa hora trabajaba algo.
  const ytDlp = () => void actualizarYtDlp(APP, () => !ocupado())
  setTimeout(ytDlp, 30_000)
  setInterval(ytDlp, 3_600_000).unref()
})
