import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { dictadoVivo } from './dictado-vivo.ts'
import type { Credencial } from './comunidad.ts'

class Canal extends EventEmitter {
  readyState: number = WebSocket.OPEN
  bufferedAmount = 0
  enviados: unknown[] = []
  send(d: unknown) { this.enviados.push(d) }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close') }
  terminate() {}
}

const cuenta = { clave: 'SLOTH-AAAA-BBBB-CCCC-DDDD', equipo: '0123456789abcdef0123456789abcdef' }

test('el dictado en vivo va por el cobro con tu cuenta, pasa los parciales y los finales y le manda «fin»', async () => {
  const cliente = new Canal(), remoto = new Canal()
  let con: Credencial | undefined
  try {
    await dictadoVivo(cliente as unknown as WebSocket, async () => cuenta, (c) => ((con = c), remoto as unknown as WebSocket))
    assert.deepEqual(con, cuenta)
    remoto.emit('open')
    cliente.emit('message', Buffer.from('audio'), true)
    remoto.emit('message', Buffer.from(JSON.stringify({ type: 'Results', channel: { alternatives: [{ transcript: 'Hola' }] }, is_final: false })))
    remoto.emit('message', Buffer.from(JSON.stringify({ type: 'Results', channel: { alternatives: [{ transcript: 'Hola mundo.' }] }, is_final: true })))
    cliente.emit('message', Buffer.from('fin'), false)
    assert.equal((remoto.enviados[0] as Buffer).toString(), 'audio')
    assert.equal(remoto.enviados[1], 'fin')
    const mensajes = cliente.enviados.map((m) => JSON.parse(m as string))
    assert.deepEqual(mensajes, [{ tipo: 'listo' }, { tipo: 'texto', texto: 'Hola', final: false }, { tipo: 'texto', texto: 'Hola mundo.', final: true }])
    remoto.close()
    assert.deepEqual(JSON.parse(cliente.enviados.at(-1) as string), { tipo: 'fin' })
  } finally {
    cliente.close()
  }
})

test('lo que dice el cobro (antes de abrir o ya abierto) llega tal cual a la vista y cierra', async () => {
  const cliente = new Canal(), remoto = new Canal()
  await dictadoVivo(cliente as unknown as WebSocket, () => cuenta, () => remoto as unknown as WebSocket)
  const res = new EventEmitter() as EventEmitter & { statusCode: number }
  res.statusCode = 403
  remoto.emit('unexpected-response', {}, res)
  res.emit('data', Buffer.from(JSON.stringify({ error: 'El dictado es para quien apoya a Sloth.' })))
  res.emit('end')
  assert.deepEqual(JSON.parse(cliente.enviados[0] as string), { error: 'El dictado es para quien apoya a Sloth.' })
  assert.equal(cliente.readyState, WebSocket.CLOSED)

  const otro = new Canal(), remoto2 = new Canal()
  await dictadoVivo(otro as unknown as WebSocket, () => cuenta, () => remoto2 as unknown as WebSocket)
  remoto2.emit('open')
  remoto2.emit('message', Buffer.from(JSON.stringify({ error: 'Se agotó el tiempo del dictado.' })))
  assert.deepEqual(JSON.parse(otro.enviados.at(-1) as string), { error: 'Se agotó el tiempo del dictado.' })
  assert.equal(otro.readyState, WebSocket.CLOSED)
})

test('sin cuenta en esta computadora, dice que es para quien apoya y no conecta a nada', async () => {
  const cliente = new Canal()
  let llamado = false
  await dictadoVivo(cliente as unknown as WebSocket, () => undefined, () => ((llamado = true), new Canal() as unknown as WebSocket))
  assert.equal(llamado, false)
  assert.match(JSON.parse(cliente.enviados[0] as string).error, /quien apoya/)
  assert.equal(cliente.readyState, WebSocket.CLOSED)
})
