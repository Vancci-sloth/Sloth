import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enlaceDe } from '../../server/celular.ts'
import { conLlave, leerEnlace, normalizarDireccion, wsDe } from './enlace.ts'

test('lee el QR que hace la computadora, con todas sus direcciones', () => {
  const qr = enlaceDe(['192.168.1.20', '100.64.0.7'], 4849, 'a+b/c')
  assert.deepEqual(leerEnlace(qr), { direcciones: ['http://192.168.1.20:4849', 'http://100.64.0.7:4849'], llave: 'a+b/c' })
})

test('un QR que no es de Sloth, o sin llave, no conecta', () => {
  assert.equal(leerEnlace('https://sloth.vancci.org'), null)
  assert.equal(leerEnlace('slothmovil://conectar?d=192.168.1.2:4849'), null)
  assert.equal(leerEnlace('slothmovil://conectar?llave=x'), null)
})

test('una dirección escrita a mano lleva el puerto del celular si no dice otro', () => {
  assert.equal(normalizarDireccion('192.168.1.5'), 'http://192.168.1.5:4849')
  assert.equal(normalizarDireccion(' http://192.168.1.5:5000/ '), 'http://192.168.1.5:5000')
  assert.equal(normalizarDireccion(''), '')
})

test('los videos y el WebSocket llevan la llave en la dirección', () => {
  assert.equal(conLlave('http://h:1', 'k y', '/api/x?ruta=a'), 'http://h:1/api/x?ruta=a&llave=k%20y')
  assert.equal(conLlave('http://h:1', 'k', '/api/previas/a.jpg'), 'http://h:1/api/previas/a.jpg?llave=k')
  assert.equal(wsDe('http://h:1', 'k'), 'ws://h:1/ws?llave=k')
})
