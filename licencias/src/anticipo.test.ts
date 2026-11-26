// Quien apoya recibe cada versión antes que los demás (`ANTICIPO`): lo que pide la app instalada al buscar la nueva
// (`/actualizaciones/latest.yml` y su instalador, con la clave y la computadora en las cabeceras), de punta a punta.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import worker from './index.ts'

/** D1 sobre SQLite con todas las migraciones, con la forma que usa el Worker: prepare(sql).bind(...).all/first/run. */
function d1() {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const consulta = (sql: string, args: unknown[]) => ({
    bind: (...mas: unknown[]) => consulta(sql, [...args, ...mas]),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
  })
  return { db, DB: { prepare: (sql: string) => consulta(sql, []) } }
}

/** R2 de mentira: los JSON (`ultima.json`) y los archivos, que son su texto. */
function r2(objetos: Record<string, unknown>) {
  const de = (k: string) => {
    if (!(k in objetos)) return null
    const texto = typeof objetos[k] === 'string' ? (objetos[k] as string) : JSON.stringify(objetos[k])
    return { json: async () => objetos[k], size: texto.length, body: texto, httpEtag: `"${texto}"`, etag: texto }
  }
  return { get: async (k: string) => de(k), head: async (k: string) => de(k) }
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never
const base = { PAYPAL_MODO: 'produccion', MONEDA: 'USD', ORIGEN: 'https://cobro.x' }
const EQUIPO = '0f8fad5bd9cb469fa16570867728950e'
const OTRO_EQUIPO = 'ffffffffd9cb469fa16570867728950e'
const manana = new Date(Date.now() + 864e5).toISOString()
const ayer = new Date(Date.now() - 864e5).toISOString()

/** La 0.4.3 salió hace un rato y aún es solo de quien apoya; los demás siguen con la 0.4.2. */
function cobro() {
  const { db, DB } = d1()
  const DESCARGAS = r2({
    'ultima.json': { archivo: 'Sloth-Setup-0.4.3.exe', version: '0.4.3', bytes: 5, publicado: ayer, todos: new Date(Date.now() + 5 * 864e5).toISOString() },
    'anterior/ultima.json': { archivo: 'Sloth-Setup-0.4.2.exe', version: '0.4.2', bytes: 5, publicado: '2026-11-09' },
    'latest.yml': 'version: 0.4.3',
    'anterior/latest.yml': 'version: 0.4.2',
    'Sloth-Setup-0.4.3.exe': 'nueva',
    'Sloth-Setup-0.4.2.exe': 'vieja'
  })
  const env = { ...base, DB, DESCARGAS }
  const fila = (clave: string, email: string, plan: string, estado: string, pagadoHasta: string | null) =>
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, pagado_hasta, creada, modo) VALUES (?, ?, ?, ?, 10, 0, ?, ?, '2026-11-01', 'produccion')").run(clave, clave, email, plan, estado, pagadoHasta)
  const usa = (clave: string, equipo = EQUIPO) => db.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?)').run(clave, equipo, ayer)
  const pedir = (ruta: string, clave?: string, equipo = EQUIPO) =>
    worker.fetch(new Request(`https://cobro.x${ruta}`, clave ? { headers: { 'x-sloth-clave': clave, 'x-sloth-equipo': equipo } } : undefined), env as never, ctx)
  /** Lo que ve la app de esa clave al buscar la versión nueva, y si puede bajarla. */
  const leOfrece = async (clave?: string, equipo?: string) => ({
    yml: await (await pedir('/actualizaciones/latest.yml', clave, equipo)).text(),
    instalador: (await pedir('/actualizaciones/Sloth-Setup-0.4.3.exe', clave, equipo)).status
  })
  return { fila, usa, pedir, leOfrece }
}

const NUEVA = { yml: 'version: 0.4.3', instalador: 200 }
const ANTERIOR = { yml: 'version: 0.4.2', instalador: 404 }

test('la app de quien apoya ve la versión nueva y puede bajarla; sin apoyo, sigue con la anterior', async () => {
  const c = cobro()
  c.fila('SLOTH-AAAA-AAAA-AAAA-AAAA', 'mensual@x.com', 'mensual', 'authorized', manana)
  c.fila('SLOTH-BBBB-BBBB-BBBB-BBBB', 'unico@x.com', 'unico', 'pagado', manana)
  c.fila('SLOTH-CCCC-CCCC-CCCC-CCCC', 'cancelo@x.com', 'mensual', 'cancelled', manana)
  c.fila('SLOTH-DDDD-DDDD-DDDD-DDDD', 'vida@x.com', 'gratis', 'gratis', null)
  c.fila('SLOTH-EEEE-EEEE-EEEE-EEEE', 'pausada@x.com', 'mensual', 'paused', manana)
  c.fila('SLOTH-FFFF-FFFF-FFFF-FFFF', 'vencio@x.com', 'mensual', 'cancelled', ayer)
  c.fila('SLOTH-GGGG-GGGG-GGGG-GGGG', 'cuenta@x.com', 'cuenta', 'gratis', null)
  for (const l of 'ABCDEFG') c.usa(`SLOTH-${l.repeat(4)}-${l.repeat(4)}-${l.repeat(4)}-${l.repeat(4)}`)

  for (const l of 'ABCDE') assert.deepEqual(await c.leOfrece(`SLOTH-${l.repeat(4)}-${l.repeat(4)}-${l.repeat(4)}-${l.repeat(4)}`), NUEVA, `la clave ${l}`)
  assert.deepEqual(await c.leOfrece(), ANTERIOR, 'sin clave')
  assert.deepEqual(await c.leOfrece('SLOTH-FFFF-FFFF-FFFF-FFFF'), ANTERIOR, 'con el apoyo vencido')
  assert.deepEqual(await c.leOfrece('SLOTH-GGGG-GGGG-GGGG-GGGG'), ANTERIOR, 'con una cuenta gratis')
  assert.deepEqual(await c.leOfrece('SLOTH-AAAA-AAAA-AAAA-AAAA', OTRO_EQUIPO), ANTERIOR, 'desde una computadora que no usa esa clave')
})

test('quien apoyó con el correo de su cuenta gratis recibe lo nuevo con la clave de esa cuenta, sin escribir la del apoyo', async () => {
  const c = cobro()
  // «Desbloquea N estilos»: paga con tarjeta con el correo de su cuenta, y su VyMotion se queda con la clave de la cuenta.
  c.fila('SLOTH-GGGG-GGGG-GGGG-GGGG', 'tienda@x.com', 'cuenta', 'gratis', null)
  c.usa('SLOTH-GGGG-GGGG-GGGG-GGGG')
  assert.deepEqual(await c.leOfrece('SLOTH-GGGG-GGGG-GGGG-GGGG'), ANTERIOR, 'antes de apoyar')
  c.fila('SLOTH-HHHH-HHHH-HHHH-HHHH', 'tienda@x.com', 'mensual', 'authorized', manana)
  assert.deepEqual(await c.leOfrece('SLOTH-GGGG-GGGG-GGGG-GGGG'), NUEVA, 'ya con su apoyo')
  // La clave sigue siendo de su computadora: desde otra, o con el apoyo de otro correo, no.
  assert.deepEqual(await c.leOfrece('SLOTH-GGGG-GGGG-GGGG-GGGG', OTRO_EQUIPO), ANTERIOR)
  c.fila('SLOTH-JJJJ-JJJJ-JJJJ-JJJJ', 'otra@x.com', 'cuenta', 'gratis', null)
  c.usa('SLOTH-JJJJ-JJJJ-JJJJ-JJJJ')
  assert.deepEqual(await c.leOfrece('SLOTH-JJJJ-JJJJ-JJJJ-JJJJ'), ANTERIOR)
})

test('/version y /descargar dan la nueva a quien apoya y la anterior a los demás, que ven cuál viene', async () => {
  const c = cobro()
  c.fila('SLOTH-AAAA-AAAA-AAAA-AAAA', 'mensual@x.com', 'mensual', 'authorized', manana)
  c.usa('SLOTH-AAAA-AAAA-AAAA-AAAA')
  const version = async (clave?: string) => (await (await c.pedir('/version', clave)).json()) as { version: string; nueva?: string }
  assert.equal((await version('SLOTH-AAAA-AAAA-AAAA-AAAA')).version, '0.4.3')
  assert.deepEqual(await version().then((v) => [v.version, v.nueva]), ['0.4.2', '0.4.3'])
  assert.equal(await (await c.pedir('/descargar', 'SLOTH-AAAA-AAAA-AAAA-AAAA')).text(), 'nueva')
  assert.equal(await (await c.pedir('/descargar')).text(), 'vieja')
})

test('el vistazo cambia otra vez cuando llega el latest.yml de la versión: quien miró antes vuelve a preguntar', async () => {
  const { DB } = d1()
  const objetos: Record<string, unknown> = { 'ultima.json': { archivo: 'Sloth-Setup-0.4.3.exe', version: '0.4.3', bytes: 5, publicado: ayer }, 'latest.yml': 'version: 0.4.2' }
  const env = { ...base, DB, DESCARGAS: r2(objetos) }
  const vistazo = () => worker.fetch(new Request('https://cobro.x/ultima?so=windows'), env as never, ctx).then((r) => r.text())
  // El instalador de la 0.4.3 ya se subió, pero su latest.yml todavía no: la app que pregunte ahora no ve nada nuevo.
  const sinYml = await vistazo()
  assert.equal(JSON.parse(sinYml).version, '0.4.3')
  objetos['latest.yml'] = 'version: 0.4.3'
  assert.notEqual(await vistazo(), sinYml)
})
