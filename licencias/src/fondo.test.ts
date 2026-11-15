import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cuentasDelFondo, esPeriodo, inicioDelMes, montosDe, nombreDe, periodoFondo, periodosHasta, PRIMER_PERIODO, proporcionDeImpuesto, tramoDe } from './fondo.ts'

const cobro = (amount: number, fee: number, currency = 'usd') => ({ amount, fee, net: amount - fee, currency, reporting_category: 'charge' })

test('las cuentas: lo cobrado, menos la comisión y lo devuelto, y la mitad para la comunidad; los retiros no cuentan', () => {
  const cuentas = cuentasDelFondo([
    cobro(1500, 50),
    cobro(3000, 99),
    { amount: -1500, fee: 0, net: -1500, currency: 'usd', reporting_category: 'refund' },
    { amount: -30, fee: 0, net: -30, currency: 'usd', reporting_category: 'fee' },
    { amount: -5000, fee: 0, net: -5000, currency: 'usd', reporting_category: 'payout' },
    cobro(30000, 2000, 'mxn')
  ])
  assert.deepEqual(cuentas, [
    { moneda: 'MXN', cobrado: 300, comision: 20, devuelto: 0, impuesto: 0, neto: 280, comunidad: 140 },
    { moneda: 'USD', cobrado: 45, comision: 1.79, devuelto: 15, impuesto: 0, neto: 28.21, comunidad: 14.1 }
  ])
  assert.deepEqual(montosDe(cuentas), [
    { moneda: 'MXN', monto: 140 },
    { moneda: 'USD', monto: 14.1 }
  ])
})

test('sin el IVA: lo que fue impuesto de lo que no se devolvió se quita antes de partir a la mitad', () => {
  // $11.60 con IVA dentro y sin comisión: $1.60 son del SAT, la mitad de $10 es $5.
  const [c] = cuentasDelFondo([cobro(1160, 0)], 0.16 / 1.16)
  assert.deepEqual(c, { moneda: 'USD', cobrado: 11.6, comision: 0, devuelto: 0, impuesto: 1.6, neto: 10, comunidad: 5 })
  // Devuelto entero: ni IVA ni fondo.
  assert.deepEqual(montosDe(cuentasDelFondo([cobro(1160, 0), { amount: -1160, fee: 0, net: -1160, currency: 'usd', reporting_category: 'refund' }], 0.16 / 1.16)), [])
})

test('la parte de impuesto se pesa por lo que vale cada pago, aunque se haya pagado en otra moneda', () => {
  assert.equal(proporcionDeImpuesto([]), 0)
  // Uno de México con IVA ($15) y uno de fuera sin impuesto ($15, pagado en pesos argentinos).
  const p = proporcionDeImpuesto([
    { total: 1500, impuesto: Math.round((1500 * 16) / 116), peso: 1500 },
    { total: 2_190_000, impuesto: 0, peso: 1500 }
  ])
  assert.ok(Math.abs(p - 0.16 / 1.16 / 2) < 0.001)
  // Un total en cero no rompe la cuenta.
  assert.equal(proporcionDeImpuesto([{ total: 0, impuesto: 0, peso: 0 }]), 0)
})

test('sin cobros no sale nada', () => {
  assert.deepEqual(cuentasDelFondo([]), [])
  assert.deepEqual(cuentasDelFondo([{ amount: -500, fee: 0, net: -500, currency: 'usd', reporting_category: 'refund' }]), [])
})

test('el mes empieza a medianoche de Ciudad de México, también en enero', () => {
  assert.equal(new Date(inicioDelMes('2026-11') * 1000).toISOString(), '2026-11-01T06:00:00.000Z')
  assert.equal(new Date(inicioDelMes('2027-01') * 1000).toISOString(), '2027-01-01T06:00:00.000Z')
})

test('el primer reparto es el 1 de enero de 2027 y junta noviembre y diciembre; después, cada mes', () => {
  const iso = (s: number) => new Date(s * 1000).toISOString()
  // Todo lo de antes de enero cuenta para el primer periodo, también el 31 de diciembre por la noche en México.
  for (const cuando of ['2026-11-15T12:00:00Z', '2026-12-01T12:00:00Z', '2027-01-01T05:59:00Z']) assert.equal(periodoFondo(new Date(cuando)), PRIMER_PERIODO)
  assert.equal(periodoFondo(new Date('2027-01-01T06:00:00Z')), '2027-01')
  assert.equal(periodoFondo(new Date('2027-03-10T12:00:00Z')), '2027-03')
  assert.deepEqual([iso(tramoDe(PRIMER_PERIODO).desde), iso(tramoDe(PRIMER_PERIODO).hasta)], ['2026-11-01T06:00:00.000Z', '2027-01-01T06:00:00.000Z'])
  assert.deepEqual([iso(tramoDe('2027-01').desde), iso(tramoDe('2027-01').hasta)], ['2027-01-01T06:00:00.000Z', '2027-02-01T06:00:00.000Z'])
  assert.equal(nombreDe(PRIMER_PERIODO), 'noviembre y diciembre de 2026')
  assert.equal(nombreDe('2027-01'), 'enero de 2027')
  assert.deepEqual(periodosHasta(new Date('2026-11-20T12:00:00Z')), ['2026-12'])
  assert.deepEqual(periodosHasta(new Date('2027-02-03T12:00:00Z')), ['2026-12', '2027-01', '2027-02'])
  // Noviembre de 2026 no es un periodo aparte, ni lo que no es un mes.
  assert.deepEqual(['2026-12', '2027-01', '2026-11', '2027-13', 'x'].map(esPeriodo), [true, true, false, false, false])
})
