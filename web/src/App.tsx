import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CANAL_CARD, IDEAS_CARD } from '../../shared/ideas' // ideas
import type { AvanceCorto, Card, CarpetaDeVideo, Model, Previa, Reinicio, Serie, ServerPush, SessionMeta, VersionClaude, VideoHecho } from '../../shared/types'
import { proveedorDe } from '../../shared/providers'
import { VENTA } from '../../shared/venta'
import { Ideas, textoAHtml } from './Ideas' // ideas
import { atrasado, CuentaClaude, Opciones, Requisitos } from './Opciones'
import { api } from './api'
import { eventos, useFallo, useResumen } from './eventos'
import { useDesplazando } from './desplazando'
import { useAvisos } from './avisos'
import { TituloDeFila, useBarraPlegada, vistaDeLote, vistaDeVideo, type Plegado, type Vista } from './Barra'
import { Composer, Icon, Picker, type Choice, type Draft } from './Composer'
import { designChipHtml, DESIGN, LINK, pedirMejora, threadIcons, threadRef } from './etiquetas'
import { Confirm } from './Confirm'
import { ActualizarSloth } from './Actualizar' // versiones nuevas
import { CambiosSloth } from './CambiosSloth'
import { TarjetasEnlaces } from './Enlaces' // tarjeta de los enlaces
import { esDeEstudio, Estudio } from './Estudio' // panel de etapas
import { BotonNavegador, PanelNavegador, useNavegadorAbierto } from './Navegador' // navegador de cada hilo
import { conReferencia, ReferenciaVideo } from './Referencia'
import { useSoltar } from './Soltar'
import { elegirModelos, lineaSubagentes, Modelos, type Avanzado } from './Modelos'
import { MisVideos, Rejilla, VideoDe } from './MisVideos'
import { Modelos3D } from './Modelos3D' // modelos 3D
import { Comunidad } from './Comunidad' // comunidad
import { PedirMejora } from './PedirMejora' // comunidad
import { Icono } from './Iconos'
import { Bienvenida } from './Bienvenida'
import { MarcaClaude } from './Logos'
import { imageUrl } from './Images'
import { YoutubeLote } from './YoutubeProgramar'
import { CalendarioYoutube } from './YoutubeCalendario'
import { opcionesDeCarpetas } from './Etapas' // panel de etapas
import { avisarTanda, AvisoRedes, ConNavegadorRedes, usePublicar } from './Redes' // redes
import { NombreDelHilo, Renombrar } from './Renombrar'
import { Segmento } from './Segmento'
import { Timeline } from './Timeline'
import { compact, duration } from './items'
import './Barra.css'

/** El inicio es siempre un hilo nuevo; sin card en el hash, toma la última que se usó. Un borrador es un inicio a medias. */
type View =
  | { kind: 'new'; cardId?: string }
  | { kind: 'draft'; id: string }
  | { kind: 'session'; id: string }
  | { kind: 'opciones' }
  | { kind: 'ideas'; canalId?: string }
  | { kind: 'videos'; estilo?: string }
  | { kind: 'modelos3d' } // modelos 3D
  | { kind: 'comunidad' } // comunidad

/** Lo que se escribió en un hilo nuevo sin mandarlo. Vive en localStorage hasta que se manda o se borra. */
type Saved = Draft & { cardId: string; at: number }

const filled = (d?: Draft) => !!d && (!!d.text.trim() || !!d.images.length)
/** Cuánto lleva quieto un hilo antes de archivarse solo (ver «Archivado automático» en App). */
const QUIETO = 12 * 3600_000
const newId = () => Math.random().toString(36).slice(2, 10)

/** La vista sale del hash (#/s/<id>, #/d/<id>, #/new/<card>), así sobrevive a las recargas de cuando la app se edita sola. */
function readHash(): View {
  const [, kind, id] = location.hash.split('/')
  if (kind === 's' && id) return { kind: 'session', id }
  if (kind === 'd' && id) return { kind: 'draft', id }
  if (kind === 'opciones') return { kind: 'opciones' }
  if (kind === 'ideas') return { kind: 'ideas', canalId: id || undefined }
  if (kind === 'mis-videos') return { kind: 'videos', estilo: id || undefined }
  if (kind === 'modelos-3d') return { kind: 'modelos3d' } // modelos 3D
  if (kind === 'comunidad' || kind === 'mejoras') return { kind: 'comunidad' } // comunidad (antes, Mejoras)
  return { kind: 'new', cardId: kind === 'new' ? id : undefined }
}

function go(view: View) {
  location.hash =
    view.kind === 'session'
      ? `/s/${view.id}`
      : view.kind === 'draft'
        ? `/d/${view.id}`
        : view.kind === 'opciones'
          ? '/opciones'
          : view.kind === 'ideas'
            ? `/ideas${view.canalId ? `/${view.canalId}` : ''}`
            : view.kind === 'videos'
              ? `/mis-videos${view.estilo ? `/${view.estilo}` : ''}`
              : view.kind === 'modelos3d' // modelos 3D
                ? '/modelos-3d'
                : view.kind === 'comunidad' // comunidad
                ? '/comunidad'
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
  const [cards, setCards] = useState<Card[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  // Los eventos de cada hilo no viven aquí sino en `eventos.ts`: llegan muchas veces por segundo y solo los pinta el abierto.
  // En qué fase va cada video, para la barra lateral. Lo manda el servidor cuando cambia (`server/avances.ts`).
  const [avances, setAvances] = useState<Record<string, AvanceCorto>>({}) // avance
  const abierto = useRef<string | null>(null) // panel de etapas: el hilo abierto, para el WebSocket
  const socket = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  // Cambios del servidor que esperan a que se reinicie solo, o que no compilan.
  const [reinicio, setReinicio] = useState<Reinicio>({ pendiente: false })
  const [falloEstado, setFalloEstado] = useState('')
  const [app, setApp] = useState('')
  const [menu, setMenu] = useState<{ session: SessionMeta; x: number; y: number } | null>(null)
  // El hilo que se renombra en su fila de la barra lateral.
  const [renombrando, setRenombrando] = useState<string | null>(null)
  // La barra lateral plegada en una columna de iconos (Ctrl+B, o sola en una ventana estrecha).
  const [plegado, setPlegado] = useStored<Plegado>('barraPlegada', {})
  const [plegada, plegar] = useBarraPlegada(plegado, setPlegado)
  const [showArchived, setShowArchived] = useState(false)
  // Con hilos seleccionados (aunque sea ninguno), un clic en un hilo lo marca en vez de abrirlo.
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [anchor, setAnchor] = useState('')
  // La altura donde empezó la selección: el globo de acciones aparece ahí.
  const [pickY, setPickY] = useState(0)
  const [version, setVersion] = useState<VersionClaude | null>(null)
  const enOpciones = view.kind === 'opciones'
  // Al volver de Opciones se pregunta otra vez: si ahí se actualizó, el aviso se va.
  useEffect(() => {
    if (!enOpciones) api<VersionClaude>('/api/claude/version').then(setVersion, () => {})
  }, [enOpciones])
  const [drafts, setDrafts] = useState<Record<string, Saved>>(() => {
    try {
      return JSON.parse(localStorage.getItem('drafts') ?? '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => localStorage.setItem('drafts', JSON.stringify(drafts)), [drafts])
  // El hilo nuevo en blanco también escribe en un borrador, que solo sale en la lista cuando lo dejas a medias.
  const [freshId, setFreshId] = useState(() => sessionStorage.getItem('fresh') ?? newId())
  useEffect(() => sessionStorage.setItem('fresh', freshId), [freshId])
  const draftId = view.kind === 'draft' ? view.id : view.kind === 'new' ? freshId : null

  useEffect(() => {
    const onHash = () => setView(readHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let ws: WebSocket
    let retry: ReturnType<typeof setTimeout>
    const connect = () => {
      ws = new WebSocket(`ws://${location.host}/ws`)
      socket.current = ws
      ws.onopen = async () => {
        const socket = ws
        socket.send(JSON.stringify({ type: 'subscribe', sessionId: abierto.current }))
        setConnected(true)
        try {
          const state = await api('/api/state')
          setCards(state.cards)
          // Los modelos pueden llegar después, por el WebSocket: una lista vacía no tapa la que ya llegó.
          if (state.models.length) setModels(state.models)
          setApp(state.app)
          setReinicio(state.reinicio ?? { pendiente: false })
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
      ws.onclose = () => {
        setConnected(false)
        eventos.conexion(false)
        retry = setTimeout(connect, 800)
      }
      ws.onmessage = (msg) => {
        const push = JSON.parse(msg.data) as ServerPush
        if (push.type === 'cards') setCards(push.cards)
        if (push.type === 'models') setModels(push.models)
        if (push.type === 'reinicio') setReinicio(push.reinicio)
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

  const openId = view.kind === 'session' ? view.id : null
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
  function newChat() {
    setFreshId(newId())
    go({ kind: 'new' })
  }

  function dropDraft(id: string) {
    setDrafts(({ [id]: _, ...rest }) => rest)
    if (view.kind === 'draft' && view.id === id) go({ kind: 'new' })
  }

  // Los hilos de Ideas son de una card que no sale en el inicio: les da su icono.
  const cardOf = (id: string) => cards.find((c) => c.id === id) ?? [IDEAS_CARD, CANAL_CARD].find((c) => c.id === id)
  // Antes de dibujar: las etiquetas de hilo del compositor y de las burbujas lo leen al pintarse.
  threadIcons.clear()
  for (const s of sessions) {
    const icon = cardOf(s.cardId)?.icon
    if (icon) threadIcons.set(s.id, icon)
  }
  const archived = sessions.filter((s) => s.archived)
  // Los videos de un lote van juntos, donde cae el más reciente.
  const lista: (SessionMeta | SessionMeta[])[] = []
  const lotes = new Map<string, SessionMeta[]>()
  for (const s of sessions.filter((s) => !s.archived)) {
    if (!s.lote) {
      lista.push(s)
      continue
    }
    let grupo = lotes.get(s.lote.id)
    if (!grupo) lotes.set(s.lote.id, (grupo = [])), lista.push(grupo)
    grupo.push(s)
  }
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
  // comunidad: tus avisos sin leer, junto a «Comunidad». Se piden cada 2 minutos mientras se ve Sloth, y al leerlos.
  const [avisosComunidad, setAvisosComunidad] = useState(0)
  useEffect(() => {
    const pedir = () => document.visibilityState === 'visible' && void api<{ sinLeer: number }>('/api/comunidad/avisos?cuenta').then((r) => setAvisosComunidad(r.sinLeer), () => {})
    pedir()
    const t = setInterval(pedir, 120_000)
    addEventListener('sloth-comunidad-avisos', pedir)
    return () => (clearInterval(t), removeEventListener('sloth-comunidad-avisos', pedir))
  }, [])
  const buscar = () => (plegar(false), setTimeout(() => campoBusca.current?.focus()))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') e.preventDefault(), buscar()
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
    const order = (
      q
        ? encontrados
        : [
            ...secciones.flatMap((sec) =>
              sec.items.flatMap((x) => {
                if (!Array.isArray(x)) return [x]
                const lote = delLote(x)
                return lote.abierto ? lote.videos : []
              })
            ),
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
      if (!selected && !e.ctrlKey && !e.metaKey) return go({ kind: 'session', id: s.id })
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
      icono={cardOf(s.cardId)?.icon ?? '•'}
      activa={openId === s.id && !selected}
      marcada={selected ? selected.has(s.id) : undefined}
      plegada={plegada}
      avance={avances[s.id]}
      terminada={finished(s)}
      renombrando={renombrando === s.id}
      acciones={accionesFila}
    />
  )
  const lastCard = () => cardOf(localStorage.getItem('card') ?? '') ?? cards[0]
  const newCard = view.kind === 'new' ? (cardOf(view.cardId ?? '') ?? lastCard()) : view.kind === 'draft' ? (cardOf(drafts[view.id]?.cardId ?? '') ?? lastCard()) : undefined
  const shownDrafts = Object.entries(drafts)
    .filter(([id, d]) => filled(d) && !(id === freshId && view.kind === 'new'))
    .sort(([, a], [, b]) => b.at - a.at)

  return (
    <div className={`app${plegada ? ' plegada' : ''}`}>
      <aside className="sidebar">
        {/* Plegada, cada botón es su icono y dice qué es al pasar el ratón; los textos se esconden en Barra.css. */}
        <div className="brand-fila">
          <button className="brand" onClick={newChat} title={plegada ? 'Nuevo chat' : undefined}>
            <img src="/icon.svg" alt="" /> Sloth
          </button>
          <button className="plegar" title={plegada ? 'Desplegar la barra (Ctrl+B)' : 'Plegar la barra (Ctrl+B)'} aria-expanded={!plegada} onClick={() => plegar(!plegada)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M9 5v14" />
            </svg>
          </button>
        </div>
        <button className={`new-chat${view.kind === 'new' ? ' active' : ''}`} onClick={newChat} title={plegada ? 'Nuevo chat' : undefined}>
          <span className="new-chat-icon">
            <Icono de="mas" />
          </span>{' '}
          Nuevo chat
        </button>
        {!VENTA && (
          <button className={`new-chat${view.kind === 'ideas' ? ' active' : ''}`} onClick={() => go({ kind: 'ideas' })} title={plegada ? 'Ideas' : undefined}>
            <span className="new-chat-icon">
              <Icono de="foco" />
            </span>{' '}
            Ideas
          </button>
        )}
        <button className={`new-chat${view.kind === 'videos' ? ' active' : ''}`} onClick={() => go({ kind: 'videos' })} title={plegada ? 'Mis videos' : undefined}>
          <span className="new-chat-icon">
            <Icono de="video" />
          </span>{' '}
          Mis videos
        </button>
        {/* modelos 3D */}
        <button className={`new-chat${view.kind === 'modelos3d' ? ' active' : ''}`} onClick={() => go({ kind: 'modelos3d' })} title={plegada ? 'Modelos 3D' : undefined}>
          <span className="new-chat-icon">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
              <path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9z" />
              <path d="M3 7.5 12 12.5l9-5M12 12.5v9" />
            </svg>
          </span>{' '}
          Modelos 3D
        </button>
        {/* comunidad */}
        <button className={`new-chat${view.kind === 'comunidad' ? ' active' : ''}`} onClick={() => go({ kind: 'comunidad' })} title={plegada ? 'Comunidad' : undefined}>
          <span className="new-chat-icon">
            <Icono de="personas" />
          </span>{' '}
          Comunidad
          {avisosComunidad > 0 && (
            <span className="nav-cuenta" title={`${avisosComunidad} ${avisosComunidad === 1 ? 'aviso' : 'avisos'} sin leer`}>
              {avisosComunidad > 99 ? '99+' : avisosComunidad}
            </span>
          )}
        </button>
        <label className="buscar" title={plegada ? 'Buscar (Ctrl K)' : undefined} onClick={() => plegada && buscar()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={campoBusca}
            placeholder="Buscar"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setBusca(''), e.currentTarget.blur())}
          />
          {busca ? (
            <button className="buscar-x" title="Borrar la búsqueda" onClick={() => setBusca('')}>
              ✕
            </button>
          ) : (
            <kbd>Ctrl K</kbd>
          )}
        </label>
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
          {secciones.flatMap((sec) => [
            <div key={`seccion-${sec.nombre}`} className="barra-seccion">
              {sec.nombre}
            </div>,
            ...sec.items.map((x) => {
              if (!Array.isArray(x)) return row(x)
              const { id, videos, abierto } = delLote(x)
              return <LoteFila key={id} videos={videos} card={cardOf(videos[0].cardId)} abierto={abierto} onToggle={() => setAbiertos({ ...abiertos, [id]: !abierto })} fila={row} vista={vistaDeLote(videos, avances)} />
            }),
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
        <Pie running={sessions.some((s) => s.running || !!s.background?.length)} connected={connected} enOpciones={view.kind === 'opciones'} fallo={falloEstado} reinicio={reinicio} plegada={plegada} />
      </aside>

      <main className="main">
        <Bienvenida />
        {view.kind === 'opciones' && (
          <Opciones onDone={() => go({ kind: 'new' })} />
        )}
        {!VENTA && view.kind === 'ideas' && (
          <Ideas
            canalId={view.canalId}
            cards={cards}
            models={models}
            sessions={sessions}
            onCanal={(canalId) => go({ kind: 'ideas', canalId })}
            onHilo={(id) => go({ kind: 'session', id })}
            // «Hacer con…»: un borrador de esa card con la idea ya escrita, para revisarla antes de mandarla. Si es vertical
            // o un video largo para YouTube lo dice la primera línea de la idea.
            onBorrador={(cardId, texto) => {
              const id = newId()
              setDrafts((all) => ({ ...all, [id]: { text: texto, html: textoAHtml(texto), images: [], cardId, at: Date.now() } }))
              go({ kind: 'draft', id })
            }}
          />
        )}
        {view.kind === 'modelos3d' && <Modelos3D />} {/* modelos 3D */}
        {/* comunidad: en Mejoras, «Hacer con Sloth» abre un borrador de la card Sloth con la mejora y sus capturas, para revisarlo y mandarlo. */}
        {view.kind === 'comunidad' && (
          <Comunidad
            sessions={sessions}
            onHilo={(id) => go({ kind: 'session', id })}
            onHacer={(texto, imagenes) => {
              const id = newId()
              const images = imagenes.map((path) => ({ path, src: imageUrl(path), chip: false }))
              setDrafts((all) => ({ ...all, [id]: { text: texto, html: textoAHtml(texto), images, cardId: 'sloth', at: Date.now() } }))
              go({ kind: 'draft', id })
            }}
          />
        )}
        {/* comunidad: «Pedir una mejora», que abre el símbolo de Claude de cualquier hilo y la publica en Mejoras. */}
        <PedirMejora sessions={sessions} />
        {view.kind === 'videos' && (
          <ConNavegadorRedes>
            <MisVideos cards={cards} sessions={sessions} estilo={view.estilo} onEstilo={(estilo) => go({ kind: 'videos', estilo })} />
          </ConNavegadorRedes>
        )}
        {newCard && draftId && version && atrasado(version) && <AvisoVersion />}
        {newCard && draftId && (
          <NewSession
            key={draftId}
            card={newCard}
            cards={cards}
            sessions={sessions}
            models={models}
            draft={drafts[draftId]}
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
            onCreate={() => {
              // Un borrador nuevo para la card Sloth, ya empezado con la etiqueta «Nuevo diseño»: solo falta decir qué hace la skill.
              const id = newId()
              setDrafts((all) => ({ ...all, [id]: { text: `${DESIGN} `, html: `${designChipHtml()} `, images: [], cardId: 'sloth', at: Date.now() } }))
              go({ kind: 'draft', id })
            }}
            onCreated={(id) => {
              setDrafts(({ [draftId]: _, ...rest }) => rest)
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
  onPick(c: Card): void
  onCreate(): void
  onCreated(id: string): void
}) {
  const { card, models } = props
  // El modelo: «Optimizado» usa lo medido para esta card (el hilo y cada subagente) o, sin medir, lo último que elegiste
  // a mano; «Avanzado», lo que elegiste para ella.
  const [avanzados, setAvanzados] = useStored<Record<string, Avanzado>>('modelos', {})
  const avanzado = avanzados[card.id]
  const { choice, tareas } = useMemo(() => elegirModelos(card.modelos, models, avanzado, lastChoice(models)), [card.modelos, models, avanzado])
  function cambiarModelos(a: Avanzado | undefined) {
    const { [card.id]: _, ...resto } = avanzados
    setAvanzados(a ? { ...resto, [card.id]: a } : resto)
    // Cambiar el modelo del hilo en «Avanzado» es elegirlo a mano; pasar a «Avanzado» o cambiar un subagente, no.
    if (a?.principal && avanzado && a.principal !== avanzado.principal) elegidoAMano(a.principal)
  }
  const [borrando, setBorrando] = useState<Card | null>(null)
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
  const previas = usePrevias(props.cards, props.sessions) // previas de las cards
  const publicar = usePublicar(enEstilo && card.etapas ? card : null, videos) // redes
  // El video de una carpeta de fuera, sin hilo que abrir, se ve en grande.
  const [viendo, setViendo] = useState<string | null>(null)
  // Con dos enlaces o más, la card que hace lotes ofrece un video por enlace. Hay que elegirlo: dos enlaces también pueden
  // ser las fuentes de un solo video. La card recuerda la última elección, para quien hace lotes siempre.
  const enlaces = enlacesDe(props.draft?.text ?? '')
  const [porEnlace, setPorEnlace] = useStored<Record<string, boolean>>('porEnlace', {})
  // «Continuar un video»: el hilo nuevo sigue en una carpeta que ya existe (un episodio empezado) en vez de crear otra.
  // Con una elegida no hay lote: es un solo video.
  const carpetas = useCarpetas(card.etapas ? card : null, hilos) // panel de etapas
  const [continuar, setContinuar] = useState('')
  useEffect(() => setContinuar(''), [card.id])
  // Una serie de la skill (`skills/<skill>/series/`): sin escribir nada, el agente elige el tema y hace el video.
  const series = useSeries(card)
  const [serie, setSerie] = useState('')
  useEffect(() => setSerie(''), [card.id])
  const laSerie = continuar ? undefined : series.find((s) => s.id === serie)
  const lote = !continuar && !!card.lote && enlaces.length > 1 && !!porEnlace[card.id]
  // En los estilos que también hacen horizontales (El Diff), el formato del video: la skill hace solo ese. La card
  // recuerda el último; una idea de YouTube ya lo trae escrito en el mensaje (`Formato: horizontal`), y ese manda.
  const [formatos, setFormatos] = useStored<Record<string, 'vertical' | 'horizontal'>>('formato', {})
  const formatoEscrito = /^Formato: (vertical|horizontal)\s*$/m.exec(props.draft?.text ?? '')?.[1] as 'vertical' | 'horizontal' | undefined
  const formato = formatoEscrito ?? formatos[card.id] ?? 'vertical'
  const conFormato = !!card.horizontal && !continuar
  // Un archivo o un enlace soltado en cualquier parte del inicio va al mensaje.
  const soltar = useSoltar()

  // Sin la cuenta del agente conectada, el video no podría empezar: el aviso de encima lo dice y no se manda.
  const [sinCuenta, setSinCuenta] = useState<boolean>()

  // Lo que hacen los carteles, siempre las mismas funciones (van memorizados) y con lo de ahora.
  const alCartel = useRef<AccionesCartel>(null as never)
  alCartel.current = {
    // Sin videos terminados (sin previa) solo se elige: su galería saldría vacía.
    elegir: (c) => (props.onPick(c), setEnEstilo(!!c.etapas && !!previas[c.id])),
    duplicar: (c) => void duplicar(c),
    borrar: setBorrando
  }
  const accionesCartel = useMemo<AccionesCartel>(() => ({ elegir: (c) => alCartel.current.elegir(c), duplicar: (c) => alCartel.current.duplicar(c), borrar: (c) => alCartel.current.borrar(c) }), [])

  const composer = (
      <Composer
        models={models}
        choice={choice}
        autoFocus
        draft={props.draft}
        onDraft={props.onDraft}
        bloqueo={sinCuenta ? 'Primero conecta tu cuenta (arriba)' : undefined}
        placeholder={card.skill ? `Qué quieres de /${card.skill}…` : 'Qué cambio quieres en Sloth…'}
        modelos={<Modelos conf={card.modelos} models={models} avanzado={avanzado} choice={choice} tareas={tareas} onAvanzado={cambiarModelos} />}
        extra={
          <>
            {series.length > 0 && !continuar && (
              <Picker
                label={laSerie ? laSerie.nombre : 'Sin serie'}
                value={serie}
                groups={[
                  { label: 'Tema libre', options: [{ value: '', label: 'Sin serie' }] },
                  { label: 'Serie: elige sola el tema si no escribes uno', options: series.map((s) => ({ value: s.id, label: s.nombre })) }
                ]}
                onChange={setSerie}
              />
            )}
            {carpetas.length > 0 && (
              <Picker
                label={continuar ? `Continuar ${continuar}` : 'Video nuevo'}
                value={continuar}
                groups={[
                  { label: 'Empezar', options: [{ value: '', label: 'Video nuevo' }] },
                  { label: 'Continuar un video', options: opcionesDeCarpetas(carpetas) }
                ]}
                onChange={setContinuar}
              />
            )}
            {conFormato && (
              <Segmento
                label="Formato"
                valor={formato}
                opciones={[
                  { id: 'vertical', texto: 'Vertical', title: formatoEscrito ? 'Lo trae la idea' : '1080x1920, para TikTok', disabled: !!formatoEscrito },
                  { id: 'horizontal', texto: 'Horizontal', title: formatoEscrito ? 'Lo trae la idea' : '1920x1080, para YouTube', disabled: !!formatoEscrito }
                ]}
                onCambio={(f) => setFormatos({ ...formatos, [card.id]: f })}
              />
            )}
            {card.lote && enlaces.length > 1 && !continuar && (
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
            laSerie && `Serie: ${laSerie.nombre} (series/${laSerie.id}.md)${text ? '' : '. Elige tú el tema.'}`,
            conFormato && !formatoEscrito && `Formato: ${formato}`,
            // El modelo de cada subagente: lo medido, o lo que elegiste en «Avanzado». La skill lo lee aquí.
            lineaSubagentes(tareas)
          ]
          text = [text, ...pide].filter(Boolean).join('\n\n')
          if (porEnlace) {
            const metas = await api<SessionMeta[]>('/api/lotes', { cardId: card.id, text, enlaces, images, ...choice })
            return props.onCreated(metas[0].id)
          }
          // Lo de seguir en esa carpeta lo escribe el servidor en el mensaje, después de comprobar que existe.
          const meta = await api<SessionMeta>('/api/sessions', { cardId: card.id, text, images, ...choice, ...(continuar ? { carpeta: continuar } : {}) })
          props.onCreated(meta.id)
        }}
      />
  )

  return (
    <div className="new-session" {...soltar.props}>
      {soltar.aviso}
      {/* Arriba las skills (o, con un estilo elegido, sus videos), que hacen scroll solas; abajo la skill elegida y el
          compositor, que no se mueven de su sitio. */}
      <div className="new-top">
        {enEstilo && card.etapas ? (
          <div className="estilo">
            <button className="estilo-volver" onClick={() => setEnEstilo(false)}>
              ← Todos los estilos
            </button>
            {publicar.barra}
            {videos && <YoutubeLote videos={videos} cardId={card.id} />}
            <CalendarioYoutube />
            {!videos ? null : videos.length ? (
              <Rejilla videos={videos}>{(v) => <VideoDe key={v.src} video={v} onVer={() => setViendo(v.src)} insignia={publicar.insignia(v.ruta)} />}</Rejilla>
            ) : (
              <p className="estilo-vacio">Aún no hay videos terminados de este estilo.</p>
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
              <h2>Skills</h2>
              {/* Lo escribe la card Sloth, que la app que se vende no lleva. */}
              {!VENTA && (
                <button className="crear" onClick={props.onCreate} title="Abre un hilo con Sloth para escribirla">
                  ＋ Crear skill
                </button>
              )}
            </header>
            {fallo && <p className="bad small">{fallo}</p>}
            {/* Cada skill es un cartel: su último video si lo tiene y, si no, su icono y qué hace. Abajo, cuánto se usa. */}
            <Carteles cards={props.cards} activa={card.id} previas={previas} sessions={props.sessions} acciones={accionesCartel} />
          </section>
        )}
      </div>
      <div className="new-bottom">
        <div className="new-head">
          <span className="card-icon big"><Icon icon={card.icon ?? '✦'} /></span>
          <h1>{card.title}</h1>
          <p>{card.description}</p>
        </div>
        <CuentaClaude model={choice?.model} onFalta={setSinCuenta} />
        {/* Las herramientas de video solo hacen falta en los estilos de video, y de los paquetes, los de su skill. */}
        {card.etapas && <Requisitos skill={card.skill} />}
        {composer}
        <TarjetasEnlaces enlaces={enlaces} />
      </div>
      {borrando && (
        <Confirm
          title={`¿Eliminar «${borrando.title}»?`}
          action="Eliminar"
          danger
          onClose={() => setBorrando(null)}
          onConfirm={() => api(`/api/cards/${borrando.id}/delete`, {})}
        >
          Se quita de las cards.{borrando.skill ? <> La skill <code>/{borrando.skill}</code> sigue instalada</> : ' Su carpeta de trabajo sigue ahí'} y los hilos que
          hiciste con ella se quedan.
        </Confirm>
      )}
    </div>
  )
}

type AccionesCartel = { elegir(c: Card): void; duplicar(c: Card): void; borrar(c: Card): void }

/**
 * Las skills del inicio, cada una un cartel. Memorizadas: escribir en el compositor de abajo no las vuelve a dibujar (ni a
 * sus videos de fondo).
 */
const Carteles = memo(function Carteles({ cards, activa, previas, sessions, acciones }: { cards: Card[]; activa: string; previas: Record<string, Previa>; sessions: SessionMeta[]; acciones: AccionesCartel }) {
  // Al desplazarlas, las que pasan bajo el cursor no arrancan su video.
  const rejilla = useRef<HTMLDivElement>(null)
  useDesplazando(rejilla)
  return (
    <div className="cards" ref={rejilla}>
      {cards.map((c) => (
        <button
          key={c.id}
          className={`card ${c.id === activa ? 'active' : ''}`}
          onClick={() => acciones.elegir(c)}
          title={c.description}
          onMouseEnter={(e) => e.currentTarget.querySelector('video')?.play().catch(() => {})}
          onMouseLeave={(e) => e.currentTarget.querySelector('video')?.load()}
        >
          {/* previas de las cards: el cuadro quieto hasta que pasas por encima. Al salir, `load()` vuelve a él y suelta el video. */}
          {previas[c.id] ? (
            <video className="card-previa" src={previas[c.id].video} poster={previas[c.id].cuadro} muted loop playsInline preload="none" />
          ) : (
            <span className="card-fondo">
              <span className="card-icon"><Icon icon={c.icon ?? '✦'} /></span>
              <span className="card-desc">{c.description}</span>
            </span>
          )}
          {/* En la app que se vende, las cards son las que trae: ni se duplican ni se borran. */}
          {!VENTA && (
            <span className="card-actions">
              <span
                role="button"
                title={`Duplicar: sale una card nueva con la misma skill${c.skill ? ` /${c.skill}` : ''}, que puedes cambiar a tu gusto en cards.json`}
                onClick={(e) => (e.stopPropagation(), acciones.duplicar(c))}
              >
                ⧉
              </span>
              {/* La card Sloth no se borra: es la que arregla la app. */}
              {c.id !== 'sloth' && (
                <span role="button" className="danger" title="Eliminar" onClick={(e) => (e.stopPropagation(), acciones.borrar(c))}>
                  ✕
                </span>
              )}
            </span>
          )}
          <span className="card-pie">
            <span className="card-title">{c.title}</span>
            <Uso hilos={sessions.filter((s) => s.cardId === c.id && !s.archived)} />
          </span>
        </button>
      ))}
    </div>
  )
})

/** Cuánto se usa una skill: los hilos que trabajan ahora, que es lo que más importa, o cuántos hay y cuándo fue el último. */
function Uso({ hilos }: { hilos: SessionMeta[] }) {
  const trabajando = hilos.filter((s) => s.running).length
  if (trabajando) return <span className="card-uso vivo">● {trabajando} trabajando</span>
  if (!hilos.length) return <span className="card-uso">Sin hilos aún</span>
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

/**
 * Las carpetas de video de una card, para «Continuar un video». Se vuelven a pedir cuando avanza uno de sus hilos, que es
 * cuando puede haber una nueva. Si falla (el servidor aún no conoce la ruta), no hay ninguna y la opción no sale.
 */
function useCarpetas(card: Card | null, hilos: SessionMeta[]) {
  const [carpetas, setCarpetas] = useState<CarpetaDeVideo[]>([])
  const clave = hilos.map((s) => s.id + s.updatedAt).join()
  useEffect(() => {
    if (!card) return setCarpetas([])
    let vivo = true
    api<CarpetaDeVideo[]>(`/api/cards/${card.id}/carpetas`).then((c) => vivo && setCarpetas(c), () => vivo && setCarpetas([]))
    return () => {
      vivo = false
    }
  }, [card?.id, clave])
  return carpetas
} // panel de etapas

/** Las series de la skill de una card (`GET /api/cards/<id>/series`). Si falla, no hay ninguna y no sale el selector. */
function useSeries(card: Card) {
  const [series, setSeries] = useState<Serie[]>([])
  useEffect(() => {
    if (!card.skill) return setSeries([])
    let vivo = true
    api<Serie[]>(`/api/cards/${card.id}/series`).then((s) => vivo && setSeries(s), () => vivo && setSeries([]))
    return () => {
      vivo = false
    }
  }, [card.id])
  return series
}

/**
 * La previa de cada card de estilo, de su último video terminado (`server/previas.ts`). Se vuelve a pedir cuando un hilo
 * deja de trabajar, que es cuando puede haber un video nuevo. La primera vez tarda lo que FFmpeg en hacerlas.
 */
function usePrevias(cards: Card[], sessions: SessionMeta[]) {
  const [previas, setPrevias] = useState<Record<string, Previa>>({})
  const clave = cards.map((c) => c.id).join() + '|' + sessions.flatMap((s) => (s.running ? [] : [s.id])).join()
  useEffect(() => {
    let vivo = true
    api<Record<string, Previa>>('/api/previas').then((p) => vivo && setPrevias(p), () => {})
    return () => {
      vivo = false
    }
  }, [clave])
  return previas
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
  // costo (se cortó antes de que Claude lo diera, o fue el primero tras retomar el hilo) no suma: el total es entonces lo
  // menos que costó.
  const totals = useResumen(id)
  // Un video del lote que espera su turno arranca con su propio mensaje: un clic no le manda otro.
  const pendiente = !!session?.pendiente
  const onResponder = useMemo(() => (pendiente ? undefined : (text: string) => api(`/api/sessions/${id}/send`, { text })), [id, pendiente])
  const navegador = useNavegadorAbierto(id)
  if (!session) return <div className="empty">{fallo ? `No se pudo abrir este hilo: ${fallo}` : 'Cargando…'}</div>
  const subagente = abierto?.sesion === session.id ? abierto.id : undefined
  const trabaja = session.running || !!session.background?.length
  const head = (extra?: ReactNode) => (
    <header className="session-head">
      <span className="session-icon"><Icon icon={card?.icon ?? '•'} /></span>
      <NombreDelHilo key={session.id} session={session} />
      <span className="spacer" />
      {totals.ms > 0 && <span className="muted small">{duration(totals.ms)}</span>}
      {(totals.cost > 0 || totals.sinCosto > 0) && (
        <span className="muted small" title={totals.sinCosto ? `Sin contar ${totals.sinCosto === 1 ? 'un turno' : `${totals.sinCosto} turnos`} sin costo: se cortaron antes de que Claude lo diera, o fueron el primero tras retomar el hilo` : undefined}>
          {totals.sinCosto ? '≥ ' : ''}${totals.cost.toFixed(2)}
        </span>
      )}
      {totals.read > 0 && <span className="muted small">{compact(totals.read)} tokens leídos</span>}
      {totals.out > 0 && <span className="muted small">{compact(totals.out)} tokens escritos</span>}
      {/* El símbolo de Claude: pide una mejora sobre este hilo. Solo el símbolo: el encabezado de un video va justo. */}
      <button className="pedir-mejora solo" title="Pedir una mejora: ¿algo no salió como esperabas? Claude te ayuda a decirlo" aria-label="Pedir una mejora" onClick={() => pedirMejora({ hilo: session.id })}>
        <MarcaClaude />
      </button>
      {extra}
      <BotonNavegador hilo={session.id} trabajando={trabaja} />
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
      />
      {/* Oculto y no quitado: guarda lo que escribías, y una cita del subagente le llega. */}
      <div className="session-composer" hidden={!!subagente}>
        {session.cardId === 'sloth' && <CambiosSloth key={`cambios:${session.id}`} sessionId={session.id} ocupado={session.running || !!session.background?.length} revision={totals.revision} />}
        {session.pendiente && (
          <div className="queue">
            <div className="queued">
              <span className="muted small">{session.lote?.pausa ? 'Lote en pausa' : 'En espera'}</span>
              <span className="queued-text" title={session.lote?.pausa}>
                {session.lote?.pausa ?? `Video ${session.lote?.n} de ${session.lote?.de}: empieza solo cuando haya sitio en la máquina.`}
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
        <Composer
          key={`composer:${session.id}`}
          models={models.filter((m) => proveedorDe(m.id) === proveedorDe(session.model))}
          initial={{ model: session.model, effort: session.effort }}
          running={session.running}
          background={!!session.background?.length}
          lockModel={!!session.background?.length}
          context={totals.context}
          placeholder="Responde, pide un cambio, pega una imagen o suelta un archivo…"
          draft={leerRespuesta(session.id)}
          onDraft={(d) => guardarRespuesta(session.id, d)}
          onChoice={(c) => api(`/api/sessions/${session.id}/model`, c).then(() => elegidoAMano(c))}
          onStop={() => api(`/api/sessions/${session.id}/stop`, {})}
          onSend={(text, _choice, images) => api(`/api/sessions/${session.id}/send`, { text: conReferencia(session.id, text), images })}
        />
      </div>
    </>
  )
  // Un estilo de video se ve en el estudio, siempre con el mismo marco.
  if (esDeEstudio(card)) return <Estudio key={session.id} session={session} card={card!} head={head} chat={chat} /> // panel de etapas
  // Lo que deja un hilo de Ideas se ve en la sección, en la carpeta de su canal (su `cwd`).
  const canal = card?.id === IDEAS_CARD.id || card?.id === CANAL_CARD.id ? session.cwd.split(/[\\/]/).filter(Boolean).pop() : undefined // ideas
  return (
    <div className="session">
      {head(
        canal && (
          <button className="ghost small" onClick={() => go({ kind: 'ideas', canalId: canal })}>
            Ver en Ideas
          </button>
        )
      )}
      {/* El chat no cambia de sitio al abrir el navegador: no se vuelve a montar. */}
      <div className="session-cuerpo">
        <div className="session-chat">{chat()}</div>
        {navegador && <PanelNavegador hilo={session.id} trabajando={trabaja} />}
      </div>
    </div>
  )
})

const SIN_TAREAS: string[] = []

/**
 * El clic derecho sobre un hilo. «Copiar referencia» copia la ruta de su historial: pegada en otro hilo, el agente la
 * lee y tiene el contexto, trabaje donde trabaje. «Renombrar» lo renombra en su fila, como el doble clic.
 */
function SessionMenu({ session, x, y, app, onClose, onSelect, onDeleted, onRename }: { session: SessionMeta; x: number; y: number; app: string; onClose(): void; onSelect(): void; onDeleted(id: string): void; onRename(): void }) {
  const [error, setError] = useState('')
  const [borrar, setBorrar] = useState(false)
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
      <Confirm
        title={`¿Eliminar «${session.title}»?`}
        action="Eliminar"
        danger
        onClose={onClose}
        onConfirm={async () => {
          await api(`/api/sessions/${session.id}/delete`, {})
          onDeleted(session.id)
        }}
      >
        Se borra su historial y no se puede deshacer.
      </Confirm>
    )

  return (
    <div className="menu-backdrop" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div className="menu" style={{ left: Math.min(x, innerWidth - 230), top: Math.min(y, innerHeight - 180) }} onClick={(e) => e.stopPropagation()}>
        <button
          title="Para dárselo como contexto a otro hilo"
          onClick={() => run(() => navigator.clipboard.writeText(threadRef(session.title, session.id, app)))}
        >
          Copiar referencia
        </button>
        <button title="También con doble clic en el hilo" onClick={() => run(async () => onRename())}>
          Renombrar
        </button>
        <button title="Para archivar o eliminar varios a la vez (también con Ctrl+clic)" onClick={() => run(async () => onSelect())}>
          Seleccionar
        </button>
        <button onClick={() => run(() => api(`/api/sessions/${session.id}/archive`, { archived: !session.archived }))}>{session.archived ? 'Desarchivar' : 'Archivar'}</button>
        <button className="danger" disabled={busy} title={busy ? 'El agente sigue trabajando en este hilo' : undefined} onClick={() => setBorrar(true)}>
          Eliminar
        </button>
        {error && <div className="bad small menu-error">{error}</div>}
      </div>
    </div>
  )
}

/**
 * La barra de los hilos seleccionados: copiar sus referencias, archivarlos o eliminarlos de una vez. Archivar los desarchiva si ya lo estaban
 * todos. Los que siguen trabajando no se eliminan.
 */
function SelectBar({ picked, y, app, onClose, onDeleted }: { picked: SessionMeta[]; y: number; app: string; onClose(): void; onDeleted(ids: string[]): void }) {
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const allArchived = picked.length > 0 && picked.every((s) => s.archived)
  const free = picked.filter((s) => !s.running && !s.background?.length)
  const busy = picked.length - free.length

  useEffect(() => {
    if (asking) return // el Escape es del modal
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [asking, onClose])

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
        <button className="danger" disabled={!free.length} onClick={() => setAsking(true)}>
          Eliminar
        </button>
        <button className="select-close" title="Dejar de seleccionar (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
      {asking && (
        <Confirm
          title={free.length === 1 ? `¿Eliminar «${free[0].title}»?` : `¿Eliminar ${free.length} hilos?`}
          action="Eliminar"
          danger
          onClose={() => setAsking(false)}
          onConfirm={async () => {
            await Promise.all(free.map((s) => api(`/api/sessions/${s.id}/delete`, {})))
            onDeleted(free.map((s) => s.id))
            onClose()
          }}
        >
          Se borra su historial y no se puede deshacer.{busy > 0 && ` ${busy === 1 ? 'Uno sigue trabajando y se queda' : `${busy} siguen trabajando y se quedan`}.`}
        </Confirm>
      )}
    </div>
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

/** Arriba a la derecha del hilo nuevo, si Claude Code tiene versión nueva. Lleva a Opciones, que lo actualiza. */
function AvisoVersion() {
  return (
    <button className="aviso-version" title="Ir a Opciones para actualizar" onClick={() => go({ kind: 'opciones' })}>
      ↑ Actualizar Claude Code
    </button>
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

/**
 * Abajo de la barra lateral: Opciones y Reiniciar backend, que aplica los cambios del servidor. Mientras el servidor
 * vuelve, el botón dice que se está reconectando. Si el servidor cambió, se reinicia solo en cuanto nada trabaja: debajo
 * se dice que espera, o por qué no compila (entonces no se reinicia solo, pero el botón sigue sirviendo).
 */
function Pie({ running, connected, enOpciones, fallo, reinicio, plegada }: { running: boolean; connected: boolean; enOpciones: boolean; fallo: string; reinicio: Reinicio; plegada: boolean }) {
  const [error, setError] = useState('')
  return (
    <div className="pie">
      <AvisoRedes connected={connected} /> {/* redes */}
      <button className={enOpciones ? 'on' : ''} title={plegada ? 'Opciones' : undefined} onClick={() => go({ kind: 'opciones' })}>
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
          {!connected && <span className="muted small pie-nota">Reconectando…</span>}
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
      {connected && reinicio.error && (
        <span className="bad small" title={reinicio.error}>
          Los cambios del servidor no compilan y no se reinicia solo: {reinicio.error.split('\n')[0]}
        </span>
      )}
      {connected && reinicio.pendiente && !reinicio.error && <span className="muted small pie-nota">Hay cambios del servidor: se reinicia solo cuando nada trabaje.</span>}
      {(error || fallo) && (
        <span className="bad small" title={plegada ? error || fallo : undefined}>
          {error || fallo}
        </span>
      )}
    </div>
  )
}
