import assert from 'node:assert/strict'
import test from 'node:test'
import { dolaresDeepSeek, tarifaDeepSeek } from './deepseek.ts'

test('DeepSeek: los dólares salen de sus precios de valle, con la escritura en caché como entrada sin caché', () => {
  const usd = dolaresDeepSeek({
    'deepseek-v4-pro[1m]': { inputTokens: 1_000_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 1_000_000, outputTokens: 1_000_000 },
    'deepseek-flash': { inputTokens: 500_000, cacheCreationInputTokens: 500_000, cacheReadInputTokens: 0, outputTokens: 0 },
    'otro-modelo': { inputTokens: 1_000_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 0 }
  })
  assert.equal(usd.toFixed(3), (0.66 + 0.022 + 1.98 + 0.15).toFixed(3))
})

test('DeepSeek: entre semana de 01 a 04 y de 06 a 10 UTC es hora pico, al doble; el fin de semana, valle', () => {
  assert.equal(tarifaDeepSeek(new Date('2026-10-29T02:30:00Z')), 2)
  assert.equal(tarifaDeepSeek(new Date('2026-10-29T05:00:00Z')), 1)
  assert.equal(tarifaDeepSeek(new Date('2026-10-29T09:59:00Z')), 2)
  assert.equal(tarifaDeepSeek(new Date('2026-10-31T02:30:00Z')), 1)
})
