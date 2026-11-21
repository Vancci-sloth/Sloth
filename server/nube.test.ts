import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deLaNube, nubeDe } from './nube.ts'

const HOST = 'feliz-perezoso-abc123-4848.app.github.dev'

test('nubeDe solo toma un nombre de host', () => {
  assert.equal(nubeDe(` ${HOST.toUpperCase()} `), HOST)
  assert.equal(nubeDe('sloth.localtest.me:8443'), 'sloth.localtest.me:8443')
  for (const malo of [undefined, '', 'localhost', `https://${HOST}`, `${HOST}/x`, 'a b.c']) assert.equal(nubeDe(malo), null)
})

test('deLaNube atiende la página de Sloth por su dirección y nada más', () => {
  const pide = (headers: Record<string, string>) => deLaNube({ headers }, HOST)
  assert.equal(pide({ host: HOST }), true)
  assert.equal(pide({ host: HOST, origin: `https://${HOST}`, 'sec-fetch-site': 'same-origin' }), true)
  assert.equal(pide({ host: HOST, 'sec-fetch-site': 'none' }), true)
  assert.equal(pide({ host: 'localhost:4848', 'x-forwarded-host': HOST, origin: `https://${HOST}` }), true)
  // Otro sitio que la llama con la sesión de GitHub de quien la usa.
  assert.equal(pide({ host: HOST, origin: 'https://malo.example' }), false)
  assert.equal(pide({ host: HOST, origin: `http://${HOST}` }), false)
  assert.equal(pide({ host: HOST, 'sec-fetch-site': 'cross-site' }), false)
  assert.equal(pide({ host: HOST, 'sec-fetch-site': 'same-site' }), false)
  assert.equal(pide({ host: 'otro-4848.app.github.dev' }), false)
  // En una computadora (sin SLOTH_NUBE) no hay nube.
  assert.equal(deLaNube({ headers: { host: HOST } }, null), false)
})
