import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Opciones } from '../shared/types.ts'
import { guardar } from './disco.ts'

/**
 * Las llaves de API no viven en la app: van a las variables de entorno del usuario de Windows, donde las leen los
 * scripts de las skills (también fuera de Sloth); en Mac y Linux, a `VARIABLES`. En otra computadora se escriben de nuevo
 * en Opciones.
 */
const YOUTUBE = 'YOUTUBE_API_KEY'
/** El token de Meta (inicio de sesión con Facebook) con que Ideas lee Instagram. No es el de la nube, que publica. */
const META = 'INSTAGRAM_META_TOKEN'
const GRAPH = 'https://graph.facebook.com/v25.0'

/**
 * Lo leído del registro. Cada `reg query` es un proceso que para el servidor hasta que acaba, y se pedían en cada vista
 * de Ideas y en cada llamada a la nube: se lee una vez por arranque, y lo que se guarda desde Opciones se apunta aquí.
 * Una variable que cambies fuera de Sloth se ve al reiniciarlo.
 */
const leidas = new Map<string, string>()

/**
 * Fuera de Windows no hay variables del usuario que lean todos los programas: van a este archivo, que scripts/start.mjs
 * pasa al entorno al arrancar (y de ahí a los agentes y a sus scripts).
 */
const VARIABLES = join(process.env.APPDATA ?? '', 'sloth', 'variables.json')
const variables = (): Record<string, string> => {
  try {
    return JSON.parse(readFileSync(VARIABLES, 'utf8'))
  } catch {
    return {}
  }
}

export function leer(nombre: string): string {
  let valor = leidas.get(nombre)
  if (valor !== undefined) return valor
  if (process.platform !== 'win32') {
    valor = variables()[nombre] ?? ''
    leidas.set(nombre, valor)
    return valor
  }
  try {
    // Sin stderr: si no existe, `reg` lo dice ahí, y llenaba la consola del servidor.
    const salida = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', nombre], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    valor = /REG_\w+\s+(.+)$/m.exec(salida)?.[1].trim() ?? ''
  } catch {
    valor = '' // No existe.
  }
  leidas.set(nombre, valor)
  return valor
}

/** La llave va por el entorno del proceso, no en la línea de comandos, para que no se vea en la lista de procesos. */
export function escribir(nombre: string, valor: string | null) {
  if (process.platform !== 'win32') {
    const { [nombre]: _, ...resto } = variables()
    mkdirSync(dirname(VARIABLES), { recursive: true })
    guardar(VARIABLES, JSON.stringify(valor ? { ...resto, [nombre]: valor } : resto, null, 2))
    // Solo de quien la guardó: son llaves.
    chmodSync(VARIABLES, 0o600)
  } else
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `[Environment]::SetEnvironmentVariable('${nombre}', $env:SLOTH_VALOR, 'User')`], {
      env: { ...process.env, SLOTH_VALOR: valor ?? '' }
    })
  leidas.set(nombre, valor ?? '')
  // Los agentes que se lancen desde ahora la heredan sin reiniciar Sloth.
  if (valor) process.env[nombre] = valor
  else delete process.env[nombre]
}

const final = (llave: string) => (llave ? { final: llave.slice(-4) } : null)

export function opciones(): Opciones {
  const meta = leer(META)
  if (meta) void mirarCaduca(meta)
  return {
    youtube: final(leer(YOUTUBE)),
    meta: meta ? { final: meta.slice(-4), caduca: caducaMeta?.token === meta ? caducaMeta.en : undefined } : null
  }
}

/** La llave de la API de YouTube, si la hay: la del proceso, o la que se guardó después de arrancar. */
export function llaveYoutube(): string {
  return process.env[YOUTUBE] || leer(YOUTUBE)
}

/** Igual, el token de Meta. */
export function tokenMeta(): string {
  return process.env[META] || leer(META)
}

/**
 * Cuándo caduca el token de Meta (ms), para avisar en Opciones una semana antes. Lo dice Meta (`debug_token`; 0 es que
 * no caduca): se pregunta al arrancar y al guardarlo, y otra vez en la siguiente vista si no contestó.
 */
let caducaMeta: { token: string; en?: number } | null = null

async function mirarCaduca(token: string) {
  if (caducaMeta?.token === token) return
  caducaMeta = { token }
  const q = new URLSearchParams({ input_token: token, access_token: token })
  const data = ((await fetch(`${GRAPH}/debug_token?${q}`).then((r) => r.json()).catch(() => null)) as { data?: { expires_at?: number } } | null)?.data
  if (caducaMeta?.token !== token) return // Se cambió mientras tanto.
  if (!data) caducaMeta = null
  else if (data.expires_at) caducaMeta.en = data.expires_at * 1000
}

/** Prueba la llave de YouTube con un video (1 unidad de las 10 000 del día) antes de guardarla. `null` la quita. */
export async function guardarYoutube(llave: string | null): Promise<Opciones> {
  if (llave) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=id&id=jNQXAC9IVRw&key=${encodeURIComponent(llave)}`)
    if (!res.ok) {
      const motivo = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message
      throw new Error(res.status === 400 || res.status === 403 ? `Google no aceptó esa llave${motivo ? `: ${motivo}` : '.'}` : `Google respondió ${res.status}.`)
    }
  }
  escribir(YOUTUBE, llave)
  return opciones()
}

/**
 * Igual, con el token de Meta: tiene que ver al menos una Página de Facebook con su cuenta profesional de Instagram, que
 * es desde donde se pregunta por las demás (`server/ideas/instagram.ts`).
 */
export async function guardarMeta(token: string | null): Promise<Opciones> {
  caducaMeta = null
  if (token) {
    const q = new URLSearchParams({ fields: 'name,instagram_business_account{id,username}', access_token: token })
    const res = await fetch(`${GRAPH}/me/accounts?${q}`)
    const json = (await res.json().catch(() => null)) as { data?: { instagram_business_account?: unknown }[]; error?: { code?: number; message?: string } } | null
    if (json?.error) throw new Error(json.error.code === 190 ? 'Meta no aceptó ese token: caducó o no es válido.' : `Meta no aceptó ese token: ${json.error.message}`)
    if (!res.ok) throw new Error(`Meta respondió ${res.status}.`)
    if (!json?.data?.some((p) => p.instagram_business_account))
      throw new Error(
        'El token vale, pero no ve ninguna Página de Facebook vinculada a una cuenta profesional de Instagram. Vincula una Página a tu Instagram y genera el token con los permisos instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement y business_management.'
      )
    await mirarCaduca(token)
  }
  escribir(META, token)
  return opciones()
}

// Si ya había token, se pregunta al arrancar cuándo caduca, para que Opciones lo sepa al abrirse.
if (tokenMeta()) void mirarCaduca(tokenMeta())
