import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import test from 'node:test'

const MCP = join(import.meta.dirname, 'navegador-mcp.mjs')

/** Un Playwright de mentira: anota que arrancó, contesta lo suyo y sale al cerrarle la entrada, como el de verdad. */
const FALSO = `
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
const huella = process.argv[2]
appendFileSync(huella, 'arranque\\n')
const decir = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n')
createInterface(process.stdin).on('line', (l) => {
  const m = JSON.parse(l)
  appendFileSync(huella, (m.method ?? 'respuesta') + '\\n')
  if (m.method === 'initialize') decir(m.id, { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'falso', version: '1' } })
  if (m.method === 'tools/list') decir(m.id, { tools: [{ name: 'browser_navigate' }] })
  if (m.method === 'tools/call') decir(m.id, { content: [{ type: 'text', text: 'hecho ' + m.params.name }] })
}).on('close', () => {
  appendFileSync(huella, 'cerrado\\n')
  process.exit(0)
})
`

function preparar(t: { after(f: () => void): void }, { guardado = false, suelta = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-mcp-'))
  const falso = join(dir, 'falso.mjs')
  const huella = join(dir, 'huella.txt')
  const cache = join(dir, 'cache.json')
  writeFileSync(falso, FALSO)
  writeFileSync(huella, '')
  if (guardado) writeFileSync(cache, JSON.stringify({ capabilities: { tools: {} }, serverInfo: { name: 'guardado', version: '1' }, tools: [{ name: 'browser_navigate' }] }))
  const p = spawn(process.execPath, [MCP, cache, String(suelta), falso, huella], { stdio: ['pipe', 'pipe', 'inherit'] })
  const esperan = new Map<number, (m: any) => void>()
  createInterface(p.stdout).on('line', (l) => {
    const m = JSON.parse(l)
    esperan.get(m.id)?.(m)
    esperan.delete(m.id)
  })
  let n = 0
  const pedir = (method: string, params: unknown = {}) =>
    new Promise<any>((listo) => {
      esperan.set(++n, listo)
      p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`)
    })
  const avisar = (method: string) => p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`)
  const arranques = () => readFileSync(huella, 'utf8').split('\n').filter((l) => l === 'arranque').length
  const terminar = () => new Promise<void>((listo) => (p.once('exit', () => listo()), p.stdin.end()))
  t.after(() => {
    p.kill()
    rmSync(dir, { recursive: true, force: true })
  })
  return { pedir, avisar, arranques, terminar, cache, huella }
}

const hola = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } }

test('con lo guardado, un hilo que no usa el navegador nunca lanza Playwright', async (t) => {
  const h = preparar(t, { guardado: true })
  const init = await h.pedir('initialize', hola)
  assert.equal(init.result.protocolVersion, hola.protocolVersion)
  assert.equal(init.result.serverInfo.name, 'guardado')
  h.avisar('notifications/initialized')
  assert.deepEqual((await h.pedir('tools/list')).result.tools, [{ name: 'browser_navigate' }])
  assert.deepEqual((await h.pedir('ping')).result, {})
  assert.equal((await h.pedir('resources/list')).error.code, -32601, 'como Playwright: no tiene recursos')
  await h.terminar()
  assert.equal(h.arranques(), 0)
})

test('la primera herramienta lanza Playwright con lo que mandó el agente, y de ahí todo pasa por él', async (t) => {
  const h = preparar(t, { guardado: true })
  await h.pedir('initialize', hola)
  h.avisar('notifications/initialized')
  const [a, b] = await Promise.all([h.pedir('tools/call', { name: 'uno' }), h.pedir('tools/call', { name: 'dos' })])
  assert.equal(a.result.content[0].text, 'hecho uno')
  assert.equal(b.result.content[0].text, 'hecho dos')
  assert.equal(h.arranques(), 1)
  assert.equal(readFileSync(h.huella, 'utf8').split('\n').filter((l) => l === 'notifications/initialized').length, 1)
  await h.terminar()
})

test('la primera vez pregunta a Playwright y guarda lo que contesta', async (t) => {
  const h = preparar(t)
  const init = await h.pedir('initialize', hola)
  assert.equal(init.result.serverInfo.name, 'falso')
  h.avisar('notifications/initialized')
  await h.pedir('tools/list')
  await h.terminar()
  assert.equal(h.arranques(), 1)
  assert.ok(existsSync(h.cache))
  assert.deepEqual(JSON.parse(readFileSync(h.cache, 'utf8')), { capabilities: { tools: {} }, serverInfo: { name: 'falso', version: '1' }, tools: [{ name: 'browser_navigate' }] })
})

/** Hasta 5 s: en una máquina ocupada, soltarlo tarda lo que tarde. */
const soltado = async (huella: string) => {
  for (let i = 0; i < 200 && !readFileSync(huella, 'utf8').split('\n').includes('cerrado'); i++) await new Promise((r) => setTimeout(r, 25))
}

test('el hilo que aprendió la lista también suelta Playwright, aunque el agente no llegue a usarlo', async (t) => {
  const h = preparar(t, { suelta: 80 })
  await h.pedir('initialize', hola)
  h.avisar('notifications/initialized')
  await h.pedir('tools/list')
  await soltado(h.huella)
  assert.ok(readFileSync(h.huella, 'utf8').split('\n').includes('cerrado'))
  await h.terminar()
})

test('sin llamadas suelta Playwright, y la siguiente lo vuelve a lanzar', async (t) => {
  const h = preparar(t, { guardado: true, suelta: 80 })
  await h.pedir('initialize', hola)
  await h.pedir('tools/call', { name: 'uno' })
  await soltado(h.huella)
  assert.equal(readFileSync(h.huella, 'utf8').split('\n').filter((l) => l === 'tools/call').length, 1)
  assert.equal((await h.pedir('tools/list')).result.tools.length, 1, 'mientras tanto contesta solo')
  assert.equal(h.arranques(), 1)
  const b = await h.pedir('tools/call', { name: 'dos' })
  assert.equal(b.result.content[0].text, 'hecho dos')
  assert.equal(h.arranques(), 2)
  await h.terminar()
})
