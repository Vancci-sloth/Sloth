import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { enTubo, esVuelta, sinEscapes, ventanasRemotas } from './ventanas-remotas.ts'

/** Pide a la API como la web: un servidor de prueba con solo estas rutas. */
async function conServidor<T>(hacer: (base: string) => Promise<T>): Promise<T> {
  const v = ventanasRemotas(tmpdir())
  const s = createServer((req: IncomingMessage, res: ServerResponse) => void v.api(req, res, new URL(req.url ?? '/', 'http://x')).then((si) => si || (res.writeHead(404), res.end())))
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok))
  try {
    return await hacer(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)
  } finally {
    s.close()
  }
}

test('un inicio de sesión sin ventana se ve en la web, con su enlace, y recibe lo que se escribe allá', async () => {
  // Como `claude auth login` sin terminal: da el enlace, pide el código y acaba al recibirlo.
  const programa = `process.stdout.write('\\x1b[1mVisita:\\x1b[0m https://claude.com/cai/oauth/authorize?code=true\\nPaste code here if prompted > ');process.stdin.once('data', (d) => { console.log('recibido:' + String(d).trim()); process.exit(0) })`
  const acabo = enTubo('Claude Code', [process.execPath, '-e', programa], process.env)
  await conServidor(async (base) => {
    let lista: { tipo: string; id: string; titulo: string; salida: string; url?: string }[] = []
    for (let i = 0; i < 50 && !lista.some((v) => v.url); i++) {
      lista = await (await fetch(`${base}/api/web/ventanas`)).json()
      await new Promise((r) => setTimeout(r, 100))
    }
    const t = lista.find((v) => v.tipo === 'terminal')!
    assert.equal(t.titulo, 'Claude Code')
    assert.equal(t.url, 'https://claude.com/cai/oauth/authorize?code=true')
    assert.ok(!t.salida.includes('\x1b'), 'sin colores de terminal')
    const r = await fetch(`${base}/api/web/ventanas/terminal/${t.id}/escribir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'CODIGO-123\nrm -rf' }) })
    assert.equal(r.status, 200)
    await acabo
    // Al acabar, ya no sale.
    assert.deepEqual((await (await fetch(`${base}/api/web/ventanas`)).json()).filter((v: { tipo: string }) => v.tipo === 'terminal'), [])
  })
})

test('la vuelta de un inicio de sesión solo puede ser a esta computadora', () => {
  assert.equal(esVuelta('http://127.0.0.1:4848/api/youtube/oauth?code=x&state=y'), true)
  assert.equal(esVuelta('http://localhost:51121/oauth-callback?code=x'), true)
  assert.equal(esVuelta('https://malo.example/robar'), false)
  assert.equal(esVuelta('http://169.254.169.254/latest'), false)
  assert.equal(esVuelta('file:///C:/Windows/win.ini'), false)
  assert.equal(esVuelta(42), false)
})

test('solo se abren por la web los Edge de Sloth, no cualquier puerto de la computadora', async () => {
  await conServidor(async (base) => {
    assert.equal((await fetch(`${base}/api/web/ventanas/edge/22/ABC/captura`)).status, 404)
    assert.equal((await fetch(`${base}/api/web/vuelta`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://malo.example' }) })).status, 400)
  })
})

test('lo que escribe una terminal se lee sin sus códigos de color ni de cursor', () => {
  assert.equal(sinEscapes('\x1b[32mlisto\x1b[0m\r\x1b[2Kotra'), 'listo\notra')
})
