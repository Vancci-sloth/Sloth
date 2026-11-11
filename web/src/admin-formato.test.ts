import assert from 'node:assert/strict'
import test from 'node:test'
import { coincide, explicar, fechaCorta, planCorto, planLargo, sinAcentos } from './admin-formato.ts'

test('buscar: sin acentos ni mayúsculas, cada palabra en cualquier parte y orden', () => {
  const buscable = sinAcentos('María.López@correo.mx Apoyo mensual · 15 USD · activo')
  assert.ok(coincide(buscable, 'maria'))
  assert.ok(coincide(buscable, 'MARÍA'))
  assert.ok(coincide(buscable, 'mensual lopez'))
  assert.ok(coincide(buscable, '  '), 'sin nada escrito salen todos')
  assert.ok(!coincide(buscable, 'maria anual'))
})

test('los planes de Sloth, en español y en pocas palabras', () => {
  assert.equal(planLargo({ plan: 'mensual', estado: 'authorized', monto: 15, moneda: 'USD', fundador: 1 }), 'Apoyo mensual · 15 USD · activo · Fundador')
  assert.equal(planLargo({ plan: 'cuenta', estado: 'gratis' }), 'Cuenta gratis')
  assert.equal(planLargo({ plan: 'unico', estado: 'pending', monto: 299, moneda: 'MXN' }), 'Pago único · 299 MXN · pendiente')
  // El que sigue en pie va primero (y no la cuenta gratis), con cuántos más tiene.
  const c = { email: 'x@y.mx', licencias: [{ plan: 'cuenta', estado: 'gratis' }, { plan: 'mensual', estado: 'cancelled', monto: 15, moneda: 'USD' }, { plan: 'anual', estado: 'authorized', monto: 150, moneda: 'USD' }] }
  assert.equal(planCorto(c), 'Apoyo anual · 150 USD · activo · +2')
  assert.equal(planCorto(undefined), '—')
})

test('el porqué de un error, en español, aunque el proveedor no mande código', () => {
  assert.equal(explicar({ status: 402, codigo: 'insufficient_credits', error: 'No te quedan créditos de voz.' }), 'Sin créditos')
  assert.equal(explicar({ status: 504, codigo: null, error: null }), 'Tardó demasiado')
  assert.equal(explicar({ status: 418, codigo: null, error: 'Soy una tetera' }), 'Soy una tetera')
  assert.equal(explicar({ status: 418, codigo: null, error: null }), 'Respondió 418')
})

test('las fechas en una línea, con la hora en 24 h', () => {
  const f = fechaCorta(new Date(new Date().getFullYear(), 10, 7, 21, 36).toISOString())
  assert.match(f, /^7 nov 21:36$/)
  assert.equal(fechaCorta('no es fecha'), '—')
})
