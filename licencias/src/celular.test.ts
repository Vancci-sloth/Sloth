// El candado de la app del celular (`celular.ts`): con `CELULAR_SOLO_APOYO` apagado abre para todos; encendido, dice si
// la clave apoya hoy. Los celulares de cada clave se cuentan aparte de sus computadoras.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import worker from './index.ts'

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never
const manana = new Date(Date.now() + 864e5).toISOString()

function cobro(cobra: boolean) {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const consulta = (sql: string, args: unknown[]) => ({
    bind: (...mas: unknown[]) => consulta(sql, [...args, ...mas]),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
  })
  const env = { PAYPAL_MODO: 'produccion', MONEDA: 'USD', ORIGEN: 'https://cobro.x', ADMIN: 'llave-del-creador', CELULAR_SOLO_APOYO: cobra ? '1' : '0', DB: { prepare: (sql: string) => consulta(sql, []) } }
  const fila = (clave: string, email: string, plan: string, estado: string, pagadoHasta: string | null) =>
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, pagado_hasta, creada, modo) VALUES (?, ?, ?, ?, 10, 0, ?, ?, '2026-11-01', 'produccion')").run(clave, clave, email, plan, estado, pagadoHasta)
  const pregunta = async (cuerpo: Record<string, unknown>, cabeceras: Record<string, string> = {}) => {
    const r = await worker.fetch(new Request('https://cobro.x/celular', { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) }), env as never, ctx)
    return { status: r.status, ...((await r.json()) as { cobra?: boolean; apoya?: boolean; error?: string }) }
  }
  return { db, fila, pregunta }
}

test('apagado, abre para todos; encendido, solo apoya quien paga hoy', async () => {
  const apagado = cobro(false)
  assert.equal((await apagado.pregunta({ equipo: 'celular-uno' })).cobra, false)
  const sinClave = await apagado.pregunta({ equipo: 'celular-uno', clave: 'SLOTH-ZZZZ-ZZZZ-ZZZZ-ZZZZ' })
  assert.deepEqual([sinClave.status, sinClave.cobra], [200, false], 'apagado, una clave que ya no existe no cierra nada')

  const c = cobro(true)
  c.fila('SLOTH-AAAA-AAAA-AAAA-AAAA', 'apoya@x.com', 'mensual', 'authorized', manana)
  c.fila('SLOTH-BBBB-BBBB-BBBB-BBBB', 'cuenta@x.com', 'cuenta', 'gratis', null)
  assert.deepEqual(await c.pregunta({ equipo: 'celular-uno' }).then((r) => [r.cobra, r.apoya]), [true, undefined])
  assert.equal((await c.pregunta({ equipo: 'celular-uno', clave: 'SLOTH-AAAA-AAAA-AAAA-AAAA' })).apoya, true)
  assert.equal((await c.pregunta({ equipo: 'celular-uno', clave: 'sloth-bbbb-bbbb-bbbb-bbbb' })).apoya, false, 'la cuenta gratis no apoya')
  assert.equal((await c.pregunta({ equipo: 'celular-uno', clave: 'SLOTH-ZZZZ-ZZZZ-ZZZZ-ZZZZ' })).status, 404)
  assert.equal((await c.pregunta({}, { authorization: 'Bearer llave-del-creador' })).apoya, true, 'el creador, con su llave')
})

test('una clave abre en dos celulares, sin quitarle lugar a sus computadoras', async () => {
  const c = cobro(true)
  const clave = 'SLOTH-AAAA-AAAA-AAAA-AAAA'
  c.fila(clave, 'apoya@x.com', 'mensual', 'authorized', manana)
  c.db.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?), (?, ?, ?)').run(clave, 'compu-uno', manana, clave, 'compu-dos', manana)
  assert.equal((await c.pregunta({ equipo: 'celular-uno', clave })).apoya, true)
  assert.equal((await c.pregunta({ equipo: 'celular-dos', clave })).apoya, true)
  assert.equal((await c.pregunta({ equipo: 'celular-uno', clave })).apoya, true, 'el mismo celular otra vez')
  const tercero = await c.pregunta({ equipo: 'celular-tres', clave })
  assert.equal(tercero.status, 409)
  assert.match(tercero.error ?? '', /2 celulares/)
})
