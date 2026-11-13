import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deLaForma } from './recordado.ts'

test('lo guardado con otra forma no se usa: un null o una lista donde va un objeto dejaban la app en blanco', () => {
  assert.equal(deLaForma(null, []), false)
  assert.equal(deLaForma({}, []), false)
  assert.equal(deLaForma([null], []), false)
  assert.equal(deLaForma([], { otras: [] }), false)
  assert.equal(deLaForma(null, { otras: [] }), false)
  assert.equal(deLaForma({}, { otras: [] }), false)
  assert.equal(deLaForma({ otras: 'x' }, { otras: [] }), false)
  assert.equal(deLaForma('si', false), false)
  assert.equal(deLaForma([{ id: 'a' }], []), true)
  assert.equal(deLaForma({ otras: ['x'] }, { otras: [] }), true)
  assert.equal(deLaForma(true, false), true)
})
