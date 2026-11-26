import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import worker, { type Env } from './index.ts'
import { idDe } from './voz.ts'
import { APERTURA_VOZ, cuentaDeReparto, periodoVoz } from './voz-mensual.ts'

const NOVIEMBRE = new Date('2026-11-07T12:00:00Z')
const persona = { externo: 'cuenta-original', email: 'persona@example.com', clave: 'SLOTH-AAAA-BBBB-CCCC-DDDD' }

/** Migraciones reales y D1 sobre SQLite; el proveedor y Resend no salen a internet. */
function preparar(t: { after(fn: () => void): void }) {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const consulta = (sql: string, args: unknown[]) => ({
    bind: (...mas: unknown[]) => consulta(sql, mas),
    all: async () => ({ results: db.prepare(sql).all(...args as never[]) }),
    first: async () => db.prepare(sql).get(...args as never[]) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args as never[]).changes) } })
  })
  const objetos: Record<string, unknown> = {}
  const env = {
    DB: { prepare: (sql: string) => consulta(sql, []) },
    DESCARGAS: { head: async (k: string) => objetos[k] ?? null },
    CORREO_DE: 'VyMotion <avisos@example.com>', CORREO_RESPUESTA: 'soporte@example.com', RESEND_API_KEY: 're_prueba'
  } as unknown as Env
  const anterior = globalThis.fetch
  t.after(() => { globalThis.fetch = anterior; db.close() })
  const licencia = (id: string, email: string, plan: string, estado: string, modo = 'produccion', hasta: string | null = '2099-01-01', autorizada: string | null = '2026-11-01', monto = 15, moneda = 'USD') =>
    db.prepare('INSERT INTO licencias (id, clave, email, plan, monto, moneda, estado, modo, pagado_hasta, autorizada, creada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, `SLOTH-${id}`, email, plan, monto, moneda, estado, modo, hasta, autorizada, id === 'cuenta-original' ? '2026-10-01' : '2026-11-01')
  return { db, env, objetos, licencia }
}

test('el mes cambia a medianoche de Ciudad de México, también al cambiar de año', () => {
  assert.equal(periodoVoz(new Date('2026-12-01T05:59:59Z')), '2026-11')
  assert.equal(periodoVoz(new Date('2026-12-01T06:00:00Z')), '2026-12')
  assert.equal(periodoVoz(new Date('2027-01-01T05:59:59Z')), '2026-12')
  assert.equal(periodoVoz(new Date('2027-01-01T06:00:00Z')), '2027-01')
})

test('solo terminar el actualizador de una versión con las voces las abre a todos; un blockmap no las adelanta', async (t) => {
  const p = preparar(t)
  const objetos: Record<string, unknown> = {}
  Object.assign(p.env.DESCARGAS, {
    resumeMultipartUpload: () => ({ complete: async () => ({ size: 123 }) }),
    head: async (k: string) => objetos[k] ?? null,
    put: async (k: string, valor: string) => { objetos[k] = JSON.parse(valor) }
  })
  p.env.PUBLICAR = 'publicar-prueba'
  const subir = (archivo: string, vozMensual: boolean) => worker.fetch(new Request(`https://sloth.test/publicar/fin?archivo=${archivo}&upload=uno`, {
    method: 'POST', headers: { authorization: 'Bearer publicar-prueba' }, body: JSON.stringify({ partes: [], version: '0.4.1', vozMensual })
  }), p.env, { waitUntil() {} } as never)
  assert.equal((await subir('Sloth-Setup-0.4.1.exe.blockmap', true)).status, 200)
  assert.equal(objetos[APERTURA_VOZ], undefined)
  assert.equal((await subir('latest.yml', false)).status, 200)
  assert.equal(objetos[APERTURA_VOZ], undefined)
  assert.equal((await subir('latest.yml', true)).status, 200)
  assert.equal((objetos[APERTURA_VOZ] as { version: string }).version, '0.4.1')
})

test('quien apoya ya no recibe créditos cada mes: abre sus voces con el saldo que tiene, y nadie se lo toca', async (t) => {
  const p = preparar(t)
  p.licencia(persona.externo, persona.email, 'cuenta', 'gratis', 'produccion', null, null)
  p.licencia('apoyo', persona.email, 'mensual', 'authorized')
  p.db.prepare('UPDATE licencias SET clave = ? WHERE id = ?').run(persona.clave, persona.externo)
  const equipo = '3f9a0c1e7b2d4a6f8e0c1b3d5f7a9c2e'
  p.db.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?)').run(persona.clave, equipo, NOVIEMBRE.toISOString())
  p.env.VOICES_PK_LIVE = 'pk_live_general'
  p.env.VOICES_PK_LIVE_2 = 'pk_live_segunda'
  p.env.VOZ_SOLO_CREADOR = '1'
  const pedidos: string[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers)
    assert.equal(headers.has('x-sloth-clave'), false)
    // Solo se lee su cuenta: ni se le suman créditos ni se le manda un correo.
    assert.ok(url.endsWith(`/users/${persona.externo}`), url)
    assert.equal(init.method ?? 'GET', 'GET')
    pedidos.push(url)
    return headers.get('authorization') === 'Bearer pk_live_segunda' ? Response.json({ credits: 54, used_total: 46, status: 'active' }) : Response.json({}, { status: 404 })
  }) as typeof fetch
  const pendientes: Promise<unknown>[] = []
  const ctx = { waitUntil: (promesa: Promise<unknown>) => pendientes.push(promesa) } as never
  const pedir = () => worker.fetch(new Request('https://sloth.test/voz', { headers: { 'x-sloth-clave': persona.clave, 'x-sloth-equipo': equipo } }), p.env, ctx)
  const cerrada = await pedir()
  assert.equal((await cerrada.json() as { disponible: boolean }).disponible, false)
  assert.equal(pedidos.length, 0)
  p.objetos[APERTURA_VOZ] = { version: '0.4.1' }
  const respuesta = await pedir()
  const texto = await respuesta.text()
  assert.equal(respuesta.status, 200)
  const leido = JSON.parse(texto)
  assert.equal(leido.disponible, true)
  // Tenía 54 y sigue con 54: ya no se rellena a 100.000.
  assert.equal(leido.creditos, 54)
  assert.equal(leido.usados, 46)
  assert.equal('mensuales' in leido, false)
  assert.doesNotMatch(texto, /pk_live|SLOTH-/)
  assert.equal(p.db.prepare('SELECT COUNT(*) AS n FROM voz_mensual').get()?.n, 0)
  assert.equal(p.db.prepare('SELECT llave FROM voz_cuentas').get()?.llave, await idDe('pk_live_segunda'))
  await Promise.all(pendientes)
})

test('lo libre para repartir es el saldo menos lo que ya tienen los usuarios sin gastar', () => {
  assert.deepEqual(cuentaDeReparto({ saldo: 3_500_000, usuarios: [] }), { saldo: 3_500_000, enUsuarios: 0, libres: 3_500_000 })
  // Dos personas con créditos sin gastar y el creador con 5,000; nada se aparta para un reparto de cada mes.
  const r = cuentaDeReparto({ saldo: 3_500_000, usuarios: [{ externo: 'b0', creditos: 40_000 }, { externo: 'b1', creditos: 90_000 }, { externo: 'creador', creditos: 5_000 }] })
  assert.deepEqual(r, { saldo: 3_500_000, enUsuarios: 135_000, libres: 3_365_000 })
  // Menos saldo del que ya está asignado: falta.
  assert.equal(cuentaDeReparto({ saldo: 100_000, usuarios: [{ externo: 'b0', creditos: 140_000 }] }).libres, -40_000)
})
