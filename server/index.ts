import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { setTimeout as esperar } from 'node:timers/promises'
import { imagenCodex } from './imagen-codex.ts'
import { afinarPrompt } from './afinar-prompt.ts'
import { quitarFondo } from './flow/recorte.ts'
import { registroDeImagen } from './flow/hilo-imagen.ts'
import { carpetasDelHilo, dentroDe, moverProyectos, rutaReal } from './borrar-hilo.ts'
import { dictado } from './dictado.ts'
import { dictadoVivo } from './dictado-vivo.ts'
import { PUBLICACIONES_CARD } from '../shared/publicaciones.ts'
import { NUEVO_ESTILO } from '../shared/crear-estilo.ts'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, watch } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { pipeline } from 'node:stream'
import { createServer as servidorTcp } from 'node:net'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Card, Model, ServerPush } from '../shared/types.ts'
import { VENTA } from '../shared/venta.ts'
import { cambiarAcceso, cambiarOpenRouter, estadoOpenRouter, probar } from './acceso.ts'
import { cuerpo as body, json as send } from './http.ts'
import { ideas } from './ideas/index.ts' // ideas
import { IMAGE_TYPES, nombreAdjunto } from './agent.ts'
import { avances } from './avances.ts'
import { claudeModels } from './claude.ts'
import { tituloInicial } from './titulos.ts'
import { codexModels } from './codex.ts'
import { actualizarAgentes, agentesAlDia, alBajarAgente, asegurarAgente, bajandoAgente, estadoAgentes, rutaAgente } from './agentes.ts'
import { opencodeModels } from './opencode.ts'
import { conectandoOtro, OTROS, sinLimites } from './proveedores.ts'
import { PROVEEDORES, type Proveedor, proveedorDe } from '../shared/providers.ts'
import { paraMandar, salidaDe, sinSalidasLargas } from '../shared/historial.ts'
import { conectandoCodex, conectarCodex, cuentaCodex, limitesCodex, salirCodex, usarPerfilCodex } from './cuenta-codex.ts'
import { alEntrarClaude, conectando, conectarClaude, cuentaClaude, limitesClaude, salirClaude, usarPerfilClaude } from './cuenta.ts'
import { CLAUDE_ORIGINAL, guardarLlavePerfil, PERFILES_LLAVE, perfilesAgente, perfilesClaude, tienePerfiles } from './perfiles-agentes.ts'
import { alAutorizarPerfil } from './cuenta-ventana.ts'
import { cancelarOpenCode, conectandoOpenCode, conectarOpenCode, cuentaOpenCode, limitesOpenCode, quitarCuentaOpenCode, usarCuentaOpenCode } from './cuenta-opencode.ts'
import { enlacesApi } from './enlaces.ts' // tarjeta de los enlaces
import { cerrarVigilantesOciosos, etapasApi, folderOf, mismaCwd, queFalta, videosApi, videosDe } from './etapas.ts' // panel de etapas
import { cerrarMotoresOciosos } from './motor.ts'
import { modelos3d } from './modelos3d.ts' // modelos 3D
import { modelos3dAcciones } from './modelos3d-acciones.ts' // modelos 3D
import { edicionesModelos3d } from './modelos3d-ediciones.ts' // modelos 3D: piezas movidas a mano
import { subtitulos } from './subtitulos.ts' // subtítulos
import { miniaturas } from './miniaturas.ts' // panel de etapas
import { guardarMeta, guardarYoutube, opciones } from './opciones.ts'
import { previas } from './previas.ts' // previas de las cards
import { guardarSobreTi, sobreTi } from './sobre-ti.ts'
import { radar } from './radar/index.ts' // radar
import { comunidad, llaveDelCreador } from './comunidad.ts' // comunidad
import { desempacar, estilos } from './estilos.ts' // estilos compartidos
import { carpetaTrabajo } from './trabajo.ts'
import { redes } from './redes/index.ts' // redes
import { elegirNavegador, navegadorDeFuera, navegadorEn } from './chromium.ts'
import { voz } from './voz/index.ts' // voz de AI Studio
import { flow } from './flow/index.ts' // Google Flow
import { youtube } from './youtube.ts'
import { peticionDeConfianza } from './origen.ts'
import { actualizarYtDlp, BANDERAS, instalandoAlgo, instalar, pythonSlothEntero, requisitos, rutaPythonSloth } from './requisitos.ts'
import { espacio } from './espacio.ts' // espacio en disco
import { equipo } from './equipo.ts' // tu equipo
import { licencia } from './licencia.ts' // suscripción
import { Sessions } from './sessions.ts'
import { actividadAgentes } from './actividad-agentes.ts'
import { mantenerVoz } from './voz-viva.ts'
import { avisoDeVideos } from '../shared/limites.ts'
import { eventosEnVivo } from './eventos-en-vivo.ts'
import { enviarCliente } from './enviar-cliente.ts'
import { anteriorDe, conservarAnterior, olvidarAnterior } from './anteriores.ts'
import { cuidarEstilos, mudarTuyas } from './estilos-perdidos.ts'
import { usosDeEstilos } from './estilos-usos.ts'
import { cambiosDeCard, carpetaSkill, configClaudeDev, duplicateCard, enlazarSkills, enlazarSkillsCodex, guardarSkillTuya, marcasDe, readCards, removeCard, seriesDe, SKILLS, skillRef, volverAOriginal } from './skills.ts'
import { estaticos } from './estaticos.ts'
import { type Agente, version } from './version.ts'
import { cargarPreciosCodex } from './precios.ts'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT ?? 4848)
const CARDS = join(APP, 'cards.json')
/**
 * Los estilos que hizo cada quien con la card «Nuevo estilo» (skill `crear-estilo`): sus cards van aquí, en `data/`,
 * que ninguna versión nueva toca, y sus skills en `<app>/skills/<id>`, que tampoco.
 */
const CARDS_TUYAS = join(APP, 'data', 'tus-cards.json')
/** Con las skills como las trae esta versión, que dicen qué es de VyMotion; sin ellas (el repo) no hace nada. */
function cuidarTuyas(hacer: typeof cuidarEstilos) {
  const originales = process.env.SLOTH_SKILLS_ORIGINALES
  if (!originales) return
  try {
    const ids = hacer({ app: APP, originales })
    if (ids.length) console.log(`Estilos tuyos con su card de vuelta en tus-cards.json: ${ids.join(', ')}`)
  } catch (error) {
    console.error(`No se pudieron revisar las cards de tus estilos: ${error instanceof Error ? error.message : error}`)
  }
}
const ATTACHMENTS = join(APP, 'data', 'attachments')
const ATTACHMENT_TYPES: Record<string, string> = { ...IMAGE_TYPES, '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' }
/** Código de salida que le pide a `scripts/start.mjs` que vuelva a levantar el servidor. */
const RESTART = 75
// Los scripts de las skills buscan aquí los procesos del Python de VyMotion (`sloth.py`); sin esto, los de la app de la skill.
process.env.SLOTH_PROCESOS ??= join(APP, 'python', 'procesos')
// Y aquí las skills (`video-base`, la suya): sin esto, en ~/.claude/skills, que en la app que se vende es lo mismo.
process.env.SLOTH_SKILLS ??= SKILLS
// Y aquí, este servidor: el MCP de la voz (`server/voz/mcp.mjs`) y los scripts que piden algo a VyMotion.
process.env.SLOTH_URL = `http://127.0.0.1:${PORT}`
if (VENTA) {
  // La app que se vende trae sus skills: las enlaza en ~/.claude/skills, donde las busca Claude, y Codex las lee de esas
  // mismas carpetas, no de copias suyas.
  // Antes, los estilos tuyos que se quedaron sin card (server/estilos-perdidos.ts): así también se enlazan.
  cuidarTuyas(cuidarEstilos)
  enlazarSkills(APP)
  enlazarSkillsCodex(APP)
} else {
  // Desde el repo, Claude usa su propia configuración con las skills del repo (`SKILLS`), y ~/.claude queda para la
  // VyMotion instalada en esta computadora. A Codex se le pasa siempre la ruta de la skill.
  process.env.CLAUDE_CONFIG_DIR ??= configClaudeDev(APP)
}
// Y su clave: la cuenta gratis de la comunidad o el apoyo, que quita el recordatorio. VyMotion abre sin ella.
const suscripcion = licencia(APP) // La clave de VyMotion también conecta las voces en la copia de desarrollo.

const clients = new Set<WebSocket>()
const suscripciones = new Map<WebSocket, string | null>()
/** Barra lateral: el avance de cada video, que oye lo que se manda para saber cuándo mirarlo. Nace después que los hilos. */
let avance: ReturnType<typeof avances> | undefined
/** Lo que se mide de los estilos de la comunidad (`server/estilos-usos.ts`). Nace después que la comunidad. */
let usosEstilos: ReturnType<typeof usosDeEstilos> | undefined
function broadcast(msg: ServerPush) {
  let text: string | undefined
  for (const ws of clients) {
    if ((msg.type === 'events' || msg.type === 'draft') && suscripciones.has(ws) && suscripciones.get(ws) !== msg.sessionId) continue
    enviarCliente(ws, text ??= JSON.stringify(msg))
  }
  avance?.oir(msg)
}

const eventos = eventosEnVivo((sessionId, from, events) => {
  broadcast({ type: 'events', sessionId, from, events })
  // Al acabar cada turno de «Nuevo estilo», el estilo que ya está en `skills/` y no tiene card la recibe ahí mismo (la
  // que escribió el hilo, o una hecha con su SKILL.md), aunque el agente no la haya guardado o la haya puesto en cards.json.
  if (events.some((e) => e.t === 'turn_end') && sessions.meta(sessionId)?.cardId === NUEVO_ESTILO) cuidarTuyas(cuidarEstilos)
  if (events.some((e) => e.t === 'turn_end') && usosEstilos?.deLaComunidad(sessions.meta(sessionId)?.cardId)) void usosEstilos.revisar()
})
const sessions = new Sessions(
  join(APP, 'data', 'sessions'),
  eventos,
  (session) => broadcast({ type: 'session', session }),
  (sessionId) => broadcast({ type: 'removed', sessionId }),
  // Lo que va escribiendo un `Write` solo lo pintan el estudio y el panel de etapas: a los demás hilos no se les manda.
  (sessionId, draft) => conEtapas(sessionId) && broadcast({ type: 'draft', sessionId, draft }),
  undefined,
  // Si el agente cierra su turno con el video a medias, VyMotion le pide que siga (`sinAcabar`).
  (meta) => {
    const card = cards().find((c) => c.id === meta.cardId)
    return card ? queFalta(meta, card) : []
  }
)

/** Si el hilo es de un estilo de video: solo su estudio enseña lo que va escribiendo. */
const usoAgente = actividadAgentes(join(APP, 'data', 'sessions'), () => sessions.list())
const conEtapas = (id: string) => !!cards().find((c) => c.id === sessions.meta(id)?.cardId)?.etapas?.length
sessions.esVideo = (meta) => !!cards().find((c) => c.id === meta.cardId)?.etapas?.some((e) => e.fase)
// Con otra cuenta de Claude, los hilos quietos sueltan su Claude Code: el siguiente mensaje ya va con ella.
alEntrarClaude(id => sessions.soltarQuietos('claude', id))
sessions.sinHerramientas = (meta) => cards().find((c) => c.id === meta.cardId)?.sinHerramientas
// Mientras un video trabaja, Whisper se queda cargado: el primero que empieza lo carga, antes de que sus agentes llenen la memoria.
setInterval(() => {
  if (sessions.videosTrabajando()) void mantenerVoz(SKILLS)
  const abiertas = [...suscripciones.values()].flatMap((id) => {
    const meta = id && sessions.meta(id)
    return meta ? [meta] : []
  })
  cerrarMotoresOciosos(abiertas.map(folderOf))
  cerrarVigilantesOciosos([...abiertas, ...sessions.list().filter((s) => s.running || s.background?.length)].map((s) => s.cwd))
}, 60_000).unref()

/**
 * Las cards de cards.json, más las tuyas (`CARDS_TUYAS`) si hay; una tuya sin `id` o con el de una de VyMotion no cuenta.
 * Un estilo tuyo sin `version` (de antes de que la hubiera) es la 1.0.
 * Se releen solo si alguno cambió. Si quedó a medio escribir o con un error, siguen las últimas buenas: una coma de más no
 * puede dejarte sin «Detener» ni «Reiniciar backend», que pasan por aquí. Un error en las tuyas no se lleva las de VyMotion.
 */
let leidas: { mtime: number; cards: Card[] } | undefined
let mala = 0 // la fecha del archivo que falló, para avisar una sola vez
function cards(): Card[] {
  let mtime = 0
  try {
    const tuyas = existsSync(CARDS_TUYAS)
    mtime = statSync(CARDS).mtimeMs + (tuyas ? statSync(CARDS_TUYAS).mtimeMs : 0)
    if (leidas?.mtime !== mtime && mala !== mtime) {
      const deSloth = readCards(CARDS, APP)
      const ids = new Set(deSloth.map((c) => c.id))
      let suyas: Card[] = []
      try {
        if (tuyas) suyas = readCards(CARDS_TUYAS, APP).filter((c) => !ids.has(c.id)).map((c) => ({ ...c, tuya: true, ...(c.etapas && !c.version ? { version: '1.0' } : {}) }))
      } catch (error) {
        console.error(`${CARDS_TUYAS} tiene un error; van solo las cards de VyMotion. ${error instanceof Error ? error.message : error}`)
      }
      leidas = { mtime, cards: [...deSloth, ...suyas] }
    }
  } catch (error) {
    if (mala !== mtime) console.error(`cards.json tiene un error; siguen las cards de antes. ${error instanceof Error ? error.message : error}`)
    mala = mtime
  }
  return leidas?.cards ?? []
}

// Publicar los videos verticales terminados en TikTok, Instagram y YouTube Shorts, y los largos en YouTube. Los Shorts
// van con el canal que conecta YouTube.
const subirLargos = youtube(APP, sessions, cards, `http://127.0.0.1:${PORT}/api/youtube/oauth`, undefined, () => modelos)
const publicar = redes(APP, sessions, cards, broadcast, subirLargos.lectura) // redes

// Cada card de estilo enseña su último video terminado, en pequeño.
const previa = previas(join(APP, 'data', 'previas'), cards) // previas de las cards
// Las imágenes que el panel de etapas enseña en rejilla, en pequeño.
const { miniatura, cuadro, previa: previaChica, previaLista } = miniaturas(join(APP, 'data', 'miniaturas')) // panel de etapas
// Ideas para YouTube: investigar el nicho de un canal y que Claude proponga videos con evidencia.
const idear = VENTA ? undefined : ideas(APP, sessions, broadcast, subirLargos?.lectura) // ideas
// La biblioteca de modelos 3D que llenan los videos, para verla: la de la skill que usan los agentes, que es donde guardan.
const biblioteca3d = modelos3d(carpetaSkill('modelos-3d') ?? join(APP, 'skills', 'modelos-3d'), {
  python: () => rutaPythonSloth() ?? (process.platform === 'win32' ? 'python' : 'python3'),
  sesiones: () => sessions.list(),
  editado: (id) => ediciones3d.tiene(id)
}) // modelos 3D
// Las piezas que se movieron a mano en el visor, por modelo (`data/modelos3d-ediciones`).
const ediciones3d = edicionesModelos3d(join(APP, 'data', 'modelos3d-ediciones')) // modelos 3D
// «Importar .glb» y «Nuevo modelo», en la misma biblioteca.
const acciones3d = modelos3dAcciones({
  sessions,
  skillRef,
  rutaHistorial: id => join(APP, 'data', 'sessions', id + '.jsonl'),
  modelos: () => modelos,
  adjuntos: ATTACHMENTS,
  biblioteca: carpetaSkill('modelos-3d') ?? join(APP, 'skills', 'modelos-3d'),
  trabajo: join(carpetaTrabajo(APP), 'modelos-3d'),
  python: () => rutaPythonSloth() ?? (process.platform === 'win32' ? 'python' : 'python3')
}) // modelos 3D
// Los subtítulos de un video terminado, desde su Entrega: con el transcriptor local y FFmpeg, sin agente.
const subtitular = subtitulos({
  carpeta: (id) => {
    const meta = sessions.meta(id)
    return meta && cards().find((c) => c.id === meta.cardId)?.etapas?.length ? folderOf(meta) : undefined
  },
  scripts: join(carpetaSkill('video-base') ?? join(APP, 'skills', 'video-base'), 'scripts'),
  python: rutaPythonSloth,
  banderas: BANDERAS
}) // subtítulos
// El buscador propio de noticias de tecnología: lee sus fuentes en segundo plano y las skills buscan ahí.
const noticias = radar(APP) // radar
// Tus estilos en un archivo para compartirlos, y los de otros, instalados entre los tuyos.
const estilosLocal = estilos(APP, cards) // estilos compartidos
// La comunidad: lo que la gente hace con VyMotion y cómo. Entra cada cliente con su licencia, y el creador con su llave,
// también desde su copia instalada (publica en Anuncios); un cliente no la tiene.
const comunidadApi = comunidad(APP, {
  credencial: () => llaveDelCreador() ?? suscripcion?.credencial(),
  sessions,
  video: (ruta) => cards().flatMap((c) => (c.etapas?.length ? videosDe(c, sessions) : [])).find((v) => v.ruta === ruta),
  cuadro,
  avisar: broadcast,
  estilos: estilosLocal,
  // Un estilo por aprobar se abre en el trabajo, fuera de las skills: ahí nadie lo usa.
  revisar: (paquete, publicacion) => {
    const carpeta = join(carpetaTrabajo(APP), 'estilos-por-revisar', publicacion)
    return { carpeta, manifiesto: desempacar(paquete, carpeta) }
  },
  deEstilo: (id) => {
    const card = cards().find((c) => c.id === id)
    return card?.origen?.publicacion ?? card?.deComunidad
  }
}) // comunidad
// Los videos terminados con estilos de la comunidad cuentan en su tienda y en el fondo: al arrancar y al acabar cada turno.
usosEstilos = usosDeEstilos(APP, { cards, videos: (card) => videosDe(card, sessions), prueba: comunidadApi.prueba, enviar: comunidadApi.usos })
setTimeout(() => void usosEstilos?.revisar(), 60_000).unref()
// En qué fase va cada video y cuántas etapas lleva, para la barra lateral.
avance = avances(sessions, cards, broadcast)
// Opciones → Espacio en disco: lo que dejan los videos y ya no hace falta. Lo seguro lo borra solo, cada 6 horas.
const disco = espacio({ app: APP, sessions, cards, ocupado, python: () => pythonSlothEntero(APP) }) // espacio en disco
// Opciones → Tu equipo: con qué transcribe la voz y cuánto tarda cada cosa en esta computadora.
const maquina = equipo({ app: APP, ocupado }) // tu equipo
// Opciones → Navegador: en cuál se entra con Google (la voz, Flow, las redes).
navegadorEn(APP)
// La voz de los videos, que los agentes piden a VyMotion y VyMotion genera en AI Studio con la cuenta de Google del usuario.
// Voices Cloning va por el cobro: con tu cuenta o tu apoyo, o con la llave del creador en su computadora.
const narrar = voz(APP, { credencial: () => llaveDelCreador() ?? suscripcion?.credencial(), creador: () => llaveDelCreador() as { llave: string } | undefined }) // voz de AI Studio
// Las imágenes y videos de Google Flow, con esa misma cuenta y en ese mismo Edge.
const generarFlow = flow(APP, narrar.google, {
  chatgpt: imagenCodex,
  quitarFondo: (referencia, marcas) => quitarFondo(APP, referencia, marcas),
  registrar: registroDeImagen(sessions, join(APP, 'data', 'imagenes')),
  async preparar(id, descripcion, formato, cwd) {
    const modelo = modelos.find((m) => m.id === id)
    if (!modelo) throw new Error('El orquestador ya no está disponible. Elige otro modelo o usa tu descripción directa.')
    const { texto, cierre } = await sessions.textoInterno({ model: modelo.id, effort: modelo.defaultEffort, cwd }, [
      'Prepara un único prompt para un generador de imágenes. Conserva la intención y los textos literales del usuario.',
      'Puedes precisar la composición, la luz y los detalles visuales.',
      'Responde con el prompt final completo en texto, hasta 4000 caracteres. No uses herramientas, no escribas archivos ni generes la imagen.',
      `Proporción: ${formato}.\n\nDescripción del usuario:\n${descripcion}`
    ].join('\n\n'))
    if (!texto || texto.length > 4000 || /^(?:listo|hecho|ready)[.!]?$/i.test(texto))
      throw new Error('El modelo no devolvió un prompt completo de hasta 4000 caracteres. Vuelve a intentarlo o usa tu descripción directa.')
    return { texto, uso: { tokens: cierre.tokens, costUsd: cierre.costUsd, model: modelo.id } }
  }
})

// Si el agente (o tú) edita cards.json, las cards se actualizan solas. En la app que se vende, una card tuya que un
// agente puso ahí pasa a tus-cards.json: la siguiente versión reemplaza cards.json.
watch(CARDS, () => {
  if (VENTA) cuidarTuyas(mudarTuyas)
  broadcast({ type: 'cards', cards: cards() })
})
// Y si «Nuevo estilo» hizo uno: su skill se enlaza donde la buscan Claude y Codex antes del primer hilo con su card.
watch(dirname(CARDS_TUYAS), (_, archivo) => {
  if (archivo !== basename(CARDS_TUYAS)) return
  if (VENTA) enlazarSkills(APP), enlazarSkillsCodex(APP)
  broadcast({ type: 'cards', cards: cards() })
})

/** Por qué ahora no se puede reiniciar el servidor: lo cortaría a medias. `null` si nada trabaja. */
function ocupado(): string | null {
  if (afinandoPrompt) return 'Hay un prompt afinándose. Espera a que termine.'
  if (sessions.anyRunning()) return 'Hay un agente trabajando. Espera a que termine.'
  if (publicar?.ocupado()) return publicar.ocupado() // redes: una subida o un texto a medias
  if (subirLargos?.ocupado()) return subirLargos.ocupado()
  if (idear?.ocupado()) return idear.ocupado() // ideas: una investigación en curso
  if (narrar.ocupado()) return narrar.ocupado() // voz de AI Studio: una a medias
  if (generarFlow.ocupado()) return generarFlow.ocupado() // Google Flow: un pedido a medias
  if (acciones3d.ocupado()) return acciones3d.ocupado() // modelos 3D: una importación a medias
  if (subtitular.ocupado()) return subtitular.ocupado() // subtítulos: uno a medias
  return maquina.ocupado() ?? instalandoAlgo() ?? bajandoAgente() ?? conectando() ?? conectandoCodex() ?? conectandoOpenCode() ?? conectandoOtro()
}

/** Vuelve a levantar el servidor (lo hace scripts/start.mjs), con lo que haya cambiado. Los agentes se retoman al volver. */
function reiniciar() {
  sessions.closeAll()
  process.exit(RESTART)
}

/**
 * Los modelos se preguntan a cada agente que ya se bajó (`server/agentes.ts`), y a DeepSeek con su llave. La
 * interfaz no los espera para enseñar cards y hilos: le llegan por el WebSocket. Se piden al arrancar, al bajar un agente
 * y, si fallaron, otra vez cuando alguien abre la app.
 *
 * Lanzar un programa suele detener el servidor unos 200 ms (docs/agents/rendimiento.md). Con todos los agentes de
 * golpe al abrir VyMotion, la interfaz se quedaba sin sus datos: primero la interfaz (`TRAS_ABRIR`) y hasta dos catálogos a la vez.
 */
const TRAS_ABRIR = 1000
const ENTRE_AGENTES = 150
let modelos: Model[] = []
let afinandoPrompt = false
/** Empieza en `true`: hasta `TRAS_ABRIR` nadie los pide. */
let cargandoModelos = true
/** Se pidieron mientras llegaban: al cambiar la cuenta de OpenCode, lo que llegaba ya no vale. */
let otraVez = false
function pedirModelos() {
  if (cargandoModelos) return void (otraVez = true)
  cargandoModelos = true
  // Cada proveedor llega por separado: el que tarda no tapa los modelos que ya se pueden elegir.
  const pedidos: [Proveedor, () => Promise<Model[]>][] = [
    ['claude', claudeModels],
    ['codex', codexModels],
    ['opencode', opencodeModels],
    ...Object.entries(OTROS).map(([p, o]): [Proveedor, () => Promise<Model[]>] => [p as Proveedor, o!.modelos])
  ]
  let siguiente = 0
  async function consultar() {
    while (siguiente < pedidos.length) {
      const [p, pedir] = pedidos[siguiente++]
      try {
        const lista = await pedir()
        // Sin cuenta de OpenCode o de otro agente externo, se quitan sus modelos.
        if (lista.length || (p !== 'claude' && p !== 'codex' && modelos.some((m) => proveedorDe(m.id) === p))) {
          modelos = [...modelos.filter((m) => proveedorDe(m.id) !== p), ...lista]
          broadcast({ type: 'models', models: modelos })
        }
      } catch { /* Si falla un catálogo, los demás siguen llegando. */ }
      if (siguiente < pedidos.length) await esperar(ENTRE_AGENTES)
    }
  }
  void Promise.allSettled([consultar(), esperar(ENTRE_AGENTES).then(consultar)]).finally(() => {
    cargandoModelos = false
    if (otraVez) {
      otraVez = false
      pedirModelos()
    }
  })
}
// Al bajarse un agente, desde donde sea (Opciones, el primer mensaje de un hilo, conectar su cuenta), llegan sus modelos:
// si no, quien actualizaba desde una versión que traía Claude Code veía el menú de modelos vacío hasta reabrir VyMotion.
alBajarAgente(pedirModelos)
alAutorizarPerfil(pedirModelos)
// Codex no da dólares: sus precios de la API se bajan con cada versión de Codex (server/precios.ts).
void cargarPreciosCodex(APP)

/**
 * Las carpetas de un lote: `lote-1007-1530-01`, `-02`… (mes, día, hora y minuto, y el número del video), con el prefijo
 * de la card delante. Si ese nombre ya lo usa otro lote, aunque sus carpetas aún no existan, va `-2`, `-3`…
 */
function carpetasDeLote(card: Card, n: number): string[] {
  const dos = (x: number) => String(x).padStart(2, '0')
  const d = new Date()
  const base = `${card.lote?.prefijo ?? ''}lote-${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`
  const usadas = [...readdirSync(card.cwd), ...sessions.list().flatMap((s) => (mismaCwd(s.cwd, card.cwd) && s.lote ? [s.lote.carpeta] : []))]
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
    [...readdirSync(card.cwd), ...sessions.list().flatMap((s) => (mismaCwd(s.cwd, card.cwd) ? [s.carpeta ?? '', s.lote?.carpeta ?? ''] : []))].map((u) => u.toLowerCase())
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

/** Si arrancar `nuevos` videos pasa de los que van sin aviso y no lo han confirmado: lo contesta, y la interfaz pregunta. */
function pideConfirmar(res: ServerResponse, confirmado: boolean | undefined, nuevos = 1): boolean {
  const aviso = confirmado ? undefined : avisoDeVideos(sessions.videosTrabajando(), nuevos)
  if (aviso) send(res, 409, { confirmar: true, error: aviso })
  return !!aviso
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname
  if (path === '/api/dictado') return dictado(req, res)
  const method = req.method ?? 'GET'

  if (path === '/api/afinar-prompt' && method === 'POST') {
    if (afinandoPrompt) return send(res, 409, { error: 'Ya hay un prompt afinándose. Intenta de nuevo cuando termine.' })
    afinandoPrompt = true
    try {
      return send(res, 200, await afinarPrompt(await body<unknown>(req), modelos))
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : 'No pudimos afinar el prompt.' })
    } finally { afinandoPrompt = false }
  }

  if (path === '/api/state' && method === 'GET') {
    if (!cargandoModelos && (['claude', 'codex', 'opencode'] as const).some((p) => rutaAgente(p) && !modelos.some((m) => proveedorDe(m.id) === p))) pedirModelos()
    send(res, 200, { cards: cards(), sessions: sessions.list(), models: modelos, app: APP, avances: avance?.todos() ?? {} })
    return true
  }

  if (await disco.api(req, res, path)) return true // espacio en disco
  if (await maquina.api(req, res, path)) return true // tu equipo
  if (await narrar.api(req, res, path)) return true // voz de AI Studio
  if (await generarFlow.api(req, res, path)) return true // Google Flow

  if (path === '/api/actividad-agentes' && method === 'GET') {
    const p = url.searchParams.get('agente') as Proveedor
    if (!PROVEEDORES.includes(p)) send(res, 400, { error: 'Agente desconocido.' })
    else send(res, 200, await usoAgente(p))
    return true
  }

  if (path === '/api/opciones' && method === 'GET') {
    send(res, 200, opciones())
    return true
  }

  // El navegador donde se entra con Google (`server/chromium.ts`): cuál se usa y, con POST, el que eliges (`null`: el de siempre).
  if (path === '/api/navegador-de-fuera' && method === 'GET') return send(res, 200, navegadorDeFuera()), true
  if (path === '/api/navegador-de-fuera' && method === 'POST') {
    const { exe } = await body<{ exe: string | null }>(req)
    try {
      elegirNavegador(typeof exe === 'string' && exe ? exe : null)
      send(res, 200, navegadorDeFuera())
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  if (path === '/api/codex/cuenta' && method === 'GET') {
    send(res, 200, await cuentaCodex())
    return true
  }
  if (path === '/api/codex/conectar' && method === 'POST') {
    const { perfil } = await body<{ perfil?: string }>(req)
    const id = perfil ?? perfilesAgente('codex').leer().activa
    if (id !== 'nuevo') {
      if (sessions.perfilOcupado('codex', id)) return send(res, 409, { error: 'Espera a que terminen los hilos de esa cuenta.' })
      sessions.soltarQuietos('codex', id)
    }
    send(res, 200, await conectarCodex(perfil))
    pedirModelos()
    return true
  }
  if (path === '/api/codex/salir' && method === 'POST') {
    try {
      const id = perfilesAgente('codex').leer().activa
      if (sessions.perfilOcupado('codex', id)) return send(res, 409, { error: 'Espera a que terminen los hilos de esa cuenta.' })
      sessions.soltarQuietos('codex', id)
      send(res, 200, await salirCodex())
      pedirModelos()
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  // La cuenta de OpenCode (`server/cuenta-opencode.ts`): mirarla, conectar otra, dejar de esperar al navegador, usar otra
  // de las conectadas o quitarla. Sus modelos dependen de la cuenta: cada cambio los vuelve a pedir.
  const oc = /^\/api\/opencode\/(cuenta|conectar|cancelar|usar|quitar)$/.exec(path)
  if (oc && method === (oc[1] === 'cuenta' ? 'GET' : 'POST')) {
    try {
      const id = oc[1] === 'usar' || oc[1] === 'quitar' ? (await body<{ id: string }>(req)).id : ''
      const { cambio, ...cuenta } = await { cuenta: cuentaOpenCode, conectar: conectarOpenCode, cancelar: cancelarOpenCode, usar: () => usarCuentaOpenCode(id), quitar: () => quitarCuentaOpenCode(id) }[oc[1] as 'cuenta']()
      send(res, 200, cuenta)
      if (cambio || id) pedirModelos()
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  // La cuenta de los demás agentes (`server/proveedores.ts`): mirarla (`?fresco` vuelve a mirar), conectarla, dejar de
  // esperarla, quitarla, darle las llaves de VyMotion (`{usar}`) o, con varias cuentas, usar o quitar una (`{id}`). Sus
  // modelos dependen de la cuenta: cada cambio los vuelve a pedir.
  const otro = /^\/api\/(\w+)\/(cuenta|conectar|cancelar|salir|llaves|usar|quitar)$/.exec(path)
  const o = otro && OTROS[otro[1] as Proveedor]
  if (otro && o && method === (otro[2] === 'cuenta' ? 'GET' : 'POST')) {
    try {
      const datos = ['llaves', 'usar', 'quitar', 'conectar'].includes(otro[2]) ? await body<{ usar?: boolean; id?: string; perfil?: string }>(req) : {}
      const prov = otro[1] as Proveedor
      if (tienePerfiles(prov) && (otro[2] === 'conectar' || otro[2] === 'salir')) {
        const perfil = datos.perfil ?? perfilesAgente(prov).leer().activa
        if (perfil !== 'nuevo') {
          if (sessions.perfilOcupado(prov, perfil)) return send(res, 409, { error: 'Espera a que terminen los hilos de esa cuenta.' })
          sessions.soltarQuietos(prov, perfil)
        }
      }
      const { llaves, usar, quitar } = o
      const id = String(datos.id ?? '')
      const hacer = {
        cuenta: () => o.cuenta(url.searchParams.has('fresco')),
        conectar: o.conectar && (() => o.conectar!(datos.perfil)),
        cancelar: o.cancelar,
        salir: o.salir,
        llaves: llaves && (() => llaves(!!datos.usar)),
        usar: usar && (() => usar(id)),
        quitar: quitar && (() => quitar(id))
      }[otro[2] as 'cuenta']
      if (!hacer) throw new Error('Este agente no admite eso.')
      send(res, 200, await hacer())
      if (otro[2] !== 'cuenta' || url.searchParams.has('fresco')) pedirModelos()
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  // `meta` es un token, no una llave, pero llega igual: `{ llave }`.
  const op = /^\/api\/opciones\/(youtube|meta)$/.exec(path)
  if (op && method === 'POST') {
    const { llave } = await body<{ llave: string | null }>(req)
    try {
      send(res, 200, await { youtube: guardarYoutube, meta: guardarMeta }[op[1] as 'youtube' | 'meta'](llave?.trim() || null))
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
    const { perfil } = await body<{ perfil?: string }>(req)
    const id = perfil ?? perfilesClaude(APP).leer().activa
    if (id !== 'nuevo' && sessions.claudeOcupado(id)) return send(res, 409, { error: 'Espera a que terminen los hilos de esta cuenta antes de volver a autorizarla.' }), true
    send(res, 200, await conectarClaude(APP, perfil))
    return true
  }
  if (path === '/api/claude/perfiles' && method === 'GET') {
    const { activa, perfiles } = perfilesClaude(APP).leer()
    send(res, 200, { activa, perfiles })
    return true
  }
  if (path === '/api/claude/perfiles' && method === 'POST') {
    const { id } = await body<{ id: string }>(req)
    usarPerfilClaude(APP, id)
    send(res, 200, await cuentaClaude(APP))
    return true
  }
  const rutaPerfiles = /^\/api\/([\w-]+)\/perfiles$/.exec(path)
  const dePerfil = rutaPerfiles?.[1] as Proveedor | undefined
  if (dePerfil && tienePerfiles(dePerfil) && (method === 'GET' || method === 'POST')) {
    const perfiles = perfilesAgente(dePerfil, APP)
    if (method === 'GET') return send(res, 200, perfiles.leer())
    const { id, llave, nombre } = await body<{ id?: string; llave?: string; nombre?: string }>(req)
    if ((PERFILES_LLAVE as readonly Proveedor[]).includes(dePerfil) && typeof llave === 'string' && llave.trim()) {
      const valor = llave.trim()
      await probar(dePerfil, valor)
      if (dePerfil === 'cursor') await asegurarAgente('cursor')
      const nuevo = perfiles.nuevo()
      guardarLlavePerfil(perfiles.configuracion(nuevo)!, valor)
      perfiles.autorizar(nuevo, nombre?.trim().slice(0, 100) || `Llave de API …${valor.slice(-4)}`)
    } else if (typeof id === 'string') {
      if (dePerfil === 'codex') usarPerfilCodex(id)
      else if (OTROS[dePerfil]?.usar) {
        const cuenta = await OTROS[dePerfil]!.usar!(id)
        pedirModelos()
        return send(res, 200, cuenta)
      } else perfiles.usar(id)
    } else return send(res, 400, { error: 'Elige un perfil o pega una llave de API.' })
    pedirModelos()
    return send(res, 200, await (dePerfil === 'codex' ? cuentaCodex() : OTROS[dePerfil]!.cuenta()))
  }
  if (path === '/api/claude/salir' && method === 'POST') {
    if (sessions.claudeOcupado(perfilesClaude(APP).leer().activa)) return send(res, 409, { error: 'Espera a que terminen los hilos de esta cuenta antes de cerrar sesión.' }), true
    send(res, 200, await salirClaude(APP))
    return true
  }

  if (path === '/api/pi/openrouter' && (method === 'GET' || method === 'POST')) {
    if (method === 'POST') {
      const { llave } = await body<{ llave: string | null }>(req)
      const estado = await cambiarOpenRouter(llave)
      if (estado.final) await asegurarAgente('pi')
      send(res, 200, estado)
      pedirModelos()
    } else send(res, 200, estadoOpenRouter())
    return true
  }

  // Pagar con la cuenta o con una llave de API (`server/acceso.ts`). Devuelve la cuenta como queda.
  const acceso = /^\/api\/(claude|codex|deepseek|gemini)\/acceso$/.exec(path)
  if (acceso && method === 'POST') {
    const { api, llave, direccion } = await body<{ api: boolean; llave?: string | null; direccion?: string }>(req)
    const p = acceso[1] as Proveedor
    try {
      await cambiarAcceso(p, !!api, llave, direccion)
      const soloLlave = p === 'deepseek' || p === 'gemini'
      send(res, 200, await (p === 'codex' ? cuentaCodex() : soloLlave ? OTROS[p]!.cuenta() : cuentaClaude(APP, true)))
      if (soloLlave) pedirModelos()
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  // Opciones y hover del contexto: cuotas reales de cada plan, como mucho una consulta por minuto.
  const perfilHilo = /^\/api\/sessions\/([\w-]+)\/cuenta-claude$/.exec(path)
  if (perfilHilo && (method === 'GET' || method === 'POST')) {
    const meta = sessions.meta(perfilHilo[1])
    if (!meta || proveedorDe(meta.model) !== 'claude') return send(res, 404, { error: 'Ese hilo no usa Claude.' })
    if (method === 'POST') {
      const { id } = await body<{ id: string }>(req)
      sessions.cambiarPerfilClaude(meta.id, id)
      return send(res, 200, {})
    }
    const perfil = meta.perfilClaude ?? CLAUDE_ORIGINAL
    const cuentas = perfilesClaude(APP).leer().perfiles.filter(p => p.id !== perfil && p.quien && !p.bloqueado)
    const alternativas = perfil === CLAUDE_ORIGINAL ? cuentas : [{ id: CLAUDE_ORIGINAL, quien: 'Cuenta original' }, ...cuentas]
    return send(res, 200, { alternativas })
  }

  const lim = /^\/api\/(\w+)\/limites$/.exec(path)
  if (lim && PROVEEDORES.includes(lim[1] as Proveedor) && method === 'GET') {
    try {
      const hilo = url.searchParams.get('hilo')
      const meta = hilo && lim[1] === 'claude' ? sessions.meta(hilo) : undefined
      const perfil = meta && proveedorDe(meta.model) === 'claude' ? meta.perfilClaude ?? CLAUDE_ORIGINAL : undefined
      send(res, 200, await (lim[1] === 'codex' ? limitesCodex() : lim[1] === 'opencode' ? limitesOpenCode() : lim[1] === 'claude' ? limitesClaude(APP, perfil) : sinLimites()))
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  // Un estilo tuyo pide lo mismo que el de VyMotion del que partió (`basadoEn`).
  const pide = (skill?: string) => (skill && cards().find((c) => c.skill === skill)?.basadoEn) || skill
  if (path === '/api/requisitos' && method === 'GET') {
    send(res, 200, await requisitos(APP, url.searchParams.has('fresco'), pide(url.searchParams.get('skill') ?? undefined)))
    return true
  }

  // Sin `ids`, todo lo que falta; con `skill`, de lo que pide esa skill.
  if (path === '/api/requisitos/instalar' && method === 'POST') {
    const { ids, skill } = await body<{ ids?: string[]; skill?: string }>(req)
    send(res, 200, await instalar(APP, ids, pide(skill)))
    return true
  }

  // «Sobre ti»: lo que cada quien cuenta de sí, para todos los agentes (`server/sobre-ti.ts`).
  if (path === '/api/sobre-ti' && method === 'GET') return send(res, 200, { texto: sobreTi() }), true
  if (path === '/api/sobre-ti' && method === 'POST') {
    const { texto } = await body<{ texto?: string }>(req)
    return send(res, 200, { texto: guardarSobreTi(texto ?? '') }), true
  }

  // El programa de cada agente, que se baja al elegirlo (`server/agentes.ts`). Al acabar, su catálogo de modelos.
  if (path === '/api/agentes' && method === 'GET') return send(res, 200, estadoAgentes()), true
  const baja = /^\/api\/(\w+)\/descargar$/.exec(path)
  if (baja && PROVEEDORES.includes(baja[1] as Proveedor) && method === 'POST') {
    void asegurarAgente(baja[1] as Proveedor).catch(() => {})
    return send(res, 200, estadoAgentes()), true
  }

  const ver = /^\/api\/(\w+)\/version$/.exec(path)
  if (ver && PROVEEDORES.includes(ver[1] as Proveedor) && method === 'GET') return send(res, 200, version(ver[1] as Agente)), true
  // «Actualizar los agentes», arriba del hilo nuevo: Claude Code, Codex y OpenCode en su versión más nueva.
  if (path === '/api/agentes/al-dia' && method === 'GET') return send(res, 200, await agentesAlDia()), true
  if (path === '/api/agentes/actualizar' && method === 'POST') return send(res, 200, await actualizarAgentes()), true

  // Las series de la skill de una card, para elegir una al crear un video. Se leen cada vez: viven en las skills, y
  // todo estilo de video (la card con `etapas`) tiene las de video-base.
  const ser = /^\/api\/cards\/([\w-]+)\/series$/.exec(path)
  if (ser && method === 'GET') {
    const card = cards().find((c) => c.id === ser[1])
    return send(res, 200, card?.skill ? await seriesDe(card.skill, !!card.etapas) : []), true
  }
  // Sus marcas (una por canal), para elegir cuál lleva el video: el compositor manda la línea `Marca:`.
  const mar = /^\/api\/cards\/([\w-]+)\/marcas$/.exec(path)
  if (mar && method === 'GET') {
    const card = cards().find((c) => c.id === mar[1])
    return send(res, 200, card ? marcasDe(card.cwd) : { otras: [] }), true
  }

  // «Con tus cambios»: lo que el usuario (o su agente) cambió en la skill de una card, y volver a la original, entera o un
  // archivo. Solo en la app que se vende, que trae la original (`server/originales.ts`).
  const cam = /^\/api\/cards\/([\w-]+)\/(cambios|original)$/.exec(path)
  if (cam) {
    const todas = cards()
    const card = todas.find((c) => c.id === cam[1])
    if (!card) return send(res, 404, { error: 'No existe esa card' }), true
    if (cam[2] === 'cambios' && method === 'GET') return send(res, 200, await cambiosDeCard(card, todas, join(APP, 'data'))), true
    if (cam[2] === 'original' && method === 'POST') {
      const { skill, archivo } = await body<{ skill?: string; archivo?: string }>(req)
      await volverAOriginal(card, todas, join(APP, 'data'), skill && archivo ? { skill, archivo } : undefined)
      return send(res, 200, await cambiosDeCard(card, todas, join(APP, 'data'))), true
    }
  }

  // Un estilo de VyMotion que cambió a fondo y del que se guardó el de antes al actualizar (`server/anteriores.ts`): su aviso,
  // guardarlo entre los tuyos o quedarse solo con el nuevo.
  const ant = /^\/api\/cards\/([\w-]+)\/anterior$/.exec(path)
  if (ant) {
    const card = cards().find((c) => c.id === ant[1])
    if (!card) return send(res, 404, { error: 'No existe esa card' }), true
    const datos = join(APP, 'data')
    if (method === 'GET') return send(res, 200, anteriorDe(card, datos)), true
    if (method === 'POST') {
      const { accion } = await body<{ accion?: string }>(req)
      if (accion === 'olvidar') return olvidarAnterior(card, datos), send(res, 200, { ok: true }), true
      try {
        return send(res, 200, conservarAnterior({ card, datos, skills: join(APP, 'skills'), tusCards: CARDS_TUYAS })), true
      } catch (error) {
        return send(res, 409, { error: error instanceof Error ? error.message : String(error) }), true
      }
    }
  }

  // Duplicar y borrar, en el repo. En la app que se vende, solo se borran los estilos tuyos: con su card se va su skill,
  // a una copia (`guardarSkillTuya`), si no la usa otra card.
  const c = /^\/api\/cards\/([\w-]+)\/(duplicate|delete)$/.exec(path)
  if (c && method === 'POST') {
    const [, id, action] = c
    const todas = cards()
    const card = todas.find((t) => t.id === id)
    if (!card) return send(res, 404, { error: 'No existe esa card' }), true
    if (id === NUEVO_ESTILO) return send(res, 403, { error: 'Nuevo estilo es el acceso a la creación de estilos.' }), true
    if (VENTA && !card.tuya) return send(res, 403, { error: 'Las cards de VyMotion no se duplican ni se borran.' }), true
    const archivo = card.tuya ? CARDS_TUYAS : CARDS
    if (action === 'duplicate') return send(res, 200, { id: duplicateCard(archivo, id) }), true
    if (card.tuya) {
      if (sessions.list().some((s) => s.cardId === id && (s.running || s.background?.length))) {
        return send(res, 409, { error: 'Un hilo de este estilo está trabajando. Espera a que termine.' }), true
      }
      if (card.skill && !todas.some((t) => t.id !== id && t.skill === card.skill)) guardarSkillTuya(APP, card.skill, join(APP, 'data'))
    }
    removeCard(archivo, id)
    send(res, 200, { ok: true })
    return true
  }

  if (path === '/api/sessions' && method === 'POST') {
    const input = await body<{ cardId: string; model: string; effort?: string; text: string; images?: string[]; masDeDos?: boolean }>(req)
    const card = input.cardId === PUBLICACIONES_CARD.id
      ? { ...PUBLICACIONES_CARD, cwd: join(APP, 'trabajo', 'publicaciones') }
      : cards().find((c) => c.id === input.cardId)
    if (!card) return send(res, 404, { error: 'No existe esa card' }), true
    const skill = card.skill ? skillRef(card.skill) : undefined
    if (card.id === NUEVO_ESTILO && !skill)
      return send(res, 409, { error: 'Falta la skill crear-estilo. Revisa la instalación de VyMotion.' }), true
    if (card.etapas?.some((e) => e.fase) && pideConfirmar(res, input.masDeDos)) return true
    mkdirSync(card.cwd, { recursive: true })
    // Uno que sale de Ideas se llama como la idea (su línea `Título:`); los demás, como su primer mensaje, hasta que llegue
    // el título corto.
    const titulo = /^Título: (.+)$/m.exec(input.text)?.[1].trim()
    const title = titulo?.slice(0, 80) || tituloInicial(input.text, card.title)
    // Un video nuevo también nace con su carpeta, como los de un lote: la skill la crea con el nombre de la línea `Carpeta:`.
    const nueva = card.etapas?.length ? carpetaDeVideo(card, title) : undefined // panel de etapas
    const meta = sessions.create({ cardId: card.id, title, model: input.model, effort: input.effort, cwd: card.cwd, carpeta: nueva, carpetasGeneradas: nueva ? [nueva] : undefined, generarTitulo: !titulo })
    const text = [input.text, nueva && `Carpeta: ${nueva}`].filter(Boolean).join('\n\n')
    sessions.send(meta.id, text, skill, input.images)
    // El mismo agente propone el título durante el trabajo, sin una segunda petición a Claude.
    send(res, 200, meta)
    return true
  }

  // Un lote: un hilo por enlace, cada uno con su carpeta ya nombrada. Esperan su turno en `sessions`.
  if (path === '/api/lotes' && method === 'POST') {
    const input = await body<{ cardId: string; model: string; effort?: string; text: string; enlaces: string[]; images?: string[]; masDeDos?: boolean }>(req)
    const card = cards().find((c) => c.id === input.cardId)
    if (!card?.lote) return send(res, 404, { error: 'Esa card no hace lotes' }), true
    const n = input.enlaces.length
    if (n < 2) return send(res, 400, { error: 'Un lote lleva al menos dos enlaces' }), true
    // Todos los videos del lote copian a la misma carpeta, cada uno con el nombre de la suya.
    if (pideConfirmar(res, input.masDeDos, n)) return true
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

  // «Haz otra versión» pone a trabajar otra vez un video que estaba quieto.
  const otra = method === 'POST' && /^\/api\/sessions\/([\w-]+)\/version$/.exec(path)
  if (otra) {
    const meta = sessions.meta(otra[1])
    const { masDeDos } = await body<{ masDeDos?: boolean }>(req)
    if (meta && sessions.sumaVideo(meta) && pideConfirmar(res, masDeDos)) return true
  }
  if (await etapasApi(req, res, url, sessions, cards(), broadcast, miniatura)) return true // panel de etapas
  if (await videosApi(req, res, url, sessions, cards(), publicar?.marcas, cuadro, { hacer: previaChica, lista: previaLista })) return true // panel de etapas; `publicar.marcas`, de redes
  if (publicar && (await publicar.api(req, res, url))) return true // redes
  if (subirLargos && (await subirLargos.api(req, res, url))) return true // videos largos de YouTube
  if (await previa.api(req, res, url)) return true // previas de las cards
  if (idear && (await idear.api(req, res, url))) return true // ideas
  if (await acciones3d.api(req, res, url)) return true // modelos 3D
  if (await ediciones3d.api(req, res, url)) return true // modelos 3D
  if (await biblioteca3d.api(req, res, url)) return true // modelos 3D
  if (await subtitular.api(req, res, url)) return true // subtítulos
  if (await noticias.api(req, res, url)) return true // radar
  if (await comunidadApi.api(req, res, url)) return true // comunidad
  if (await narrar.admin(req, res, url)) return true // Administrador, solo en la computadora del creador
  if (await estilosLocal.api(req, res, url)) return true // estilos compartidos
  if (await enlacesApi(req, res, url)) return true // tarjeta de los enlaces

  const m = /^\/api\/sessions\/([\w-]+)(?:\/(\w+))?$/.exec(path)
  if (m) {
    const [, id, action] = m
    if (action === 'historial' && method === 'GET') {
      const found = await sessions.historial(id)
      // Lo que no cambia nada va como hueco (`paraMandar`), y las salidas largas se piden al abrir su fila.
      send(res, found ? 200 : 404, found ? { ...found, events: paraMandar(sinSalidasLargas(found.events)) } : { error: 'No existe' })
    } else if (action === 'salida' && method === 'GET') {
      const found = await sessions.historial(id)
      send(res, found ? 200 : 404, found ? { output: salidaDe(found.events, url.searchParams.get('tool') ?? '') } : { error: 'No existe' })
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
    } else if ((action === 'borrado' && (method === 'GET' || method === 'POST')) || (action === 'delete' && method === 'POST')) {
      let movidas: ReturnType<typeof moverProyectos> | undefined
      try {
        const conArchivos = action === 'borrado' && method === 'POST'
        const hilo = sessions.meta(id)
        if (!hilo) return send(res, method === 'POST' ? 200 : 404, method === 'POST' ? { ok: true } : { error: 'Este chat ya se eliminó.' })
        const imagenes = (conArchivos || method === 'GET') && hilo.imagenEstudio ? generarFlow.archivosDelHilo(hilo.imagenEstudio) : undefined
        const videos = (conArchivos || method === 'GET') && !imagenes && conEtapas(id)
          ? carpetasDelHilo(hilo, sessions.list(), hilo.carpetasGeneradas ? undefined : sessions.primerUsuario(id)?.text)
          : []
        if (method === 'GET') return send(res, 200, { tipo: imagenes?.archivos.length ? 'imagen' : videos.length ? 'video' : null })
        sessions.remove(id, () => {
          if (videos.length) {
            const enCola = [...publicar.rutasEnCola(), ...subirLargos.rutasEnCola()]
            if (enCola.some((ruta) => videos.some((carpeta) => dentroDe(carpeta, join(rutaReal(dirname(ruta)) ?? dirname(ruta), basename(ruta))))))
              throw new Error('Hay un video en cola de publicación. Retíralo de la cola antes de eliminar sus archivos.')
            movidas = moverProyectos(videos)
          } else if (imagenes) movidas = generarFlow.moverImagenesDelHilo(imagenes)
        })
      } catch (error) {
        movidas?.restaurar()
        return send(res, 409, { error: error instanceof Error ? error.message : String(error) })
      }
      try {
        await movidas?.limpiar()
        send(res, 200, { ok: true })
      } catch (error) {
        console.error('No se pudo completar el borrado de archivos:', error)
        send(res, 200, { ok: true, aviso: 'El chat se eliminó. Algunos archivos quedaron en una carpeta temporal porque estaban en uso.' })
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
      const input = await body<{ text: string; images?: string[]; masDeDos?: boolean }>(req)
      const meta = sessions.meta(id)
      if (meta && sessions.sumaVideo(meta) && pideConfirmar(res, input.masDeDos)) return true
      try {
        sessions.steer(id, input.text, input.images)
        send(res, 200, { ok: true })
      } catch (error) {
        send(res, 409, { error: error instanceof Error ? error.message : String(error) })
      }
    } else if (action === 'empezar') {
      const input = await body<{ masDeDos?: boolean }>(req)
      const meta = sessions.meta(id)
      if (meta && sessions.sumaVideo(meta) && pideConfirmar(res, input.masDeDos)) return true
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
    const file = join(ATTACHMENTS, `${Date.now()}-${nombreAdjunto(basename(url.searchParams.get('name') ?? 'archivo'))}`)
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
    pipeline(createReadStream(file), res, () => {})
    return true
  }

  if (path === '/api/open' && method === 'POST') {
    const pedido = await body<{ path: string; sessionId?: string }>(req)
    // Una ruta relativa (un enlace del agente: `out/video.mp4`) es de donde trabaja su hilo, o de la carpeta de su video.
    const meta = pedido.sessionId ? sessions.meta(pedido.sessionId) : undefined
    const bases = meta ? [meta.cwd, folderOf(meta)] : []
    const target = bases.map((b) => resolve(b, pedido.path)).find((r) => existsSync(r)) ?? (bases[0] ? resolve(bases[0], pedido.path) : pedido.path)
    // Señalado en su carpeta: el Explorador y el Finder saben; en Linux se abre la carpeta que lo tiene.
    const [programa, ...args] =
      process.platform === 'win32' ? ['explorer.exe', `/select,${target}`] : process.platform === 'darwin' ? ['open', '-R', target] : ['xdg-open', existsSync(target) && statSync(target).isDirectory() ? target : dirname(target)]
    spawn(programa, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref()
    send(res, 200, { ok: true })
    return true
  }

  // La ventana lo pregunta antes de parar el servidor para llevar lo pesado a otro disco (electron/mudanza.ts).
  if (path === '/api/ocupado' && method === 'GET') return send(res, 200, { ocupado: ocupado() }), true

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
      optimizeDeps: {
        include: ['react', 'react-dom/client', 'gsap', 'marked'],
        rolldownOptions: { transform: { define: produccion } }
      },
      environments: { client: { keepProcessEnv: true } },
      server: { middlewareMode: true, hmr: { server }, warmup: { clientFiles: ['./src/main.tsx'] } },
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
  if (!deConfianza(req)) return send(res, 403, { error: 'VyMotion solo atiende a su propia ventana.' })
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
const dictados = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/api/dictado/vivo') {
    if (!deConfianza(req)) return void socket.destroy()
    dictados.handleUpgrade(req, socket, head, cliente => dictadoVivo(cliente))
    return
  }
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
  console.log(`VyMotion en http://localhost:${PORT}`)
  setTimeout(() => {
    otraVez = false
    cargandoModelos = false
    pedirModelos()
  }, TRAS_ABRIR)
  // yt-dlp al día, una vez al día: se mira cada hora por si a esa hora trabajaba algo.
  const ytDlp = () => void actualizarYtDlp(APP, () => !ocupado())
  setTimeout(ytDlp, 120_000).unref()
  setInterval(ytDlp, 3_600_000).unref()
})
