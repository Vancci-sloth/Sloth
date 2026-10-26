import assert from 'node:assert/strict'
import test from 'node:test'
import { modeloYoutube } from './youtube-modelo.ts'

const modelos = [{ id: 'claude-opus-5-5', label: 'Claude Opus', efforts: ['low', 'high'], defaultEffort: 'high' }, { id: 'codex:gpt-6.1-sol', label: 'Codex', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' }]
test('cada elección explícita respeta el agente, modelo y esfuerzo del usuario', () => {
  assert.deepEqual(modeloYoutube({ model: 'codex:gpt-6.1-sol', effort: 'low' }, modelos), { model: 'codex:gpt-6.1-sol', effort: 'low' })
  assert.deepEqual(modeloYoutube({ model: 'claude-opus-5-5' }, modelos), { model: 'claude-opus-5-5', effort: 'high' })
  assert.throws(() => modeloYoutube({}, modelos), /Elige el agente/)
  assert.throws(() => modeloYoutube({ model: 'inventado' }, modelos), /catálogo/)
  assert.throws(() => modeloYoutube({ model: 'claude-opus-5-5', effort: 'xhigh' }, modelos), /esfuerzo/)
})
