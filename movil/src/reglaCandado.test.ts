import assert from 'node:assert/strict'
import test from 'node:test'
import { cerrada } from './reglaCandado.ts'

const ahora = Date.parse('2026-11-21T12:00:00Z')
const manana = '2026-11-22T12:00:00Z'
const ayer = '2026-11-20T12:00:00Z'

test('abre si el cobro no pide apoyo o nunca contestó', () => {
  assert.equal(cerrada(null, ahora), false)
  assert.equal(cerrada({}, ahora), false)
  assert.equal(cerrada({ cobra: false, apoya: false, hasta: ayer }, ahora), false)
})

test('si pide apoyo, abre solo a quien apoya y hasta que toque volver a preguntar', () => {
  assert.equal(cerrada({ cobra: true }, ahora), true, 'sin clave')
  assert.equal(cerrada({ cobra: true, apoya: false, hasta: manana }, ahora), true, 'la clave no apoya')
  assert.equal(cerrada({ cobra: true, apoya: true, hasta: manana }, ahora), false)
  assert.equal(cerrada({ cobra: true, apoya: true, hasta: ayer }, ahora), true, 'una semana sin internet')
})
