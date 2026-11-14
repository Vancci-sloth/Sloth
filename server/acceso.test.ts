import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizarDireccion } from './acceso.ts'

test('la dirección de Claude queda como la espera Claude Code', () => {
  assert.equal(normalizarDireccion('https://api.bedrock.com.do/v1/'), 'https://api.bedrock.com.do')
  assert.equal(normalizarDireccion(' api.proxy.com/anthropic '), 'https://api.proxy.com/anthropic')
  assert.equal(normalizarDireccion('http://localhost:8080'), 'http://localhost:8080')
})

test('vacía o la de Anthropic es la de siempre', () => {
  assert.equal(normalizarDireccion(''), undefined)
  assert.equal(normalizarDireccion(undefined), undefined)
  assert.equal(normalizarDireccion('https://api.anthropic.com/v1'), undefined)
})

test('una dirección que no es web no se guarda', () => {
  assert.throws(() => normalizarDireccion('ftp://proxy.com'), /https/)
  assert.throws(() => normalizarDireccion('https://api proxy.com'), /no es válida/)
})
