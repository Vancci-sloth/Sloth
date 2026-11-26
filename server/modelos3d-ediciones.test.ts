import assert from 'node:assert/strict'
import { test } from 'node:test'
import { limpiarEdiciones } from './modelos3d-ediciones.ts'

test('las ediciones de un modelo 3D conservan solo rutas de pieza y cambios bien formados', () => {
  assert.deepEqual(
    limpiarEdiciones({
      '0/2': { p: [1, 0, 0], r: [0, 0, 0.5], s: [1, 1, 2] },
      x: { p: [1, 2, 3] },
      '1': { p: [1, NaN, 0] },
      '2/a': { p: [1, 2, 3] },
      '3': { p: [1, 2] },
    }),
    { '0/2': { p: [1, 0, 0], r: [0, 0, 0.5], s: [1, 1, 2] } },
  )
})

test('una entrada que no es un mapa de ediciones se descarta entera', () => {
  assert.deepEqual(limpiarEdiciones(null), {})
  assert.deepEqual(limpiarEdiciones([1, 2]), {})
  assert.deepEqual(limpiarEdiciones('0/0'), {})
})

test('una escala fuera de rango se acota: nunca invertida ni desaparecida', () => {
  assert.deepEqual(limpiarEdiciones({ '0/1': { s: [1, 1, -7.708] }, '0/2': { s: [100, 0, 2] } }), {
    '0/1': { s: [1, 1, 0.05] },
    '0/2': { s: [20, 0.05, 2] },
  })
})
