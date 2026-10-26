import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { eventosEnVivo } from './eventos-en-vivo.ts'
import type { AgentEvent } from '../shared/types.ts'

test('el streaming agrupa tokens sin mezclar hilos, perder índices ni cambiar el orden', async () => {
  const recibidos: { id: string; from: number; events: AgentEvent[] }[] = []
  const push = eventosEnVivo((id, from, events) => recibidos.push({ id, from, events }))
  for (let i = 0; i < 100; i++) {
    push('a', 10 + i, [{ t: 'text', id: 'texto', delta: String(i) }])
    push('b', i, [{ t: 'tool_update', id: 'tool', delta: String(i) }])
  }
  push('a', 110, [{ t: 'turn_end', at: 1, ok: true }])
  await setTimeout(90)
  assert.equal(recibidos.length, 2)
  assert.equal(recibidos[0].from, 10)
  assert.equal(recibidos[0].events.length, 101)
  assert.equal(recibidos[0].events.at(-1)?.t, 'turn_end')
  assert.equal(recibidos[1].from, 0)
  assert.equal(recibidos[1].events.length, 100)
})
