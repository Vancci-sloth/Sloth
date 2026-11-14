import assert from 'node:assert/strict'
import test from 'node:test'
import { accionDe, extraDe, precioEn, tiempo } from './bajar-apoyo.ts'
import { hastaConExtra, type Fila } from './index.ts'

const env = { MONEDA: 'USD', PRECIO_MENSUAL: 10, PRECIO_MENSUAL_MXN: 199 }

test('lo pagado de más con el apoyo a $10 vale como días', () => {
  const mes = { autorizada: '2026-11-06T04:00:00.000Z', pagado_hasta: '2026-12-06T04:00:00.000Z' }
  assert.equal(extraDe({ ...mes, monto: 15 }, precioEn(env, 'USD')!), 15)
  assert.equal(extraDe({ ...mes, monto: 30 }, precioEn(env, 'USD')!), 60)
  // En pesos, contra 199: 299 MXN son 15 días; 599, 60.
  assert.equal(extraDe({ ...mes, monto: 299 }, precioEn(env, 'MXN')!), 15)
  assert.equal(extraDe({ ...mes, monto: 599 }, precioEn(env, 'MXN')!), 60)
  // De $10 o menos, nada.
  assert.equal(extraDe({ ...mes, monto: 10 }, 10), 0)
  assert.equal(extraDe({ ...mes, monto: 5 }, 10), 0)
  // Dos meses pagados a $15: un mes más.
  assert.equal(extraDe({ autorizada: '2026-10-06T04:00:00.000Z', pagado_hasta: '2026-12-06T04:00:00.000Z', monto: 15 }, 10), 30)
  assert.equal(precioEn(env, 'EUR'), undefined)
})

test('el tiempo se dice en días o en meses', () => {
  assert.equal(tiempo(15), '15 días')
  assert.equal(tiempo(30), '1 mes')
  assert.equal(tiempo(60), '2 meses')
})

test('solo las suscripciones que siguen cobrando se aplazan', () => {
  assert.equal(accionDe({ estado: 'authorized', stripe: 'sub_1', paypal: null, preapproval: null, plan: 'mensual' }), 'stripe')
  assert.equal(accionDe({ estado: 'authorized', stripe: null, paypal: 'I-1', preapproval: null, plan: 'mensual' }), 'paypal')
  assert.equal(accionDe({ estado: 'authorized', stripe: null, paypal: null, preapproval: 'p', plan: 'mensual' }), 'mp')
  assert.equal(accionDe({ estado: 'cancelled', stripe: null, paypal: 'I-1', preapproval: null, plan: 'mensual' }), 'nada')
  assert.equal(accionDe({ estado: 'pagado', stripe: 'cs_1', paypal: null, preapproval: null, plan: 'unico' }), 'nada')
})

test('los días extra no se pierden al volver a leer la fila', () => {
  const base = { preferencia: null, orden: null, cripto: null, stripe: null, plan: 'mensual' } as Pick<Fila, 'preferencia' | 'orden' | 'cripto' | 'stripe' | 'plan'>
  // Una suscripción en pausa no dice su cobro: vale lo guardado. Leída, no baja de `extra_hasta`.
  const sub = { ...base, paypal: 'I-1', pagado_hasta: '2026-12-21T10:00:00.000Z', extra_dias: 15, extra_hasta: '2026-12-21T10:00:00.000Z' }
  assert.equal(hastaConExtra(sub, { estado: 'paused' }), '2026-12-21T10:00:00.000Z')
  assert.equal(hastaConExtra(sub, { estado: 'cancelled', hasta: '2026-12-06T10:00:00Z' }), '2026-12-21T10:00:00.000Z')
  assert.equal(hastaConExtra(sub, { estado: 'authorized', hasta: '2027-01-21T10:00:00Z' }), '2027-01-21T10:00:00Z')
  // Lo pagado de una vez sale de sus pagos, más los días; reembolsado, nada.
  const unico = { ...base, plan: 'unico' as const, orden: 'O-1', pagado_hasta: '2026-12-21T04:00:00.000Z', extra_dias: 15, extra_hasta: '2026-12-21T04:00:00.000Z' }
  assert.equal(hastaConExtra(unico, { estado: 'pagado', hasta: '2026-12-06T04:00:00.000Z' }), '2026-12-21T04:00:00.000Z')
  assert.equal(hastaConExtra(unico, { estado: 'pagado', hasta: '2027-01-06T04:00:00.000Z' }), '2027-01-21T04:00:00.000Z')
  assert.equal(hastaConExtra(unico, { estado: 'cancelled' }), null)
})
