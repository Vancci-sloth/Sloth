import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import worker, { type Env } from './index.ts'
import { idDe } from './voz.ts'
import { APERTURA_VOZ, beneficiariosVoz, cuentaDeReparto, entregarVozMensual, periodoVoz, repartirVozMensual, type RepartidorVoz } from './voz-mensual.ts'

const NOVIEMBRE = new Date('2026-11-07T12:00:00Z')
const beneficiario = { externo: 'cuenta-original', email: 'persona@example.com', clave: 'SLOTH-AAAA-BBBB-CCCC-DDDD' }

/** Migraciones reales y D1 sobre SQLite; el proveedor y Resend no salen a internet. */
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
  const objetos: Record<string, unknown> = {}
  const env = {
    DB: { prepare: (sql: string) => consulta(sql, []) },
    DESCARGAS: { head: async (k: string) => objetos[k] ?? null },
    CORREO_DE: 'Sloth <avisos@example.com>', CORREO_RESPUESTA: 'soporte@example.com', RESEND_API_KEY: 're_prueba'
  } as unknown as Env
  const anterior = globalThis.fetch
  const correos: { headers: Record<string, string>; body: { text: string } }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.resend.com/emails')
    correos.push({ headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) })
    return Response.json({ id: 'correo' })
  }) as typeof fetch
  t.after(() => { globalThis.fetch = anterior; db.close() })
  let saldo = 54
  const sumas: { externo: string; llave: string; cantidad: number }[] = []
  const repartidor: RepartidorVoz = {
    preparar: async () => 'llave-del-lote-general',
    quedan: async () => saldo,
    sumar: async (externo, llave, cantidad) => { sumas.push({ externo, llave, cantidad }); saldo += cantidad }
  }
  const licencia = (id: string, email: string, plan: string, estado: string, modo = 'produccion', hasta: string | null = '2099-01-01', autorizada: string | null = '2026-11-01', monto = 15, moneda = 'USD') =>
    db.prepare('INSERT INTO licencias (id, clave, email, plan, monto, moneda, estado, modo, pagado_hasta, autorizada, creada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, `SLOTH-${id}`, email, plan, monto, moneda, estado, modo, hasta, autorizada, id === 'cuenta-original' ? '2026-10-01' : '2026-11-01')
  return { db, env, objetos, correos, repartidor, sumas, saldo: () => saldo, gastar: (n: number) => void (saldo -= n), licencia }
}

test('el mes cambia a medianoche de Ciudad de México, también al cambiar de año', () => {
  assert.equal(periodoVoz(new Date('2026-12-01T05:59:59Z')), '2026-11')
  assert.equal(periodoVoz(new Date('2026-12-01T06:00:00Z')), '2026-12')
  assert.equal(periodoVoz(new Date('2027-01-01T05:59:59Z')), '2026-12')
  assert.equal(periodoVoz(new Date('2027-01-01T06:00:00Z')), '2027-01')
})

test('SOLO quien paga activamente $15 USD o más (o 299 MXN, o el anual): nadie más, una persona por correo', (t) => {
  const { db, env, licencia } = preparar(t)
  licencia('cuenta-original', 'persona@example.com', 'cuenta', 'gratis', 'produccion', null, null)
  licencia('apoyo1', 'persona@example.com', 'mensual', 'authorized')
  licencia('apoyo2', 'persona@example.com', 'anual', 'pagado')
  licencia('fundador', 'fundador@example.com', 'gratis', 'gratis', 'prueba', null, null)
  licencia('fundadorprod', 'fundadorprod@example.com', 'gratis', 'gratis', 'produccion', null, '2026-11-01')
  // El Fundador que pagó por transferencia (`npm run fundador -- dar`) es un `unico` pagado: sí le toca.
  licencia('transferencia', 'transferencia@example.com', 'unico', 'pagado')
  licencia('unico', 'unico@example.com', 'unico', 'cancelled') // conserva lo pagado
  licencia('prueba', 'prueba@example.com', 'mensual', 'authorized', 'prueba')
  licencia('vencido', 'vencido@example.com', 'anual', 'pagado', 'produccion', '2026-01-01')
  licencia('sinpago', 'sinpago@example.com', 'mensual', 'authorized', 'produccion', '2099-01-01', null)
  licencia('gratis', 'gratis@example.com', 'cuenta', 'gratis', 'produccion', null, null)
  licencia('vetada', 'vetada@example.com', 'cuenta', 'vetada')
  licencia('apoyovetado', 'vetada@example.com', 'mensual', 'authorized')
  // Con el monto que elige cada quien: menos de $15 no da créditos, aunque pague.
  licencia('cinco', 'cinco@example.com', 'mensual', 'authorized', 'produccion', '2099-01-01', '2026-11-01', 5)
  licencia('catorce', 'catorce@example.com', 'unico', 'pagado', 'produccion', '2099-01-01', '2026-11-01', 14)
  licencia('treinta', 'treinta@example.com', 'mensual', 'authorized', 'produccion', '2099-01-01', '2026-11-01', 30)
  // Los de antes, en pesos: desde 299 MXN.
  licencia('pesos', 'pesos@example.com', 'mensual', 'authorized', 'produccion', '2099-01-01', '2026-11-01', 299, 'MXN')
  licencia('pocospesos', 'pocospesos@example.com', 'mensual', 'authorized', 'produccion', '2099-01-01', '2026-11-01', 100, 'MXN')
  const filas = db.prepare(beneficiariosVoz(env)).all(NOVIEMBRE.toISOString(), null) as { externo: string }[]
  assert.deepEqual(filas.map((f) => f.externo).sort(), ['cuenta-original', 'pesos', 'transferencia', 'treinta', 'unico'])
})

test('dos computadoras y el cron entregan una sola vez; cada mes se refresca a 100.000, sin acumular', async (t) => {
  const p = preparar(t)
  await Promise.all(Array.from({ length: 5 }, () => entregarVozMensual(p.env, beneficiario, p.repartidor, NOVIEMBRE)))
  assert.equal(p.sumas.length, 1)
  // Tenía 54: se le suma lo que falta para llegar a 100.000.
  assert.deepEqual(p.sumas[0], { externo: beneficiario.externo, llave: 'llave-del-lote-general', cantidad: 99_946 })
  assert.equal(p.saldo(), 100_000)
  // Gasta 30.000 en noviembre: en diciembre vuelve a 100.000, no a 170.000.
  p.gastar(30_000)
  await entregarVozMensual(p.env, beneficiario, p.repartidor, new Date('2026-12-01T06:00:00Z'))
  assert.equal(p.saldo(), 100_000)
  assert.equal(p.sumas[1].cantidad, 30_000)
  // Sin gastar nada en diciembre, enero no suma (y no quita).
  await entregarVozMensual(p.env, beneficiario, p.repartidor, new Date('2027-01-01T06:00:00Z'))
  assert.equal(p.saldo(), 100_000)
  assert.equal(p.sumas.length, 2)
  assert.equal(p.db.prepare('SELECT COUNT(*) AS n FROM voz_mensual').get()?.n, 3)
  assert.equal(p.db.prepare("SELECT creditos FROM voz_mensual WHERE periodo = '2027-01'").get()?.creditos, 0)
  assert.match(p.correos[0].body.text, /Tu clave de Sloth: SLOTH-AAAA-BBBB-CCCC-DDDD/)
  assert.match(p.correos[0].body.text, /creditos son SOLO para la voz/)
  assert.doesNotMatch(p.correos[0].body.text, /pk_live|llave-del-lote/)
})

test('reintentar el correo no vuelve a sumar y mantiene la misma clave de idempotencia y contenido', async (t) => {
  const p = preparar(t)
  p.env.RESEND_API_KEY = undefined
  await entregarVozMensual(p.env, beneficiario, p.repartidor, NOVIEMBRE)
  assert.equal(p.sumas.length, 1)
  p.env.RESEND_API_KEY = 're_prueba'
  await entregarVozMensual(p.env, { ...beneficiario, clave: 'OTRA-CLAVE' }, p.repartidor, NOVIEMBRE)
  await entregarVozMensual(p.env, beneficiario, p.repartidor, NOVIEMBRE)
  assert.equal(p.sumas.length, 1)
  assert.equal(p.correos.length, 1)
  assert.equal(p.correos[0].headers['idempotency-key'], 'voz-mensual/cuenta-original/2026-11')
  assert.match(p.correos[0].body.text, /SLOTH-AAAA-BBBB-CCCC-DDDD/)
  assert.doesNotMatch(p.correos[0].body.text, /OTRA-CLAVE/)
})

test('un fallo ambiguo del proveedor queda para revisar y nunca se suma dos veces ni se avisa de una entrega incierta', async (t) => {
  const p = preparar(t)
  const fallar = { ...p.repartidor, sumar: async () => { throw new Error('Se cortó después de enviar') } }
  await entregarVozMensual(p.env, beneficiario, fallar, NOVIEMBRE)
  await entregarVozMensual(p.env, beneficiario, p.repartidor, NOVIEMBRE)
  assert.equal(p.sumas.length, 0)
  assert.equal(p.correos.length, 0)
  assert.equal(p.db.prepare('SELECT estado FROM voz_mensual').get()?.estado, 'revisar')
})

test('un fallo de Resend permite usar los créditos y el siguiente intento solo manda el correo', async (t) => {
  const p = preparar(t)
  const responderCorreo = globalThis.fetch
  globalThis.fetch = (async () => Response.json({ error: 'No salió' }, { status: 400 })) as typeof fetch
  await entregarVozMensual(p.env, beneficiario, p.repartidor, NOVIEMBRE)
  assert.equal(p.saldo(), 100_000)
  assert.equal(p.db.prepare('SELECT estado, correo FROM voz_mensual').get()?.estado, 'entregado')
  assert.equal(p.db.prepare('SELECT correo FROM voz_mensual').get()?.correo, null)
  globalThis.fetch = responderCorreo
  await entregarVozMensual(p.env, beneficiario, p.repartidor, NOVIEMBRE)
  assert.equal(p.sumas.length, 1)
  assert.equal(p.correos.length, 1)
})

test('un corte antes de sumar se puede retomar; un corte durante la suma no se repite', async (t) => {
  const p = preparar(t)
  const fallar = { ...p.repartidor, preparar: async () => { throw new Error('Sin conexión') } }
  await entregarVozMensual(p.env, beneficiario, fallar, NOVIEMBRE)
  assert.equal(p.db.prepare('SELECT estado FROM voz_mensual').get()?.estado, 'pendiente')
  await entregarVozMensual(p.env, beneficiario, p.repartidor, NOVIEMBRE)
  assert.equal(p.sumas.length, 1)
  p.db.prepare("UPDATE voz_mensual SET estado = 'enviando', entregado = NULL, correo = NULL").run()
  await entregarVozMensual(p.env, beneficiario, p.repartidor, NOVIEMBRE)
  assert.equal(p.sumas.length, 1)
})

test('el cron espera a publicar la actualización; incluye al que no abrió la app y respeta el mes entregado', async (t) => {
  const p = preparar(t)
  p.licencia(beneficiario.externo, beneficiario.email, 'mensual', 'authorized')
  await repartirVozMensual(p.env, p.repartidor)
  assert.equal(p.sumas.length, 0)
  p.objetos[APERTURA_VOZ] = { version: '0.4.1' }
  await repartirVozMensual(p.env, p.repartidor)
  await repartirVozMensual(p.env, p.repartidor)
  assert.equal(p.sumas.length, 1)
  assert.equal(p.correos.length, 1)
})

test('un correo pendiente sigue saliendo después de vencer el apoyo y cambiar de mes', async (t) => {
  const p = preparar(t)
  p.env.RESEND_API_KEY = undefined
  await entregarVozMensual(p.env, beneficiario, p.repartidor, new Date('2026-01-01T12:00:00Z'))
  p.env.RESEND_API_KEY = 're_prueba'
  p.objetos[APERTURA_VOZ] = {}
  await repartirVozMensual(p.env, p.repartidor)
  assert.equal(p.sumas.length, 1)
  assert.equal(p.correos.length, 1)
  assert.match(p.correos[0].body.text, /para enero de 2026\. /)
  assert.match(p.correos[0].body.text, /no se acumulan/)
})

test('solo terminar el actualizador de una versión con esta función abre los créditos; un blockmap no los adelanta', async (t) => {
  const p = preparar(t)
  const objetos: Record<string, unknown> = {}
  Object.assign(p.env.DESCARGAS, {
    resumeMultipartUpload: () => ({ complete: async () => ({ size: 123 }) }),
    head: async (k: string) => objetos[k] ?? null,
    put: async (k: string, valor: string) => { objetos[k] = JSON.parse(valor) }
  })
  p.env.PUBLICAR = 'publicar-prueba'
  const subir = (archivo: string, vozMensual: boolean) => worker.fetch(new Request(`https://sloth.test/publicar/fin?archivo=${archivo}&upload=uno`, {
    method: 'POST', headers: { authorization: 'Bearer publicar-prueba' }, body: JSON.stringify({ partes: [], version: '0.4.1', vozMensual })
  }), p.env, { waitUntil() {} } as never)
  assert.equal((await subir('Sloth-Setup-0.4.1.exe.blockmap', true)).status, 200)
  assert.equal(objetos[APERTURA_VOZ], undefined)
  assert.equal((await subir('latest.yml', false)).status, 200)
  assert.equal(objetos[APERTURA_VOZ], undefined)
  assert.equal((await subir('latest.yml', true)).status, 200)
  assert.equal((objetos[APERTURA_VOZ] as { version: string }).version, '0.4.1')
})

test('la clave de Sloth recibe sus créditos en la llave del lote donde ya vive, sin exponer las llaves del socio', async (t) => {
  const p = preparar(t)
  p.licencia(beneficiario.externo, beneficiario.email, 'cuenta', 'gratis', 'produccion', null, null)
  p.licencia('apoyo', beneficiario.email, 'mensual', 'authorized')
  p.db.prepare('UPDATE licencias SET clave = ? WHERE id = ?').run(beneficiario.clave, beneficiario.externo)
  const equipo = '3f9a0c1e7b2d4a6f8e0c1b3d5f7a9c2e'
  p.db.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?)').run(beneficiario.clave, equipo, NOVIEMBRE.toISOString())
  p.env.VOICES_PK_LIVE = 'pk_live_general'
  p.env.VOICES_PK_LIVE_2 = 'pk_live_segunda'
  p.env.VOZ_SOLO_CREADOR = '1'
  let creditos = 54
  const movimientos: string[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (url.startsWith('https://api.resend.com')) return Response.json({ id: 'correo' })
    const headers = new Headers(init.headers)
    assert.equal(headers.has('x-sloth-clave'), false)
    const llave = headers.get('authorization')
    if (url.endsWith(`/users/${beneficiario.externo}`)) {
      return llave === 'Bearer pk_live_segunda' ? Response.json({ credits: creditos, used_total: 46, status: 'active' }) : Response.json({}, { status: 404 })
    }
    assert.ok(url.endsWith(`/users/${beneficiario.externo}/credits`))
    assert.equal(llave, 'Bearer pk_live_segunda')
    creditos += JSON.parse(String(init.body)).amount
    movimientos.push(url)
    return Response.json({ credits: creditos })
  }) as typeof fetch
  const pendientes: Promise<unknown>[] = []
  const ctx = { waitUntil: (promesa: Promise<unknown>) => pendientes.push(promesa) } as never
  const pedir = () => worker.fetch(new Request('https://sloth.test/voz', { headers: { 'x-sloth-clave': beneficiario.clave, 'x-sloth-equipo': equipo } }), p.env, ctx)
  const cerrada = await pedir()
  assert.equal((await cerrada.json() as { disponible: boolean }).disponible, false)
  assert.equal(movimientos.length, 0)
  p.objetos[APERTURA_VOZ] = { version: '0.4.1' }
  const respuesta = await pedir()
  const texto = await respuesta.text()
  assert.equal(respuesta.status, 200)
  // Tenía 54: se refresca a 100.000, no a 100.054.
  assert.equal(JSON.parse(texto).creditos, 100_000)
  assert.equal(JSON.parse(texto).mensuales, 100_000)
  assert.doesNotMatch(texto, /pk_live|SLOTH-/)
  await pedir()
  assert.equal(movimientos.length, 1)
  assert.equal(p.db.prepare('SELECT llave FROM voz_cuentas').get()?.llave, await idDe('pk_live_segunda'))
  await Promise.all(pendientes)
})

test('lo libre para repartir es el saldo menos lo que tienen los usuarios y lo que falta entregar este mes', () => {
  // 3.5 millones de saldo y 32 personas sin entregar todavía: quedan 300,000.
  const beneficiarios = Array.from({ length: 32 }, (_, i) => `b${i}`)
  assert.deepEqual(cuentaDeReparto({ saldo: 3_500_000, usuarios: [], beneficiarios, entregados: new Set() }), {
    saldo: 3_500_000,
    enUsuarios: 0,
    beneficiarios: 32,
    porEntregar: 3_200_000,
    cadaMes: 3_200_000,
    libres: 300_000
  })
  // b0 ya tiene 40,000 sin gastar (le faltan 60,000), a b1 ya se le entregó y le quedan 90,000, y el creador tiene 5,000.
  const r = cuentaDeReparto({
    saldo: 3_500_000,
    usuarios: [{ externo: 'b0', creditos: 40_000 }, { externo: 'b1', creditos: 90_000 }, { externo: 'creador', creditos: 5_000 }],
    beneficiarios,
    entregados: new Set(['b1'])
  })
  assert.equal(r.enUsuarios, 135_000)
  assert.equal(r.porEntregar, 60_000 + 30 * 100_000)
  assert.equal(r.libres, 3_500_000 - 135_000 - 3_060_000)
})
