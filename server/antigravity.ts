import { entornoSinLlaves } from './acceso.ts'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CuentaClaude, Model } from '../shared/types.ts'
import type { AgentOptions, AgentRun } from './agent.ts'
import { cerrarCompartida, conectar, soltar, startAcp, valoresDe, type Conexion, type OpcionAcp, type SaborAcp } from './acp.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { guardar } from './disco.ts'

/**
 * Antigravity, el agente de Google, por su servidor ACP (`server/acp.ts`), como en T3 Code: el zip que publica Google
 * (`server/agentes.ts`), con la cuenta de Google de cada quien.
 *
 * Todo lo suyo va en `data/antigravity` (`GEMINI_HOME`), no en el Gemini o el Antigravity que tenga el usuario: su sesión
 * de Google (`acp_token.json`), sus conversaciones y la lista de modelos que vio la última vez. Cada vez que arranca
 * desempaca cientos de MB en su carpeta temporal (va en una propia y se borra al cerrar) y tarda unos 40 s: por eso un
 * solo proceso sirve a todos sus hilos (`compartido`), y no uno por hilo como en T3 Code.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATOS = join(APP, 'data', 'antigravity')
const AJUSTES = join(DATOS, 'antigravity-acp', 'settings.json')
const TOKEN = join(DATOS, 'antigravity-acp', 'acp_token.json')
const MODELOS = join(DATOS, 'modelos.json')
const ARRANQUE = join(DATOS, 'arranque.json')
/** Con la cuenta personal de Google. */
const METODO = 'oauth-personal'
/** El aviso con que pide abrir el navegador para iniciar sesión. */
const ENLACE = /Open the following link to authenticate the ACP server:\s*(\S+)/i

/** Las llaves de Google del entorno mandarían sobre la cuenta: se quitan, como en T3 Code. */
const FUERA = /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_.*|GOOGLE_GENAI_USE_VERTEXAI|GCLOUD_PROJECT|CLOUDSDK_CORE_PROJECT|AGY_ACP_.*|GEMINI_HOME|ANTIGRAVITY_HARNESS_PATH|ELECTRON_RUN_AS_NODE)$/i

/** Las carpetas temporales en uso. Al salir Sloth no llega el reloj que las borra (y el proceso ya se cerró: `server/acp.ts`). */
const temporales = new Set<string>()
process.once('exit', () => {
  for (const t of temporales) {
    try {
      rmSync(t, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 })
    } catch {
      // La borra `barrer`.
    }
  }
})

/** Las carpetas temporales de un cierre brusco, que pesan cientos de MB: las de más de un día ya no las usa nadie. */
function barrer() {
  for (const d of readdirSync(tmpdir())) {
    if (!d.startsWith('sloth-agy-')) continue
    const ruta = join(tmpdir(), d)
    if (Date.now() - (statSync(ruta, { throwIfNoEntry: false })?.mtimeMs ?? Date.now()) > 86_400_000) void rm(ruta, { recursive: true, force: true }).catch(() => {})
  }
}

/** El programa y su entorno, con su carpeta temporal propia (corta: Windows no deja rutas de más de 260 letras). */
function lanzar(exe: string) {
  barrer()
  if (!existsSync(AJUSTES)) {
    mkdirSync(dirname(AJUSTES), { recursive: true })
    guardar(AJUSTES, JSON.stringify({ auth: { type: METODO } }, null, 2))
  }
  const temporal = join(tmpdir(), `sloth-agy-${randomBytes(3).toString('hex')}`)
  mkdirSync(temporal, { recursive: true })
  temporales.add(temporal)
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(entornoSinLlaves()).filter(([k]) => !FUERA.test(k)))
  Object.assign(env, {
    GEMINI_HOME: DATOS,
    AGY_ACP_FORCE_FILE_STORAGE: '1',
    PYTHONUNBUFFERED: '1',
    ANTIGRAVITY_HARNESS_PATH: join(dirname(exe), process.platform === 'win32' ? 'localharness_external.exe' : 'localharness_external'),
    ...(process.platform === 'win32' ? { TEMP: temporal, TMP: temporal } : { TMPDIR: temporal })
  })
  // Tarda en soltar sus archivos después de cerrarse.
  const alCerrar = () =>
    setTimeout(() => {
      temporales.delete(temporal)
      void rm(temporal, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }).catch(() => {})
    }, 3000).unref()
  return { command: exe, args: process.platform === 'linux' ? ['--uid='] : [], env, alCerrar }
}

/** Lo que la sesión dice de los modelos, como los guarda Sloth para el catálogo. */
function guardarModelos(opciones: OpcionAcp[]) {
  const modelo = opciones.find((o) => o.category === 'model' || o.id === 'model')
  const nivel = opciones.find((o) => o.category === 'thought_level')
  const lista: Model[] = valoresDe(modelo).map((v) => ({
    id: `antigravity:${v.value}`,
    label: `Antigravity · ${v.name ?? v.value}`,
    efforts: valoresDe(nivel).map((n) => n.value),
    defaultEffort: nivel?.currentValue
  }))
  if (!lista.length) return
  mkdirSync(DATOS, { recursive: true })
  guardar(MODELOS, JSON.stringify(lista, null, 2))
}

/** Lo que suele tardar en arrancar, en ms, hasta abrir un hilo o dar el enlace de Google. Lo medido en esta computadora manda. */
const TARDA = { hilo: 60_000, login: 40_000 }
const leerTardanzas = (): Partial<typeof TARDA> => {
  try {
    return JSON.parse(readFileSync(ARRANQUE, 'utf8'))
  } catch {
    return {}
  }
}
const dura = (que: keyof typeof TARDA) => leerTardanzas()[que] ?? TARDA[que]
const medido = (que: keyof typeof TARDA, ms: number) => guardar(ARRANQUE, JSON.stringify({ ...leerTardanzas(), [que]: ms }))

const SABOR: SaborAcp = {
  nombre: 'Antigravity',
  prefijo: 'antigravity',
  lanzar() {
    const exe = rutaAgente('antigravity')
    if (!exe) throw new Error('Antigravity aún no está descargado.')
    if (!existsSync(TOKEN) && !login) throw new Error(SIN_CUENTA)
    return lanzar(exe)
  },
  alTexto(linea) {
    const m = ENLACE.exec(linea)
    if (!m || !login) return
    login.url = m[1]
    if (login.c) medido('login', Date.now() - login.c.desde)
  },
  arranque: { dura: () => dura('hilo'), medido: (ms) => medido('hilo', ms) },
  // Solo ofrece los modelos que no son de Gemini a clientes que conoce, como Zed (T3 Code).
  clientInfo: { name: 'zed', version: '0.0.0' },
  leeArchivos: true,
  autenticar: METODO,
  modo: 'yolo',
  sinCuenta: 'Conecta tu cuenta de Google en Opciones → Antigravity.',
  alVerModelos: guardarModelos,
  compartido: true
}

const SIN_CUENTA = SABOR.sinCuenta

export const startAntigravity = (opts: AgentOptions): AgentRun => startAcp(SABOR, opts)

/** Los modelos que vio la última sesión (o la de conectar la cuenta). */
export async function modelosAntigravity(): Promise<Model[]> {
  if (!rutaAgente('antigravity') || !existsSync(TOKEN)) return []
  try {
    return JSON.parse(readFileSync(MODELOS, 'utf8'))
  } catch {
    return []
  }
}

/** Mientras se inicia sesión: el enlace de Google, si ya lo dio, y el proceso que espera. */
type Login = { url?: string; c?: Conexion }
let login: Login | undefined
let fallo = ''

export function cuentaAntigravity(): CuentaClaude {
  const conectada = !!rutaAgente('antigravity') && existsSync(TOKEN) && !login
  const arranque = login?.c && !login.url ? { desde: login.c.desde, dura: dura('login') } : undefined
  return { conectada, quien: conectada ? 'Cuenta de Google' : undefined, conectando: login && { url: login.url, arranque }, error: fallo || undefined }
}

export const conectandoAntigravity = () => (login ? 'Se está conectando la cuenta de Google de Antigravity. Termina de autorizarla primero.' : null)

/**
 * Inicia sesión: el servidor ACP tarda en arrancar y luego abre él mismo el navegador en la página de Google, y espera en
 * su puerto local a que vuelva. Por eso Opciones no abre pestaña; el enlace se enseña por si el navegador no se abrió. Al
 * acabar, se abre una sesión para saber qué modelos tiene la cuenta, y el proceso se queda para el primer hilo.
 */
export async function conectarAntigravity(): Promise<CuentaClaude> {
  if (login) return cuentaAntigravity()
  const este: Login = (login = {})
  fallo = ''
  void (async () => {
    await asegurarAgente('antigravity')
    cerrarCompartida(SABOR)
    const c = (este.c = conectar(SABOR, {} as AgentOptions))
    try {
      await c.ini
      const s = await c.rpc.request('session/new', { cwd: tmpdir(), mcpServers: [] }, 180_000)
      guardarModelos(s?.configOptions ?? [])
    } finally {
      soltar(SABOR, c)
    }
  })()
    .catch((e) => {
      // Si lo cancelaste, no hay nada que avisar.
      if (login === este) fallo = este.c?.rpc.terminado && !existsSync(TOKEN) ? 'No se terminó de iniciar sesión. Vuelve a intentarlo.' : e instanceof Error ? e.message : String(e)
    })
    .finally(() => {
      if (login === este) login = undefined
    })
  return cuentaAntigravity()
}

/** Deja de esperar al navegador. */
export function cancelarAntigravity(): CuentaClaude {
  const c = login?.c
  login = undefined
  c?.rpc.close()
  return cuentaAntigravity()
}

/** Cierra la sesión de Google: borra su token de esta computadora y deja de usarla. */
export function salirAntigravity(): CuentaClaude {
  cerrarCompartida(SABOR)
  rmSync(TOKEN, { force: true })
  rmSync(MODELOS, { force: true })
  return cuentaAntigravity()
}
