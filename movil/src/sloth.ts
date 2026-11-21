/**
 * Lo que el celular sabe de Sloth: las cards, los hilos, los modelos y cómo va cada video (`/api/state`), al día por el
 * WebSocket (`ServerPush`). Los eventos del hilo abierto se guardan aparte, como en `web/src/eventos.ts`: llegan hasta
 * veinte veces por segundo y solo los pinta el hilo.
 *
 * El celular corta el WebSocket al irse la app al fondo: al volver se reconecta y vuelve a pedir el estado y el hilo
 * abierto, que pudieron cambiar mientras tanto.
 */
import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { rellenar } from '../../shared/historial'
import type { AgentEvent, AvanceCorto, Card, Model, ServerPush, SessionMeta } from '../../shared/types'
import { api, ErrorApi } from './api'
import { conexion, olvidarConexion } from './conexion'
import { wsDe } from './enlace'

export interface Estado {
  cards: Card[]
  sessions: SessionMeta[]
  models: Model[]
  avances: Record<string, AvanceCorto>
  /** Si el WebSocket está abierto: sin él, lo que se ve puede ir atrasado. */
  enLinea: boolean
  /** Ya llegó `/api/state` al menos una vez. */
  cargado: boolean
  error?: string
}

let estado: Estado = { cards: [], sessions: [], models: [], avances: {}, enLinea: false, cargado: false }
const oyentesEstado = new Set<() => void>()
function cambiar(parte: Partial<Estado>) {
  estado = { ...estado, ...parte }
  oyentesEstado.forEach((f) => f())
}

export function useSloth(): Estado {
  return useSyncExternalStore(
    (f) => (oyentesEstado.add(f), () => oyentesEstado.delete(f)),
    () => estado
  )
}
export const slothAhora = () => estado

// ——— Los eventos de los hilos ———

type Trozo = { from: number; events: AgentEvent[] }
const listas = new Map<string, AgentEvent[]>()
const cargando = new Map<string, Trozo[]>()
const fallos = new Map<string, string>()
const oyentesHilo = new Map<string, Set<() => void>>()
/** Los que piden su avance otra vez (`etapas`): la pantalla de Avance de ese hilo. */
const oyentesEtapas = new Map<string, Set<() => void>>()
let abierto: string | null = null

const avisarHilo = (id: string) => oyentesHilo.get(id)?.forEach((f) => f())

/** Añade un trozo sin repetir lo que ya tenía; si falta algo entre los dos, `undefined`: se pide entero. */
export function conTrozo(list: AgentEvent[], { from, events }: Trozo): AgentEvent[] | undefined {
  if (from > list.length) return undefined
  const nuevos = events.slice(list.length - from)
  return nuevos.length ? [...list, ...nuevos] : list
}

function cargar(id: string) {
  if (cargando.has(id)) return
  const llegados: Trozo[] = []
  cargando.set(id, llegados)
  const vigente = () => cargando.get(id) === llegados && (cargando.delete(id), true)
  api<{ events: (AgentEvent | null)[] }>(`/api/sessions/${id}/historial`).then(
    (s) => {
      if (!vigente()) return
      let list: AgentEvent[] | undefined = rellenar(s.events)
      for (const t of llegados) list = list && conTrozo(list, t)
      if (list) listas.set(id, list)
      else listas.delete(id)
      fallos.delete(id)
      avisarHilo(id)
      if (!list) cargar(id)
    },
    (e) => {
      if (!vigente()) return
      fallos.set(id, e instanceof Error ? e.message : String(e))
      avisarHilo(id)
    }
  )
}

function llegan(id: string, trozo: Trozo) {
  cargando.get(id)?.push(trozo)
  const list = listas.get(id)
  if (!list || id !== abierto) return
  const nueva = conTrozo(list, trozo)
  if (nueva === list) return
  if (nueva) listas.set(id, nueva)
  else listas.delete(id)
  avisarHilo(id)
  if (!nueva) cargar(id)
}

/** Abre un hilo (o ninguno): el WebSocket solo manda los eventos del abierto. Los demás se sueltan: se piden al volver. */
export function abrirHilo(id: string | null) {
  abierto = id
  for (const otro of [...listas.keys()]) if (otro !== id) listas.delete(otro)
  for (const otro of [...cargando.keys()]) if (otro !== id) cargando.delete(otro)
  suscribir()
  if (id && !listas.has(id)) cargar(id)
}

export function useEventos(id: string): { events?: AgentEvent[]; fallo?: string } {
  const events = useSyncExternalStore(
    (f) => oir(oyentesHilo, id, f),
    () => listas.get(id)
  )
  const fallo = useSyncExternalStore(
    (f) => oir(oyentesHilo, id, f),
    () => fallos.get(id)
  )
  return { events, fallo }
}

/** Avisa cuando cambió algo de la carpeta del hilo: la pantalla de Avance lo vuelve a pedir. */
export function alCambiarEtapas(id: string, f: () => void) {
  return oir(oyentesEtapas, id, f)
}

function oir(mapa: Map<string, Set<() => void>>, id: string, f: () => void) {
  let set = mapa.get(id)
  if (!set) mapa.set(id, (set = new Set()))
  set.add(f)
  return () => {
    set.delete(f)
    if (!set.size) mapa.delete(id)
  }
}

// ——— El WebSocket ———

let ws: WebSocket | null = null
let reintento: ReturnType<typeof setTimeout> | undefined
let espera = 1000
let encendido = false

function suscribir() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'subscribe', sessionId: abierto }))
}

async function leerEstado() {
  try {
    const s = await api<{ cards: Card[]; sessions: SessionMeta[]; models: Model[]; avances: Record<string, AvanceCorto> }>('/api/state')
    cambiar({ cards: s.cards, sessions: s.sessions, models: s.models.length ? s.models : estado.models, avances: s.avances ?? {}, cargado: true, error: undefined })
  } catch (e) {
    // Con una llave que ya no vale (la cambiaron en Opciones → Tu celular) no hay nada que reintentar: a conectar otra vez.
    if (e instanceof ErrorApi && e.status === 401) return void olvidarConexion(e.message)
    cambiar({ error: e instanceof Error ? e.message : String(e) })
  }
}

function recibir(msg: ServerPush) {
  switch (msg.type) {
    case 'events':
      return llegan(msg.sessionId, msg)
    case 'session': {
      const sin = estado.sessions.filter((s) => s.id !== msg.session.id)
      return cambiar({ sessions: [...sin, msg.session] })
    }
    case 'removed':
      listas.delete(msg.sessionId)
      return cambiar({ sessions: estado.sessions.filter((s) => s.id !== msg.sessionId) })
    case 'cards':
      return cambiar({ cards: msg.cards })
    case 'models':
      // Una lista vacía no tapa la que ya llegó.
      return msg.models.length ? cambiar({ models: msg.models }) : undefined
    case 'avance':
      return cambiar({ avances: { ...estado.avances, [msg.sessionId]: msg.avance } })
    case 'etapas':
      return oyentesEtapas.get(msg.sessionId)?.forEach((f) => f())
  }
}

function abrirSocket() {
  const c = conexion()
  if (!encendido || !c || ws) return
  const socket = new WebSocket(wsDe(c.base, c.llave))
  ws = socket
  socket.onopen = () => {
    espera = 1000
    // Sin suscribirse llegan los eventos de todos los hilos: en datos móviles, nada de eso.
    suscribir()
    cambiar({ enLinea: true })
    void leerEstado()
    // Lo guardado del hilo abierto pudo quedarse atrás mientras no había conexión.
    if (abierto) {
      cargando.delete(abierto)
      cargar(abierto)
    }
  }
  socket.onmessage = (e) => {
    try {
      recibir(JSON.parse(String(e.data)) as ServerPush)
    } catch { /* Un mensaje que no se entiende no cambia nada. */ }
  }
  socket.onclose = () => {
    if (ws === socket) ws = null
    cambiar({ enLinea: false })
    if (!encendido) return
    clearTimeout(reintento)
    reintento = setTimeout(abrirSocket, espera)
    espera = Math.min(espera * 2, 10_000)
  }
  socket.onerror = () => socket.close()
}

/** Empieza a hablar con la computadora conectada: lee el estado y abre el WebSocket. */
export function encender() {
  if (encendido) return
  encendido = true
  void leerEstado()
  abrirSocket()
}

/** Al desconectar el celular: se cierra todo y se olvida lo que se sabía. */
export function apagar() {
  encendido = false
  clearTimeout(reintento)
  ws?.close()
  ws = null
  listas.clear()
  cargando.clear()
  fallos.clear()
  abierto = null
  estado = { cards: [], sessions: [], models: [], avances: {}, enLinea: false, cargado: false }
  oyentesEstado.forEach((f) => f())
}

/** Vuelve a pedir el estado (al tirar hacia abajo una lista). */
export const refrescar = () => leerEstado()

// Al volver de fondo, el WebSocket suele estar muerto aunque no lo diga: se cierra y se abre otro al momento.
AppState.addEventListener('change', (a) => {
  if (a !== 'active' || !encendido) return
  espera = 1000
  if (ws) ws.close()
  else abrirSocket()
})
