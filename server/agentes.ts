import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Proveedor } from '../shared/providers.ts'
import type { EstadoAgente } from '../shared/types.ts'
import type { AgentOptions, AgentRun } from './agent.ts'
import { correr } from './version.ts'

/**
 * El programa de cada agente (Claude Code, Codex, OpenCode) pesa entre 250 y 460 MB, y casi nadie usa los tres: no viene
 * en el instalador. Se baja la primera vez que alguien elige ese agente (en la bienvenida, en Opciones o al mandar el
 * primer mensaje de un hilo suyo), con el npm que trae Sloth, a `PIEZAS/<agente>`, y queda para las siguientes versiones
 * mientras no cambie la suya. Lo mismo para los proveedores que vengan: una entrada más en `AGENTES`.
 *
 * En el repo (y en las versiones de Sloth que aún lo traían dentro) el programa ya está en node_modules de la app, y se
 * usa ese.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PIEZAS = join(process.env.APPDATA ?? '', 'sloth', 'piezas', 'agentes')
const WINDOWS = process.platform === 'win32'
const plataforma = `${process.platform}-${process.arch}`

/**
 * La versión de un paquete que trae la app (el SDK de Claude, el lanzador de Codex, el cliente de OpenCode): la del
 * programa va con ella.
 */
const versionDe = (paquete: string): string => JSON.parse(readFileSync(join(APP, 'node_modules', paquete, 'package.json'), 'utf8')).version

interface Agente {
  nombre: string
  /** Lo que se instala con npm, con su versión. */
  paquete(): string
  /** El ejecutable dentro de un node_modules, o `null` si el sistema no lo admite. */
  exe(modulos: string): string | null
  /** Lo que pesa, para decirlo antes de bajarlo. */
  pesa: string
}

const CODEX: Record<string, string> = {
  'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc',
  'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl'
}
/** El paquete de OpenCode de cada sistema: `windows` donde Node dice `win32`. La variante `-baseline`, sin AVX2. */
const OPENCODE = `@opencode/cli-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`

const AGENTES: Record<Proveedor, Agente> = {
  claude: {
    nombre: 'Claude Code',
    // Solo el programa: el SDK, que importa el servidor, viene en la app.
    paquete: () => `@anthropic-ai/claude-agent-sdk-${plataforma}@${versionDe('@anthropic-ai/claude-agent-sdk')}`,
    exe: (m) => join(m, '@anthropic-ai', `claude-agent-sdk-${plataforma}`, WINDOWS ? 'claude.exe' : 'claude'),
    pesa: '290 MB'
  },
  codex: {
    nombre: 'Codex',
    // Entero: las skills corren `codex exec` (las imágenes), y su lanzador busca el programa a su lado.
    paquete: () => `@openai/codex@${versionDe('@openai/codex')}`,
    exe: (m) => (CODEX[plataforma] ? join(m, '@openai', `codex-${plataforma}`, 'vendor', CODEX[plataforma], 'bin', WINDOWS ? 'codex.exe' : 'codex') : null),
    pesa: '460 MB'
  },
  opencode: {
    nombre: 'OpenCode',
    paquete: () => `${OPENCODE}@${versionDe('@opencode/client')}`,
    exe: (m) => {
      const exe = WINDOWS ? 'opencode.exe' : 'opencode'
      const normal = join(m, OPENCODE, 'bin', exe)
      return existsSync(normal) ? normal : join(m, `${OPENCODE}-baseline`, 'bin', exe)
    },
    pesa: '250 MB'
  }
}

/** Donde queda lo que se bajó de cada agente. */
const carpeta = (p: Proveedor) => join(PIEZAS, p)

/** El ejecutable del agente, si está: el de la app (repo) o el que se bajó. `null` si falta. */
export function rutaAgente(p: Proveedor): string | null {
  for (const modulos of [join(APP, 'node_modules'), join(carpeta(p), 'node_modules')]) {
    const exe = AGENTES[p].exe(modulos)
    if (exe && existsSync(exe)) return exe
  }
  return null
}

/**
 * El Codex que se bajó va primero en el PATH, para el `codex exec` de las skills: el lanzador de la app (en su
 * node_modules/.bin, que scripts/start.mjs pone en el PATH) no tiene el programa a su lado.
 */
export function caminoDeAgentes() {
  const bin = join(carpeta('codex'), 'node_modules', '.bin')
  if (existsSync(bin) && !process.env.PATH?.split(delimiter).includes(bin)) process.env.PATH = [bin, process.env.PATH].join(delimiter)
}
caminoDeAgentes()

const instalando = new Map<Proveedor, Promise<string>>()
const errores = new Map<Proveedor, string>()

export function estadoAgente(p: Proveedor): EstadoAgente {
  return { nombre: AGENTES[p].nombre, instalado: !!rutaAgente(p), instalando: instalando.has(p), error: errores.get(p), pesa: AGENTES[p].pesa }
}

export const estadoAgentes = () => Object.fromEntries((Object.keys(AGENTES) as Proveedor[]).map((p) => [p, estadoAgente(p)])) as Record<Proveedor, EstadoAgente>

/** Qué agente se está bajando: reiniciar el servidor cortaría la descarga. */
export const bajandoAgente = () => {
  const p = [...instalando.keys()][0]
  return p ? `Se está descargando ${AGENTES[p].nombre}. Espera a que termine.` : null
}

/**
 * Baja el agente si falta y devuelve su ejecutable. Si ya se está bajando, espera a esa descarga. Con OpenCode en una
 * computadora sin AVX2, el programa normal no arranca: se baja la variante `-baseline`.
 */
export function asegurarAgente(p: Proveedor): Promise<string> {
  const ya = rutaAgente(p)
  if (ya) return Promise.resolve(ya)
  const enCurso = instalando.get(p)
  if (enCurso) return enCurso
  errores.delete(p)
  const descarga = (async () => {
    const dir = carpeta(p)
    mkdirSync(dir, { recursive: true })
    await npm(dir, AGENTES[p].paquete())
    let exe = rutaAgente(p)
    if (p === 'opencode' && exe && !(await arranca(exe))) {
      rmSync(join(dir, 'node_modules', OPENCODE), { recursive: true, force: true })
      await npm(dir, AGENTES[p].paquete().replace(OPENCODE, `${OPENCODE}-baseline`))
      exe = rutaAgente(p)
    }
    if (!exe) throw new Error(`${AGENTES[p].nombre} no trae un programa para esta computadora (${plataforma}).`)
    if (p === 'codex') caminoDeAgentes()
    return exe
  })()
  instalando.set(p, descarga)
  descarga.then(
    () => instalando.delete(p),
    (e) => {
      instalando.delete(p)
      errores.set(p, `No se pudo descargar ${AGENTES[p].nombre}: ${e instanceof Error ? e.message : e}`)
    }
  )
  return descarga
}

/**
 * El agente de un hilo. Si su programa falta, lo dice en el hilo, lo baja y luego lo arranca: lo que se le mande mientras
 * tanto espera. Si no se pudo bajar, el turno acaba con el error y el siguiente mensaje lo vuelve a intentar.
 */
export function conAgente(p: Proveedor, opts: AgentOptions, arrancar: (opts: AgentOptions) => AgentRun): AgentRun {
  if (rutaAgente(p)) return arrancar(opts)
  let run: AgentRun | undefined
  let cerrado = false
  let turno = false
  const pendientes: ((r: AgentRun) => void)[] = []
  const cuando = (f: (r: AgentRun) => void) => (run ? f(run) : pendientes.push(f))
  opts.onEvent({ t: 'info', text: `Descargando ${AGENTES[p].nombre} (${AGENTES[p].pesa}). Solo pasa la primera vez.` })
  asegurarAgente(p).then(
    () => {
      if (cerrado) return
      run = arrancar(opts)
      for (const f of pendientes.splice(0)) f(run)
    },
    (e) => {
      if (cerrado) return
      const error = e instanceof Error ? e.message : String(e)
      if (turno) opts.onEvent({ t: 'turn_end', at: Date.now(), ok: false, error: `No se pudo descargar ${AGENTES[p].nombre}: ${error}` })
      else opts.onEvent({ t: 'info', text: `No se pudo descargar ${AGENTES[p].nombre}: ${error}` })
      opts.onExit?.()
    }
  )
  return {
    send(text, skill, images) {
      turno = true
      cuando((r) => r.send(text, skill, images))
    },
    steer: (text, images) => cuando((r) => r.steer(text, images)),
    compact() {
      turno = true
      cuando((r) => r.compact?.())
    },
    async interrupt() {
      if (run) return run.interrupt()
      // Aún bajando: el turno no empezó en el agente; se cierra aquí y la descarga sigue para la próxima vez.
      cerrado = true
      if (turno) opts.onEvent({ t: 'turn_end', at: Date.now(), ok: false, error: 'lo detuviste' })
      opts.onExit?.()
    },
    close() {
      cerrado = true
      run?.close()
    }
  }
}

/** Instala `paquete` en `dir` con el npm de Sloth, sin package.json propio ni scripts de instalación. */
function npm(dir: string, paquete: string) {
  return correr(`npm install --prefix "${dir}" --no-save --no-audit --no-fund --ignore-scripts --loglevel=error ${paquete}`, dir)
}

/** Si el programa corre en esta computadora. */
const arranca = (exe: string) => new Promise<boolean>((ok) => execFile(exe, ['--version'], { timeout: 30000, windowsHide: true }, (error) => ok(!error)))

/** Para `query()` del SDK de Claude: su programa, que el SDK solo busca a su lado y puede estar bajado aparte. */
export function programaClaude(): { pathToClaudeCodeExecutable?: string } {
  const exe = rutaAgente('claude')
  return exe ? { pathToClaudeCodeExecutable: exe } : {}
}
