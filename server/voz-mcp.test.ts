import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'

// El MCP de la voz (`voz/mcp.mjs`) contra un servidor de Sloth de mentira: lo que el agente ve al pedir una voz.
test('el MCP de la voz pide la voz, espera su turno y dice dónde quedó', async (t) => {
  const pedidos: string[] = []
  const sloth = createServer(async (req, res) => {
    let cuerpo = ''
    for await (const p of req) cuerpo += p
    pedidos.push(`${req.method} ${req.url} ${cuerpo}`)
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/voz') return res.end(JSON.stringify({ cuenta: 'yo@gmail.com', conectando: false, enFila: 0, voces: [{ nombre: 'Fola', descripcion: 'Clear and friendly · Medium pitch', grupo: 'Call Center' }, { nombre: 'Riko', descripcion: 'Confident and clear · Deep pitch', grupo: 'Storyteller' }] }))
    if (req.url === '/api/voz/generar') return res.end(JSON.stringify({ id: 'abc', estado: 'en-fila', voz: 'Fola', palabras: 3 }))
    if (req.url?.startsWith('/api/voz/trabajos/abc')) return res.end(JSON.stringify({ id: 'abc', estado: 'lista', voz: 'Fola', palabras: 3, archivo: 'C:\\v\\fuentes\\voz\\ai-studio.wav', segundos: 1.5 }))
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>((r) => sloth.listen(0, '127.0.0.1', r))
  t.after(() => sloth.close())
  const mcp = spawn(process.execPath, [join(import.meta.dirname, 'voz', 'mcp.mjs')], { env: { ...process.env, SLOTH_URL: `http://127.0.0.1:${(sloth.address() as AddressInfo).port}` } })
  t.after(() => mcp.kill())
  const respuestas = createInterface({ input: mcp.stdout })[Symbol.asyncIterator]()
  let n = 0
  const llamar = async (method: string, params?: unknown) => {
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params })}\n`)
    return JSON.parse(String((await respuestas.next()).value))
  }

  assert.equal((await llamar('initialize', { protocolVersion: '2025-06-18' })).result.serverInfo.name, 'voz')
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  assert.deepEqual((await llamar('tools/list')).result.tools.map((h: { name: string }) => h.name), ['voces', 'generar_voz', 'estado_voz'])
  const voces = (await llamar('tools/call', { name: 'voces', arguments: { buscar: 'deep' } })).result.content[0].text
  assert.match(voces, /yo@gmail\.com/)
  assert.match(voces, /Storyteller: Riko/)
  assert.doesNotMatch(voces, /Fola/)
  const hecha = (await llamar('tools/call', { name: 'generar_voz', arguments: { voz: 'Fola', texto: 'Hola a todos', salida: 'C:\\v\\fuentes\\voz\\ai-studio.wav' } })).result
  assert.equal(hecha.isError, undefined)
  assert.match(hecha.content[0].text, /^Lista: C:\\v\\fuentes\\voz\\ai-studio\.wav \(1\.5 s/)
  assert.ok(pedidos.some((p) => p.startsWith('GET /api/voz/trabajos/abc?esperar=40')))
})
