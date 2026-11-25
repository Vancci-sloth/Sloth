import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import type { AgentOptions } from './agent.ts'
import { Sessions } from './sessions.ts'

function preparar(t: test.TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dir = mkdtempSync(join(tmpdir(), 'sloth-reintentar-'))
  const emitir = new Map<string, AgentOptions['onEvent']>()
  const recibido: string[] = []
  const sessions = new Sessions(dir, () => {}, () => {}, () => {}, () => {}, (opts) => {
    emitir.set(opts.hilo!, opts.onEvent)
    return { send: (texto: string) => void recibido.push(texto), steer: (texto: string) => void recibido.push(texto), compact() {}, async interrupt() {}, close() {} }
  })
  t.after(() => {
    sessions.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })
  const meta = sessions.create({ cardId: 'video', cwd: dir, title: 'Prueba', model: 'codex:gpt-prueba' })
  sessions.send(meta.id, 'haz el video')
  const acaba = (error?: string) => emitir.get(meta.id)!({ t: 'turn_end', at: Date.now(), ok: !error, ...(error ? { error } : {}) } as AgentEvent)
  return { sessions, meta, recibido, acaba }
}

test('un error pasajero del proveedor se reintenta solo, dos veces como mucho', (t) => {
  const h = preparar(t)
  h.acaba('API Error: 529 Overloaded')
  t.mock.timers.tick(29_000)
  assert.deepEqual(h.recibido, ['haz el video'])
  t.mock.timers.tick(2_000)
  assert.deepEqual(h.recibido, ['haz el video', 'Sigue donde te quedaste.'])

  h.acaba('API Error: 500 internal server error')
  t.mock.timers.tick(61_000)
  assert.equal(h.recibido.length, 3)

  h.acaba('API Error: 500 internal server error')
  t.mock.timers.tick(200_000)
  assert.equal(h.recibido.length, 3)
})

test('un límite de uso no se reintenta', (t) => {
  const h = preparar(t)
  h.acaba('You have exceeded your current quota (429)')
  t.mock.timers.tick(200_000)
  assert.deepEqual(h.recibido, ['haz el video'])
})

test('si le escribes mientras espera, no se reintenta encima', (t) => {
  const h = preparar(t)
  h.acaba('Overloaded')
  h.sessions.send(h.meta.id, 'mejor cambia el título')
  t.mock.timers.tick(31_000)
  assert.deepEqual(h.recibido, ['haz el video', 'mejor cambia el título'])
})
