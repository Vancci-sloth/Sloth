import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CuentaClaude, Model } from '../shared/types.ts'
import { conLlave, entornoSinLlaves, llaveGuardada } from './acceso.ts'
import type { AgentOptions, AgentRun } from './agent.ts'
import { conectar, soltar, startAcp, type SaborAcp } from './acp.ts'
import { asegurarAgente, comandoAgente, rutaAgente } from './agentes.ts'
import { guardar } from './disco.ts'

/**
 * Gemini CLI de Google (`@google/gemini-cli`), por ACP (`server/acp.ts`), con la llave de API de AI Studio de cada quien.
 * No es Antigravity: desde el 18-jun-2026 Gemini CLI ya no acepta cuentas personales de Google (gratis, Pro, Ultra), aunque
 * por ACP siga anunciando `oauth-personal`. Por eso aquí no hay inicio de sesión. ADR 0013.
 *
 * Todo lo suyo va en `data/gemini` (`GEMINI_CLI_HOME`), no en el `~/.gemini` que tenga el usuario. Sin confiar en la
 * carpeta no hay `yolo` ni MCP de Sloth (`GEMINI_CLI_TRUST_WORKSPACE`), así que también lee el `.gemini/` y el `.env` de la
 * carpeta del hilo, como cualquier agente que corre sin permisos.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATOS = join(APP, 'data', 'gemini')
const AJUSTES = join(DATOS, '.gemini', 'settings.json')
const USO = 'https://aistudio.google.com/usage'
const SIN_LLAVE = 'Pega tu llave de API de Gemini en Opciones.'

/** Las credenciales de Google del entorno mandarían sobre la llave guardada, y cobrarían en otra cuenta. */
const FUERA = /^(GEMINI_.*|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_.*|GOOGLE_GENAI_.*|GCLOUD_PROJECT|CLOUDSDK_CORE_PROJECT)$/i

/** Sin el actualizador (la versión la fija Sloth, `server/agentes.ts`) y sin mandarle estadísticas a Google. */
function ajustar() {
  mkdirSync(dirname(AJUSTES), { recursive: true })
  guardar(AJUSTES, JSON.stringify({ general: { enableAutoUpdate: false, enableAutoUpdateNotification: false }, privacy: { usageStatisticsEnabled: false } }, null, 2))
}

/** Lo que Google contesta con su JSON crudo, en palabras de Sloth. */
export function errorGemini(mensaje: string): string | undefined {
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(mensaje)) return 'Google no aceptó tu llave de Gemini. Cámbiala en Opciones.'
  if (/RESOURCE_EXHAUSTED|\b429\b/.test(mensaje)) return 'Llegaste al límite de tu llave de Gemini. Espera un poco o activa la facturación en AI Studio.'
}

const SABOR: SaborAcp = {
  nombre: 'Gemini',
  prefijo: 'gemini',
  lanzar() {
    const llave = llaveGuardada('gemini')
    if (!llave) throw new Error(SIN_LLAVE)
    const programa = comandoAgente('gemini')
    if (!programa) throw new Error('Gemini CLI aún no está descargado.')
    ajustar()
    const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(entornoSinLlaves()).filter(([k]) => !FUERA.test(k)))
    // Sin relanzarse: de otro modo son dos procesos de Node por hilo.
    Object.assign(env, { GEMINI_API_KEY: llave, GEMINI_CLI_HOME: DATOS, GEMINI_CLI_TRUST_WORKSPACE: 'true', GEMINI_CLI_NO_RELAUNCH: 'true' })
    return { command: programa.command, args: [...programa.args, '--acp'], env }
  },
  autenticar: 'gemini-api-key',
  modo: 'yolo',
  // Comprime solo el contexto, y su ACP no tiene comando para pedirlo.
  sinCompactar: true,
  sinCuenta: SIN_LLAVE,
  traducir: errorGemini
}

export const startGemini = (opts: AgentOptions): AgentRun => startAcp(SABOR, opts)

/** La cuenta es la llave. Google no dice cuánto queda: el uso se ve en AI Studio. */
export function cuentaGemini(): CuentaClaude {
  return llaveGuardada('gemini') ? { ...conLlave('gemini'), uso: USO } : { conectada: false }
}

/**
 * Los modelos que ofrece a una sesión, sin esfuerzos: no los elige ACP. Con la llave y sin programa, lo baja, y al acabar
 * se vuelven a pedir (`alBajarAgente`): Opciones no tiene otro momento para bajarlo. Vacío sin llave.
 */
export async function modelosGemini(): Promise<Model[]> {
  if (!llaveGuardada('gemini')) return []
  if (!rutaAgente('gemini')) {
    void asegurarAgente('gemini').catch(() => {})
    return []
  }
  let c: ReturnType<typeof conectar> | undefined
  try {
    ajustar()
    c = conectar(SABOR, { cwd: DATOS } as AgentOptions)
    await c.ini
    const s = await c.rpc.request('session/new', { cwd: DATOS, mcpServers: [] }, 60_000)
    const modelos: { modelId: string; name?: string }[] = s?.models?.availableModels ?? []
    return modelos.map((m) => ({ id: `gemini:${m.modelId}`, label: `Gemini · ${m.name ?? m.modelId}`, efforts: [] }))
  } catch {
    return []
  } finally {
    if (c) soltar(SABOR, c)
  }
}
