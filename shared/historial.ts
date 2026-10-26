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
const vacio = (e: AgentEvent) => e.t === 'tool_update' && e.output === undefined && !e.delta && !e.done && !e.error

/**
 * Para mandar a la pantalla: lo que no cambia nada va como `null` y conserva su sitio, que es su índice en el WebSocket.
 * En un hilo largo eran decenas de miles y casi la mitad de lo que se bajaba al abrirlo. `rellenar` los vuelve eventos.
 */
export const paraMandar = (events: AgentEvent[]): (AgentEvent | null)[] => events.map((e) => (vacio(e) ? null : e))

/** Un evento que no hace nada, el mismo para todos los huecos. */
const NADA: AgentEvent = { t: 'tool_update', id: '' }
export const rellenar = (events: (AgentEvent | null)[]): AgentEvent[] => events.map((e) => e ?? NADA)
