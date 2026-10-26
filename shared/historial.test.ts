import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentEvent } from './types.ts'
import { historialLigero, paraMandar, rellenar } from './historial.ts'
import { buildTimeline } from '../web/src/items.ts'

test('abrir el hilo no descarga todas las copias de una salida creciente', () => {
  const events: AgentEvent[] = [{ t: 'tool', id: 'a', name: 'Bash', input: { command: 'prueba' } }]
  for (let i = 1; i <= 1000; i++) events.push({ t: 'tool_update', id: 'a', output: 'x'.repeat(i * 100), done: i === 1000 })
  const ligero = historialLigero(events)
  assert.equal(ligero.length, events.length, 'conserva los índices del WebSocket')
  assert.deepEqual(buildTimeline(ligero), buildTimeline(events), 'conserva el contenido y estado de la herramienta')
  assert.ok(JSON.stringify(ligero).length < 200_000, 'el historial debe pesar menos de 200 KB, no 50 MB')
  assert.equal(events[1].t === 'tool_update' && events[1].output?.length, 100, 'no modifica el registro original')
})

test('lo que no cambia nada viaja como un hueco que conserva su sitio, y la pantalla queda igual', () => {
  const events: AgentEvent[] = [{ t: 'tool', id: 'a', name: 'Bash', input: {} }]
  for (let i = 1; i <= 50; i++) events.push({ t: 'tool_update', id: 'a', output: `salida ${i}` })
  events.push({ t: 'tool_update', id: 'a', done: true }, { t: 'text', id: 't', delta: 'fin' })
  const ligero = historialLigero(events)
  const mandado = paraMandar(ligero)
  assert.equal(mandado.length, events.length, 'conserva los índices del WebSocket')
  assert.equal(mandado.filter((e) => e === null).length, 49, 'las salidas viejas, ya vacías, son huecos')
  const llegado = rellenar(JSON.parse(JSON.stringify(mandado)))
  assert.deepEqual(buildTimeline(llegado), buildTimeline(events))
})

test('los fragmentos de salida y una actualización sin salida conservan lo escrito', () => {
  const events: AgentEvent[] = [
    { t: 'tool', id: 'a', name: 'Bash', input: {} },
    { t: 'tool_update', id: 'a', output: 'inicio' },
    { t: 'tool_update', id: 'a', delta: ' y final' },
    { t: 'tool_update', id: 'a', done: true },
  ]
  const item = buildTimeline(historialLigero(events))[0]
  assert.equal(item.kind === 'tool' && item.output, 'inicio y final')
  assert.equal(item.kind === 'tool' && item.done, true)
})
