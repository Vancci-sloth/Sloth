// Los avisos por correo (`POST /aviso-correo`): a quién le llegan, que nadie lo reciba dos veces y que solo el creador
// los mande. Con las migraciones reales sobre SQLite.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { AVISOS, avisoCorreo, faltan } from './aviso-correo.ts'
import type { Env } from './index.ts'

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

const manana = new Date(Date.now() + 864e5).toISOString()
const ayer = new Date(Date.now() - 864e5).toISOString()
const AVISO = Object.keys(AVISOS)[0]

function cobro() {
  const { db, DB } = d1()
  const fila = (id: string, email: string, plan: string, estado: string, pagadoHasta: string | null, autorizada: string | null, modo = 'produccion') =>
    db
      .prepare("INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, pagado_hasta, autorizada, creada, modo) VALUES (?, ?, ?, ?, 10, 0, ?, ?, ?, '2026-11-01', ?)")
      .run(id, id, email, plan, estado, pagadoHasta, autorizada, modo)
  fila('a', 'Ana@Ejemplo.com', 'mensual', 'authorized', manana, '2026-11-01')
  fila('a2', 'ana@ejemplo.com', 'unico', 'pagado', manana, '2026-11-02') // la misma persona, otra vez
  fila('b', 'beto@ejemplo.com', 'mensual', 'cancelled', manana, '2026-11-01') // canceló, sigue en su periodo
  fila('c', 'caro@ejemplo.com', 'gratis', 'gratis', null, null) // lugar gratis de por vida
  fila('d', 'dani@ejemplo.com', 'mensual', 'cancelled', ayer, '2026-10-01') // ya venció
  fila('e', 'eli@ejemplo.com', 'cuenta', 'gratis', null, null) // cuenta gratis: no apoya
  fila('f', 'rifa-1@sloth.vancci.org', 'unico', 'pagado', manana, '2026-11-01') // de una rifa
  fila('g', 'gus@ejemplo.com', 'mensual', 'authorized', manana, '2026-11-01', 'pruebas')
  fila('h', 'hugo@ejemplo.com', 'mensual', 'pending', manana, null) // nunca pagó
  const enviados: { para: string; asunto: string; llave: string | null }[] = []
  const env = { DB, ADMIN: 'secreto', RESEND_API_KEY: 'x', CORREO_DE: 'Sloth <avisos@x>', CORREO_RESPUESTA: 'soporte@x', ORIGEN: 'https://cobro.x' } as unknown as Env
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const c = JSON.parse(String(init.body))
    enviados.push({ para: c.to[0], asunto: c.subject, llave: new Headers(init.headers).get('idempotency-key') })
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  return { db, env, enviados }
}

const pedir = (env: Env, datos: unknown, llave = 'secreto') =>
  avisoCorreo(new Request('https://cobro.x/aviso-correo', { method: 'POST', headers: { authorization: `Bearer ${llave}`, 'content-type': 'application/json' }, body: JSON.stringify(datos) }), env)

test('le llega a quien apoya hoy o tiene un lugar gratis, una vez por correo', async () => {
  const { env } = cobro()
  assert.deepEqual(await faltan(env, AVISO), ['ana@ejemplo.com', 'beto@ejemplo.com', 'caro@ejemplo.com'])
})

test('se manda de pocos en pocos, sigue donde se quedó y no se repite', async () => {
  const { env, enviados } = cobro()
  const probar = await (await pedir(env, { aviso: AVISO, probar: true })).json()
  assert.equal(probar.quedan, 3)
  assert.equal(enviados.length, 0)

  const primera = await (await pedir(env, { aviso: AVISO, limite: 2 })).json()
  assert.equal(primera.quedan, 1)
  const segunda = await (await pedir(env, { aviso: AVISO })).json()
  assert.equal(segunda.quedan, 0)
  const tercera = await (await pedir(env, { aviso: AVISO })).json()
  assert.deepEqual(tercera.hechos, [])
  assert.deepEqual(enviados.map((e) => e.para), ['ana@ejemplo.com', 'beto@ejemplo.com', 'caro@ejemplo.com'])
  assert.ok(enviados.every((e) => e.asunto === AVISOS[AVISO].asunto && e.llave === `aviso-${AVISO}-${e.para}`))
})

test('la prueba va a un solo correo y no cuenta; sin la llave del creador, nada', async () => {
  const { env, enviados } = cobro()
  const prueba = await (await pedir(env, { aviso: AVISO, prueba: 'yo@ejemplo.com' })).json()
  assert.equal(prueba.prueba, 'yo@ejemplo.com')
  assert.equal((await pedir(env, { aviso: AVISO, prueba: true }).then((r) => r.json())).prueba, 'soporte@x')
  assert.deepEqual(enviados.map((e) => e.para), ['yo@ejemplo.com', 'soporte@x'])
  assert.equal((await faltan(env, AVISO)).length, 3)
  await assert.rejects(pedir(env, { aviso: AVISO }, 'otra'), /No autorizado/)
  await assert.rejects(pedir(env, { aviso: 'no-existe' }), /No hay aviso/)
})
