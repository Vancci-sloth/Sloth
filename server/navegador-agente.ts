import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * El navegador del agente: Playwright MCP en todos los hilos, para abrir, leer y fotografiar páginas que no se dejan leer
 * con WebFetch (`browser_navigate`, `browser_snapshot`, `browser_take_screenshot`…). No se confunde con el de las redes
 * (`server/redes/navegador.ts`).
 *
 * Con la ventana de Sloth abierta, un hilo normal usa su página del navegador integrado (`electron/navegador.ts`): lo que
 * abre el agente se ve en el hilo, sin otra ventana. Playwright se conecta a ella por CDP, a la dirección que la ventana
 * anota en `data/navegador-integrado.json`.
 *
 * Sin la ventana (Sloth en Edge), usa el Chrome del sistema o, sin él, el Edge que trae Windows: no baja navegadores. Un
 * hilo normal lo abre con ventana y con el perfil de Sloth (`data/navegador`, no el tuyo), donde siguen iniciadas las
 * cuentas que abras en él. Solo un proceso puede tener abierto un perfil: si otro hilo lo tiene, Playwright le contesta al
 * agente «Browser is already in use for …\data\navegador». Por eso se cierra tras `OCIOSO` sin usarse, y el siguiente
 * uso lo vuelve a abrir. Un video de un lote, que nadie mira, lo abre sin ventana y con un perfil limpio en memoria: así
 * no chocan entre ellos ni te llenan la pantalla.
 *
 * Si el paquete no está instalado o no se encuentra, los hilos arrancan igual, sin navegador.
 *
 * Playwright no se lanza con el hilo: `navegador-mcp.mjs` le contesta al agente hasta que usa una herramienta.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERFIL = join(APP, 'data', 'navegador')
const INTEGRADO = join(APP, 'data', 'navegador-integrado.json')
/** Las capturas y lo que el MCP guarda solo, fuera del repo. Con tope: lo más viejo se borra al pasarlo. */
const CAPTURAS = join(APP, 'data', 'navegador-capturas')
const TOPE_CAPTURAS = 200 * 1024 * 1024
/** Lo que espera la ventana de un hilo normal sin que el agente la use antes de cerrarse y soltar el perfil. */
const OCIOSO = 10 * 60_000
/** El intermediario que lanza Playwright a demanda, y lo que tarda en soltarlo: con el navegador integrado, lo de `OCIOSO`. */
const A_DEMANDA = join(APP, 'server', 'navegador-mcp.mjs')

/**
 * Lo que se les dice a los agentes que no son Claude. Sin esto, Codex abría las páginas con curl o con su propio navegador
 * (5 de 6 veces): no se veían en el hilo, y lo que pinta la página con JavaScript no siempre llegaba.
 */
export const USA_EL_NAVEGADOR = 'Para abrir o leer una página web usa siempre las herramientas browser_ del servidor MCP navegador de Sloth (browser_navigate para abrirla, browser_snapshot para leerla): lo que abres ahí se ve en el hilo y carga como en un navegador de verdad. No uses curl ni otro navegador para eso, ni contestes de memoria lo que hay en una página.'

/** Donde se instalan Chrome y Edge en cada sistema: donde los busca Playwright. */
const programas = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter((p): p is string => !!p)
const [CHROME, EDGE] =
  process.platform === 'win32'
    ? [programas.map((p) => join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')), programas.map((p) => join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))]
    : process.platform === 'darwin'
      ? [['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'], ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']]
      : [['/opt/google/chrome/chrome'], ['/opt/microsoft/msedge/msedge']]

/** El canal del navegador del sistema: Chrome si está, si no Edge. `null` si no hay ninguno. */
function delSistema(): 'chrome' | 'msedge' | null {
  if (CHROME.some((p) => existsSync(p))) return 'chrome'
  return EDGE.some((p) => existsSync(p)) ? 'msedge' : null
}

/** El CLI de Playwright MCP y su versión. El paquete solo exporta su package.json: el CLI está a su lado. `null` si no está instalado. */
function cli(): { js: string; version: string } | null {
  try {
    const paquete = createRequire(import.meta.url).resolve('@playwright/mcp/package.json')
    const js = join(dirname(paquete), 'cli.js')
    return existsSync(js) ? { js, version: JSON.parse(readFileSync(paquete, 'utf8')).version } : null
  } catch {
    return null
  }
}

/**
 * La dirección del navegador integrado, si la ventana de Sloth que la anotó sigue abierta. `redes` y `voz`: tiene la
 * página de las redes (`server/redes/navegador.ts`) o la de la voz (`server/voz/`), con su propio perfil.
 */
export function integrado(): { puerto: number; secreto: string; redes: boolean; voz: boolean } | null {
  try {
    const { puerto, secreto, pid, redes, voz } = JSON.parse(readFileSync(INTEGRADO, 'utf8'))
    process.kill(pid, 0)
    return typeof puerto === 'number' && typeof secreto === 'string' ? { puerto, secreto, redes: redes === true, voz: voz === true } : null
  } catch {
    // No hay archivo, o la ventana que lo anotó ya se cerró.
    return null
  }
}

/**
 * Para `mcpServers` del SDK. Vacío si falta el paquete o el navegador: el hilo trabaja igual, sin él. `hilo`: el hilo
 * cuya página del navegador integrado usa, si la ventana de Sloth está abierta.
 */
export function navegadorAgente(lote?: boolean, hilo?: string): Record<string, McpStdioServerConfig> {
  const playwright = cli()
  if (!playwright) return {}
  const { js, version } = playwright
  const mcp = (args: string[], suelta = 0): Record<string, McpStdioServerConfig> => ({
    navegador: { type: 'stdio', command: process.execPath, args: [A_DEMANDA, join(APP, 'data', `navegador-herramientas-${version}.json`), String(suelta), js, ...args] }
  })
  // Rutas absolutas: las capturas quedan fuera de la carpeta del hilo, y Read de Claude Code las pide así.
  const salida = ['--output-dir', CAPTURAS, '--output-max-size', String(TOPE_CAPTURAS), '--file-paths', 'absolute']
  const ventana = !lote && hilo ? integrado() : null
  if (ventana) {
    const cdp = `ws://127.0.0.1:${ventana.puerto}/${ventana.secreto}/${encodeURIComponent(hilo!)}`
    return mcp(['--cdp-endpoint', cdp, ...salida], OCIOSO)
  }
  const canal = delSistema()
  if (!canal) return {}
  const args = ['--browser', canal, ...salida]
  if (lote) args.push('--isolated', '--headless')
  // Si otro hilo ya tiene abierto el perfil, este arranca con uno limpio, con ventana: con el de Sloth, Playwright le
  // contestaría «Browser is already in use» en cuanto lo usara.
  else if (existsSync(PERFIL) && perfilAbierto()) args.push('--isolated')
  else args.push('--user-data-dir', PERFIL, '--idle-timeout', String(OCIOSO))
  return mcp(args)
}

/** Si hay un navegador abierto con el perfil: Chrome tiene tomado su `lockfile` mientras vive (como lo mira Playwright). */
function perfilAbierto(): boolean {
  try {
    closeSync(openSync(join(PERFIL, 'lockfile'), 'r+'))
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT'
  }
}
