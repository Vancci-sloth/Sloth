import { type ChildProcess, execFile, spawn as spawnReal } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { WebSocket } from 'ws'

/**
 * El lanzador de los navegadores instalados (Chrome o Edge) que Sloth maneja por CDP (hoy, el del agente, `chrome-agente.ts`). Las reglas, en un solo lugar:
 * - el depurador solo escucha en 127.0.0.1 (`--remote-debugging-address`);
 * - el puerto es uno libre al azar, no uno fijo que cualquier cosa de la computadora podría probar;
 * - siempre con un perfil de Sloth (`--user-data-dir`), nunca el tuyo: sin él no se lanza (Chrome tampoco abre su
 *   depurador en el perfil de siempre desde la 136);
 * - sin la bienvenida ni la pregunta de navegador por omisión;
 * - ninguno sigue vivo cuando Sloth se cierra.
 */

/** Un puerto libre de esta computadora (se pide al sistema y se suelta; el navegador lo toma enseguida). */
export function puertoLibre(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer()
    s.unref()
    s.on('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => ok(port))
    })
  })
}

/** El puerto del navegador de un perfil (`valor`, 0 mientras no hay), el proceso que lo abrió y cuál es. */
export interface NavegadorDepurable {
  valor: number
  proceso: ChildProcess | null
  /** Con qué ejecutable se abrió: si cambias de navegador en Opciones, el abierto se cierra y se abre el otro. */
  exe: string | null
}

export const nuevoNavegador = (): NavegadorDepurable => ({ valor: 0, proceso: null, exe: null })

/** Los abiertos por este proceso, para cerrarlos al salir. */
const vivos = new Set<ChildProcess>()
let enganchado = false

function cerrarTodos() {
  for (const p of vivos) {
    try {
      p.kill()
    } catch {
      // Ya se había ido.
    }
  }
  vivos.clear()
}

function enganchar() {
  if (enganchado) return
  enganchado = true
  process.once('exit', cerrarTodos)
  for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(senal, () => (cerrarTodos(), process.exit()))
}

/** Los argumentos que abren el depurador solo hacia esta computadora y en el puerto dado. */
export const argsDepurador = (puerto: number) => [`--remote-debugging-port=${puerto}`, '--remote-debugging-address=127.0.0.1']

/** Lo que va siempre, además del depurador. */
export const ARGS_FIJOS = ['--no-first-run', '--no-default-browser-check']

/**
 * Todos los argumentos: el depurador, los fijos y los de quien lo abre. Quita cualquier `--remote-debugging-*` que venga
 * en `args` (el puerto y la dirección los pone esto) y exige `--user-data-dir`.
 */
export function argumentos(puerto: number, args: string[]): string[] {
  const propios = args.filter((a) => !/^--remote-debugging-(port|address|pipe)\b/.test(a))
  if (!propios.some((a) => a.startsWith('--user-data-dir='))) throw new Error('Un navegador de Sloth se abre siempre con su propio perfil (--user-data-dir).')
  return [...argsDepurador(puerto), ...ARGS_FIJOS.filter((f) => !propios.includes(f)), ...propios]
}

/** Para las pruebas: con qué se lanza el proceso. */
export interface Lanzador {
  spawn: typeof spawnReal
  puerto(): Promise<number>
  /** Cierra el navegador que se haya quedado con el perfil. Por omisión, `liberarPerfil`. */
  liberar?(perfil: string): Promise<void>
}
const real: Lanzador = { spawn: spawnReal, puerto: puertoLibre }

/** Donde Sloth anota, en el perfil, el puerto con que lo abrió (Chrome no escribe `DevToolsActivePort` con puerto fijo). */
const ANOTADO = 'sloth-depurador'

const puertoValido = (texto: string) => {
  const n = Number(texto.trim().split(/\r?\n/)[0])
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 0
}

/** El puerto anotado en el perfil (el de Sloth o el `DevToolsActivePort` de Chrome), o 0. */
export function puertoDelPerfil(perfil: string): number {
  for (const f of [ANOTADO, 'DevToolsActivePort']) {
    try {
      const n = puertoValido(readFileSync(join(perfil, f), 'utf8'))
      if (n) return n
    } catch {
      // No está.
    }
  }
  return 0
}

/**
 * En las líneas de procesos («pid orden»), el navegador principal (no sus hijos `--type=`) abierto con ese perfil: su
 * pid y su puerto (0 si no tiene). `null` si no hay.
 */
export function procesoDelPerfil(lineas: string[], perfil: string): { pid: number; puerto: number } | null {
  const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase()
  const p = norm(perfil).replace(/\/+$/, '')
  for (const linea of lineas) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(linea)
    if (!m) continue
    const orden = norm(m[2])
    if (/ --type=/.test(orden) || !(orden.includes(`--user-data-dir=${p} `) || orden.endsWith(`--user-data-dir=${p}`) || orden.includes(`--user-data-dir="${p}"`))) continue
    const puerto = /--remote-debugging-port=(\d+)/.exec(orden)
    return { pid: Number(m[1]), puerto: puerto ? puertoValido(puerto[1]) : 0 }
  }
  return null
}

/** Chrome y Edge que corren ahora, «pid orden» (para huérfanos abiertos antes de que Sloth anotara el puerto). */
function ordenesDeNavegadores(): Promise<string[]> {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe'\" | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }"]]
      : ['ps', ['-axww', '-o', 'pid=,command=']]
  return new Promise((ok) =>
    execFile(cmd as string, args as string[], { timeout: 30_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (_e, salida) => ok(String(salida ?? '').split(/\r?\n/)))
  )
}

/** ¿Hay un navegador vivo con el perfil? (Chrome deja `lockfile` en Windows y `SingletonLock` en Mac y Linux.) */
const perfilTomado = (perfil: string) => existsSync(join(perfil, 'lockfile')) || existsSync(join(perfil, 'SingletonLock'))

/**
 * Si un navegador anterior se quedó con el perfil (un Sloth que se cerró de golpe deja su Chrome sin ventana vivo), lo
 * cierra por CDP. Sin esto, el nuevo le pasa la orden al viejo y se cierra al instante: el puerto queda en 0 y Playwright
 * acaba en `connect ECONNREFUSED 127.0.0.1:80`. El perfil es siempre de Sloth (`argumentos` lo exige), nunca el tuyo.
 */
export async function liberarPerfil(perfil: string): Promise<void> {
  const anotado = puertoDelPerfil(perfil)
  if (anotado) await cerrarPorCDP(anotado)
  if (!perfilTomado(perfil)) return
  // Sigue tomado: uno abierto antes de anotar el puerto, o uno cuyo depurador no contesta. Se busca por su perfil.
  const huerfano = procesoDelPerfil(await ordenesDeNavegadores(), perfil)
  if (!huerfano) return
  if (huerfano.puerto && huerfano.puerto !== anotado) await cerrarPorCDP(huerfano.puerto)
  if (!vive(huerfano.pid)) return
  try {
    process.kill(huerfano.pid)
  } catch {
    return
  }
  for (let i = 0; i < 20 && vive(huerfano.pid); i++) await new Promise((r) => setTimeout(r, 250))
  // Chrome suelta el perfil un instante después de salir.
  await new Promise((r) => setTimeout(r, 500))
}

const vive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Le pide por CDP al navegador de ese puerto que se cierre, y espera a que deje de contestar (hasta 5 s). */
async function cerrarPorCDP(puerto: number): Promise<void> {
  const nav: NavegadorDepurable = { valor: puerto, proceso: null, exe: null }
  if (!(await responde(nav))) return
  try {
    const { webSocketDebuggerUrl } = (await (await fetch(`http://127.0.0.1:${puerto}/json/version`)).json()) as { webSocketDebuggerUrl: string }
    await new Promise<void>((ok) => {
      const ws = new WebSocket(webSocketDebuggerUrl)
      const fin = () => (clearTimeout(t), ok())
      const t = setTimeout(() => (ws.terminate(), ok()), 3000)
      ws.once('open', () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })))
      ws.once('close', fin)
      ws.once('error', fin)
    })
  } catch {
    // Se fue solo mientras tanto.
  }
  for (let i = 0; i < 20 && (await responde(nav)); i++) await new Promise((r) => setTimeout(r, 250))
}

/** Abre `exe` (Chrome o Edge) con el depurador en un puerto libre; deja el puerto en `nav.valor`. */
export async function lanzarNavegador(nav: NavegadorDepurable, exe: string, args: string[], l: Lanzador = real): Promise<void> {
  enganchar()
  const perfil = args.find((a) => a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length).replace(/^"|"$/g, '')
  if (perfil) await (l.liberar ?? liberarPerfil)(perfil)
  const puerto = await l.puerto()
  if (perfil && l.spawn === spawnReal) {
    try {
      mkdirSync(perfil, { recursive: true })
      writeFileSync(join(perfil, ANOTADO), `${puerto}\n`)
    } catch {
      // Sin anotarlo, el siguiente lo busca entre los procesos.
    }
  }
  const p = l.spawn(exe, argumentos(puerto, args), { stdio: 'ignore', windowsHide: false })
  p.unref?.()
  nav.valor = puerto
  nav.exe = exe
  vivos.add(p)
  nav.proceso = p
  p.once('exit', () => {
    vivos.delete(p)
    if (nav.proceso === p) {
      nav.proceso = null
      nav.valor = 0
      nav.exe = null
    }
  })
  // Uno que no se pudo lanzar (no existe, sin permiso) avisa por `error`: sin esto, tumbaría el servidor.
  p.once('error', () => {
    vivos.delete(p)
    if (nav.proceso === p) Object.assign(nav, nuevoNavegador())
  })
}

/** Cierra el navegador de un perfil si Sloth lo abrió. */
export function cerrarNavegador(nav: NavegadorDepurable) {
  nav.proceso?.kill()
}

/** ¿Contesta su depurador? */
export const responde = (nav: NavegadorDepurable) =>
  nav.valor
    ? fetch(`http://127.0.0.1:${nav.valor}/json/version`).then(
        (r) => r.ok,
        () => false
      )
    : Promise.resolve(false)

/** Espera a que conteste (hasta 20 s). */
export async function esperarQueResponda(nav: NavegadorDepurable, intentos = 40) {
  for (let i = 0; i < intentos && !(await responde(nav)); i++) await new Promise((r) => setTimeout(r, 500))
  return responde(nav)
}
