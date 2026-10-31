import { execFile, type ExecFileException } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'
import { programaDe, type Programa, type Proveedor } from '../shared/providers.ts'
import type { EstadoAgente } from '../shared/types.ts'
import type { AgentOptions, AgentRun } from './agent.ts'
import { correr } from './version.ts'

/**
 * El programa de cada agente (Claude Code, Codex, OpenCode, Grok…) pesa entre 40 y 460 MB, y casi nadie usa todos: no
 * viene en el instalador. Se baja la primera vez que alguien elige ese agente (en la bienvenida, en Opciones o al mandar
 * el primer mensaje de un hilo suyo) a `PIEZAS/<agente>`, y queda para las siguientes versiones mientras no cambie la
 * suya. Lo mismo para los proveedores que vengan: una entrada más en `AGENTES`.
 *
 * Casi todos salen de npm, con el npm que trae Sloth. Muse Code, con el instalador de Meta, y Antigravity, del zip que
 * publica Google (como los baja T3 Code). DeepSeek no tiene programa: usa el de Claude Code (`programaDe`).
 *
 * En el repo (y en las versiones de Sloth que aún lo traían dentro) el programa de Claude, Codex y OpenCode ya está en
 * node_modules de la app, y se usa ese.
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
  /**
   * La versión, para los que no trae la app: va en el nombre de su carpeta, así otra versión de Sloth que pida otra la
   * baja aparte.
   */
  version?: string
  /** Lo baja a `dir`. Sin él, con npm, `paquete()`. */
  instalar?(dir: string): Promise<void>
  /** Lo que se instala con npm, con su versión. */
  paquete?(): string
  /** El ejecutable dentro de la carpeta del agente o de la app, o `null` si el sistema no lo admite. */
  exe(raiz: string): string | null
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
/** El de Grok viene comprimido con brotli (`grok.exe.br`) para caber en npm: se descomprime al bajarlo. */
const GROK = join('node_modules', '@xai-official', `grok-${plataforma}`, 'bin', WINDOWS ? 'grok.exe' : 'grok')

/**
 * El servidor ACP de Antigravity, la versión que usa T3 Code: de la 1.4.2 a la 1.4.4 escriben una skill suya en la
 * carpeta de cada sesión. Con su huella, para no correr un zip que no sea el de Google.
 */
const ANTIGRAVITY: Record<string, { url: string; sha256: string }> = {
  'darwin-arm64': { url: 'macos/agy-acp-server-1.4.1-darwin-arm64.zip', sha256: 'f9bdd68291ae78c38d2141e63bc86b84e6cc7b9f60f71652c68435a7943deb17' },
  'darwin-x64': { url: 'macos/agy-acp-server-1.4.1-darwin-x86_64.zip', sha256: '27e31f096874704f14167b07ef9e84cc77134615ee41d024f7b1c957add85307' },
  'linux-x64': { url: 'linux/agy-acp-server-1.4.1-linux-x86_64.zip', sha256: '2e37012ceb2a5c7fc7309b6e6596234fb637ee3c62a5199f65d4cbe777871384' },
  'linux-arm64': { url: 'linux/agy-acp-server-1.4.1-linux-arm64.zip', sha256: '609336a1c97545487e3ddd55dbd153dc0f40f4e6534486cc1c5f4c0ebb85c2da' },
  'win32-x64': { url: 'windows/agy-acp-server-1.4.1-windows-x86_64.zip', sha256: '5f5b7d0328df17c128b2be338d4567b0d24e56ace8196e88794fec37d1372554' },
  'win32-arm64': { url: 'windows/agy-acp-server-1.4.1-windows-arm64.zip', sha256: '24c52bbc12aae20f55eb53d373669412d95a9c44fd59be4ea4e355918b91fbf7' }
}

const AGENTES: Record<Programa, Agente> = {
  claude: {
    nombre: 'Claude Code',
    // Solo el programa: el SDK, que importa el servidor, viene en la app.
    paquete: () => `@anthropic-ai/claude-agent-sdk-${plataforma}@${versionDe('@anthropic-ai/claude-agent-sdk')}`,
    exe: (r) => join(r, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${plataforma}`, WINDOWS ? 'claude.exe' : 'claude'),
    pesa: '290 MB'
  },
  codex: {
    nombre: 'Codex',
    // Entero: las skills corren `codex exec` (las imágenes), y su lanzador busca el programa a su lado.
    paquete: () => `@openai/codex@${versionDe('@openai/codex')}`,
    exe: (r) => (CODEX[plataforma] ? join(r, 'node_modules', '@openai', `codex-${plataforma}`, 'vendor', CODEX[plataforma], 'bin', WINDOWS ? 'codex.exe' : 'codex') : null),
    pesa: '460 MB'
  },
  opencode: {
    nombre: 'OpenCode',
    paquete: () => `${OPENCODE}@${versionDe('@opencode/client')}`,
    exe: (r) => {
      const exe = WINDOWS ? 'opencode.exe' : 'opencode'
      const normal = join(r, 'node_modules', OPENCODE, 'bin', exe)
      return existsSync(normal) ? normal : join(r, 'node_modules', `${OPENCODE}-baseline`, 'bin', exe)
    },
    pesa: '250 MB'
  },
  grok: {
    nombre: 'Grok',
    version: '1.0.70',
    async instalar(dir) {
      await npm(dir, `@xai-official/grok-${plataforma}@${this.version}`)
      const exe = join(dir, GROK)
      if (!existsSync(`${exe}.br`)) throw new Error(`Grok no trae un programa para esta computadora (${plataforma}).`)
      writeFileSync(exe, brotliDecompressSync(readFileSync(`${exe}.br`)))
      if (!WINDOWS) chmodSync(exe, 0o755)
      rmSync(`${exe}.br`)
    },
    exe: (r) => join(r, GROK),
    pesa: '170 MB'
  },
  pi: {
    nombre: 'Pi',
    version: '1.4.0',
    // Es de Node: corre con el de Sloth (`comandoAgente`).
    paquete() {
      return `@earendil-works/pi-coding-agent@${this.version}`
    },
    exe: (r) => join(r, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'bundle', 'cli.js'),
    pesa: '140 MB'
  },
  cursor: {
    nombre: 'Cursor',
    version: '1.2.0',
    // Corre dentro de Sloth (`server/cursor.ts` lo importa de aquí), con sus ayudantes de cada sistema al lado.
    paquete() {
      return `@cursor/sdk@${this.version}`
    },
    exe: (r) => join(r, 'node_modules', '@cursor', 'sdk', 'package.json'),
    pesa: '45 MB'
  },
  muse: {
    nombre: 'Muse Code',
    // Con el instalador de Meta, en su carpeta y sin tocar el PATH: deja `muse-bin-<versión>` junto a su lanzador.
    async instalar(dir) {
      mkdirSync(dir, { recursive: true })
      const env = { MUSE_INSTALL_DIR: dir, MUSE_NO_MODIFY_PATH: '1' }
      const res = await fetch(WINDOWS ? 'https://dev.meta.ai/install.ps1' : 'https://dev.meta.ai/install.sh')
      if (!res.ok) throw new Error(`Meta respondió ${res.status} al pedir su instalador.`)
      const guion = join(dir, WINDOWS ? 'instalar.ps1' : 'instalar.sh')
      writeFileSync(guion, await res.text())
      await correr(WINDOWS ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${guion}"` : `bash "${guion}"`, dir, env)
      rmSync(guion, { force: true })
    },
    exe(r) {
      const dir = join(r, 'muse')
      if (!existsSync(dir)) return null
      const bins = readdirSync(dir).filter((f) => /^muse-bin-[\d.]+-R[\d.]+(\.exe)?$/.test(f)).sort()
      const lanzador = join(dir, WINDOWS ? 'muse.cmd' : 'muse')
      return bins.length ? join(dir, bins[bins.length - 1]) : existsSync(lanzador) ? lanzador : null
    },
    pesa: '420 MB'
  },
  antigravity: {
    nombre: 'Antigravity',
    version: '1.4.1',
    async instalar(dir) {
      const a = ANTIGRAVITY[plataforma]
      if (!a) throw new Error(`Antigravity no trae un programa para esta computadora (${plataforma}).`)
      const res = await fetch(`https://dl.google.com/agy-extensions/releases/${a.url}`)
      if (!res.ok) throw new Error(`Google respondió ${res.status} al pedir Antigravity.`)
      const zip = Buffer.from(await res.arrayBuffer())
      if (createHash('sha256').update(zip).digest('hex') !== a.sha256) throw new Error('El archivo de Antigravity no es el que publica Google. Vuelve a intentarlo.')
      const archivo = join(dir, 'antigravity.zip')
      writeFileSync(archivo, zip)
      // El `tar` de Windows y el de Mac abren zips; el de Linux (y el de Git, si va antes en el PATH), no.
      const tar = WINDOWS ? `"${join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')}"` : 'tar'
      await correr(process.platform === 'linux' ? `unzip -o -q "${archivo}" -d "${dir}"` : `${tar} -xf "${archivo}" -C "${dir}"`, dir)
      rmSync(archivo, { force: true })
      if (!WINDOWS) for (const f of readdirSync(dir)) chmodSync(join(dir, f), 0o755)
    },
    exe: (r) => join(r, WINDOWS ? 'agy_acp_server.exe' : 'agy_acp_server.par'),
    pesa: '230 MB'
  }
}

/** Donde queda lo que se bajó de cada agente; con su versión, si la fija Sloth. */
const carpeta = (p: Programa) => join(PIEZAS, p, ...(AGENTES[p].version ? [AGENTES[p].version!] : []))

/**
 * El ejecutable del agente, si está: el de la app (repo) o el que se bajó. `null` si falta o aún se está bajando: el
 * archivo ya existe antes de que pueda arrancar, y quien lo arranque entonces sale con `spawn EBUSY`.
 */
export const rutaAgente = (p: Proveedor): string | null => (instalando.has(programaDe(p)) ? null : buscar(programaDe(p)))

function buscar(p: Programa): string | null {
  // Muse se instala en `muse/` dentro de su carpeta (su instalador no deja elegir el nombre del lanzador).
  const raices = AGENTES[p].version || p === 'muse' ? [carpeta(p)] : [APP, carpeta(p)]
  for (const raiz of raices) {
    const exe = AGENTES[p].exe(raiz)
    if (exe && existsSync(exe)) return exe
  }
  return null
}

/** La versión de un agente que no trae la app: la que fija Sloth o, la de Muse, la que dejó su instalador. */
export function versionFija(p: Proveedor): string | undefined {
  const g = programaDe(p)
  if (g !== 'muse') return AGENTES[g].version
  try {
    return readFileSync(join(carpeta('muse'), 'muse', '.muse-version'), 'utf8').trim()
  } catch {
    return undefined
  }
}

/**
 * Cómo se lanza un agente: su programa, o el Node de Sloth con él si es de Node (Pi). `null` si no se ha bajado.
 */
export function comandoAgente(p: Proveedor): { command: string; args: string[] } | null {
  const exe = rutaAgente(p)
  if (!exe) return null
  return exe.endsWith('.js') ? { command: process.execPath, args: [exe] } : { command: exe, args: [] }
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

const instalando = new Map<Programa, Promise<string>>()
const errores = new Map<Programa, string>()
/** Lo que se hace cada vez que un agente termina de bajarse, lo haya pedido quien sea: pedir su catálogo de modelos. */
const alBajarse: (() => void)[] = []
export const alBajarAgente = (fn: () => void) => void alBajarse.push(fn)

export function estadoAgente(p: Proveedor): EstadoAgente {
  const g = programaDe(p)
  return { nombre: AGENTES[g].nombre, instalado: !!rutaAgente(g), instalando: instalando.has(g), error: errores.get(g), pesa: AGENTES[g].pesa }
}

export const estadoAgentes = () =>
  Object.fromEntries((['claude', 'codex', 'opencode', 'deepseek', ...(Object.keys(AGENTES) as Programa[]).filter((p) => !['claude', 'codex', 'opencode'].includes(p))] as Proveedor[]).map((p) => [p, estadoAgente(p)])) as Record<Proveedor, EstadoAgente>

/** Qué agente se está bajando: reiniciar el servidor cortaría la descarga. */
export const bajandoAgente = () => {
  const p = [...instalando.keys()][0]
  return p ? `Se está descargando ${AGENTES[p].nombre}. Espera a que termine.` : null
}

/**
 * Baja el agente si falta y devuelve su ejecutable. Si ya se está bajando, espera a esa descarga. Con OpenCode en una
 * computadora sin AVX2, el programa normal no arranca: se baja la variante `-baseline`.
 */
export function asegurarAgente(proveedor: Proveedor): Promise<string> {
  const p = programaDe(proveedor)
  const ya = rutaAgente(p)
  if (ya) return Promise.resolve(ya)
  const enCurso = instalando.get(p)
  if (enCurso) return enCurso
  errores.delete(p)
  const a = AGENTES[p]
  const descarga = (async () => {
    const dir = carpeta(p)
    // Lo que quedó de otra versión, o de una descarga cortada, se va.
    if (a.version) rmSync(join(PIEZAS, p), { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    await (a.instalar ? a.instalar(p === 'muse' ? join(dir, 'muse') : dir) : npm(dir, a.paquete!()))
    let exe = buscar(p)
    // Que arranque una vez antes de darlo por bajado: así nadie lo abre mientras el antivirus lo revisa. Cursor no es un
    // programa (se importa), y Antigravity desempaca 1 GB cada vez que arranca: T3 Code tampoco lo prueba.
    if (exe && p !== 'cursor' && p !== 'antigravity' && !(await arranca(exe)) && p === 'opencode') {
      rmSync(join(dir, 'node_modules', OPENCODE), { recursive: true, force: true })
      await npm(dir, a.paquete!().replace(OPENCODE, `${OPENCODE}-baseline`))
      exe = buscar(p)
      if (exe) await arranca(exe)
    }
    if (!exe) throw new Error(`${a.nombre} no trae un programa para esta computadora (${plataforma}).`)
    if (p === 'codex') caminoDeAgentes()
    return exe
  })()
  instalando.set(p, descarga)
  descarga.then(
    () => {
      instalando.delete(p)
      for (const fn of alBajarse) fn()
    },
    (e) => {
      instalando.delete(p)
      errores.set(p, `No se pudo descargar ${a.nombre}: ${e instanceof Error ? e.message : e}`)
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
  opts.onEvent({ t: 'info', text: `Descargando ${AGENTES[programaDe(p)].nombre} (${AGENTES[programaDe(p)].pesa}). Solo pasa la primera vez.` })
  asegurarAgente(p).then(
    () => {
      if (cerrado) return
      run = arrancar(opts)
      for (const f of pendientes.splice(0)) f(run)
    },
    (e) => {
      if (cerrado) return
      const error = e instanceof Error ? e.message : String(e)
      if (turno) opts.onEvent({ t: 'turn_end', at: Date.now(), ok: false, error: `No se pudo descargar ${AGENTES[programaDe(p)].nombre}: ${error}` })
      else opts.onEvent({ t: 'info', text: `No se pudo descargar ${AGENTES[programaDe(p)].nombre}: ${error}` })
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

/**
 * Si el programa corre en esta computadora. Recién bajado, el antivirus de Windows lo tiene abierto unos segundos y
 * arrancarlo sale con EBUSY: se espera hasta medio minuto.
 */
async function arranca(exe: string): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    // Pi es de Node: corre con el de Sloth.
    const [comando, args] = exe.endsWith('.js') ? [process.execPath, [exe, '--version']] : [exe, ['--version']]
    const error = await new Promise<ExecFileException | null>((ok) => execFile(comando, args, { timeout: 30000, windowsHide: true }, ok))
    if (!error) return true
    if (error.code !== 'EBUSY') return false
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

/** Para `query()` del SDK de Claude: su programa, que el SDK solo busca a su lado y puede estar bajado aparte. */
export function programaClaude(): { pathToClaudeCodeExecutable?: string } {
  const exe = rutaAgente('claude')
  return exe ? { pathToClaudeCodeExecutable: exe } : {}
}
