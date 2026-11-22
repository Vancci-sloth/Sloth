import assert from 'node:assert/strict'
import test from 'node:test'
import { audioNavegador } from './audio-navegador.ts'

test('cerrar el panel o cambiar de pestaña corta el audio y al volver respeta el silencio manual', () => {
  const cambios: boolean[] = []
  const audio = audioNavegador((si) => cambios.push(si))
  assert.deepEqual(cambios, [true])
  audio.ver(true)
  audio.ver(false)
  assert.deepEqual(cambios, [true, false, true])
  audio.ver(true)
  audio.alternar()
  assert.equal(audio.silenciado, true)
  audio.ver(false)
  audio.ver(true)
  assert.deepEqual(cambios, [true, false, true, false, true])
  audio.alternar()
  assert.equal(cambios.at(-1), false)
})

test('quitar el silencio de una pestaña oculta no la hace sonar hasta mostrarla', () => {
  const cambios: boolean[] = []
  const audio = audioNavegador((si) => cambios.push(si))
  audio.alternar()
  audio.alternar()
  assert.deepEqual(cambios, [true])
  audio.ver(true)
  assert.deepEqual(cambios, [true, false])
})

test('las páginas de redes y generación de voz permanecen silenciosas', () => {
  const cambios: boolean[] = []
  const audio = audioNavegador((si) => cambios.push(si), true)
  audio.ver(true)
  audio.alternar()
  audio.ver(false)
  audio.ver(true)
  assert.equal(audio.silenciado, true)
  assert.deepEqual(cambios, [true])
})
