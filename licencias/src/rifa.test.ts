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
        db.exec('BEGIN')
        const r = []
        for (const q of qs) r.push(await q.run())
        db.exec('COMMIT')
        return r
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
  await pedir(creador, '/comunidad/rifa/crear', { premio: 'Una clave de Sloth', creditos: 0, ganadores: 1 })

  const v = await pedir<RifaComunidad>(gratis, '/comunidad/rifa')
  assert.equal(v.abierta?.premio, 'Una clave de Sloth')
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

test('una sola abierta, el sorteo deja fuera a quien empezó a apoyar y avisa al ganador', async (t) => {
  const { db, persona, creador, pedir, esperas, correos, env } = preparar(t)
  const a = persona('a@example.com')
  const b = persona('b@example.com')
  await pedir(creador, '/comunidad/rifa/crear', { premio: 'Una clave de Sloth', creditos: 0, ganadores: 5 })
  await assert.rejects(pedir(creador, '/comunidad/rifa/crear', { premio: 'Otra', creditos: 0, ganadores: 1 }), /Ya hay una rifa abierta/)
  const id = (await pedir<RifaAdmin>(creador, '/comunidad/rifa/admin')).abierta!.id
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id }), /no hay participantes/)
  await pedir(a, '/comunidad/rifa/participar', {})
  await pedir(b, '/comunidad/rifa/participar', {})
  // b empieza a apoyar después de entrar: ya no gana.
  db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, moneda, estado, modo, pagado_hasta, autorizada, creada) VALUES ('apoyo-b', 'SLOTH-B2', 'b@example.com', 'mensual', 15, 'USD', 'authorized', 'produccion', '2099-01-01', '2026-11-05', '2026-11-05')").run()
  assert.match((await pedir<RifaAdmin>(creador, '/comunidad/rifa/admin')).abierta!.lista[1].fuera ?? '', /ya apoyas/)

  const s = await pedir<SorteoRifa>(creador, '/comunidad/rifa/sortear', { rifa: id })
  assert.deepEqual(s.ganadores.map((g) => g.nombre), ['Persona 1'])
  assert.equal(s.participantes.length, 1)
  await assert.rejects(pedir(creador, '/comunidad/rifa/sortear', { rifa: id }), /ya se sorteó/)
  await Promise.all(esperas)
  // Sin créditos, el premio es a mano: el correo sale igual, y el aviso espera en su Sloth.
  assert.equal(correos.length, 1)
  assert.deepEqual(correos[0].to, ['a@example.com'])
  assert.match(correos[0].text, /ganaste la rifa de Sloth: Una clave de Sloth/)
  assert.deepEqual(await ganada(env, a.id), { rifa: id, premio: 'Una clave de Sloth', creditos: 0, entregados: false })
  assert.deepEqual((await pedir<RifaComunidad>(b, '/comunidad/rifa')).ultima?.ganadores, ['Persona 1'])
  await pedir(a, '/comunidad/rifa/visto', { rifa: id })
  assert.equal(await ganada(env, a.id), undefined)
})

test('los créditos se suman una vez; un corte en la suma queda para revisar', async (t) => {
  const { db, env, correos } = preparar(t)
  db.prepare("INSERT INTO rifas (id, premio, creditos, ganadores, estado, creada, sorteada) VALUES ('r1', ?, 10000, 2, 'sorteada', '2026-11-07', '2026-11-07')").run(premioDe(2, 10000))
  const fila = (externo: string) => ({ rifa: 'r1', externo, miembro: `m-${externo}`, email: `${externo}@example.com`, creditos: 10000, estado: 'pendiente' as const, intento: null, correo: null, premio: premioDe(2, 10000) })
  for (const e of ['uno', 'dos']) db.prepare("INSERT INTO rifa_ganadores (rifa, externo, miembro, email, creditos, estado) VALUES ('r1', ?, ?, ?, 10000, 'pendiente')").run(e, `m-${e}`, `${e}@example.com`)
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
  assert.match(correos[0].subject, /2 llaves de 10,000 créditos de Sloth/)
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
  assert.equal(premioDe(1, 10000), '1 llave de 10,000 créditos de Sloth')
  assert.equal(premioDe(3, 236483), '3 llaves de 236,483 créditos de Sloth')
})
