import type { AgentEvent } from '../shared/types.ts'

/** Agrupa el streaming de cada hilo: una actualización cada 50 ms conserva el orden sin repintar por cada token. */
export function eventosEnVivo(enviar: (id: string, from: number, events: AgentEvent[]) => void) {
  const pendientes = new Map<string, { from: number; events: AgentEvent[] }>()
  let timer: ReturnType<typeof setTimeout> | undefined
  return (id: string, from: number, events: AgentEvent[]) => {
    const previo = pendientes.get(id)
    if (previo && previo.from + previo.events.length === from) previo.events.push(...events)
    else {
      if (previo) enviar(id, previo.from, previo.events)
      pendientes.set(id, { from, events: [...events] })
    }
    timer ??= setTimeout(() => {
      timer = undefined
      const lotes = [...pendientes]
      pendientes.clear()
      for (const [id, lote] of lotes) enviar(id, lote.from, lote.events)
    }, 50)
    timer.unref()
  }
}
