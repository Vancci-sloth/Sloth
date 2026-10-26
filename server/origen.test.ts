import assert from 'node:assert/strict'
import test from 'node:test'
import { peticionDeConfianza } from './origen.ts'

test('Google puede volver a OAuth como navegación; las otras peticiones externas siguen rechazadas', () => {
  const req = { method: 'GET', url: '/api/youtube/oauth?state=prueba&code=prueba', headers: {
    host: '127.0.0.1:4848', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document'
  } }
  assert.equal(peticionDeConfianza(req, 4848), true)
  for (const url of ['/api/state', '/api/youtube/conectar', '/api/youtube/subida', '/ws', '/api/youtube/oauth/otra'])
    assert.equal(peticionDeConfianza({ ...req, url }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, method: 'POST' }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, headers: { ...req.headers, 'sec-fetch-mode': 'cors' } }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, headers: { ...req.headers, 'sec-fetch-dest': 'iframe' } }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, headers: { ...req.headers, host: 'otro.example:4848' } }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, headers: { ...req.headers, origin: 'https://otro.example' } }, 4848), false)
})

test('la vista en vivo del estudio se abre desde la otra dirección, solo como marco de Sloth', () => {
  const req = { method: 'GET', url: '/api/sessions/abc123/motor?v=2', headers: {
    host: '127.0.0.1:4848', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe', referer: 'http://localhost:4848/'
  } }
  assert.equal(peticionDeConfianza(req, 4848), true)
  assert.equal(peticionDeConfianza({ ...req, url: '/api/sessions/abc123/vivo/out/index.html?t=3' }, 4848), true)
  // Otra página no puede enmarcarla, ni pedir otra cosa así, ni como documento.
  assert.equal(peticionDeConfianza({ ...req, headers: { ...req.headers, referer: 'https://otro.example/' } }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, headers: { ...req.headers, referer: 'http://localhost:4848.otro.example/' } }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, headers: { ...req.headers, referer: undefined } }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, headers: { ...req.headers, 'sec-fetch-dest': 'document' } }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, url: '/api/sessions/abc123/archivo?ruta=x' }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, url: '/api/state' }, 4848), false)
  assert.equal(peticionDeConfianza({ ...req, method: 'POST' }, 4848), false)
})

test('la ventana de Sloth, los scripts locales y el WebSocket mantienen sus permisos', () => {
  assert.equal(peticionDeConfianza({ method: 'POST', url: '/api/youtube/subida', headers: { host: 'localhost:4848', origin: 'http://localhost:4848', 'sec-fetch-site': 'same-origin' } }, 4848), true)
  assert.equal(peticionDeConfianza({ method: 'GET', url: '/api/state', headers: { host: '127.0.0.1:4848' } }, 4848), true)
  assert.equal(peticionDeConfianza({ method: 'GET', url: '/ws', headers: { host: 'localhost:4848', origin: 'http://localhost:4848' } }, 4848), true)
})
