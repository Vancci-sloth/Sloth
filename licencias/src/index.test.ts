import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { deTodos, esFundador, faltaAvisar, firmaDeMercadoPago, instaladorDe, leerPagos, rangoDe, sobran, tarifa, vigencia } from './index.ts'

const SECRETO = 'secreto-de-prueba'
const firmar = (manifiesto: string) => createHmac('sha256', SECRETO).update(manifiesto).digest('hex')

test('acepta el aviso firmado por Mercado Pago, con el data.id alfanumérico en minúsculas', async () => {
  const v1 = firmar('id:2c938084abc;request-id:req-1;ts:1700000000;')
  assert.equal(await firmaDeMercadoPago(`ts=1700000000,v1=${v1}`, 'req-1', '2C938084ABC', SECRETO), true)
})

test('rechaza un aviso sin firma, con otra firma o sin la clave secreta', async () => {
  const v1 = firmar('id:123;request-id:req-1;ts:1700000000;')
  assert.equal(await firmaDeMercadoPago(null, 'req-1', '123', SECRETO), false)
  assert.equal(await firmaDeMercadoPago(`ts=1700000000,v1=${v1}`, 'req-2', '123', SECRETO), false)
  assert.equal(await firmaDeMercadoPago(`ts=1700000001,v1=${v1}`, 'req-1', '123', SECRETO), false)
  assert.equal(await firmaDeMercadoPago(`ts=1700000000,v1=${v1}`, 'req-1', '123', undefined), false)
  assert.equal(await firmaDeMercadoPago(`ts=1700000000,v1=${v1}00`, 'req-1', '123', SECRETO), false)
})

test('autorizada abre una semana sin conexión; cancelada, hasta el fin de lo pagado; pendiente, no', () => {
  const ahora = Date.parse('2026-10-21T12:00:00Z')
  const dia = 24 * 3600_000
  assert.deepEqual(vigencia({ estado: 'authorized', pagado_hasta: '2026-11-21T12:00:00Z' }, ahora), { activa: true, hasta: ahora + 7 * dia })
  assert.deepEqual(vigencia({ estado: 'cancelled', pagado_hasta: '2026-10-24T12:00:00Z' }, ahora), { activa: true, hasta: ahora + 3 * dia })
  assert.deepEqual(vigencia({ estado: 'cancelled', pagado_hasta: '2026-11-21T12:00:00Z' }, ahora), { activa: true, hasta: ahora + 7 * dia })
  assert.deepEqual(vigencia({ estado: 'cancelled', pagado_hasta: '2026-10-20T12:00:00Z' }, ahora), { activa: false, hasta: ahora })
  assert.deepEqual(vigencia({ estado: 'pending', pagado_hasta: null }, ahora), { activa: false, hasta: ahora })
})

test('lee los rangos que pide el navegador al retomar una descarga', () => {
  assert.deepEqual(rangoDe('bytes=100-199', 1000), { offset: 100, length: 100 })
  assert.deepEqual(rangoDe('bytes=900-', 1000), { offset: 900, length: 100 })
  assert.deepEqual(rangoDe('bytes=-50', 1000), { offset: 950, length: 50 })
  assert.deepEqual(rangoDe('bytes=990-5000', 1000), { offset: 990, length: 10 })
  assert.equal(rangoDe(null, 1000), undefined)
  assert.equal(rangoDe('bytes=0-1,5-9', 1000), undefined)
  assert.equal(rangoDe('bytes=2000-', 1000), undefined)
})

test('avisa del cobro cuando faltan 7 días o menos, una sola vez por cobro', () => {
  const ahora = Date.parse('2026-11-15T15:00:00Z')
  const cobro = '2026-11-21T14:58:42.000-04:00'
  assert.equal(faltaAvisar({ estado: 'authorized', pagado_hasta: cobro, avisado_para: null }, ahora), true)
  assert.equal(faltaAvisar({ estado: 'authorized', pagado_hasta: cobro, avisado_para: cobro }, ahora), false)
  assert.equal(faltaAvisar({ estado: 'authorized', pagado_hasta: cobro, avisado_para: null }, Date.parse('2026-11-10T15:00:00Z')), false)
  assert.equal(faltaAvisar({ estado: 'cancelled', pagado_hasta: cobro, avisado_para: null }, ahora), false)
  assert.equal(faltaAvisar({ estado: 'authorized', pagado_hasta: '2026-11-01T00:00:00Z', avisado_para: null }, ahora), false)
})

test('cada pago del año que vale suma un año desde que se aprobó, o desde que acaba lo pagado si se renueva antes', () => {
  const f = { monto: 2990, preferencia: 'pref-1' }
  const pago = (status: string, date_approved: string | null, transaction_amount = 2990, currency_id = 'MXN') => ({ status, date_approved, transaction_amount, currency_id })
  assert.deepEqual(leerPagos([pago('approved', '2026-10-28T10:00:00.000-06:00')], f), { id: 'pref-1', estado: 'pagado', hasta: '2027-10-28T16:00:00.000Z' })
  // Renovado una semana antes de que se acabe: el año nuevo empieza cuando acaba el primero.
  assert.equal(leerPagos([pago('approved', '2027-10-21T16:00:00Z'), pago('approved', '2026-10-28T16:00:00Z')], f).hasta, '2028-10-28T16:00:00.000Z')
  // Renovado cuando ya se había acabado: el año nuevo empieza ese día.
  assert.equal(leerPagos([pago('approved', '2026-10-28T16:00:00Z'), pago('approved', '2028-01-10T16:00:00Z')], f).hasta, '2029-01-10T16:00:00.000Z')
  // En reclamo sigue valiendo; reembolsado o con contracargo, ya no.
  assert.equal(leerPagos([pago('in_mediation', '2026-10-28T16:00:00Z')], f).estado, 'pagado')
  assert.deepEqual(leerPagos([pago('refunded', '2026-10-28T16:00:00Z')], f), { id: 'pref-1', estado: 'cancelled' })
  assert.deepEqual(leerPagos([pago('charged_back', '2026-10-28T16:00:00Z'), pago('approved', '2027-10-28T16:00:00Z')], f).hasta, '2028-10-28T16:00:00.000Z')
  // Una ficha de OXXO sin pagar, o nada todavía: espera el pago.
  assert.deepEqual(leerPagos([pago('pending', null)], f), { id: 'pref-1', estado: 'pending' })
  assert.deepEqual(leerPagos([], f), { id: 'pref-1', estado: 'pending' })
  // Uno de menos o en otra moneda no cuenta.
  assert.equal(leerPagos([pago('approved', '2026-10-28T16:00:00Z', 299)], f).estado, 'pending')
  assert.equal(leerPagos([pago('approved', '2026-10-28T16:00:00Z', 2990, 'USD')], f).estado, 'pending')
})

test('un año pagado de una vez abre hasta su fin y avisa antes de que se acabe, una sola vez', () => {
  const ahora = Date.parse('2027-10-21T12:00:00Z')
  const fin = '2027-10-28T16:00:00.000Z'
  assert.deepEqual(vigencia({ estado: 'pagado', pagado_hasta: fin }, ahora), { activa: true, hasta: ahora + 7 * 24 * 3600_000 })
  assert.deepEqual(vigencia({ estado: 'pagado', pagado_hasta: fin }, Date.parse('2027-10-29T00:00:00Z')), { activa: false, hasta: Date.parse('2027-10-29T00:00:00Z') })
  assert.equal(faltaAvisar({ estado: 'pagado', pagado_hasta: fin, avisado_para: null }, Date.parse('2027-10-22T15:00:00Z')), true)
  assert.equal(faltaAvisar({ estado: 'pagado', pagado_hasta: fin, avisado_para: fin }, Date.parse('2027-10-22T15:00:00Z')), false)
  assert.equal(faltaAvisar({ estado: 'pagado', pagado_hasta: fin, avisado_para: null }, Date.parse('2027-10-01T15:00:00Z')), false)
})

test('el precio es el mismo para todos; las 25 primeras personas que apoyan son fundadoras', () => {
  const env = { FUNDADORES: 25, PRECIO_MENSUAL: 299, PRECIO_ANUAL: 2990 }
  assert.deepEqual(tarifa({ fundadores: 0, apoyan: 0 }, env), { quedan: 25, mensual: 299, anual: 2990, apoyan: 0 })
  assert.deepEqual(tarifa({ fundadores: 3, apoyan: 2 }, env), { quedan: 22, mensual: 299, anual: 2990, apoyan: 2 })
  assert.deepEqual(tarifa({ fundadores: 25, apoyan: 80 }, env), { quedan: 0, mensual: 299, anual: 2990, apoyan: 80 })
  // Con la fecha de fundadores ya pasada, no queda ninguno.
  assert.equal(tarifa({ fundadores: 0, apoyan: 0 }, { ...env, FUNDADORES_HASTA: '2026-01-01T00:00:00Z' }).quedan, 0)
})

test('un lugar gratis abre siempre; quitado (cancelled, sin nada pagado), ya no', () => {
  const ahora = Date.parse('2026-10-21T12:00:00Z')
  assert.deepEqual(vigencia({ estado: 'gratis', pagado_hasta: null }, ahora), { activa: true, hasta: ahora + 7 * 24 * 3600_000 })
  assert.deepEqual(vigencia({ estado: 'cancelled', pagado_hasta: null }, ahora), { activa: false, hasta: ahora })
})

test('son fundadoras para siempre los primeros apoyos pagados y los lugares gratis de por vida que siguen en pie', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE licencias (id TEXT, plan TEXT, estado TEXT, fundador INTEGER, autorizada TEXT)')
  const filas = [
    ['primer-apoyo', 'mensual', 'cancelled', 1, '2026-09-01'],
    ['apoyo-sin-pagar', 'mensual', 'pending', 1, null],
    ['apoyo-de-despues', 'anual', 'authorized', 0, '2026-10-01'],
    ['gratis-de-por-vida', 'gratis', 'gratis', 0, '2026-08-01'],
    ['gratis-quitado', 'gratis', 'cancelled', 0, '2026-08-01'],
    ['cuenta-gratis', 'cuenta', 'gratis', 0, '2026-10-01']
  ]
  for (const f of filas) db.prepare('INSERT INTO licencias VALUES (?, ?, ?, ?, ?)').run(...f)
  const fundadoras = db.prepare(`SELECT l.id FROM licencias l WHERE ${esFundador('l')} ORDER BY l.id`).all().map((f) => f.id)
  assert.deepEqual(fundadoras, ['gratis-de-por-vida', 'primer-apoyo'])
})

test('reconoce el instalador de cada sistema, y nada más pasa por la última versión', () => {
  assert.equal(instaladorDe('Sloth-Setup-0.3.4.exe'), 'windows')
  assert.equal(instaladorDe('Sloth-0.3.4-mac-arm64.dmg'), 'mac')
  assert.equal(instaladorDe('Sloth-0.3.4-linux-x86_64.AppImage'), 'linux')
  assert.equal(instaladorDe('Sloth-0.3.4-mac-arm64.zip'), undefined)
  assert.equal(instaladorDe('Sloth-0.3.4-mac-arm64.dmg.blockmap'), undefined)
  assert.equal(instaladorDe('latest-mac.yml'), undefined)
  assert.equal(instaladorDe('Sloth-0.3.4-linux-x86_64.AppImage/../x'), undefined)
})

test('al publicar se borran los instaladores de más, pero no el de la versión que aún se da a quien no apoya', () => {
  const de = (v: string, dia: number) => ({ key: `Sloth-Setup-${v}.exe`, uploaded: new Date(2026, 9, dia) })
  const r2 = [de('0.3.31', 28), de('0.3.30', 27), de('0.3.29', 26), de('0.3.28', 25), de('0.3.27', 24)]
  assert.deepEqual(sobran(r2, []), ['Sloth-Setup-0.3.28.exe', 'Sloth-Setup-0.3.27.exe'])
  assert.deepEqual(sobran(r2, ['0.3.28']), ['Sloth-Setup-0.3.27.exe'])
  assert.deepEqual(sobran(r2, ['0.3.2']), ['Sloth-Setup-0.3.28.exe', 'Sloth-Setup-0.3.27.exe'])
})

test('una versión nueva es de quien apoya hasta su fecha `todos`; las de antes, sin ella, ya son de todos', () => {
  const ahora = Date.parse('2026-11-01T12:00:00Z')
  assert.equal(deTodos({}, ahora), true)
  assert.equal(deTodos({ todos: '2026-11-05T12:00:00Z' }, ahora), false)
  assert.equal(deTodos({ todos: '2026-11-01T12:00:00Z' }, ahora), true)
})
