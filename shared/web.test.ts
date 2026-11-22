import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CODIGO_CORTO, enlaceEntrada, esDeLaWeb, limpiarCodigo, nombreDispositivo, verCodigo } from './web.ts'

test('la web es lo que llega por https y no es esta computadora', () => {
  assert.equal(esDeLaWeb({ protocol: 'https:', hostname: 'algo.trycloudflare.com' }), true)
  assert.equal(esDeLaWeb({ protocol: 'http:', hostname: 'localhost' }), false)
  assert.equal(esDeLaWeb({ protocol: 'http:', hostname: '127.0.0.1' }), false)
})

test('el código corto se escribe como se quiera: con guion, espacios o en minúsculas', () => {
  assert.equal(limpiarCodigo(' abcde-fghjk '), 'ABCDEFGHJK')
  assert.equal(verCodigo('ABCDEFGHJK'), 'ABCDE-FGHJK')
  assert.ok(CODIGO_CORTO.test(limpiarCodigo('k7pq4-mxzab')))
  // Sin letras que se confunden, y con diez.
  assert.ok(!CODIGO_CORTO.test('ABCDEFGHJ0') && !CODIGO_CORTO.test('ABCDEFGHJI') && !CODIGO_CORTO.test('ABCDEFGH'))
})

test('el enlace de entrada lleva el código en el fragmento, que no llega a ningún servidor', () => {
  assert.equal(enlaceEntrada('AbCdEfGhIjKlMnOpQrStUv'), 'https://web.sloth.vancci.org/AbCdEfGhIjKlMnOpQrStUv')
  assert.equal(enlaceEntrada('AbCdEfGhIjKlMnOpQrStUv', 'xyz'), 'https://web.sloth.vancci.org/AbCdEfGhIjKlMnOpQrStUv#c=xyz')
})

test('cada dispositivo se nombra por su sistema y su navegador', () => {
  assert.equal(nombreDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari')
  assert.equal(nombreDispositivo('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'), 'Android · Chrome')
  assert.equal(nombreDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0'), 'Windows · Edge')
  assert.equal(nombreDispositivo(''), 'Otro')
})
