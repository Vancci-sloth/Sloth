import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { estaticos } from './estaticos.ts'

test('sirve un trozo de un archivo, para que un video vuelva al principio', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-estaticos-'))
  mkdirSync(join(raiz, 'cambios'))
  writeFileSync(join(raiz, 'cambios', 'a.mp4'), '0123456789')
  writeFileSync(join(raiz, 'index.html'), 'inicio')
  const servidor = createServer(estaticos(raiz)).listen(0)
  try {
    await new Promise((r) => servidor.once('listening', r))
    const url = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`
    const entero = await fetch(`${url}/cambios/a.mp4`)
    assert.equal(entero.status, 200)
    assert.equal(await entero.text(), '0123456789')
    const trozo = await fetch(`${url}/cambios/a.mp4`, { headers: { range: 'bytes=2-4' } })
    assert.equal(trozo.status, 206)
    assert.equal(trozo.headers.get('content-range'), 'bytes 2-4/10')
    assert.equal(await trozo.text(), '234')
    assert.equal(await (await fetch(`${url}/cambios/a.mp4`, { headers: { range: 'bytes=7-' } })).text(), '789')
    assert.equal((await fetch(`${url}/cambios/a.mp4`, { headers: { range: 'bytes=20-' } })).status, 416)
    assert.equal(await (await fetch(`${url}/otra/ruta`)).text(), 'inicio')
  } finally {
    servidor.close()
    rmSync(raiz, { recursive: true, force: true })
  }
})
