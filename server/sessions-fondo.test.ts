import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import type { AgentOptions } from './agent.ts'
import { Sessions } from './sessions.ts'

/** El aviso de que terminó lo de segundo plano, con un agente de mentira y el reloj a mano. */
function preparar(t: test.TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dir = mkdtempSync(join(tmpdir(), 'sloth-fondo-'))
  const eventos: AgentEvent[] = []
  let emitir!: AgentOptions['onEvent']
  const sessions = new Sessions(dir, (_, __, events) => eventos.push(...events), () => {}, () => {}, () => {}, (opts) => {
    emitir = opts.onEvent
    return { send() {}, steer() {}, compact() {}, async interrupt() {}, close() {} }
  })
  const meta = sessions.create({ cardId: 'sloth', cwd: dir, title: 'Prueba', model: 'codex:gpt-prueba' })
  t.after(() => {
    sessions.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })
  const avisos = () => eventos.filter((e) => e.t === 'info' && e.text.includes('segundo plano')).length
  return { sessions, meta, emitir: (e: AgentEvent) => emitir(e), avisos }
}

test('si lo de segundo plano termina con el turno ya acabado, el hilo dice que ya no queda nada', (t) => {
  const h = preparar(t)
  h.sessions.send(h.meta.id, 'Trabaja')
  h.emitir({ t: 'background', tasks: ['Revisor'] })
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  h.emitir({ t: 'background', tasks: [] })
  t.mock.timers.tick(3000)
  assert.equal(h.avisos(), 0)
  t.mock.timers.tick(1000)
  assert.equal(h.avisos(), 1)
})

test('no lo dice si el agente abre un turno para leer lo que terminó, ni si nada quedó de fondo', (t) => {
  const h = preparar(t)
  h.sessions.send(h.meta.id, 'Trabaja')
  h.emitir({ t: 'background', tasks: ['Revisor'] })
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  h.emitir({ t: 'background', tasks: [] })
  h.emitir({ t: 'turn_start', at: Date.now() })
  t.mock.timers.tick(5000)
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  t.mock.timers.tick(5000)
  assert.equal(h.avisos(), 0)
})
