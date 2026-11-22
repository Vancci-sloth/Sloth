// La escalera del apoyo (escalera.ts): sube $5 por cada 50 personas que apoyan y a cada quien le baja $5 cada mes.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import worker, { refrescar, tarifa, type Env, type Fila } from './index.ts'
import { comoBaja, comoSigue, precioDe, siVuelves, siguiente, tocaBajar, tuPrecioSeQueda } from './escalera.ts'

const DIA = 24 * 3600_000
const tarifas = { MONEDA: 'USD', PRECIO_MENSUAL: 10, PRECIO_MENSUAL_MXN: 199, PRECIO_SUBE: 5, PRECIO_SUBE_MXN: 100, PRECIO_CADA: 50 }

test('el apoyo sube $5 por cada 50 personas que apoyan', () => {
  const con = (apoyan: number) => precioDe(10, 5, 50, apoyan)
  assert.deepEqual([0, 49, 50, 99, 100, 149, 150, 1000].map(con), [10, 10, 15, 15, 20, 20, 25, 110])
  // Sin escalera (sin `PRECIO_SUBE` o sin `PRECIO_CADA`), el de siempre.
  assert.equal(precioDe(10, 0, 50, 500), 10)
  assert.equal(precioDe(10, 5, 0, 500), 10)
  // En `/precio`: el de hoy, hasta dónde baja y de cuánto en cuánto; en pesos, de $100 en $100.
  const env = { ...tarifas, FUNDADORES: 25, PRECIO_ANUAL: 100, APOYO_MINIMO: 1, APOYO_GRANDE: 30, PRECIO_ANUAL_MXN: 1990, APOYO_MINIMO_MXN: 20, APOYO_GRANDE_MXN: 599 }
  const t = tarifa({ fundadores: 25, apoyan: 120 }, env, true)
  assert.deepEqual([t.mensual, t.base, t.paso, t.cada, t.anual], [20, 10, 5, 50, 100])
  assert.deepEqual([t.mxn?.mensual, t.mxn?.base, t.mxn?.paso], [399, 199, 100])
  assert.deepEqual([tarifa({ fundadores: 0, apoyan: 49 }, env).mensual, tarifa({ fundadores: 0, apoyan: 50 }, env).mensual], [10, 15])
})

test('a quien entra con el precio del día le baja $5 cada mes, hasta su piso', () => {
  const f = { plan: 'mensual' as const, moneda: 'USD', piso: 10 }
  assert.equal(siguiente(tarifas, { ...f, monto: 20 }), 15)
  assert.equal(siguiente(tarifas, { ...f, monto: 15 }), 10)
  assert.equal(siguiente(tarifas, { ...f, monto: 10 }), undefined)
  // Con cripto el piso es lo menos que acepta NOWPayments: no baja de ahí.
  assert.equal(siguiente(tarifas, { ...f, monto: 15, piso: 12 }), 12)
  // En pesos, de $100 en $100.
  assert.equal(siguiente(tarifas, { ...f, moneda: 'MXN', monto: 399, piso: 199 }), 299)
  // Quien eligió su monto, lo de una vez y las de antes (sin `piso`) no bajan.
  assert.equal(siguiente(tarifas, { ...f, monto: 30, piso: null }), undefined)
  assert.equal(siguiente(tarifas, { ...f, plan: 'unico', monto: 15 }), undefined)
  assert.equal(comoBaja(tarifas, { ...f, monto: 15 }), '$15 USD el primer mes y $10 USD cada mes desde el segundo.')
  assert.equal(comoBaja(tarifas, { ...f, monto: 20 }), '$20 USD el primer mes; después baja $5 cada mes hasta quedar en $10 USD al mes.')
  assert.equal(comoBaja(tarifas, { ...f, monto: 10 }), undefined)
  assert.match(comoSigue(tarifas, { ...f, monto: 15 })!, /tu siguiente cobro ya es de \$10 USD, y ahí se queda/)
  assert.match(comoSigue(tarifas, { ...f, monto: 20 })!, /ya es de \$15 USD, y sigue bajando \$5 cada mes hasta quedar en \$10 USD al mes/)
})

test('a quien ya apoya se le dice que su precio se queda con él, y que si cancela y vuelve entra con el del día', () => {
  const f = { plan: 'mensual' as const, moneda: 'USD', piso: null, monto: 10 }
  const vuelves = 'Si cancelas y después vuelves, entras con el precio de ese día.'
  // Con el apoyo ya más caro para quien entra, se dice cuánto.
  assert.equal(tuPrecioSeQueda(tarifas, f, 15), `Hoy el apoyo para quien entra es de $15 USD el primer mes; el tuyo se queda en $10 USD al mes mientras sigas apoyando. ${vuelves}`)
  assert.equal(tuPrecioSeQueda(tarifas, { ...f, monto: 15, piso: 10 }, 20), `Hoy el apoyo para quien entra es de $20 USD el primer mes; el tuyo sigue bajando hasta $10 USD al mes mientras sigas apoyando. ${vuelves}`)
  // Si paga lo mismo o más que quien entra hoy, o no se sabe el de hoy, sin el número.
  assert.equal(tuPrecioSeQueda(tarifas, f, 10), `Mientras sigas apoyando, tu precio no sube aunque el apoyo suba para quien llegue después. ${vuelves}`)
  assert.equal(tuPrecioSeQueda(tarifas, { ...f, monto: 30 }), tuPrecioSeQueda(tarifas, f, 10))
  // Al cancelar.
  assert.equal(siVuelves(f, 15), 'Si después quieres volver, entras con el precio de ese día (hoy, $15 USD el primer mes), no con el que tenías.')
  assert.equal(siVuelves(f), 'Si después quieres volver, entras con el precio de ese día, no con el que tenías.')
})

test('baja una vez por cada mes pagado, y solo mientras se sigue cobrando', () => {
  const ahora = Date.parse('2026-11-18T12:00:00Z')
  const f = { plan: 'mensual' as const, monto: 15, piso: 10, estado: 'authorized' as const, autorizada: '2026-11-18T11:00:00Z', pagado_hasta: '2026-12-18T11:00:00Z', bajado: null, cripto: null }
  assert.equal(tocaBajar(f, ahora), true)
  // Ya bajó con este mes: otra lectura (o la misma fecha con minutos de diferencia) no baja otra vez.
  assert.equal(tocaBajar({ ...f, bajado: '2026-12-18T11:00:00Z' }, ahora), false)
  assert.equal(tocaBajar({ ...f, bajado: '2026-12-18T10:40:00Z' }, ahora), false)
  // El mes siguiente, pagado: baja otra vez.
  assert.equal(tocaBajar({ ...f, pagado_hasta: '2027-01-18T11:00:00Z', bajado: '2026-12-18T11:00:00Z' }, ahora + 31 * DIA), true)
  // Mercado Pago la da por autorizada antes del primer cobro, que sale en minutos: hasta que no lo cobra, no baja.
  assert.equal(tocaBajar({ ...f, pagado_hasta: '2026-11-18T12:30:00Z' }, ahora), false)
  // Sin pagar todavía, con el cobro sin pasar (lo pagado ya venció), cancelada o en pausa: no.
  assert.equal(tocaBajar({ ...f, autorizada: null }, ahora), false)
  assert.equal(tocaBajar(f, ahora + 40 * DIA), false)
  assert.equal(tocaBajar({ ...f, estado: 'cancelled' }, ahora), false)
  assert.equal(tocaBajar({ ...f, estado: 'paused' }, ahora), false)
  // Con cripto cada mes es un pago (`pagado`): también baja. Un apoyo de una vez pagado, no.
  assert.equal(tocaBajar({ ...f, estado: 'pagado', cripto: '77' }, ahora), true)
  assert.equal(tocaBajar({ ...f, estado: 'pagado' }, ahora), false)
  assert.equal(tocaBajar({ ...f, monto: 10 }, ahora), false)
  assert.equal(tocaBajar({ ...f, piso: null }, ahora), false)
})

/** Migraciones reales y D1 sobre SQLite; Stripe y Resend, de mentira: se anota lo que se les pide. */
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
    DB: { prepare: (sql: string) => consulta(sql, []) },
    ...tarifas,
    PRECIO_ANUAL: 100,
    APOYO_MINIMO: 1,
    APOYO_GRANDE: 30,
    APOYO_MINIMO_MXN: 20,
    APOYO_GRANDE_MXN: 599,
    FUNDADORES: 25,
    ORIGEN: 'https://sloth.test',
    PAYPAL_MODO: 'produccion',
    MP_MODO: 'produccion',
    NOWPAYMENTS_MODO: 'produccion',
    STRIPE_SECRET_KEY: 'sk_live_prueba',
    STRIPE_WEBHOOK_SECRET: 'whsec_prueba',
    RESEND_API_KEY: 're_prueba',
    CORREO_DE: 'Sloth <avisos@example.com>',
    CORREO_RESPUESTA: 'soporte@example.com'
  } as unknown as Env
  /** La suscripción de Stripe: hasta cuándo va pagada y lo que cobra cada mes, en centavos. */
  const sub = { fin: Date.now() + 30 * DIA, cobra: 0 }
  const pedidos: { metodo: string; ruta: string; cuerpo: Record<string, string> }[] = []
  const correos: { to: string[]; subject: string; text: string }[] = []
  let sesiones = 0
  const suscripcion = () => ({ id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [{ id: 'si_1', current_period_start: Math.floor((sub.fin - 30 * DIA) / 1000), current_period_end: Math.floor(sub.fin / 1000) }] } })
  const anterior = globalThis.fetch
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    if (url === 'https://api.resend.com/emails') {
      correos.push(JSON.parse(String(init.body)))
      return Response.json({ id: 'correo' })
    }
    const u = new URL(url)
    assert.equal(u.hostname, 'api.stripe.com')
    const metodo = init.method ?? 'GET'
    const cuerpo = Object.fromEntries(new URLSearchParams(String(init.body ?? '')))
    pedidos.push({ metodo, ruta: u.pathname, cuerpo })
    if (metodo === 'POST' && u.pathname === '/v1/checkout/sessions') {
      const id = `cs_${++sesiones}`
      return Response.json({ id, url: `https://pago.test/${id}`, status: 'open', payment_status: 'unpaid', created: 1 })
    }
    // Cada sesión que se vuelve a leer ya está pagada, con su suscripción.
    if (u.pathname.startsWith('/v1/checkout/sessions/')) return Response.json({ id: u.pathname.split('/').at(-1), status: 'complete', payment_status: 'paid', client_reference_id: null, created: 1, subscription: suscripcion() })
    if (metodo === 'POST' && u.pathname === '/v1/products') return Response.json({ error: { message: 'Product already exists.' } }, { status: 400 })
    if (metodo === 'POST' && u.pathname === '/v1/subscriptions/sub_1') sub.cobra = Number(cuerpo['items[0][price_data][unit_amount]'])
    if (u.pathname === '/v1/subscriptions/sub_1') return Response.json(suscripcion())
    return Response.json({ error: { message: `Sin simular: ${metodo} ${u.pathname}` } }, { status: 404 })
  }) as typeof fetch
  t.after(() => {
    globalThis.fetch = anterior
    db.close()
  })
  /** `n` personas que apoyan hoy con $10. */
  const apoyan = (n: number) => {
    const una = db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, moneda, fundador, estado, autorizada, pagado_hasta, creada, modo) VALUES (?, ?, ?, 'mensual', 10, 'USD', 0, 'authorized', '2026-11-01', ?, '2026-11-01', 'produccion')")
    for (let i = 0; i < n; i++) una.run(`a-${i}`, `K-${i}`, `a${i}@example.com`, new Date(Date.now() + 5 * DIA).toISOString())
  }
  const pedir = async <T>(ruta: string, cuerpo?: unknown) =>
    (await worker.fetch(
      new Request(`https://sloth.test${ruta}`, cuerpo ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) } : {}),
      env,
      { waitUntil() {} } as never
    )).json() as Promise<T>
  const suscribir = (email: string, mas: Record<string, unknown> = {}) => pedir<{ enlace?: string; error?: string }>('/suscribir', { email, plan: 'mensual', pasarela: 'tarjeta', acepto: true, terminos: '2026-11-18', ...mas })
  const fila = (email: string) => db.prepare("SELECT * FROM licencias WHERE email = ? AND plan != 'cuenta'").get(email) as unknown as Fila
  /** Lo que se le pidió cambiar a la suscripción de Stripe. */
  const cambios = () => pedidos.filter((p) => p.metodo === 'POST' && p.ruta === '/v1/subscriptions/sub_1')
  return { db, env, sub, pedidos, correos, apoyan, pedir, suscribir, fila, cambios }
}

test('con 50 personas el apoyo es de $15: quien entra paga $15 el primer mes y Stripe le cobra $10 desde el segundo', async (t) => {
  const { env, sub, pedidos, correos, apoyan, pedir, suscribir, fila, cambios } = preparar(t)
  apoyan(50)
  const p = await pedir<{ mensual: number; base: number; paso: number; cada: number; apoyan: number }>('/precio')
  assert.deepEqual([p.mensual, p.base, p.paso, p.cada, p.apoyan], [15, 10, 5, 50, 50])

  assert.equal((await suscribir('ana@example.com', { monto: 15 })).enlace, 'https://pago.test/cs_1')
  assert.deepEqual([fila('ana@example.com').monto, fila('ana@example.com').piso], [15, 10])
  // La página de pago de Stripe cobra $15 y dice cómo baja.
  const sesion = pedidos.find((x) => x.ruta === '/v1/checkout/sessions')!.cuerpo
  assert.equal(sesion['line_items[0][price_data][unit_amount]'], '1500')
  assert.equal(sesion['line_items[0][price_data][product_data][description]'], '$15 USD el primer mes y $10 USD cada mes desde el segundo.')

  // Paga: al confirmarse, la suscripción queda cobrando $10 desde su siguiente cobro, sin prorrateo, y su correo lo dice.
  let f = await refrescar(env, fila('ana@example.com'))
  assert.equal(f.monto, 10)
  f = fila('ana@example.com')
  assert.deepEqual([f.estado, f.stripe, f.monto, f.bajado], ['authorized', 'sub_1', 10, f.pagado_hasta])
  assert.equal(sub.cobra, 1000)
  assert.equal(cambios().length, 1)
  assert.equal(cambios()[0].cuerpo.proration_behavior, 'none')
  assert.equal(cambios()[0].cuerpo.trial_end, undefined)
  assert.match(correos.at(-1)!.text, /tu siguiente cobro ya es de \$10 USD, y ahí se queda/)
  // Y lo que más pesa: su precio se queda con ella, y si cancela y vuelve entra con el del día.
  assert.match(correos.at(-1)!.text, /Mientras sigas apoyando, tu precio no sube[^]*Si cancelas y después vuelves, entras con el precio de ese día\./)

  // Volver a leerla el mismo mes, o ya con el segundo pagado, no la toca: está en su piso.
  f = await refrescar(env, f)
  sub.fin += 30 * DIA
  f = await refrescar(env, f)
  assert.equal(f.monto, 10)
  assert.equal(cambios().length, 1)
})

test('si empieza en $20, baja a $15 y luego a $10, una vez por cada mes pagado', async (t) => {
  const { db, env, sub, apoyan, suscribir, fila, cambios } = preparar(t)
  apoyan(100)
  await suscribir('beto@example.com', { monto: 20 })
  assert.deepEqual([fila('beto@example.com').monto, fila('beto@example.com').piso], [20, 10])
  // El primer pago: el segundo mes ya es de $15.
  let f = await refrescar(env, fila('beto@example.com'))
  assert.deepEqual([f.monto, sub.cobra], [15, 1500])
  // Otra lectura en el mismo mes (un aviso repetido, su Sloth preguntando): sigue en $15.
  f = await refrescar(env, f)
  assert.deepEqual([f.monto, cambios().length], [15, 1])
  // Paga el segundo mes: el tercero es de $10, y ahí se queda.
  sub.fin += 30 * DIA
  f = await refrescar(env, f)
  assert.deepEqual([f.monto, sub.cobra, cambios().length], [10, 1000, 2])
  sub.fin += 30 * DIA
  f = await refrescar(env, f)
  assert.deepEqual([f.monto, cambios().length], [10, 2])
  assert.equal((db.prepare('SELECT monto FROM licencias WHERE id = ?').get(f.id) as { monto: number }).monto, 10)
})

test('quien elige su monto se queda con él, y la app de antes, que no manda monto, paga el precio del día', async (t) => {
  const { env, apoyan, suscribir, fila, cambios, pedidos } = preparar(t)
  apoyan(50)
  // «Lo que gustes»: $30 cada mes, sin bajar.
  await suscribir('caro@example.com', { monto: 30 })
  assert.deepEqual([fila('caro@example.com').monto, fila('caro@example.com').piso], [30, null])
  assert.equal(pedidos.at(-1)!.cuerpo['line_items[0][price_data][product_data][description]'], undefined)
  const f = await refrescar(env, fila('caro@example.com'))
  assert.deepEqual([f.estado, f.monto, cambios().length], ['authorized', 30, 0])
  // La app de antes de la escalera no manda monto: paga el precio del día y le baja igual, y Stripe se lo dice.
  await suscribir('dani@example.com')
  assert.deepEqual([fila('dani@example.com').monto, fila('dani@example.com').piso], [15, 10])
  assert.equal(pedidos.at(-1)!.cuerpo['line_items[0][price_data][product_data][description]'], '$15 USD el primer mes y $10 USD cada mes desde el segundo.')
  // De una vez, al precio del día: un solo pago, no hay nada que bajar.
  await suscribir('eli@example.com', { plan: 'unico', monto: 15, sugerido: true })
  assert.deepEqual([fila('eli@example.com').monto, fila('eli@example.com').piso], [15, null])
  // Vio el apoyo en $20 (`sugerido`) y, al pagar, ya eran menos de 100 personas: paga los $20 que aceptó y le baja igual.
  await suscribir('fer@example.com', { monto: 20, sugerido: true })
  assert.deepEqual([fila('fer@example.com').monto, fila('fer@example.com').piso], [20, 10])
  // Con el apoyo ya en su piso no hay nada que bajar.
  await suscribir('gil@example.com', { monto: 10, sugerido: true })
  assert.deepEqual([fila('gil@example.com').monto, fila('gil@example.com').piso], [10, null])
})
