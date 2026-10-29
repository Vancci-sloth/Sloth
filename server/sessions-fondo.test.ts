import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import type { AgentOptions } from './agent.ts'
import { Sessions } from './sessions.ts'

/** El aviso de que terminó lo de segundo plano, con un agente de mentira y el reloj a mano. */
function preparar(t: test.TestContext, model = 'codex:gpt-prueba') {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dir = mkdtempSync(join(tmpdir(), 'sloth-fondo-'))
  const eventos: AgentEvent[] = []
  const mandados: string[] = []
  let emitir!: AgentOptions['onEvent']
  const sessions = new Sessions(dir, (_, __, events) => eventos.push(...events), () => {}, () => {}, () => {}, (opts) => {
    emitir = opts.onEvent
    return { send: (texto: string) => void mandados.push(texto), steer() {}, compact() {}, async interrupt() {}, close() {} }
  })
  const meta = sessions.create({ cardId: 'sloth', cwd: dir, title: 'Prueba', model })
  t.after(() => {
    sessions.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })
  const avisos = () => eventos.filter((e) => e.t === 'info' && e.text.includes('segundo plano')).length
  // Lo que Sloth le mandó al agente por su cuenta, sin el primer mensaje.
  const despertares = () => mandados.filter((m) => m.startsWith('Terminó lo que tenías en segundo plano')).length
  /** Un turno que acaba (`ok`) con algo de fondo que termina después. */
  const turnoConFondo = (ok = true) => {
    h.emitir({ t: 'background', tasks: ['Revisor'] })
    h.emitir({ t: 'turn_end', at: Date.now(), ok })
    h.emitir({ t: 'background', tasks: [] })
    t.mock.timers.tick(4000)
  }
  const h = { sessions, meta, emitir: (e: AgentEvent) => emitir(e), avisos, despertares, turnoConFondo }
  return h
}

test('si lo de segundo plano termina con el turno ya acabado, el hilo dice que ya no queda nada', (t) => {
  const h = preparar(t, 'claude-prueba')
  h.sessions.send(h.meta.id, 'Trabaja')
  h.emitir({ t: 'background', tasks: ['Revisor'] })
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  h.emitir({ t: 'background', tasks: [] })
  t.mock.timers.tick(3000)
  assert.equal(h.avisos(), 0)
  t.mock.timers.tick(1000)
  assert.equal(h.avisos(), 1)
  // Claude Code abre él solo su turno al terminar una tarea: no se le despierta.
  assert.equal(h.despertares(), 0)
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
  assert.equal(h.despertares(), 0)
})

test('a Codex se le despierta para que siga, pero no si detuviste su turno', (t) => {
  const h = preparar(t)
  h.sessions.send(h.meta.id, 'Hazme el video')
  h.turnoConFondo()
  assert.equal(h.despertares(), 1)
  assert.equal(h.sessions.meta(h.meta.id)?.running, true)
  h.emitir({ t: 'turn_end', at: Date.now(), ok: false, error: 'lo detuviste' })
  h.turnoConFondo(false)
  assert.equal(h.despertares(), 1)
})

test('se le despierta como mucho tres veces seguidas; un mensaje tuyo vuelve a contar', (t) => {
  const h = preparar(t, 'opencode:modelo-prueba')
  h.sessions.send(h.meta.id, 'Hazme el video')
  for (let i = 0; i < 5; i++) h.turnoConFondo()
  assert.equal(h.despertares(), 3)
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  h.sessions.send(h.meta.id, 'Sigue')
  h.turnoConFondo()
  assert.equal(h.despertares(), 4)
})
