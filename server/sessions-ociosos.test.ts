import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { AgentOptions } from './agent.ts'
import { AGENTE_OCIOSO, Sessions } from './sessions.ts'

function preparar(t: test.TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dir = mkdtempSync(join(tmpdir(), 'sloth-ocioso-'))
  const procesos: { opts: AgentOptions; cerrado: boolean }[] = []
  const sesiones = new Sessions(dir, () => {}, () => {}, () => {}, () => {}, (opts) => {
    const p = { opts, cerrado: false }
    procesos.push(p)
    return { send() { opts.onProviderSession('sesion-reanudable') }, steer() {}, async interrupt() {}, close() { p.cerrado = true; opts.onExit?.() } }
  })
  t.after(() => { sesiones.closeAll(); rmSync(dir, { recursive: true, force: true }) })
  const meta = sesiones.create({ cardId: 'prueba', cwd: dir, title: 'Prueba', model: 'claude-prueba' })
  sesiones.send(meta.id, 'Hola')
  return { sesiones, meta, procesos, emitir: procesos[0].opts.onEvent }
}

test('un chat quieto libera el proceso y conserva la sesión del proveedor para retomar', (t) => {
  const h = preparar(t)
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  t.mock.timers.tick(AGENTE_OCIOSO - 1)
  assert.equal(h.procesos[0].cerrado, false)
  t.mock.timers.tick(1)
  assert.equal(h.procesos[0].cerrado, true)
  h.sesiones.send(h.meta.id, 'Sigue')
  assert.equal(h.procesos.length, 2)
  assert.equal(h.procesos[1].opts.resume, 'sesion-reanudable')
})

test('no se cierra un turno largo, un trabajo de fondo ni un despertador', (t) => {
  const h = preparar(t)
  t.mock.timers.tick(AGENTE_OCIOSO * 2)
  assert.equal(h.procesos[0].cerrado, false)
  h.emitir({ t: 'background', tasks: ['Exportación'] })
  h.emitir({ t: 'turn_end', at: Date.now(), ok: true })
  t.mock.timers.tick(AGENTE_OCIOSO * 2)
  assert.equal(h.procesos[0].cerrado, false)
  h.emitir({ t: 'background', tasks: [] })
  t.mock.timers.tick(4000) // El aviso de fin del segundo plano no debe cancelar para siempre la recolección.
  t.mock.timers.tick(AGENTE_OCIOSO)
  assert.equal(h.procesos[0].cerrado, true)
  h.sesiones.send(h.meta.id, 'Programa')
  const emitir = h.procesos[1].opts.onEvent
  emitir({ t: 'tool', id: 'cron', name: 'CronCreate', input: { prompt: 'Revisa luego' } })
  emitir({ t: 'turn_end', at: Date.now(), ok: true })
  t.mock.timers.tick(AGENTE_OCIOSO * 2)
  assert.equal(h.procesos[1].cerrado, false)
})
