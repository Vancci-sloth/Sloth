import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { cookieDelToken, exentaDeToken, exigirToken, pideLaPagina, tokenDelServidor, tokenValido } from './token.ts'

test('el token se crea una vez (32 bytes) y se vuelve a leer igual', (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'sloth-token-'))
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  const archivo = join(datos, 'servidor-token')
  const token = tokenDelServidor(archivo)
  assert.equal(Buffer.from(token, 'base64url').length, 32)
  assert.equal(tokenDelServidor(archivo), token)
})

test('se acepta en la cabecera o en la cookie de su puerto, y nada más', () => {
  const token = 'a'.repeat(43)
  assert.ok(tokenValido({ headers: { 'x-sloth-token': token } }, token, 4848))
  assert.ok(tokenValido({ headers: { cookie: `otra=1; sloth_token_4848=${token}` } }, token, 4848))
  // La cookie de la Sloth de otro puerto no sirve aquí.
  assert.ok(!tokenValido({ headers: { cookie: `sloth_token_4849=${token}` } }, token, 4848))
  assert.ok(!tokenValido({ headers: {} }, token, 4848))
  assert.ok(!tokenValido({ headers: { 'x-sloth-token': 'b'.repeat(43) } }, token, 4848))
  assert.ok(!tokenValido({ headers: { 'x-sloth-token': 'corto' } }, token, 4848))
  assert.match(cookieDelToken(token, 4848), /^sloth_token_4848=a+; HttpOnly; SameSite=Strict; Path=\/$/)
})

test('solo la vuelta de YouTube y la vista en vivo del estudio van sin token', () => {
  const nav = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  assert.ok(exentaDeToken({ method: 'GET', url: '/api/youtube/oauth?code=1&state=2', headers: nav }))
  assert.ok(!exentaDeToken({ method: 'POST', url: '/api/youtube/oauth', headers: nav }))
  assert.ok(exentaDeToken({ method: 'GET', url: '/api/sessions/abc/motor?v=2', headers: { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'cross-site' } }))
  assert.ok(exentaDeToken({ method: 'GET', url: '/api/sessions/abc/motor/motor.js?v=2', headers: { 'sec-fetch-dest': 'script', 'sec-fetch-site': 'same-origin' } }))
  assert.ok(!exentaDeToken({ method: 'GET', url: '/api/sessions/abc/motor', headers: {} }))
  assert.ok(!exentaDeToken({ method: 'GET', url: '/api/state', headers: { 'sec-fetch-site': 'same-origin' } }))
  assert.ok(!exentaDeToken({ method: 'POST', url: '/api/sessions/abc/motor', headers: { 'sec-fetch-dest': 'iframe' } }))
})

test('la cookie solo va con la página de la app, no con la API', () => {
  const nav = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  assert.ok(pideLaPagina({ method: 'GET', url: '/', headers: nav }))
  assert.ok(!pideLaPagina({ method: 'GET', url: '/api/state', headers: nav }))
  assert.ok(!pideLaPagina({ method: 'GET', url: '/', headers: {} }))
})

test('exigirlo está apagado salvo con SLOTH_EXIGIR_TOKEN=1', (t) => {
  const antes = process.env.SLOTH_EXIGIR_TOKEN
  t.after(() => (antes === undefined ? delete process.env.SLOTH_EXIGIR_TOKEN : (process.env.SLOTH_EXIGIR_TOKEN = antes)))
  delete process.env.SLOTH_EXIGIR_TOKEN
  assert.equal(exigirToken(), false)
  process.env.SLOTH_EXIGIR_TOKEN = '1'
  assert.equal(exigirToken(), true)
})
