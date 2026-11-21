// Los estilos pre-aprobados por Sloth y la versión que sigue a la vista mientras se revisa otra (ADR 0024), de punta a
// punta: con las migraciones reales, D1 sobre SQLite y R2 de mentira, como los pide la app.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import type { AvisoComunidad, FeedComunidad, PublicacionComunidad } from '../../shared/types.ts'
import worker from './index.ts'

const EQUIPO = '0f8fad5bd9cb469fa16570867728950e'
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never

function cobro() {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  type Consulta = { sql: string; bind(...mas: unknown[]): Consulta; all(): Promise<{ results: unknown[] }>; first(): Promise<unknown>; run(): Promise<{ meta: { changes: number } }> }
  const consulta = (sql: string, args: unknown[]): Consulta => ({
    sql,
    bind: (...mas: unknown[]) => consulta(sql, [...args, ...mas]),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
  })
  // El batch de D1 da las filas de cada consulta: las que leen, se leen; las demás, se corren.
  const DB = {
    prepare: (sql: string) => consulta(sql, []),
    batch: async (qs: Consulta[]) => {
      const r = []
      for (const q of qs) r.push(/^\s*SELECT/i.test(q.sql) ? { ...(await q.all()), meta: { changes: 0 } } : { results: [], ...(await q.run()) })
      return r
    }
  }
  /** R2: cada archivo con quién lo subió. */
  const archivos = new Map<string, string>()
  const DESCARGAS = {
    head: async (k: string) => (archivos.has(k) ? { size: 3, customMetadata: { miembro: archivos.get(k) }, httpMetadata: {} } : null),
    get: async (k: string) => (archivos.has(k) ? { size: 3, body: 'abc', httpEtag: '"e"', customMetadata: { miembro: archivos.get(k) }, httpMetadata: {}, writeHttpMetadata() {} } : null),
    delete: async (ks: string[]) => ks.forEach((k) => archivos.delete(k))
  }
  const env = { PAYPAL_MODO: 'produccion', MONEDA: 'USD', ORIGEN: 'https://cobro.x', ADMIN: 'admin', DB, DESCARGAS }
  /** Un miembro con su cuenta gratis en esta computadora. */
  const miembro = (id: string) => {
    const clave = `SLOTH-${id[0].toUpperCase().repeat(4)}-AAAA-AAAA-AAAA`
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, creada, modo) VALUES (?, ?, ?, 'cuenta', 0, 0, 'gratis', '2026-11-01', 'produccion')").run(clave, clave, `${id}@x.com`)
    db.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?)').run(clave, EQUIPO, '2026-11-19')
    db.prepare("INSERT INTO miembros (id, clave, nombre, creado, visto) VALUES (?, ?, ?, '2026-11-01', '2026-11-19')").run(id, clave, id)
    return { 'x-sloth-clave': clave, 'x-sloth-equipo': EQUIPO }
  }
  const creador = { authorization: 'Bearer admin' }
  const pedir = async <T>(quien: Record<string, string>, ruta: string, cuerpo?: unknown): Promise<{ status: number; json: T }> => {
    const r = await worker.fetch(
      new Request(`https://cobro.x${ruta}`, cuerpo === undefined ? { headers: quien } : { method: 'POST', headers: { ...quien, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }),
      env as never,
      ctx
    )
    return { status: r.status, json: (await r.json().catch(() => ({}))) as T }
  }
  /** Un estilo completo (lo que lleva todo estilo), con sus archivos subidos por `de`. */
  const estilo = (n: string, de: string, nombre = `Estilo ${n}`) => {
    const llave = (ext: string) => `${n.repeat(20).slice(0, 20)}.${ext}`
    for (const ext of ['estilo', 'mp4', 'hilo']) archivos.set(`comunidad/${llave(ext)}`, de)
    return [
      {
        tipo: 'estilo',
        llave: llave('estilo'),
        nombre,
        guia: { das: 'El tema.', entrega: 'Un vertical.', ejemplo: 'Hazme un video del ciclo del agua.', herramientas: ['codigo'], agentes: ['claude'] },
        prueba: { agente: 'claude', modelo: 'claude-opus-5-5', costo: 0.5, segundos: 200, evidencia: llave('hilo') }
      },
      { tipo: 'video', llave: llave('mp4') }
    ]
  }
  return { db, archivos, miembro, creador, pedir, estilo }
}

test('Sloth pre-aprueba el estilo de alguien: ya lo ve la comunidad, a su autor le llega un aviso y puede dejarlo así', async () => {
  const c = cobro()
  const ana = c.miembro('ana')
  const caro = c.miembro('caro')
  const publicado = await c.pedir<PublicacionComunidad>(ana, '/comunidad/publicar', { categoria: 'estilos', titulo: 'Recetas', texto: 'Recetas en 30 segundos.', adjuntos: c.estilo('a', 'ana') })
  assert.equal(publicado.status, 200)
  const id = publicado.json.id
  const estilos = async (quien: Record<string, string>) => (await c.pedir<FeedComunidad>(quien, '/comunidad?categoria=estilos')).json.publicaciones
  assert.deepEqual(await estilos(caro), [], 'en revisión, nadie más lo ve')

  // El creador lo probó y lo arregló: sube su paquete a la misma publicación, pre-aprobado.
  const arreglado = c.estilo('b', 'creador', 'Recetas arreglado')
  const pre = await c.pedir<PublicacionComunidad>(c.creador, `/comunidad/p/${id}`, { titulo: 'Recetas', texto: 'Recetas en 30 segundos, ya probado.', adjuntos: arreglado, aprobada: 2 })
  assert.equal(pre.status, 200)
  assert.equal(pre.json.preaprobada, true)
  const vista = await estilos(caro)
  assert.deepEqual(vista.map((p) => [p.id, p.preaprobada, p.porAprobar]), [[id, true, undefined]])
  assert.equal(vista[0].autor.id, 'ana', 'sigue siendo de su autor')
  // Lo de antes ya no se usa: su paquete se borró.
  assert.equal(c.archivos.has('comunidad/aaaaaaaaaaaaaaaaaaaa.estilo'), false)
  const avisos = (await c.pedir<{ avisos: AvisoComunidad[] }>(ana, '/comunidad/avisos')).json.avisos
  // Y, como al aprobarlo, cómo poner su Binance ID para cobrar su parte del fondo (un comentario).
  assert.deepEqual(avisos.map((a) => a.tipo).sort(), ['comento', 'preaprobado'])

  // Su autor baja el paquete que le arregló Sloth aunque no apoye; otro que no apoya, no.
  assert.equal((await c.pedir(ana, '/comunidad/archivo/bbbbbbbbbbbbbbbbbbbb.estilo')).status, 200)
  assert.equal((await c.pedir(caro, '/comunidad/archivo/bbbbbbbbbbbbbbbbbbbb.estilo')).status, 402)

  // Solo su autor dice que así está bien, y queda aprobado.
  assert.equal((await c.pedir(caro, `/comunidad/p/${id}/conforme`, {})).status, 403)
  const bien = await c.pedir<PublicacionComunidad>(ana, `/comunidad/p/${id}/conforme`, {})
  assert.equal(bien.status, 200)
  assert.equal(bien.json.preaprobada, undefined)
  assert.equal(bien.json.porAprobar, undefined)
  assert.equal((await c.pedir(ana, `/comunidad/p/${id}/conforme`, {})).status, 409)
})

test('si su autor manda otra versión, la comunidad sigue viendo la de antes hasta que se apruebe la nueva', async () => {
  const c = cobro()
  const ana = c.miembro('ana')
  const caro = c.miembro('caro')
  const id = (await c.pedir<PublicacionComunidad>(ana, '/comunidad/publicar', { categoria: 'estilos', titulo: 'Recetas', texto: 'Recetas.', adjuntos: c.estilo('a', 'ana') })).json.id
  await c.pedir(c.creador, `/comunidad/p/${id}`, { titulo: 'Recetas de Sloth', texto: 'Recetas, probado.', adjuntos: c.estilo('b', 'creador'), aprobada: 2 })

  // Ana manda su versión.
  const suya = await c.pedir<PublicacionComunidad>(ana, `/comunidad/p/${id}`, { titulo: 'Recetas de Ana', texto: 'Mis recetas.', adjuntos: c.estilo('c', 'ana') })
  assert.equal(suya.status, 200)
  assert.deepEqual([suya.json.titulo, suya.json.porAprobar, suya.json.publicaAun], ['Recetas de Ana', true, true])
  const ver = async (quien: Record<string, string>) => (await c.pedir<{ publicacion: PublicacionComunidad }>(quien, `/comunidad/p/${id}`)).json.publicacion
  const deCaro = await ver(caro)
  assert.deepEqual([deCaro.titulo, deCaro.preaprobada, deCaro.porAprobar, deCaro.publicaAun], ['Recetas de Sloth', true, undefined, undefined])
  assert.equal(deCaro.adjuntos.find((a) => a.tipo === 'estilo')?.llave, 'bbbbbbbbbbbbbbbbbbbb.estilo')
  // En la tienda y en el feed, lo mismo.
  const tienda = (await c.pedir<{ estilos: { publicacion: PublicacionComunidad }[] }>(caro, '/comunidad/estilos')).json.estilos
  assert.deepEqual(tienda.map((e) => e.publicacion.titulo), ['Recetas de Sloth'])
  // Los dos paquetes siguen: el que se ve y el que se revisa.
  assert.equal(c.archivos.has('comunidad/bbbbbbbbbbbbbbbbbbbb.estilo'), true)
  assert.equal(c.archivos.has('comunidad/cccccccccccccccccccc.estilo'), true)

  // Otra versión más mientras se revisa: lo de antes que se ve no cambia.
  await c.pedir(ana, `/comunidad/p/${id}`, { titulo: 'Recetas de Ana 2', texto: 'Mis recetas.', adjuntos: c.estilo('d', 'ana') })
  assert.equal((await ver(caro)).titulo, 'Recetas de Sloth')
  assert.equal(c.archivos.has('comunidad/cccccccccccccccccccc.estilo'), false, 'la versión que nadie ve ya se borró')

  // Se aprueba la nueva: ya es la que ven todos, y la de Sloth se borra.
  const aprobada = await c.pedir<PublicacionComunidad>(c.creador, `/comunidad/p/${id}`, { aprobada: true })
  assert.equal(aprobada.status, 200)
  const ahora = await ver(caro)
  assert.deepEqual([ahora.titulo, ahora.preaprobada, ahora.porAprobar], ['Recetas de Ana 2', undefined, undefined])
  assert.equal(c.archivos.has('comunidad/bbbbbbbbbbbbbbbbbbbb.estilo'), false)
  assert.equal(c.archivos.has('comunidad/dddddddddddddddddddd.estilo'), true)
  assert.equal(c.db.prepare('SELECT publica FROM publicaciones WHERE id = ?').get(id)?.publica, null)
})

test('al quitarle la aprobación a uno con otra versión en revisión, deja de verse entero', async () => {
  const c = cobro()
  const ana = c.miembro('ana')
  const caro = c.miembro('caro')
  const id = (await c.pedir<PublicacionComunidad>(ana, '/comunidad/publicar', { categoria: 'estilos', titulo: 'Recetas', texto: 'Recetas.', adjuntos: c.estilo('a', 'ana') })).json.id
  await c.pedir(c.creador, `/comunidad/p/${id}`, { aprobada: true })
  await c.pedir(ana, `/comunidad/p/${id}`, { titulo: 'Recetas nuevas', texto: 'Recetas.', adjuntos: c.estilo('c', 'ana') })
  assert.equal((await c.pedir(caro, `/comunidad/p/${id}`)).status, 200)
  await c.pedir(c.creador, `/comunidad/p/${id}`, { aprobada: false })
  assert.equal((await c.pedir(caro, `/comunidad/p/${id}`)).status, 404)
  assert.equal(c.archivos.has('comunidad/aaaaaaaaaaaaaaaaaaaa.estilo'), false)
})
