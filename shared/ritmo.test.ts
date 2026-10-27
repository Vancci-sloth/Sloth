import assert from 'node:assert/strict'
import { test } from 'node:test'
import { huecos, resumenRitmo, tocaElDia, validarRitmo } from './ritmo.ts'
import type { Ritmo } from './types.ts'

const cinco: Ritmo = { porDia: 5, cadaDias: 1, inicio: '2026-10-01', desde: '12:00', cadaMin: 60 }
const manana = new Date('2026-10-27T09:00').getTime()

test('llena el día por orden y no deja un hueco vacío por delante', () => {
  assert.deepEqual(huecos(cinco, 3, ['2026-10-27 13:00'], manana), ['2026-10-27 12:00', '2026-10-27 14:00', '2026-10-27 15:00'])
  // Lo que ya pasó de hoy no cuenta como hueco.
  assert.deepEqual(huecos(cinco, 2, [], new Date('2026-10-27T15:30').getTime()), ['2026-10-27 16:00', '2026-10-28 12:00'])
})

test('cada cuántos días cuenta desde el inicio', () => {
  const dos: Ritmo = { ...cinco, porDia: 2, cadaDias: 3, inicio: '2026-10-26' }
  assert.ok(tocaElDia(dos, '2026-10-29'))
  assert.ok(!tocaElDia(dos, '2026-10-27'))
  // Antes del inicio también: el ritmo sigue hacia atrás.
  assert.ok(tocaElDia(dos, '2026-10-23'))
  assert.deepEqual(huecos(dos, 3, [], manana), ['2026-10-29 12:00', '2026-10-29 13:00', '2026-11-01 12:00'])
})

test('un día con más de los de ahora (de un ritmo de antes) ya está lleno', () => {
  const dos: Ritmo = { ...cinco, porDia: 2 }
  // Hoy ya tiene dos a otras horas: el siguiente va mañana.
  assert.deepEqual(huecos(dos, 1, ['2026-10-27 15:00', '2026-10-27 16:00'], manana), ['2026-10-28 12:00'])
})

test('lo que se guarda se revisa', () => {
  assert.throws(() => validarRitmo({ ...cinco, porDia: 0 }, cinco), /Videos por día/)
  assert.throws(() => validarRitmo({ ...cinco, desde: '22:00', porDia: 3 }, cinco), /medianoche/)
  assert.throws(() => validarRitmo({ ...cinco, desde: '25:00' }, cinco), /hora/)
  // Sin `inicio`, se queda el de antes si no cambian los días.
  assert.equal(validarRitmo({ ...cinco, inicio: undefined, porDia: 2 }, cinco).inicio, '2026-10-01')
  assert.equal(resumenRitmo(validarRitmo({ ...cinco, porDia: 2, cadaDias: 3, cadaMin: 360 }, cinco)), '2 cada 3 días, de 12:00 a 18:00')
  assert.equal(resumenRitmo({ ...cinco, porDia: 1 }), '1 al día, a las 12:00')
})
