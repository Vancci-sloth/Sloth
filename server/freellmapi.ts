import type { CuentaClaude, Model } from '../shared/types.ts'
import { direccionGuardada, entornoClaudeCon, llaveDe, llaveGuardada } from './acceso.ts'

/**
 * FreeLLMAPI con el mismo Claude Code de Sloth, como DeepSeek (`server/deepseek.ts`). FreeLLMAPI
 * (github.com/tashfeenahmed/freellmapi) es un programa que cada quien instala en su computadora: junta los rangos gratis
 * de muchos proveedores (Google, Groq, Cerebras, NVIDIA, OpenRouter…) detrás de una sola llave y, entre otras, habla la
 * API de Anthropic. Sloth no lo instala ni guarda las llaves de esos proveedores: solo la dirección donde escucha
 * (`server/acceso.ts` la busca en esta computadora) y su llave única (`freellmapi-…`).
 *
 * No cuesta nada: lo que gasta es la cuota gratis de cada proveedor, que FreeLLMAPI lleva. Los ids llevan prefijo
 * (`freellmapi:auto`); `auto` deja que su enrutador elija el mejor modelo disponible en cada mensaje.
 */

export const SIN_LLAVE_FREELLMAPI = 'Pega la llave de tu FreeLLMAPI en Opciones.'

/** `freellmapi:auto:coding` → `auto:coding`. */
export const modeloFreeLLMAPI = (model: string) => model.replace(/^freellmapi:/, '')

/** Lo que se usa de cada modelo de `GET /v1/models`. Sin `supported_parameters` van `auto`, `fusion` y los huecos `claude-…`. */
export interface ModeloFreeLLMAPI {
  id: string
  name?: string
  context_window?: number | null
  context_length?: number | null
  supported_parameters?: string[]
}

/** La ventana que FreeLLMAPI supone cuando un modelo no publica la suya (su `setup-claude`). */
const VENTANA = 128_000
const AUTO = 'auto'

/** Con menos ventana no cabe ni lo que Claude Code manda antes del primer mensaje (unos 20 000 tokens) más el trabajo. */
const VENTANA_MINIMA = 64_000

/**
 * El catálogo como modelos de Sloth: `auto` primero, y solo los que usan herramientas y tienen ventana para un hilo. Fuera
 * lo que no dice qué admite: `fusion` (varios modelos y un juez, sin herramientas) y los huecos `claude-…`, que son `auto`
 * con otro nombre para quien no puede elegir modelo. Sin esfuerzos: cada modelo piensa a su manera.
 */
export function modelosDe(catalogo: ModeloFreeLLMAPI[]): Model[] {
  const sirven = catalogo.filter((m) => m.id !== AUTO && m.supported_parameters?.includes('tools') && (m.context_window ?? m.context_length ?? VENTANA) >= VENTANA_MINIMA)
  return [
    { id: `freellmapi:${AUTO}`, label: 'FreeLLMAPI · Auto (el mejor disponible)', efforts: [] },
    ...sirven.map((m) => ({ id: `freellmapi:${m.id}`, label: `FreeLLMAPI · ${m.name ?? m.id}`, efforts: [] }))
  ]
}

/** Lo último leído del catálogo, por id: la ventana de cada modelo. */
let leido = new Map<string, ModeloFreeLLMAPI>()

/** Los modelos que pueden contestar ahora (`?available=true`). `null` si no responde: FreeLLMAPI está cerrado. */
async function catalogo(): Promise<ModeloFreeLLMAPI[] | null> {
  const llave = llaveGuardada('freellmapi')
  const direccion = direccionGuardada('freellmapi')
  if (!llave || !direccion) return null
  try {
    const res = await fetch(`${direccion}/v1/models?available=true`, { headers: { authorization: `Bearer ${llave}` }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const { data } = (await res.json()) as { data: ModeloFreeLLMAPI[] }
    leido = new Map(data.map((m) => [m.id, m]))
    return data
  } catch {
    return null
  }
}

/** Vacío sin llave o con FreeLLMAPI cerrado: tras abrirlo, sus modelos vuelven al entrar a Opciones o al abrir Sloth. */
export async function modelosFreeLLMAPI(): Promise<Model[]> {
  const data = await catalogo()
  return data ? modelosDe(data) : []
}

/**
 * Lo que necesita Claude Code para hablar con FreeLLMAPI: su dirección (sin `/v1`) y la llave como token. Todos los alias
 * van al modelo del hilo. Se compacta a la ventana que FreeLLMAPI anuncia de ese modelo, que ya descuenta su margen.
 */
export function entornoFreeLLMAPI(model: string, effort?: string): Record<string, string> {
  const llave = llaveGuardada('freellmapi')
  const direccion = direccionGuardada('freellmapi')
  if (!llave || !direccion) throw new Error(SIN_LLAVE_FREELLMAPI)
  const m = leido.get(modeloFreeLLMAPI(model))
  return entornoClaudeCon({ direccion, llave, modelo: modeloFreeLLMAPI(model), ventana: m?.context_window ?? m?.context_length ?? VENTANA, effort })
}

/** La cuenta es la llave y la dirección. Si ahí no contesta nadie, se dice: los hilos no podrían empezar. */
export async function cuentaFreeLLMAPI(): Promise<CuentaClaude> {
  const llave = llaveGuardada('freellmapi')
  const direccion = direccionGuardada('freellmapi')
  if (!llave || !direccion) return { conectada: false }
  const donde = new URL(direccion).host
  const cuenta = { conectada: true, quien: `Llave …${llave.slice(-4)} · en ${donde}`, llave: llaveDe('freellmapi') }
  return (await catalogo()) ? cuenta : { ...cuenta, error: `FreeLLMAPI no responde en ${donde}. Ábrelo y vuelve a entrar aquí: sin él, sus modelos no salen y sus chats no avanzan.` }
}
