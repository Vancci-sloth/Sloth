import assert from 'node:assert/strict'
import test from 'node:test'
import type { Env } from './index.ts'
import { MAX_LETRAS, idDe, juntas, laDeMasSaldo, llavesDe, mensajeDe, pedidoTts } from './voz.ts'

test('la Administrador de antes ve todas las llaves como una sola cuenta', () => {
  const r = (datos: Record<string, unknown>, status = 200) => ({ status, datos })
  const j = juntas([
    { saldo: r({ balance: 3_000_000, users: 0, daily_limit: null }), usuarios: r({ users: [], total: 0, per_page: 100 }), uso: r({ items: [{ credits: 1 }] }) },
    { saldo: r({ balance: 499_954, users: 1 }), usuarios: r({ users: [{ external_id: 'creador' }], total: 1 }), uso: r({ items: [{ credits: 2 }] }) },
    { saldo: r({ error: 'x' }, 401), usuarios: r({}, 401), uso: r({}, 401) }
  ])
  assert.deepEqual(j.saldo, { status: 200, datos: { balance: 3_499_954, users: 1, daily_limit: null } })
  assert.deepEqual(j.usuarios?.datos, { users: [{ external_id: 'creador' }], total: 1, per_page: 100 })
  assert.deepEqual(j.uso?.datos.items, [{ credits: 1 }, { credits: 2 }])
  assert.equal(juntas([{ saldo: r({ error: 'no' }, 401), usuarios: r({}, 401), uso: r({}, 401) }]).saldo?.status, 401)
  assert.deepEqual(juntas([]), {})
})

test('las llaves del socio se leen de cada VOICES_PK_LIVE_n, en orden, sin vacías ni repetidas', async () => {
  const env = { VOICES_PK_LIVE_10: 'pk_live_diez', VOICES_PK_LIVE_2: 'pk_live_dos', VOICES_PK_LIVE: ' pk_live_uno ', VOICES_PK_LIVE_3: '', VOICES_PK_LIVE_4: 'pk_live_dos', OTRA: 'pk_live_x', VOICES_PK_LIVE_X: 'pk_live_y' } as unknown as Env
  const llaves = await llavesDe(env)
  assert.deepEqual(
    llaves.map((l) => [l.nombre, l.valor, l.fin]),
    [
      ['VOICES_PK_LIVE', 'pk_live_uno', '_uno'],
      ['VOICES_PK_LIVE_2', 'pk_live_dos', '_dos'],
      ['VOICES_PK_LIVE_10', 'pk_live_diez', 'diez']
    ]
  )
  // El id es de la llave, no del secreto: la misma llave con otro nombre es la misma cuenta.
  assert.equal(llaves[1].id, await idDe('pk_live_dos'))
  assert.match(llaves[0].id, /^[0-9a-f]{12}$/)
  assert.ok(!llaves[0].id.includes('uno'))
  assert.deepEqual(await llavesDe({} as Env), [])
})

test('los nuevos y los que se mudan van a la llave con más saldo, nunca a una vacía', async () => {
  const [a, b, c] = await llavesDe({ VOICES_PK_LIVE: 'pk_live_a', VOICES_PK_LIVE_2: 'pk_live_b', VOICES_PK_LIVE_3: 'pk_live_c' } as unknown as Env)
  const saldo = (balance: unknown, status = 200) => ({ status, datos: { balance } })
  assert.equal(laDeMasSaldo([{ llave: a, r: saldo(500_000) }, { llave: b, r: saldo(3_000_000) }, { llave: c, r: saldo(10) }]), b)
  // Una que no se pudo leer no cuenta, aunque diga mucho.
  assert.equal(laDeMasSaldo([{ llave: a, r: saldo(5) }, { llave: b, r: saldo(9_000_000, 401) }]), a)
  assert.equal(laDeMasSaldo([{ llave: a, r: saldo(0) }, { llave: b, r: saldo('mucho') }]), undefined)
  assert.equal(laDeMasSaldo([]), undefined)
})

test('a Voices Cloning solo va un trozo con texto, voz y una velocidad que acepta', () => {
  assert.deepEqual(pedidoTts({ text: '  Hola.  ', voice_id: 'v1' }), { text: 'Hola.', voice_id: 'v1' })
  assert.deepEqual(pedidoTts({ text: 'Hola.', voice_id: 'v1', speed: 1.2 }), { text: 'Hola.', voice_id: 'v1', speed: 1.2 })
  // Lo que llega de más no pasa.
  assert.deepEqual(pedidoTts({ text: 'Hola.', voice_id: 'v1', external_id: 'otro' }), { text: 'Hola.', voice_id: 'v1' })
  assert.throws(() => pedidoTts({ text: '', voice_id: 'v1' }), /Falta el texto/)
  assert.throws(() => pedidoTts({ text: 'x'.repeat(MAX_LETRAS + 1), voice_id: 'v1' }), /5000 por llamada/)
  assert.throws(() => pedidoTts({ text: 'Hola.' }), /Falta la voz/)
  assert.throws(() => pedidoTts({ text: 'Hola.', voice_id: 'v1', speed: 2 }), /0.5 a 1.5/)
})

test('cada error de las voces se dice en español y con qué hacer', () => {
  const de = (status: number, code?: string, espera?: string) => mensajeDe({ status, datos: code ? { code, error: 'x' } : {}, espera })
  assert.match(de(402, 'insufficient_credits'), /acabaron los créditos/)
  assert.match(de(402, 'partner_balance_empty'), /se acabó su saldo/)
  assert.match(de(402, 'partner_daily_limit'), /medianoche, hora de Lima/)
  assert.match(de(429, 'queue_full', '12'), /en 12 segundos/)
  assert.match(de(504), /no se cobró/)
  assert.match(de(401), /no aceptaron su llave/)
  assert.match(de(403), /suspendido/)
  assert.match(de(500), /respondieron 500/)
})
