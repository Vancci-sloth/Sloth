// La tienda la ve cualquiera; instalar es de quien apoya (ADR 0019). Con las migraciones reales y D1 sobre SQLite.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { Miembro } from './comunidad.ts'
import type { Env } from './index.ts'
import { tienda } from './tienda.ts'

function preparar(t: { after(fn: () => void): void }) {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const consulta = (sql: string, args: unknown[]) => ({
    bind: (...mas: unknown[]) => consulta(sql, mas),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
  })
  const env = {
    DB: { prepare: (sql: string) => consulta(sql, []), batch: async (qs: ReturnType<typeof consulta>[]) => Promise.all(qs.map((q) => q.all())) },
    MONEDA: 'USD'
  } as unknown as Env
  // Stripe no sale a internet: la tienda sigue sin el fondo.
  const anterior = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('sin red')
  }) as typeof fetch
  t.after(() => {
    globalThis.fetch = anterior
    db.close()
  })
  const miembro = (id: string, insignia: Miembro['insignia'] = null): Miembro => {
    db.prepare("INSERT INTO miembros (id, clave, nombre, creado, visto) VALUES (?, ?, ?, '2026-11-01', '2026-11-01')").run(id, `SLOTH-${id}`, id)
    return { id, clave: `SLOTH-${id}`, nombre: id, foto: null, creado: '2026-11-01', visto: '2026-11-01', creditos: 0, insignia }
  }
  const estilo = (id: string, autor: string, aprobada: number) =>
    db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, adjuntos, creada, actividad, aprobada) VALUES (?, ?, 'estilos', ?, '', ?, ?, ?, ?)").run(
      id,
      autor,
      `Estilo ${id}`,
      JSON.stringify([{ tipo: 'estilo', llave: `${id.padEnd(20, 'x')}.estilo`, nombre: `Estilo ${id}` }]),
      `2026-11-0${id.length}T00:00:00Z`,
      `2026-11-0${id.length}T00:00:00Z`,
      aprobada
    )
  const ver = async (yo: Miembro) => {
    const r = await tienda(env, yo, new URL('https://x/comunidad/estilos'))
    return { ids: r.estilos.map((e) => e.publicacion.id).sort(), sinApoyo: r.sinApoyo }
  }
  return { miembro, estilo, ver }
}

test('quien no apoya ve la tienda entera, y la tienda le dice que no instala; quien apoya, lo mismo sin aviso', async (t) => {
  const { miembro, estilo, ver } = preparar(t)
  const ana = miembro('ana', 'apoya')
  const beto = miembro('beto')
  const caro = miembro('caro')
  estilo('e', 'ana', 1)
  estilo('ee', 'ana', 1)
  estilo('eee', 'beto', 0)
  // Caro no apoya: ve los dos aprobados, de otra persona, y sabe cuántos hay para la invitación.
  assert.deepEqual(await ver(caro), { ids: ['e', 'ee'], sinApoyo: { estilos: 2 } })
  // Beto tampoco: además ve el suyo, que aún no se aprueba.
  assert.deepEqual(await ver(beto), { ids: ['e', 'ee', 'eee'], sinApoyo: { estilos: 2 } })
  // Ana apoya: lo mismo que Caro, sin el aviso.
  assert.deepEqual(await ver(ana), { ids: ['e', 'ee'], sinApoyo: undefined })
})
