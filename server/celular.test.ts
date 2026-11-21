import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { WebSocket, WebSocketServer } from 'ws'
import type { Celular } from '../shared/types.ts'
import { cabecerasParaSloth, celular, direcciones, enlaceDe, llaveDe, mismaLlave } from './celular.ts'

test('a Sloth le llega como un script de esta computadora: sin origen, sin llave y con su host', () => {
  const h = cabecerasParaSloth(
    { host: '192.168.1.5:4849', origin: 'http://x', referer: 'http://x/', authorization: 'Bearer abc', 'sec-fetch-site': 'cross-site', range: 'bytes=0-', connection: 'keep-alive', 'x-a': ['1', '2'] },
    4848
  )
  assert.deepEqual(h, { host: '127.0.0.1:4848', range: 'bytes=0-', 'x-a': '1, 2' })
  const ws = cabecerasParaSloth({ connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': 'k' }, 4848, true)
  assert.equal(ws.upgrade, 'websocket')
  assert.equal(ws.connection, 'Upgrade')
})

test('la llave va en Authorization o en ?llave=, y se compara entera', () => {
  assert.equal(llaveDe({ headers: { authorization: 'Bearer uno' } }, new URL('http://x/?llave=dos')), 'uno')
  assert.equal(llaveDe({ headers: {} }, new URL('http://x/?llave=dos')), 'dos')
  assert.equal(llaveDe({ headers: {} }, new URL('http://x/')), '')
  assert.ok(mismaLlave('abc', 'abc'))
  assert.ok(!mismaLlave('abc', 'abd'))
  assert.ok(!mismaLlave('', ''))
})

test('las direcciones de la casa van primero, luego Tailscale; las internas y las de máquinas virtuales no estorban', () => {
  const ip = (address: string, internal = false) => ({ address, family: 'IPv4' as const, internal, netmask: '', mac: '', cidr: null })
  const lista = direcciones({
    'vEthernet (WSL)': [ip('172.20.0.1')],
    Tailscale: [ip('100.101.1.2')],
    'Wi-Fi': [ip('192.168.1.20'), { ...ip('fe80::1'), family: 'IPv6' as const, scopeid: 0 }],
    Loopback: [ip('127.0.0.1', true)],
    Otra: [ip('169.254.3.3')]
  })
  assert.deepEqual(lista.map((d) => [d.ip, d.tipo]), [['192.168.1.20', 'casa'], ['172.20.0.1', 'casa'], ['100.101.1.2', 'tailscale']])
})

test('el QR lleva todas las direcciones y la llave', () => {
  const e = new URL(enlaceDe(['192.168.1.20', '100.1.1.1'], 4849, 'a-b_c'))
  assert.equal(e.protocol, 'slothmovil:')
  assert.equal(e.searchParams.get('d'), '192.168.1.20:4849,100.1.1.1:4849')
  assert.equal(e.searchParams.get('llave'), 'a-b_c')
})

// De punta a punta: un Sloth de mentira que dice qué le llegó, y la puerta del celular delante.
const app = mkdtempSync(join(tmpdir(), 'sloth-celular-'))
const visto: { url?: string; headers?: IncomingMessage['headers']; cuerpo?: string } = {}
const sloth = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  let cuerpo = ''
  for await (const t of req) cuerpo += t
  Object.assign(visto, { url: req.url, headers: req.headers, cuerpo })
  res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
})
const wss = new WebSocketServer({ noServer: true })
sloth.on('upgrade', (req, socket, head) => {
  if (req.headers.host?.startsWith('127.0.0.1:') && !req.headers.origin) wss.handleUpgrade(req, socket, head, (ws) => ws.on('message', (m) => ws.send(`eco ${m}`)))
  else socket.destroy()
})
/**
 * La puerta escucha en el puerto de Sloth más uno, en todas las direcciones: se busca uno libre cuyo siguiente también
 * lo esté. Si no, cuando el siguiente lo usa otro programa, fallan las pruebas de la puerta encendida.
 */
async function conSiguienteLibre(): Promise<number> {
  for (;;) {
    await new Promise<void>((ok) => sloth.listen(0, '127.0.0.1', ok))
    const p = (sloth.address() as AddressInfo).port
    const prueba = createServer()
    const libre = await new Promise<boolean>((ok) => prueba.once('error', () => ok(false)).listen(p + 1, '0.0.0.0', () => ok(true)))
    if (libre) {
      await new Promise((ok) => prueba.close(ok))
      return p
    }
    await new Promise((ok) => sloth.close(ok))
  }
}
const puerto = await conSiguienteLibre()
const puerta = celular({ app, puerto, version: '9.9.9' })
after(async () => {
  await pedirLocal('/api/celular', { activo: false })
  sloth.close()
  rmSync(app, { recursive: true, force: true })
})

/** Lo que pide la ventana de Sloth: va directo a `api`, como desde `server/index.ts`. */
async function pedirLocal(path: string, body?: unknown): Promise<Celular> {
  const srv = createServer((req, res: ServerResponse) => void puerta.api(req, res, path))
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok))
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })
    return (await r.json()) as Celular
  } finally {
    srv.closeAllConnections()
    srv.close()
  }
}

test('encendida, solo deja pasar con la llave y reenvía /api a Sloth', async () => {
  const e = await pedirLocal('/api/celular', { activo: true })
  assert.ok(e.activo && e.escuchando, e.error ?? '')
  assert.equal(e.puerto, puerto + 1)
  assert.ok(e.llave.length >= 32)
  assert.equal(JSON.parse(readFileSync(join(app, 'data', 'celular.json'), 'utf8')).llave, e.llave)
  const base = `http://127.0.0.1:${e.puerto}`

  assert.equal((await fetch(`${base}/api/state`)).status, 401)
  assert.equal((await fetch(`${base}/api/state`, { headers: { authorization: 'Bearer otra' } })).status, 401)

  const hola = await (await fetch(`${base}/api/celular/hola?llave=${e.llave}`)).json()
  assert.equal(hola.sloth, true)
  assert.equal(hola.version, '9.9.9')

  // La ventana de Sloth es la única que la apaga o cambia la llave.
  assert.equal((await fetch(`${base}/api/celular`, { method: 'POST', headers: { authorization: `Bearer ${e.llave}` }, body: '{}' })).status, 404)
  // Y lo que no es de la API (la interfaz de escritorio) no pasa.
  assert.equal((await fetch(`${base}/`, { headers: { authorization: `Bearer ${e.llave}` } })).status, 404)

  const r = await fetch(`${base}/api/sessions/x/send?llave=${e.llave}&a=1`, { method: 'POST', headers: { origin: 'http://otra', 'content-type': 'application/json' }, body: '{"text":"hola"}' })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('access-control-allow-origin'), '*')
  assert.equal(visto.url, '/api/sessions/x/send?a=1')
  assert.equal(visto.headers?.host, `127.0.0.1:${puerto}`)
  assert.equal(visto.headers?.origin, undefined)
  assert.equal(visto.cuerpo, '{"text":"hola"}')
})

test('el WebSocket pasa entero, y cambiar la llave desconecta al que tenía la de antes', async () => {
  const e = await pedirLocal('/api/celular', { activo: true })
  const ws = new WebSocket(`ws://127.0.0.1:${e.puerto}/ws?llave=${e.llave}`)
  await new Promise((ok, mal) => ws.once('open', ok).once('error', mal))
  const eco = new Promise((ok) => ws.once('message', (m) => ok(String(m))))
  ws.send('hola')
  assert.equal(await eco, 'eco hola')

  const cerrado = new Promise((ok) => ws.once('close', ok))
  const nueva = await pedirLocal('/api/celular/llave', {})
  assert.notEqual(nueva.llave, e.llave)
  await cerrado

  const viejo = new WebSocket(`ws://127.0.0.1:${e.puerto}/ws?llave=${e.llave}`)
  await assert.rejects(new Promise((ok, mal) => viejo.once('open', ok).once('error', mal)))
})

test('apagada, el puerto del celular deja de escuchar', async () => {
  const e = await pedirLocal('/api/celular', { activo: false })
  assert.ok(!e.activo && !e.escuchando)
  await assert.rejects(fetch(`http://127.0.0.1:${e.puerto}/api/state`))
})
