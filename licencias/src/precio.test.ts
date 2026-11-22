import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import worker, { type Env } from './index.ts'

/** Migraciones reales y D1 sobre SQLite. */
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
  const env = { DB: { prepare: (sql: string) => consulta(sql, []) }, MONEDA: 'USD', PRECIO_MENSUAL: '10', PRECIO_MENSUAL_MXN: '199', FUNDADORES: '25' } as unknown as Env
  t.after(() => db.close())
  const precio = async () => (await worker.fetch(new Request('https://sloth.test/precio'), env, { waitUntil() {} } as never)).json() as Promise<{ mensual: number; estilos?: number }>
  return { db, precio }
}

test('el precio dice cuántos estilos tiene la tienda de la comunidad: los aprobados, y nada si no hay', async (t) => {
  const { db, precio } = preparar(t)
  assert.equal((await precio()).mensual, 10)
  assert.equal('estilos' in (await precio()), false)
  const pub = db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, creada, actividad, aprobada) VALUES (?, 'alguien', ?, '', '', '2026-11-15', '2026-11-15', ?)")
  pub.run('estilo-1', 'estilos', 1)
  pub.run('estilo-2', 'estilos', 1)
  pub.run('en-revision', 'estilos', 0)
  pub.run('platica', 'general', 1)
  assert.equal((await precio()).estilos, 2)
})
