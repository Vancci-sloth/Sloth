import { execFile } from 'node:child_process'
import type { Model } from '../shared/types.ts'
import { entornoSinLlaves } from './acceso.ts'
import type { AgentOptions, AgentRun } from './agent.ts'
import { startAcp, type SaborAcp } from './acp.ts'
import { rutaAgente } from './agentes.ts'
import { cuentaConVentana } from './cuenta-ventana.ts'

/**
 * omp (oh-my-pi, `can1357/oh-my-pi`: Pi con más herramientas), por ACP (`omp acp`, `server/acp.ts`), como Grok y Gemini.
 * Trabaja con lo que cada quien conecte en él con `omp login` (su plan de Claude, ChatGPT o Copilot, o una llave de API
 * como la de DeepSeek u OpenRouter) y con las llaves de las variables de su usuario. Lo guarda en `~/.omp`: es el mismo omp
 * de la terminal, y si ya está instalado se usa ese (`server/agentes.ts`). No ve las llaves que guardaste en Sloth
 * (`entornoSinLlaves`). Sloth acepta cada herramienta que pide, como con los demás de ACP.
 *
 * Idea y primera versión: Ancordss (PR #32).
 */

/** Sin el título que omp le pide a un modelo al empezar cada sesión: sería otra llamada, y el hilo ya tiene el suyo. */
const entorno = () => ({ ...entornoSinLlaves(), PI_NO_TITLE: '1' })

const SABOR: SaborAcp = {
  nombre: 'omp',
  prefijo: 'omp',
  lanzar() {
    const exe = rutaAgente('omp')
    if (!exe) throw new Error('omp aún no está descargado.')
    return { command: exe, args: ['acp'], env: entorno() }
  },
  sinCuenta: 'Conecta un proveedor en omp, en Opciones.'
}

export const startOmp = (opts: AgentOptions): AgentRun => startAcp(SABOR, opts)

/** Un modelo de `omp models --json`. */
interface ModeloOmp {
  provider: string
  id: string
  /** `proveedor/modelo`: lo que se elige en la sesión. */
  selector?: string
  name?: string
  /** Los niveles de pensamiento que acepta (`low`, `high`…); `null` si no piensa. */
  thinking?: string[] | null
}

/**
 * Los modelos que omp puede usar ya: `omp models --json` solo trae los de los proveedores con credenciales (las de
 * `omp login` y las de las variables), sin enseñarlas. Vacío si omp no está, falla o no tiene ninguno.
 */
function catalogo(): Promise<ModeloOmp[]> {
  const exe = rutaAgente('omp')
  if (!exe) return Promise.resolve([])
  return new Promise((ok) =>
    execFile(exe, ['models', '--json'], { timeout: 60_000, windowsHide: true, env: entorno(), maxBuffer: 16 * 1024 * 1024 }, (_e, salida) => {
      try {
        ok((JSON.parse(String(salida)) as { models?: ModeloOmp[] }).models ?? [])
      } catch {
        ok([])
      }
    })
  )
}

/** Los modelos de los proveedores que conectaste en omp, con sus niveles de pensamiento. */
export async function modelosOmp(): Promise<Model[]> {
  return (await catalogo()).map((m) => {
    const efforts = m.thinking ?? []
    return { id: `omp:${m.selector ?? `${m.provider}/${m.id}`}`, label: `omp · ${m.name ?? m.id} (${m.provider})`, efforts, defaultEffort: efforts.includes('high') ? 'high' : undefined }
  })
}

/**
 * La cuenta: omp tiene una si tiene algún modelo que usar, y quién son sus proveedores («anthropic, deepseek»). Conectar
 * abre `omp login` en su ventana, donde se elige el proveedor y se siguen sus pasos.
 */
export const cuentaOmp = cuentaConVentana('omp', {
  comando: (exe) => ({ command: [exe, 'login'] }),
  async estado() {
    const proveedores = [...new Set((await catalogo()).map((m) => m.provider))]
    return { conectada: proveedores.length > 0, quien: proveedores.join(', ') || undefined }
  }
})
