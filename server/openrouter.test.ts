import assert from 'node:assert/strict'
import test from 'node:test'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent } from '../shared/types.ts'
import { reader } from './claude.ts'
import { conConsejo } from './otra-api.ts'
import { dolaresOpenRouter, modelosDe, paraClaudeCode, recordar, type ModeloOpenRouter } from './openrouter.ts'

const con = (m: Partial<ModeloOpenRouter> & { id: string }): ModeloOpenRouter => ({
  context_length: 1_048_576,
  pricing: { prompt: '0.000001', completion: '0.000005' },
  supported_parameters: ['tools'],
  endpoints: ['/api/v1/chat/completions', '/api/v1/messages'],
  architecture: { output_modalities: ['text'] },
  ...m
})

test('OpenRouter: del catálogo salen solo los que pueden llevar un hilo', () => {
  const ids = modelosDe([
    con({ id: 'google/gemini-4-carbon' }),
    con({ id: 'sin/herramientas', supported_parameters: ['temperature'] }),
    con({ id: 'sin/api-de-anthropic', endpoints: ['/api/v1/chat/completions'] }),
    con({ id: 'ventana/chica', context_length: 131_072 }),
    con({ id: 'solo/imagenes', architecture: { output_modalities: ['image'] } }),
    con({ id: '~google/gemini-latest' }),
    con({ id: 'google/gemini-4-carbon:batch' }),
    con({ id: 'liquid/lfm-3:free', context_length: 262_144, pricing: { prompt: '0', completion: '0' } })
  ]).map((m) => m.id)
  assert.deepEqual(ids, ['openrouter:google/gemini-4-carbon', 'openrouter:liquid/lfm-3:free'])
})

test('OpenRouter: el precio va por millón de tokens; los gratis no llevan, y un enrutador dice que depende', () => {
  const [pago, gratis, enrutador] = modelosDe([
    con({ id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek: DeepSeek V4.1 Flash', pricing: { prompt: '0.000000036', completion: '0.0000005' } }),
    con({ id: 'baidu/ernie:free', name: 'Baidu: ERNIE (free)', pricing: { prompt: '0', completion: '0' } }),
    con({ id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' } })
  ])
  assert.equal(pago.precio, '$0.036 / $0.5')
  assert.equal(pago.label, 'OpenRouter · DeepSeek DeepSeek V4.1 Flash')
  assert.equal(gratis.precio, undefined)
  assert.equal(gratis.label, 'OpenRouter · Baidu ERNIE')
  assert.equal(enrutador.precio, 'según el modelo que elija')
})

test('OpenRouter: los esfuerzos son los que Claude Code sabe pedir, de menos a más', () => {
  const [m] = modelosDe([con({ id: 'x/y', reasoning: { supported_efforts: ['max', 'high', 'low', 'none', 'minimal'], default_effort: 'high' } })])
  assert.deepEqual(m.efforts, ['low', 'high', 'max'])
  assert.equal(m.defaultEffort, 'high')
  // Un esfuerzo por defecto que Claude Code no pide no se elige: va el de en medio, o el primero que haya.
  assert.equal(modelosDe([con({ id: 'x/z', reasoning: { supported_efforts: ['minimal', 'low'], default_effort: 'minimal' } })])[0].defaultEffort, 'low')
  assert.equal(modelosDe([con({ id: 'x/w', reasoning: { supported_efforts: ['high', 'medium'] } })])[0].defaultEffort, 'medium')
  assert.equal(modelosDe([con({ id: 'x/v' })])[0].defaultEffort, undefined)
})

test('OpenRouter: `[1m]` solo con una ventana de un millón, y solo si el catálogo ya se leyó', () => {
  recordar([])
  assert.equal(paraClaudeCode('openrouter:google/gemini-4-carbon'), 'google/gemini-4-carbon')
  recordar([con({ id: 'google/gemini-4-carbon' }), con({ id: 'liquid/lfm-3:free', context_length: 262_144 })])
  assert.equal(paraClaudeCode('openrouter:google/gemini-4-carbon'), 'google/gemini-4-carbon[1m]')
  assert.equal(paraClaudeCode('openrouter:liquid/lfm-3:free'), 'liquid/lfm-3:free')
})

test('OpenRouter: los dólares salen de los precios del catálogo; sin precio de caché, al de entrada', () => {
  recordar([
    con({ id: 'a/con-cache', pricing: { prompt: '0.000008', completion: '0.00004', input_cache_read: '0.0000002', input_cache_write: '0.00001' } }),
    con({ id: 'b/sin-cache', pricing: { prompt: '0.000001', completion: '0.000002' } }),
    con({ id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' } })
  ])
  const millon = { inputTokens: 1_000_000, cacheCreationInputTokens: 1_000_000, cacheReadInputTokens: 1_000_000, outputTokens: 1_000_000 }
  const usd = dolaresOpenRouter({ 'a/con-cache[1m]': millon, 'b/sin-cache': millon, 'openrouter/auto': millon, 'no/esta': millon })
  assert.equal(usd.toFixed(2), (8 + 10 + 0.2 + 40 + (1 + 1 + 1 + 2)).toFixed(2))
})

test('OpenRouter: lo que le entró a una llamada se lee al final, que es cuando lo dice; el círculo no se vacía', () => {
  const eventos: AgentEvent[] = []
  const leer = reader({ cwd: '.', model: 'openrouter:x/y', onEvent: (e) => eventos.push(e), onProviderSession: () => {} }, { idle: false, max: 200_000, measure: () => {}, tareas: [], detenido: false })
  const trozo = (event: Record<string, unknown>) => ({ type: 'stream_event', uuid: 'u', session_id: 's', parent_tool_use_id: null, event }) as unknown as SDKMessage
  // Lo que mandó OpenRouter en una prueba real: ceros al empezar, la cuenta al acabar.
  leer(trozo({ type: 'message_start', message: { id: 'm1', usage: { input_tokens: 0, output_tokens: 0 } } }))
  leer(trozo({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { input_tokens: 1200, cache_read_input_tokens: 12_000, output_tokens: 40 } }))
  // Anthropic lo dice al empezar: el final no lo repite.
  leer(trozo({ type: 'message_start', message: { id: 'm2', usage: { input_tokens: 500, cache_read_input_tokens: 14_000, output_tokens: 0 } } }))
  leer(trozo({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 500, cache_read_input_tokens: 14_000, output_tokens: 9 } }))
  assert.deepEqual(eventos.filter((e) => e.t === 'context'), [{ t: 'context', used: 13_200, max: 200_000 }, { t: 'context', used: 14_500, max: 200_000 }])
})

test('Otra API: un 429 o un 402 dicen qué hacer; lo demás sale como llegó', () => {
  assert.match(conConsejo('API Error: Request rejected (429) · Provider returned error'), /Provider returned error\. Ese modelo está saturado.*elige otro modelo/)
  assert.match(conConsejo('API Error: 402 Insufficient credits'), /No alcanza el saldo/)
  // Lo que dijo Claude Code con el FreeLLMAPI de verdad detenido.
  assert.match(conConsejo('API Error: Connection refused — a firewall or proxy may be blocking it (ECONNREFUSED)'), /FreeLLMAPI está cerrado: ábrelo/)
  assert.equal(conConsejo('lo detuviste'), 'lo detuviste')
})
