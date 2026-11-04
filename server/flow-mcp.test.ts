import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { hechoDeFlow } from '../shared/flow.ts'

// El MCP de Flow (`flow/mcp.mjs`) contra un servidor de Sloth de mentira: lo que el agente ve al pedir un video.
test('el MCP de Flow pide el video, dice lo gastado y explica por qué no generó', async (t) => {
  const pedidos: string[] = []
  const sloth = createServer(async (req, res) => {
    let cuerpo = ''
    for await (const p of req) cuerpo += p
    pedidos.push(`${req.method} ${req.url} ${cuerpo}`)
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/flow/generar' && cuerpo.includes('caro')) {
      res.statusCode = 200
      return res.end(JSON.stringify({ id: 'b', estado: 'error', tipo: 'video', modelo: 'Veo 3.1 - Quality', error: 'Cuesta 100 créditos y el tope es 20. No se generó nada.' }))
    }
    if (req.url === '/api/flow/generar' && cuerpo.includes('imagen')) return res.end(JSON.stringify({ id: 'i', estado: 'lista', tipo: 'imagen', modelo: 'Nano Banana 2.1', archivo: 'C:\\v\\pose.jpg', creditos: 0 }))
    if (req.url === '/api/flow/generar') return res.end(JSON.stringify({ id: 'a', estado: 'en-fila', tipo: 'video', modelo: 'Veo 3.1 - Lite' }))
    if (req.url?.startsWith('/api/flow/trabajos/a')) return res.end(JSON.stringify({ id: 'a', estado: 'lista', tipo: 'video', modelo: 'Veo 3.1 - Lite', archivo: 'C:\\v\\clip.mp4', creditos: 10, cuenta: 'otra@gmail.com', quedan: 40 }))
    if (req.url === '/api/flow') {
      const cuentas = [
        { correo: 'una@gmail.com', deLaVoz: true, generando: false, saldo: { creditos: 40, renueva: Date.now() + 3_600_000, leido: Date.now() }, hoy: { videos: 1, creditos: 10 } },
        { correo: 'otra@gmail.com', deLaVoz: false, generando: false, hoy: { videos: 0, creditos: 0 } }
      ]
      return res.end(JSON.stringify({ cuentas, quedan: 40, uso: { hoy: { videos: 1, creditos: 10 }, mes: { videos: 4, creditos: 40 } } }))
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>((r) => sloth.listen(0, '127.0.0.1', r))
  t.after(() => sloth.close())
  const mcp = spawn(process.execPath, [join(import.meta.dirname, 'flow', 'mcp.mjs')], { env: { ...process.env, SLOTH_URL: `http://127.0.0.1:${(sloth.address() as AddressInfo).port}` } })
  t.after(() => mcp.kill())
  const respuestas = createInterface({ input: mcp.stdout })[Symbol.asyncIterator]()
  let n = 0
  const llamar = async (method: string, params?: unknown) => {
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params })}\n`)
    return JSON.parse(String((await respuestas.next()).value))
  }

  assert.equal((await llamar('initialize', { protocolVersion: '2025-06-18' })).result.serverInfo.name, 'flow')
  assert.deepEqual((await llamar('tools/list')).result.tools.map((h: { name: string }) => h.name), ['generar_imagen', 'generar_video', 'estado_flow'])
  const hecho = (await llamar('tools/call', { name: 'generar_video', arguments: { prompt: 'un perezoso', primerCuadro: 'C:\\v\\escena.png', salida: 'C:\\v\\clip.mp4' } })).result
  assert.equal(hecho.isError, undefined)
  assert.match(hecho.content[0].text, /^Lista: C:\\v\\clip\.mp4 \(Veo 3\.1 - Lite, 10 créditos gastados, con otra@gmail\.com, pedido a\)\. Les quedan 40 créditos a las cuentas\.$/)
  // El chat lo lee de vuelta, como texto (Claude) y como el JSON del MCP (Codex).
  const leido = { archivo: 'C:\\v\\clip.mp4', modelo: 'Veo 3.1 - Lite', creditos: 10, cuenta: 'otra@gmail.com', pedido: 'a', quedan: 40 }
  assert.deepEqual(hechoDeFlow(hecho.content[0].text), leido)
  assert.deepEqual(hechoDeFlow(JSON.stringify({ content: hecho.content })), leido)
  assert.ok(pedidos.some((p) => p.startsWith('POST /api/flow/generar') && p.includes('"tipo":"video"') && p.includes('"primerCuadro":"C:\\\\v\\\\escena.png"')))
  const imagen = (await llamar('tools/call', { name: 'generar_imagen', arguments: { prompt: 'la pose', referencias: ['C:\\v\\perro.png'], salida: 'C:\\v\\pose.jpg' } })).result
  assert.match(imagen.content[0].text, /^Lista: C:\\v\\pose\.jpg/)
  assert.ok(pedidos.some((p) => p.includes('"referencias":["C:\\\\v\\\\perro.png"]')))
  const caro = (await llamar('tools/call', { name: 'generar_video', arguments: { prompt: 'caro', salida: 'C:\\v\\clip.mp4' } })).result
  assert.equal(caro.isError, true)
  assert.match(caro.content[0].text, /Cuesta 100 créditos/)
  const saldos = (await llamar('tools/call', { name: 'estado_flow', arguments: {} })).result.content[0].text
  assert.match(saldos, /- una@gmail\.com: 40 créditos, se renuevan a las .+\. Hoy, 1 video\./)
  assert.match(saldos, /- otra@gmail\.com: aún no se sabe cuánto le queda\./)
  assert.match(saldos, /quedan 40 créditos\. Hoy van 1 videos \(10 créditos\); este mes, 4 \(40\)\./)
})
