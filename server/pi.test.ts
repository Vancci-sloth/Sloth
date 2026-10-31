import assert from 'node:assert/strict'
import test from 'node:test'
import { precioPi } from './pi.ts'

test('Pi: un modelo solo es gratis si consta; el 0 de un plan de pago no cuenta', () => {
  const m = (provider: string, id: string, input = 0, output = 0) => precioPi({ provider, id, cost: { input, output } })
  assert.equal(m('google', 'gemma-4-26b-a4b-it'), undefined)
  assert.equal(m('opencode', 'big-pickle'), undefined)
  assert.equal(m('openrouter', 'poolside/laguna-s-2.1:free'), undefined)
  assert.equal(m('google', 'gemini-3.1-flash-lite', 0.25, 1.5), '$0.25 / $1.5')
  assert.equal(m('qwen-token-plan', 'qwen3.8-max'), 'precio desconocido')
  assert.equal(m('nvidia', 'z-ai/glm-5.3'), 'precio desconocido')
  assert.equal(m('openrouter', 'openrouter/auto'), 'precio desconocido')
})
