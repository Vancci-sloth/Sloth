import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import type { AgentOptions } from './agent.ts'
import { Sessions } from './sessions.ts'

/** Comprueba el comando y su cola sin abrir proveedores ni cambiar hilos reales. */
function preparar(t: test.TestContext, model = 'codex:gpt-prueba') {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-compactar-'))
  const eventos: AgentEvent[] = []
  const enviados: string[] = []
  let compactaciones = 0
  let emitir!: AgentOptions['onEvent']
  const sessions = new Sessions(dir, (_, __, events) => eventos.push(...events), () => {}, () => {}, () => {}, (opts) => {
    emitir = opts.onEvent
    return {
      send(text) { enviados.push(text) }, steer(text) { enviados.push(text) },
      compact() { compactaciones++ }, async interrupt() {}, close() {}
    }
  })
  const meta = sessions.create({ cardId: 'sloth', cwd: dir, title: 'Prueba', model })
  t.after(() => { sessions.closeAll(); rmSync(dir, { recursive: true, force: true }) })
  return { sessions, meta, eventos, enviados, emitir: (e: AgentEvent) => emitir(e), compactaciones: () => compactaciones }
}

test('/compact no se envía como texto ni escribe un resumen simulado', (t) => {
  const h = preparar(t)
  h.sessions.steer(h.meta.id, '/compact')
  assert.equal(h.compactaciones(), 1)
  assert.deepEqual(h.enviados, [])
  assert.equal(h.meta.running, true)
  assert.equal(h.eventos.some((e) => e.t === 'text'), false)
  h.emitir({ t: 'context', used: 100, max: 1000 })
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  assert.equal(h.meta.running, false)
})

test('durante un turno espera también a los subagentes y agrupa peticiones repetidas', async (t) => {
  const h = preparar(t)
  h.sessions.send(h.meta.id, 'Trabaja')
  h.emitir({ t: 'background', tasks: ['Ayudante'] })
  h.sessions.steer(h.meta.id, '/compact')
  h.sessions.steer(h.meta.id, '/compact')
  assert.deepEqual(h.enviados, ['Trabaja'])
  assert.equal(h.compactaciones(), 0)
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  await setTimeout(10)
  assert.equal(h.compactaciones(), 0)
  h.emitir({ t: 'background', tasks: [] })
  await setTimeout(10)
  assert.equal(h.compactaciones(), 1)
  assert.throws(() => h.sessions.steer(h.meta.id, 'Otro mensaje'), /compactación/)
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  h.sessions.steer(h.meta.id, 'Seguimos')
  assert.deepEqual(h.enviados, ['Trabaja', 'Seguimos'])
})

test('un hilo de Claude también se compacta, con el mismo comando', (t) => {
  const h = preparar(t, 'claude-opus-5-5')
  h.sessions.steer(h.meta.id, '/compact')
  assert.equal(h.compactaciones(), 1)
  assert.deepEqual(h.enviados, [])
  assert.equal(h.meta.running, true)
  assert.ok(h.eventos.some((e) => e.t === 'info' && e.text.includes('Claude')))
})
