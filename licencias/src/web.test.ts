import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aviso, red48 } from './web.ts'

const LLAVE = 'k'.repeat(43)

test('el cobro solo guarda la dirección de un túnel rápido de Cloudflare: nunca manda a otro sitio', () => {
  assert.deepEqual(aviso({ llave: LLAVE, url: 'https://tres-palabras-aqui.trycloudflare.com', nombre: 'Escritorio' }), {
    llave: LLAVE,
    url: 'https://tres-palabras-aqui.trycloudflare.com',
    nombre: 'Escritorio'
  })
  for (const url of ['https://malo.example', 'http://x.trycloudflare.com', 'https://x.trycloudflare.com/ruta', 'https://x.trycloudflare.com.malo.example', 'javascript:alert(1)'])
    assert.throws(() => aviso({ llave: LLAVE, url }), /no es la de un túnel/)
  // Apagada: sin dirección.
  assert.equal(aviso({ llave: LLAVE, url: null }).url, null)
})

test('los códigos escritos se cuentan también por bloque /48 de IPv6, que tiene 65.536 redes /64', () => {
  assert.equal(red48('2806:2f0:9fa0:df9c:45ee:19bf:7f03:be12'), red48('2806:2f0:9fa0:1:2:3:4:5'))
  assert.equal(red48('2806:2f0:9fa0::1'), '2806:2f0:9fa0::/48')
  assert.notEqual(red48('2806:2f0:9fa1::1'), red48('2806:2f0:9fa0::1'))
  assert.equal(red48('189.203.1.2'), '189.203.1.2')
})

test('sin la llave de la computadora no hay aviso, y su nombre se limpia', () => {
  assert.throws(() => aviso({ url: null }), /Falta la llave/)
  assert.throws(() => aviso({ llave: 'corta', url: null }), /Falta la llave/)
  assert.equal(aviso({ llave: LLAVE, url: null, nombre: '<b>PC</b>\n' + 'x'.repeat(100) }).nombre.length, 60)
  assert.equal(aviso({ llave: LLAVE, url: null, nombre: '<script>' }).nombre, 'script')
})
