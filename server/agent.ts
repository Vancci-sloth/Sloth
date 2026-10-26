import type { AgentEvent, FileDraft } from '../shared/types.ts'

/** Una sesión viva con el agente: Claude o Codex, con los mismos eventos para la interfaz. */
export interface AgentRun {
  /** Manda un mensaje del usuario, con sus imágenes (rutas). Abre un turno. */
  send(text: string, skill?: SkillRef, images?: string[]): void
  /** Mete un mensaje en el turno que está en curso, sin abrir otro: el agente lo lee entre una herramienta y la siguiente. */
  steer(text: string, images?: string[]): void
  /** Compacta el historial del proveedor, sin mandar un mensaje al modelo. */
  compact?(): void
  /** Corta el turno en curso. */
  interrupt(): Promise<void>
  /** Cierra el proceso del agente. */
  close(): void
}

/** La skill que invoca el mensaje (`/<name>`), por el nombre de su carpeta en ~/.claude/skills. */
export interface SkillRef {
  name: string
  path?: string
}

export interface AgentOptions {
  cwd: string
  model: string
  effort?: string
  /** Para retomar una sesión que ya existía. */
  resume?: string
  /** Un video de un lote: nadie lo mira mientras trabaja (su navegador va sin ventana y con un perfil limpio). */
  lote?: boolean
  /** El hilo: su agente usa la página del hilo en el navegador integrado. */
  hilo?: string
  onEvent(event: AgentEvent): void
  onProviderSession(id: string): void
  /** Lo que lleva escrito un `Write` antes de terminar. Opcional: no todo proveedor lo da. */
  onDraft?(draft: FileDraft): void
  /** Una herramienta empieza a escribirse: aún no corre. Opcional, como `onDraft`. */
  onToolStart?(id: string): void
  /**
   * El proceso del agente ya no está: lo que se le mande se perdería, el siguiente mensaje abre otro. Con `caida`, se cayó
   * (no lo cerró Sloth), y `turno` dice si cortó un turno a la mitad.
   */
  onExit?(caida?: { error: string; turno: boolean }): void
}

/** Las imágenes que se pueden adjuntar, por extensión. */
export const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

/** Una cola que se lee con `for await`: los mensajes del usuario entran aquí y el agente los va tomando. */
export class Inbox<T> implements AsyncIterable<T> {
  private items: T[] = []
  private waiting: ((r: IteratorResult<T>) => void) | null = null
  private ended = false

  push(item: T) {
    if (this.waiting) {
      this.waiting({ value: item, done: false })
      this.waiting = null
    } else this.items.push(item)
  }

  end() {
    this.ended = true
    this.waiting?.({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item !== undefined) return Promise.resolve({ value: item, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => (this.waiting = resolve))
      }
    }
  }
}

export function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text) : part?.type === 'image' ? '[imagen]' : JSON.stringify(part)))
      .join('\n')
  }
  return JSON.stringify(value, null, 2)
}
