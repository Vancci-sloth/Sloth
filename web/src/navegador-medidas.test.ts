import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrastrarBorde, colocarPantalla, limitar } from './navegador-medidas.ts'

test('una pantalla que cabe va centrada y sin escala', () => {
  assert.deepEqual(colocarPantalla({ ancho: 390, alto: 844 }, { ancho: 790, alto: 1044 }), { x: 200, y: 100, ancho: 390, alto: 844, escala: 1 })
})

test('una pantalla que no cabe se encoge sin deformarse', () => {
  const l = colocarPantalla({ ancho: 1440, alto: 900 }, { ancho: 720, alto: 900 })
  assert.deepEqual(l, { x: 0, y: 225, ancho: 720, alto: 450, escala: 0.5 })
})

test('nunca crece más que su tamaño', () => {
  assert.equal(colocarPantalla({ ancho: 300, alto: 300 }, { ancho: 3000, alto: 3000 }).escala, 1)
})

test('mientras cabe, el borde sigue al puntero: crece el doble', () => {
  assert.equal(arrastrarBorde(400, 800, 50), 500)
  assert.equal(arrastrarBorde(400, 800, -50), 300)
})

test('pasado el espacio, crece uno a uno', () => {
  assert.equal(arrastrarBorde(900, 800, 50), 950)
  assert.equal(arrastrarBorde(780, 800, 100), 890)
})

test('el tamaño escrito se queda entre lo que aguanta una página', () => {
  assert.equal(limitar(10), 240)
  assert.equal(limitar(99999), 3840)
  assert.equal(limitar(Number.NaN), 240)
  assert.equal(limitar(390.4), 390)
})
