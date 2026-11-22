import assert from 'node:assert/strict'
import test from 'node:test'
import { modelosDe } from './freellmapi.ts'
import { normalizarDireccion } from './acceso.ts'

test('FreeLLMAPI: `auto` va primero y una sola vez, y solo salen los que usan herramientas y tienen ventana para un hilo', () => {
  // Como los da un FreeLLMAPI de verdad (`GET /v1/models?available=true`, noviembre de 2026).
  const modelos = modelosDe([
    { id: 'nemotron-3-ultra-550b', name: 'Nemotron 3 Ultra 550B', context_window: 800000, supported_parameters: ['temperature', 'stream', 'tools', 'tool_choice'] },
    { id: 'auto', name: 'Auto (router picks the best available model)', context_window: 104857 },
    // Sin herramientas, o con ellas pero sin ventana: un hilo no arrancaría.
    { id: 'gemma-4-31b-heretic', context_window: 3276, supported_parameters: ['temperature', 'stream'] },
    { id: 'chico-con-herramientas', context_window: 26214, supported_parameters: ['tools'] },
    // Lo que no dice qué admite: `fusion` y los huecos de Claude Code, que son `auto` con otro nombre.
    { id: 'fusion', context_window: 104857 },
    { id: 'claude-opus-4-5', name: 'Opus slot (auto-routed to a free model)', context_window: 104857 },
    // Sin ventana publicada vale la que supone FreeLLMAPI.
    { id: 'sin-ventana', context_window: null, supported_parameters: ['tools'] }
  ])
  assert.deepEqual(modelos.map((m) => m.id), ['freellmapi:auto', 'freellmapi:nemotron-3-ultra-550b', 'freellmapi:sin-ventana'])
  assert.equal(modelos[1].label, 'FreeLLMAPI · Nemotron 3 Ultra 550B')
  assert.ok(modelos.every((m) => !m.precio && !m.efforts.length))
})

test('FreeLLMAPI: su dirección puede ir sin `http://`, y entonces no es https', () => {
  assert.equal(normalizarDireccion('192.168.1.20:3001/v1/', true), 'http://192.168.1.20:3001')
  assert.equal(normalizarDireccion('https://mi-vps.com', true), 'https://mi-vps.com')
  assert.equal(normalizarDireccion('', true), undefined)
  // La de Claude sigue siendo https si no dice otra cosa.
  assert.equal(normalizarDireccion('proxy.com/v1'), 'https://proxy.com')
})
