import assert from 'node:assert/strict'
import { test } from 'node:test'
import { elegirCuentaMeta, mensajeMeta, usoDe } from './meta.ts'

test('el pedido va a la cuenta libre con menos usado, y entre iguales a la que lleva más sin generar', () => {
  const c = (correo: string, porcentaje?: number, acabo = 0, ocupada = false) => ({ correo, porcentaje, acabo, ocupada })
  assert.equal(elegirCuentaMeta([c('a', 40), c('b', 10), c('c', 20)], 0), 'b')
  assert.equal(elegirCuentaMeta([c('a', 10, 500), c('b', 10, 100)], 0), 'b')
  // Sin leer cuenta como 0.
  assert.equal(elegirCuentaMeta([c('a', 5), c('b')], 0), 'b')
  assert.equal(elegirCuentaMeta([c('a', 0, 0, true), c('b', 50)], 0), 'b')
})

test('las que descansan o ya lo probaron no cuentan; si las que pueden están ocupadas, se espera', () => {
  const ahora = 1000
  const libre = { correo: 'a', acabo: 0, ocupada: false, porcentaje: 0 }
  assert.equal(elegirCuentaMeta([{ ...libre, descansa: { hasta: 2000 } }], ahora), 'ninguna')
  assert.equal(elegirCuentaMeta([{ ...libre, descansa: { hasta: 500 } }], ahora), 'a')
  assert.equal(elegirCuentaMeta([libre], ahora, ['a']), 'ninguna')
  assert.equal(elegirCuentaMeta([{ ...libre, ocupada: true }], ahora), 'esperar')
  assert.equal(elegirCuentaMeta([], ahora), 'ninguna')
})

test('el mensaje a Muse pide uno solo, en su proporción y sin preguntas, y lleva el prompt tal cual al final', () => {
  const m = mensajeMeta({ tipo: 'video', prompt: '  Un perezoso dice: "Hoy no me apuro."  ', formato: '9:16', primerCuadro: false, imagenes: 0 })
  assert.match(m, /^Genera un solo video en formato exactamente 9:16\. No preguntes/)
  assert.ok(m.endsWith('\n\nUn perezoso dice: "Hoy no me apuro."'))
})

test('el mensaje dice qué es cada imagen adjunta', () => {
  assert.match(mensajeMeta({ tipo: 'imagen', prompt: 'x', formato: '1:1', primerCuadro: false, imagenes: 1 }), /una sola imagen en formato exactamente 1:1, a partir de la imagen adjunta:/)
  assert.match(mensajeMeta({ tipo: 'imagen', prompt: 'x', formato: '1:1', primerCuadro: false, imagenes: 3 }), /a partir de las 3 imágenes adjuntas/)
  const cuadro = mensajeMeta({ tipo: 'video', prompt: 'x', formato: '16:9', primerCuadro: true, imagenes: 1 })
  assert.match(cuadro, /que empiece en la primera imagen adjunta/)
  assert.doesNotMatch(cuadro, /otras/)
  assert.match(mensajeMeta({ tipo: 'video', prompt: 'x', formato: '16:9', primerCuadro: true, imagenes: 3 }), /con los personajes y objetos de las otras 2 imágenes adjuntas/)
})

test('el uso se lee de la barra, y el detalle son los demás renglones', () => {
  assert.deepEqual(usoDe('9', 'Plan gratuito\nEl límite semanal se restablece el 30 nov.\n9% utilizado', 5), { porcentaje: 9, detalle: 'Plan gratuito · El límite semanal se restablece el 30 nov.', leido: 5 })
  assert.equal(usoDe(null, 'Plan gratuito', 5), null)
  assert.equal(usoDe('', '', 5), null)
  assert.equal(usoDe('abc', '', 5), null)
})
