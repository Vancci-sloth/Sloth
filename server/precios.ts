import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { guardar } from './disco.ts'

/**
 * Lo que costaría en la API de OpenAI lo que gasta Codex. Con la cuenta de ChatGPT, Codex da tokens pero no dólares (su
 * `account/usage/read` viene vacío). Claude no necesita esto: su SDK da el costo con su propia tabla, que se renueva con
 * cada versión.
 *
 * Los precios salen de la lista abierta de LiteLLM, que copia la página de precios de OpenAI, y se guardan en
 * data/precios-codex.json con la versión de Codex con que se bajaron. Se vuelven a bajar al cambiar esa versión o al usar un
 * modelo que no está, como mucho una vez por hora: el catálogo de modelos lo manda OpenAI, no el paquete.
 */
const FUENTE = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const HORA = 3600_000

/** Dólares por token. */
export interface Tarifa {
  entrada: number
  cache: number
  salida: number
}
/** `largo`: la tarifa de una petición que lee más de `desde` tokens. */
export type Precio = Tarifa & { largo?: Tarifa & { desde: number } }
/** Lo que gastó una petición o un turno. `input` es la entrada sin caché. */
export interface Uso {
  input: number
  cacheRead: number
  output: number
}

interface Guardado {
  codex: string
  fecha: number
  modelos: Record<string, Precio>
}

let app = ''
let tabla: Guardado | null = null
let bajando: Promise<void> | null = null
let intento = 0

/** Los modelos de OpenAI de la lista de LiteLLM, con su tarifa de contexto largo si la tienen. */
export function deLitellm(lista: Record<string, Record<string, unknown>>): Record<string, Precio> {
  const modelos: Record<string, Precio> = {}
  for (const [id, m] of Object.entries(lista)) {
    if (m?.litellm_provider !== 'openai' || typeof m.input_cost_per_token !== 'number' || typeof m.output_cost_per_token !== 'number') continue
    const tarifa = (fin: string): Tarifa => ({
      entrada: m[`input_cost_per_token${fin}`] as number,
      cache: (m[`cache_read_input_token_cost${fin}`] ?? m[`input_cost_per_token${fin}`]) as number,
      salida: (m[`output_cost_per_token${fin}`] ?? m.output_cost_per_token) as number
    })
    const precio: Precio = tarifa('')
    const k = Object.keys(m).map((c) => /^input_cost_per_token_above_(\d+)k_tokens$/.exec(c)?.[1]).find(Boolean)
    if (k) precio.largo = { desde: Number(k) * 1000, ...tarifa(`_above_${k}k_tokens`) }
    modelos[id] = precio
  }
  return modelos
}

/** Dólares de una petición. `leidos`, lo que leyó esa petición entera, decide si va con la tarifa de contexto largo. */
export function costo(precio: Precio, uso: Uso, leidos = uso.input + uso.cacheRead): number {
  const t = precio.largo && leidos > precio.largo.desde ? precio.largo : precio
  return uso.input * t.entrada + uso.cacheRead * t.cache + uso.output * t.salida
}

const archivo = () => join(app, 'data', 'precios-codex.json')
const versionCodex = () => {
  try {
    return JSON.parse(readFileSync(join(app, 'node_modules', '@openai', 'codex', 'package.json'), 'utf8')).version as string
  } catch {
    return ''
  }
}

function bajar(): Promise<void> {
  bajando ??= (async () => {
    intento = Date.now()
    try {
      const res = await fetch(FUENTE, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`LiteLLM respondió ${res.status}`)
      const modelos = deLitellm(await res.json())
      if (!Object.keys(modelos).length) throw new Error('la lista de LiteLLM vino sin modelos de OpenAI')
      tabla = { codex: versionCodex(), fecha: Date.now(), modelos }
      guardar(archivo(), JSON.stringify(tabla))
    } catch (error) {
      // Sin internet se queda la tabla de antes; los turnos sin precio salen con «≥» en la cabecera.
      console.warn('No se pudieron bajar los precios de Codex:', error instanceof Error ? error.message : error)
    } finally {
      bajando = null
    }
  })()
  return bajando
}

/** Lee la tabla guardada y la baja otra vez si es de otra versión de Codex. Al arrancar y después de actualizar Codex. */
export function cargarPreciosCodex(carpeta: string): Promise<void> {
  app = carpeta
  try {
    tabla = JSON.parse(readFileSync(archivo(), 'utf8'))
  } catch {
    tabla = null
  }
  return tabla?.codex === versionCodex() ? Promise.resolve() : bajar()
}

/** Dólares de una petición de Codex con `modelo`, o `undefined` si no hay tabla o no trae ese modelo (y la pide de nuevo). */
export function costoCodex(modelo: string, uso: Uso, leidos?: number): number | undefined {
  const precio = tabla?.modelos[modelo]
  if (precio) return costo(precio, uso, leidos)
  if (app && Date.now() - intento > HORA) void bajar()
}
