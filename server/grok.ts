import { entornoSinLlaves } from './acceso.ts'
import { execFile } from 'node:child_process'
import type { Model } from '../shared/types.ts'
import type { AgentOptions, AgentRun } from './agent.ts'
import { startAcp, type SaborAcp } from './acp.ts'
import { rutaAgente } from './agentes.ts'
import { cuentaConVentana } from './cuenta-ventana.ts'
import { RpcLineas } from './rpc-lineas.ts'

/**
 * Grok, el agente de xAI (`@xai-official/grok`), por ACP (`server/acp.ts`), como en T3 Code. Trabaja con la cuenta de
 * Grok de cada quien (`grok login`, que la guarda en `~/.grok`, la misma que usa en la terminal). Sin permisos
 * (`--always-approve`), como los demás agentes de Sloth.
 */

/** Sin el actualizador: abre consolas en Windows, y la versión la fija Sloth (`server/agentes.ts`). */
const entorno = () => ({ ...entornoSinLlaves(), GROK_DISABLE_AUTOUPDATER: '1', GROK_OAUTH2_REFERRER: 'sloth' })

const SABOR: SaborAcp = {
  nombre: 'Grok',
  prefijo: 'grok',
  lanzar() {
    const exe = rutaAgente('grok')
    if (!exe) throw new Error('Grok aún no está descargado.')
    return { command: exe, args: ['agent', '--always-approve', 'stdio'], env: entorno() }
  },
  // Ctrl+C: que lo que termine de fondo no lo despierte hasta el siguiente mensaje.
  cancelarMeta: { cancelTrigger: 'ctrl_c' },
  sinCuenta: 'Conecta tu cuenta de Grok en Opciones.'
}

export const startGrok = (opts: AgentOptions): AgentRun => startAcp(SABOR, opts)

/** `grok models` dice si hay sesión. Sale siempre con 0. */
function salidaModels(): Promise<string> {
  const exe = rutaAgente('grok')
  if (!exe) return Promise.resolve('')
  return new Promise((ok) => execFile(exe, ['models'], { timeout: 30_000, windowsHide: true, env: entorno() }, (_e, salida) => ok(String(salida ?? ''))))
}

export const cuentaGrok = cuentaConVentana('grok', {
  comando: (exe) => ({ command: [exe, 'login'], env: { GROK_DISABLE_AUTOUPDATER: '1' } }),
  async estado() {
    const s = await salidaModels()
    // Con la sesión vencida dice que no y la renueva en el mismo proceso: se pregunta otra vez (T3 Code).
    const conectada = (t: string) => /logged in/i.test(t) && !/not (authenticated|logged in)/i.test(t)
    return { conectada: conectada(s) || conectada(await salidaModels()) }
  }
})

/**
 * Los modelos de Grok con sus esfuerzos y su ventana, como los da al presentarse por ACP (`modelState`), sin abrir
 * sesión. Vacío si Grok no se ha bajado o no hay cuenta.
 */
export async function modelosGrok(): Promise<Model[]> {
  const exe = rutaAgente('grok')
  if (!exe || !(await cuentaGrok.cuenta()).conectada) return []
  const r = new RpcLineas('Grok', exe, ['agent', 'stdio'], { cwd: process.cwd(), env: entorno() }, { alAvisar() {}, alPedir() {}, alCerrar() {} })
  try {
    const ini = await r.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'sloth', version: '1' } }, 60_000)
    const modelos: { modelId: string; name?: string; _meta?: { reasoningEffort?: string; reasoningEfforts?: { value: string }[] } }[] = ini?._meta?.modelState?.availableModels ?? []
    return modelos.map((m) => ({ id: `grok:${m.modelId}`, label: `Grok · ${m.name ?? m.modelId}`, efforts: (m._meta?.reasoningEfforts ?? []).map((e) => e.value), defaultEffort: m._meta?.reasoningEffort }))
  } catch {
    return []
  } finally {
    r.close()
  }
}
