import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { RifaAdmin, RifaComunidad, SorteoRifa } from '../../shared/types.ts'
import type { Env } from './index.ts'
import { elegir, entregarPremio, ganada, nombreDe, premioDe, rifa, type QuienRifa } from './rifa.ts'
import type { RepartidorVoz } from './voz-mensual.ts'

/** Migraciones reales y D1 sobre SQLite; Resend no sale a internet. */
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
    DB: {
      prepare: (sql: string) => consulta(sql, []),
      batch: async (qs: ReturnType<typeof consulta>[]) => {
        // Como D1: todo o nada.
        db.exec('BEGIN')
        try {
          const r = []
          for (const q of qs) r.push(await q.run())
          db.exec('COMMIT')
          return r
        } catch (e) {
          db.exec('ROLLBACK')
          throw e
        }
      }
    },
    DESCARGAS: { head: async () => null },
    MONEDA: 'USD',
    PRECIO_MENSUAL: 15,
    PRECIO_MENSUAL_MXN: 299,
    CORREO_DE: 'Sloth <avisos@example.com>',
    CORREO_RESPUESTA: 'soporte@example.com',
    RESEND_API_KEY: 're_prueba'
  } as unknown as Env
  const esperas: Promise<unknown>[] = []
  const ctx = { waitUntil: (p: Promise<unknown>) => void esperas.push(p) } as unknown as ExecutionContext
  const anterior = globalThis.fetch
  const correos: { to: string[]; subject: string; text: string }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.resend.com/emails')
    correos.push(JSON.parse(String(init.body)))
    return Response.json({ id: 'correo' })
  }) as typeof fetch
  t.after(() => {
    globalThis.fetch = anterior
    db.close()
  })
  let n = 0
  /** Una persona con su licencia y su miembro de la comunidad. */
  const persona = (email: string, plan = 'cuenta', estado = 'gratis', hasta: string | null = null, fundador = 0, monto = 15, moneda = 'USD'): QuienRifa => {
    const id = `lic${++n}`
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, moneda, fundador, estado, modo, pagado_hasta, autorizada, creada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'produccion', ?, ?, ?)").run(
      id,
      `SLOTH-${id}`,
      email,
      plan,
      monto,
      moneda,
      fundador,
      estado,
      hasta,
      hasta ? '2026-11-01' : null,
      `2026-10-0${n}`
    )
    db.prepare("INSERT INTO miembros (id, clave, nombre, creado, visto) VALUES (?, ?, ?, '2026-11-01', '2026-11-01')").run(`m${n}`, `SLOTH-${id}`, email.startsWith('sin') ? '' : `Persona ${n}`)
    return { id: `m${n}`, clave: `SLOTH-${id}`, nombre: `Persona ${n}`, creador: false }
  }
  const creador: QuienRifa = { id: 'creador', clave: 'admin', nombre: 'Vancci', creador: true }
  const pedir = <T>(yo: QuienRifa, ruta: string, cuerpo?: object) =>
    rifa(new Request(`https://x${ruta}`, cuerpo ? { method: 'POST', body: JSON.stringify(cuerpo) } : {}), env, ctx, yo, ruta) as Promise<T>
  return { db, env, ctx, esperas, correos, persona, creador, pedir }
}

test('entra quien usa Sloth gratis o apoya con menos del sugerido; quien apoya con el sugerido o es Fundador ve por qué no', async (t) => {
  const { persona, creador, pedir } = preparar(t)
  const gratis = persona('gratis@example.com')
  const vencido = persona('vencido@example.com', 'mensual', 'cancelled', '2026-01-01')
  const apoya = persona('apoya@example.com', 'mensual', 'authorized', '2099-01-01')
  const fundador = persona('fundador@example.com', 'gratis', 'gratis')
  const poquito = persona('cinco@example.com', 'mensual', 'authorized', '2099-01-01', 0, 5)
  const pesos = persona('pesos@example.com', 'mensual', 'authorized', '2099-01-01', 0, 299, 'MXN')
  const anual = persona('anual@example.com', 'anual', 'authorized', '2099-01-01', 0, 150)
  await pedir(creador, '/comunidad/rifa/crear', {})

  const v = await pedir<RifaComunidad>(gratis, '/comunidad/rifa')
  // La comunidad no sabe qué se rifa: el creador lo elige al sortear.
  assert.deepEqual(Object.keys(v.abierta ?? {}).sort(), ['creada', 'ganadores', 'id', 'participantes'])
  assert.equal(v.fuera, undefined)
  assert.equal(v.correo, 'gratis@example.com')
  assert.equal((await pedir<RifaComunidad>(gratis, '/comunidad/rifa/participar', {})).participo, true)
  assert.equal((await pedir<RifaComunidad>(vencido, '/comunidad/rifa/participar', {})).participo, true)

  assert.match((await pedir<RifaComunidad>(apoya, '/comunidad/rifa')).fuera ?? '', /ya apoyas/)
  await assert.rejects(pedir(apoya, '/comunidad/rifa/participar', {}), /ya apoyas/)
  await assert.rejects(pedir(fundador, '/comunidad/rifa/participar', {}), /Fundador/)
  await assert.rejects(pedir(pesos, '/comunidad/rifa/participar', {}), /ya apoyas/)
  await assert.rejects(pedir(anual, '/comunidad/rifa/participar', {}), /ya apoyas/)
  assert.equal((await pedir<RifaComunidad>(poquito, '/comunidad/rifa/participar', {})).participo, true)
  await assert.rejects(pedir(creador, '/comunidad/rifa/participar', {}), /creador/)
  // Pulsar dos veces no cuenta dos.
  assert.equal((await pedir<RifaComunidad>(gratis, '/comunidad/rifa/participar', {})).abierta?.participantes, 3)
})

test('la rifa sigue abierta entre sorteos, nadie gana dos veces y al cerrarla la comunidad ve quién ganó qué', async (t) => {
  const { db, persona, creador, pedir, esperas, correos, env } = preparar(t)
  const a = persona('a@example.com')
  const b = persona('b@example.com')
  const c = persona('c@example.com')
  await pedir(creador, '/comunidad/rifa/crear', {})
  await assert.rejects(pedir(creador, '/comunidad/rifa/crear', {}), /Ya hay una rifa abierta/)
  const id = (await pedir<RifaAdmin>(creador, '/comunidad/rifa/admin')).abierta!.id
  const clave = { premio: 'Una clave de Sloth', creditos: 0, ganadores: 1 }
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id, ...clave }), /no hay participantes/)
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id, creditos: 0, ganadores: 1 }), /Di qué se rifa/)
  await pedir(a, '/comunidad/rifa/participar', {})
  await pedir(b, '/comunidad/rifa/participar', {})
  // b empieza a apoyar después de entrar: ya no gana.
  db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, moneda, estado, modo, pagado_hasta, autorizada, creada) VALUES ('apoyo-b', 'SLOTH-B2', 'b@example.com', 'mensual', 15, 'USD', 'authorized', 'produccion', '2099-01-01', '2026-11-05', '2026-11-05')").run()
  assert.match((await pedir<RifaAdmin>(creador, '/comunidad/rifa/admin')).abierta!.lista[1].fuera ?? '', /ya apoyas/)

  // Primer sorteo: solo a puede ganar.
  const s1 = await pedir<SorteoRifa>(creador, '/comunidad/rifa/sortear', { rifa: id, ...clave })
  assert.deepEqual(s1.ganadores.map((g) => g.nombre), ['Persona 1'])
  await Promise.all(esperas)
  assert.equal(correos.length, 1)
  assert.deepEqual(correos[0].to, ['a@example.com'])
  assert.match(correos[0].text, /ganaste la rifa de Sloth: Una clave de Sloth/)
  assert.deepEqual(await ganada(env, a.id), { rifa: id, premio: 'Una clave de Sloth', creditos: 0, entregados: false })
  // La rifa sigue abierta: a ve que ya ganó y la comunidad, quién.
  const va = await pedir<RifaComunidad>(a, '/comunidad/rifa')
  assert.equal(va.ganaste, 'Una clave de Sloth')
  assert.deepEqual(va.abierta?.ganadores, ['Persona 1'])
  // Nadie más puede ganar todavía: a ya ganó y b quedó fuera.
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id, ...clave }), /no hay participantes que no hayan ganado/)

  // c entra entre sorteos y gana el segundo, aunque se pidan más ganadores de los que hay.
  await pedir(c, '/comunidad/rifa/participar', {})
  const s2 = await pedir<SorteoRifa>(creador, '/comunidad/rifa/sortear', { rifa: id, premio: 'Una playera', creditos: 0, ganadores: 3 })
  assert.deepEqual(s2.ganadores.map((g) => g.nombre), ['Persona 3'])
  assert.deepEqual(s2.participantes.map((p) => p.nombre), ['Persona 3'])
  const panel = await pedir<RifaAdmin>(creador, '/comunidad/rifa/admin')
  assert.deepEqual(panel.ganadores.map((g) => [g.email, g.premio]), [['c@example.com', 'Una playera'], ['a@example.com', 'Una clave de Sloth']])
  assert.equal(panel.abierta?.lista.find((p) => p.email === 'a@example.com')?.gano, 'Una clave de Sloth')

  // Al cerrarla ya no se sortea, y la comunidad ve quién ganó qué.
  await pedir(creador, '/comunidad/rifa/cerrar', { rifa: id })
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id, ...clave }), /cerrada/)
  const vb = await pedir<RifaComunidad>(b, '/comunidad/rifa')
  assert.equal(vb.abierta, undefined)
  assert.deepEqual(vb.ultima?.ganadores, [{ nombre: 'Persona 1', premio: 'Una clave de Sloth' }, { nombre: 'Persona 3', premio: 'Una playera' }])
  await pedir(a, '/comunidad/rifa/visto', { rifa: id })
  assert.equal(await ganada(env, a.id), undefined)
  // Una cerrada sin ganadores queda cancelada y no sale en la comunidad.
  await pedir(creador, '/comunidad/rifa/crear', {})
  const otra = (await pedir<RifaAdmin>(creador, '/comunidad/rifa/admin')).abierta!.id
  await pedir(creador, '/comunidad/rifa/cerrar', { rifa: otra })
  assert.equal((db.prepare('SELECT estado FROM rifas WHERE id = ?').get(otra) as { estado: string }).estado, 'cancelada')
  assert.equal((await pedir<RifaComunidad>(b, '/comunidad/rifa')).ultima?.ganadores.length, 2)
})

test('una lista de premios se reparte en orden, del mayor al menor, sin repetir ganador', async (t) => {
  const { db, persona, creador, pedir } = preparar(t)
  const gente = ['a', 'b', 'c', 'd'].map((x) => persona(`${x}@example.com`))
  await pedir(creador, '/comunidad/rifa/crear', {})
  const id = (await pedir<RifaAdmin>(creador, '/comunidad/rifa/admin')).abierta!.id
  for (const g of gente) await pedir(g, '/comunidad/rifa/participar', {})
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id, premios: [] }), /de 1 a 20 premios/)
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id, premios: [{ ganadores: 1, creditos: 0 }] }), /Di qué se rifa/)
  // Pide 1 + 2 + 5 ganadores con solo 4 participantes: el último premio se queda con uno.
  const s = await pedir<SorteoRifa>(creador, '/comunidad/rifa/sortear', {
    rifa: id,
    premios: [
      { premio: 'Premio mayor', ganadores: 1, creditos: 0 },
      { premio: 'Segundo lugar', ganadores: 2, creditos: 0 },
      { premio: 'Una playera', ganadores: 5, creditos: 0 }
    ]
  })
  assert.deepEqual(s.ganadores.map((g) => g.premio), ['Premio mayor', 'Segundo lugar', 'Segundo lugar', 'Una playera'])
  assert.equal(new Set(s.ganadores.map((g) => g.externo)).size, 4)
  assert.deepEqual(db.prepare('SELECT premio, ganadores FROM rifa_sorteos ORDER BY rowid').all().map((x) => ({ ...x })), [
    { premio: 'Premio mayor', ganadores: 1 },
    { premio: 'Segundo lugar', ganadores: 2 },
    { premio: 'Una playera', ganadores: 1 }
  ])
  const panel = await pedir<RifaAdmin>(creador, '/comunidad/rifa/admin')
  assert.equal(panel.abierta?.lista.filter((p) => p.gano).length, 4)
  // Ya ganaron todos: la rifa sigue abierta, pero nadie más puede ganar.
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id, premios: [{ premio: 'Otro', ganadores: 1, creditos: 0 }] }), /no hay participantes que no hayan ganado/)
})

test('los créditos se suman una vez; un corte en la suma queda para revisar', async (t) => {
  const { db, env, correos } = preparar(t)
  db.prepare("INSERT INTO rifas (id, estado, creada) VALUES ('r1', 'abierta', '2026-11-07')").run()
  const fila = (externo: string) => ({ rifa: 'r1', externo, miembro: `m-${externo}`, email: `${externo}@example.com`, creditos: 10000, estado: 'pendiente' as const, intento: null, correo: null, premio: premioDe(10000) })
  for (const e of ['uno', 'dos'])
    db.prepare("INSERT INTO rifa_ganadores (rifa, externo, sorteo, miembro, email, premio, creditos, estado, cuando) VALUES ('r1', ?, 's1', ?, ?, ?, 10000, 'pendiente', '2026-11-07')").run(e, `m-${e}`, `${e}@example.com`, premioDe(10000))
  const sumas: string[] = []
  const repartidor: RepartidorVoz = {
    preparar: async () => 'llave',
    quedan: async () => 0,
    sumar: async (externo, _llave, cantidad) => {
      if (externo === 'dos') throw new Error('se cortó')
      sumas.push(`${externo}:${cantidad}`)
    }
  }
  await entregarPremio(env, fila('uno'), repartidor)
  await entregarPremio(env, fila('uno'), repartidor)
  await entregarPremio(env, fila('dos'), repartidor)
  assert.deepEqual(sumas, ['uno:10000'])
  const estado = (e: string) => (db.prepare('SELECT estado, correo FROM rifa_ganadores WHERE externo = ?').get(e) as { estado: string; correo: string | null })
  assert.equal(estado('uno').estado, 'entregado')
  assert.ok(estado('uno').correo)
  assert.equal(estado('dos').estado, 'revisar')
  assert.equal(correos.length, 1)
  assert.match(correos[0].subject, /1 llave de 10,000 créditos de Sloth/)
  assert.match(correos[0].text, /10,000 CREDITOS DE VOZ/)
})

test('elegir da distintos, a lo más los que hay; la ruleta tapa el correo de quien no tiene nombre', () => {
  const lista = ['a', 'b', 'c', 'd']
  const tres = elegir(lista, 3)
  assert.equal(new Set(tres).size, 3)
  assert.ok(tres.every((x) => lista.includes(x)))
  assert.deepEqual(elegir(lista, 10).sort(), lista)
  assert.deepEqual(elegir(lista, 2, () => 0), ['a', 'b'])
  assert.equal(nombreDe({ nombre: '', email: 'arisa@proton.me' }), 'ar•••@proton.me')
  assert.equal(nombreDe({ nombre: 'Moy', email: 'x@y.z' }), 'Moy')
  // Es lo que se lleva cada uno, aunque ganen varios.
  assert.equal(premioDe(10000), '1 llave de 10,000 créditos de Sloth')
  assert.equal(premioDe(236483), '1 llave de 236,483 créditos de Sloth')
})
