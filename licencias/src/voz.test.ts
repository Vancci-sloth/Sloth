import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_LETRAS, mensajeDe, pedidoTts } from './voz.ts'

test('a Voices Cloning solo va un trozo con texto, voz y una velocidad que acepta', () => {
  assert.deepEqual(pedidoTts({ text: '  Hola.  ', voice_id: 'v1' }), { text: 'Hola.', voice_id: 'v1' })
  assert.deepEqual(pedidoTts({ text: 'Hola.', voice_id: 'v1', speed: 1.2 }), { text: 'Hola.', voice_id: 'v1', speed: 1.2 })
  // Lo que llega de más no pasa.
  assert.deepEqual(pedidoTts({ text: 'Hola.', voice_id: 'v1', external_id: 'otro' }), { text: 'Hola.', voice_id: 'v1' })
  assert.throws(() => pedidoTts({ text: '', voice_id: 'v1' }), /Falta el texto/)
  assert.throws(() => pedidoTts({ text: 'x'.repeat(MAX_LETRAS + 1), voice_id: 'v1' }), /5000 por llamada/)
  assert.throws(() => pedidoTts({ text: 'Hola.' }), /Falta la voz/)
  assert.throws(() => pedidoTts({ text: 'Hola.', voice_id: 'v1', speed: 2 }), /0.5 a 1.5/)
})

test('cada error de Voices Cloning se dice en español y con qué hacer', () => {
  const de = (status: number, code?: string, espera?: string) => mensajeDe({ status, datos: code ? { code, error: 'x' } : {}, espera })
  assert.match(de(402, 'insufficient_credits'), /acabaron los créditos/)
  assert.match(de(402, 'partner_balance_empty'), /saldo de Sloth/)
  assert.match(de(402, 'partner_daily_limit'), /medianoche, hora de Lima/)
  assert.match(de(429, 'queue_full', '12'), /en 12 segundos/)
  assert.match(de(504), /no se cobró/)
  assert.match(de(401), /llave de Sloth/)
  assert.match(de(403), /suspendido/)
  assert.match(de(500), /respondió 500/)
})
