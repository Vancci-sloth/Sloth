import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { firmaDeStripe, leerStripe } from './stripe.ts'

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
  const fin = Date.parse('2026-11-24T12:00:00Z') / 1000
  const hasta = '2026-11-24T12:00:00.000Z'
  const items = { data: [{ current_period_end: fin }] }
  assert.deepEqual(leerStripe({ id: 'sub_1', status: 'active', items }), { id: 'sub_1', estado: 'authorized', hasta })
  // Con la versión vieja de su API, el fin del periodo viene en la suscripción.
  assert.deepEqual(leerStripe({ id: 'sub_1', status: 'active', current_period_end: fin }), { id: 'sub_1', estado: 'authorized', hasta })
  // Cancelada al final del periodo: ya no se avisa del cobro, y abre hasta ese día.
  assert.deepEqual(leerStripe({ id: 'sub_1', status: 'active', cancel_at_period_end: true, items }), { id: 'sub_1', estado: 'cancelled', hasta })
  // Un cobro que Stripe reintenta: sigue abierta, sin alargar lo pagado.
  assert.deepEqual(leerStripe({ id: 'sub_1', status: 'past_due', items }), { id: 'sub_1', estado: 'authorized' })
  assert.deepEqual(leerStripe({ id: 'sub_1', status: 'incomplete', items }), { id: 'sub_1', estado: 'pending' })
  assert.deepEqual(leerStripe({ id: 'sub_1', status: 'unpaid', items }), { id: 'sub_1', estado: 'paused' })
  assert.deepEqual(leerStripe({ id: 'sub_1', status: 'canceled', items }), { id: 'sub_1', estado: 'cancelled' })
  assert.deepEqual(leerStripe({ id: 'sub_1', status: 'incomplete_expired', items }), { id: 'sub_1', estado: 'cancelled' })
})
