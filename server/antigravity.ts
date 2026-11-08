import { entornoSinLlaves } from './acceso.ts'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CuentaClaude, Model } from '../shared/types.ts'
import type { AgentOptions, AgentRun } from './agent.ts'
import { cerrarCompartida, conectar, startAcp, valoresDe, type Conexion, type OpcionAcp, type SaborAcp } from './acp.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { guardar } from './disco.ts'

/**
 * Antigravity, el agente de Google, por su servidor ACP (`server/acp.ts`), como en T3 Code: el zip que publica Google
 * (`server/agentes.ts`), con las cuentas de Google de cada quien.
 *
 * Todo lo suyo va en `data/antigravity` (`GEMINI_HOME`), no en el Gemini o el Antigravity que tenga el usuario: sus
 * conversaciones, la lista de modelos que vio la última vez y la sesión de Google con que arranca (`acp_token.json`).
 * Cada vez que arranca desempaca cientos de MB en su carpeta temporal (va en una propia y se borra al cerrar) y tarda
 * unos 40 s: por eso un solo proceso sirve a todos los hilos de una cuenta (`compartido`), y no uno por hilo como en T3
 * Code. En una computadora lenta, o con el antivirus revisando cada archivo, pasa de los 3 min: se le esperan 10 (`DESEMPACAR`).
 *
 * Se conectan las cuentas que quieras (`cuentas.json`, y la sesión de cada una en `cuentas/<id>.json`): cada hilo
 * trabaja con la que esté en uso, y su proceso arranca con esa sesión copiada en `acp_token.json`. La cuota es semanal y
 * por grupo de modelos (`grupoDe`): cuando a una cuenta se le acaba, se anota hasta cuándo y el hilo sigue solo con la
 * siguiente que tenga (`agotar`). Una cuenta nueva inicia sesión en su propia carpeta (`ENTRANDO`), para no tocar la
 * sesión de los procesos que ya trabajan.
 *
 * No se puede desempacar una sola vez y reusarlo: es un PyInstaller de un solo archivo, y la copia de sí mismo que lanza
 * solo acepta la carpeta si el proceso que la desempacó (su PID va en el nombre, `_MEI…`) sigue vivo.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATOS = join(APP, 'data', 'antigravity')
const TOKEN = join(DATOS, 'antigravity-acp', 'acp_token.json')
const MODELOS = join(DATOS, 'modelos.json')
const ARRANQUE = join(DATOS, 'arranque.json')
/** Las cuentas conectadas, y la sesión de Google de cada una. */
const LISTA = join(DATOS, 'cuentas.json')
const SESIONES = join(DATOS, 'cuentas')
/** El `GEMINI_HOME` de una cuenta que inicia sesión: se borra al terminar. */
const ENTRANDO = join(DATOS, 'entrando')
/** La «cuenta» del proceso que inicia sesión. */
const NUEVA = 'nueva'
/** Lo que se espera a `initialize`, casi todo desempacando. */
const DESEMPACAR = 10 * 60_000
/** Su primera línea, ya desempacado. */
const ARRANCO = /Starting AGY ACP Server/
/** Si el último que se lanzó ya terminó de desempacar. */
let arranco = false

/** Lo que escribió Antigravity en el último inicio de sesión que falló: dice por qué. */
const REGISTRO = join(DATOS, 'inicio-de-sesion.log')
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
function lanzar(exe: string, casa: string) {
  barrer()
  const ajustes = join(casa, 'antigravity-acp', 'settings.json')
  if (!existsSync(ajustes)) {
    mkdirSync(dirname(ajustes), { recursive: true })
    guardar(ajustes, JSON.stringify({ auth: { type: METODO } }, null, 2))
  }
  arranco = false
  const temporal = join(tmpdir(), `sloth-agy-${randomBytes(3).toString('hex')}`)
  mkdirSync(temporal, { recursive: true })
  temporales.add(temporal)
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(entornoSinLlaves()).filter(([k]) => !FUERA.test(k)))
  Object.assign(env, {
    GEMINI_HOME: casa,
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

/** En un turno: diez minutos sin decir nada ya no es pensar; con una herramienta abierta, una hora, por los renders. */
const MUDO = { sin: 10 * 60_000, con: 60 * 60_000 }

/** La cuota va por grupo: los Gemini, y Claude con GPT. Sin modelo elegido, Antigravity usa uno de Gemini. */
export type Grupo = 'gemini' | 'otros'
export const grupoDe = (modelo: string): Grupo => (/claude|gpt/i.test(modelo) ? 'otros' : 'gemini')
const NOMBRE_GRUPO: Record<Grupo, string> = { gemini: 'Gemini', otros: 'Claude y GPT' }

/** «reset in 5 days, 2 hours», en ms. */
export function renuevaEn(texto: string): number | undefined {
  const tramo = /reset in ([^.\n]+)/i.exec(texto)?.[1]
  if (!tramo) return
  const UNIDAD: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000 }
  let ms = 0
  for (const [, n, u] of tramo.matchAll(/(\d+)\s*(d|h|m)/gi)) ms += Number(n) * UNIDAD[u.toLowerCase()]
  return ms || undefined
}

/**
 * Antigravity convierte en texto los errores del modelo y cierra el turno con `end_turn`, como si fueran su respuesta.
 * Se conoce por ser todo su último mensaje y empezar así. `cuota`: se acabó la de la cuenta (`agotar` ve si hay otra).
 */
export function errorAntigravity(texto: string): { error: string; relevo?: boolean; cuota?: true } | undefined {
  const t = texto.trim()
  if (t.length > 2000) return
  if (/^Usage Limit Reached\b/i.test(t)) {
    const cuando = /reset in ([^.\n]+)/i.exec(t)?.[1].replace(/\bdays?\b/g, (d) => (d === 'day' ? 'día' : 'días')).replace(/\bhours?\b/g, (h) => (h === 'hour' ? 'hora' : 'horas')).replace(/\bminutes?\b/g, (m) => (m === 'minute' ? 'minuto' : 'minutos'))
    return { error: `Se acabó tu cuota de este grupo de modelos.${cuando ? ` Se renueva en ${cuando}.` : ''} Mientras, elige abajo un modelo del otro grupo (Gemini, o Claude y GPT) y pulsa «Reintentar», o conecta otra cuenta de Google en Opciones → Antigravity.`, cuota: true }
  }
  if (/^(?:Error:?\s*)?(?:Requested token count|The input\b|Prompt is too long|Input length)/i.test(t) && /\btokens?\b/i.test(t) && /exceed|too long|maximum/i.test(t)) {
    return { error: 'La conversación se pasó del tamaño que aguanta el modelo.', relevo: true }
  }
}

/** Una cuenta conectada: su correo (si Google lo dio) y hasta cuándo no le queda cuota de cada grupo. */
export interface CuentaAgy {
  id: string
  correo?: string
  agotada?: Partial<Record<Grupo, number>>
}
export interface ListaAgy {
  activa?: string
  cuentas: CuentaAgy[]
}

const libre = (c: CuentaAgy, grupo: Grupo, ahora: number) => !((c.agotada?.[grupo] ?? 0) > ahora)

/** Con qué cuenta trabaja un modelo: la que está en uso si le queda cuota; si no, la siguiente que tenga. */
export function elegirCuenta(lista: ListaAgy, grupo: Grupo, ahora = Date.now()): string | undefined {
  const i = Math.max(0, lista.cuentas.findIndex((c) => c.id === lista.activa))
  const orden = [...lista.cuentas.slice(i), ...lista.cuentas.slice(0, i)]
  return orden.find((c) => libre(c, grupo, ahora))?.id
}

function leerLista(): ListaAgy {
  try {
    const l = JSON.parse(readFileSync(LISTA, 'utf8')) as ListaAgy
    if (Array.isArray(l.cuentas)) return l
  } catch {
    // Sin lista: la sesión de antes de las cuentas, si la hay, es la primera.
  }
  if (!existsSync(TOKEN)) return { cuentas: [] }
  const id = randomBytes(4).toString('hex')
  mkdirSync(SESIONES, { recursive: true })
  guardar(join(SESIONES, `${id}.json`), readFileSync(TOKEN))
  const l = { activa: id, cuentas: [{ id }] }
  guardarLista(l)
  return l
}

function guardarLista(l: ListaAgy) {
  mkdirSync(DATOS, { recursive: true })
  guardar(LISTA, JSON.stringify(l, null, 2))
}

/** La cuenta de un hilo, y queda en uso. Sin cuentas, ninguna: `lanzar` pide conectarla. */
function cuentaPara(modelo: string): string {
  const l = leerLista()
  const id = elegirCuenta(l, grupoDe(modelo)) ?? l.activa ?? l.cuentas[0]?.id
  if (id && id !== l.activa) guardarLista({ ...l, activa: id })
  return id ?? ''
}

const nombre = (l: ListaAgy, id?: string) => {
  const i = l.cuentas.findIndex((c) => c.id === id)
  return l.cuentas[i]?.correo ?? (l.cuentas.length > 1 ? `tu cuenta de Google ${i + 1}` : 'tu cuenta de Google')
}

const fecha = (ms: number) => new Date(ms).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/**
 * Se acabó la cuota de una cuenta: se anota hasta cuándo, y si otra tiene, el hilo sigue con ella en una sesión nueva
 * (`relevo`), con el resumen de lo hablado. Sin otra, el aviso de siempre.
 */
function agotar(texto: string, modelo: string, cuenta?: string): { error: string; relevo?: boolean } | undefined {
  const l = leerLista()
  const grupo = grupoDe(modelo)
  const c = l.cuentas.find((x) => x.id === cuenta)
  if (!c) return
  c.agotada = { ...c.agotada, [grupo]: Date.now() + (renuevaEn(texto) ?? 86_400_000) }
  const sigue = elegirCuenta(l, grupo)
  guardarLista(sigue ? { ...l, activa: sigue } : l)
  if (sigue) return { error: `Se acabó la cuota de ${NOMBRE_GRUPO[grupo]} en ${nombre(l, cuenta)}. Sloth sigue con ${nombre(l, sigue)}.`, relevo: true }
  if (l.cuentas.length < 2) return
  const pronto = Math.min(...l.cuentas.map((x) => x.agotada?.[grupo] ?? Infinity))
  return { error: `Se acabó la cuota de ${NOMBRE_GRUPO[grupo]} en tus ${l.cuentas.length} cuentas de Google. La primera vuelve el ${fecha(pronto)}. Mientras, elige abajo un modelo del otro grupo y pulsa «Reintentar», o conecta otra cuenta en Opciones → Antigravity.` }
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
  cuenta: (opts) => cuentaPara(opts.model.slice('antigravity:'.length)),
  lanzar(_opts, cuenta) {
    const exe = rutaAgente('antigravity')
    if (!exe) {
      void asegurarAgente('antigravity').catch(() => {})
      throw new Error('Antigravity se está descargando otra vez (230 MB). Vuelve a mandar tu mensaje en unos minutos; tu cuenta sigue conectada.')
    }
    if (cuenta === NUEVA) return lanzar(exe, ENTRANDO)
    const sesion = cuenta && join(SESIONES, `${cuenta}.json`)
    if (!sesion || !existsSync(sesion)) throw new Error(SIN_CUENTA)
    mkdirSync(dirname(TOKEN), { recursive: true })
    guardar(TOKEN, readFileSync(sesion))
    return lanzar(exe, DATOS)
  },
  alTexto(linea) {
    if (login && login.lineas.length < 400) login.lineas.push(linea)
    if (ARRANCO.test(linea)) arranco = true
    const m = ENLACE.exec(linea)
    if (!m || !login) return
    login.url = m[1]
    if (login.c) medido('login', Date.now() - login.c.desde)
  },
  arranque: { dura: () => dura('hilo'), medido: (ms) => medido('hilo', ms) },
  esperaInicio: () => DESEMPACAR,
  // Solo ofrece los modelos que no son de Gemini a clientes que conoce, como Zed (T3 Code).
  clientInfo: { name: 'zed', version: '0.0.0' },
  leeArchivos: true,
  autenticar: METODO,
  modo: 'yolo',
  sinCuenta: 'Conecta tu cuenta de Google en Opciones → Antigravity.',
  alVerModelos: guardarModelos,
  compartido: true,
  errorDe(texto, { modelo, cuenta }) {
    const malo = errorAntigravity(texto)
    return malo?.cuota ? (agotar(texto, modelo, cuenta) ?? malo) : malo
  },
  mudo: MUDO,
  contextoOpaco: true
}

const SIN_CUENTA = SABOR.sinCuenta

export const startAntigravity = (opts: AgentOptions): AgentRun => startAcp(SABOR, opts)

/**
 * Los modelos que vio la última sesión (o la de conectar la cuenta). Aunque falte el programa (el antivirus lo borró, o
 * se cortó su descarga): la cuenta sigue valiendo, y el primer mensaje lo vuelve a bajar (`conAgente`).
 */
export async function modelosAntigravity(): Promise<Model[]> {
  if (!leerLista().cuentas.length) return []
  try {
    return JSON.parse(readFileSync(MODELOS, 'utf8'))
  } catch {
    return []
  }
}

type Sesion = { client_id?: string; client_secret?: string; refresh_token?: string; token_uri?: string }

/** El correo de una sesión, para distinguir las cuentas: la sesión trae permiso para leerlo (`userinfo.email`). */
async function correoDe(s: Sesion): Promise<string | undefined> {
  try {
    if (!s.refresh_token || !s.client_id) return
    const signal = AbortSignal.timeout(15_000)
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: s.client_id, client_secret: s.client_secret ?? '' })
    const t = (await (await fetch(s.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', body, signal })).json()) as { access_token?: string }
    if (!t.access_token) return
    const u = (await (await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: `Bearer ${t.access_token}` }, signal })).json()) as { email?: string }
    return u.email || undefined
  } catch {
    return
  }
}

/** Las cuentas sin correo (la de antes de las cuentas) lo buscan una vez por arranque de Sloth. */
const buscados = new Set<string>()
function buscarCorreos(l: ListaAgy) {
  for (const c of l.cuentas) {
    if (c.correo || buscados.has(c.id)) continue
    buscados.add(c.id)
    void (async () => {
      const correo = await correoDe(JSON.parse(readFileSync(join(SESIONES, `${c.id}.json`), 'utf8')))
      if (!correo) return
      const ahora = leerLista()
      const x = ahora.cuentas.find((y) => y.id === c.id)
      if (x) guardarLista({ ...ahora, cuentas: ahora.cuentas.map((y) => (y === x ? { ...y, correo } : y)) })
    })().catch(() => {})
  }
}

/** Mientras se inicia sesión: el enlace de Google, si ya lo dio, el proceso que espera y lo que va escribiendo. */
type Login = { url?: string; c?: Conexion; lineas: string[] }
let login: Login | undefined
let fallo = ''

export function cuentaAntigravity(): CuentaClaude {
  const l = leerLista()
  buscarCorreos(l)
  // Sin el programa sigue conectada: se baja solo con el primer mensaje, sin volver a iniciar sesión.
  const conectada = l.cuentas.length > 0
  const arranque = login?.c && !login.url ? { desde: login.c.desde, dura: dura('login') } : undefined
  const ahora = Date.now()
  const activa = l.cuentas.find((c) => c.id === l.activa) ?? l.cuentas[0]
  const estado = (c: CuentaAgy) =>
    (['gemini', 'otros'] as const)
      .filter((g) => !libre(c, g, ahora))
      .map((g) => ` · sin ${NOMBRE_GRUPO[g]} hasta el ${fecha(c.agotada![g]!)}`)
      .join('')
  return {
    conectada,
    quien: conectada ? `${nombre(l, activa?.id).replace(/^tu c/, 'C')}${l.cuentas.length > 1 ? ` (y ${l.cuentas.length - 1} más)` : ''}` : undefined,
    cuentas: conectada ? l.cuentas.map((c) => ({ id: c.id, quien: `${nombre(l, c.id).replace(/^tu c/, 'C')}${estado(c)}`, activa: c.id === activa?.id })) : undefined,
    conectando: login && { url: login.url, arranque },
    error: fallo || undefined
  }
}

export const conectandoAntigravity = () => (login ? 'Se está conectando la cuenta de Google de Antigravity. Termina de autorizarla primero.' : null)

/**
 * Conecta otra cuenta (o la primera): el servidor ACP, en su propia carpeta (`ENTRANDO`), tarda en arrancar y luego abre
 * él mismo el navegador en la página de Google, y espera en su puerto local a que vuelva. Por eso Opciones no abre
 * pestaña; el enlace se enseña por si el navegador no se abrió. Al acabar, se abre una sesión para saber qué modelos tiene
 * la cuenta, su sesión pasa a `cuentas/` (la misma cuenta otra vez se renueva, no se repite) y queda en uso.
 */
export async function conectarAntigravity(): Promise<CuentaClaude> {
  if (login) return cuentaAntigravity()
  const este: Login = (login = { lineas: [] })
  fallo = ''
  const nueva = join(ENTRANDO, 'antigravity-acp', 'acp_token.json')
  void (async () => {
    await asegurarAgente('antigravity')
    if (login !== este) return
    rmSync(ENTRANDO, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 })
    const c = (este.c = conectar(SABOR, {} as AgentOptions, NUEVA))
    try {
      await c.ini
      const s = await c.rpc.request('session/new', { cwd: tmpdir(), mcpServers: [] }, 180_000)
      guardarModelos(s?.configOptions ?? [])
      const sesion = readFileSync(nueva, 'utf8')
      const correo = await correoDe(JSON.parse(sesion))
      const l = leerLista()
      const id = l.cuentas.find((x) => correo && x.correo === correo)?.id ?? randomBytes(4).toString('hex')
      mkdirSync(SESIONES, { recursive: true })
      guardar(join(SESIONES, `${id}.json`), sesion)
      const cuentas = l.cuentas.some((x) => x.id === id) ? l.cuentas.map((x) => (x.id === id ? { id, correo } : x)) : [...l.cuentas, { id, correo }]
      guardarLista({ activa: id, cuentas })
    } finally {
      c.rpc.close()
      setTimeout(() => void rm(ENTRANDO, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 }).catch(() => {}), 3000).unref()
    }
  })()
    .catch((e) => {
      // Si lo cancelaste, no hay nada que avisar. Si no, el porqué va en el mensaje y, entero, en `REGISTRO`: «No se
      // terminó» a secas no decía nada de lo que pasa en las computadoras donde no entra.
      if (login !== este) return
      const porque = e instanceof Error ? e.message : String(e)
      fallo = !arranco && porque.includes('(initialize)')
        ? 'Antigravity no terminó de arrancar en 10 minutos. Cada vez que se abre desempaca 335 MB en la carpeta temporal, y en esta computadora no le alcanzó el tiempo: suele ser el antivirus revisando cada archivo, o el disco casi lleno. Vuelve a intentarlo con menos programas abiertos.'
        : este.c?.rpc.terminado && !existsSync(nueva)
          ? `No se terminó de iniciar sesión (${porque}). Vuelve a intentarlo.`
          : porque
      try {
        mkdirSync(DATOS, { recursive: true })
        guardar(REGISTRO, [new Date().toISOString(), porque, '', ...este.lineas].join('\n'))
      } catch {
        // Sin registro: el mensaje basta.
      }
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

/** Trabaja con esta cuenta desde ahora; si la elegiste tú, se le vuelve a probar la cuota. */
export function usarAntigravity(id: string): CuentaClaude {
  const l = leerLista()
  if (!l.cuentas.some((c) => c.id === id)) throw new Error('Esa cuenta ya no está conectada.')
  guardarLista({ activa: id, cuentas: l.cuentas.map((c) => (c.id === id ? { id: c.id, correo: c.correo } : c)) })
  return cuentaAntigravity()
}

/** Quita una cuenta: borra su sesión de esta computadora y cierra su proceso. Sin ninguna, es cerrar sesión. */
export function quitarAntigravity(id: string): CuentaClaude {
  const l = leerLista()
  const cuentas = l.cuentas.filter((c) => c.id !== id)
  if (!cuentas.length) return salirAntigravity()
  cerrarCompartida(SABOR, id)
  rmSync(join(SESIONES, `${id}.json`), { force: true })
  guardarLista({ activa: l.activa === id ? cuentas[0].id : l.activa, cuentas })
  return cuentaAntigravity()
}

/** Cierra la sesión de todas las cuentas de Google: borra las suyas de esta computadora y deja de usarlas. */
export function salirAntigravity(): CuentaClaude {
  cerrarCompartida(SABOR)
  for (const f of [TOKEN, MODELOS, LISTA]) rmSync(f, { force: true })
  rmSync(SESIONES, { recursive: true, force: true })
  return cuentaAntigravity()
}
