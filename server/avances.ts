import { esDeEstudio } from '../shared/etapas.ts'
import type { AgentEvent, AvanceCorto, Card, ServerPush } from '../shared/types.ts'
import { avanceCorto } from './etapas.ts'
import type { Sessions } from './sessions.ts'

/**
 * La barra lateral dice de cada video en qué fase va y cuántas etapas lleva. Se calcula aquí, con lo mismo que lee el
 * estudio (`avanceCorto`), una vez por hilo al arrancar y otra solo cuando algo lo puede mover: acaba una herramienta o
 * un turno, se vacía el segundo plano o cambia su carpeta (el aviso `etapas`). Lo que cambió va por el WebSocket
 * (`avance`): la interfaz no pregunta. Quitarlo es borrar este archivo, sus líneas en server/index.ts, `AvanceCorto` y
 * las líneas marcadas «avance» en web/src.
 */

/** Cuánto se espera tras un aviso antes de mirar: los que llegan mientras tanto (un turno de muchas herramientas) van juntos. */
const JUNTAR = 1000

/** Lo que puede haber dejado archivos nuevos en la carpeta del hilo. */
const mueve = (e: AgentEvent) => e.t === 'turn_end' || e.t === 'background' || (e.t === 'tool_update' && !!e.done)

export function avances(sessions: Sessions, cards: () => Card[], avisar: (msg: ServerPush) => void) {
  const vistos = new Map<string, AvanceCorto>()
  const relojes = new Map<string, ReturnType<typeof setTimeout>>()

  function mirar(id: string) {
    relojes.delete(id)
    const meta = sessions.meta(id)
    const card = meta && cards().find((c) => c.id === meta.cardId)
    if (!meta || !card || !esDeEstudio(card)) return void vistos.delete(id)
    try {
      const { avance, fresco } = avanceCorto(meta, card)
      // Un MP4 que se seguía escribiendo no contó: se vuelve a mirar cuando acabe, aunque nada más cambie.
      if (fresco) luego(id, fresco - Date.now() + 200)
      if (JSON.stringify(avance) === JSON.stringify(vistos.get(id))) return
      vistos.set(id, avance)
      avisar({ type: 'avance', sessionId: id, avance })
    } catch (error) {
      console.error(`No se pudo leer el avance de ${id}: ${error instanceof Error ? error.message : error}`)
    }
  }

  /** Mira el hilo dentro de un rato. Si ya iba a mirarlo, no lo pide otra vez: esa vez ya ve lo de ahora. */
  function luego(id: string, ms = JUNTAR) {
    if (!relojes.has(id)) relojes.set(id, setTimeout(() => mirar(id), ms))
  }

  /**
   * Todos, al arrancar y cuando cambian las cards: unos milisegundos cada uno (con el disco frío, más), así que de uno en
   * uno, para no frenar lo demás. Primero los que se ven, sin archivar.
   */
  let cola: string[] = []
  function repasar() {
    const parada = !cola.length
    cola = sessions
      .list()
      .sort((a, b) => Number(!!a.archived) - Number(!!b.archived))
      .map((s) => s.id)
    if (parada) setImmediate(siguiente)
  }
  function siguiente() {
    const id = cola.shift()
    if (id === undefined) return
    mirar(id)
    setImmediate(siguiente)
  }
  repasar()

  return {
    /** Lo que se sabe de cada video, para `/api/state`. */
    todos: (): Record<string, AvanceCorto> => Object.fromEntries(vistos),
    /** Oye lo que se manda por el WebSocket, que dice cuándo puede haber cambiado el avance de un hilo. */
    oir(msg: ServerPush) {
      if ((msg.type === 'events' && msg.events.some(mueve)) || msg.type === 'etapas') luego(msg.sessionId)
      // Un hilo nuevo.
      else if (msg.type === 'session' && !vistos.has(msg.session.id)) luego(msg.session.id)
      // Las etapas de una card pueden haber cambiado.
      else if (msg.type === 'cards') repasar()
      else if (msg.type === 'removed') {
        clearTimeout(relojes.get(msg.sessionId))
        relojes.delete(msg.sessionId)
        vistos.delete(msg.sessionId)
      }
    }
  }
}
