import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { Miembro } from './comunidad.ts'
import type { Env } from './index.ts'
import { cerrar, mio, pagado, participar, partesDe, reparto, salir } from './reparto.ts'
import { estimado } from './tienda.ts'

const estilo = (id: string, autor: string, participa = true) => ({ id, titulo: id.toUpperCase(), autor, participa })
const puntos = (lista: Record<string, [number, number]>) => new Map(Object.entries(lista).map(([id, [p, personas]]) => [id, { puntos: p, personas }]))

test('a cada quien le tocan los puntos de sus estilos; quien no participa queda fuera y sin puntos no hay parte', () => {
  const { dentro, fuera } = partesDe(
    [estilo('a1', 'ana'), estilo('a2', 'ana'), estilo('b1', 'beto'), estilo('c1', 'caro', false), estilo('d1', 'dani')],
    puntos({ a1: [4, 1], a2: [26, 6], b1: [10, 2], c1: [13, 1], d1: [0, 0] })
  )
  assert.deepEqual([...dentro.keys()], ['ana', 'beto'])
  assert.deepEqual(dentro.get('ana'), {
    puntos: 30,
    estilos: [
      { id: 'a2', titulo: 'A2', puntos: 26, personas: 6 },
      { id: 'a1', titulo: 'A1', puntos: 4, personas: 1 }
    ]
  })
  assert.deepEqual([...fuera], [['caro', 13]])
})

test('el fondo se reparte según los puntos de quienes participan, sin repartir de más', () => {
  const fondo = { periodo: '2026-12', mes: '', cierra: '', cuentas: [], montos: [{ moneda: 'USD', monto: 100 }] }
  // 30 y 10 puntos entre 40: tres cuartos y un cuarto. Los 13 de quien no participa no entran al total.
  assert.deepEqual(estimado(fondo, 30, 40), [{ moneda: 'USD', monto: 75 }])
  assert.deepEqual(estimado(fondo, 10, 40), [{ moneda: 'USD', monto: 25 }])
  // Los centavos van hacia abajo: tres partes iguales de $100 no suman más de $100.
  assert.deepEqual(estimado(fondo, 1, 3), [{ moneda: 'USD', monto: 33.33 }])
  assert.deepEqual(estimado(fondo, 0, 40), [])
})

/** Migraciones reales y D1 sobre SQLite. Stripe dice que entraron $100 con tarjeta; los correos no salen a internet. */
function preparar(t: { after(fn: () => void): void }) {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const lee = (sql: string) => /^\s*(SELECT|WITH)/i.test(sql)
  const consulta = (sql: string, args: unknown[]) => ({
    bind: (...mas: unknown[]) => consulta(sql, mas),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])), meta: { changes: 0 } }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => ({ results: [], meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
    hacer: async () => (lee(sql) ? { results: db.prepare(sql).all(...(args as never[])), meta: { changes: 0 } } : { results: [], meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
  })
  const env = {
    DB: {
      prepare: (sql: string) => consulta(sql, []),
      batch: async (qs: ReturnType<typeof consulta>[]) => {
        db.exec('BEGIN')
        try {
          const r = []
          for (const q of qs) r.push(await q.hacer())
          db.exec('COMMIT')
          return r
        } catch (e) {
          db.exec('ROLLBACK')
          throw e
        }
      }
    },
    MONEDA: 'USD',
    FIRMA: 'firma',
    STRIPE_SECRET_KEY: 'sk_prueba',
    CORREO_DE: 'Sloth <avisos@example.com>',
    CORREO_RESPUESTA: 'soporte@example.com',
    RESEND_API_KEY: 're_prueba'
  } as unknown as Env
  const anterior = globalThis.fetch
  const correos: { to: string[]; subject: string; text: string }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (url === 'https://api.resend.com/emails') {
      correos.push(JSON.parse(String(init.body)))
      return Response.json({ id: 'correo' })
    }
    const u = new URL(url)
    assert.equal(u.hostname, 'api.stripe.com')
    // Un mensual de Sloth: su factura lleva la licencia, y el cobro, su pago.
    const cobros = [{ id: 'txn_1', amount: 10000, fee: 0, net: 10000, currency: 'usd', reporting_category: 'charge', source: { payment_intent: 'pi_1' } }]
    const facturas = [{ id: 'in_1', created: 0, total: 10000, tax: 0, payment_intent: 'pi_1', subscription_details: { metadata: { licencia: 'l-1' } } }]
    const datos = { '/v1/balance_transactions': cobros, '/v1/invoices': facturas }[u.pathname] ?? []
    return Response.json({ data: datos, has_more: false })
  }) as typeof fetch
  t.after(() => {
    globalThis.fetch = anterior
    db.close()
  })
  /** Una persona con su cuenta y su lugar en la comunidad. */
  const persona = (id: string): Miembro => {
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, estado, modo, creada) VALUES (?, ?, ?, 'cuenta', 0, 'gratis', 'produccion', '2026-10-01')").run(`l-${id}`, `K-${id}`, `${id}@example.com`)
    db.prepare("INSERT INTO miembros (id, clave, nombre, creado, visto) VALUES (?, ?, ?, '2026-10-01', '2026-10-01')").run(id, `K-${id}`, id)
    return { id, clave: `K-${id}`, nombre: id, foto: null, creado: '2026-10-01', visto: '2026-10-01', creditos: 0 }
  }
  const estilo = (id: string, autor: string) =>
    db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, adjuntos, creada, actividad, aprobada) VALUES (?, ?, 'estilos', ?, '', '[]', '2026-11-10', '2026-11-10', 1)").run(id, autor, `Estilo ${id}`)
  const video = (publicacion: string, quien: string, huella: string) =>
    db.prepare("INSERT INTO estilo_usos (publicacion, tipo, equipo, huella, miembro, red, prueba, periodo, creado) VALUES (?, 'video', ?, ?, ?, ?, 'p.webp', '2026-12', '2026-12-05')").run(publicacion, `pc-${quien}`, huella, quien, `red-${quien}`)
  const pide = (ip = '189.10.20.30') => new Request('https://x/', { headers: { 'cf-connecting-ip': ip } })
  return { db, env, correos, persona, estilo, video, pide }
}

test('participar es de quien quiera, con un Binance ID por persona; el reparto se cierra una vez y lo de después no lo mueve', async (t) => {
  const { db, env, correos, persona, estilo, video, pide } = preparar(t)
  const creador: Miembro = { id: 'yo', clave: 'admin', nombre: 'Creador', foto: null, creado: '', visto: '', creditos: 0 }
  db.prepare("INSERT INTO miembros (id, clave, nombre, creado, visto) VALUES ('yo', 'admin', 'Creador', '2026-10-01', '2026-10-01')").run()
  const [ana, beto, caro, dani] = ['ana', 'beto', 'caro', 'dani'].map(persona)
  estilo('ea', 'ana')
  estilo('eb', 'beto')
  // Dos personas hicieron videos con el de Ana (3 + 3 puntos, y 2 + 1 videos) y una con el de Beto (3 + 1).
  video('ea', 'caro', 'h1')
  video('ea', 'caro', 'h2')
  video('ea', 'dani', 'h3')
  video('eb', 'caro', 'h4')
  const diciembre = Date.parse('2026-12-15T18:00:00Z')
  const enero = Date.parse('2027-01-02T18:00:00Z')
  const ver = (ahora: number) => reparto(env, creador, new URL('https://x/?periodo=2026-12'), ahora)

  // Nadie participa aún: los puntos se ven, pero nadie se lleva nada.
  let r = await ver(diciembre)
  assert.deepEqual([r.puntos, r.partes.length, r.fuera.map((f) => [f.miembro.id, f.puntos])], [0, 0, [['ana', 9], ['beto', 4]]])
  assert.deepEqual((await mio(env, ana)).estimado, [{ moneda: 'USD', monto: 50 }], 'lo que se llevaría si participara')

  // Ana participa. Un Binance ID mal escrito no pasa, y el suyo no lo puede usar otra cuenta.
  await assert.rejects(participar(pide(), env, ana, { binance: 'mi-binance' }), /no parece un Binance ID/)
  let suyo = await participar(pide(), env, ana, { binance: '1234 5678' })
  assert.deepEqual([suyo.participa, suyo.binance, suyo.puntos, suyo.estimado], [true, '••••5678', 9, [{ moneda: 'USD', monto: 50 }]])
  await assert.rejects(participar(pide(), env, beto, { binance: '12345678' }), /ya está en otra cuenta/)
  await assert.rejects(participar(pide(), env, creador, { binance: '99999999' }), /no se lleva del fondo/)
  assert.deepEqual(correos.map((c) => [c.to[0], c.subject]), [['ana@example.com', 'Cambió adónde se te paga el fondo de Sloth']])
  assert.match(correos[0].text, /termina en 5678/)

  // En vivo: todo el fondo ($50, la mitad de $100) va a quien participa; Beto, con puntos, queda fuera. Solo lo ve el creador.
  r = await ver(diciembre)
  assert.equal(r.mes, 'noviembre y diciembre de 2026')
  assert.deepEqual([r.termino, r.cerrado, r.puntos], [false, undefined, 9])
  assert.deepEqual(r.partes.map((p) => [p.miembro.id, p.correo, p.binance, p.puntos, p.montos, p.avisos]), [['ana', 'ana@example.com', '12345678', 9, [{ moneda: 'USD', monto: 50 }], []]])
  assert.deepEqual(r.partes[0].estilos, [{ id: 'ea', titulo: 'Estilo ea', puntos: 9, personas: 2 }])
  assert.deepEqual(r.fuera.map((f) => [f.miembro.id, f.puntos]), [['beto', 4]])
  await assert.rejects(reparto(env, ana, new URL('https://x/'), diciembre), /solo lo ve el creador/)
  await assert.rejects(cerrar(env, ana, { periodo: '2026-12' }, enero), /solo lo hace el creador/)

  // No se cierra antes de que termine, ni un periodo que no existe.
  await assert.rejects(cerrar(env, creador, { periodo: '2026-12' }, diciembre), /aún no termina/)
  await assert.rejects(cerrar(env, creador, { periodo: '2026-11' }, enero), /no existe/)

  // Ana cambia su Binance ID a última hora: se le avisa por correo y el creador lo ve antes de pagar.
  suyo = await participar(pide('200.1.2.3'), env, ana, { binance: '87654321' })
  assert.equal(suyo.binance, '••••4321')
  assert.match(correos.at(-1)!.text, /Se cambió el Binance ID.*4321/)
  db.prepare("UPDATE binance_cambios SET cuando = '2026-12-31T20:00:00.000Z' WHERE binance = '87654321'").run()
  r = await cerrar(env, creador, { periodo: '2026-12' }, enero)
  assert.ok(r.cerrado)
  assert.deepEqual(r.partes.map((p) => [p.miembro.id, p.binance, p.montos]), [['ana', '87654321', [{ moneda: 'USD', monto: 50 }]]])
  assert.match(r.partes[0].avisos.join(), /Cambió su Binance ID hace 2 días/)

  // Ya cerrado, queda fijo: ni que Beto entre, ni que Ana cambie su ID o salga, ni cerrarlo otra vez.
  await participar(pide(), env, beto, { binance: '55555555' })
  await participar(pide(), env, ana, { binance: '11112222' })
  await salir(pide(), env, ana)
  db.prepare("UPDATE estilo_usos SET descartado = 1 WHERE publicacion = 'ea'").run()
  r = await cerrar(env, creador, { periodo: '2026-12' }, enero)
  assert.deepEqual(r.partes.map((p) => [p.miembro.id, p.binance, p.puntos, p.montos]), [['ana', '87654321', 9, [{ moneda: 'USD', monto: 50 }]]])
  assert.equal((await mio(env, ana)).participa, false)

  // Pagarla avisa por correo una sola vez, y ella lo ve entre sus partes.
  const antes = correos.length
  await assert.rejects(pagado(env, ana, { periodo: '2026-12', miembro: 'ana', pagado: true }), /solo lo hace el creador/)
  await assert.rejects(pagado(env, creador, { periodo: '2026-12', miembro: 'beto', pagado: true }), /no está en el reparto/)
  await pagado(env, creador, { periodo: '2026-12', miembro: 'ana', pagado: true, referencia: ' 4471 9920 ' })
  await pagado(env, creador, { periodo: '2026-12', miembro: 'ana', pagado: true, referencia: '44719920' })
  assert.equal(correos.length, antes + 1)
  assert.match(correos.at(-1)!.text, /50\.00 USD.*noviembre y diciembre de 2026[\s\S]*termina en 4321/)
  r = await ver(enero)
  assert.deepEqual([!!r.partes[0].pagado, r.partes[0].referencia], [true, '44719920'])
  const partes = (await mio(env, ana)).partes
  assert.deepEqual(partes.map((p) => [p.periodo, p.mes, p.montos, !!p.pagado]), [['2026-12', 'noviembre y diciembre de 2026', [{ moneda: 'USD', monto: 50 }], true]])
  // Y se puede deshacer si se marcó por error.
  await pagado(env, creador, { periodo: '2026-12', miembro: 'ana', pagado: false })
  assert.equal((await ver(enero)).partes[0].pagado, undefined)
  void [caro, dani]
})
