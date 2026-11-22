import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { WebSocket } from 'ws'
import { dictadoVivo } from './dictado-vivo.ts'

class Canal extends EventEmitter {
  readyState: number = WebSocket.OPEN
  bufferedAmount = 0
  enviados: unknown[] = []
  send(d: unknown) { this.enviados.push(d) }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close') }
  terminate() {}
}

test('el dictado en vivo pasa los parciales y los finales, cierra tras el último audio y nunca manda la llave', () => {
  const cliente = new Canal(), remoto = new Canal()
  const anterior = process.env.DEEPGRAM_API_KEY
  process.env.DEEPGRAM_API_KEY = 'prueba'
  let llave = ''
  try {
    dictadoVivo(tmpdir(), cliente as unknown as WebSocket, (clave) => ((llave = clave), remoto as unknown as WebSocket))
    remoto.emit('open')
    cliente.emit('message', Buffer.from('audio'), true)
    remoto.emit('message', Buffer.from(JSON.stringify({ type: 'Results', channel: { alternatives: [{ transcript: 'Hola' }] }, is_final: false })))
    remoto.emit('message', Buffer.from(JSON.stringify({ type: 'Results', channel: { alternatives: [{ transcript: 'Hola mundo.' }] }, is_final: true })))
    cliente.emit('message', Buffer.from('fin'), false)
    assert.equal(llave, 'prueba')
    assert.equal((remoto.enviados[0] as Buffer).toString(), 'audio')
    assert.deepEqual(JSON.parse(remoto.enviados[1] as string), { type: 'CloseStream' })
    const mensajes = cliente.enviados.map((m) => JSON.parse(m as string))
    assert.deepEqual(mensajes, [{ tipo: 'listo' }, { tipo: 'texto', texto: 'Hola', final: false }, { tipo: 'texto', texto: 'Hola mundo.', final: true }])
    assert.ok(!cliente.enviados.join().includes('prueba'))
  } finally {
    cliente.close()
    if (anterior === undefined) delete process.env.DEEPGRAM_API_KEY
    else process.env.DEEPGRAM_API_KEY = anterior
  }
})

test('sin llave, el dictado en vivo dice qué falta y cierra sin llamar a Deepgram', () => {
  const cliente = new Canal()
  const anterior = process.env.DEEPGRAM_API_KEY
  delete process.env.DEEPGRAM_API_KEY
  try {
    let llamado = false
    dictadoVivo(tmpdir(), cliente as unknown as WebSocket, () => ((llamado = true), new Canal() as unknown as WebSocket))
    assert.equal(llamado, false)
    assert.match(JSON.parse(cliente.enviados[0] as string).error, /DEEPGRAM_API_KEY/)
    assert.equal(cliente.readyState, WebSocket.CLOSED)
  } finally {
    if (anterior !== undefined) process.env.DEEPGRAM_API_KEY = anterior
  }
})
