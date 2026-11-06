import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { leerPagos } from './index.ts'
import { firmaDeStripe, leerStripe, pagoDeSesion, type SesionStripe } from './stripe.ts'

const SECRETO = 'whsec_prueba'
const cuerpo = '{"type":"checkout.session.completed"}'
const firmar = (t: number, texto = cuerpo) => createHmac('sha256', SECRETO).update(`${t}.${texto}`).digest('hex')

test('acepta el aviso firmado por Stripe, también con varias firmas', async () => {
  const t = 1_800_000_000
  const ahora = t * 1000 + 30_000
  assert.equal(await firmaDeStripe(`t=${t},v1=${firmar(t)}`, cuerpo, SECRETO, ahora), true)
  assert.equal(await firmaDeStripe(`t=${t},v1=${'0'.repeat(64)},v1=${firmar(t)},v0=abc`, cuerpo, SECRETO, ahora), true)
})

test('rechaza un aviso sin firma, con otro cuerpo, viejo o sin el secreto', async () => {
  const t = 1_800_000_000
  const ahora = t * 1000
  assert.equal(await firmaDeStripe(null, cuerpo, SECRETO, ahora), false)
  assert.equal(await firmaDeStripe(`t=${t},v1=${firmar(t)}`, cuerpo + ' ', SECRETO, ahora), false)
  assert.equal(await firmaDeStripe(`t=${t},v1=${firmar(t)}`, cuerpo, SECRETO, ahora + 6 * 60_000), false)
  assert.equal(await firmaDeStripe(`t=${t},v1=${firmar(t)}`, cuerpo, undefined, ahora), false)
  assert.equal(await firmaDeStripe(`v1=${firmar(t)}`, cuerpo, SECRETO, ahora), false)
})

test('lee la suscripción de Stripe en los estados que entiende Sloth', () => {
  const fin = Date.parse('2026-12-06T12:00:00Z') / 1000
  const hasta = '2026-12-06T12:00:00.000Z'
  const items = { data: [{ current_period_end: fin }] }
  assert.deepEqual(leerStripe({ status: 'active', items }), { estado: 'authorized', hasta })
  // Con la versión vieja de su API, el fin del periodo viene en la suscripción.
  assert.deepEqual(leerStripe({ status: 'active', current_period_end: fin }), { estado: 'authorized', hasta })
  // Cancelada al final del periodo: ya no se avisa del cobro, y abre hasta ese día.
  assert.deepEqual(leerStripe({ status: 'active', cancel_at_period_end: true, items }), { estado: 'cancelled', hasta })
  // Un cobro que Stripe reintenta: sigue abierta, sin alargar lo pagado.
  assert.deepEqual(leerStripe({ status: 'past_due', items }), { estado: 'authorized', hasta: undefined })
  assert.deepEqual(leerStripe({ status: 'incomplete', items }), { estado: 'pending', hasta: undefined })
  assert.deepEqual(leerStripe({ status: 'unpaid', items }), { estado: 'paused', hasta: undefined })
  assert.deepEqual(leerStripe({ status: 'canceled', items }), { estado: 'cancelled', hasta: undefined })
  assert.deepEqual(leerStripe({ status: 'incomplete_expired', items }), { estado: 'cancelled', hasta: undefined })
})

const sesion = (o: Partial<SesionStripe>): SesionStripe => ({
  id: 'cs_live_1',
  status: 'complete',
  payment_status: 'paid',
  client_reference_id: 'fila',
  amount_total: 1500,
  currency: 'usd',
  payment_intent: 'pi_1',
  created: Date.parse('2026-11-06T18:00:00Z') / 1000,
  ...o
})

test('lo cobrado en una sesión va en la moneda del precio, aunque se pagara en otra', () => {
  assert.deepEqual(pagoDeSesion(sesion({})), { pago: 'cs_live_1', intento: 'pi_1', estado: 'approved', monto: 15, moneda: 'USD', aprobado: '2026-11-06T18:00:00.000Z' })
  // Con Adaptive Pricing pagó en pesos colombianos: cuenta lo que vale en dólares.
  const enCop = pagoDeSesion(sesion({ amount_total: 6_300_000, currency: 'cop', currency_conversion: { amount_total: 1500, source_currency: 'usd' } }))
  assert.equal(enCop.monto, 15)
  assert.equal(enCop.moneda, 'USD')
  assert.deepEqual(leerPagos([{ status: enCop.estado, transaction_amount: enCop.monto, currency_id: enCop.moneda, date_approved: enCop.aprobado }], { monto: 15, moneda: 'USD', plan: 'unico' }), {
    estado: 'pagado',
    hasta: '2026-12-06T18:00:00.000Z'
  })
})

test('una sesión sin pagar espera; vencida, ya no vale', () => {
  assert.equal(pagoDeSesion(sesion({ status: 'open', payment_status: 'unpaid', payment_intent: null })).estado, 'pending')
  const vencida = pagoDeSesion(sesion({ status: 'expired', payment_status: 'unpaid' }))
  assert.equal(vencida.estado, 'rejected')
  assert.equal(vencida.aprobado, null)
})
