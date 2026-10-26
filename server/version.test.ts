import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cabe } from './version.ts'

test('el SDK de Claude no salta a la siguiente cifra de en medio', () => {
  assert.ok(cabe('0.3.310', '^0.3.296'))
  assert.ok(!cabe('0.4.0', '^0.3.296'))
  assert.ok(!cabe('0.3.200', '^0.3.296'))
})

test('Codex acepta cualquier 0.x más nueva, pero no la 1.0 ni las de prueba', () => {
  assert.ok(cabe('0.164.0', '^0.162.1', 1))
  assert.ok(!cabe('0.161.0', '^0.162.1', 1))
  assert.ok(!cabe('1.0.0', '^0.162.1', 1))
  assert.ok(!cabe('0.165.0-alpha.1', '^0.162.1', 1))
})
