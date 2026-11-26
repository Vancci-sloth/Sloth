import assert from 'node:assert/strict'
import test from 'node:test'
import { CAMPOS_GUIA, faltaEnGuia, guiaDe } from './guia.ts'

const guia = { das: 'Solo el tema del video.', entrega: 'Un vertical de 30 segundos.', ejemplo: 'Hazme un video del ciclo del agua.' }

test('la guía de uso se guarda limpia: cada campo en una línea y a su tope, sin lo vacío ni lo ajeno', () => {
  assert.deepEqual(guiaDe({ ...guia, das: '  Solo el\n\n tema   del video. ', necesita: '  ', otro: 'x', entrega: 7 }), { das: guia.das, ejemplo: guia.ejemplo })
  assert.equal(guiaDe({ ejemplo: 'e'.repeat(900) })?.ejemplo.length, CAMPOS_GUIA.find((c) => c.id === 'ejemplo')!.max)
  for (const nada of [undefined, null, 'texto', 3, {}, { das: ' ' }]) assert.equal(guiaDe(nada), undefined)
})

test('dice qué campo obligatorio falta, en el orden de la plantilla; lo opcional no falta', () => {
  assert.equal(faltaEnGuia(guia), '')
  assert.equal(faltaEnGuia({ ...guia, necesita: 'Google Flow con créditos.' }), '')
  assert.equal(faltaEnGuia(undefined), 'Qué le das')
  assert.equal(faltaEnGuia({ ...guia, entrega: 'Video' }), 'Qué te entrega')
  assert.equal(faltaEnGuia({ das: guia.das, entrega: guia.entrega }), 'Ejemplo de lo que le escribes')
})
