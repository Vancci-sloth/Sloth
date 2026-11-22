import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FondoComunidad } from '../../shared/types.ts'
import { avanceDe, noticiaDe, subioDe, vistoDe } from './fondoNoticia.ts'

const HORA = 3_600_000
const DIA = 24 * HORA
// El primer reparto: cuenta desde el 15 de noviembre y se reparte el 1 de enero (00:00 en Ciudad de México).
const fondo = (mxn: number, extra: Partial<FondoComunidad> = {}): FondoComunidad => ({
  periodo: '2027-01',
  mes: 'noviembre y diciembre de 2026',
  primero: true,
  desde: '2026-11-15T06:00:00.000Z',
  montos: mxn ? [{ moneda: 'MXN', monto: mxn }] : [],
  cuentas: [],
  cierra: '2027-01-01T06:00:00.000Z',
  ...extra
})
const HOY = Date.parse('2026-11-19T18:00:00.000Z')

test('la primera vez de un reparto, el fondo sale en grande; cerrado, queda en el renglón', () => {
  assert.deepEqual(noticiaDe(fondo(632.98), null, HOY), { tipo: 'nuevo' })
  const visto = vistoDe(fondo(632.98), HOY)
  assert.equal(noticiaDe(fondo(632.98), visto, HOY + 5 * DIA), null)
  // Otro reparto vuelve a ser noticia.
  assert.deepEqual(noticiaDe(fondo(40, { periodo: '2027-02', cierra: '2027-02-01T06:00:00.000Z', desde: undefined, primero: undefined }), visto, HOY + 50 * DIA), { tipo: 'nuevo' })
})

test('una subida chica la dice el renglón; un salto lo abre, y no más de una vez al día', () => {
  const visto = vistoDe(fondo(600), HOY)
  // Subió 5 %: no se abre, pero se sabe cuánto.
  assert.equal(noticiaDe(fondo(630), visto, HOY + 2 * DIA), null)
  assert.deepEqual(subioDe(fondo(630), visto), [{ moneda: 'MXN', monto: 30 }])
  // Subió 25 %: se abre al día siguiente, no a la hora.
  assert.equal(noticiaDe(fondo(750), visto, HOY + HORA), null)
  assert.deepEqual(noticiaDe(fondo(750), visto, HOY + DIA), { tipo: 'subio', subio: [{ moneda: 'MXN', monto: 150 }] })
  // Una moneda que no estaba cuenta entera; si bajó (una devolución), no es noticia.
  assert.deepEqual(subioDe(fondo(600, { montos: [{ moneda: 'MXN', monto: 600 }, { moneda: 'USD', monto: 12.5 }] }), visto), [{ moneda: 'USD', monto: 12.5 }])
  assert.deepEqual(subioDe(fondo(580), visto), [])
  assert.equal(noticiaDe(fondo(580), visto, HOY + 2 * DIA), null)
})

test('en los últimos tres días avisa una vez', () => {
  const visto = vistoDe(fondo(600), HOY)
  const cierra = Date.parse('2027-01-01T06:00:00.000Z')
  assert.equal(noticiaDe(fondo(600), visto, cierra - 4 * DIA), null)
  assert.deepEqual(noticiaDe(fondo(600), visto, cierra - 2 * DIA - HORA), { tipo: 'ultimos', dias: 3 })
  // Cerrado ya en esos días, no vuelve a avisar.
  assert.equal(noticiaDe(fondo(600), vistoDe(fondo(600), cierra - 2 * DIA), cierra - DIA), null)
})

test('la raya va del día en que empieza a contar al del reparto', () => {
  assert.deepEqual(avanceDe(fondo(1), Date.parse('2026-11-15T06:00:00.000Z')), { desde: '2026-11-15T06:00:00.000Z', avance: 0 })
  assert.equal(avanceDe(fondo(1), HOY).avance, 9.6)
  assert.equal(avanceDe(fondo(1), Date.parse('2027-01-02T06:00:00.000Z')).avance, 100)
  // Un reparto de un mes empieza un mes antes de su cierre.
  const febrero = fondo(1, { periodo: '2027-02', cierra: '2027-02-01T06:00:00.000Z', desde: undefined, primero: undefined })
  assert.deepEqual(avanceDe(febrero, Date.parse('2027-01-16T18:00:00.000Z')), { desde: '2027-01-01T06:00:00.000Z', avance: 50 })
})
