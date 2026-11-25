// Lo que la auditoría del 24-nov encontró en el cobro: el tope de computadoras por clave se contaba y se anotaba en dos
// pasos (varias a la vez lo pasaban todas), el paquete de un estilo se bajaba con su llave escrita en el nombre de otro, y
// la tienda pasaba de los 100 valores que D1 acepta por consulta.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { armar, enLoSuyo } from './comunidad.ts'
import { recordarEquipo, type Env } from './index.ts'

/** D1 sobre SQLite en memoria, con su tope de 100 valores por consulta. */
function base() {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const consulta = (sql: string, args: unknown[]) => {
    const c = {
      bind: (...mas: unknown[]) => {
        if (args.length + mas.length > 100) throw new Error('D1_ERROR: too many SQL variables')
        return consulta(sql, [...args, ...mas])
      },
      all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
      first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
    }
    return c
  }
  const DB = {
    prepare: (sql: string) => consulta(sql, []),
    batch: async (qs: ReturnType<typeof consulta>[]) => Promise.all(qs.map((q) => q.all()))
  }
  return { db, env: { DB, ORIGEN: 'https://cobro.x', FUNDADORES: 25, MONEDA: 'USD' } as unknown as Env }
}

test('cinco computadoras que piden a la vez con la misma clave: solo entran dos', async () => {
  const { env } = base()
  const ahora = Date.now()
  const entran = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((x) => recordarEquipo(env, 'SLOTH-AAAA-AAAA-AAAA-AAAA', `compu-${x}-123`, ahora)))
  assert.equal(entran.filter(Boolean).length, 2)
  assert.equal(await recordarEquipo(env, 'SLOTH-AAAA-AAAA-AAAA-AAAA', 'compu-a-123', ahora + 1000), true, 'una que ya estaba sigue entrando')
  assert.equal(await recordarEquipo(env, 'SLOTH-AAAA-AAAA-AAAA-AAAA', 'compu-f-123', ahora + 1000), false)
  // Pasado un mes sin verse, la de antes deja su lugar.
  assert.equal(await recordarEquipo(env, 'SLOTH-AAAA-AAAA-AAAA-AAAA', 'compu-f-123', ahora + 31 * 864e5), true)
})

test('el paquete de un estilo lo baja quien lo trae de adjunto, no quien escribió su llave en el nombre', async () => {
  const { db, env } = base()
  const ajena = 'abc123def456.estilo'
  const pub = (id: string, autor: string, adjuntos: unknown[], publica: string | null = null) =>
    db
      .prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, adjuntos, creada, actividad, aprobada, publica) VALUES (?, ?, 'estilos', 't', 't', ?, '2026-11-01', '2026-11-01', 0, ?)")
      .run(id, autor, JSON.stringify(adjuntos), publica)
  pub('p1', 'tramposo', [{ tipo: 'estilo', llave: 'mio.estilo', nombre: ajena }])
  assert.equal(await enLoSuyo(env, { id: 'tramposo' }, ajena), false)
  pub('p2', 'autor', [{ tipo: 'estilo', llave: ajena, nombre: 'Mi estilo' }])
  assert.equal(await enLoSuyo(env, { id: 'autor' }, ajena), true)
  // El que sigue a la vista mientras se revisa otro paquete también es suyo.
  pub('p3', 'otro', [{ tipo: 'estilo', llave: 'nuevo.estilo' }], JSON.stringify({ titulo: 't', texto: 't', adjuntos: JSON.stringify([{ tipo: 'estilo', llave: 'viejo.estilo' }]), aprobada: 1 }))
  assert.equal(await enLoSuyo(env, { id: 'otro' }, 'viejo.estilo'), true)
  assert.equal(await enLoSuyo(env, { id: 'otro' }, 'nuevo.estilo'), true)
})

test('armar 300 publicaciones de una vez (la tienda) no pasa del tope de D1', async () => {
  const { db, env } = base()
  for (let i = 0; i < 300; i++)
    db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, creada, actividad) VALUES (?, 'autor', 'estilos', 't', 't', '2026-11-01', '2026-11-01')").run(`p${i}`)
  db.prepare("INSERT INTO likes (publicacion, miembro) VALUES ('p250', 'yo')").run()
  const filas = db.prepare('SELECT * FROM publicaciones ORDER BY id').all() as never[]
  const pubs = await armar(env, { id: 'yo', clave: 'SLOTH-AAAA-AAAA-AAAA-AAAA' } as never, filas)
  assert.equal(pubs.length, 300)
  assert.deepEqual(pubs.filter((p) => p.megusta).map((p) => p.id), ['p250'])
})

test('tres cuentas recién hechas no ocultan nada, y lo del creador no se oculta solo', async () => {
  const { db, env } = base()
  const { default: worker } = await import('./index.ts')
  Object.assign(env, { ADMIN: 'llave-del-creador', PAYPAL_MODO: 'produccion' })
  const equipo = '0f8fad5bd9cb469fa16570867728950e'
  const ctx = { waitUntil() {} } as never
  const pedir = (ruta: string, cabeceras: Record<string, string>, cuerpo?: unknown) =>
    worker.fetch(new Request(`https://cobro.x${ruta}`, { method: cuerpo ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...cabeceras }, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) }), env, ctx)
  const cuenta = (n: number) => {
    const clave = `SLOTH-${'ABCDEFGHJK'[n].repeat(4)}-AAAA-AAAA-AAAA`
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, creada, modo) VALUES (?, ?, ?, 'gratis', 0, 0, 'gratis', '2026-11-01', 'produccion')").run(clave, clave, `c${n}@x.mx`)
    db.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?)').run(clave, equipo, new Date().toISOString())
    return { 'x-sloth-clave': clave, 'x-sloth-equipo': equipo }
  }
  const autora = cuenta(0)
  assert.equal((await pedir('/comunidad', autora)).status, 200)
  const creador = { authorization: 'Bearer llave-del-creador' }
  assert.equal((await pedir('/comunidad', creador)).status, 200)
  const idDe = (clave: string) => (db.prepare('SELECT id FROM miembros WHERE clave = ?').get(clave) as { id: string }).id
  const pub = (id: string, autor: string) =>
    db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, creada, actividad) VALUES (?, ?, 'general', 't', 't', '2026-11-01', '2026-11-01')").run(id, autor)
  pub('suya', idDe(autora['x-sloth-clave']))
  pub('anuncio', idDe('admin'))
  const reportes = (id: string) => (db.prepare('SELECT reportes FROM publicaciones WHERE id = ?').get(id) as { reportes: number }).reportes
  const reportan = []
  for (let n = 1; n <= 3; n++) {
    const c = cuenta(n)
    reportan.push(c)
    for (const id of ['suya', 'anuncio']) assert.equal((await pedir(`/comunidad/p/${id}/reportar`, c, { motivo: 'spam' })).status, 200)
  }
  assert.deepEqual([reportes('suya'), reportes('anuncio')], [0, 0], 'las cuentas nuevas no cuentan')
  // Ya con más de una semana en la comunidad, sí: se oculta lo de un miembro, lo del creador no.
  db.exec("UPDATE miembros SET creado = '2026-01-01'")
  const viejo = cuenta(4)
  await pedir('/comunidad', viejo)
  db.exec("UPDATE miembros SET creado = '2026-01-01'")
  for (const id of ['suya', 'anuncio']) await pedir(`/comunidad/p/${id}/reportar`, viejo, { motivo: 'spam' })
  assert.deepEqual([reportes('suya'), reportes('anuncio')], [4, 2])
})
