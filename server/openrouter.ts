import type { CuentaClaude, Model } from '../shared/types.ts'
import { entornoClaudeCon, llaveDe, llaveGuardada } from './acceso.ts'

/**
 * OpenRouter con el mismo Claude Code de Sloth, como DeepSeek (`server/deepseek.ts`): OpenRouter habla la API de
 * Anthropic (`https://openrouter.ai/api`, la de su guía de Claude Code) y lleva cada hilo al modelo que elijas de su
 * catálogo, de la marca que sea. Se paga con la llave de cada quien (openrouter.ai/settings/keys), de sus créditos; los
 * modelos gratis (`:free`) no gastan, con los límites que les pone OpenRouter.
 *
 * Del catálogo salen solo los que pueden llevar un hilo (`sirve`). Los ids llevan prefijo
 * (`openrouter:google/gemini-4-carbon`) para no mezclarse con los de Claude.
 */

const API = 'https://openrouter.ai/api'
const SALDO_OPENROUTER = 'https://openrouter.ai/settings/credits'
export const SIN_LLAVE_OPENROUTER = 'Pega tu llave de API de OpenRouter en Opciones.'

/** `openrouter:google/gemini-4-carbon` → `google/gemini-4-carbon`. */
export const modeloOpenRouter = (model: string) => model.replace(/^openrouter:/, '')

/** Lo que se usa de cada modelo de `GET /api/v1/models`. Los precios son dólares por token, en texto; `-1`, según adónde lo mande un enrutador. */
export interface ModeloOpenRouter {
  id: string
  name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string; input_cache_read?: string; input_cache_write?: string }
  supported_parameters?: string[]
  endpoints?: string[]
  architecture?: { output_modalities?: string[] }
  reasoning?: { supported_efforts?: string[]; default_effort?: string }
}

/** La ventana que Claude Code supone si el modelo no dice otra: con menos, el hilo se desbordaría antes de compactar. */
const VENTANA_MINIMA = 200_000
/** Los esfuerzos que Claude Code sabe pedir, de menos a más. */
const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * Los que pueden llevar un hilo de Sloth: usan herramientas, se sirven por la API de Anthropic, escriben texto y les cabe
 * la ventana que supone Claude Code. Fuera los `~marca/…-latest`, que repiten a otro, y los `:batch`, que contestan con
 * horas de espera.
 */
export const sirve = (m: ModeloOpenRouter) =>
  !!m.supported_parameters?.includes('tools') &&
  (!m.endpoints || m.endpoints.includes('/api/v1/messages')) &&
  (!m.architecture?.output_modalities || m.architecture.output_modalities.includes('text')) &&
  (m.context_length ?? 0) >= VENTANA_MINIMA &&
  !m.id.startsWith('~') &&
  !m.id.endsWith(':batch')

const porMillon = (precio?: string) => Number(precio ?? 0) * 1e6
/** «0.036», «8», sin ceros de sobra. */
const cifra = (n: number) => String(+n.toFixed(3))

/** Lo que cuesta, en dólares por millón de tokens de entrada y de salida; sin nada, es gratis. */
export function precioOpenRouter(m: ModeloOpenRouter) {
  const entrada = porMillon(m.pricing?.prompt)
  const salida = porMillon(m.pricing?.completion)
  if (entrada < 0 || salida < 0) return 'según el modelo que elija'
  return entrada || salida ? `$${cifra(entrada)} / $${cifra(salida)}` : undefined
}

/** El catálogo de OpenRouter como modelos de Sloth, en su orden (lo más nuevo primero). */
export function modelosDe(catalogo: ModeloOpenRouter[]): Model[] {
  return catalogo.filter(sirve).map((m) => {
    const efforts = ESFUERZOS.filter((e) => m.reasoning?.supported_efforts?.includes(e))
    return {
      id: `openrouter:${m.id}`,
      // «Google: Gemini 4 Carbon» → «OpenRouter · Google Gemini 4 Carbon»; el «(free)» sobra, va en el grupo de los gratis.
      label: `OpenRouter · ${(m.name ?? m.id).replace(': ', ' ').replace(/ \(free\)$/, '').trim()}`,
      efforts,
      // El suyo, si Claude Code lo sabe pedir; si no, el de en medio o el primero: sin uno, el desplegable saldría vacío.
      defaultEffort: efforts.find((e) => e === m.reasoning?.default_effort) ?? efforts.find((e) => e === 'medium') ?? efforts[0],
      precio: precioOpenRouter(m)
    }
  })
}

/** Lo último leído del catálogo, por id: la ventana y los precios de cada modelo. */
let leido = new Map<string, ModeloOpenRouter>()
/** Para las pruebas. */
export const recordar = (catalogo: ModeloOpenRouter[]) => void (leido = new Map(catalogo.map((m) => [m.id, m])))

/** Los modelos que pueden llevar un hilo, como los da OpenRouter (`GET /api/v1/models`). Vacío sin llave. */
export async function modelosOpenRouter(): Promise<Model[]> {
  if (!llaveGuardada('openrouter')) return []
  try {
    // La lista es pública: sin la llave, que no hace falta.
    const res = await fetch(`${API}/v1/models`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const { data } = (await res.json()) as { data: ModeloOpenRouter[] }
    recordar(data)
    return modelosDe(data)
  } catch {
    return []
  }
}

/**
 * Lo que necesita Claude Code para hablar con OpenRouter: su dirección, la llave como token y `ANTHROPIC_API_KEY` vacía
 * (no quitada), como pide su guía. Todos los alias (`opus`, `sonnet`, `haiku`) van al modelo del hilo: así no se cobra un
 * modelo que no elegiste. Con una ventana de un millón o más, `[1m]` se lo dice a Claude Code (OpenRouter lo quita antes
 * de enrutar), y se compacta a tres cuartos, como con DeepSeek; con menos, a tres cuartos de los 200 000 que supone.
 */
export function entornoOpenRouter(model: string, effort?: string): Record<string, string> {
  const llave = llaveGuardada('openrouter')
  if (!llave) throw new Error(SIN_LLAVE_OPENROUTER)
  return { ...entornoClaudeCon({ direccion: API, llave, modelo: paraClaudeCode(model), ventana: deUnMillon(model) ? 786_432 : VENTANA_MINIMA * 0.75, effort }), ANTHROPIC_API_KEY: '' }
}

/** Si el catálogo aún no se leyó, no se sabe: va como de 200 000, que a todos les cabe. */
const deUnMillon = (model: string) => (leido.get(modeloOpenRouter(model))?.context_length ?? 0) >= 1e6

/** El id que recibe Claude Code: con `[1m]` si su ventana es de un millón o más. */
export const paraClaudeCode = (model: string) => `${modeloOpenRouter(model)}${deUnMillon(model) ? '[1m]' : ''}`

/**
 * Lo que cuesta lo que Claude Code cuenta por modelo (`modelUsage`), con los precios del catálogo: sus dólares serían
 * los de un modelo de Claude. Sin precio de caché, la lectura y la escritura van al de entrada. Un modelo sin precio
 * conocido (un enrutador, o el catálogo aún sin leer) no suma.
 */
export function dolaresOpenRouter(modelos: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }>): number {
  let total = 0
  for (const [modelo, u] of Object.entries(modelos)) {
    const p = leido.get(modelo.replace(/\[1m\]$/, ''))?.pricing
    const entrada = Number(p?.prompt ?? 0)
    if (!p || entrada < 0) continue
    total +=
      (u.inputTokens ?? 0) * entrada +
      (u.cacheReadInputTokens ?? 0) * Number(p.input_cache_read ?? entrada) +
      (u.cacheCreationInputTokens ?? 0) * Number(p.input_cache_write ?? entrada) +
      (u.outputTokens ?? 0) * Number(p.completion ?? 0)
  }
  return total
}

/** La cuenta es la llave: conectada si hay una, con los créditos que le quedan. */
export async function cuentaOpenRouter(): Promise<CuentaClaude> {
  const llave = llaveGuardada('openrouter')
  if (!llave) return { conectada: false }
  const saldo = await saldoOpenRouter(llave).catch(() => undefined)
  return { conectada: true, quien: `Llave de API …${llave.slice(-4)}${saldo ? ` · saldo ${saldo}` : ''}`, llave: llaveDe('openrouter'), uso: SALDO_OPENROUTER }
}

/** «12.40 USD»: lo comprado menos lo gastado, nunca menos de cero (lo gastado cuenta también lo que regaló OpenRouter). */
async function saldoOpenRouter(llave: string): Promise<string | undefined> {
  const res = await fetch(`${API}/v1/credits`, { headers: { authorization: `Bearer ${llave}` }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return
  const { data } = (await res.json()) as { data?: { total_credits?: number; total_usage?: number } }
  return data?.total_credits === undefined ? undefined : `${Math.max(0, (data.total_credits ?? 0) - (data.total_usage ?? 0)).toFixed(2)} USD`
}
