import type { AgentEvent } from './types.ts'

/** La pantalla necesita la última salida, no todas sus copias crecientes. Mantiene los índices del WebSocket. */
export function historialLigero(events: AgentEvent[]): AgentEvent[] {
  const ultimas = new Map<string, number>()
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.t === 'tool_update' && e.output !== undefined) ultimas.set(e.id, i)
  }
  return events.map((e, i) => {
    if (e.t !== 'tool_update' || i >= (ultimas.get(e.id) ?? -1)) return e
    const { output: _, delta: __, ...resto } = e
    return resto
  })
}

/** Lo que no cambia nada en la pantalla: un aviso de herramienta sin salida y sin acabar (lo que deja `historialLigero`). */
const vacio = (e: AgentEvent) => e.t === 'tool_update' && e.output === undefined && !e.delta && !e.done && !e.error && !e.largo

/** Desde este tamaño, la salida de una herramienta que acabó no se manda al abrir el hilo. */
export const CORTE_SALIDA = 500

/**
 * Para abrir un hilo: las salidas largas de lo que ya acabó se quedan en el servidor, y su última línea dice cuánto miden
 * (`largo`). Solo se ven al abrir su fila, que las pide entonces (`salidaDe`), y eran el 76 % de lo que se bajaba. Lo que
 * sigue trabajando va entero: lo que falta le llega en trozos que se suman a lo que ya tiene.
 */
export function sinSalidasLargas(events: AgentEvent[]): AgentEvent[] {
  const salidas = new Map<string, { largo: number; ultima: number; acabada: boolean }>()
  events.forEach((e, i) => {
    if (e.t !== 'tool_update') return
    let s = salidas.get(e.id)
    if (!s) salidas.set(e.id, (s = { largo: 0, ultima: -1, acabada: false }))
    if (e.output !== undefined) s.largo = e.output.length
    if (e.delta) s.largo += e.delta.length
    if (e.output !== undefined || e.delta) s.ultima = i
    if (e.done) s.acabada = true
  })
  return events.map((e, i) => {
    if (e.t !== 'tool_update') return e
    const s = salidas.get(e.id)!
    if (!s.acabada || s.largo <= CORTE_SALIDA) return e
    const { output: _, delta: __, ...resto } = e
    return i === s.ultima ? { ...resto, largo: s.largo } : resto
  })
}

/** La salida entera de una herramienta. */
export function salidaDe(events: AgentEvent[], id: string): string {
  let salida = ''
  for (const e of events) {
    if (e.t !== 'tool_update' || e.id !== id) continue
    if (e.output !== undefined) salida = e.output
    if (e.delta) salida += e.delta
  }
  return salida
}

/**
 * Para mandar a la pantalla: lo que no cambia nada va como `null` y conserva su sitio, que es su índice en el WebSocket.
 * En un hilo largo eran decenas de miles y casi la mitad de lo que se bajaba al abrirlo. `rellenar` los vuelve eventos.
 */
export const paraMandar = (events: AgentEvent[]): (AgentEvent | null)[] => events.map((e) => (vacio(e) ? null : e))

/** Un evento que no hace nada, el mismo para todos los huecos. */
const NADA: AgentEvent = { t: 'tool_update', id: '' }
export const rellenar = (events: (AgentEvent | null)[]): AgentEvent[] => events.map((e) => e ?? NADA)
