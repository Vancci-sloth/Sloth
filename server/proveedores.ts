import type { Proveedor } from '../shared/providers.ts'
import type { CuentaClaude, LimitesClaude, Model } from '../shared/types.ts'
import type { AgentOptions, AgentRun } from './agent.ts'
import { cancelarAntigravity, conectandoAntigravity, conectarAntigravity, cuentaAntigravity, modelosAntigravity, salirAntigravity, startAntigravity } from './antigravity.ts'
import { startClaude } from './claude.ts'
import { cancelarCursor, conectandoCursor, conectarCursor, cuentaCursor, modelosCursor, salirCursor, startCursor } from './cursor.ts'
import { cuentaDeepSeek, deepseekModels } from './deepseek.ts'
import { cuentaGrok, modelosGrok, startGrok } from './grok.ts'
import { cuentaMuse, modelosMuse, startMuse } from './muse.ts'
import { cuentaPi, llavesPi, modelosPi, startPi } from './pi.ts'

/**
 * Los agentes que llegaron después de Claude, Codex y OpenCode, con lo mismo para cada uno: cómo se arranca (`start`, el
 * de los hilos y el de «Pedir una mejora»), su cuenta (mirarla, conectarla y, si se puede, dejar de esperarla o quitarla) y
 * su catálogo de modelos. Lo usan las rutas
 * `/api/<agente>/…` de server/index.ts y Opciones (`CuentaAgente`, web/src/Opciones.tsx).
 *
 * `como` dice cómo se conecta, para que Opciones lo explique: en una ventana del agente (`ventana`), en el navegador con
 * un enlace (`navegador`) o pegando una llave de API (`llave`, DeepSeek; se guarda con `/api/<agente>/acceso`).
 */
export interface Otro {
  como: 'ventana' | 'navegador' | 'llave'
  start(opts: AgentOptions): AgentRun
  cuenta(fresco?: boolean): Promise<CuentaClaude> | CuentaClaude
  conectar?(): Promise<CuentaClaude>
  cancelar?(): Promise<CuentaClaude> | CuentaClaude
  salir?(): Promise<CuentaClaude> | CuentaClaude
  conectando?(): string | null
  /** Usar las llaves guardadas en Sloth, o no (Pi). */
  llaves?(usar: boolean): Promise<CuentaClaude>
  modelos(): Promise<Model[]>
}

export const OTROS: Partial<Record<Proveedor, Otro>> = {
  deepseek: { como: 'llave', start: startClaude, cuenta: cuentaDeepSeek, modelos: deepseekModels },
  grok: { como: 'ventana', start: startGrok, ...cuentaGrok, modelos: modelosGrok },
  antigravity: { como: 'navegador', start: startAntigravity, cuenta: cuentaAntigravity, conectar: conectarAntigravity, cancelar: cancelarAntigravity, salir: salirAntigravity, conectando: conectandoAntigravity, modelos: modelosAntigravity },
  cursor: { como: 'navegador', start: startCursor, cuenta: cuentaCursor, conectar: conectarCursor, cancelar: cancelarCursor, salir: salirCursor, conectando: conectandoCursor, modelos: modelosCursor },
  muse: { como: 'ventana', start: startMuse, ...cuentaMuse, modelos: modelosMuse },
  pi: { como: 'ventana', start: startPi, ...cuentaPi, llaves: llavesPi, modelos: modelosPi }
}

/** Ninguno de estos informa los límites de un plan a Sloth: se paga por uso o se ve en su página. */
export const sinLimites = (): LimitesClaude => ({ ventanas: [] })

/** Qué se está conectando: reiniciar el servidor cortaría el inicio de sesión. */
export const conectandoOtro = () => Object.values(OTROS).map((o) => o!.conectando?.()).find(Boolean) ?? null
