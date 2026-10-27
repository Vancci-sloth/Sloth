import assert from 'node:assert/strict'
import test from 'node:test'
import { costo, deLitellm } from './precios.ts'

test('de la lista de LiteLLM toma solo los modelos de OpenAI, con su tarifa de contexto largo', () => {
  const modelos = deLitellm({
    'gpt-6.1-terra': {
      litellm_provider: 'openai', input_cost_per_token: 1e-6, cache_read_input_token_cost: 5e-8, output_cost_per_token: 5e-6,
      input_cost_per_token_above_272k_tokens: 2e-6, cache_read_input_token_cost_above_272k_tokens: 1e-7, output_cost_per_token_above_272k_tokens: 7.5e-6,
      input_cost_per_token_above_272k_tokens_priority: 4e-6
    },
    'gpt-viejo': { litellm_provider: 'openai', input_cost_per_token: 5e-7, output_cost_per_token: 1.5e-6 },
    'claude-opus-5-5': { litellm_provider: 'anthropic', input_cost_per_token: 4e-6, output_cost_per_token: 2e-5 },
    sample_spec: { litellm_provider: 'openai' }
  })
  assert.deepEqual(Object.keys(modelos), ['gpt-6.1-terra', 'gpt-viejo'])
  assert.deepEqual(modelos['gpt-6.1-terra'], { entrada: 1e-6, cache: 5e-8, salida: 5e-6, largo: { desde: 272000, entrada: 2e-6, cache: 1e-7, salida: 7.5e-6 } })
  // Sin precio de caché, la caché cuesta lo que la entrada.
  assert.deepEqual(modelos['gpt-viejo'], { entrada: 5e-7, cache: 5e-7, salida: 1.5e-6 })
})

test('una petición que lee más de 272k va entera con la tarifa de contexto largo', () => {
  const precio = { entrada: 1e-6, cache: 5e-8, salida: 5e-6, largo: { desde: 272000, entrada: 2e-6, cache: 1e-7, salida: 7.5e-6 } }
  const uso = { input: 1000, cacheRead: 100_000, output: 500 }
  assert.equal(costo(precio, uso).toFixed(6), (1000 * 1e-6 + 100_000 * 5e-8 + 500 * 5e-6).toFixed(6))
  assert.equal(costo(precio, uso, 300_000).toFixed(6), (1000 * 2e-6 + 100_000 * 1e-7 + 500 * 7.5e-6).toFixed(6))
})
