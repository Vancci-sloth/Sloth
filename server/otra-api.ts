import { proveedorDe, type Proveedor } from '../shared/providers.ts'
import { dolaresDeepSeek, entornoDeepSeek, modeloDeepSeek, SIN_LLAVE, tarifaDeepSeek } from './deepseek.ts'
import { entornoFreeLLMAPI, modeloFreeLLMAPI, SIN_LLAVE_FREELLMAPI } from './freellmapi.ts'
import { antesDeOllama, entornoOllama, modeloOllama, SIN_OLLAMA } from './ollama.ts'
import { dolaresOpenRouter, entornoOpenRouter, paraClaudeCode, SIN_LLAVE_OPENROUTER } from './openrouter.ts'

/**
 * Los agentes que no traen programa: son el Claude Code de Sloth contra otra API compatible con la de Anthropic, con la
 * llave de cada quien. Un hilo suyo tiene todo lo de uno de Claude (las skills con `/`, los subagentes, el navegador, la
 * voz) sin nada más que bajar. Lo usan `server/claude.ts` (los hilos) y `server/redactar.ts` (las respuestas sueltas).
 * Otro así es una entrada más aquí, en `EN_CLAUDE` (`shared/providers.ts`) y en `OTROS` (`server/proveedores.ts`).
 */
type Uso = Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }>

export interface OtraApi {
  /** Lo que se dice si falta su llave. */
  sinLlave: string
  /** El modelo como lo recibe Claude Code: `deepseek:deepseek-flash` → `deepseek-flash[1m]`. */
  modelo(model: string): string
  /** El entorno de Claude Code para ese modelo. Lanza `sinLlave` si falta. */
  entorno(model: string, effort?: string): Record<string, string>
  /** Lo que cuestan los tokens que Claude Code cuenta por modelo: sus dólares serían los de un modelo de Claude. */
  dolares(modelos: Uso): number
  /** Por cuánto se multiplica al acabar el turno (la hora pico de DeepSeek). */
  tarifa?(): number
  /** El modelo de una respuesta suelta, si no es el del hilo: el rápido de la marca. */
  rapido?: string
  /** Lo que se comprueba antes de cada mensaje, cuando la API no avisaría: lanza qué hay que hacer, y el mensaje no se manda. */
  antes?(model: string): Promise<void>
}

const APIS: Partial<Record<Proveedor, OtraApi>> = {
  deepseek: { sinLlave: SIN_LLAVE, modelo: (m) => `${modeloDeepSeek(m)}[1m]`, entorno: entornoDeepSeek, dolares: dolaresDeepSeek, tarifa: tarifaDeepSeek, rapido: 'deepseek:deepseek-flash' },
  openrouter: { sinLlave: SIN_LLAVE_OPENROUTER, modelo: paraClaudeCode, entorno: entornoOpenRouter, dolares: dolaresOpenRouter },
  // Gratis: lo que gasta es la cuota de cada proveedor, que lleva FreeLLMAPI.
  freellmapi: { sinLlave: SIN_LLAVE_FREELLMAPI, modelo: modeloFreeLLMAPI, entorno: entornoFreeLLMAPI, dolares: () => 0 },
  // Sin costo aquí: corre en la computadora de cada quien o, los `:cloud`, en su cuenta de Ollama.
  ollama: { sinLlave: SIN_OLLAMA, modelo: modeloOllama, entorno: entornoOllama, dolares: () => 0, antes: antesDeOllama }
}

/**
 * El error de un turno, con qué hacer cuando la API rechaza por límite (429) o por falta de saldo (402), o cuando no hay
 * nadie en su dirección: con los modelos gratis pasa seguido, y Claude Code solo dice el número o el código, en inglés,
 * tras reintentar unos minutos. `model`: el del hilo, para decir qué programa está cerrado.
 */
export function conConsejo(error: string, model = ''): string {
  // FreeLLMAPI y Ollama viven en la computadora de cada quien: si nadie contesta en su dirección, está cerrado.
  if (/ECONNREFUSED/.test(error)) return `${error}. ${proveedorDe(model) === 'ollama' ? 'Ollama' : 'FreeLLMAPI'} está cerrado: ábrelo y manda el mensaje otra vez.`
  if (/\b429\b/.test(error)) return `${error}. Ese modelo está saturado o llegaste a su límite: elige otro modelo o espera un rato.`
  if (/\b402\b/.test(error)) return `${error}. No alcanza el saldo para ese modelo: recarga o elige uno gratis.`
  return error
}

/** La API de un modelo, si no es Claude. */
export const otraApi = (model: string) => APIS[proveedorDe(model)]
