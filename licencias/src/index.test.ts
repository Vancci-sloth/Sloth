import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { CUPO, VIGILAR, comunidadCaida, deTodos, esFundador, faltaAvisar, firmaDeMercadoPago, firmaDeNowpayments, esTopeDeD1, hastaAMano, instaladorDe, leerPagos, leerPaypal, liberada, mensualRechazado, montoDe, rangoDe, reenviarClaves, sistema, sistemaDelYml, sobran, tarifa, vigencia } from './index.ts'
import { DE_LA_APP } from './comunidad.ts'

test('un apoyo a mano suma sus meses desde lo ya pagado, o desde hoy si ya se acabó', () => {
  const hoy = Date.parse('2026-11-06T12:00:00Z')
  assert.equal(hastaAMano(null, 1, hoy), '2026-12-06T12:00:00.000Z')
  assert.equal(hastaAMano('2026-12-06T12:00:00.000Z', 2, hoy), '2027-02-06T12:00:00.000Z')
  assert.equal(hastaAMano('2026-10-01T00:00:00.000Z', 1, hoy), '2026-12-06T12:00:00.000Z')
  assert.equal(hastaAMano('2026-12-06T12:00:00.000Z', 0, hoy), '2026-12-06T12:00:00.000Z')
})

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
  const f = { monto: 2990, moneda: 'MXN', plan: 'anual' as const }
  const pago = (status: string, date_approved: string | null, transaction_amount = 2990, currency_id = 'MXN') => ({ status, date_approved, transaction_amount, currency_id })
  assert.deepEqual(leerPagos([pago('approved', '2026-10-28T10:00:00.000-06:00')], f), { estado: 'pagado', hasta: '2027-10-28T16:00:00.000Z' })
  // Renovado una semana antes de que se acabe: el año nuevo empieza cuando acaba el primero.
  assert.equal(leerPagos([pago('approved', '2027-10-21T16:00:00Z'), pago('approved', '2026-10-28T16:00:00Z')], f).hasta, '2028-10-28T16:00:00.000Z')
  // Renovado cuando ya se había acabado: el año nuevo empieza ese día.
  assert.equal(leerPagos([pago('approved', '2026-10-28T16:00:00Z'), pago('approved', '2028-01-10T16:00:00Z')], f).hasta, '2029-01-10T16:00:00.000Z')
  // En reclamo sigue valiendo; reembolsado o con contracargo, ya no.
  assert.equal(leerPagos([pago('in_mediation', '2026-10-28T16:00:00Z')], f).estado, 'pagado')
  assert.deepEqual(leerPagos([pago('refunded', '2026-10-28T16:00:00Z')], f), { estado: 'cancelled' })
  assert.deepEqual(leerPagos([pago('charged_back', '2026-10-28T16:00:00Z'), pago('approved', '2027-10-28T16:00:00Z')], f).hasta, '2028-10-28T16:00:00.000Z')
  // Un cobro pendiente, o nada todavía: espera el pago.
  assert.deepEqual(leerPagos([pago('pending', null)], f), { estado: 'pending' })
  assert.deepEqual(leerPagos([], f), { estado: 'pending' })
  // Uno de menos o en otra moneda no cuenta.
  assert.equal(leerPagos([pago('approved', '2026-10-28T16:00:00Z', 299)], f).estado, 'pending')
  assert.equal(leerPagos([pago('approved', '2026-10-28T16:00:00Z', 2990, 'USD')], f).estado, 'pending')
  // El año en dólares se paga en dólares: 150 USD valen, 150 pesos no.
  const enDolares = { monto: 150, moneda: 'USD', plan: 'anual' as const }
  assert.equal(leerPagos([pago('approved', '2026-10-30T16:00:00Z', 150, 'USD')], enDolares).estado, 'pagado')
  assert.equal(leerPagos([pago('approved', '2026-10-30T16:00:00Z', 150, 'MXN')], enDolares).estado, 'pending')
})

test('el apoyo de una vez vale un mes por pago, con el monto que se eligió', () => {
  const f = { monto: 7, moneda: 'USD', plan: 'unico' as const }
  const pago = (date_approved: string, transaction_amount = 7) => ({ status: 'approved', date_approved, transaction_amount, currency_id: 'USD' })
  assert.deepEqual(leerPagos([pago('2026-11-04T16:00:00Z')], f), { estado: 'pagado', hasta: '2026-12-04T16:00:00.000Z' })
  // Apoyar otra vez antes de que se acabe: el mes nuevo empieza cuando acaba el primero.
  assert.equal(leerPagos([pago('2026-11-04T16:00:00Z'), pago('2026-11-30T16:00:00Z')], f).hasta, '2027-01-04T16:00:00.000Z')
  assert.equal(leerPagos([pago('2026-11-04T16:00:00Z', 6)], f).estado, 'pending')
})

test('el mensual con cripto, pagado de una vez, vale un mes por pago', () => {
  const f = { monto: 15, moneda: 'USD', plan: 'mensual' as const }
  const pago = (date_approved: string) => ({ status: 'approved', date_approved, transaction_amount: 15, currency_id: 'USD' })
  assert.deepEqual(leerPagos([pago('2026-11-04T16:00:00Z')], f), { estado: 'pagado', hasta: '2026-12-04T16:00:00.000Z' })
  assert.equal(leerPagos([pago('2026-11-04T16:00:00Z'), pago('2026-11-28T16:00:00Z')], f).hasta, '2027-01-04T16:00:00.000Z')
})

test('acepta el aviso firmado por NOWPayments, con las llaves en orden, también las de adentro', async () => {
  const aviso = { payment_status: 'finished', payment_id: 5077125051, order_id: 'fila', price_amount: 15, fee: { depositFee: 0, currency: 'usdttrc20' } }
  const ordenado = '{"fee":{"currency":"usdttrc20","depositFee":0},"order_id":"fila","payment_id":5077125051,"payment_status":"finished","price_amount":15}'
  const firma = createHmac('sha512', SECRETO).update(ordenado).digest('hex')
  assert.equal(await firmaDeNowpayments(aviso, firma, SECRETO), true)
  assert.equal(await firmaDeNowpayments(aviso, firma.toUpperCase(), ` ${SECRETO} `), true)
  assert.equal(await firmaDeNowpayments({ ...aviso, price_amount: 150 }, firma, SECRETO), false)
  assert.equal(await firmaDeNowpayments(aviso, null, SECRETO), false)
  assert.equal(await firmaDeNowpayments(aviso, firma, undefined), false)
})

test('el mensual va con el sugerido o con el monto que se elija; el anual, siempre con su precio', () => {
  const p = { mensual: 15, anual: 150, minimo: 1, maximo: 1000, moneda: 'USD' }
  assert.equal(montoDe('mensual', undefined, p), 15)
  assert.equal(montoDe('mensual', 30, p), 30)
  assert.equal(montoDe('mensual', '1', p), 1)
  assert.equal(montoDe('unico', 250, p), 250)
  assert.equal(montoDe('anual', 5, p), 150)
  for (const malo of [0, 0.5, 2.5, -3, 1001, 'diez', null, undefined]) assert.throws(() => montoDe('unico', malo, p), /monto entero de \$1 a \$1,000 USD/)
  assert.throws(() => montoDe('mensual', 0, p))
  // En pesos, con Mercado Pago: desde $20 hasta $20,000.
  const mxn = { mensual: 299, anual: 2990, minimo: 20, maximo: 20000, moneda: 'MXN' }
  assert.equal(montoDe('mensual', undefined, mxn), 299)
  assert.equal(montoDe('unico', 5000, mxn), 5000)
  assert.throws(() => montoDe('unico', 19, mxn), /monto entero de \$20 a \$20,000 MXN/)
})

test('una suscripción de PayPal se lee con los estados de Mercado Pago; solo activa dice su próximo cobro', () => {
  const cobro = { next_billing_time: '2026-11-29T10:00:00Z' }
  assert.deepEqual(leerPaypal({ status: 'ACTIVE', billing_info: cobro }), { estado: 'authorized', hasta: '2026-11-29T10:00:00Z' })
  assert.deepEqual(leerPaypal({ status: 'APPROVAL_PENDING' }), { estado: 'pending', hasta: undefined })
  assert.deepEqual(leerPaypal({ status: 'APPROVED' }), { estado: 'pending', hasta: undefined })
  assert.deepEqual(leerPaypal({ status: 'SUSPENDED', billing_info: cobro }), { estado: 'paused', hasta: undefined })
  assert.equal(leerPaypal({ status: 'CANCELLED', billing_info: cobro }).estado, 'cancelled')
  assert.equal(leerPaypal({ status: 'EXPIRED' }).estado, 'cancelled')
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
  const env = {
    FUNDADORES: 25,
    PRECIO_MENSUAL: 15,
    PRECIO_ANUAL: 150,
    APOYO_MINIMO: 1,
    APOYO_GRANDE: 30,
    MONEDA: 'USD',
    PRECIO_MENSUAL_MXN: 299,
    PRECIO_ANUAL_MXN: 2990,
    APOYO_MINIMO_MXN: 20,
    APOYO_GRANDE_MXN: 599
  }
  const precio = { mensual: 15, anual: 150, minimo: 1, grande: 30, maximo: 1000, moneda: 'USD' }
  assert.deepEqual(tarifa({ fundadores: 0, apoyan: 0 }, env), { quedan: 25, ...precio, apoyan: 0 })
  assert.deepEqual(tarifa({ fundadores: 3, apoyan: 2 }, env), { quedan: 22, ...precio, apoyan: 2 })
  assert.deepEqual(tarifa({ fundadores: 25, apoyan: 80 }, env), { quedan: 0, ...precio, apoyan: 80 })
  // Con la fecha de fundadores ya pasada, no queda ninguno.
  assert.equal(tarifa({ fundadores: 0, apoyan: 0 }, { ...env, FUNDADORES_HASTA: '2026-01-01T00:00:00Z' }).quedan, 0)
  // Con Mercado Pago, los mismos en pesos.
  assert.deepEqual(tarifa({ fundadores: 0, apoyan: 0 }, env, true).mxn, { mensual: 299, anual: 2990, minimo: 20, grande: 599, maximo: 20000, moneda: 'MXN' })
})

test('un lugar gratis abre siempre; quitado (cancelled, sin nada pagado), ya no', () => {
  const ahora = Date.parse('2026-10-21T12:00:00Z')
  assert.deepEqual(vigencia({ estado: 'gratis', pagado_hasta: null }, ahora), { activa: true, hasta: ahora + 7 * 24 * 3600_000 })
  assert.deepEqual(vigencia({ estado: 'cancelled', pagado_hasta: null }, ahora), { activa: false, hasta: ahora })
})

test('son fundadoras los apoyos de Fundador pagados mientras no venzan y los lugares gratis de por vida que siguen en pie', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE licencias (id TEXT, plan TEXT, estado TEXT, fundador INTEGER, autorizada TEXT, terminos TEXT, pagado_hasta TEXT)')
  const filas = [
    ['fundador-que-se-fue', 'mensual', 'cancelled', 1, '2026-09-01', '2026-10-21', '2026-10-01'],
    ['apoyo-sin-pagar', 'mensual', 'pending', 1, null, '2026-10-21', null],
    ['apoyo-de-despues', 'anual', 'authorized', 0, '2026-10-01', '2026-10-21', '2099-01-01'],
    ['fundador-al-dia', 'mensual', 'authorized', 1, '2026-11-07', '2026-11-06', '2099-01-01'],
    ['fundador-de-una-vez', 'unico', 'pagado', 1, '2026-11-07', '2026-11-06', '2099-01-01'],
    ['gratis-de-por-vida', 'gratis', 'gratis', 0, '2026-08-01', null, null],
    ['gratis-quitado', 'gratis', 'cancelled', 0, '2026-08-01', null, null],
    ['cuenta-gratis', 'cuenta', 'gratis', 0, '2026-10-01', null, null]
  ]
  for (const f of filas) db.prepare('INSERT INTO licencias VALUES (?, ?, ?, ?, ?, ?, ?)').run(...f)
  const fundadoras = db.prepare(`SELECT l.id FROM licencias l WHERE ${esFundador('l')} ORDER BY l.id`).all().map((f) => f.id)
  assert.deepEqual(fundadoras, ['fundador-al-dia', 'fundador-de-una-vez', 'gratis-de-por-vida'])
})

test('reconoce el instalador de cada sistema, y nada más pasa por la última versión', () => {
  assert.equal(instaladorDe('Sloth-Setup-0.3.4.exe'), 'windows')
  assert.equal(instaladorDe('Sloth-0.3.4-mac-x64.dmg'), 'mac')
  assert.equal(instaladorDe('Sloth-0.3.4-mac-arm64.dmg'), 'mac-arm64')
  assert.equal(instaladorDe('Sloth-0.3.4-mac12-x64.dmg'), 'mac12')
  assert.equal(instaladorDe('Sloth-0.3.4-mac12-x64.zip'), undefined)
  assert.equal(instaladorDe('Sloth-0.3.4-mac12-arm64.dmg'), undefined)
  assert.equal(instaladorDe('Sloth-0.3.4-linux-x86_64.AppImage'), 'linux')
  assert.equal(instaladorDe('Sloth-0.3.4-mac-arm64.zip'), undefined)
  assert.equal(instaladorDe('Sloth-0.3.4-mac-arm64.dmg.blockmap'), undefined)
  assert.equal(instaladorDe('latest-mac.yml'), undefined)
  assert.equal(instaladorDe('Sloth-0.3.4-linux-x86_64.AppImage/../x'), undefined)
})

test('cada Mac tiene su sistema: la de Apple Silicon y la de macOS 12, su última y su latest.yml', () => {
  assert.equal(sistema('mac'), 'mac')
  assert.equal(sistema('mac-arm64'), 'mac-arm64')
  assert.equal(sistema('mac12'), 'mac12')
  assert.equal(sistema('linux'), 'linux')
  assert.equal(sistema(null), 'windows')
  assert.equal(sistema('toString'), 'windows')
  assert.equal(sistemaDelYml('latest.yml'), 'windows')
  assert.equal(sistemaDelYml('latest-mac.yml'), 'mac')
  assert.equal(sistemaDelYml('latest-arm64-mac.yml'), 'mac-arm64')
  assert.equal(sistemaDelYml('latest-mac12-mac.yml'), 'mac12')
  assert.equal(sistemaDelYml('latest-linux.yml'), 'linux')
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

test('liberar en un live da a todos ya la versión que aún era de quien apoya; la que ya era de todos no cambia', () => {
  const ahora = new Date().toISOString()
  const pendiente = { version: '0.3.20', todos: new Date(Date.now() + 5 * 864e5).toISOString() }
  assert.deepEqual(liberada(pendiente, ahora), { version: '0.3.20', todos: ahora })
  assert.equal(deTodos(liberada(pendiente, ahora)), true)
  const yaDeTodos = { version: '0.3.19', todos: '2026-10-01T12:00:00Z' }
  assert.equal(liberada(yaDeTodos, ahora), yaDeTodos)
  const deAntes = { version: '0.3.2' }
  assert.equal(liberada(deAntes, ahora), deAntes)
})

test('el cupo del día no deja pasar de su máximo, y cada quien tiene el suyo', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0012_cupos.sql', import.meta.url), 'utf8'))
  const ahora = Date.parse('2026-11-03T19:48:00Z')
  const anotar = (quien: string, max: number, cuando = ahora) =>
    db.prepare(CUPO).run(quien, 'publicaciones', new Date(cuando).toISOString(), new Date(cuando - 24 * 3600_000).toISOString(), max).changes > 0
  const hechas = Array.from({ length: 15 }, () => anotar('probe', 10))
  assert.equal(hechas.filter(Boolean).length, 10)
  // Otro miembro tiene su propio cupo; lo de hace más de un día ya no cuenta.
  assert.equal(anotar('otro', 10), true)
  assert.equal(anotar('probe', 10, ahora + 25 * 3600_000), true)
})

test('lo sospechoso se avisa una vez por semana de cada cosa, y solo lo inventado no viene de la app', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0014_vigilados.sql', import.meta.url), 'utf8'))
  const ahora = Date.parse('2026-11-05T19:00:00Z')
  const avisar = (tipo: string, dias: number) => {
    const cuando = ahora + dias * 24 * 3600_000
    return db.prepare(VIGILAR).run('probe@x.com', tipo, 'motivo', new Date(cuando).toISOString(), new Date(cuando - 7 * 24 * 3600_000).toISOString()).changes > 0
  }
  assert.equal(avisar('vigilada', 0), true)
  assert.equal(avisar('vigilada', 3), false)
  assert.equal(avisar('bloqueada', 3), true)
  assert.equal(avisar('vigilada', 8), true)
  assert.equal(DE_LA_APP.test('3f9a0c1e7b2d4a6f8e0c1b3d5f7a9c2e'), true)
  assert.equal(DE_LA_APP.test('0f8fad5b-d9cb-469f-a165-70867728950e'), true)
  assert.equal(DE_LA_APP.test('tu-probe-equipo-001'), false)
})

test('el cobro de cada mes rechazado dice por qué, sin hablar del «+»', () => {
  // Lo que contesta Mercado Pago a un correo con cuenta suya de otro país.
  assert.match(mensualRechazado('Payer is associated with a different site'), /otro país.*Elige «Tarjeta»/)
  assert.match(mensualRechazado('Invalid payer_email'), /no aceptó ese correo/)
  assert.match(mensualRechazado('Algo nuevo'), /no pudo abrir el cobro de cada mes/)
  for (const m of ['Payer is associated with a different site', 'Invalid payer_email', 'Algo nuevo']) assert.doesNotMatch(mensualRechazado(m), /\+/)
})

test('la clave que no salió se reintenta hasta que Resend la acepta, y a la hora se avisa a soporte una vez', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE licencias (id TEXT, clave TEXT, email TEXT, plan TEXT, monto REAL, moneda TEXT, estado TEXT, pagado_hasta TEXT, autorizada TEXT, preapproval TEXT, clave_enviada TEXT)')
  const ahora = Date.parse('2026-11-06T05:05:00Z')
  const hace = (min: number) => new Date(ahora - min * 60_000).toISOString()
  const filas = [
    ['sin-mandar', 'mensual', hace(30), null],
    ['sin-mandar-hace-una-hora', 'mensual', hace(65), null],
    ['recien-pagada', 'mensual', hace(1), null],
    ['ya-mandada', 'mensual', hace(30), hace(30)],
    ['de-hace-una-semana', 'mensual', hace(7 * 24 * 60), null],
    ['cuenta-gratis', 'cuenta', hace(30), null]
  ]
  for (const [id, plan, autorizada, enviada] of filas)
    db.prepare("INSERT INTO licencias VALUES (?, 'SLOTH-X', ?, ?, 20, 'MXN', 'authorized', '2026-12-06', ?, 'pre', ?)").run(id, `${id}@x.com`, plan, autorizada, enviada)
  // D1 con la misma forma que usa el Worker: prepare(sql).bind(...).all/first/run.
  const DB = {
    prepare: (sql: string) => {
      const consulta = (args: unknown[]) => ({
        bind: (...mas: unknown[]) => consulta([...args, ...mas]),
        all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
        first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
        run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
      })
      return consulta([])
    }
  }
  const mandados: { to: string[]; subject: string }[] = []
  const antes = globalThis.fetch
  let resendCaido = true
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const c = JSON.parse(String(init.body))
    if (resendCaido && c.to[0] !== 'soporte@x.com') return new Response('{"message":"no"}', { status: 422 })
    mandados.push(c)
    return new Response('{"id":"1"}')
  }) as typeof fetch
  try {
    const env = { DB, RESEND_API_KEY: 're_x', CORREO_DE: 'Sloth <a@x.com>', CORREO_RESPUESTA: 'soporte@x.com', ORIGEN: 'https://x' } as never
    await reenviarClaves(env, ahora)
    // Resend rechaza: solo sale el aviso a soporte, de la que ya lleva una hora.
    assert.deepEqual(mandados.map((m) => m.subject), ['No salió la clave de sin-mandar-hace-una-hora@x.com'])
    resendCaido = false
    mandados.length = 0
    await reenviarClaves(env, ahora + 10 * 60_000)
    assert.deepEqual(mandados.map((m) => m.to[0]).sort(), ['recien-pagada@x.com', 'sin-mandar-hace-una-hora@x.com', 'sin-mandar@x.com'])
    mandados.length = 0
    await reenviarClaves(env, ahora + 20 * 60_000)
    assert.deepEqual(mandados, [])
  } finally {
    globalThis.fetch = antes
  }
})

test('con D1 en su tope, la comunidad dice a qué hora vuelve y manda al grupo de WhatsApp', () => {
  assert.ok(esTopeDeD1(new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan")))
  assert.ok(!esTopeDeD1(new Error('D1_ERROR: no such table: votos')))
  // Medianoche UTC son las 6 de la tarde en el centro de México, el mismo día o, pasada la medianoche UTC, el siguiente.
  const texto = comunidadCaida(new Date('2026-11-08T18:58:00Z'))
  assert.match(texto, /a las 6:00 p\.\s?m\./)
  assert.match(texto, /https:\/\/chat\.whatsapp\.com\/KXzXmw8yPLYKlTJHGuVSXd/)
})
