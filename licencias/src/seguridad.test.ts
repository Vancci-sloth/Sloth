// Lo que cierra lo que cualquiera vería leyendo este código, que es público: la clave de un apoyo no sale más que por
// correo, la versión de quien apoya no se baja armando su nombre, cada archivo de la comunidad es de quien lo subió y los
// cupos no se saltan con IPv6.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import worker, { redDe, sistemaDelBinario, versionDe } from './index.ts'
import { esDe, llavesEn, sueltos } from './comunidad.ts'
import { GRACIA_STRIPE, leerStripe } from './stripe.ts'

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

/** R2 de mentira: lo justo para `ultima.json`, `anterior/` y servir un archivo. */
function r2(objetos: Record<string, unknown>) {
  const de = (k: string) => (k in objetos ? { json: async () => objetos[k], size: 3, body: 'abc', httpEtag: '"e"' } : null)
  return { get: async (k: string) => de(k), head: async (k: string) => de(k) }
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never
const pedir = (env: unknown, ruta: string, init?: RequestInit) => worker.fetch(new Request(`https://cobro.x${ruta}`, init), env as never, ctx)
const base = { PAYPAL_MODO: 'prueba', MONEDA: 'USD', ORIGEN: 'https://cobro.x', CORREO_DE: 'Sloth <a@x.com>', CORREO_RESPUESTA: 'soporte@x.com', RESEND_API_KEY: 're_x' }

test('un apoyo no da su clave al abrir el pago: a la app de antes se le dice que apoye desde la página', async () => {
  const { DB } = d1()
  const r = await pedir({ ...base, DB }, '/suscribir', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'victima@x.com', plan: 'mensual', pasarela: 'tarjeta', monto: 1, equipo: '0f8fad5bd9cb469fa16570867728950e', acepto: true, terminos: '2026-01-01' })
  })
  assert.equal(r.status, 409)
  const j = (await r.json()) as { error: string; clave?: string }
  assert.equal(j.clave, undefined)
  assert.match(j.error, /sloth\.vancci\.org/)
})

test('/gracias confirma el pago y dice a qué correo va la clave, sin enseñarla', async () => {
  const { db, DB } = d1()
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
  db.prepare(
    "INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, creada, modo) VALUES (?, 'SLOTH-AAAA-BBBB-CCCC-DDDD', 'yo@x.com', 'mensual', 15, 0, 'authorized', '2026-11-01', 'prueba')"
  ).run(id)
  const html = await (await pedir({ ...base, DB }, `/gracias?s=${id}`)).text()
  assert.match(html, /Gracias por apoyar/)
  assert.match(html, /yo@x\.com/)
  assert.doesNotMatch(html, /SLOTH-AAAA/)
})

test('la cuenta gratis de una computadora solo se recupera con su mismo correo', async () => {
  const { db, DB } = d1()
  const equipo = '3f9a0c1e7b2d4a6f8e0c1b3d5f7a9c2e'
  db.prepare(
    "INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, creada, modo) VALUES ('a', 'SLOTH-AAAA-BBBB-CCCC-DDDD', 'ella@x.com', 'cuenta', 0, 0, 'gratis', '2026-11-01', 'prueba')"
  ).run()
  db.prepare("INSERT INTO equipos (clave, equipo, visto) VALUES ('SLOTH-AAAA-BBBB-CCCC-DDDD', ?, '2026-11-01')").run(equipo)
  const antes = globalThis.fetch
  globalThis.fetch = (async () => new Response('{"id":"1"}')) as typeof fetch
  try {
    const unirse = (email: string) =>
      pedir({ ...base, DB }, '/suscribir', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '2001:db8::1' },
        body: JSON.stringify({ email, plan: 'gratis', equipo, acepto: true, terminos: '2026-01-01', porCorreo: true })
      }).then((r) => r.text())
    assert.doesNotMatch(await unirse('otro@x.com'), /SLOTH-AAAA/)
    assert.match(await unirse('ella@x.com'), /SLOTH-AAAA/)
  } finally {
    globalThis.fetch = antes
  }
})

test('la versión que aún es de quien apoya no se baja a mano: su instalador y su mapa no están para los demás', async () => {
  const { DB } = d1()
  const todos = new Date(Date.now() + 5 * 864e5).toISOString()
  const DESCARGAS = r2({
    'ultima.json': { archivo: 'Sloth-Setup-0.4.1.exe', version: '0.4.1', bytes: 3, publicado: '2026-11-07', todos },
    'anterior/ultima.json': { archivo: 'Sloth-Setup-0.4.0.exe', version: '0.4.0', bytes: 3, publicado: '2026-11-01' },
    'Sloth-Setup-0.4.1.exe': 1,
    'Sloth-Setup-0.4.1.exe.blockmap': 1,
    'Sloth-Setup-0.4.0.exe': 1
  })
  const env = { ...base, DB, DESCARGAS, PUBLICAR: 'publica', ADMIN: 'admin' }
  const estado = (archivo: string, llave?: string) => pedir(env, `/actualizaciones/${archivo}`, llave ? { headers: { authorization: `Bearer ${llave}` } } : undefined).then((r) => r.status)
  assert.equal(await estado('Sloth-Setup-0.4.1.exe'), 404)
  assert.equal(await estado('Sloth-Setup-0.4.1.exe.blockmap'), 404)
  assert.equal(await estado('Sloth-Setup-0.4.0.exe'), 200)
  assert.equal(await estado('Sloth-Setup-0.4.1.exe', 'admin'), 200)
})

test('la llave del creador administra, pero solo la de publicar sube una versión', async () => {
  const env = { ...base, DB: d1().DB, PUBLICAR: 'publica', ADMIN: 'admin' }
  const subir = (llave: string) => pedir(env, '/publicar/inicio?archivo=latest.yml', { method: 'POST', headers: { authorization: `Bearer ${llave}` } }).then((r) => r.status)
  assert.equal(await subir('admin'), 401)
  assert.equal(await subir('otra'), 401)
})

test('el instalador, el zip de Mac y sus mapas dicen de qué sistema y de qué versión son', () => {
  assert.equal(sistemaDelBinario('Sloth-Setup-0.3.4.exe'), 'windows')
  assert.equal(sistemaDelBinario('Sloth-Setup-0.3.4.exe.blockmap'), 'windows')
  assert.equal(sistemaDelBinario('Sloth-0.3.4-mac-x64.zip'), 'mac')
  assert.equal(sistemaDelBinario('Sloth-0.3.4-mac-arm64.dmg'), 'mac-arm64')
  assert.equal(sistemaDelBinario('Sloth-0.3.4-mac12-x64.zip.blockmap'), 'mac12')
  assert.equal(sistemaDelBinario('Sloth-0.3.4-linux-arm64.AppImage'), 'linux')
  assert.equal(sistemaDelBinario('latest.yml'), undefined)
  assert.equal(versionDe('Sloth-0.3.40-mac-arm64.zip'), '0.3.40')
})

test('los cupos cuentan una IPv6 por su /64: cambiar de dirección en la misma conexión no da otro', () => {
  assert.equal(redDe('203.0.113.7'), '203.0.113.7')
  assert.equal(redDe('2001:db8:0:12::1'), '2001:db8:0:12::/64')
  assert.equal(redDe('2001:0db8:0000:0012:abcd:1:2:3'), '2001:db8:0:12::/64')
  assert.equal(redDe('2001:db8::abcd'), '2001:db8:0:0::/64')
  assert.equal(redDe('2001:DB8::1'), redDe('2001:db8::ffff'))
})

test('un cobro de Stripe sin pasar sigue abierto mientras Stripe reintenta, y se pausa pasada la gracia', () => {
  const inicio = Date.parse('2026-11-01T00:00:00Z')
  const items = { data: [{ current_period_start: inicio / 1000, current_period_end: inicio / 1000 + 30 * 86400 }] }
  assert.equal(leerStripe({ status: 'past_due', items }, inicio + 5 * 864e5).estado, 'authorized')
  assert.equal(leerStripe({ status: 'past_due', items }, inicio + GRACIA_STRIPE + 1000).estado, 'paused')
  // Sin el inicio del periodo, como antes.
  assert.equal(leerStripe({ status: 'past_due' }, inicio + 90 * 864e5).estado, 'authorized')
})

test('un archivo de la comunidad es de quien lo subió, y lo que nada usa se reconoce para borrarlo', () => {
  assert.equal(esDe({ miembro: 'abc' }, 'abc'), true)
  assert.equal(esDe({ miembro: 'abc' }, 'otro'), false)
  assert.equal(esDe(undefined, 'abc'), false)
  const usada = 'aaaaaaaaaaaaaaaaaaaa.png'
  const enTexto = 'bbbbbbbbbbbbbbbbbbbb.mp4'
  const usadas = new Set([...llavesEn(JSON.stringify([{ tipo: 'imagen', llave: usada }])), ...llavesEn(`mira https://x/comunidad/archivo/${enTexto}`)])
  assert.deepEqual(sueltos([usada, enTexto, 'cccccccccccccccccccc.webp'], usadas), ['cccccccccccccccccccc.webp'])
})
