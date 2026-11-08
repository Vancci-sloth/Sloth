import { execFile, type ExecFileException } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'
import { programaDe, type Programa, type Proveedor } from '../shared/providers.ts'
import type { AgentesAlDia, EstadoAgente } from '../shared/types.ts'
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
/**
 * En un Mac con Apple Silicon, la Sloth de Intel (con Rosetta) dejó aquí programas de Intel con la misma versión: la de
 * ARM baja los suyos aparte, o usaría esos.
 */
const PIEZAS = join(process.env.APPDATA ?? '', 'sloth', 'piezas', process.platform === 'darwin' && process.arch === 'arm64' ? 'agentes-arm64' : 'agentes')
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
  /** Lo que se instala con npm, con su versión: la que trae la app o, al actualizar (`AL_DIA`), `version`. */
  paquete?(version?: string): string
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
    paquete: (v = versionDe('@anthropic-ai/claude-agent-sdk')) => `@anthropic-ai/claude-agent-sdk-${plataforma}@${v}`,
    exe: (r) => join(r, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${plataforma}`, WINDOWS ? 'claude.exe' : 'claude'),
    pesa: '290 MB'
  },
  codex: {
    nombre: 'Codex',
    // Entero: las skills corren `codex exec` (las imágenes), y su lanzador busca el programa a su lado.
    paquete: (v = versionDe('@openai/codex')) => `@openai/codex@${v}`,
    exe: (r) => (CODEX[plataforma] ? join(r, 'node_modules', '@openai', `codex-${plataforma}`, 'vendor', CODEX[plataforma], 'bin', WINDOWS ? 'codex.exe' : 'codex') : null),
    pesa: '460 MB'
  },
  opencode: {
    nombre: 'OpenCode',
    paquete: (v = versionDe('@opencode/client')) => `${OPENCODE}@${v}`,
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
  gemini: {
    nombre: 'Gemini CLI',
    version: '0.66.0',
    // También es de Node.
    paquete() {
      return `@google/gemini-cli@${this.version}`
    },
    exe: (r) => join(r, 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js'),
    pesa: '110 MB'
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
    // Sin el arnés (`localharness_external`, que el antivirus a veces se lleva) no trabaja: cuenta como no bajado, y se
    // baja otra vez.
    exe: (r) => (existsSync(join(r, WINDOWS ? 'localharness_external.exe' : 'localharness_external')) ? join(r, WINDOWS ? 'agy_acp_server.exe' : 'agy_acp_server.par') : null),
    pesa: '230 MB'
  }
}

/** Donde queda lo que se bajó de cada agente; con su versión, si la fija Sloth. */
const carpeta = (p: Programa) => join(PIEZAS, p, ...(AGENTES[p].version ? [AGENTES[p].version!] : []))
/**
 * Va en la carpeta del agente mientras se baja. Si Sloth se cierra a media descarga, el programa queda a medias y no
 * arranca (en Windows, `spawn EFTYPE`): con la marca, no cuenta como bajado y se baja otra vez.
 */
const BAJANDO = '.bajando'

/**
 * El ejecutable del agente, si está: el de la app (repo) o el que se bajó. `null` si falta o aún se está bajando: el
 * archivo ya existe antes de que pueda arrancar, y quien lo arranque entonces sale con `spawn EBUSY`.
 */
export const rutaAgente = (p: Proveedor): string | null => (instalando.has(programaDe(p)) ? null : buscar(programaDe(p)))

const buscar = (p: Programa): string | null => elegido(p)?.exe ?? null

/** Las versiones que «Actualizar los agentes» bajó de uno (`AL_DIA`), cada una en su carpeta. */
const versiones = (p: Programa) => join(carpeta(p), 'versiones')
/** Lo que se aparta para borrarlo (`soltarViejas`). */
const APARTE = '.borrando'

/**
 * Dónde está el programa de un agente: en la app (repo), en su carpeta o, si se actualizó, en la de cada versión que
 * bajó. Va el más nuevo; así una Sloth que trae uno más nuevo que el bajado usa el suyo. `bajados`: sin el de la app.
 */
function elegido(p: Programa, bajados = false): { raiz: string; exe: string; version: string } | null {
  // Muse se instala en `muse/` dentro de su carpeta (su instalador no deja elegir el nombre del lanzador).
  const fijo = !!AGENTES[p].version || p === 'muse'
  let otras: string[] = []
  try {
    if (!fijo) otras = readdirSync(versiones(p)).filter((v) => !v.endsWith(APARTE)).map((v) => join(versiones(p), v))
  } catch {
    // Nunca se actualizó.
  }
  let mejor: { raiz: string; exe: string; version: string } | null = null
  for (const raiz of fijo ? [carpeta(p)] : [...(bajados ? [] : [APP]), carpeta(p), ...otras]) {
    if (raiz !== APP && existsSync(join(raiz, BAJANDO))) continue
    const exe = AGENTES[p].exe(raiz)
    if (!exe || !existsSync(exe)) continue
    if (fijo) return { raiz, exe, version: '' }
    const version = versionJunto(exe)
    if (!mejor || masNueva(version, mejor.version)) mejor = { raiz, exe, version }
  }
  return mejor
}

/** La versión del paquete de npm que trae `exe`: el package.json más cercano hacia arriba (`0.164.0-win32-x64` → `0.164.0`). */
function versionJunto(exe: string): string {
  for (let dir = dirname(exe), i = 0; i < 6; dir = dirname(dir), i++) {
    try {
      return /^\d+\.\d+\.\d+/.exec(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version)?.[0] ?? ''
    } catch {
      // Más arriba.
    }
  }
  return ''
}

const cifras = (v: string) => /^(\d+)\.(\d+)\.(\d+)/.exec(v)?.slice(1).map(Number) ?? null
/** Si `a` es más nueva que `b`. Una que no se pudo leer es la más vieja. */
export function masNueva(a: string, b: string): boolean {
  const x = cifras(a)
  const y = cifras(b)
  if (!x) return false
  if (!y) return true
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

/**
 * Si `v` es más nueva que `base` sin cambiar sus primeras `fijas` cifras: con `fijas` 2, de 0.3.311 a 0.3.317 sí, a 0.4.0
 * no.
 */
export function cabe(v: string, base: string, fijas: number): boolean {
  const x = cifras(v)
  const y = cifras(base)
  return !!x && !!y && x.slice(0, fijas).every((c, i) => c === y[i]) && masNueva(v, base)
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
  const raiz = elegido('codex')?.raiz
  if (!raiz || raiz === APP) return
  const bin = join(raiz, 'node_modules', '.bin')
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

/** Qué agente se está bajando o actualizando: reiniciar el servidor cortaría la descarga. */
export const bajandoAgente = () => {
  const p = [...instalando.keys()][0]
  return p ? `Se está descargando ${AGENTES[p].nombre}. Espera a que termine.` : actualizando && `${actualizando} Espera a que termine.`
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
    // Lo que quedó de otra versión, o de una descarga cortada, se va: npm daría por instalado un paquete a medias.
    rmSync(join(PIEZAS, p), { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, BAJANDO), '')
    await (a.instalar ? a.instalar(p === 'muse' ? join(dir, 'muse') : dir) : npm(dir, a.paquete!()))
    rmSync(join(dir, BAJANDO))
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
 * Claude Code, Codex y OpenCode llegan con cada versión de Sloth (su paquete en package.json), pero sacan otra casi a
 * diario, con los modelos nuevos. «Actualizar los agentes», arriba del hilo nuevo, baja la más nueva de los que ya están,
 * sin esperar a la siguiente Sloth. Cada versión va en su carpeta (`versiones`): los hilos abiertos siguen con la de antes
 * y los nuevos van con la nueva. Solo dentro de las cifras que fija Sloth (`fijas`): el SDK de Claude cambia su API en la
 * 0.4 y el cliente de OpenCode es de la 2.2; Codex pasa a cualquier 0.x, porque Sloth solo le habla a su app-server.
 * `registro` es el paquete que se pregunta a npm; `base`, el que trae la app.
 */
const AL_DIA: Partial<Record<Programa, { registro: string; base: string; fijas: number }>> = {
  claude: { registro: '@anthropic-ai/claude-agent-sdk', base: '@anthropic-ai/claude-agent-sdk', fijas: 2 },
  codex: { registro: '@openai/codex', base: '@openai/codex', fijas: 1 },
  opencode: { registro: OPENCODE, base: '@opencode/client', fijas: 2 }
}
/** En la carpeta de una versión actualizada, la que se enseña: la de Claude Code, no la de su paquete. */
const MOSTRAR = 'version.txt'
/** Lo publicado se pregunta a npm cada hora como mucho. */
const CADA_HORA = 60 * 60_000

type Publicada = { version: string; claudeCodeVersion?: string }
let publicadas: { t: number; de: Promise<Partial<Record<Programa, Publicada>>> } | undefined
let actualizando: string | null = null
let errorAlDia: string | undefined

function preguntarANpm() {
  if (publicadas && Date.now() - publicadas.t < CADA_HORA) return publicadas.de
  const de = Promise.all(
    Object.entries(AL_DIA).map(async ([p, a]) => {
      try {
        const res = await fetch(`https://registry.npmjs.org/${a.registro}/latest`, { signal: AbortSignal.timeout(8000) })
        return res.ok ? ([p, (await res.json()) as Publicada] as const) : null
      } catch {
        return null
      }
    })
  ).then((r) => Object.fromEntries(r.filter((x) => !!x)) as Partial<Record<Programa, Publicada>>)
  publicadas = { t: Date.now(), de }
  // Sin internet no se espera una hora: se vuelve a preguntar la próxima vez.
  void de.then((r) => !Object.keys(r).length && (publicadas = undefined))
  return de
}

/** La versión que se enseña del agente que se usa; la de Claude Code, para Claude. `null` si no está. */
export function versionVisible(p: Programa): string | null {
  const e = elegido(p)
  if (!e) return null
  try {
    return readFileSync(join(e.raiz, MOSTRAR), 'utf8').trim()
  } catch {
    // El de la app o el que se bajó al elegirlo: el de la versión que trae la app.
  }
  if (p !== 'claude') return e.version || null
  const sdk = JSON.parse(readFileSync(join(APP, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json'), 'utf8')) as Publicada
  return sdk.version === e.version ? (sdk.claudeCodeVersion ?? e.version) : e.version
}

/** Los agentes que ya están y tienen versión nueva, y cómo va la actualización. */
export async function agentesAlDia(): Promise<AgentesAlDia> {
  const de = await preguntarANpm()
  const nuevos: AgentesAlDia['nuevos'] = []
  for (const [p, a] of Object.entries(AL_DIA) as [Programa, NonNullable<(typeof AL_DIA)[Programa]>][]) {
    const e = elegido(p)
    const n = de[p]
    if (!e || !n || instalando.has(p) || !cabe(n.version, versionDe(a.base), a.fijas) || !masNueva(n.version, e.version)) continue
    nuevos.push({ id: p, nombre: AGENTES[p].nombre, de: versionVisible(p) ?? e.version, a: n.claudeCodeVersion ?? n.version, pesa: AGENTES[p].pesa })
  }
  return { nuevos, actualizando: actualizando ?? undefined, error: errorAlDia }
}

/** Baja la versión nueva de cada agente que la tiene, de uno en uno. No espera: `agentesAlDia` dice cómo va. */
export async function actualizarAgentes(): Promise<AgentesAlDia> {
  if (actualizando) return agentesAlDia()
  const { nuevos } = await agentesAlDia()
  if (!nuevos.length) return agentesAlDia()
  errorAlDia = undefined
  actualizando = `Actualizando ${nuevos[0].nombre}…`
  void (async () => {
    const de = await preguntarANpm()
    const fallos: string[] = []
    for (const { id, nombre } of nuevos) {
      actualizando = `Actualizando ${nombre}…`
      try {
        await bajarVersion(id as Programa, de[id as Programa]!)
      } catch (e) {
        fallos.push(`${nombre}: ${e instanceof Error ? e.message : e}`)
      }
    }
    actualizando = null
    if (fallos.length) errorAlDia = `No se pudo actualizar ${fallos.join('; ')}`
    for (const fn of alBajarse) fn()
  })()
  return agentesAlDia()
}

/** Una versión de un agente, en su carpeta. Si no arranca, se borra y sigue la de antes. */
async function bajarVersion(p: Programa, n: Publicada) {
  const dir = join(versiones(p), n.version)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, BAJANDO), '')
  try {
    await npm(dir, AGENTES[p].paquete!(n.version))
    let exe = AGENTES[p].exe(dir)
    if (exe && existsSync(exe) && !(await arranca(exe)) && p === 'opencode') {
      rmSync(join(dir, 'node_modules', OPENCODE), { recursive: true, force: true })
      await npm(dir, AGENTES[p].paquete!(n.version).replace(OPENCODE, `${OPENCODE}-baseline`))
      exe = AGENTES[p].exe(dir)
      if (!exe || !existsSync(exe) || !(await arranca(exe))) throw new Error('la versión nueva no arranca en esta computadora')
    }
    if (!exe || !existsSync(exe)) throw new Error(`no trae un programa para esta computadora (${plataforma})`)
    writeFileSync(join(dir, MOSTRAR), n.claudeCodeVersion ?? n.version)
    rmSync(join(dir, BAJANDO))
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw e
  }
  soltarViejas(p)
  if (p === 'codex') caminoDeAgentes()
}

/**
 * Borra las versiones bajadas que ya no se usan. Una que algún hilo tiene abierta (Windows no deja mover un programa que
 * corre) se queda para la próxima: primero se mueve aparte, para no borrar a medias la que sigue en uso.
 */
function soltarViejas(p: Programa) {
  // La que queda es la más nueva de las bajadas, no la de la app: en el repo, la Sloth instalada usa estas mismas.
  const queda = elegido(p, true)?.raiz
  const viejas = queda === carpeta(p) ? [] : [join(carpeta(p), 'node_modules')]
  try {
    viejas.push(...readdirSync(versiones(p)).map((v) => join(versiones(p), v)))
  } catch {
    // No hay.
  }
  for (const vieja of viejas) {
    if (vieja === queda || !existsSync(vieja) || existsSync(join(vieja, BAJANDO))) continue
    const aparte = vieja.endsWith(APARTE) ? vieja : `${vieja}${APARTE}`
    try {
      if (aparte !== vieja) renameSync(vieja, aparte)
      rmSync(aparte, { recursive: true, force: true })
    } catch {
      // En uso.
    }
  }
}
for (const p of Object.keys(AL_DIA) as Programa[]) if (existsSync(versiones(p))) soltarViejas(p)


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
    // EFTYPE sale de golpe, no por el callback.
    const error = await new Promise<ExecFileException | null>((ok) => execFile(comando, args, { timeout: 30000, windowsHide: true }, ok)).catch((e: ExecFileException) => e)
    if (!error) return true
    if (error.code !== 'EBUSY') return false
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

/**
 * Si el programa bajado de un agente no arranca porque no es un programa (Windows: EFTYPE; Linux: ENOEXEC), quedó a
 * medias de una descarga cortada en una Sloth que aún no ponía `BAJANDO`: se borra, y la próxima vez que se pida se baja
 * otra vez. Dice si lo borró. El de la app (repo) no se toca.
 */
export function descartarRoto(p: Proveedor, e: unknown): boolean {
  const g = programaDe(p)
  const exe = buscar(g)
  const texto = e instanceof Error ? `${(e as NodeJS.ErrnoException).code ?? ''} ${e.message}` : String(e)
  if (!exe?.startsWith(PIEZAS) || !/\b(EFTYPE|ENOEXEC)\b/.test(texto)) return false
  try {
    rmSync(join(PIEZAS, g), { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/** Para `query()` del SDK de Claude: su programa, que el SDK solo busca a su lado y puede estar bajado aparte. */
export function programaClaude(): { pathToClaudeCodeExecutable?: string } {
  const exe = rutaAgente('claude')
  return exe ? { pathToClaudeCodeExecutable: exe } : {}
}
