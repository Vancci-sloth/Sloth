import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calidadEntero } from './comunidad.ts'

/** Lo que pesa, en MB, un video de `segundos` con el tope de `calidadEntero` y su audio de 96 kbps. */
const pesa = (segundos: number) => ((calidadEntero(segundos).kbps + 96) * 1000 * segundos) / 8 / 1024 / 1024

test('el video entero de un estilo sale a 720 px mientras cabe holgado', () => {
  assert.deepEqual(calidadEntero(60), { lado: 720, kbps: 2500 })
  assert.deepEqual(calidadEntero(140), { lado: 720, kbps: 2500 })
  // Sin duración (no se pudo leer su cabecera), la calidad de siempre.
  assert.deepEqual(calidadEntero(undefined), { lado: 720, kbps: 2500 })
  assert.deepEqual(calidadEntero(0), { lado: 720, kbps: 2500 })
})

test('uno largo baja de bits y de tamaño para caber en lo que acepta el Worker', () => {
  assert.equal(calidadEntero(5 * 60).lado, 720)
  assert.equal(calidadEntero(10 * 60).lado, 480)
  assert.equal(calidadEntero(20 * 60).lado, 360)
  // Hasta 20 minutos, ninguno pasa de 45 MB: el Worker acepta videos de hasta 50.
  for (const s of [30, 145, 146, 300, 600, 1200]) assert.ok(pesa(s) <= 45, `${s} s pesa ${pesa(s).toFixed(1)} MB`)
})
