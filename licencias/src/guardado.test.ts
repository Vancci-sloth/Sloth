// Lo que recorre tablas enteras y es igual para todos se calcula una vez cada tanto, no en cada visita (guardado.ts).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import worker, { type Env } from './index.ts'
import { GUARDADO, guardado } from './guardado.ts'

/** D1 sobre SQLite con las migraciones reales, que anota cada consulta que corre. */
function preparar(t: { after(fn: () => void): void }) {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const corridas: string[] = []
  const consulta = (sql: string, args: unknown[]) => ({
    bind: (...mas: unknown[]) => consulta(sql, mas),
    all: async () => (corridas.push(sql), { results: db.prepare(sql).all(...(args as never[])) }),
    first: async (columna?: string) => {
      corridas.push(sql)
      const fila = (db.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined) ?? null
      return columna && fila ? fila[columna] : fila
    },
    run: async () => (corridas.push(sql), { meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
  })
  const DB = { prepare: (sql: string) => consulta(sql, []), batch: (varias: { all(): Promise<unknown> }[]) => Promise.all(varias.map((c) => c.all())) }
  const env = { DB, MONEDA: 'USD', PRECIO_MENSUAL: '10', PRECIO_MENSUAL_MXN: '199', FUNDADORES: '25', ORIGEN: 'https://sloth.test' } as unknown as Env
  t.after(() => db.close())
  const pedir = async <T>(ruta: string, clave?: string, cuerpo?: unknown) =>
    (await worker.fetch(
      new Request(`https://sloth.test${ruta}`, {
        method: cuerpo ? 'POST' : 'GET',
        headers: { ...(clave ? { 'x-sloth-clave': clave, 'x-sloth-equipo': EQUIPO } : {}), ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {})
      }),
      env,
      { waitUntil() {} } as never
    )).json() as Promise<T>
  const precio = () => pedir<{ apoyan: number; quedan: number }>('/precio')
  /** Alguien con su lugar gratis de por vida (Fundador), que entra desde su Sloth. */
  const fundador = (clave: string) => {
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, creada, modo) VALUES (?, ?, ?, 'gratis', 0, 0, 'gratis', '2026-11-01', 'produccion')").run(clave, clave, `${clave}@x.mx`)
    db.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?)').run(clave, EQUIPO, new Date().toISOString())
  }
  const apoya = (id: string) =>
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, moneda, fundador, estado, autorizada, pagado_hasta, creada, modo) VALUES (?, ?, ?, 'mensual', 10, 'USD', 1, 'authorized', '2026-11-01', ?, '2026-11-01', 'produccion')")
      .run(id, id, `${id}@x.mx`, new Date(Date.now() + 864e5).toISOString())
  /** Cuántas veces se recorrió `licencias` para contar. */
  const recorridos = () => corridas.filter((sql) => sql.includes("FROM licencias WHERE plan IN ('mensual', 'anual', 'unico')")).length
  return { db, env, pedir, precio, apoya, fundador, recorridos, corridas }
}

const EQUIPO = '0f8fad5bd9cb469fa16570867728950e'
const ANA = 'SLOTH-AAAA-AAAA-AAAA-AAAA'
const BETO = 'SLOTH-BBBB-BBBB-BBBB-BBBB'
interface Feed {
  miembros: number
  activos: number
  roadmap: { metas: { id: string; votos: number }[]; mio?: string }
}

test('la comunidad lee guardados sus miembros, sus activos y los votos, y el voto de quien vota se cuenta al momento', async (t) => {
  const { pedir, fundador, corridas } = preparar(t)
  fundador(ANA)
  const primero = await pedir<Feed>('/comunidad', ANA)
  assert.deepEqual([primero.miembros, primero.activos], [1, 1])
  assert.ok(primero.roadmap.metas.every((m) => m.votos === 0))
  // Entra otro: los números siguen guardados y nadie vuelve a recorrer las tablas.
  fundador(BETO)
  const segundo = await pedir<Feed>('/comunidad', BETO)
  assert.deepEqual([segundo.miembros, segundo.activos], [1, 1])
  assert.equal(corridas.filter((sql) => sql.includes('AS miembros')).length, 1)
  assert.equal(corridas.filter((sql) => sql.includes('FROM votos v JOIN miembros')).length, 1)
  // Un voto de Fundador vale dos, y lo ve al momento quien vota y después los demás.
  const meta = primero.roadmap.metas[0].id
  const votado = await pedir<Feed['roadmap']>('/comunidad/roadmap', BETO, { meta })
  assert.deepEqual([votado.metas[0].votos, votado.mio], [2, meta])
  assert.equal((await pedir<Feed>('/comunidad', ANA)).roadmap.metas[0].votos, 2)
})

test('los créditos de la página se leen guardados', async (t) => {
  const { db, pedir, fundador, corridas } = preparar(t)
  fundador(ANA)
  await pedir('/comunidad', ANA)
  db.exec("UPDATE miembros SET nombre = 'Ana', creditos = 1")
  for (let i = 0; i < 3; i++) assert.deepEqual(await pedir('/creditos'), { fundadores: ['Ana'] })
  assert.equal(corridas.filter((sql) => sql.includes('WHERE m.creditos = 1')).length, 1)
})

test('el precio cuenta a quienes apoyan una vez y lo guarda: las siguientes visitas no recorren licencias', async (t) => {
  const { db, precio, apoya, recorridos } = preparar(t)
  apoya('ana')
  assert.deepEqual(await precio().then((p) => [p.apoyan, p.quedan]), [1, 24])
  apoya('beto')
  for (let i = 0; i < 5; i++) assert.deepEqual(await precio().then((p) => [p.apoyan, p.quedan]), [1, 24])
  assert.equal(recorridos(), 1)
  // Al vencer lo guardado, se vuelve a contar.
  db.exec("UPDATE guardado SET hasta = 0 WHERE nombre = 'precio'")
  assert.deepEqual(await precio().then((p) => [p.apoyan, p.quedan]), [2, 23])
  assert.equal(recorridos(), 2)
})

test('lo guardado vale 10 minutos, se recuenta si se pide y no rompe la respuesta si no se pudo guardar', async (t) => {
  const { db, env } = preparar(t)
  let veces = 0
  const calcular = async () => ({ n: ++veces })
  assert.deepEqual(await guardado(env, 'prueba', calcular), { n: 1 })
  assert.deepEqual(await guardado(env, 'prueba', calcular), { n: 1 })
  const { hasta } = db.prepare("SELECT hasta FROM guardado WHERE nombre = 'prueba'").get() as { hasta: number }
  assert.ok(Math.abs(hasta - (Date.now() + GUARDADO)) < 5000)
  assert.deepEqual(await guardado(env, 'prueba', calcular, true), { n: 2 })
  assert.deepEqual(await guardado(env, 'prueba', calcular), { n: 2 })
  // Sin poder escribir (la tabla llena, el tope de escrituras), sale lo calculado.
  const error = t.mock.method(console, 'error', () => {})
  db.exec('DROP TABLE guardado; CREATE TABLE guardado (nombre TEXT PRIMARY KEY, valor TEXT NOT NULL CHECK (0), hasta INTEGER NOT NULL)')
  assert.deepEqual(await guardado(env, 'prueba', calcular), { n: 3 })
  assert.equal(error.mock.callCount(), 1)
})

test('al vencer, recuenta uno solo y los que llegan a la vez siguen con lo de antes', async (t) => {
  const { db, env } = preparar(t)
  let veces = 0
  let soltar = () => {}
  const lento = async () => {
    veces++
    await new Promise<void>((r) => (soltar = r))
    return { n: veces }
  }
  db.prepare("INSERT INTO guardado (nombre, valor, hasta) VALUES ('prueba', '{\"n\":0}', 0)").run()
  const primero = guardado(env, 'prueba', lento)
  await new Promise((r) => setTimeout(r, 10))
  // Mientras el primero recuenta, cinco más: ninguno vuelve a recorrer.
  const otros = await Promise.all(Array.from({ length: 5 }, () => guardado(env, 'prueba', lento)))
  assert.deepEqual(otros, Array(5).fill({ n: 0 }))
  soltar()
  assert.deepEqual(await primero, { n: 1 })
  assert.equal(veces, 1)
  assert.deepEqual(await guardado(env, 'prueba', lento), { n: 1 })
})

test('si recontar falla, sale lo último guardado; sin nada guardado, el error', async (t) => {
  const { db, env } = preparar(t)
  const error = t.mock.method(console, 'error', () => {})
  const falla = async () => {
    throw new Error('Stripe no contesta')
  }
  await assert.rejects(guardado(env, 'prueba', falla), /Stripe no contesta/)
  db.prepare("INSERT INTO guardado (nombre, valor, hasta) VALUES ('prueba', '{\"n\":7}', 0)").run()
  assert.deepEqual(await guardado(env, 'prueba', falla), { n: 7 })
  assert.equal(error.mock.callCount(), 1)
})
