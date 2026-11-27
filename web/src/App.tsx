import { lazy, memo, Suspense, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CANAL_CARD, IDEAS_CARD } from '../../shared/ideas' // ideas
import { chatsPorModelo3D, MODELO3D_CARD, rutaEditor3D } from '../../shared/modelos3d' // modelos 3D
import { PUBLICACIONES_CARD } from '../../shared/publicaciones' // «Organizar en chat» de YouTube
import { REVISION_CARD } from '../../shared/revision' // revisión de estilos
import type { Afinado, AvanceCorto, AvisoComunidad, Card, Marcas, RifaGanada, Model, Previa, Serie, ServerPush, SessionMeta, VideoHecho } from '../../shared/types'
import { NUEVO_ESTILO } from '../../shared/crear-estilo'
import { NOMBRE_AGENTE, PROVEEDORES, proveedorDe } from '../../shared/providers'
import { AvisoVideos } from './AvisoVideos'
import { VENTA } from '../../shared/venta'
import { textoAHtml } from './markdown'
import { CuentaClaude, Notificaciones, Opciones, useSinClaude } from './Opciones'
import { CampoAscii } from './CampoAscii'
import { useEntradaEstilo, useTransicionApartado } from './Movimiento'
import { api } from './api'
import { eventos, useFallo, useResumen } from './eventos'
import { useDesplazando } from './desplazando'
import { useRecordado } from './recordado'
import { avisarAnuncio, useAvisos } from './avisos'
import { TituloDeFila, useBarraPlegada, vistaDeLote, vistaDeVideo, type Plegado, type Vista } from './Barra'
import { aProyecto, ElegirProyecto, nombresDeProyectos, ProyectoFila, proyectosDe } from './Proyectos'
import { Composer, Icon, Picker, type Choice, type Draft } from './Composer'
import { LINK, pedirMejora, threadIcons, threadRef } from './etiquetas'
import { Confirm } from './Confirm'
import { TusCambios } from './TusCambios'
import { EstiloCambio } from './EstiloCambio'
import { Novedades } from './Novedades'
import { avisarGanasteRifa, GanasteRifa } from './GanasteRifa'
import { ActualizarSloth } from './Actualizar' // versiones nuevas
import { VersionYApoyo } from './Licencia' // la versión que tienes y hasta cuándo vale tu apoyo
import { TarjetasEnlaces } from './Enlaces' // tarjeta de los enlaces
import { esDeEstudio, Estudio } from './Estudio' // panel de etapas
import { BotonNavegador, PanelNavegador, useNavegadorAbierto } from './Navegador' // navegador de cada hilo
import { conReferencia, ReferenciaVideo } from './Referencia'
import { useSoltar } from './Soltar'
import { CON_CHATGPT, conOpenCode, conPrimero, elegirModelos, lineaSubagentes, Modelos, type Avanzado } from './Modelos'
import { AvisoEquipo } from './Equipo' // tu equipo
import { MisVideos, Rejilla, VideoDe } from './MisVideos'
import { abrirPublicacion, Comunidad } from './Comunidad' // comunidad
import { AyudaCrearVideo } from './AyudaVideo'
import { MiPerfil } from './MiPerfil' // comunidad: «Mi perfil», su propia página
import { abrirBorrador, CompartirEstilo, ImportarEstilo, incompletosGuardados, marcarIncompletos } from './Estilos' // estilos compartidos
import { GuiaVista } from './Guia'
import { PedirMejora } from './PedirMejora' // comunidad
import { Icono } from './Iconos'
import { SinApoyo } from './SinApoyo' // estilos de la comunidad, sin apoyo
import { Bienvenida } from './Bienvenida'
import { AvisoMacViejo } from './AvisoMacViejo'
import { MarcaAgente } from './Logos'
import { RevisionYoutube, YoutubeLote } from './YoutubeProgramar'
import { rutaEditorImagen } from '../../shared/estilos-imagen'
import { CalendarioYoutube } from './YoutubeCalendario'
import { avisarTanda, AvisoRedes, ConNavegadorRedes, usePublicar } from './Redes' // redes
import { AvisoPiloto } from './Piloto' // piloto
import { NombreDelHilo, Renombrar } from './Renombrar'
import { Segmento } from './Segmento'
import { nombreDeVoz, SelectorVoz, useVoz, vozPosible } from './Voz' // voz de AI Studio, Fish Audio o ElevenLabs
import { lineaMusica, lineaVoz } from '../../shared/voz'
import { SelectorClips, SelectorImagenes, useChatGPT, useFlow } from './Flow' // Google Flow
import { imagenPosible, lineaClips, lineaImagenes, MODELOS_VIDEO, OPCIONES_CLIPS } from '../../shared/flow'
import { Timeline } from './Timeline'
import { Admin, esPestanaAdmin, type PestanaAdmin, useEsCreador } from './Admin' // Administrador, solo en la computadora del creador
import { compact, duration } from './items'
import './Barra.css'
import { apartadoRedes, rutaRedes, type ApartadoRedes } from './redes-ruta'

const EstudioImagenes = lazy(() => import('./EstudioImagenes').then((m) => ({ default: m.EstudioImagenes })))
const CatalogoEstilos = lazy(() => import('./CatalogoEstilos').then((m) => ({ default: m.CatalogoEstilos })))
const Ideas = lazy(() => import('./Ideas').then((m) => ({ default: m.Ideas })))
const Modelos3D = lazy(() => import('./Modelos3D').then((m) => ({ default: m.Modelos3D })))
const CentroRedes = lazy(() => import('./CentroRedes').then((m) => ({ default: m.CentroRedes })))

/** El inicio es siempre un hilo nuevo; sin card en el hash, toma la última que se usó. Un borrador es un inicio a medias. */
type View =
  | { kind: 'new'; cardId?: string }
  | { kind: 'draft'; id: string }
  | { kind: 'session'; id: string }
  | { kind: 'opciones'; seccion?: string; apartado?: string }
  | { kind: 'videos'; estilo?: string }
  | { kind: 'estilos' } // el catálogo de estilos
  | { kind: 'modelos3d'; modeloId?: string } // modelos 3D; con `modeloId`, su editor
  | { kind: 'imagenes'; imagenId?: string } // estudio de Imágenes, o el editor de una
  /** Redes: la producción, Ideas, las publicaciones, el calendario y las cuentas (`CentroRedes.tsx`). */
  | { kind: 'redes'; apartado?: ApartadoRedes; canalId?: string }
  | { kind: 'comunidad'; perfil?: boolean } // comunidad; `perfil`, «Mi perfil» (su propia página)
  | { kind: 'admin'; pestana?: PestanaAdmin } // Administrador, solo en la computadora del creador
  /** La revisión de YouTube (`youtube-ruta.ts`): `volver` es la vista de donde se abrió. */
  | { kind: 'youtube'; cardId?: string; ruta?: string; volver: string }

/** Lo que se escribió en un hilo nuevo sin mandarlo. Vive en localStorage hasta que se manda o se borra. */
type Saved = Draft & { cardId: string; at: number }

const filled = (d?: Draft) => !!d && (!!d.text.trim() || !!d.images.length)
/** Cuánto lleva quieto un hilo antes de archivarse solo (ver «Archivado automático» en App). */
const QUIETO = 12 * 3600_000
const newId = () => Math.random().toString(36).slice(2, 10)

/** La vista sale del hash (#/s/<id>, #/d/<id>, #/new/<card>), así sobrevive a las recargas de cuando la app se edita sola. */
function readHash(): View {
  if (/^#\/youtube(?:\?|$)/.test(location.hash)) {
    const p = new URLSearchParams(location.hash.split('?')[1] ?? '')
    const origen = p.get('volver') ?? ''
    return {kind: 'youtube', cardId: p.get('cardId') || undefined, ruta: p.get('ruta') || undefined, volver: origen.startsWith('#/') && !origen.startsWith('#/youtube') ? origen : '#/redes'}
  }
  const [, kind, id, apartado] = location.hash.split('/')
  if (kind === 's' && id) return { kind: 'session', id }
  if (kind === 'd' && id) return { kind: 'draft', id }
  if (kind === 'opciones') return { kind: 'opciones', seccion: id, apartado }
  if (kind === 'ideas') return VENTA ? { kind: 'redes' } : { kind: 'redes', apartado: 'ideas', canalId: id || undefined }
  if (kind === 'mis-videos') return { kind: 'videos', estilo: id || undefined }
  if (kind === 'estilos') return { kind: 'estilos' }
  if (kind === 'redes') {
    const seccion = apartadoRedes(id)
    return VENTA && seccion === 'ideas' ? { kind: 'redes' }
      : { kind: 'redes', apartado: seccion, canalId: seccion === 'ideas' ? apartado || undefined : undefined }
  }
  if (kind === 'modelos-3d') return { kind: 'modelos3d', modeloId: id === 'editar' && apartado && /^[\w-]+$/.test(apartado) ? apartado : undefined } // modelos 3D
  if (kind === 'imagenes') return { kind: 'imagenes', imagenId: id === 'editar' ? apartado : undefined }
  if (kind === 'comunidad' || kind === 'mejoras') return { kind: 'comunidad', ...(id === 'perfil' ? { perfil: true } : {}) } // comunidad (antes, Mejoras)
  if (kind === 'admin') return { kind: 'admin', pestana: esPestanaAdmin(id) ? id : undefined }
  return { kind: 'new', cardId: kind === 'new' ? id : undefined }
}

/** Fuera del componente: la misma función siempre, para que el Administrador memorizado no se vuelva a pintar. */
const irAPestanaAdmin = (pestana: PestanaAdmin) => go({ kind: 'admin', pestana })

function go(view: View) {
  if (view.kind === 'estilos') {
    location.hash = '/estilos'
    return
  }
  if (view.kind === 'youtube') {
    location.hash = `/youtube?${new URLSearchParams({volver: view.volver, ...(view.cardId ? {cardId: view.cardId} : {}), ...(view.ruta ? {ruta: view.ruta} : {})})}`
    return
  }
  if (view.kind === 'redes') {
    location.hash = rutaRedes(view.apartado, view.canalId)
    return
  }
  if (view.kind === 'imagenes') {
    location.hash = view.imagenId ? rutaEditorImagen(view.imagenId) : '/imagenes'
    return
  }
  location.hash =
    view.kind === 'session'
      ? `/s/${view.id}`
      : view.kind === 'draft'
        ? `/d/${view.id}`
        : view.kind === 'opciones'
          ? `/opciones${view.seccion ? `/${view.seccion}${view.apartado ? `/${view.apartado}` : ''}` : ''}`
          : view.kind === 'videos'
            ? `/mis-videos${view.estilo ? `/${view.estilo}` : ''}`
            : view.kind === 'modelos3d' // modelos 3D
              ? view.modeloId ? rutaEditor3D(view.modeloId) : '/modelos-3d'
              : view.kind === 'comunidad' // comunidad
              ? `/comunidad${view.perfil ? '/perfil' : ''}`
              : view.kind === 'admin'
              ? `/admin${view.pestana ? `/${view.pestana}` : ''}`
              : view.cardId
              ? `/new/${view.cardId}`
              : '/'
}

/** Lo escrito en un hilo sin mandar: sobrevive a cambiar de hilo y a recargar. Se borra al mandarlo o al borrar el hilo. */
const respuesta = (id: string) => `respuesta:${id}`
function leerRespuesta(id: string): Draft | undefined {
  try {
    return JSON.parse(localStorage.getItem(respuesta(id)) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}
function guardarRespuesta(id: string, d: Draft) {
  if (d.text.trim() || d.images.length) localStorage.setItem(respuesta(id), JSON.stringify(d))
  else localStorage.removeItem(respuesta(id))
}

export function App() {
  const [view, setView] = useState<View>(readHash)
  const pagina = useRef<HTMLElement>(null)
  useTransicionApartado(pagina, view.kind === 'session' ? 'hilo' : JSON.stringify(view))
  const [cards, setCards] = useState<Card[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  // Los eventos de cada hilo no viven aquí sino en `eventos.ts`: llegan muchas veces por segundo y solo los pinta el abierto.
  // En qué fase va cada video, para la barra lateral. Lo manda el servidor cuando cambia (`server/avances.ts`).
  const [avances, setAvances] = useState<Record<string, AvanceCorto>>({}) // avance
  const abierto = useRef<string | null>(null) // panel de etapas: el hilo abierto, para el WebSocket
  const socket = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [falloEstado, setFalloEstado] = useState('')
  const [app, setApp] = useState('')
  const [menu, setMenu] = useState<{ session: SessionMeta; x: number; y: number } | null>(null)
  // El hilo que se renombra en su fila de la barra lateral.
  const [renombrando, setRenombrando] = useState<string | null>(null)
  // La barra lateral plegada en una columna de iconos (Ctrl+B, o sola en una ventana estrecha).
  const [plegado, setPlegado] = useStored<Plegado>('barraPlegada', {})
  const [avisosEstilos, setAvisosEstilos] = useStored('avisosCambiosEstilos', true)
  const [plegada, plegar] = useBarraPlegada(plegado, setPlegado)
  const [showArchived, setShowArchived] = useState(false)
  // Con hilos seleccionados (aunque sea ninguno), un clic en un hilo lo marca en vez de abrirlo.
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [anchor, setAnchor] = useState('')
  // La altura donde empezó la selección: el globo de acciones aparece ahí.
  const [pickY, setPickY] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, Saved>>(() => {
    try {
      return JSON.parse(localStorage.getItem('drafts') ?? '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => localStorage.setItem('drafts', JSON.stringify(drafts)), [drafts])
  // El hilo nuevo en blanco también escribe en un borrador, que solo sale en la lista cuando lo dejas a medias. Se
  // recuerda también al cerrar Sloth: al volver, lo que escribías sigue en el campo, no en «Borradores».
  const [freshId, setFreshId] = useState(() => sessionStorage.getItem('fresh') || localStorage.getItem('fresh') || newId())
  useEffect(() => (sessionStorage.setItem('fresh', freshId), localStorage.setItem('fresh', freshId)), [freshId])
  const draftId = view.kind === 'draft' ? view.id : view.kind === 'new' ? freshId : null

  useEffect(() => {
    // En el celular la barra desplegada va encima de todo: al elegir algo se pliega sola, como en una app de teléfono.
    const onHash = () => (setView(readHash()), matchMedia('(max-width: 760px)').matches && plegar(true))
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let ws: WebSocket
    let retry: ReturnType<typeof setTimeout>
    const connect = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
      socket.current = ws
      ws.onopen = async () => {
        const socket = ws
        socket.send(JSON.stringify({ type: 'subscribe', sessionId: abierto.current }))
        setConnected(true)
        dispatchEvent(new CustomEvent('sloth-conexion', { detail: true }))
        try {
          const state = await api('/api/state')
          setCards(state.cards)
          // Los modelos pueden llegar después, por el WebSocket: una lista vacía no tapa la que ya llegó.
          if (state.models.length) setModels(state.models)
          setApp(state.app)
          setSessions(state.sessions)
          setAvances(state.avances ?? {}) // avance
          eventos.conexion(true)
          setFalloEstado('')
          // Mientras no hubo conexión no llegaron avisos: los paneles de etapas vuelven a leer su avance.
          dispatchEvent(new CustomEvent('sloth-etapas')) // panel de etapas
        } catch (e) {
          // Sin el estado la app se queda vacía: se dice abajo en la barra y se vuelve a intentar al reconectar.
          setFalloEstado(`No se pudo leer el estado de Sloth: ${e instanceof Error ? e.message : String(e)}`)
          socket.close()
        }
      }
      ws.onclose = (e) => {
        setConnected(false)
        // Desde la web, `ConexionWeb` lo dice si tarda (4001: este dispositivo se quitó en Opciones).
        dispatchEvent(new CustomEvent('sloth-conexion', { detail: e.code === 4001 ? 'quitado' : false }))
        eventos.conexion(false)
        retry = setTimeout(connect, 800)
      }
      ws.onmessage = (msg) => {
        const push = JSON.parse(msg.data) as ServerPush
        if (push.type === 'cards') setCards(push.cards)
        if (push.type === 'models') setModels(push.models)
        // La sección Ideas escucha sus avisos (cada paso de la investigación, lo que escribe Claude) donde esté.
        if (push.type === 'ideas') dispatchEvent(new CustomEvent('sloth-ideas', { detail: push })) // ideas
        if (push.type === 'comunidad') dispatchEvent(new CustomEvent('sloth-comunidad')) // comunidad
        if (push.type === 'redes') {
          dispatchEvent(new CustomEvent('sloth-redes', { detail: push.aviso }))
          if (push.acabo) avisarTanda(push.acabo)
        } // redes
        // Cambió la carpeta de un hilo: su panel de etapas vuelve a leer su avance.
        if (push.type === 'etapas') dispatchEvent(new CustomEvent('sloth-etapas', { detail: push.sessionId })) // panel de etapas
        if (push.type === 'avance') setAvances((all) => ({ ...all, [push.sessionId]: push.avance })) // avance
        if (push.type === 'session') {
          eventos.cambio(push.session.id)
          setSessions((list) => [push.session, ...list.filter((s) => s.id !== push.session.id)].sort((a, b) => b.updatedAt - a.updatedAt))
        }
        if (push.type === 'removed') {
          setSessions((list) => list.filter((s) => s.id !== push.sessionId))
          eventos.quitar(push.sessionId)
          localStorage.removeItem(respuesta(push.sessionId))
        }
        // Panel de etapas: lo que va escribiendo cada `Write`, solo del hilo abierto, que es el único que lo pinta.
        if (push.type === 'draft') eventos.escrito(push.sessionId, push.draft)
        if (push.type === 'events') eventos.llegan(push.sessionId, push)
      }
    }
    connect()
    return () => {
      clearTimeout(retry)
      ws.onclose = null
      ws.close()
    }
  }, [])

  // Los chats de un modelo 3D se abren en su editor (`Modelos3D.tsx`), no como un hilo suelto.
  const chats3D = useMemo(() => chatsPorModelo3D(sessions), [sessions])
  const destino3D = view.kind === 'session' ? sessions.find((s) => s.id === view.id)?.modelo3d : undefined
  useEffect(() => {
    if (destino3D) location.replace(rutaEditor3D(destino3D.editando ?? destino3D.resultado))
  }, [destino3D])
  const grupo3D = view.kind === 'modelos3d' && view.modeloId ? chats3D.get(view.modeloId) : undefined
  const openId = view.kind === 'session' ? view.id : grupo3D?.[0]?.id ?? null
  abierto.current = openId
  // El servidor manda los eventos del hilo abierto. El que se deja se guarda para volver, si no trabaja (`eventos.ts`).
  const deSesiones = useRef(sessions)
  deSesiones.current = sessions
  useEffect(() => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'subscribe', sessionId: openId }))
    eventos.abrir(openId, (id) => {
      const meta = deSesiones.current.find((s) => s.id === id)
      return !!(meta?.running || meta?.background?.length)
    })
  }, [openId])

  // Lo último que se vio de cada hilo. `updatedAt` solo cambia al empezar o acabar un turno, así que si es más
  // nuevo que lo visto, el hilo terminó sin que lo miraras. Lo anterior a la primera vez cuenta como visto.
  const [seen, setSeen] = useStored<{ since: number; at: Record<string, number> }>('seen', { since: Date.now(), at: {} })
  const openUpdated = sessions.find((s) => s.id === openId)?.updatedAt
  useEffect(() => {
    if (openId && openUpdated && openUpdated > (seen.at[openId] ?? 0)) setSeen({ ...seen, at: { ...seen.at, [openId]: openUpdated } })
  }, [openId, openUpdated])
  const finished = (s: SessionMeta) => !s.running && !s.background?.length && s.id !== openId && s.updatedAt > (seen.at[s.id] ?? seen.since)
  // Avisos: la notificación y el tono cuando algo acaba mientras miras otra cosa, y en el título los del punto verde.
  useAvisos({ sessions, cards, openId, sinVer: sessions.filter((s) => !s.archived && finished(s)).length, abrir: (id) => go({ kind: 'session', id }) })

  // Archivado automático: lo que hacías a mano con casi todos los hilos. Vive aquí y no en el servidor porque «ya lo
  // viste» es de este navegador (`seen`). Un hilo se archiva solo si cumple todo: su card no tiene estudio (Sloth, Ideas:
  // los videos se siguen en su estudio), ya lo viste (sin el punto verde), no trabaja ni espera nada, su último turno
  // acabó bien (`acaboBien`, del servidor) y lleva 12 h quieto. Tampoco el que miras ni uno con una respuesta a medio
  // escribir. Se desarchiva como siempre y entonces se queda: `archivadosSolos` guarda el `updatedAt` con el que se
  // archivó, y solo vuelve a contar si el hilo tiene otro turno.
  const [archivadosSolos, setArchivadosSolos] = useStored<Record<string, number>>('archivadosSolos', {})
  const [ahora, setAhora] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 10 * 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!connected) return
    const quietos = sessions.filter((s) => {
      const card = cardOf(s.cardId)
      if (!card || esDeEstudio(card) || s.archived || s.id === openId || archivadosSolos[s.id] === s.updatedAt) return false
      if (s.running || s.background?.length || s.pendiente || s.acaboBien !== true) return false
      return s.updatedAt <= (seen.at[s.id] ?? seen.since) && ahora - s.updatedAt >= QUIETO && !localStorage.getItem(respuesta(s.id))
    })
    if (!quietos.length) return
    const vivos = Object.entries(archivadosSolos).filter(([id]) => sessions.some((s) => s.id === id))
    setArchivadosSolos(Object.fromEntries([...vivos, ...quietos.map((s) => [s.id, s.updatedAt] as const)]))
    for (const s of quietos) api(`/api/sessions/${s.id}/archive`, { archived: true }).catch(() => {}) // se reintenta tras su próximo turno
  }, [sessions, cards, seen, ahora, connected, openId])

  // Al cambiar de vista: si el hilo nuevo quedó a medias, pasa a la lista y el próximo empieza en blanco. Los borradores
  // vacíos que no están abiertos se tiran.
  const left = useRef(draftId)
  useEffect(() => {
    if (left.current === freshId && draftId !== freshId && filled(drafts[freshId])) setFreshId(newId())
    left.current = draftId
    setDrafts((all) => {
      const keep = Object.entries(all).filter(([id, d]) => id === draftId || filled(d))
      return keep.length === Object.keys(all).length ? all : Object.fromEntries(keep)
    })
  }, [draftId])

  /**
   * «Nuevo chat» con algo escrito guarda lo escrito como borrador y abre uno en blanco. Siempre es otro inicio: con el mismo,
   * la galería de un estilo seguía en el sitio de las cards.
   */
  function abrirChatDeEstilo(cardId?: string) {
    setFreshId(newId())
    go({ kind: 'new', cardId })
  }
  const newChat = () => abrirChatDeEstilo()

  // Un borrador que pide otra parte de la app (adaptar o revisar un estilo, `abrirBorrador`): se revisa antes de mandarlo.
  useEffect(() => {
    const abrir = (e: Event) => {
      const { cardId, texto } = (e as CustomEvent<{ cardId: string; texto: string }>).detail
      const id = newId()
      setDrafts((all) => ({ ...all, [id]: { text: texto, html: textoAHtml(texto), images: [], cardId, at: Date.now() } }))
      go({ kind: 'draft', id })
    }
    // El hilo donde tu agente revisó un estilo de la comunidad (`abrirHilo`).
    const hilo = (e: Event) => go({ kind: 'session', id: (e as CustomEvent<string>).detail })
    addEventListener('sloth-borrador', abrir)
    addEventListener('sloth-hilo', hilo)
    return () => (removeEventListener('sloth-borrador', abrir), removeEventListener('sloth-hilo', hilo))
  }, []) // estilos compartidos

  function dropDraft(id: string) {
    setDrafts(({ [id]: _, ...rest }) => rest)
    if (view.kind === 'draft' && view.id === id) go({ kind: 'new' })
  }

  // Los hilos de Ideas, los de «Nuevo modelo» y los que revisan un estilo son de una card que no sale en el inicio: les da su icono.
  const cardOf = (id: string) => cards.find((c) => c.id === id) ?? [IDEAS_CARD, CANAL_CARD, MODELO3D_CARD, REVISION_CARD, PUBLICACIONES_CARD].find((c) => c.id === id)
  // Antes de dibujar: las etiquetas de hilo del compositor y de las burbujas lo leen al pintarse.
  threadIcons.clear()
  for (const s of sessions) {
    const icon = cardOf(s.cardId)?.icon
    if (icon) threadIcons.set(s.id, icon)
  }
  const archived = sessions.filter((s) => s.archived)
  // Los videos de un lote van juntos, donde cae el más reciente. Los de un proyecto, en su carpeta (`Proyectos.tsx`).
  const agrupar = (hilos: SessionMeta[]) => {
    const lista: (SessionMeta | SessionMeta[])[] = []
    const lotes = new Map<string, SessionMeta[]>()
    for (const s of hilos) {
      // De los chats de un mismo modelo 3D, la barra enseña solo el más nuevo: los demás están en su editor.
      if (s.modelo3d && chats3D.get(s.modelo3d.resultado)?.[0]?.id !== s.id) continue
      if (!s.lote) {
        lista.push(s)
        continue
      }
      let grupo = lotes.get(s.lote.id)
      if (!grupo) lotes.set(s.lote.id, (grupo = [])), lista.push(grupo)
      grupo.push(s)
    }
    return lista
  }
  const lista = agrupar(sessions.filter((s) => !s.archived && !s.proyecto))
  const proyectos = proyectosDe(sessions).map((p) => ({ ...p, items: agrupar(p.hilos) }))
  const [proyectosAbiertos, setProyectosAbiertos] = useStored<Record<string, boolean>>('proyectos', {})
  /** Una carpeta, abierta si la abriste o si el hilo que miras está en ella. */
  const abiertoProyecto = (p: { nombre: string; hilos: SessionMeta[] }) => proyectosAbiertos[p.nombre] ?? p.hilos.some((s) => s.id === openId)
  // El + de una carpeta: el chat nuevo nace en ella. Se olvida al salir del chat nuevo.
  const [proyectoNuevo, setProyectoNuevo] = useState<string | null>(null)
  useEffect(() => {
    if (view.kind !== 'new') setProyectoNuevo(null)
  }, [view.kind])
  const [abiertos, setAbiertos] = useStored<Record<string, boolean>>('lotes', {})
  /** Un lote con sus videos en orden. Abierto si lo abriste, o si el hilo que miras es de este lote. */
  const delLote = (grupo: SessionMeta[]) => {
    const videos = [...grupo].sort((a, b) => a.lote!.n - b.lote!.n)
    const id = videos[0].lote!.id
    return { id, videos, abierto: abiertos[id] ?? videos.some((s) => s.id === openId) }
  }
  // La lista por fechas. Va de lo más nuevo a lo más viejo, así que cada sección empieza donde cambia el día.
  const secciones: { nombre: string; items: typeof lista }[] = []
  for (const x of lista) {
    const nombre = cuando(Array.isArray(x) ? Math.max(...x.map((s) => s.updatedAt)) : x.updatedAt)
    if (secciones.at(-1)?.nombre !== nombre) secciones.push({ nombre, items: [] })
    secciones.at(-1)!.items.push(x)
  }

  // Buscar: entre todos los hilos, también los archivados y los de cada lote, por su título o el de su card, sin
  // importar tildes. Ctrl+K lleva al campo, y despliega la barra si estaba plegada; Escape lo vacía. Plegada, la lista no
  // se filtra: no se ve qué se busca.
  const [busca, setBusca] = useState('')
  const campoBusca = useRef<HTMLInputElement>(null)
  // comunidad: tus avisos sin leer, junto a «Comunidad». Se piden cada 2 minutos mientras se ve Sloth, cada 10 con la
  // ventana oculta (un anuncio avisa aunque no la estés mirando), y al leerlos. Si subieron, se mira si hay un anuncio.
  // Con ellos llega lo que ganaste en la rifa, que sale a toda la pantalla (`GanasteRifa`).
  const [avisosComunidad, setAvisosComunidad] = useState(0)
  // Los estilos tuyos de la comunidad a los que les falta algo para estar en la tienda (`marcarIncompletos`).
  const [incompletos, setIncompletos] = useState(incompletosGuardados)
  useEffect(() => {
    const oir = (e: Event) => setIncompletos((e as CustomEvent<number>).detail)
    addEventListener('sloth-estilos-incompletos', oir)
    return () => removeEventListener('sloth-estilos-incompletos', oir)
  }, [])
  const esCreador = useEsCreador()
  useEffect(() => {
    let sabidos = 0
    let pedida = 0
    const pedir = async () => {
      if (document.visibilityState !== 'visible' && Date.now() - pedida < 600_000) return
      pedida = Date.now()
      try {
        const { sinLeer, rifa } = await api<{ sinLeer: number; rifa?: RifaGanada }>('/api/comunidad/avisos?cuenta')
        setAvisosComunidad(sinLeer)
        if (rifa) avisarGanasteRifa(rifa)
        if (sinLeer > sabidos) {
          const { avisos } = await api<{ avisos: AvisoComunidad[] }>('/api/comunidad/avisos')
          avisarAnuncio(avisos, abrirPublicacion)
          // A un estilo tuyo le falta algo para estar en la tienda: «Comunidad» va en rojo hasta que lo completes.
          const faltan = avisos.filter((a) => a.tipo === 'incompleto' && !a.leido).length
          if (faltan) marcarIncompletos(faltan)
        }
        sabidos = sinLeer
      } catch {
        // Sin conexión o sin cuenta: se vuelve a pedir.
      }
    }
    const inicial = setTimeout(pedir, 12_000)
    const t = setInterval(pedir, 120_000)
    addEventListener('sloth-comunidad-avisos', pedir)
    return () => (clearTimeout(inicial), clearInterval(t), removeEventListener('sloth-comunidad-avisos', pedir))
  }, [])
  const buscar = () => (plegar(false), setTimeout(() => campoBusca.current?.focus()))
  // Un chat nuevo desde cualquier parte, con el cursor ya en su campo: Alt+N en Windows y Linux (también en un navegador,
  // que no lo usa); en Mac, Cmd+N (en la ventana de Sloth: Opción+N escribe la ñ). Y Ctrl+Mayús+O, el de ChatGPT y
  // Gemini. Ctrl+N también, en la ventana de Sloth (un navegador lo guarda para abrir otra ventana).
  const alNuevo = useRef(newChat)
  alNuevo.current = newChat
  /** «Nuevo chat» ya se abrió al apretar el ratón: el clic de cuando suelta no abre otro. */
  const abrioAlApretar = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tecla = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && tecla === 'k') e.preventDefault(), buscar()
      if (e.repeat || e.defaultPrevented) return
      // En Mac, Cmd: Ctrl+N es «bajar una línea» en un campo de texto.
      const mando = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
      // Por la tecla o por su sitio: algunos teclados (y lo que teclea un programa) no traen `code`.
      const altN = !MAC && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyN' || tecla === 'n')
      const ctrlN = mando && !e.altKey && !e.shiftKey && tecla === 'n'
      const ctrlMayusO = mando && !e.altKey && e.shiftKey && tecla === 'o'
      if (altN || ctrlN || ctrlMayusO) e.preventDefault(), alNuevo.current()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  const q = plegada ? '' : sinTildes(busca.trim())
  const encontrados = q ? sessions.filter((s) => sinTildes(`${s.title} ${cardOf(s.cardId)?.title ?? ''}`).includes(q)) : []

  /**
   * Marca o desmarca un hilo; con Mayús marca todos los que hay a la vista desde el último que tocaste. El tramo va en el
   * orden en que se ven: los de un lote plegado no están, y si no, «Eliminar» borraba hilos que no se veían.
   */
  function pick(id: string, range: boolean) {
    const next = new Set(selected)
    const visibles = (items: typeof lista) =>
      items.flatMap((x) => {
        if (!Array.isArray(x)) return [x]
        const lote = delLote(x)
        return lote.abierto ? lote.videos : []
      })
    const order = (
      q
        ? encontrados
        : [
            ...proyectos.flatMap((p) => (abiertoProyecto(p) ? visibles(p.items) : [])),
            ...secciones.flatMap((sec) => visibles(sec.items)),
            ...(showArchived ? archived : [])
          ]
    ).map((s) => s.id)
    const [a, b] = [order.indexOf(anchor), order.indexOf(id)]
    if (range && a >= 0 && b >= 0) order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((i) => next.add(i))
    else if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    setAnchor(id)
  }

  // Lo que hacen las filas, siempre las mismas funciones (las filas van memorizadas) y con lo de ahora.
  const alFila = useRef<AccionesFila>(null as never)
  alFila.current = {
    clic(s, e) {
      if (!selected && !e.ctrlKey && !e.metaKey) return go(s.modelo3d ? { kind: 'modelos3d', modeloId: s.modelo3d.editando ?? s.modelo3d.resultado } : { kind: 'session', id: s.id })
      if (!selected) setPickY(e.clientY)
      pick(s.id, e.shiftKey)
    },
    // Doble clic: renombrarlo ahí mismo. Sus dos clics ya lo abrieron. Seleccionando (o con Ctrl o Mayús), cada clic
    // marca o desmarca, y el doble clic no hace nada más. Con la barra plegada no se ve el título: tampoco.
    doble: (s, e) => void (!selected && !plegada && !e.ctrlKey && !e.metaKey && !e.shiftKey && setRenombrando(s.id)),
    menu: (s, e) => setMenu({ session: s, x: e.clientX, y: e.clientY }),
    renombrado: () => setRenombrando(null)
  }
  const accionesFila = useMemo<AccionesFila>(
    () => ({
      clic: (s, e) => alFila.current.clic(s, e),
      doble: (s, e) => alFila.current.doble(s, e),
      menu: (s, e) => alFila.current.menu(s, e),
      renombrado: () => alFila.current.renombrado()
    }),
    []
  )
  const row = (s: SessionMeta) => (
    <FilaHilo
      key={s.id}
      s={s}
      icono={s.imagenEstudio ? 'imagen' : (cardOf(s.cardId)?.icon ?? '•')}
      activa={openId === s.id && !selected}
      marcada={selected ? selected.has(s.id) : undefined}
      plegada={plegada}
      avance={avances[s.id]}
      terminada={finished(s)}
      renombrando={renombrando === s.id}
      acciones={accionesFila}
    />
  )
  /** Un hilo suelto o un lote, en la lista por fechas o en su carpeta. */
  const item = (x: SessionMeta | SessionMeta[]) => {
    if (!Array.isArray(x)) return row(x)
    const { id, videos, abierto } = delLote(x)
    return <LoteFila key={id} videos={videos} card={cardOf(videos[0].cardId)} abierto={abierto} onToggle={() => setAbiertos({ ...abiertos, [id]: !abierto })} fila={row} vista={vistaDeLote(videos, avances)} />
  }
  const lastCard = () => cardOf(localStorage.getItem('card') ?? '') ?? cards[0]
  const cardSolicitada = view.kind === 'new' ? view.cardId : view.kind === 'draft' ? drafts[view.id]?.cardId : undefined
  const creador = cardOf(NUEVO_ESTILO)
  const nuevoEstiloSinCard = cardSolicitada === NUEVO_ESTILO && !creador
  const newCard = draftId && !nuevoEstiloSinCard ? (cardOf(cardSolicitada ?? '') ?? lastCard()) : undefined
  const cardNotificaciones = newCard ?? (view.kind === 'session' ? cardOf(sessions.find((s) => s.id === view.id)?.cardId ?? '') : undefined) ?? lastCard()
  const skillNotificaciones = cardNotificaciones?.etapas ? cardNotificaciones.skill : undefined
  const shownDrafts = Object.entries(drafts)
    .filter(([id, d]) => filled(d) && !(id === freshId && view.kind === 'new'))
    .sort(([, a], [, b]) => b.at - a.at)

  return (
    <div className={`app${plegada ? ' plegada' : ''}`}>
      <aside className="sidebar" aria-label="Barra lateral">
        {/* Plegada, cada botón es su icono y dice qué es al pasar el ratón; los textos se esconden en Barra.css. */}
        <div className="brand-fila">
          <button className="brand" onClick={newChat} title={plegada ? 'Nuevo chat' : undefined}>
            <img src="/icon.svg" alt="" /> Sloth
          </button>
          <Notificaciones key={skillNotificaciones ?? ''} skill={skillNotificaciones} />
          <button className="plegar" title={plegada ? 'Desplegar la barra (Ctrl+B)' : 'Plegar la barra (Ctrl+B)'} aria-expanded={!plegada} onClick={() => plegar(!plegada)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M9 5v14" />
            </svg>
          </button>
        </div>
        {/* Abre al apretar, como los menús del sistema; con el teclado (Enter, espacio), al soltar. */}
        <button
          className={`new-chat barra-nuevo${view.kind === 'new' ? ' active' : ''}`}
          onPointerDown={(e) => {
            // Con el dedo o el lápiz, abre al soltar (el clic); con el ratón, ya.
            abrioAlApretar.current = e.button === 0 && e.pointerType === 'mouse'
            if (abrioAlApretar.current) newChat()
          }}
          onClick={(e) => {
            // Con el teclado (detail 0) o con el dedo, abre aquí.
            if (e.detail === 0 || !abrioAlApretar.current) newChat()
            abrioAlApretar.current = false
          }}
          title={`${plegada ? 'Nuevo chat · ' : ''}${MAC ? 'Cmd N' : 'Alt N'}`}
          aria-keyshortcuts={MAC ? 'Meta+N Meta+Shift+O' : 'Alt+N Control+Shift+O'}
        >
          <span className="new-chat-icon">
            <Icono de="mas" />
          </span>{' '}
          Nuevo chat
        </button>
        <nav className="barra-destinos" aria-label="Navegación principal">
        <button data-destino="redes" className={`new-chat${view.kind === 'redes' || view.kind === 'youtube' ? ' active' : ''}`} aria-current={view.kind === 'redes' || view.kind === 'youtube' ? 'page' : undefined} onClick={() => go({ kind: 'redes' })} title={plegada ? 'Redes' : undefined}>
          <span className="new-chat-icon"><Icono de="compartir" /></span> Redes
        </button>
        <button data-destino="videos" className={`new-chat${view.kind === 'videos' ? ' active' : ''}`} aria-current={view.kind === 'videos' ? 'page' : undefined} onClick={() => go({ kind: 'videos' })} title={plegada ? 'Mis videos' : undefined}>
          <span className="new-chat-icon">
            <Icono de="video" />
          </span>{' '}
          Mis videos
        </button>
        <button data-destino="estilos" className={`new-chat${view.kind === 'estilos' ? ' active' : ''}`} aria-current={view.kind === 'estilos' ? 'page' : undefined} onClick={() => go({ kind: 'estilos' })} title={plegada ? 'Estilos' : undefined}>
          <span className="new-chat-icon"><Icono de="claqueta" /></span> Estilos
        </button>
        <button data-destino="imagenes" className={`new-chat${view.kind === 'imagenes' ? ' active' : ''}`} aria-current={view.kind === 'imagenes' ? 'page' : undefined} onClick={() => go({ kind: 'imagenes' })} title={plegada ? 'Imágenes' : undefined}>
          <span className="new-chat-icon"><Icono de="imagen" /></span>{' '}
          Imágenes
        </button>
        {/* modelos 3D */}
        <button data-destino="modelos3d" className={`new-chat${view.kind === 'modelos3d' ? ' active' : ''}`} aria-current={view.kind === 'modelos3d' ? 'page' : undefined} onClick={() => go({ kind: 'modelos3d' })} title={plegada ? 'Modelos 3D' : undefined}>
          <span className="new-chat-icon">
            <Icono de="cubo" />
          </span>{' '}
          Modelos 3D
        </button>
        {/* comunidad */}
        <button
          data-destino="comunidad"
          className={`new-chat${view.kind === 'comunidad' ? ' active' : ''}${incompletos ? ' falta' : ''}`}
          aria-current={view.kind === 'comunidad' ? 'page' : undefined}
          onClick={() => go({ kind: 'comunidad' })}
          title={incompletos ? 'A un estilo tuyo le falta algo para estar en la tienda: entra a Estilos y complétalo' : plegada ? 'Comunidad' : undefined}
        >
          <span className="new-chat-icon">
            <Icono de="personas" />
          </span>{' '}
          Comunidad
          {(avisosComunidad > 0 || incompletos > 0) && (
            <span className="nav-cuenta" title={avisosComunidad ? `${avisosComunidad} ${avisosComunidad === 1 ? 'aviso' : 'avisos'} sin leer` : undefined}>
              {avisosComunidad > 99 ? '99+' : avisosComunidad || '!'}
            </span>
          )}
        </button>
        {/* Administrador: solo en la computadora del creador (la que tiene su llave de publicar.txt). */}
        {esCreador && (
          // Con el ratón entra al apretar (ya está armado y oculto), como un menú del sistema; con el dedo o el teclado,
          // al soltar o pulsar (así desplazar la barra con el dedo no entra).
          <button
            className={`new-chat${view.kind === 'admin' ? ' active' : ''}`}
            aria-current={view.kind === 'admin' ? 'page' : undefined}
            onPointerDown={(e) => e.pointerType === 'mouse' && e.button === 0 && go({ kind: 'admin' })}
            onClick={() => go({ kind: 'admin' })}
            title={plegada ? 'Administrador' : undefined}
          >
            <span className="new-chat-icon">
              <Icono de="escudo" />
            </span>{' '}
            Administrador
          </button>
        )}
        </nav>
        {plegada ? (
          <button className="buscar" title="Buscar chats (Ctrl+K)" aria-label="Buscar chats" onClick={buscar}><Icono de="buscar" /></button>
        ) : (
          <div className="buscar" onClick={() => campoBusca.current?.focus()}>
            <Icono de="buscar" />
            <input
              ref={campoBusca}
              placeholder="Buscar chats"
              aria-label="Buscar chats"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setBusca(''), e.currentTarget.blur())}
            />
            <CampoAscii variante="malla" />
            {busca ? (
              <button className="buscar-x" title="Borrar la búsqueda" onClick={() => setBusca('')}>
                <Icono de="cerrar" />
              </button>
            ) : <kbd>Ctrl K</kbd>}
          </div>
        )}
        <div className="sessions">
          {q ? (
            encontrados.length ? (
              <>
                <div className="barra-seccion">{encontrados.length === 1 ? '1 hilo' : `${encontrados.length} hilos`}</div>
                {encontrados.map(row)}
              </>
            ) : (
              <p className="barra-vacio">Ningún hilo dice «{busca.trim()}».</p>
            )
          ) : (
            <>
          {connected && sessions.length === 0 && shownDrafts.length === 0 && !plegada && (
            <div className="barra-historial-vacio">
              <p>Tus chats aparecerán aquí.</p>
              <div className="barra-ascii" aria-hidden="true">
                <CampoAscii variante="onda-lateral" />
              </div>
            </div>
          )}
          {shownDrafts.length > 0 && <div className="barra-seccion">Borradores</div>}
          {shownDrafts.map(([id, d]) => (
            <div key={id} role="button" className={`session-row draft-row ${view.kind === 'draft' && view.id === id ? 'active' : ''}`} title={plegada ? `Borrador: ${d.text.trim().split('\n')[0] || 'Imagen'}` : undefined} onClick={() => go({ kind: 'draft', id })}>
              <span className="session-icon"><Icon icon={cardOf(d.cardId)?.icon ?? '•'} /></span>
              <span className="session-title">{d.text.trim().split('\n')[0] || 'Imagen'}</span>
              {/* Mientras lo editas no es un borrador todavía: la etiqueta sale al irte a otro hilo. */}
              {!(view.kind === 'draft' && view.id === id) && <span className="draft-tag">Borrador</span>}
              <button className="draft-x" title="Borrar el borrador" onClick={(e) => (e.stopPropagation(), dropDraft(id))}>
                ✕
              </button>
            </div>
          ))}
          {proyectos.length > 0 && <div className="barra-seccion">Proyectos</div>}
          {proyectos.map((p) => {
            const abierto = abiertoProyecto(p)
            return (
              <ProyectoFila
                key={`proyecto-${p.nombre}`}
                nombre={p.nombre}
                hilos={p.hilos}
                abierto={abierto}
                plegada={plegada}
                onToggle={() => setProyectosAbiertos({ ...proyectosAbiertos, [p.nombre]: !abierto })}
                onNuevo={() => (newChat(), setProyectoNuevo(p.nombre))}
              >
                {p.items.map(item)}
              </ProyectoFila>
            )
          })}
          {secciones.flatMap((sec) => [
            <div key={`seccion-${sec.nombre}`} className="barra-seccion">
              {sec.nombre}
            </div>,
            ...sec.items.map(item),
          ])}
          {/* Los archivados, al final y plegados: casi siempre se llega a ellos buscando. */}
          {archived.length > 0 && (
            <button
              className={`barra-seccion archivados ${showArchived ? 'on' : ''}`}
              title="Los hilos sin estudio que ya viste terminar bien se archivan solos a las 12 h. Desarchívalos con clic derecho."
              onClick={() => setShowArchived(!showArchived)}
            >
              Archivados <span className="cuantos">{archived.length}</span>
            </button>
          )}
          {showArchived && archived.map(row)}
            </>
          )}
        </div>
        {/* La selección flota fuera de la barra lateral, a media altura, señalando a los hilos. */}
        {selected && (
          <SelectBar
            picked={sessions.filter((s) => selected.has(s.id))}
            proyectos={nombresDeProyectos(sessions)}
            y={pickY}
            app={app}
            onClose={() => setSelected(null)}
            onDeleted={(ids) => openId && ids.includes(openId) && go({ kind: 'new' })}
          />
        )}
        {menu && (
          <SessionMenu
            {...menu}
            app={app}
            proyectos={nombresDeProyectos(sessions)}
            onClose={() => setMenu(null)}
            onSelect={() => {
              if (!selected) setPickY(menu.y)
              setSelected(new Set([...(selected ?? []), menu.session.id]))
              setAnchor(menu.session.id)
            }}
            onDeleted={(id) => openId === id && go({ kind: 'new' })}
            onRename={() => (plegar(false), setRenombrando(menu.session.id))}
          />
        )}
        <Pie running={sessions.some((s) => s.running || !!s.background?.length)} connected={connected} enOpciones={view.kind === 'opciones'} fallo={falloEstado} plegada={plegada} />
      </aside>

      <main className="main" ref={pagina}>
        <Bienvenida models={models} />
        <AvisoMacViejo />
        <AvisoVideos />
        {view.kind === 'opciones' && (
          <Opciones seccion={view.seccion} apartado={view.apartado} avisosEstilos={avisosEstilos} onAvisosEstilos={setAvisosEstilos} onDone={() => go({ kind: 'new' })} />
        )}
        <Suspense fallback={<p className="vista-cargando" role="status">Abriendo apartado…</p>}>
        {view.kind === 'redes' && (
          <CentroRedes cards={cards} sessions={sessions} apartado={view.apartado}
            onCrear={(id) => go({ kind: 'new', cardId: id })}>
            {!VENTA && view.apartado === 'ideas' && (
              <Suspense fallback={<p className="muted" role="status">Abriendo Ideas…</p>}>
                <Ideas
                  canalId={view.canalId}
                  cards={cards}
                  models={models}
                  sessions={sessions}
                  onCanal={(canalId) => go({ kind: 'redes', apartado: 'ideas', canalId })}
                  onHilo={(id) => go({ kind: 'session', id })}
                  // «Hacer con…» abre el mensaje de la idea para revisarlo antes de mandarlo.
                  onBorrador={(cardId, texto) => {
                    const id = newId()
                    setDrafts((all) => ({ ...all, [id]: { text: texto, html: textoAHtml(texto), images: [], cardId, at: Date.now() } }))
                    go({ kind: 'draft', id })
                  }}
                />
              </Suspense>
            )}
          </CentroRedes>
        )}
        {view.kind === 'imagenes' && <EstudioImagenes models={models} imagenId={view.imagenId} abrir={(imagenId) => go({ kind: 'imagenes', imagenId })} />}
        {view.kind === 'estilos' && <CatalogoEstilos cards={cards} puedeCrear={!!creador} abrir={abrirChatDeEstilo} />}
        {view.kind === 'modelos3d' && <Modelos3D modelosIA={models} modeloId={view.modeloId} chats={chats3D} />} {/* modelos 3D */}
        </Suspense>
        {view.kind === 'youtube' && <RevisionYoutube key={`${view.cardId ?? ''}:${view.ruta ?? ''}`} cardId={view.cardId} ruta={view.ruta} cerrar={() => { location.hash = view.volver }} />}
        {view.kind === 'comunidad' && (view.perfil ? <MiPerfil /> : <Comunidad />)}
        {esCreador && view.kind === 'admin' && (
          <Admin activa pestana={view.pestana} onPestana={irAPestanaAdmin} />
        )}
        {/* comunidad: «Pedir una mejora», que abre el símbolo del agente de cualquier hilo y la publica en Mejoras. */}
        <PedirMejora sessions={sessions} />
        {view.kind === 'videos' && (
          <ConNavegadorRedes>
            <MisVideos cards={cards} sessions={sessions} estilo={view.estilo} onEstilo={(estilo) => go({ kind: 'videos', estilo })} />
          </ConNavegadorRedes>
        )}
        {nuevoEstiloSinCard && <p className="vista-cargando" role="status">El creador de estilos aún no está disponible.</p>}
        {newCard && draftId && (
          <div className="avisos-nuevo">
            <AvisoEquipo /> {/* tu equipo */}
            {proyectoNuevo && view.kind === 'new' && (
              <div className="proyecto-aviso small">
                <Icono de="carpeta" /> Este chat nace en el proyecto «{proyectoNuevo}».
                <button className="ghost small" title="Que vaya a la lista por fechas" onClick={() => setProyectoNuevo(null)}>
                  Quitar
                </button>
              </div>
            )}
          </div>
        )}
        {newCard && draftId && (
          <NewSession
            key={draftId}
            card={newCard}
            cards={cards}
            sessions={sessions}
            models={models}
            draft={drafts[draftId]}
            onNuevoEstilo={() => abrirChatDeEstilo(NUEVO_ESTILO)}
            onDraft={(d) =>
              setDrafts((all) => {
                const old = all[draftId]
                // Abrirlo no lo cambia: así no salta al principio de la lista solo por mirarlo.
                if (old ? old.html === d.html && old.images.length === d.images.length : !filled(d)) return all
                return { ...all, [draftId]: { ...old, ...d, cardId: newCard.id, at: Date.now() } }
              })
            }
            onPick={(c) => {
              localStorage.setItem('card', c.id)
              // En un borrador la card es suya; en el hilo nuevo va en el hash.
              setDrafts((all) => (all[draftId] ? { ...all, [draftId]: { ...all[draftId], cardId: c.id } } : all))
              if (view.kind === 'new') go({ kind: 'new', cardId: c.id })
            }}
            onCreated={(id, todos) => {
              setDrafts(({ [draftId]: _, ...rest }) => rest)
              // Nació desde el + de una carpeta: va a ella, también los videos de un lote.
              if (proyectoNuevo) void aProyecto(todos ?? [id], proyectoNuevo).catch(() => {})
              go({ kind: 'session', id })
            }}
          />
        )}
        {view.kind === 'session' && (
          <SessionView
            id={view.id}
            session={sessions.find((s) => s.id === view.id)}
            card={cardOf(sessions.find((s) => s.id === view.id)?.cardId ?? '')}
            models={models}
          />
        )}
      </main>
      {/* En el celular, con la barra desplegada encima: tocar fuera la pliega (Barra.css). */}
      {!plegada && <div className="barra-velo" aria-hidden onClick={() => plegar(true)} />}
      <Novedades />
      <GanasteRifa />
      {avisosEstilos && <EstiloCambio cards={cards} activa={newCard?.id} pausado={view.kind === 'modelos3d' || (view.kind === 'session' && !!sessions.find((s) => s.id === view.id)?.modelo3d)} onDesactivar={() => setAvisosEstilos(false)} />}
    </div>
  )
}

type AccionesFila = {
  clic(s: SessionMeta, e: React.MouseEvent): void
  doble(s: SessionMeta, e: React.MouseEvent): void
  menu(s: SessionMeta, e: React.MouseEvent): void
  renombrado(): void
}

/**
 * Un hilo en la barra lateral. Memorizada: lo que cambia en la app (escribir en el compositor, que otro hilo avance) no
 * vuelve a dibujar las otras doscientas. `marcada`: si se está seleccionando, si este va marcado.
 */
const FilaHilo = memo(function FilaHilo({ s, icono, activa, marcada, plegada, avance, terminada, renombrando, acciones }: { s: SessionMeta; icono: string; activa: boolean; marcada?: boolean; plegada: boolean; avance?: AvanceCorto; terminada: boolean; renombrando: boolean; acciones: AccionesFila }) {
  if (renombrando)
    return (
      <div className="session-row renombrando">
        <span className="session-icon"><Icon icon={icono} /></span>
        <Renombrar session={s} onListo={acciones.renombrado} />
      </div>
    )
  const vista = vistaDeVideo(s, avance)
  return (
    <button
      className={`session-row ${activa ? 'active' : ''} ${s.archived ? 'archived' : ''} ${marcada ? 'selected' : ''}`}
      title={plegada ? [s.title, vista?.title].filter(Boolean).join('\n') : undefined}
      onClick={(e) => acciones.clic(s, e)}
      onDoubleClick={(e) => acciones.doble(s, e)}
      onContextMenu={(e) => {
        e.preventDefault()
        acciones.menu(s, e)
      }}
    >
      {marcada !== undefined && <span className="check">{marcada ? '✓' : ''}</span>}
      <span className="session-icon"><Icon icon={icono} /></span>
      <TituloDeFila titulo={s.title} vista={vista} />
      {s.pendiente && <span className="draft-tag">{s.lote?.pausa ? 'En pausa' : 'En espera'}</span>}
      {(s.running || !!s.background?.length) && <span className="dot running" title={s.running ? 'Trabajando' : `En segundo plano: ${s.background!.join(', ')}`} />}
      {terminada && <span className="dot done" title="Terminó su turno; aún no lo has abierto" />}
    </button>
  )
})

/**
 * Lo último que elegiste a mano: en «Avanzado» o en el compositor de un hilo. Es lo que usa «Optimizado» en una card sin
 * medir, y lo hereda la sección Ideas. Mandar no lo cambia: si no, lo optimizado de una card pisaba tu elección.
 */
function lastChoice(models: Model[]): Choice | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem('choice') ?? 'null') as Choice | null
    // Una elección guardada antes puede decir `claude-opus-5-5[1m]`: es el mismo modelo.
    const model = saved?.model.replace('[1m]', '')
    if (saved && model && models.some((m) => m.id === model)) return { model, effort: saved.effort }
  } catch {}
  return undefined
}
const elegidoAMano = (c: Choice) => localStorage.setItem('choice', JSON.stringify(c))

/** Un estado que sobrevive a las recargas en localStorage. */
function useStored<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null') ?? initial
    } catch {
      return initial
    }
  })
  return [value, (next) => (localStorage.setItem(key, JSON.stringify(next)), setValue(next))]
}

/** Los enlaces de un texto, sin repetir, en su orden. */
const enlacesDe = (text: string) => [...new Set(text.match(new RegExp(LINK, 'g')) ?? [])]

/** El único inicio: la card elegida arriba, el compositor y debajo las cards para cambiar de skill. */
function NewSession(props: {
  card: Card
  cards: Card[]
  sessions: SessionMeta[]
  models: Model[]
  draft?: Draft
  onDraft(draft: Draft): void
  onNuevoEstilo(): void
  onPick(c: Card): void
  /** `todos`: los videos de un lote, que nacen varios a la vez. */
  onCreated(id: string, todos?: string[]): void
}) {
  const { card, models } = props
  // El nombre y la descripción del estilo elegido entran al cambiarlo, en los temas con movimiento.
  const cabecera = useRef<HTMLDivElement>(null)
  useEntradaEstilo(cabecera, card.id)
  // El modelo: «Optimizado» usa lo medido para esta card (el hilo y cada subagente) o, sin medir, lo último que elegiste
  // a mano; «Avanzado», lo que elegiste para ella.
  const [avanzados, setAvanzados] = useStored<Record<string, Avanzado>>('modelos', {})
  // Sin Claude, lo medido no podría empezar: sin elección tuya, la card va en «Avanzado» con ChatGPT, con OpenCode o con
  // el primer modelo del agente que tengas.
  const sinClaude = useSinClaude(models)
  const avanzado = avanzados[card.id] ?? (sinClaude === 'codex' ? CON_CHATGPT : sinClaude === 'opencode' ? conOpenCode(models) : sinClaude ? conPrimero(models, sinClaude) : undefined)
  const { choice, tareas } = useMemo(() => elegirModelos(card.modelos, models, avanzado, lastChoice(models)), [card.modelos, models, avanzado])
  function cambiarModelos(a: Avanzado | undefined) {
    const { [card.id]: _, ...resto } = avanzados
    setAvanzados(a ? { ...resto, [card.id]: a } : resto)
    // Cambiar el modelo del hilo en «Avanzado» es elegirlo a mano; pasar a «Avanzado» o cambiar un subagente, no.
    if (a?.principal && avanzado && a.principal !== avanzado.principal) elegidoAMano(a.principal)
  }
  const [borrando, setBorrando] = useState<Card | null>(null)
  const [compartiendo, setCompartiendo] = useState<Card | null>(null) // estilos compartidos
  // Duplicar no pregunta: la copia no rompe nada y se quita con ✕. Si falla, se dice junto a las skills.
  const [fallo, setFallo] = useState('')
  async function duplicar(c: Card) {
    setFallo('')
    try {
      const { id } = await api<{ id: string }>(`/api/cards/${c.id}/duplicate`, {})
      props.onPick({ ...c, id })
    } catch (e) {
      setFallo(`No se pudo duplicar «${c.title}»: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // Al elegir un estilo de video, sus videos ocupan el sitio de las cards hasta volver a «Todos los estilos». El aviso de
  // redes de la barra lateral los abre con `#/new/<card>/videos`.
  const [enEstilo, setEnEstilo] = useState(() => location.hash.endsWith('/videos'))
  useEffect(() => {
    const ver = () => location.hash.endsWith('/videos') && setEnEstilo(true)
    addEventListener('hashchange', ver)
    return () => removeEventListener('hashchange', ver)
  }, []) // redes
  const hilos = props.sessions.filter((s) => s.cardId === card.id).sort((a, b) => b.createdAt - a.createdAt)
  const videos = useTerminados(enEstilo && card.etapas ? card : null, hilos)
  const publicar = usePublicar(enEstilo && card.etapas ? card : null, videos) // redes
  // El video de una carpeta de fuera, sin hilo que abrir, se ve en grande.
  const [viendo, setViendo] = useState<string | null>(null)
  // Con dos enlaces o más, la card que hace lotes ofrece un video por enlace. Hay que elegirlo: dos enlaces también pueden
  // ser las fuentes de un solo video. La card recuerda la última elección, para quien hace lotes siempre.
  const enlaces = enlacesDe(props.draft?.text ?? '')
  const [porEnlace, setPorEnlace] = useStored<Record<string, boolean>>('porEnlace', {})
  // Una serie (`skills/video-base/series/` o de la skill): sin escribir nada, el agente elige el tema y hace el video.
  const series = useSeries(card)
  const [serie, setSerie] = useState('')
  useEffect(() => setSerie(''), [card.id])
  const laSerie = series.find((s) => s.id === serie)
  // La marca (una por canal, en la carpeta de trabajo de la card): el selector sale con dos o más. Sin elegir, la de
  // siempre; se elige en cada video, nada se queda «activo».
  const marcas = useMarcas(card)
  const [marca, setMarca] = useState('')
  useEffect(() => setMarca(''), [card.id])
  const conMarcas = (marcas.base !== undefined ? 1 : 0) + marcas.otras.length > 1
  const laMarca = conMarcas && marcas.otras.includes(marca) ? marca : ''
  const lote = !!card.lote && enlaces.length > 1 && !!porEnlace[card.id]
  // Todo estilo de video hace los dos formatos (skills/video-base/FORMATO.md): la skill hace solo el elegido. La card
  // recuerda el último; una idea de YouTube ya lo trae escrito en el mensaje (`Formato: horizontal`), y ese manda.
  const [formatos, setFormatos] = useStored<Record<string, 'vertical' | 'horizontal'>>('formato', {})
  const formatoEscrito = /^Formato: (vertical|horizontal)\s*$/m.exec(props.draft?.text ?? '')?.[1] as 'vertical' | 'horizontal' | undefined
  const formato = formatoEscrito ?? formatos[card.id] ?? 'vertical'
  const conFormato = !!card.etapas
  // La voz: mandarla tú o que el agente la genere en AI Studio, Fish Audio o ElevenLabs (`Voz.tsx`). La card recuerda
  // la última; sin la cuenta o la llave de esa voz, la mandas tú.
  const voz = useVoz()
  const [voces, setVoces] = useStored<Record<string, string>>('voz', {})
  const vozElegida = vozPosible(voz.estado, voces[card.id] ?? '') ? voces[card.id] : ''
  // La música de fondo, en el menú «Voz» de los estilos que la saben poner (`card.musica`): apagada hasta que la
  // enciendas, y la card recuerda la última elección.
  const [musicas, setMusicas] = useStored<Record<string, boolean>>('musica', {})
  const musica = !!card.musica && !!musicas[card.id]
  // Las imágenes: con ChatGPT o con un modelo de Google Flow (`Flow.tsx`), según lo que tengas conectado.
  const hayChatGPT = useChatGPT()
  const [imagenes, setImagenes] = useStored<string>('imagenes', '')
  const flow = useFlow()
  const imagenElegida = imagenPosible(imagenes, { chatgpt: hayChatGPT, google: !!voz.estado?.cuenta || !!flow.estado?.cuentas.length })
  // Los clips de los estilos que los hacen en Flow: el último modelo elegido, o Veo 3.1 - Lite.
  const [clips, setClips] = useStored<string>('clips', '')
  const clipsElegidos = OPCIONES_CLIPS[clips] ? clips : MODELOS_VIDEO[0]
  // Un archivo o un enlace soltado en cualquier parte del inicio va al mensaje.
  const soltar = useSoltar()

  // Sin la cuenta del agente conectada, el video no podría empezar: el aviso de encima lo dice y no se manda.
  const [sinCuenta, setSinCuenta] = useState<boolean>()

  // Lo que hacen los carteles, siempre las mismas funciones (van memorizados) y con lo de ahora.
  const alCartel = useRef<AccionesCartel>(null as never)
  alCartel.current = {
    // Sin videos terminados (sin previa) solo se elige: su galería saldría vacía.
    elegir: (c) => (props.onPick(c), setEnEstilo(false)),
    duplicar: (c) => void duplicar(c),
    borrar: setBorrando,
    compartir: setCompartiendo
  }
  const accionesCartel = useMemo<AccionesCartel>(
    () => ({ elegir: (c) => alCartel.current.elegir(c), duplicar: (c) => alCartel.current.duplicar(c), borrar: (c) => alCartel.current.borrar(c), compartir: (c) => alCartel.current.compartir(c) }),
    []
  )

  const opcionesBarra = useMemo(() => props.cards.map((c) => ({ id: c.id, titulo: c.title, skill: c.skill, icono: c.icon, detalle: c.description })), [props.cards])
  const composer = (
      <Composer
        models={models}
        choice={choice}
        autoFocus
        draft={props.draft}
        onDraft={props.onDraft}
        bloqueo={sinCuenta ? 'Primero conecta tu cuenta (arriba)' : undefined}
        placeholder={card.id === NUEVO_ESTILO ? 'Describe el estilo de video que quieres crear o adjunta referencias…'
          : card.skill ? `Qué quieres de ${card.title}… o escribe / para cambiar de estilo` : 'Qué cambio quieres en Sloth…'}
        estilos={opcionesBarra}
        onEstilo={(id) => {
          const c = props.cards.find((x) => x.id === id)
          if (c) props.onPick(c)
        }}
        afinar={card.skill ? { para: card.title, pedir: (texto, c) => api<Afinado>('/api/afinar', { card: card.id, texto, model: c.model, marca: laMarca || undefined }) } : undefined}
        modelos={<Modelos conf={card.modelos} models={models} avanzado={avanzado} choice={choice} tareas={tareas} sinClaude={sinClaude} onAvanzado={cambiarModelos} />}
        extra={
          <>
            {series.length > 0 && (
              <Picker
                label={laSerie ? laSerie.nombre : 'Tema libre'}
                value={serie}
                groups={[
                  { label: 'Tú eliges el tema', options: [{ value: '', label: 'Tema libre' }] },
                  { label: 'Tema automático si dejas el mensaje vacío', options: series.map((s) => ({ value: s.id, label: s.nombre })) }
                ]}
                onChange={setSerie}
              />
            )}
            {conMarcas && (
              <Picker
                label={`Marca: ${laMarca || (marcas.base !== undefined ? 'la de siempre' : 'sin elegir')}`}
                value={laMarca}
                groups={[
                  {
                    label: 'El tono, el nicho y el cierre del canal',
                    options: [
                      { value: '', label: marcas.base === undefined ? 'Sin elegir' : marcas.base ? `La de siempre (${marcas.base})` : 'La de siempre' },
                      ...marcas.otras.map((m) => ({ value: m, label: m }))
                    ]
                  }
                ]}
                onChange={setMarca}
              />
            )}
            {conFormato && (
              <div className="formato-con-ayuda">
                <Segmento
                  dispositivo
                  label="Formato"
                  valor={formato}
                  opciones={[
                    { id: 'vertical', texto: 'Vertical', title: formatoEscrito ? 'Lo trae la idea' : '1080x1920, para TikTok', disabled: !!formatoEscrito },
                    { id: 'horizontal', texto: 'Horizontal', title: formatoEscrito ? 'Lo trae la idea' : '1920x1080, para YouTube', disabled: !!formatoEscrito }
                  ]}
                  onCambio={(f) => setFormatos({ ...formatos, [card.id]: f })}
                />
                <AyudaCrearVideo clips={!!card.clips} />
              </div>
            )}
            {conFormato && (
              <SelectorVoz
                card={card}
                voz={voz}
                valor={vozElegida}
                musica={{ encendida: musica, onCambio: (m) => setMusicas({ ...musicas, [card.id]: m }) }}
                onCambio={(v) => setVoces({ ...voces, [card.id]: v })}
              />
            )}
            {conFormato && <SelectorImagenes valor={imagenElegida} hayChatGPT={hayChatGPT} voz={voz} flow={flow} onCambio={setImagenes} />}
            {conFormato && card.clips && <SelectorClips valor={clipsElegidos} onCambio={setClips} />}
            {card.lote && enlaces.length > 1 && (
              <Segmento
                label="Lote"
                valor={lote ? 'varios' : 'uno'}
                opciones={[
                  { id: 'uno', texto: '1 video', title: 'Un solo hilo: los enlaces son las fuentes de un mismo video' },
                  {
                    id: 'varios',
                    texto: `${enlaces.length} videos`,
                    title: `Se crean ${enlaces.length} hilos, uno por enlace, cada uno con su carpeta. Arrancan solos, tantos a la vez como aguante la máquina`
                  }
                ]}
                onCambio={(n) => setPorEnlace({ ...porEnlace, [card.id]: n === 'varios' })}
              />
            )}
          </>
        }
        vacio={!!laSerie}
        onSend={async (text, choice, images) => {
          const enlaces = enlacesDe(text)
          const porEnlace = lote && enlaces.length > 1
          localStorage.setItem('card', card.id)
          // Cada video lleva lo que escribiste sin los enlaces: el suyo se lo pone el servidor, con su carpeta.
          if (porEnlace) text = enlaces.reduce((t, e) => t.replaceAll(e, ''), text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
          // La skill lo lee en el mensaje, debajo de lo que escribió el usuario.
          const pide = [
            laSerie && `Serie: ${laSerie.nombre} (${laSerie.archivo}; cómo se usa, en video-base/SERIES.md)${text ? '' : '. Elige tú el tema.'}`,
            laMarca && `Marca: ${laMarca}`,
            conFormato && !formatoEscrito && `Formato: ${formato}`,
            conFormato && lineaVoz(card, vozElegida, nombreDeVoz(voz.estado, vozElegida)),
            conFormato && lineaMusica(card, musica),
            conFormato && lineaImagenes(imagenElegida),
            conFormato && card.clips && lineaClips(clipsElegidos),
            // El modelo de cada subagente: lo medido, o lo que elegiste en «Avanzado». La skill lo lee aquí.
            lineaSubagentes(tareas)
          ]
          text = [text, ...pide].filter(Boolean).join('\n\n')
          if (porEnlace) {
            const metas = await api<SessionMeta[]>('/api/lotes', { cardId: card.id, text, enlaces, images, ...choice })
            return props.onCreated(metas[0].id, metas.map((m) => m.id))
          }
          const meta = await api<SessionMeta>('/api/sessions', { cardId: card.id, text, images, ...choice })
          props.onCreated(meta.id)
        }}
      />
  )

  return (
    <div className={`new-session fondo-ramas${enEstilo && card.etapas ? ' viendo-estilo' : ''}`} {...soltar.props}>
      <CampoAscii variante="ramas" />
      {soltar.aviso}
      {/* Arriba las skills (o, con un estilo elegido, sus videos), que hacen scroll solas; abajo la skill elegida y el
          compositor, que no se mueven de su sitio. */}
      <div className="new-top">
        {enEstilo && card.etapas ? (
          <div className="estilo">
            <header className="estilo-galeria-cabecera">
              <button className="estilo-volver" onClick={() => setEnEstilo(false)}>
                <Icono de="izquierda" /> Todos los estilos
              </button>
              <span>Videos de {card.title}</span>
            </header>
            {!!videos?.length && publicar.barra}
            {videos && <YoutubeLote videos={videos} cardId={card.id} />}
            <CalendarioYoutube />
            {!videos ? null : videos.length ? (
              <Rejilla videos={videos}>{(v) => <VideoDe key={v.src} video={v} onVer={() => setViendo(v.src)} insignia={publicar.insignia(v.ruta)} />}</Rejilla>
            ) : (
              <div className="estilo-galeria-vacia">
                <Icono de="video" />
                <strong>Tu primer video empieza aquí</strong>
                <p>Escribe una idea abajo. Los videos terminados de {card.title} aparecerán en esta galería.</p>
              </div>
            )}
            {viendo && (
              <div className="lightbox" onClick={() => setViendo(null)}>
                <video src={viendo} controls autoPlay onClick={(e) => e.stopPropagation()} />
              </div>
            )}
          </div>
        ) : (
          <section className="estante">
            <header>
              <h2>Estilos</h2>
              {props.cards.some((c) => c.id === NUEVO_ESTILO) && card.id !== NUEVO_ESTILO && (
                <button type="button" className="estilo-importar" onClick={props.onNuevoEstilo}>
                  <Icono de="mas" className="icon-trazo" /> Nuevo estilo
                </button>
              )}
              <ImportarEstilo /> {/* estilos compartidos */}
            </header>
            {fallo && <p className="bad small">{fallo}</p>}
            {/* Cada skill es un cartel: su último video si lo tiene y, si no, su icono y qué hace. Abajo, cuánto se usa. */}
            <Carteles cards={props.cards} activa={card.id} sessions={props.sessions} acciones={accionesCartel} />
          </section>
        )}
      </div>
      <div className="new-bottom">
        {/* En una línea el icono, el nombre y la versión: le deja el alto a los carteles. */}
        <div ref={cabecera} className="new-head superficie-ascii">
          <CampoAscii variante="orbita" />
          <div className="new-head-fila">
          <h1>
            <span className="card-icon big" aria-hidden>
              <Icon icon={card.icon ?? '✦'} />
            </span>
            {card.title}{' '}
            {card.version && (
              <span className="estilo-version" title={`Versión ${card.version} de este estilo`}>
                v{card.version}
              </span>
            )}
          </h1>
          {card.tuya && (
            <button className="compartir-boton" onClick={() => setCompartiendo(card)}>
              <Icono de="compartir" className="icon-trazo" /> Compartir en la comunidad
            </button>
          )}
          </div>
          <p>{card.description}</p>
          {!enEstilo && !!videos?.length && <button className="estilo-ver-videos" onClick={() => setEnEstilo(true)}>
            <Icono de="video" /> Ver videos de este estilo ({videos.length})
          </button>}
          {card.guia && <GuiaVista key={card.id} guia={card.guia} plegada={!card.origen} onEjemplo={() => abrirBorrador(card.id, card.guia!.ejemplo)} />}
          <TusCambios card={card} clave={hilos.map((s) => s.id + s.updatedAt).join()} />
        </div>
        {/* Hasta saber qué cuentas hay no sale: el aviso de Claude no se asoma a quien solo tiene ChatGPT u OpenCode. */}
        {sinClaude !== undefined && <CuentaClaude model={choice?.model} onFalta={setSinCuenta} aAgentes />}
        {composer}
        <TarjetasEnlaces enlaces={enlaces} />
      </div>
      {compartiendo && <CompartirEstilo card={compartiendo} onCerrar={() => setCompartiendo(null)} />}
      {borrando && (
        <Confirm
          title={`¿Eliminar «${borrando.title}»?`}
          action="Eliminar"
          danger
          onClose={() => setBorrando(null)}
          onConfirm={() => api(`/api/cards/${borrando.id}/delete`, {})}
        >
          {borrando.tuya ? (
            <>
              Se quitan tu estilo y su skill{borrando.skill && <> <code>/{borrando.skill}</code></>}, que se guarda en una copia por si te arrepientes. Los hilos y los
              videos que hiciste con él se quedan.
            </>
          ) : (
            <>
              Se quita de las cards.{borrando.skill ? <> La skill <code>/{borrando.skill}</code> sigue instalada</> : ' Su carpeta de trabajo sigue ahí'} y los hilos
              que hiciste con ella se quedan.
            </>
          )}
        </Confirm>
      )}
    </div>
  )
}

type AccionesCartel = { elegir(c: Card): void; duplicar(c: Card): void; borrar(c: Card): void; compartir(c: Card): void }

/**
 * Las skills del inicio, cada una un cartel. Memorizadas: escribir en el compositor de abajo no las vuelve a dibujar (ni a
 * sus videos de fondo).
 */
const Carteles = memo(function Carteles({ cards, activa, sessions, acciones }: { cards: Card[]; activa: string; sessions: SessionMeta[]; acciones: AccionesCartel }) {
  const inicioArrastre = useRef<number | null>(null)
  const arrastrado = useRef(false)
  const [mirando, setMirando] = useState('')
  const [previas, setPrevias] = useState<Record<string, Previa>>({})
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(espera.current), [])
  const dejar = () => { clearTimeout(espera.current); setMirando('') }
  useEffect(() => {
    if (!mirando || previas[mirando]) return
    let vivo = true
    api<Previa | null>(`/api/previas?card=${encodeURIComponent(mirando)}`).then((p) => {
      if (vivo && p) setPrevias((anteriores) => ({ ...anteriores, [mirando]: p }))
    }, () => {})
    return () => { vivo = false }
  }, [mirando, previas])
  const indice = Math.max(0, cards.findIndex((c) => c.id === activa))
  const desplazar = (direccion: number) => {
    if (cards.length > 1) acciones.elegir(cards[(indice + direccion + cards.length) % cards.length])
  }
  return (
    <div className="estilos-carrusel" role="region" aria-label="Carrusel de estilos" aria-roledescription="carrusel">
      <div className="estilos-carrusel-controles">
        <span className="carrusel-posicion" aria-live="polite">{cards.length ? indice + 1 : 0} / {cards.length}</span>
        <button className="boton" aria-label="Estilo anterior" disabled={cards.length < 2} onClick={() => desplazar(-1)}><Icono de="izquierda" /></button>
        <button className="boton" aria-label="Estilo siguiente" disabled={cards.length < 2} onClick={() => desplazar(1)}><span className="carrusel-siguiente"><Icono de="izquierda" /></span></button>
      </div>
    <div className="cards cards-carrusel"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          desplazar(e.key === 'ArrowRight' ? 1 : -1)
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        inicioArrastre.current = e.clientX
        arrastrado.current = false
      }}
      onPointerUp={(e) => {
        if (inicioArrastre.current === null) return
        const distancia = e.clientX - inicioArrastre.current
        inicioArrastre.current = null
        if (Math.abs(distancia) > 40) {
          arrastrado.current = true
          desplazar(distancia < 0 ? 1 : -1)
        }
      }}
      onPointerLeave={() => { inicioArrastre.current = null }}
      onPointerCancel={() => { inicioArrastre.current = null }}
      onClickCapture={(e) => {
        if (arrastrado.current) {
          e.preventDefault()
          e.stopPropagation()
          arrastrado.current = false
        }
      }}
    >
      {cards.map((c, i) => {
        let distancia = (i - indice + cards.length) % cards.length
        if (distancia > cards.length / 2) distancia -= cards.length
        const profundidad = Math.abs(distancia)
        const muestra = c.cambio?.comparacion?.ahora
        const previa = previas[c.id] ?? (muestra?.video && muestra.portada ? { video: muestra.video, cuadro: muestra.portada } : undefined)
        return (
        <button
          key={c.id}
          className={`card ${c.id === activa ? 'active' : ''}`}
          style={{
            transform: `translateX(calc(-50% + ${distancia} * var(--paso-carrusel))) translateY(${Math.min(profundidad, 3) * 13}px) translateZ(${-Math.min(profundidad, 3) * 90}px) rotateY(${-Math.sign(distancia) * 23}deg) scale(${1 - Math.min(profundidad, 3) * .09})`,
            zIndex: cards.length - profundidad,
            opacity: profundidad > 2 ? 0 : 1 - profundidad * .22,
            visibility: profundidad > 2 ? 'hidden' : 'visible',
            pointerEvents: profundidad > 2 ? 'none' : undefined,
          }}
          onClick={() => acciones.elegir(c)}
          title={c.description}
          aria-pressed={c.id === activa}
          tabIndex={c.id === activa ? 0 : -1}
          onPointerEnter={(e) => {
            if (!c.etapas || e.pointerType === 'touch' || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return
            clearTimeout(espera.current)
            espera.current = setTimeout(() => setMirando(c.id), 380)
          }}
          onPointerLeave={dejar}
        >
          {profundidad <= 2 && (previa ? (
            mirando === c.id
              ? <video className="card-previa" src={previa.video} poster={previa.cuadro} muted loop playsInline autoPlay />
              : <img className="card-previa" src={previa.cuadro} alt="" decoding="async" />
          ) : (
            <>
              <CampoAscii variante={c.icon === 'cubo' || c.icon === 'claqueta' ? 'malla' : c.icon === 'globo' || c.icon === 'risa' ? 'orbita' : 'onda'} />
              <span className="card-fondo">
                <span className="card-icon"><Icon icon={c.icon ?? '✦'} /></span>
                <span className="card-desc">{c.description}</span>
              </span>
            </>
          ))}
          {c.version && <span className="card-version" title={`Versión ${c.version} de este estilo`}>v{c.version}</span>}
          {/* En la app que se vende, las cards de Sloth ni se duplican ni se borran; las de tus estilos se borran. */}
          {c.id !== NUEVO_ESTILO && (!VENTA || c.tuya) && (
            <span className="card-actions">
              {!VENTA && (
                <span
                  role="button"
                  className="duplicar"
                  title={`Duplicar: sale una card nueva con la misma skill${c.skill ? ` /${c.skill}` : ''}, que puedes cambiar a tu gusto en cards.json`}
                  onClick={(e) => (e.stopPropagation(), acciones.duplicar(c))}
                >
                  ⧉
                </span>
              )}
              {c.tuya && (
                <span role="button" className="compartir" title="Compartir: en la comunidad o como archivo" onClick={(e) => (e.stopPropagation(), acciones.compartir(c))}>
                  <Icono de="compartir" className="icon-trazo" />
                </span>
              )}
              <span role="button" className="danger" title="Eliminar" onClick={(e) => (e.stopPropagation(), acciones.borrar(c))}>
                ✕
              </span>
            </span>
          )}
          <span className="card-pie">
            <span className="card-title">
              {c.bloqueada && <Icono de="candadoCerrado" className="icon-trazo card-candado" />}
              {c.title}
            </span>
            <Uso hilos={sessions.filter((s) => s.cardId === c.id && !s.archived)} />
          </span>
        </button>
      )})}
    </div>
    </div>
  )
})

/** Cuánto se usa una skill: los hilos que trabajan ahora, que es lo que más importa, o cuántos hay y cuándo fue el último. */
function Uso({ hilos }: { hilos: SessionMeta[] }) {
  const trabajando = hilos.filter((s) => s.running).length
  if (trabajando) return <span className="card-uso vivo">● {trabajando} trabajando</span>
  if (!hilos.length) return null
  return (
    <span className="card-uso">
      {hilos.length === 1 ? '1 hilo' : `${hilos.length} hilos`} · {hace(Math.max(...hilos.map((s) => s.updatedAt)))}
    </span>
  )
}

function hace(t: number) {
  const min = (Date.now() - t) / 60000
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${Math.round(min)} min`
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`
  const dias = Math.round(min / 60 / 24)
  return dias === 1 ? 'ayer' : `hace ${dias} días`
}

/**
 * Los videos terminados de un estilo, de sus hilos y de las carpetas de fuera que nombra la card. Se vuelven a pedir cuando
 * avanza uno de sus hilos. `null` mientras se mira.
 */
function useTerminados(card: Card | null, hilos: SessionMeta[]) {
  const [videos, setVideos] = useState<VideoHecho[] | null>(null)
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    const refrescar = () => setVuelta((n) => n + 1)
    addEventListener('sloth-videos', refrescar)
    return () => removeEventListener('sloth-videos', refrescar)
  }, [])
  // Al cambiar de estilo se vacía; si solo avanzó un hilo, se ve lo de antes mientras se vuelve a mirar.
  useEffect(() => setVideos(null), [card?.id])
  const clave = hilos.map((s) => s.id + s.updatedAt).join()
  useEffect(() => {
    if (!card) return
    let vivo = true
    api<VideoHecho[]>(`/api/cards/${card.id}/videos`).then((v) => vivo && setVideos(v), () => vivo && setVideos([]))
    return () => {
      vivo = false
    }
  }, [card?.id, clave, vuelta])
  return videos
}

/** Las series de la skill de una card (`GET /api/cards/<id>/series`). Si falla, no hay ninguna y no sale el selector. */
function useSeries(card: Card) {
  return useRecordado<Serie[]>(`series:${card.id}`, [], () => (card.skill ? api<Serie[]>(`/api/cards/${card.id}/series`) : Promise.resolve([])), [card.id])
}

/** Las marcas de la carpeta de trabajo de una card (`GET /api/cards/<id>/marcas`). Si falla, ninguna. */
function useMarcas(card: Card) {
  return useRecordado<Marcas>(`marcas:${card.id}`, { otras: [] }, () => (card.etapas ? api<Marcas>(`/api/cards/${card.id}/marcas`) : Promise.resolve({ otras: [] })), [card.id])
}


/**
 * Un hilo abierto. No lee sus eventos: los lee el chat (y el estudio), que es lo único que cambia con cada trozo del
 * agente. Aquí solo llega su resumen (`useResumen`), que cambia al acabar un turno o al medir el contexto.
 */
const SessionView = memo(function SessionView({ id, session, card, models }: { id: string; session?: SessionMeta; card?: Card; models: Model[] }) {
  // El subagente abierto en el chat, del hilo donde lo abriste. Mientras se ve, su barra va en el sitio del compositor.
  const [abierto, setAbierto] = useState<{ sesion: string; id: string } | null>(null)
  const onSubagente = useCallback((sub: string | null) => setAbierto(sub ? { sesion: id, id: sub } : null), [id])
  const fallo = useFallo(id)
  // El tiempo es lo que el agente pasó trabajando: la suma de cada turno, no lo que lleva abierta la sesión. Un turno sin
  // costo (se cortó antes de saberlo, o fue el primero tras retomar el hilo) no suma: el total es entonces lo
  // menos que costó.
  const totals = useResumen(id)
  // Un video del lote que espera su turno arranca con su propio mensaje: un clic no le manda otro.
  const pendiente = !!session?.pendiente
  // El chat de una imagen del estudio solo se lee: se edita desde su editor.
  const deImagen = !!session?.imagenEstudio
  const onResponder = useMemo(() => (pendiente || deImagen ? undefined : (text: string, images?: string[]) => api(`/api/sessions/${id}/send`, { text, images })), [id, pendiente, deImagen])
  // Con quién puede seguir el hilo si su agente llega al límite: el primer modelo de cada otro agente conectado.
  const actual = proveedorDe(session?.model ?? '')
  const relevos = useMemo(() => PROVEEDORES.filter((p) => p !== actual).flatMap((p) => (p === 'opencode' ? conOpenCode(models) : conPrimero(models, p))?.principal ?? []), [models, actual])
  const navegador = useNavegadorAbierto(id)
  if (!session) return <div className="empty">{fallo ? `No se pudo abrir este hilo: ${fallo}` : 'Cargando…'}</div>
  const subagente = abierto?.sesion === session.id ? abierto.id : undefined
  const trabaja = session.running || !!session.background?.length
  const head = (extra?: ReactNode) => (
    <header className="session-head">
      <span className="session-icon"><Icon icon={deImagen ? 'imagen' : (card?.icon ?? '•')} /></span>
      <NombreDelHilo key={session.id} session={session} />
      <span className="spacer" />
      {totals.ms > 0 && <span className="muted small">{duration(totals.ms)}</span>}
      {(totals.cost > 0 || totals.sinCosto > 0) && (
        <span className="muted small" title={totals.sinCosto ? `Sin contar ${totals.sinCosto === 1 ? 'un turno' : `${totals.sinCosto} turnos`} sin costo: se cortaron antes de saberlo, fueron el primero tras retomar el hilo o su modelo de Codex no tenía precio` : undefined}>
          {totals.sinCosto ? '≥ ' : ''}${totals.cost.toFixed(2)}
        </span>
      )}
      {totals.flowCreditos > 0 && (
        <span className="muted small" title={`${totals.flowVideos} ${totals.flowVideos === 1 ? 'video' : 'videos'} de Google Flow en este chat`}>
          {totals.flowCreditos} créditos de Flow
        </span>
      )}
      {totals.read > 0 && <span className="muted small">{compact(totals.read)} tokens leídos</span>}
      {totals.out > 0 && <span className="muted small">{compact(totals.out)} tokens escritos</span>}
      {/* El símbolo del agente del hilo: pide una mejora sobre él. Solo el símbolo: el encabezado de un video va justo. */}
      <button className="pedir-mejora solo" title={`Pedir una mejora: ¿algo no salió como esperabas? ${NOMBRE_AGENTE[proveedorDe(session.model)]} te ayuda a decirlo`} aria-label="Pedir una mejora" onClick={() => pedirMejora({ hilo: session.id })}>
        <MarcaAgente de={proveedorDe(session.model)} />
      </button>
      {extra}
      {session.modelo3d && <a className="boton small" href={rutaEditor3D(session.modelo3d.editando ?? session.modelo3d.resultado)}>Editor 3D</a>}
      {!deImagen && !session.modelo3d && card?.id !== MODELO3D_CARD.id && <BotonNavegador hilo={session.id} trabajando={trabaja} />}
    </header>
  )
  const chat = () => (
    <>
      <Timeline
        key={`timeline:${session.id}`}
        running={session.running}
        background={session.background ?? SIN_TAREAS}
        sessionId={session.id}
        proveedor={proveedorDe(session.model)}
        subagente={subagente}
        onSubagente={onSubagente}
        onResponder={onResponder}
        relevos={relevos}
      />
      {/* Oculto y no quitado: guarda lo que escribías, y una cita del subagente le llega. */}
      <div className="session-composer" hidden={!!subagente}>
        {deImagen && session.imagenEstudio && (
          <p className="muted small historial-imagen-aviso">
            Este chat es de una imagen: <a href={rutaEditorImagen(session.imagenEstudio)}>ábrela en el editor</a> para pedirle otro cambio.
          </p>
        )}
        {session.pendiente && (
          <div className="queue">
            <div className="queued">
              <span className="muted small">{session.lote?.pausa ? 'Lote en pausa' : 'En espera'}</span>
              <span className="queued-text" title={session.lote?.pausa}>
                {session.lote?.pausa ?? (session.lote ? `Video ${session.lote.n} de ${session.lote.de}: empieza solo cuando haya sitio en la máquina.` : 'En la cola: empieza solo cuando acabe uno de los videos que trabajan.')}
              </span>
              {session.lote?.pausa && (
                <Pedir ruta={`/api/lotes/${session.lote.id}/seguir`} title="Los que esperan vuelven a arrancar cuando haya sitio">
                  Seguir con el lote
                </Pedir>
              )}
              <Pedir ruta={`/api/sessions/${session.id}/empezar`} title="Que este empiece ya, sin esperar su turno">
                Empezar ya
              </Pedir>
            </div>
          </div>
        )}
        {/* Lo elegido en el video (un elemento, una escena, un tramo): el mensaje lo lleva delante. */}
        {esDeEstudio(card) && <ReferenciaVideo sessionId={session.id} />}
        {/* El hilo de un estilo de la comunidad que se cerró se sigue viendo, pero no sigue trabajando. */}
        {deImagen ? null : card?.bloqueada ? <SinApoyo titulo={card.title} /> : <Composer
          key={`composer:${session.id}`}
          models={models}
          initial={{ model: session.model, effort: session.effort }}
          running={session.running}
          background={!!session.background?.length}
          lockModel={!!session.background?.length}
          context={totals.context}
          flow={{ videos: totals.flowVideos, creditos: totals.flowCreditos }}
          gasto={totals}
          onCompactar={() => api(`/api/sessions/${session.id}/compactar`, {})}
          placeholder="Responde, pide un cambio, pega una imagen o suelta un archivo…"
          draft={leerRespuesta(session.id)}
          onDraft={(d) => guardarRespuesta(session.id, d)}
          onChoice={(c) => api(`/api/sessions/${session.id}/model`, c).then(() => elegidoAMano(c))}
          onStop={() => api(`/api/sessions/${session.id}/stop`, {})}
          onSend={(text, _choice, images) => api(`/api/sessions/${session.id}/send`, { text: conReferencia(session.id, text), images })}
        />}
      </div>
    </>
  )
  // Un estilo de video se ve en el estudio, siempre con el mismo marco.
  if (esDeEstudio(card)) return <Estudio key={session.id} session={session} card={card!} head={head} chat={chat} /> // panel de etapas
  // Lo que deja un hilo de Ideas se ve en la sección, en la carpeta de su canal (su `cwd`).
  const canal = card?.id === IDEAS_CARD.id || card?.id === CANAL_CARD.id ? session.cwd.split(/[\\/]/).filter(Boolean).pop() : undefined // ideas
  return (
    <div className={deImagen ? 'session historial-imagen' : 'session'}>
      {head(
        canal && (
          <button className="ghost small" onClick={() => go({ kind: 'redes', apartado: 'ideas', canalId: canal })}>
            Ver en Ideas
          </button>
        )
      )}
      {/* El chat no cambia de sitio al abrir el navegador: no se vuelve a montar. */}
      <div className="session-cuerpo">
        <div className="session-chat">{chat()}</div>
        {navegador && !deImagen && <PanelNavegador hilo={session.id} trabajando={trabaja} />}
      </div>
    </div>
  )
})

const SIN_TAREAS: string[] = []

/**
 * El clic derecho sobre un hilo. «Copiar referencia» copia la ruta de su historial: pegada en otro hilo, el agente la
 * lee y tiene el contexto, trabaje donde trabaje. «Renombrar» lo renombra en su fila, como el doble clic.
 */
function SessionMenu({ session, x, y, app, proyectos, onClose, onSelect, onDeleted, onRename }: { session: SessionMeta; x: number; y: number; app: string; proyectos: string[]; onClose(): void; onSelect(): void; onDeleted(id: string): void; onRename(): void }) {
  const [error, setError] = useState('')
  const [borrar, setBorrar] = useState(false)
  // «Mover a un proyecto»: el menú cambia a la lista de carpetas.
  const [aCarpeta, setACarpeta] = useState(false)
  const busy = session.running || !!session.background?.length

  useEffect(() => {
    if (borrar) return // el Escape es del modal
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    addEventListener('blur', onClose)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('blur', onClose)
    }
  }, [onClose, borrar])

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Eliminar pregunta con el mismo modal que eliminar varios; el menú se va mientras tanto.
  if (borrar)
    return (
      <BorrarChats hilos={[session]} ocupados={0} onClose={onClose} onDeleted={() => onDeleted(session.id)} />
    )

  return (
    <div className="menu-backdrop" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div className="menu" style={{ left: Math.min(x, innerWidth - 230), top: Math.max(8, Math.min(y, innerHeight - (aCarpeta ? 110 + 34 * proyectos.length : 220))) }} onClick={(e) => e.stopPropagation()}>
        {aCarpeta ? (
          <ElegirProyecto proyectos={proyectos} actual={session.proyecto} onElegir={(p) => run(() => aProyecto([session.id], p))} />
        ) : (
          <>
        <button
          title="Para dárselo como contexto a otro hilo"
          onClick={() => run(() => navigator.clipboard.writeText(threadRef(session.title, session.id, app)))}
        >
          Copiar referencia
        </button>
        <button title="También con doble clic en el hilo" onClick={() => run(async () => onRename())}>
          Renombrar
        </button>
        <button title="Lo junta en una carpeta de la barra lateral" onClick={() => setACarpeta(true)}>
          {session.proyecto ? 'Mover a otro proyecto' : 'Mover a un proyecto'}
        </button>
        <button title="Para archivar o eliminar varios a la vez (también con Ctrl+clic)" onClick={() => run(async () => onSelect())}>
          Seleccionar
        </button>
        <button onClick={() => run(() => api(`/api/sessions/${session.id}/archive`, { archived: !session.archived }))}>{session.archived ? 'Desarchivar' : 'Archivar'}</button>
        <button className="danger" disabled={busy} title={busy ? 'El agente sigue trabajando en este hilo' : undefined} onClick={() => setBorrar(true)}>
          Eliminar
        </button>
          </>
        )}
        {error && <div className="bad small menu-error">{error}</div>}
      </div>
    </div>
  )
}

/**
 * La barra de los hilos seleccionados: copiar sus referencias, archivarlos o eliminarlos de una vez. Archivar los desarchiva si ya lo estaban
 * todos. Los que siguen trabajando no se eliminan.
 */
function SelectBar({ picked, y, app, proyectos, onClose, onDeleted }: { picked: SessionMeta[]; y: number; app: string; proyectos: string[]; onClose(): void; onDeleted(ids: string[]): void }) {
  const [asking, setAsking] = useState(false)
  const [aCarpeta, setACarpeta] = useState(false)
  // Si todos van en la misma carpeta, se ofrece sacarlos de ella.
  const mismo = new Set(picked.map((s) => s.proyecto)).size === 1 ? picked[0]?.proyecto : undefined
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const allArchived = picked.length > 0 && picked.every((s) => s.archived)
  const free = picked.filter((s) => !s.running && !s.background?.length)
  const busy = picked.length - free.length

  useEffect(() => {
    if (asking) return // el Escape es del modal
    // Con la lista de carpetas abierta, Escape solo la cierra.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (aCarpeta ? setACarpeta(false) : onClose())
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [asking, aCarpeta, onClose])

  async function aCarpetaDe(proyecto: string) {
    try {
      await aProyecto(picked.map((s) => s.id), proyecto)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function archive() {
    try {
      await Promise.all(picked.map((s) => api(`/api/sessions/${s.id}/archive`, { archived: !allArchived })))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Copia y deja la selección abierta, por si luego quiere archivarlos.
  async function copyRefs() {
    try {
      await navigator.clipboard.writeText(picked.map((s) => threadRef(s.title, s.id, app)).join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    // Sin pasar de la línea de la cabecera ni del borde de abajo de la ventana.
    <div className="select-bar" style={{ top: Math.min(Math.max(y, 80), innerHeight - 32) }}>
      {error && <span className="bad small select-error">{error}</span>}
      <div className="select-pill">
        <span className="select-count" title="Clic para marcar · Mayús+clic para un tramo">
          {picked.length}
        </span>
        <button disabled={!picked.length} title="Para dárselos como contexto a otro hilo" onClick={copyRefs}>
          {copied ? 'Copiado' : 'Copiar referencias'}
        </button>
        <button disabled={!picked.length} onClick={archive}>
          {allArchived ? 'Desarchivar' : 'Archivar'}
        </button>
        <button disabled={!picked.length} aria-expanded={aCarpeta} title="Los junta en una carpeta de la barra lateral" onClick={() => setACarpeta(!aCarpeta)}>
          A un proyecto
        </button>
        <button className="danger" disabled={!free.length} onClick={() => setAsking(true)}>
          Eliminar
        </button>
        <button className="select-close" title="Dejar de seleccionar (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
      {aCarpeta && (
        <div className="menu select-proyecto">
          <ElegirProyecto proyectos={proyectos} actual={mismo} onElegir={aCarpetaDe} />
        </div>
      )}
      {asking && (
        <BorrarChats
          hilos={free}
          ocupados={busy}
          onClose={() => setAsking(false)}
          onDeleted={(ids) => {
            onDeleted(ids)
            onClose()
          }}
        />
      )}
    </div>
  )
}

/**
 * Eliminar uno o varios hilos, desde su menú o desde la selección de la barra lateral. Si alguno tiene archivos propios (la
 * carpeta de su video, sus imágenes), un segundo botón los borra también (`server/borrar-hilo.ts`); las carpetas que
 * comparte con otro hilo se quedan.
 */
function BorrarChats({ hilos, ocupados, onClose, onDeleted }: { hilos: SessionMeta[]; ocupados: number; onClose(): void; onDeleted(ids: string[]): void }) {
  // Solo se pregunta por los que pueden tener archivos: los de un video o de Imágenes.
  const clave = hilos.map((h) => (h.imagenEstudio || h.carpeta || h.lote || h.carpetasGeneradas?.length ? h.id : '')).join(',')
  const [plan, setPlan] = useState<{ clave: string; tipos: ('video' | 'imagen' | null)[]; error?: string }>()
  useEffect(() => {
    let vigente = true
    if (clave)
      Promise.all(clave.split(',').map((id) => (id ? api<{ tipo: 'video' | 'imagen' | null }>(`/api/sessions/${id}/borrado`) : { tipo: null }))).then(
        (r) => vigente && setPlan({ clave, tipos: r.map((x) => x.tipo) }),
        (e: Error) => vigente && setPlan({ clave, tipos: [], error: e.message }),
      )
    return () => {
      vigente = false
    }
  }, [clave])
  const actual = plan?.clave === clave ? plan : undefined
  const videos = !!actual?.tipos.includes('video')
  const imagenes = !!actual?.tipos.includes('imagen')
  const archivos = videos && imagenes ? 'sus videos e imágenes' : videos ? 'sus videos' : 'sus imágenes'
  const varios = hilos.length > 1

  async function borrar(conArchivos: boolean) {
    const ids: string[] = []
    const errores: string[] = []
    for (const [i, h] of hilos.entries()) {
      try {
        const { aviso } = await api<{ aviso?: string }>(`/api/sessions/${h.id}/${conArchivos && actual?.tipos[i] ? 'borrado' : 'delete'}`, {})
        ids.push(h.id)
        if (aviso) errores.push(aviso)
      } catch (e) {
        errores.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (ids.length) onDeleted(ids)
    if (errores.length) throw new Error([...new Set(errores)].join(' '))
  }

  return (
    <Confirm
      title={varios ? `¿Eliminar ${hilos.length} hilos?` : `¿Eliminar «${hilos[0]?.title}»?`}
      action={videos || imagenes ? (varios ? 'Eliminar solo los hilos' : 'Eliminar solo el hilo') : 'Eliminar'}
      danger
      onClose={onClose}
      onConfirm={() => borrar(false)}
      otraAccion={videos || imagenes ? { etiqueta: `Eliminar también ${archivos}`, ejecutar: () => borrar(true) } : undefined}
    >
      Se borra su historial y no se puede deshacer.{ocupados > 0 && ` ${ocupados === 1 ? 'Uno sigue trabajando y se queda' : `${ocupados} siguen trabajando y se quedan`}.`}
      {actual?.error && <p className="bad">{actual.error}</p>}
      {(videos || imagenes) && <p>Con «Eliminar también», se borran {archivos} y sus archivos de trabajo. Lo que comparte con otro hilo se queda.</p>}
    </Confirm>
  )
}

/**
 * Un botón que le pide algo al servidor. Si falla, lo dice a su lado: antes el clic no hacía nada, y lo típico era que
 * el servidor aún no conociera la ruta («pulsa Reiniciar backend»).
 */
function Pedir({ ruta, title, children }: { ruta: string; title?: string; children: ReactNode }) {
  const [error, setError] = useState('')
  return (
    <>
      <button className="ghost small" title={title} onClick={() => (setError(''), api(ruta, {}).catch((e) => setError(e instanceof Error ? e.message : String(e))))}>
        {children}
      </button>
      {error && <span className="bad small">{error}</span>}
    </>
  )
}

/**
 * Los videos de un lote en la barra lateral: una fila con la card y cuántos van, que se abre en los hilos de cada uno.
 * Si el lote está en pausa, «Seguir» lo reanuda sin abrirlo.
 */
function LoteFila({ videos, card, abierto, onToggle, fila, vista }: { videos: SessionMeta[]; card?: Card; abierto: boolean; onToggle(): void; fila(s: SessionMeta): ReactNode; vista?: Vista }) {
  const trabajan = videos.filter((s) => s.running || !!s.background?.length).length
  const esperan = videos.filter((s) => s.pendiente).length
  const listos = videos.length - trabajan - esperan
  const pausa = videos.find((s) => s.lote?.pausa)?.lote
  const nombre = `Lote de ${videos.length} · ${card?.title}`
  return (
    <div className="lote">
      {/* Un doble clic lo abre o lo cierra una vez, no dos. */}
      <button className={`session-row lote-row ${abierto ? 'abierto' : ''}`} onClick={(e) => e.detail < 2 && onToggle()} title={`${nombre}: ${listos} terminaron o esperan tu respuesta · ${trabajan} trabajando · ${esperan} en espera`}>
        <span className="session-icon"><Icon icon={card?.icon ?? '•'} /></span>
        <TituloDeFila titulo={nombre} vista={vista} />
        {trabajan > 0 && <span className="dot running" />}
        {/* Cuántos son; mientras falten, cuántos van. */}
        <span className="lote-cuenta">{listos < videos.length ? `${listos}/${videos.length}` : videos.length}</span>
      </button>
      {pausa && (
        <div className="lote-pausa small" title={pausa.pausa}>
          <span className="bad">En pausa</span>
          <Pedir ruta={`/api/lotes/${pausa.id}/seguir`}>Seguir</Pedir>
        </div>
      )}
      {abierto && <div className="lote-videos">{videos.map(fila)}</div>}
    </div>
  )
}

/** `Hoy`, `Ayer`, `Esta semana` o `Antes`: la sección de la barra lateral donde cae un hilo. */
function cuando(t: number) {
  const hoy = new Date().setHours(0, 0, 0, 0)
  const dia = 86400000
  return t >= hoy ? 'Hoy' : t >= hoy - dia ? 'Ayer' : t >= hoy - 6 * dia ? 'Esta semana' : 'Antes'
}

/** Para buscar sin que importen mayúsculas ni tildes. */
const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
/** En Mac, Opción+letra escribe (Opción+N, la ñ): el atajo de «Nuevo chat» es Cmd+N. */
const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent)

/**
 * Abajo de la barra lateral: Opciones y Reiniciar backend, que aplica los cambios del servidor. Mientras el servidor
 * vuelve, el botón dice que se está reconectando.
 */
function Pie({ running, connected, enOpciones, fallo, plegada }: { running: boolean; connected: boolean; enOpciones: boolean; fallo: string; plegada: boolean }) {
  const [error, setError] = useState('')
  // «Reconectando…» solo si se perdió una conexión que ya hubo: al abrir, mientras conecta la primera vez, salía y se
  // iba, y movía la barra.
  const yaConecto = useRef(false)
  if (connected) yaConecto.current = true
  return (
    <div className="pie">
      <AvisoRedes connected={connected} /> {/* redes */}
      <AvisoPiloto connected={connected} /> {/* piloto */}
      <button className={enOpciones ? 'on' : ''} aria-current={enOpciones ? 'page' : undefined} title={plegada ? 'Opciones' : undefined} onClick={() => go({ kind: 'opciones' })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </svg>
        Opciones
      </button>
      {/* Reiniciar aplica los cambios del código: en la app que se vende solo llegan con una versión nueva. */}
      {VENTA ? (
        <>
          <ActualizarSloth />
          {!connected && yaConecto.current && <span className="muted small pie-nota">Reconectando…</span>}
        </>
      ) : (
        <button
          className={connected ? '' : 'reconectando'}
          disabled={running || !connected}
          title={running ? 'Espera a que ningún agente esté trabajando' : 'Aplica los cambios del servidor (la interfaz se actualiza sola)'}
          onClick={() => api('/api/restart', {}).catch((e) => setError(e.message))}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.5" />
            <path d="M20 4v4.5h-4.5" />
          </svg>
          {connected ? 'Reiniciar backend' : 'Reconectando…'}
        </button>
      )}
      {(error || fallo) && (
        <span className="bad small" title={plegada ? error || fallo : undefined}>
          {error || fallo}
        </span>
      )}
      <VersionYApoyo corta className="muted small pie-nota" />
    </div>
  )
}
