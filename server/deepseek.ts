import type { CuentaClaude, Model } from '../shared/types.ts'
import { llaveDe, llaveGuardada } from './acceso.ts'

/**
 * DeepSeek con el mismo Claude Code de Sloth: DeepSeek tiene una API compatible con la de Anthropic
 * (`https://api.deepseek.com/anthropic`), y Claude Code trabaja con ella si se le cambia la dirección y la llave. Así un
 * hilo de DeepSeek tiene todo lo de uno de Claude (las skills con `/`, los subagentes, el navegador, la voz) sin otro
 * programa que bajar. Es lo que DeepSeek recomienda en su guía de Claude Code.
 *
 * Se paga con la llave de API de cada quien (platform.deepseek.com), del saldo de su cuenta. Los ids llevan prefijo
 * (`deepseek:deepseek-flash`) para no mezclarse con los de Claude.
 */

const API = 'https://api.deepseek.com'
const SALDO_DEEPSEEK = 'https://platform.deepseek.com/usage'

/** `deepseek:deepseek-flash` → `deepseek-flash`. */
export const modeloDeepSeek = (model: string) => model.replace(/^deepseek:/, '')

/**
 * Lo que necesita Claude Code para hablar con DeepSeek. Los alias que piden las skills y sus subagentes (`opus`, `sonnet`)
 * van al modelo del hilo, y `haiku` (los títulos, lo rápido) a Flash. `[1m]` le dice a Claude Code que la ventana es de un
 * millón, como la de los dos modelos de DeepSeek: si no, compactaría a los 200 000. Sin la llave de Anthropic ni el token
 * de la cuenta de Claude, que irían a DeepSeek.
 */
export function entornoDeepSeek(model: string, effort?: string): Record<string, string> {
  const llave = llaveGuardada('deepseek')
  if (!llave) throw new Error(SIN_LLAVE)
  const { ANTHROPIC_API_KEY: _, CLAUDE_CODE_OAUTH_TOKEN: __, ...env } = process.env as Record<string, string>
  const elegido = `${modeloDeepSeek(model)}[1m]`
  return {
    ...env,
    ANTHROPIC_BASE_URL: `${API}/anthropic`,
    ANTHROPIC_AUTH_TOKEN: llave,
    ANTHROPIC_MODEL: elegido,
    ANTHROPIC_DEFAULT_OPUS_MODEL: elegido,
    ANTHROPIC_DEFAULT_SONNET_MODEL: elegido,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-flash',
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: '786432',
    ...(effort ? { CLAUDE_CODE_EFFORT_LEVEL: effort } : {})
  }
}

export const SIN_LLAVE = 'Pega tu llave de API de DeepSeek en Opciones.'

/**
 * Dólares por millón de tokens en hora valle, de api-docs.deepseek.com/quick_start/pricing (29-oct-2026): entrada en caché,
 * entrada sin caché y salida. En hora pico (lun-vie, de 01:00 a 04:00 y de 06:00 a 10:00 UTC) cuesta el doble. Los
 * feriados chinos, que también son valle, no se cuentan: ahí la cifra sale de más.
 */
const PRECIOS: Record<string, [number, number, number]> = {
  'deepseek-flash': [0.003, 0.15, 0.6],
  'deepseek-v4-pro': [0.022, 0.66, 1.98]
}

/** Cuántas veces el precio de valle cuesta un turno que acaba en `cuando`. */
export function tarifaDeepSeek(cuando = new Date()) {
  const h = cuando.getUTCHours()
  return cuando.getUTCDay() % 6 !== 0 && ((h >= 1 && h < 4) || (h >= 6 && h < 10)) ? 2 : 1
}

/**
 * Lo que cuesta en hora valle lo que Claude Code cuenta por modelo (`modelUsage`, con el `[1m]` que le pone Sloth). La
 * escritura en caché DeepSeek la cobra como entrada sin caché. Un modelo sin precio conocido no suma.
 */
export function dolaresDeepSeek(modelos: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }>): number {
  let total = 0
  for (const [modelo, u] of Object.entries(modelos)) {
    // Los nombres viejos (`deepseek-v4-flash`) los cobra al precio de Flash.
    const precio = PRECIOS[modelo.replace(/\[1m\]$/, '').replace(/^deepseek-v4-flash.*/, 'deepseek-flash')]
    if (precio) total += ((u.cacheReadInputTokens ?? 0) * precio[0] + ((u.inputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0)) * precio[1] + (u.outputTokens ?? 0) * precio[2]) / 1e6
  }
  return total
}

interface ModeloDeepSeek {
  id: string
  name?: string
  effort?: { supported_levels?: string[]; default_level?: string }
}

/** Los modelos de la cuenta, como los da DeepSeek (`GET /models`), con sus esfuerzos. Vacío sin llave. */
export async function deepseekModels(): Promise<Model[]> {
  const llave = llaveGuardada('deepseek')
  if (!llave) return []
  try {
    const res = await fetch(`${API}/models`, { headers: { authorization: `Bearer ${llave}` } })
    if (!res.ok) return []
    const { data } = (await res.json()) as { data: ModeloDeepSeek[] }
    return data.map((m) => ({
      id: `deepseek:${m.id}`,
      label: `DeepSeek · ${m.name ?? m.id}`,
      efforts: m.effort?.supported_levels ?? [],
      defaultEffort: m.effort?.default_level
    }))
  } catch {
    return []
  }
}

/** La cuenta es la llave: conectada si hay una, con el saldo que le queda. */
export async function cuentaDeepSeek(): Promise<CuentaClaude> {
  const llave = llaveGuardada('deepseek')
  if (!llave) return { conectada: false }
  const saldo = await saldoDeepSeek(llave).catch(() => undefined)
  return { conectada: true, quien: `Llave de API …${llave.slice(-4)}${saldo ? ` · saldo ${saldo}` : ''}`, llave: llaveDe('deepseek'), uso: SALDO_DEEPSEEK }
}

/** «12.40 USD», o el de la primera moneda si hay varias. Sin saldo, DeepSeek responde 402 a cada mensaje. */
async function saldoDeepSeek(llave: string): Promise<string | undefined> {
  const res = await fetch(`${API}/user/balance`, { headers: { authorization: `Bearer ${llave}` } })
  if (!res.ok) return
  const { balance_infos } = (await res.json()) as { balance_infos?: { currency: string; total_balance: string }[] }
  const b = balance_infos?.find((x) => x.currency === 'USD') ?? balance_infos?.[0]
  return b && `${b.total_balance} ${b.currency}`
}
