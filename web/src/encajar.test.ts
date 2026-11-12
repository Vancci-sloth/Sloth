import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encajar, MINIMO } from './encajar.ts'

const cabe = (e: ReturnType<typeof encajar>, ancho: number, alto: number, n: number, hueco: number) => {
  const filas = Math.ceil(n / e.columnas)
  return e.columnas * e.ancho + (e.columnas - 1) * hueco <= ancho && filas * e.alto + (filas - 1) * hueco <= alto
}

test('seis estilos en una ventana ancha y baja: una fila de verticales, enteros', () => {
  const e = encajar(936, 300, 6, 14)
  assert.equal(e.columnas, 6)
  assert.ok(e.ancho < e.alto)
  assert.ok(cabe(e, 936, 300, 6, 14))
})

test('con más alto que ancho van en varias filas, y siempre caben', () => {
  for (const [w, h] of [[300, 600], [680, 270], [1500, 500], [334, 280], [1032, 700]]) {
    const e = encajar(w, h, 6, 14)
    assert.ok(cabe(e, w, h, 6, 14), `${w}×${h}: ${JSON.stringify(e)}`)
  }
})

test('las filas salen parejas: seis son 6, 3+3 o 2+2+2, nunca 5+1', () => {
  for (const [w, h] of [[948, 441], [884, 341], [318, 415], [600, 900], [1600, 300]]) {
    const e = encajar(w, h, 6, 14)
    assert.ok([1, 2, 3, 6].includes(e.columnas), `${w}×${h}: ${JSON.stringify(e)}`)
  }
  // En 1280×800 (948×441 libres), una sola fila.
  assert.equal(encajar(948, 441, 6, 14).columnas, 6)
})

test('con alto de sobra, los verticales llegan hasta 9:16, no más', () => {
  for (const [w, h] of [[948, 600], [1560, 700], [948, 441]]) {
    const e = encajar(w, h, 6, 14)
    assert.ok(e.alto <= Math.ceil((e.ancho * 16) / 9) && e.alto >= Math.floor((e.ancho * 4) / 3), `${w}×${h}: ${JSON.stringify(e)}`)
    assert.ok(cabe(e, w, h, 6, 14))
  }
})

test('si en vertical salen muy chicos, apaisados más grandes', () => {
  const e = encajar(1000, 120, 6, 14)
  assert.ok(e.ancho > e.alto, JSON.stringify(e))
  assert.ok(cabe(e, 1000, 120, 6, 14))
})

test('un vertical más angosto que el mínimo no gana aunque tenga más área: a 390 de ancho van apaisados', () => {
  const e = encajar(306, 336, 6, 14)
  assert.ok(e.ancho >= MINIMO, JSON.stringify(e))
  assert.ok(cabe(e, 306, 336, 6, 14))
})
