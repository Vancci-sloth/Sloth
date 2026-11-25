import assert from 'node:assert/strict'
import test from 'node:test'
import type { Env } from './index.ts'
import { MAX_BYTES, SOLO_APOYO, abrirDeepgram, dictado, enOrden, impedimento, llavesDe, puente, saldoDe, topeDe, type Tubo } from './dictado.ts'

/** Sin poder leer el saldo: decide solo lo que conteste Deepgram al abrir. */
const sinSaldo = async () => undefined

class TuboDePrueba implements Tubo {
  enviados: (string | ArrayBuffer)[] = []
  cerrado = false
  private oyentes: Record<string, ((e?: unknown) => void)[]> = {}
  send(dato: string | ArrayBuffer) { this.enviados.push(dato) }
  close() {
    if (this.cerrado) return
    this.cerrado = true
    this.emitir('close')
  }
  addEventListener(tipo: string, f: (e?: never) => void) { (this.oyentes[tipo] ??= []).push(f as (e?: unknown) => void) }
  emitir(tipo: string, e?: unknown) { for (const f of this.oyentes[tipo] ?? []) f(e) }
}

/** Una base de prueba que anota lo que se le pide y contesta con `filas` según la consulta. */
function base(filas: { cuenta?: boolean; apoyo?: boolean; agotadas?: { id: string; agotada: number }[] } = {}) {
  const corridas: { sql: string; valores: unknown[] }[] = []
  return {
    corridas,
    prepare(sql: string) {
      let valores: unknown[] = []
      const consulta = {
        bind: (...v: unknown[]) => ((valores = v), consulta),
        async first() {
          if (filas.cuenta && sql.includes('JOIN equipos')) return { estado: 'gratis', pagado_hasta: null, email: 'ana@ejemplo.com', externo: 'ana', vetada: 0 }
          return null
        },
        async all() {
          if (sql.includes('dictado_llaves')) return { results: filas.agotadas ?? [] }
          return { results: filas.apoyo && sql.includes("plan IN ('mensual'") ? [{ estado: 'authorized', pagado_hasta: null }] : [] }
        },
        async run() { corridas.push({ sql, valores }) }
      }
      return consulta
    }
  }
}

test('el tope del día y un dictado a la vez; el creador no tiene tope', () => {
  const ahora = Date.parse('2026-11-23T12:00:00Z')
  assert.equal(topeDe({}), 30 * 60)
  assert.equal(topeDe({ DICTADO_MINUTOS: 10 }), 10 * 60)
  assert.equal(impedimento({ segundos: 0, abierto: 0 }, 1800, false, ahora), undefined)
  assert.match(impedimento({ segundos: 1800, abierto: 0 }, 1800, false, ahora)!, /30 minutos de hoy/)
  assert.equal(impedimento({ segundos: 99_999, abierto: 0 }, 1800, true, ahora), undefined)
  assert.match(impedimento({ segundos: 0, abierto: ahora - 5000 }, 1800, false, ahora)!, /en curso/)
  // Uno que quedó marcado abierto de hace mucho (se cayó el Worker) ya no estorba.
  assert.equal(impedimento({ segundos: 0, abierto: ahora - 10 * 60_000 }, 1800, false, ahora), undefined)
})

test('las llaves se leen de cada DEEPGRAM_API_KEY_n, en orden, sin vacías ni repetidas; las agotadas van al final', async () => {
  const env = { DEEPGRAM_API_KEY_10: 'diez', DEEPGRAM_API_KEY_2: 'dos', DEEPGRAM_API_KEY: ' uno ', DEEPGRAM_API_KEY_3: '', DEEPGRAM_API_KEY_4: 'dos', OTRA: 'x' } as unknown as Env
  const llaves = await llavesDe(env)
  assert.deepEqual(llaves.map((l) => [l.nombre, l.valor]), [['DEEPGRAM_API_KEY', 'uno'], ['DEEPGRAM_API_KEY_2', 'dos'], ['DEEPGRAM_API_KEY_10', 'diez']])
  const [uno, dos, diez] = llaves
  assert.deepEqual(enOrden(llaves, new Map()).map((l) => l.nombre), [uno.nombre, dos.nombre, diez.nombre])
  // La 1 se agotó después que la 2: primero la 10, luego la 2 (que lleva más tiempo agotada), y la 1 al final.
  assert.deepEqual(enOrden(llaves, new Map([[uno.id, 200], [dos.id, 100]])).map((l) => l.nombre), [diez.nombre, dos.nombre, uno.nombre])
})

test('si Deepgram rechaza una llave al abrir, se anota agotada y se usa la siguiente; la que vuelve a servir se desmarca', async () => {
  const llaves = await llavesDe({ DEEPGRAM_API_KEY: 'uno', DEEPGRAM_API_KEY_2: 'dos', DEEPGRAM_API_KEY_3: 'tres' } as unknown as Env)
  const socket = {} as WebSocket
  const respuestas: Record<string, Response | { status: number; webSocket: WebSocket }> = {
    uno: new Response(null, { status: 402 }),
    dos: new Response(null, { status: 401 }),
    tres: { status: 101, webSocket: socket }
  }
  const db = base()
  const probadas: string[] = []
  const abierto = await abrirDeepgram({ DB: db } as unknown as Env, llaves, new Map(), { saldo: sinSaldo, abrir: async (valor) => (probadas.push(valor), respuestas[valor] as Response) })
  assert.equal(abierto, socket)
  assert.deepEqual(probadas, ['uno', 'dos', 'tres'])
  assert.deepEqual(db.corridas.filter((c) => c.sql.startsWith('INSERT INTO dictado_llaves')).map((c) => c.valores[0]), [llaves[0].id, llaves[1].id])

  // Con la 1 y la 2 agotadas, se empieza por la 3; si ya solo sirve la 1 (la recargaron), se le quita la marca.
  const db2 = base()
  const probadas2: string[] = []
  const otra = await abrirDeepgram({ DB: db2 } as unknown as Env, llaves, new Map([[llaves[0].id, 1], [llaves[1].id, 2]]), {
    saldo: sinSaldo,
    abrir: async (valor) => (probadas2.push(valor), (valor === 'uno' ? { status: 101, webSocket: socket } : new Response(null, { status: 402 })) as Response)
  })
  assert.equal(otra, socket)
  assert.deepEqual(probadas2, ['tres', 'uno'])
  assert.ok(db2.corridas.some((c) => c.sql.startsWith('DELETE FROM dictado_llaves') && c.valores[0] === llaves[0].id))

  // Todas llenas (429): se dice que está lleno, sin marcar ninguna.
  const db3 = base()
  await assert.rejects(abrirDeepgram({ DB: db3 } as unknown as Env, llaves, new Map(), { saldo: sinSaldo, abrir: async () => new Response(null, { status: 429 }) }), /lleno/)
  assert.equal(db3.corridas.length, 0)
})

test('dicta solo quien apoya hoy: a una cuenta gratis o sin cuenta ni le sale el botón', async () => {
  const pedir = (filas: Parameters<typeof base>[0], ruta: string) =>
    dictado(
      new Request(`https://cobro.ejemplo${ruta}`, { headers: { 'x-sloth-clave': 'SLOTH-AAAA-BBBB-CCCC-DDDD', 'x-sloth-equipo': '0123456789abcdef0123456789abcdef' } }),
      { DB: base(filas), DEEPGRAM_API_KEY: 'llave' } as unknown as Env,
      {} as ExecutionContext,
      new URL(`https://cobro.ejemplo${ruta}`)
    )
  assert.deepEqual(await (await pedir({}, '/dictado')).json(), { disponible: false })
  assert.deepEqual(await (await pedir({ cuenta: true }, '/dictado')).json(), { disponible: false })
  await assert.rejects(pedir({ cuenta: true }, '/dictado/vivo'), (e: Error & { status?: number }) => e.status === 403 && e.message === SOLO_APOYO)
  await assert.rejects(pedir({}, '/dictado/vivo'), (e: Error & { status?: number }) => e.status === 403)
  assert.deepEqual(await (await pedir({ cuenta: true, apoyo: true }, '/dictado')).json(), { disponible: true, minutos: 30 })
})

test('el puente pasa el audio y «fin» a Deepgram, sus mensajes a la app, y anota una vez lo que duró', () => {
  const app = new TuboDePrueba(), deepgram = new TuboDePrueba()
  let t = 0
  const anotado: number[] = []
  puente(app, deepgram, (s) => anotado.push(s), () => t)
  const audio = new Uint8Array([1, 2, 3]).buffer
  app.emitir('message', { data: audio })
  app.emitir('message', { data: 'otra cosa' })
  deepgram.emitir('message', { data: '{"type":"Results"}' })
  app.emitir('message', { data: 'fin' })
  assert.deepEqual(deepgram.enviados, [audio, '{"type":"CloseStream"}'])
  assert.deepEqual(app.enviados, ['{"type":"Results"}'])
  t = 12_300
  deepgram.close()
  assert.ok(app.cerrado)
  app.emitir('close')
  assert.deepEqual(anotado, [13])
})

test('el puente corta lo que pasa de 12 MB y le dice a la app por qué', () => {
  const app = new TuboDePrueba(), deepgram = new TuboDePrueba()
  const anotado: number[] = []
  puente(app, deepgram, (s) => anotado.push(s))
  app.emitir('message', { data: new ArrayBuffer(MAX_BYTES + 1) })
  assert.equal(deepgram.enviados.length, 0)
  assert.match(JSON.parse(app.enviados[0] as string).error, /demasiado largo/)
  assert.ok(app.cerrado && deepgram.cerrado)
  assert.deepEqual(anotado, [1])
})

test('antes de cada dictado se mira el saldo: la que no alcanza se salta sin intentar y se anota; si ninguna alcanza, se prueban igual', async () => {
  const llaves = await llavesDe({ DEEPGRAM_API_KEY: 'uno', DEEPGRAM_API_KEY_2: 'dos' } as unknown as Env)
  const socket = {} as WebSocket
  const saldos: Record<string, number | undefined> = { uno: 0.01, dos: 12.5 }
  const db = base()
  const abiertas: string[] = []
  const ws = await abrirDeepgram({ DB: db } as unknown as Env, llaves, new Map(), {
    saldo: async (l) => saldos[l.valor],
    abrir: async (valor) => (abiertas.push(valor), { status: 101, webSocket: socket } as unknown as Response)
  })
  assert.equal(ws, socket)
  // La 1 ni se abrió: no tenía para un dictado entero.
  assert.deepEqual(abiertas, ['dos'])
  assert.deepEqual(db.corridas.filter((c) => c.sql.startsWith('INSERT INTO dictado_llaves')).map((c) => c.valores[0]), [llaves[0].id])

  // Ninguna con saldo (una cuenta de pago por uso marca 0): se prueban en orden, y decide Deepgram.
  const abiertas2: string[] = []
  const ws2 = await abrirDeepgram({ DB: base(), DICTADO_SALDO_MINIMO: 1 } as unknown as Env, llaves, new Map(), {
    saldo: async () => 0,
    abrir: async (valor) => (abiertas2.push(valor), (valor === 'dos' ? { status: 101, webSocket: socket } : new Response(null, { status: 402 })) as Response)
  })
  assert.equal(ws2, socket)
  assert.deepEqual(abiertas2, ['uno', 'dos'])
})

test('el saldo es la suma de los balances del proyecto de la llave; sin permiso de facturación no se sabe', async () => {
  const [l] = await llavesDe({ DEEPGRAM_API_KEY: 'llave-saldo' } as unknown as Env)
  const pedidos: string[] = []
  const pedir = (async (url: string, init?: RequestInit) => {
    pedidos.push(url)
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Token llave-saldo')
    if (url.endsWith('/v1/projects')) return Response.json({ projects: [{ project_id: 'p1', name: 'Sloth' }] })
    return Response.json({ balances: [{ balance_id: 'b', amount: 150.25, units: 'USD' }, { amount: 49.75, units: 'USD' }] })
  }) as typeof fetch
  assert.equal(await saldoDe(l, pedir), 200)
  // El proyecto ya se sabe: la segunda vez solo se piden los balances.
  assert.equal(await saldoDe(l, pedir), 200)
  assert.deepEqual(pedidos, ['https://api.deepgram.com/v1/projects', 'https://api.deepgram.com/v1/projects/p1/balances', 'https://api.deepgram.com/v1/projects/p1/balances'])
  const [m] = await llavesDe({ DEEPGRAM_API_KEY: 'llave-member' } as unknown as Env)
  const sinPermiso = (async (url: string) =>
    url.endsWith('/v1/projects') ? Response.json({ projects: [{ project_id: 'p2' }] }) : Response.json({ err_code: 'INSUFFICIENT_PERMISSIONS' }, { status: 403 })) as typeof fetch
  assert.equal(await saldoDe(m, sinPermiso), undefined)
  assert.equal(await saldoDe(m, (async () => { throw new Error('sin red') }) as typeof fetch), undefined)
})
