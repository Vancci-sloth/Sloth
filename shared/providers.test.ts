import assert from 'node:assert/strict'
import test from 'node:test'
import { programaDe, proveedorDe } from './providers.ts'

test('proveedorDe: el prefijo dice el agente; sin prefijo, o con uno que no es de un agente, es Claude', () => {
  assert.equal(proveedorDe('claude-opus-5-5'), 'claude')
  assert.equal(proveedorDe('codex:gpt-6.1-terra'), 'codex')
  assert.equal(proveedorDe('deepseek:deepseek-flash'), 'deepseek')
  // Los modelos de Pi llevan su proveedor y pueden llevar `/` y `:` dentro.
  assert.equal(proveedorDe('pi:openrouter/deepseek/deepseek-v4-flash:free'), 'pi')
  assert.equal(proveedorDe('otro:modelo'), 'claude')
})

test('DeepSeek corre en Claude Code', () => {
  assert.equal(programaDe('deepseek'), 'claude')
  assert.equal(programaDe('grok'), 'grok')
})
