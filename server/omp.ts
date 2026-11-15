import { execFile } from 'node:child_process'
import type { Model } from '../shared/types.ts'
import { entornoAgente } from './acceso.ts'
import { startAcp, type SaborAcp } from './acp.ts'
import { comandoAgente } from './agentes.ts'
import { cuentaConVentana } from './cuenta-ventana.ts'
import type { AgentOptions, AgentRun } from './agent.ts'

/**
 * omp (oh-my-pi, el Pi con más cosas: can1357/oh-my-pi), por ACP (`omp acp`), como Grok y Gemini. Trabaja con lo que
 * cada quien conecte en él con `omp login` (Claude, ChatGPT, Copilot, DeepSeek, OpenCode Zen, una llave de API…), que
 * guarda en `~/.omp`, el mismo omp de la terminal; por eso usa `entornoAgente` y no le pasa las llaves de Sloth. Si ya está
 * instalado (Homebrew, bun, npm global), se usa ese y no se baja otro (`ompDelSistema`). Los MCP
 * de Sloth (el navegador y la voz) entran con `session/new`, como a los demás de ACP.
 */

const SABOR: SaborAcp = {
  nombre: 'omp',
  prefijo: 'omp',
  lanzar() {
    const c = comandoAgente('omp')
    if (!c) throw new Error('omp aún no está descargado.')
    return { command: c.command, args: [...c.args, 'acp'], env: entornoAgente('omp') }
  },
  sinCuenta: 'Conecta tu cuenta de omp en Opciones.'
}

export const startOmp = (opts: AgentOptions): AgentRun => startAcp(SABOR, opts)

/** Un comando de omp, sin ventana. Vacío si no se ha bajado o falla. */
function salida(args: string[], timeout = 30_000): Promise<string> {
  const c = comandoAgente('omp')
  if (!c) return Promise.resolve('')
  return new Promise((ok) =>
    execFile(c.command, [...c.args, ...args], { timeout, windowsHide: true, env: entornoAgente('omp'), maxBuffer: 32 * 1024 * 1024 }, (_e, texto) => ok(String(texto ?? '')))
  )
}

/**
 * Los proveedores que ya tienen credenciales en omp. `auth export` los trae con sus llaves: se leen en memoria para
 * saber cuáles hay y no se guardan ni se registran en ningún sitio.
 */
async function proveedoresConectados(): Promise<string[]> {
  try {
    const { credentials } = JSON.parse(await salida(['auth', 'export'])) as { credentials?: { provider?: string }[] }
    return [...new Set((credentials ?? []).flatMap((c) => (c.provider ? [c.provider] : [])))]
  } catch {
    return []
  }
}

interface ModeloOmp {
  provider: string
  id: string
  selector?: string
  name?: string
  /** Los niveles de pensamiento que acepta este modelo (`low`, `high`, `max`…). */
  thinking?: string[] | null
}

/**
 * Los modelos de los proveedores que conectaste en omp, con sus niveles de pensamiento. Vacío si omp no se ha bajado o no
 * tiene ninguna cuenta: el catálogo de omp trae todos los proveedores, y sin filtrar saldrían cientos que no se pueden usar.
 */
export async function modelosOmp(): Promise<Model[]> {
  if (!comandoAgente('omp')) return []
  const [conectados, texto] = await Promise.all([proveedoresConectados(), salida(['models', '--json'], 60_000)])
  if (!conectados.length) return []
  try {
    const { models } = JSON.parse(texto) as { models?: ModeloOmp[] }
    const hay = new Set(conectados)
    return (models ?? []).filter((m) => hay.has(m.provider)).map((m) => {
      const efforts = m.thinking ?? []
      return {
        id: `omp:${m.selector ?? `${m.provider}/${m.id}`}`,
        label: `omp · ${m.name ?? m.id} (${m.provider})`,
        efforts,
        defaultEffort: efforts.includes('high') ? 'high' : undefined
      }
    })
  } catch {
    return []
  }
}

/**
 * La cuenta: omp tiene una si tiene al menos un proveedor con credenciales. Conectar abre omp en su ventana, en `omp login`,
 * donde se elige el proveedor y se sigue su paso.
 */
export const cuentaOmp = cuentaConVentana('omp', {
  comando: (exe) => ({ command: [exe, 'login'] }),
  async estado() {
    const proveedores = await proveedoresConectados()
    return { conectada: proveedores.length > 0, quien: proveedores.join(', ') || undefined }
  }
})
