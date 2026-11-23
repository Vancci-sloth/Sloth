// La licencia firmada dice si su correo apoya hoy (`apoya`): con eso la app cierra los estilos que instaló de la
// comunidad cuando el apoyo se acaba (`server/licencia.ts`, `sinApoyo`).
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import worker from './index.ts'

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never
const EQUIPO = '0f8fad5bd9cb469fa16570867728950e'
const manana = new Date(Date.now() + 864e5).toISOString()
const ayer = new Date(Date.now() - 864e5).toISOString()

function cobro() {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const consulta = (sql: string, args: unknown[]) => ({
    bind: (...mas: unknown[]) => consulta(sql, [...args, ...mas]),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
  })
  const FIRMA = generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
  const env = { PAYPAL_MODO: 'produccion', MONEDA: 'USD', ORIGEN: 'https://cobro.x', FIRMA, DB: { prepare: (sql: string) => consulta(sql, []) } }
  const fila = (clave: string, email: string, plan: string, estado: string, pagadoHasta: string | null) =>
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, pagado_hasta, creada, modo) VALUES (?, ?, ?, ?, 10, 0, ?, ?, '2026-11-01', 'produccion')").run(clave, clave, email, plan, estado, pagadoHasta)
  /** Lo que firma el cobro para esa clave en esta computadora. */
  const firmado = async (clave: string) => {
    const r = await worker.fetch(new Request('https://cobro.x/licencia', { method: 'POST', body: JSON.stringify({ clave, equipo: EQUIPO }) }), env as never, ctx)
    return JSON.parse(((await r.json()) as { datos: string }).datos) as { apoya?: boolean; activa: boolean; cancelarPaypal?: { hasta?: string } }
  }
  return { db, fila, firmado }
}

test('la licencia firmada dice si el correo apoya hoy, también cuando no: quien deja de pagar lo deja de hacer', async () => {
  const c = cobro()
  c.fila('SLOTH-AAAA-AAAA-AAAA-AAAA', 'mensual@x.com', 'mensual', 'authorized', manana)
  c.fila('SLOTH-BBBB-BBBB-BBBB-BBBB', 'cancelo@x.com', 'mensual', 'cancelled', manana)
  c.fila('SLOTH-CCCC-CCCC-CCCC-CCCC', 'vida@x.com', 'gratis', 'gratis', null)
  c.fila('SLOTH-DDDD-DDDD-DDDD-DDDD', 'vencio@x.com', 'mensual', 'cancelled', ayer)
  c.fila('SLOTH-EEEE-EEEE-EEEE-EEEE', 'cuenta@x.com', 'cuenta', 'gratis', null)
  assert.equal((await c.firmado('SLOTH-AAAA-AAAA-AAAA-AAAA')).apoya, true, 'al día')
  assert.equal((await c.firmado('SLOTH-BBBB-BBBB-BBBB-BBBB')).apoya, true, 'canceló, pero lo pagado no vence')
  assert.equal((await c.firmado('SLOTH-CCCC-CCCC-CCCC-CCCC')).apoya, true, 'su lugar gratis de por vida')
  assert.equal((await c.firmado('SLOTH-DDDD-DDDD-DDDD-DDDD')).apoya, false, 'lo pagado ya venció')
  // La cuenta gratis sigue abriendo la comunidad (`activa`), pero no apoya.
  assert.deepEqual(await c.firmado('SLOTH-EEEE-EEEE-EEEE-EEEE').then((d) => [d.activa, d.apoya]), [true, false])
})

test('quien apoyó desde la tienda sigue con la clave de su cuenta gratis: apoya mientras dure el apoyo de su correo', async () => {
  const c = cobro()
  c.fila('SLOTH-GGGG-GGGG-GGGG-GGGG', 'tienda@x.com', 'cuenta', 'gratis', null)
  c.fila('SLOTH-HHHH-HHHH-HHHH-HHHH', 'tienda@x.com', 'mensual', 'authorized', manana)
  assert.equal((await c.firmado('SLOTH-GGGG-GGGG-GGGG-GGGG')).apoya, true)
  // Dejó de pagar y lo pagado se acabó.
  c.db.prepare("UPDATE licencias SET estado = 'cancelled', pagado_hasta = ? WHERE clave = 'SLOTH-HHHH-HHHH-HHHH-HHHH'").run(ayer)
  assert.equal((await c.firmado('SLOTH-GGGG-GGGG-GGGG-GGGG')).apoya, false)
})

test('solo a quien tiene una suscripción de PayPal pagada le pide cancelarla allá, con hasta cuándo vale lo que pagó', async () => {
  const c = cobro()
  const pp = (clave: string, email: string, estado: string, paypal: string, autorizada: string | null) => {
    c.fila(clave, email, 'mensual', estado, manana)
    c.db.prepare('UPDATE licencias SET paypal = ?, autorizada = ? WHERE clave = ?').run(paypal, autorizada, clave)
  }
  pp('SLOTH-PPPP-PPPP-PPPP-PPPP', 'paypal@x.com', 'cancelled', 'I-UNO', '2026-10-20')
  c.fila('SLOTH-QQQQ-QQQQ-QQQQ-QQQQ', 'paypal@x.com', 'cuenta', 'gratis', null)
  pp('SLOTH-RRRR-RRRR-RRRR-RRRR', 'sinpagar@x.com', 'pending', 'I-DOS', null)
  pp('SLOTH-SSSS-SSSS-SSSS-SSSS', 'yastripe@x.com', 'cancelled', 'I-TRES', '2026-10-20')
  c.fila('SLOTH-TTTT-TTTT-TTTT-TTTT', 'yastripe@x.com', 'mensual', 'authorized', manana)
  c.db.prepare("UPDATE licencias SET stripe = 'sub_x' WHERE clave = 'SLOTH-TTTT-TTTT-TTTT-TTTT'").run()
  c.fila('SLOTH-UUUU-UUUU-UUUU-UUUU', 'tarjeta@x.com', 'mensual', 'authorized', manana)

  const conPaypal = await c.firmado('SLOTH-PPPP-PPPP-PPPP-PPPP')
  assert.deepEqual(conPaypal.cancelarPaypal, { hasta: manana })
  assert.equal(conPaypal.apoya, true, 'lo pagado por PayPal sigue valiendo')
  assert.deepEqual((await c.firmado('SLOTH-QQQQ-QQQQ-QQQQ-QQQQ')).cancelarPaypal, { hasta: manana }, 'también con la clave de su cuenta gratis')
  assert.equal((await c.firmado('SLOTH-RRRR-RRRR-RRRR-RRRR')).cancelarPaypal, undefined, 'nunca pagó: no hay nada que cancelar')
  assert.equal((await c.firmado('SLOTH-SSSS-SSSS-SSSS-SSSS')).cancelarPaypal, undefined, 'ya apoya con tarjeta')
  assert.equal((await c.firmado('SLOTH-UUUU-UUUU-UUUU-UUUU')).cancelarPaypal, undefined)
})
