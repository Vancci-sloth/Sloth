import assert from 'node:assert/strict'
import { test } from 'node:test'
import { creditosDe, IMAGEN_CHATGPT, imagenPosible, lineaImagenes, tipoDeArchivo } from './flow.ts'

test('el costo se lee del panel de Flow en cualquier idioma', () => {
  assert.equal(creditosDe('Veo 3.1 - Lite\nx1\nx2\nLa generación usará 10 créditos'), 10)
  assert.equal(creditosDe('x1\nThis generation will use 100 credits'), 100)
  assert.equal(creditosDe('La generación usará 0 créditos'), 0)
})

test('sin costo escrito no hay número: así no se genera a ciegas', () => {
  assert.equal(creditosDe('Veo 3.1 - Lite\nx1\nx2'), null)
  assert.equal(creditosDe('Créditos de Google Flow'), null)
})

test('las imágenes usan lo elegido si está conectado y, si no, lo que haya', () => {
  const ambos = { chatgpt: true, google: true }
  assert.equal(imagenPosible('Nano Banana Pro', ambos), 'Nano Banana Pro')
  assert.equal(imagenPosible(IMAGEN_CHATGPT, ambos), IMAGEN_CHATGPT)
  assert.equal(imagenPosible('', ambos), IMAGEN_CHATGPT)
  assert.equal(imagenPosible(IMAGEN_CHATGPT, { chatgpt: false, google: true }), 'Nano Banana 2.1')
  assert.equal(imagenPosible('Nano Banana Pro', { chatgpt: true, google: false }), IMAGEN_CHATGPT)
  assert.equal(imagenPosible('', { chatgpt: false, google: false }), '')
})

test('la línea Imágenes dice con qué generar y sin elección no sale', () => {
  assert.match(lineaImagenes('Nano Banana Pro'), /^Imágenes: genéralas en Google Flow con Nano Banana Pro, no con ChatGPT/)
  assert.match(lineaImagenes(IMAGEN_CHATGPT), /^Imágenes: con ChatGPT/)
  assert.equal(lineaImagenes(''), '')
})

test('lo que baja se reconoce por sus bytes, no por el nombre', () => {
  assert.equal(tipoDeArchivo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])), 'imagen')
  assert.equal(tipoDeArchivo(Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])), 'video')
  assert.equal(tipoDeArchivo(new TextEncoder().encode('<!doctype html>')), null)
})
