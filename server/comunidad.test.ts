import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calidadEntero, paraPreaprobar } from './comunidad.ts'

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

test('al pre-aprobar, a su agente se le pide la prueba como la haría quien lo instala, lo que falló y que diga qué cambió', () => {
  const t = paraPreaprobar({ titulo: 'Recetas', autor: 'Ana', skill: 'recetas', ejemplo: 'Hazme un video del ciclo del agua.', falta: ['Un video entero hecho con él'], pide: ['Su paso 3 no dice qué hacer en `Mac`.'] })
  assert.match(t, /^Vamos a pre-aprobar «Recetas», un estilo que compartió Ana/)
  assert.match(t, /con el ejemplo de su guía: «Hazme un video del ciclo del agua\.»/)
  assert.match(t, /3\. Arregla también lo que le pidió la revisión:\n- Su paso 3 no dice qué hacer en Mac\./)
  assert.match(t, /Le falta esto para la comunidad[^\n]*\n- Un video entero hecho con él/)
  assert.match(t, /qué le cambiaste/)
  // Sin nada pedido ni nada que le falte, solo la prueba.
  const solo = paraPreaprobar({ titulo: 'Recetas', autor: '', skill: 'recetas', falta: [], pide: [] })
  assert.doesNotMatch(solo, /3\.|Le falta/)
  assert.match(solo, /que compartió alguien/)
})
