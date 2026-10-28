import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { AgentOptions } from './agent.ts'
import type { AgentEvent } from '../shared/types.ts'
import { Sessions } from './sessions.ts'
import { buildTimeline } from '../web/src/items.ts'

test('abrir el historial mientras llega un turno conserva los índices y los eventos nuevos', async (t) => {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-sesiones-historial-'))
  let emitir!: AgentOptions['onEvent']
  const enviados: AgentEvent[] = []
  const crear = () => new Sessions(dir, (_, __, events) => enviados.push(...events), () => {}, () => {}, () => {}, (opts) => {
    emitir = opts.onEvent
    return { send() {}, steer() {}, async interrupt() {}, close() {} }
  })
  const a = crear()
  const meta = a.create({ cardId: 'prueba', title: 'Prueba', model: 'codex:prueba', cwd: dir })
  a.send(meta.id, 'Hola')
  emitir({ t: 'tool', id: 'a', name: 'Bash', input: {} })
  emitir({ t: 'tool_update', id: 'a', output: 'uno' })
  emitir({ t: 'tool_update', id: 'a', output: 'uno y dos', done: true })
  emitir({ t: 'turn_end', at: Date.now(), ok: true })
  a.closeAll()
  const b = crear()
  t.after(() => {
    b.closeAll()
    assert.ok(dir.startsWith(base + '\\') || dir.startsWith(base + '/'))
    rmSync(dir, { recursive: true, force: true })
  })
  const lectura = b.historial(meta.id)
  // El turno carga el registro vivo antes de que termine la lectura asíncrona de la pantalla.
  b.send(meta.id, 'Sigue')
  emitir({ t: 'text', id: 'nuevo', delta: 'Respuesta nueva' })
  const abierto = (await lectura)!
  assert.equal(abierto.events.length, b.get(meta.id)!.events.length)
  assert.deepEqual(buildTimeline(abierto.events), buildTimeline(b.get(meta.id)!.events))
  assert.ok(abierto.events.some((e) => e.t === 'text' && e.delta === 'Respuesta nueva'))
  const from = abierto.events.length
  emitir({ t: 'text', id: 'nuevo', delta: ' continúa' })
  assert.equal((await b.historial(meta.id))!.events.length, from + 1)
  assert.equal(await b.historial('no-existe'), null)
})
