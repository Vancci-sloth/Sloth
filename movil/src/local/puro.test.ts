import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { costoDe, instrucciones, resumenWeb, rutaSegura, type EstiloLocal } from './puro.ts'

const estilos = JSON.parse(readFileSync(join(import.meta.dirname, 'estilos.json'), 'utf8')) as EstiloLocal[]

test('el agente del celular solo toca la carpeta de su hilo', () => {
  assert.deepEqual(rutaSegura('guion.md'), ['guion.md'])
  assert.deepEqual(rutaSegura('fuentes/./investigacion.md'), ['fuentes', 'investigacion.md'])
  assert.equal(rutaSegura('../otro/guion.md'), null)
  assert.equal(rutaSegura('fuentes/../../x'), null)
  assert.equal(rutaSegura('/data/user/0/x'), null)
  assert.equal(rutaSegura('C:\\Users\\x'), null)
  assert.equal(rutaSegura(''), null)
})

test('el costo suma la entrada, la caché, la salida y las búsquedas', () => {
  const usd = costoDe('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 3 } })
  assert.equal(Math.round(usd * 100) / 100, 4 + 2 + 0.2 + 0.03)
  // Un modelo desconocido cuesta como el de por defecto, nunca cero.
  assert.ok(costoDe('otro', { input_tokens: 1000, output_tokens: 0 }) > 0)
})

test('una búsqueda se ve como sus títulos con enlace; un error, como error', () => {
  assert.deepEqual(resumenWeb([{ title: 'TRPV1', url: 'https://x.org' }]), { texto: 'TRPV1 · https://x.org', error: false })
  assert.equal(resumenWeb({ type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' }).error, true)
})

test('cada estilo de video viaja con su skill entera, y las instrucciones no cambian entre mensajes', () => {
  assert.ok(estilos.length >= 5)
  for (const e of estilos) assert.ok(e.instrucciones.length > 1000, e.id)
  const a = instrucciones(estilos[0], 'Hago videos de ciencia.')
  assert.equal(a, instrucciones(estilos[0], 'Hago videos de ciencia.'))
  assert.match(a, /<opciones>/)
  assert.match(a, /Seguir en la computadora/)
  assert.ok(a.includes(estilos[0].instrucciones))
})
