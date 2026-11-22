// La app de Google de Sloth para YouTube (`youtube.ts`), de punta a punta: solo quien apoya (o el creador) consigue el
// permiso, el secreto nunca sale del cobro y a Google solo llega lo que debe.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import worker from './index.ts'

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never
const EQUIPO = '0f8fad5bd9cb469fa16570867728950e'
const APOYA = 'SLOTH-AAAA-AAAA-AAAA-AAAA'
const CUENTA = 'SLOTH-GGGG-GGGG-GGGG-GGGG'
const manana = new Date(Date.now() + 864e5).toISOString()
const SECRETO = 'GOCSPX-secreto-de-sloth'
const RETORNO = 'http://127.0.0.1:4848/api/youtube/oauth'
const VERIFICADOR = 'v'.repeat(43)

function cobro(conApp = true) {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const consulta = (sql: string, args: unknown[]) => ({
    bind: (...mas: unknown[]) => consulta(sql, [...args, ...mas]),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } })
  })
  const fila = (clave: string, email: string, plan: string, estado: string, pagadoHasta: string | null) => {
    db.prepare("INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, pagado_hasta, creada, modo) VALUES (?, ?, ?, ?, 10, 0, ?, ?, '2026-11-01', 'produccion')").run(clave, clave, email, plan, estado, pagadoHasta)
    db.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?)').run(clave, EQUIPO, '2026-11-19')
  }
  fila(APOYA, 'apoya@x.com', 'mensual', 'authorized', manana)
  fila(CUENTA, 'cuenta@x.com', 'cuenta', 'gratis', null)
  const env = {
    PAYPAL_MODO: 'produccion', MONEDA: 'USD', ORIGEN: 'https://cobro.x', ADMIN: 'llave-del-creador',
    DB: { prepare: (sql: string) => consulta(sql, []) },
    ...(conApp ? { YOUTUBE_CLIENT_ID: '123-sloth.apps.googleusercontent.com', YOUTUBE_CLIENT_SECRET: SECRETO } : {})
  }
  const pedir = (ruta: string, quien: Record<string, string>, cuerpo?: object) =>
    worker.fetch(
      new Request(`https://cobro.x${ruta}`, cuerpo ? { method: 'POST', headers: { ...quien, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) } : { headers: quien }),
      env as never,
      ctx
    )
  return { pedir }
}

const de = (clave: string) => ({ 'x-sloth-clave': clave, 'x-sloth-equipo': EQUIPO })

/** Google de mentira: guarda lo que se le pidió y contesta como contesta. */
function google(t: { mock: { method: typeof test.mock.method } }, respuesta = () => Response.json({ access_token: 'acceso', refresh_token: 'refresh', expires_in: 3599, scope: 'a b', id_token: 'de-mas' })) {
  const pedidos: URLSearchParams[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), 'https://oauth2.googleapis.com/token')
    pedidos.push(init!.body as URLSearchParams)
    return respuesta()
  })
  return pedidos
}

test('sin sus dos secretos, la app de Sloth no se ofrece; con ellos, dice su id y si quien pregunta apoya', async () => {
  assert.deepEqual(await (await cobro(false).pedir('/youtube', de(APOYA))).json(), {})
  assert.equal((await cobro(false).pedir('/youtube/token', de(APOYA), { refresh: 'r' })).status, 503)
  const c = cobro()
  assert.deepEqual(await (await c.pedir('/youtube', de(APOYA))).json(), { cliente: '123-sloth.apps.googleusercontent.com', apoya: true })
  assert.deepEqual(await (await c.pedir('/youtube', de(CUENTA))).json(), { cliente: '123-sloth.apps.googleusercontent.com', apoya: false })
  assert.deepEqual(await (await c.pedir('/youtube', {})).json(), { cliente: '123-sloth.apps.googleusercontent.com', apoya: false })
  assert.equal((await c.pedir('/youtube', { authorization: 'Bearer llave-del-creador' }).then((r) => r.json()) as { apoya: boolean }).apoya, true)
})

test('una cuenta gratis no consigue el permiso: el cobro ni le pregunta a Google', async (t) => {
  const pedidos = google(t)
  const c = cobro()
  for (const quien of [de(CUENTA), {}, { 'x-sloth-clave': APOYA, 'x-sloth-equipo': 'ffffffffd9cb469fa16570867728950e' }]) {
    const r = await c.pedir('/youtube/token', quien, { refresh: 'refresh-guardado' })
    assert.equal(r.status, 402)
    assert.match(((await r.json()) as { error: string }).error, /quienes apoyan/)
  }
  assert.equal(pedidos.length, 0)
})

test('quien apoya canjea el código y renueva el permiso; el secreto solo va a Google y no vuelve', async (t) => {
  const pedidos = google(t)
  const c = cobro()
  const canje = await c.pedir('/youtube/token', de(APOYA), { code: 'codigo', verifier: VERIFICADOR, retorno: RETORNO })
  assert.equal(canje.status, 200)
  const texto = await canje.text()
  assert.deepEqual(JSON.parse(texto), { access_token: 'acceso', expires_in: 3599, refresh_token: 'refresh', scope: 'a b' })
  assert.ok(!texto.includes(SECRETO))
  assert.deepEqual(Object.fromEntries(pedidos[0]), {
    client_id: '123-sloth.apps.googleusercontent.com', client_secret: SECRETO, code: 'codigo', code_verifier: VERIFICADOR, redirect_uri: RETORNO, grant_type: 'authorization_code'
  })
  assert.equal((await c.pedir('/youtube/token', de(APOYA), { refresh: 'refresh' })).status, 200)
  assert.deepEqual(Object.fromEntries(pedidos[1]), { client_id: '123-sloth.apps.googleusercontent.com', client_secret: SECRETO, refresh_token: 'refresh', grant_type: 'refresh_token' })
})

test('Google solo vuelve a la computadora de quien se conecta, y su negativa llega tal cual', async (t) => {
  const pedidos = google(t, () => Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 }))
  const c = cobro()
  for (const retorno of ['https://otro.sitio/api/youtube/oauth', 'http://127.0.0.1:4848/otra', 'http://localhost:4848/api/youtube/oauth'])
    assert.equal((await c.pedir('/youtube/token', de(APOYA), { code: 'codigo', verifier: VERIFICADOR, retorno })).status, 400, retorno)
  assert.equal((await c.pedir('/youtube/token', de(APOYA), { code: 'codigo', verifier: 'corto', retorno: RETORNO })).status, 400)
  assert.equal(pedidos.length, 0)
  const r = await c.pedir('/youtube/token', de(APOYA), { refresh: 'retirado' })
  assert.equal(r.status, 400)
  assert.deepEqual(await r.json(), { error: 'invalid_grant' })
})
