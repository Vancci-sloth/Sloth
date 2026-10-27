import { useSyncExternalStore } from 'react'
import type { AgentEvent, FileDraft } from '../../shared/types'
import { historialLigero, rellenar } from '../../shared/historial'
import { api } from './api'

/**
 * Los eventos de cada hilo, fuera del estado de React. Mientras el agente escribe llegan por el WebSocket hasta veinte
 * veces por segundo, y solo los pintan el chat y el estudio del hilo abierto (`useEventos`): la barra lateral, el
 * compositor y el resto de la app no se vuelven a dibujar con cada trozo. Guarda el abierto y los cuatro últimos que se
 * miraron, ya sin salidas repetidas: volver a uno no descarga su registro otra vez. Lo de un hilo que trabajó sin
 * mirarlo se tira y se pide al abrirlo.
 */

/** Un trozo del historial de un hilo, desde el evento `from`, como llega por el WebSocket. */
type Trozo = { from: number; events: AgentEvent[] }

const RECIENTES = 4
const listas = new Map<string, AgentEvent[]>()
/** Los hilos cuyo historial se está pidiendo, con lo que llega mientras tanto, para juntarlo con la respuesta. */
const cargando = new Map<string, Trozo[]>()
/** Por qué no se pudo abrir un hilo (no existe, o el servidor falló): si no, se quedaba en «Cargando…» para siempre. */
const fallos = new Map<string, string>()
/**
 * Lo que se ve de un hilo mientras se vuelve a pedir tras reconectar: va atrasado, pero vaciar el chat hasta que llegue lo
 * nuevo lo hacía parpadear cada vez que el servidor se reiniciaba. Lo que llega mientras tanto espera a lo nuevo.
 */
const viejas = new Set<string>()
/** Panel de etapas: el último borrador de cada `Write` del hilo abierto, de los diez más recientes. */
const escritos = new Map<string, FileDraft[]>()
const oyentes = new Map<string, Set<() => void>>()
let abierto: string | null = null
let conectado = false

function avisar(id: string) {
  oyentes.get(id)?.forEach((f) => f())
}

/**
 * Añade un trozo a la lista de un hilo sin repetir lo que ya tenía. Si falta algo entre los dos, `undefined`: la lista se
 * vuelve a pedir entera. Un hueco no se arregla esperando, y sin esto el hilo abierto dejaba de moverse.
 */
function conTrozo(list: AgentEvent[], { from, events }: Trozo): AgentEvent[] | undefined {
  if (from > list.length) return undefined
  const nuevos = events.slice(list.length - from)
  return nuevos.length ? [...list, ...nuevos] : list
}

/** Pide el historial del hilo abierto si no lo tiene. Lo que llega por el WebSocket mientras tanto se junta después. */
function cargar(id: string) {
  if (!conectado || (listas.has(id) && !viejas.has(id)) || cargando.has(id)) return
  const llegados: Trozo[] = []
  cargando.set(id, llegados)
  const vigente = () => cargando.get(id) === llegados && (cargando.delete(id), true)
  api<{ events: (AgentEvent | null)[] }>(`/api/sessions/${id}/historial`)
    .catch((e) => {
      // Mientras el servidor anterior espera su reinicio automático, conserva la compatibilidad.
      if (e instanceof Error && e.message.includes('aún no conoce esta función')) return api(`/api/sessions/${id}`).then((s) => ({ ...s, events: historialLigero(s.events) }))
      throw e
    })
    .then(
      (s) => {
        if (!vigente()) return
        // Los huecos son lo que no cambia nada: viajan como `null` (`paraMandar`).
        let list: AgentEvent[] | undefined = rellenar(s.events)
        for (const t of llegados) list = list && conTrozo(list, t)
        viejas.delete(id)
        if (list) listas.set(id, list)
        else listas.delete(id)
        fallos.delete(id)
        avisar(id)
        if (!list) cargar(id)
      },
      (e) => {
        if (!vigente()) return
        fallos.set(id, e instanceof Error ? e.message : String(e))
        avisar(id)
      }
    )
}

/** Los que se guardan además del abierto: los últimos que se miraron. */
function recortar() {
  for (const id of listas.keys()) {
    if (listas.size <= RECIENTES + 1) break
    if (id !== abierto) listas.delete(id)
  }
  // Los borradores son archivos enteros: solo se quedan los de los hilos que se guardan.
  for (const id of escritos.keys()) if (id !== abierto && !listas.has(id)) escritos.delete(id)
}

export const eventos = {
  /** Lo que hay guardado de un hilo. */
  lista: (id: string) => listas.get(id),

  /**
   * Cambia el hilo abierto. El que se deja se guarda para volver, salvo si trabaja: sus eventos ya no llegarán aquí, y lo
   * guardado se quedaría atrás.
   */
  abrir(id: string | null, trabaja: (id: string) => boolean) {
    const antes = abierto
    abierto = id
    if (antes && antes !== id && (trabaja(antes) || viejas.has(antes))) listas.delete(antes), viejas.delete(antes)
    if (id) {
      // El más reciente al final: los primeros son los que se sueltan.
      const list = listas.get(id)
      if (list) listas.delete(id), listas.set(id, list)
    }
    recortar()
    for (const otro of cargando.keys()) if (otro !== id) cargando.delete(otro)
    if (id) cargar(id)
  },

  /** Lo que llega por el WebSocket. Solo llegan los del hilo abierto; uno de otro hilo deja lo guardado de ese sin valer. */
  llegan(id: string, trozo: Trozo) {
    cargando.get(id)?.push(trozo)
    const list = listas.get(id)
    if (!list || viejas.has(id)) return
    const nueva = id === abierto ? conTrozo(list, trozo) : undefined
    if (nueva === list) return
    if (nueva) listas.set(id, nueva)
    else listas.delete(id)
    avisar(id)
    if (!nueva && id === abierto) cargar(id)
  },

  /** Un hilo que no se mira cambió (empezó o acabó un turno): lo guardado ya no vale. */
  cambio(id: string) {
    if (id !== abierto && listas.delete(id)) viejas.delete(id), avisar(id)
  },

  quitar(id: string) {
    listas.delete(id)
    viejas.delete(id)
    escritos.delete(id)
    avisar(id)
    // Si estaba abierto (borrado desde otra ventana), se vuelve a pedir y dice que ya no existe.
    if (id === abierto) cargar(id)
  },

  /**
   * Con el WebSocket cerrado no llega nada: al volver, todo lo guardado puede ir atrasado y se vuelve a pedir. El abierto
   * se sigue viendo como estaba hasta que llega (`viejas`). `true` se dice cuando ya se leyó el estado de Sloth.
   */
  conexion(si: boolean) {
    conectado = si
    if (!si) return
    const actual = abierto ? listas.get(abierto) : undefined
    const ids = [...listas.keys(), ...cargando.keys(), ...fallos.keys()]
    listas.clear()
    cargando.clear()
    fallos.clear()
    viejas.clear()
    if (abierto && actual) listas.set(abierto, actual), viejas.add(abierto)
    for (const id of new Set(ids)) if (id !== abierto || !actual) avisar(id)
    if (abierto) cargar(abierto)
  },

  /** Panel de etapas: lo que va escribiendo un `Write`. Solo del hilo abierto, que es el único que lo pinta. */
  escrito(id: string, draft: FileDraft) {
    if (id !== abierto) return
    escritos.set(id, [...(escritos.get(id) ?? []).filter((d) => d.id !== draft.id).slice(-9), draft])
    avisar(id)
  }
}

function oir(id: string, f: () => void) {
  let set = oyentes.get(id)
  if (!set) oyentes.set(id, (set = new Set()))
  set.add(f)
  return () => {
    set.delete(f)
    if (!set.size) oyentes.delete(id)
  }
}

/** Los eventos de un hilo; `undefined` mientras se piden. */
export function useEventos(id: string): AgentEvent[] | undefined {
  return useSyncExternalStore(
    (f) => oir(id, f),
    () => listas.get(id)
  )
}

/** Si no se pudo abrir el hilo, por qué. */
export function useFallo(id: string): string | undefined {
  return useSyncExternalStore(
    (f) => oir(id, f),
    () => fallos.get(id)
  )
}

const SIN_ESCRITOS: FileDraft[] = []
export function useEscritos(id: string): FileDraft[] {
  return useSyncExternalStore(
    (f) => oir(id, f),
    () => escritos.get(id) ?? SIN_ESCRITOS
  )
}

/** Lo que dice la cabecera de un hilo: lo que costó, lo que leyó y escribió, y cuánto ocupa su contexto. */
export type Resumen = {
  cost: number
  read: number
  out: number
  /** El tiempo que el agente pasó trabajando: la suma de cada turno, no lo que lleva abierta la sesión. */
  ms: number
  /** Los turnos sin costo (se cortaron antes de saberlo, fueron el primero tras retomar el hilo o Codex sin precio). */
  sinCosto: number
  context?: { used: number; max: number }
  /** Sube con lo que puede cambiar los archivos de un hilo quieto: un turno que acaba, un aviso, el segundo plano. */
  revision: number
}

/** Por el primer evento de cada hilo: lo sumado hasta ahora. Solo se suma lo nuevo, y si nada cambia va el mismo objeto. */
const sumas = new WeakMap<AgentEvent, { n: number; ultimo: AgentEvent; turnStart: number; r: Resumen }>()
const VACIO: Resumen = { cost: 0, read: 0, out: 0, ms: 0, sinCosto: 0, revision: 0 }

export function resumenDe(events?: AgentEvent[]): Resumen {
  if (!events?.length) return VACIO
  let s = sumas.get(events[0])
  if (!s || s.n > events.length || events[s.n - 1] !== s.ultimo) {
    s = { n: 0, ultimo: events[0], turnStart: 0, r: VACIO }
    sumas.set(events[0], s)
  }
  if (s.n === events.length) return s.r
  const r = { ...s.r }
  for (let i = s.n; i < events.length; i++) {
    const e = events[i]
    if (e.t === 'context') r.context = e
    if (e.t === 'turn_end' || e.t === 'info' || e.t === 'background' || e.t === 'user') r.revision++
    if (e.t === 'turn_start') s.turnStart = e.at
    if (e.t !== 'turn_end') continue
    r.cost += e.costUsd ?? 0
    if (e.costUsd === undefined) r.sinCosto++
    r.read += e.tokens ? e.tokens.input + e.tokens.cacheRead : 0
    r.out += e.tokens?.output ?? 0
    if (s.turnStart) r.ms += e.at - s.turnStart
    s.turnStart = 0
  }
  s.n = events.length
  s.ultimo = events[events.length - 1]
  const igual = (Object.keys(r) as (keyof Resumen)[]).every((k) => r[k] === s.r[k])
  if (!igual) s.r = r
  return s.r
}

/** El resumen del hilo, que solo vuelve a dibujar a quien lo usa cuando cambia (al acabar un turno, al medir el contexto). */
export function useResumen(id: string): Resumen {
  return useSyncExternalStore(
    (f) => oir(id, f),
    () => resumenDe(listas.get(id))
  )
}
