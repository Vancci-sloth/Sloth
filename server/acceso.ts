import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Proveedor } from '../shared/providers.ts'
import type { LlaveAgente } from '../shared/types.ts'
import { guardar } from './disco.ts'

/**
 * Cómo paga cada agente: con su cuenta (la suscripción de Claude o de ChatGPT) o con una llave de API, que se cobra por
 * uso. Se cambia en Opciones → Agentes, y la llave se queda guardada para volver a ella sin pegarla otra vez. Los hilos
 * que ya trabajan siguen como empezaron; lo nuevo sale con lo elegido.
 *
 * Las llaves van en `data/agentes.json`, no en las variables del usuario: ahí las leerían también su Claude Code y su
 * Codex de la terminal, que dejarían de usar su suscripción.
 * - Claude: Claude Code usa `ANTHROPIC_API_KEY` antes que la cuenta. Va en el entorno de Sloth, que heredan todos sus
 *   `query` y `claude auth status`; con la cuenta se quita, también si venía de fuera.
 * - Codex: el app-server usa un proveedor propio que la lee de su entorno (`codexConLlave`), así el inicio de sesión de
 *   ChatGPT queda como estaba. `codex exec` de las skills (las imágenes) la lee de `CODEX_API_KEY`. Cada hilo sigue con
 *   lo que empezó: al retomarlo, Codex reenvía el razonamiento de los turnos anteriores cifrado (`encrypted_content`) por
 *   el servidor que lo hizo, el de ChatGPT o la API, y no se puede pasar de uno a otro.
 * - Claude sí se cambia a media conversación: el razonamiento que hizo otra cuenta (Sonnet 5.5, Haiku 5.5) la API lo
 *   descarta sin error, y el hilo sigue con sus mensajes y herramientas.
 * - Claude con otra dirección (`direccion`): la llave va a un servicio compatible con la API de Anthropic (un proxy, un
 *   revendedor) en vez de a api.anthropic.com, como el «custom base URL» de Cline. Claude Code la lee de
 *   `ANTHROPIC_BASE_URL`, que solo se pone mientras se paga con esa llave.
 * - Los agentes nuevos no ven estas llaves (`entornoSinLlaves`); a Pi se le pueden prestar en Opciones (`entornoAgente`).
 * - DeepSeek, OpenRouter y FreeLLMAPI solo trabajan con su llave, en el Claude Code de Sloth (`entornoClaudeCon`).
 *   FreeLLMAPI corre en la computadora de cada quien: lleva además su dirección, que se busca sola si no se escribe.
 *   Ollama, igual, sin llave: se guarda la que su guía manda poner (`LLAVE_OLLAMA`), que es lo que dice que está conectado.
 */
const ARCHIVO = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'data', 'agentes.json')
const ENTORNO = { claude: 'ANTHROPIC_API_KEY', codex: 'CODEX_API_KEY' } as const
/** El proveedor de Codex con la llave, y la variable de donde la lee. */
const CODEX_API = 'sloth-api'
const CODEX_ENV = 'SLOTH_OPENAI_API_KEY'

/** `prestar`: el agente (Pi) usa las llaves que guardaste para los demás (`entornoAgente`). */
type Guardado = Partial<Record<Proveedor, { llave?: string; api?: boolean; prestar?: boolean; direccion?: string }>>

let datos: Guardado = {}
try {
  datos = JSON.parse(readFileSync(ARCHIVO, 'utf8'))
} catch {
  // Sin archivo, los dos con su cuenta.
}
/** La dirección que puso Sloth en `ANTHROPIC_BASE_URL`: la de fuera, si la había, no se toca. */
let direccionPuesta: string | undefined
aplicar()

function aplicar() {
  for (const p of ['claude', 'codex'] as const) {
    const llave = llaveEnUso(p)
    if (llave) process.env[ENTORNO[p]] = llave
    else delete process.env[ENTORNO[p]]
  }
  const dir = llaveEnUso('claude') && datos.claude?.direccion
  if (dir) process.env.ANTHROPIC_BASE_URL = direccionPuesta = dir
  else if (direccionPuesta && process.env.ANTHROPIC_BASE_URL === direccionPuesta) {
    delete process.env.ANTHROPIC_BASE_URL
    direccionPuesta = undefined
  }
}

/** La llave, si el proveedor paga con ella. */
export function llaveEnUso(p: Proveedor) {
  return (datos[p]?.api && datos[p]?.llave) || undefined
}

/**
 * El entorno de Sloth sin las llaves que puso él (`aplicar`): las de Claude y Codex son para ellos. Pi, por ejemplo, usa
 * `ANTHROPIC_API_KEY` si la ve, y cobraría en tu llave de Anthropic sin que lo eligieras.
 */
export function entornoSinLlaves(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const p of ['claude', 'codex'] as const) if (llaveEnUso(p) && env[ENTORNO[p]] === llaveEnUso(p)) delete env[ENTORNO[p]]
  if (direccionPuesta && env.ANTHROPIC_BASE_URL === direccionPuesta) delete env.ANTHROPIC_BASE_URL
  return env
}

/** Las llaves que se le pueden prestar a un agente, con la variable donde Pi (y casi todos) las busca. */
const PRESTABLES = { claude: ['Claude', 'ANTHROPIC_API_KEY'], codex: ['ChatGPT', 'OPENAI_API_KEY'], deepseek: ['DeepSeek', 'DEEPSEEK_API_KEY'] } as const

/** Las llaves que elegiste prestarle en Opciones (`prestarLlaves`): van todas las guardadas, se pague o no con ellas en su agente. */
export function llavesPrestadas(p: Proveedor) {
  const env: Record<string, string> = {}
  if (!datos[p]?.prestar) return env
  for (const [de, [, variable]] of Object.entries(PRESTABLES)) {
    const llave = datos[de as Proveedor]?.llave
    if (llave) env[variable] = llave
  }
  return env
}

/** El entorno de un agente nuevo: sin las llaves de Sloth (`entornoSinLlaves`), salvo las que le prestaste. */
export const entornoAgente = (p: Proveedor): NodeJS.ProcessEnv => ({ ...entornoSinLlaves(), ...llavesPrestadas(p) })

/** Lo que Opciones enseña de las llaves que se le pueden prestar a `p`: si se le prestan y de quién son. */
export function llavesPrestables(p: Proveedor) {
  const de = Object.entries(PRESTABLES).flatMap(([q, [nombre]]) => (datos[q as Proveedor]?.llave ? [nombre] : []))
  return { usar: !!datos[p]?.prestar, de }
}

export function prestarLlaves(p: Proveedor, usar: boolean) {
  datos = { ...datos, [p]: { ...datos[p], prestar: usar || undefined } }
  escribir()
}

function escribir() {
  mkdirSync(dirname(ARCHIVO), { recursive: true })
  guardar(ARCHIVO, JSON.stringify(datos, null, 2))
  // Solo de quien la guardó: son llaves.
  if (process.platform !== 'win32') chmodSync(ARCHIVO, 0o600)
}

/** La llave guardada, aunque ahora se pague con la cuenta. DeepSeek, OpenRouter, FreeLLMAPI y Gemini solo trabajan con ella. */
export const llaveGuardada = (p: Proveedor) => datos[p]?.llave

/** Adónde va la llave, si no es a la API de su marca: el servicio compatible de Claude, o el FreeLLMAPI o el Ollama de cada quien. */
export const direccionGuardada = (p: Proveedor) => datos[p]?.direccion

/**
 * El entorno con que Claude Code trabaja contra otra API compatible con la de Anthropic (DeepSeek, OpenRouter,
 * FreeLLMAPI, Ollama). Los alias que piden las skills y sus subagentes (`opus`, `sonnet`, `fable`) van al modelo del hilo, y
 * `haiku` (los títulos, lo rápido) a `rapido`, o al mismo. `ventana`: hasta dónde se llena el contexto antes de compactar;
 * sin ella, Claude Code supone 200 000. Sin la llave de Anthropic ni el token de la cuenta de Claude, que irían a esa API.
 */
export function entornoClaudeCon(o: { direccion: string; llave: string; modelo: string; rapido?: string; ventana?: number; effort?: string }): Record<string, string> {
  const { ANTHROPIC_API_KEY: _, CLAUDE_CODE_OAUTH_TOKEN: __, ...env } = process.env as Record<string, string>
  return {
    ...env,
    ANTHROPIC_BASE_URL: o.direccion,
    ANTHROPIC_AUTH_TOKEN: o.llave,
    ANTHROPIC_MODEL: o.modelo,
    ANTHROPIC_DEFAULT_FABLE_MODEL: o.modelo,
    ANTHROPIC_DEFAULT_OPUS_MODEL: o.modelo,
    ANTHROPIC_DEFAULT_SONNET_MODEL: o.modelo,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: o.rapido ?? o.modelo,
    ...(o.ventana ? { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(o.ventana) } : {}),
    ...(o.effort ? { CLAUDE_CODE_EFFORT_LEVEL: o.effort } : {})
  }
}

/** Lo que Opciones sabe de la llave guardada: su final y si es con ella como se paga. */
export function llaveDe(p: Proveedor): LlaveAgente | undefined {
  const l = datos[p]?.llave
  return l ? { final: l.slice(-4), activa: !!datos[p]?.api, ...(datos[p]?.direccion ? { direccion: datos[p]!.direccion } : {}) } : undefined
}

/** Cómo se dice la cuenta cuando se paga con la llave. */
export const conLlave = (p: Proveedor) => ({ conectada: true, quien: `Llave de API …${datos[p]!.llave!.slice(-4)}`, llave: llaveDe(p) })

/**
 * Lo que el app-server de Codex necesita para trabajar con la llave, o nada si va con la cuenta de ChatGPT. Con `guardada`,
 * la que haya aunque ahora se pague con la cuenta: la de un hilo que empezó con ella (`SessionMeta.conLlave`).
 */
export function codexConLlave(guardada = false) {
  const llave = guardada ? datos.codex?.llave : llaveEnUso('codex')
  if (!llave) return undefined
  return {
    proveedor: CODEX_API,
    env: { [CODEX_ENV]: llave },
    config: {
      model_provider: CODEX_API,
      model_providers: { [CODEX_API]: { name: 'OpenAI', base_url: 'https://api.openai.com/v1', env_key: CODEX_ENV, wire_api: 'responses' } }
    }
  }
}

export type CodexLlave = NonNullable<ReturnType<typeof codexConLlave>>

/**
 * Cambia cómo paga `p`. `llave`: la nueva (se prueba antes de guardarla), `null` para quitarla (y volver a la cuenta),
 * o nada para usar la que ya estaba. `direccion` (Claude, FreeLLMAPI y Ollama) va con una llave nueva: vacía, la de
 * Anthropic o, con FreeLLMAPI y Ollama, el que se encuentre en esta computadora.
 */
export async function cambiarAcceso(p: Proveedor, api: boolean, llave?: string | null, direccion?: string) {
  const nueva = llave === undefined ? datos[p]?.llave : llave?.trim() || undefined
  if (api && !nueva) throw new Error('Pega primero tu llave de API.')
  const local = p === 'freellmapi' || p === 'ollama'
  let dir = p !== 'claude' && !local ? undefined : llave === undefined ? datos[p]?.direccion : normalizarDireccion(direccion, local)
  if (llave && nueva) {
    if (p === 'ollama') dir = await buscarOllama(dir)
    else if (local && !dir) dir = await buscarFreeLLMAPI(nueva)
    else await probar(p, nueva, dir)
  }
  datos = { ...datos, [p]: { ...(nueva ? { llave: nueva, api, ...(dir ? { direccion: dir } : {}) } : {}), prestar: datos[p]?.prestar } }
  escribir()
  aplicar()
}

/**
 * «https://proxy.com/v1/» → «https://proxy.com»: Claude Code le añade `/v1/messages`. Vacía o la de Anthropic, nada.
 * `local` (FreeLLMAPI, que suele estar en esta computadora o en la red de casa): sin `http://` delante, se le pone ese.
 */
export function normalizarDireccion(d?: string, local = false) {
  const t = d?.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  if (!t) return undefined
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:\/\//i.test(t)) throw new Error('La dirección debe empezar con https://')
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `${local ? 'http' : 'https'}://${t}`)
  } catch {
    throw new Error('Esa dirección no es válida. Debe ser como https://api.ejemplo.com')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('La dirección debe empezar con https://')
  const limpia = url.toString().replace(/\/+$/, '')
  return limpia === 'https://api.anthropic.com' ? undefined : limpia
}

/** Pide la lista de modelos, que no gasta nada: así se sabe si la llave vale. */
async function probar(p: Proveedor, llave: string, direccion?: string) {
  if (direccion) return probarDireccion(llave, direccion)
  // La lista de modelos de OpenRouter es pública: su llave se prueba preguntando por ella misma.
  const conBearer = p === 'deepseek' ? 'https://api.deepseek.com/models' : p === 'openrouter' ? 'https://openrouter.ai/api/v1/key' : 'https://api.openai.com/v1/models'
  const res =
    p === 'claude'
      ? await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': llave, 'anthropic-version': '2023-06-01' } })
      : p === 'gemini'
        ? await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': llave } })
        : await fetch(conBearer, { headers: { authorization: `Bearer ${llave}` } })
  if (res.ok) return
  const marca = p === 'claude' ? 'Anthropic' : p === 'deepseek' ? 'DeepSeek' : p === 'openrouter' ? 'OpenRouter' : p === 'gemini' ? 'Google' : 'OpenAI'
  // Google contesta 400 a una llave que no vale.
  if (res.status === 401 || res.status === 403 || (p === 'gemini' && res.status === 400)) throw new Error(`${marca} no aceptó esa llave. Revísala y vuelve a pegarla.`)
  throw new Error(`${marca} respondió ${res.status}. Vuelve a intentarlo en un momento.`)
}

/**
 * Con otra dirección, la llave se prueba ahí. Hay servicios que no tienen la lista de modelos (404): basta con que
 * contesten y no rechacen la llave.
 */
async function probarDireccion(llave: string, direccion: string, plazo = 15_000) {
  const { host } = new URL(direccion)
  let res: Response
  try {
    res = await fetch(`${direccion}/v1/models`, { headers: { 'x-api-key': llave, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(plazo) })
  } catch {
    throw new SinRespuesta(`No se pudo conectar con ${host}. Revisa la dirección.`)
  }
  if (res.ok || res.status === 404 || res.status === 405) return
  if (res.status === 401 || res.status === 403) throw new Error(`${host} no aceptó esa llave. Revísala y vuelve a pegarla.`)
  throw new Error(`${host} respondió ${res.status}. Revisa la dirección o vuelve a intentarlo en un momento.`)
}

/** En esa dirección no hay nadie: se prueba la siguiente (`buscarFreeLLMAPI`). */
class SinRespuesta extends Error {}

/** Dónde escucha FreeLLMAPI en la computadora de cada quien: su app de escritorio y su instalación con Docker. */
const FREELLMAPI_AQUI = ['http://127.0.0.1:31415', 'http://127.0.0.1:3001']

/**
 * Sin dirección, FreeLLMAPI se busca en esta computadora: la primera de `FREELLMAPI_AQUI` que conteste y acepte la
 * llave. Si contesta y la rechaza, se dice eso y no se sigue buscando.
 */
async function buscarFreeLLMAPI(llave: string) {
  for (const direccion of FREELLMAPI_AQUI) {
    try {
      await probarDireccion(llave, direccion, 3000)
      return direccion
    } catch (error) {
      if (!(error instanceof SinRespuesta)) throw error
    }
  }
  throw new Error('No encontré FreeLLMAPI en esta computadora. Ábrelo y vuelve a intentarlo, o escribe su dirección si está en otra.')
}

/** Dónde escucha Ollama si nadie le puso otra (`OLLAMA_HOST`). */
const OLLAMA_AQUI = 'http://127.0.0.1:11434'
/** Desde la 0.30 su lista de modelos dice cuáles usan herramientas y con qué ventana (`server/ollama.ts`); la API de Anthropic llegó en la 0.14. */
const OLLAMA_MINIMO = [0, 30] as const

/** «0.40.18» da para Sloth; «0.24.0», no. Una que no se sabe leer (compilado a mano) pasa. */
export function ollamaAlDia(version: string) {
  const [mayor, menor] = version.split('.').map(Number)
  if (Number.isNaN(mayor) || Number.isNaN(menor) || (!mayor && !menor)) return true
  return mayor > OLLAMA_MINIMO[0] || (mayor === OLLAMA_MINIMO[0] && menor >= OLLAMA_MINIMO[1])
}

/**
 * Ollama no tiene llave que probar: se comprueba que en esa dirección (sin ella, en esta computadora) contesta él, y con
 * una versión que Sloth sabe leer.
 */
async function buscarOllama(direccion?: string) {
  const dir = direccion ?? OLLAMA_AQUI
  const { host } = new URL(dir)
  let res: Response
  try {
    res = await fetch(`${dir}/api/version`, { signal: AbortSignal.timeout(direccion ? 15_000 : 3000) })
  } catch {
    throw new Error(direccion ? `No se pudo conectar con ${host}. Revisa la dirección.` : 'No encontré Ollama en esta computadora. Ábrelo y vuelve a intentarlo, o escribe su dirección si está en otra.')
  }
  // Otro programa en ese puerto contesta otra cosa, o nada que se pueda leer.
  const { version } = (res.ok ? await res.json().catch(() => ({})) : {}) as { version?: string }
  if (!version) throw new Error(`En ${host} no contesta Ollama. Revisa la dirección.`)
  if (!ollamaAlDia(version)) throw new Error(`Tu Ollama es la versión ${version} y Sloth necesita la ${OLLAMA_MINIMO.join('.')} o una más nueva. Actualízalo y vuelve a intentarlo.`)
  return dir
}
