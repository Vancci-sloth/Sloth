import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dictado } from './dictado.ts'

test('dictado envía audio al proveedor y solo devuelve el texto; oculta errores del proveedor', async () => {
  const anterior = globalThis.fetch
  const clave = process.env.DEEPGRAM_API_KEY
  process.env.DEEPGRAM_API_KEY = 'clave-de-prueba'
  async function llamar(tipo: string, audio = 'audio') {
    const req = Readable.from([Buffer.from(audio)]) as IncomingMessage
    req.method = 'POST'
    req.headers = { 'content-type': tipo }
    let status = 0, datos = ''
    const res = { writeHead(s: number) { status = s }, end(s: string) { datos = s } } as unknown as ServerResponse
    await dictado(req, res)
    return { status, datos: JSON.parse(datos) }
  }
  try {
    globalThis.fetch = async (_url, opciones) => {
      assert.equal((opciones?.headers as Record<string, string>).Authorization, 'Token clave-de-prueba')
      assert.ok(opciones?.body instanceof Uint8Array)
      return Response.json({ results: { channels: [{ alternatives: [{ transcript: 'Hola, crea un video.' }] }] } })
    }
    assert.deepEqual(await llamar('audio/webm;codecs=opus'), { status: 200, datos: { texto: 'Hola, crea un video.' } })
    assert.equal((await llamar('text/plain')).status, 415)
    assert.equal((await llamar('audio/webm', '')).status, 400)
    globalThis.fetch = async () => new Response('contenido privado', { status: 401 })
    const fallo = await llamar('audio/webm')
    assert.equal(fallo.status, 502)
    assert.ok(!JSON.stringify(fallo).includes('contenido privado'))
    globalThis.fetch = async () => Response.json({ results: { channels: [] } })
    assert.equal((await llamar('audio/webm')).status, 422)
  } finally {
    globalThis.fetch = anterior
    if (clave === undefined) delete process.env.DEEPGRAM_API_KEY
    else process.env.DEEPGRAM_API_KEY = clave
  }
})
