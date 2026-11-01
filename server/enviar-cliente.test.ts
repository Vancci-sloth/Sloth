import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { WebSocket, WebSocketServer } from 'ws'
import { enviarCliente, TOPE_CLIENTE } from './enviar-cliente.ts'

test('un cliente atrasado tiene cola acotada y uno nuevo puede recibir el estado completo', async (t) => {
  const servidor = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(servidor, 'listening')
  const direccion = servidor.address()
  assert.ok(direccion && typeof direccion !== 'string')
  const cliente = new WebSocket(`ws://127.0.0.1:${direccion.port}`)
  cliente.on('error', () => {})
  t.after(() => { cliente.terminate(); for (const c of servidor.clients) c.terminate(); servidor.close() })
  const [conexion] = await once(servidor, 'connection') as [WebSocket]
  const texto = 'x'.repeat(256 * 1024)
  let maximo = 0
  let enviados = 0
  for (let i = 0; i < 256; i++) {
    if (!enviarCliente(conexion, texto)) break
    enviados++
    maximo = Math.max(maximo, conexion.bufferedAmount)
  }
  assert.ok(enviados < 256)
  assert.ok(maximo <= TOPE_CLIENTE + Buffer.byteLength(texto) + 20)
  assert.equal(enviarCliente(conexion, 'ya cerrado'), false)
  const nuevaConexion = once(servidor, 'connection')
  const otro = new WebSocket(`ws://127.0.0.1:${direccion.port}`)
  otro.on('error', () => {})
  t.after(() => otro.terminate())
  await once(otro, 'open')
  const [nueva] = await nuevaConexion as [WebSocket]
  const recibido = once(otro, 'message')
  assert.equal(enviarCliente(nueva, JSON.stringify({ type: 'state', completo: true })), true)
  assert.equal(JSON.parse(String((await recibido)[0])).completo, true)
  t.diagnostic(`Pendientes máximos: ${maximo} bytes; mensajes antes de recuperar: ${enviados}`)
})
