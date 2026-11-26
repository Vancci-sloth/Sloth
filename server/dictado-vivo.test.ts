import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { dictadoVivo } from './dictado-vivo.ts'

test('dictado vivo conserva parciales y finales y termina después del último audio', () => {
  class Canal extends EventEmitter {
    readyState = WebSocket.OPEN
    bufferedAmount = 0
    enviados: unknown[] = []
    send(d: unknown) { this.enviados.push(d) }
    close() { this.emit('close') }
    terminate() {}
  }
  const cliente = new Canal(), remoto = new Canal()
  const anterior = process.env.DEEPGRAM_API_KEY
  process.env.DEEPGRAM_API_KEY = 'prueba'
  try {
    dictadoVivo(cliente as unknown as WebSocket, () => remoto as unknown as WebSocket)
    remoto.emit('open')
    cliente.emit('message', Buffer.from('audio'), true)
    remoto.emit('message', Buffer.from(JSON.stringify({ type: 'Results', channel: { alternatives: [{ transcript: 'Hola' }] }, is_final: false })))
    remoto.emit('message', Buffer.from(JSON.stringify({ type: 'Results', channel: { alternatives: [{ transcript: 'Hola mundo.' }] }, is_final: true })))
    cliente.emit('message', Buffer.from('fin'), false)
    assert.equal((remoto.enviados[0] as Buffer).toString(), 'audio')
    assert.deepEqual(JSON.parse(remoto.enviados[1] as string), { type: 'CloseStream' })
    const mensajes = cliente.enviados.map(m => JSON.parse(m as string))
    assert.deepEqual(mensajes.slice(1), [{ tipo: 'texto', texto: 'Hola', final: false }, { tipo: 'texto', texto: 'Hola mundo.', final: true }])
  } finally {
    cliente.close()
    if (anterior === undefined) delete process.env.DEEPGRAM_API_KEY
    else process.env.DEEPGRAM_API_KEY = anterior
  }
})
