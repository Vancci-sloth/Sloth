import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentEvent } from './types.ts'
import { CORTE_SALIDA, historialLigero, paraMandar, rellenar, salidaDe, sinSalidasLargas } from './historial.ts'
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

test('una salida larga que acabó no viaja al abrir el hilo, se sabe cuánto mide y se recupera entera', () => {
  const larga = 'x'.repeat(CORTE_SALIDA + 1)
  const events: AgentEvent[] = [
    { t: 'tool', id: 'a', name: 'Bash', input: {} },
    { t: 'tool_update', id: 'a', output: larga },
    { t: 'tool_update', id: 'a', delta: ' y fin' },
    { t: 'tool_update', id: 'a', done: true, error: true }
  ]
  const mandado = sinSalidasLargas(events)
  assert.equal(mandado.length, events.length, 'cada evento conserva su índice del WebSocket')
  assert.ok(JSON.stringify(mandado).length < 200)
  const item = buildTimeline(mandado)[0]
  assert.equal(item.kind === 'tool' && item.output, '')
  assert.equal(item.kind === 'tool' && item.largo, larga.length + 6)
  assert.equal(item.kind === 'tool' && item.done && item.error, true)
  assert.equal(salidaDe(events, 'a'), `${larga} y fin`)
})

test('la salida corta y la de lo que sigue trabajando viajan enteras', () => {
  const corta: AgentEvent[] = [{ t: 'tool', id: 'a', name: 'Bash', input: {} }, { t: 'tool_update', id: 'a', output: 'hola', done: true }]
  assert.deepEqual(sinSalidasLargas(corta), corta)
  const viva: AgentEvent[] = [{ t: 'tool', id: 'b', name: 'Bash', input: {} }, { t: 'tool_update', id: 'b', output: 'x'.repeat(CORTE_SALIDA * 2) }]
  assert.deepEqual(sinSalidasLargas(viva), viva, 'lo que falta llega en trozos que se suman a esto')
})

test('un hilo largo se abre con un presupuesto fijo aunque sus herramientas hayan sacado megas', () => {
  const events: AgentEvent[] = []
  for (let i = 0; i < 900; i++) {
    events.push({ t: 'tool', id: `h${i}`, name: 'Bash', input: { command: 'npm test' } })
    events.push({ t: 'tool_update', id: `h${i}`, output: 'x'.repeat(20_000), done: true })
  }
  const mandado = JSON.stringify(paraMandar(sinSalidasLargas(historialLigero(events))))
  assert.ok(mandado.length < 150 * 1024, `se mandarían ${Math.round(mandado.length / 1024)} KB`)
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
