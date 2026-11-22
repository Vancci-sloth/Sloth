import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dictado, llaveDeepgram } from './dictado.ts'

/** Sin la variable de entorno de quien corre los tests. */
function sinVariable(t: { after(f: () => void): void }) {
  const antes = process.env.DEEPGRAM_API_KEY
  delete process.env.DEEPGRAM_API_KEY
  t.after(() => { if (antes === undefined) delete process.env.DEEPGRAM_API_KEY; else process.env.DEEPGRAM_API_KEY = antes })
}

test('la llave sale de DEEPGRAM_API_KEY o de data/deepgram.key, sin el BOM ni los saltos', (t) => {
  sinVariable(t)
  const app = mkdtempSync(join(tmpdir(), 'sloth-dictado-'))
  t.after(() => rmSync(app, { recursive: true, force: true }))
  assert.equal(llaveDeepgram(app), undefined)
  mkdirSync(join(app, 'data'))
  writeFileSync(join(app, 'data', 'deepgram.key'), '﻿llave-del-archivo\r\n')
  assert.equal(llaveDeepgram(app), 'llave-del-archivo')
  process.env.DEEPGRAM_API_KEY = 'llave-de-la-variable'
  assert.equal(llaveDeepgram(app), 'llave-de-la-variable')
})

test('dictado manda el audio a Deepgram y solo devuelve el texto; no deja ver lo que contesta Deepgram al fallar', async (t) => {
  sinVariable(t)
  const anterior = globalThis.fetch
  t.after(() => { globalThis.fetch = anterior })
  const app = mkdtempSync(join(tmpdir(), 'sloth-dictado-'))
  t.after(() => rmSync(app, { recursive: true, force: true }))
  async function llamar(tipo: string, audio = 'audio', metodo = 'POST') {
    const req = Readable.from([Buffer.from(audio)]) as IncomingMessage
    req.method = metodo
    req.headers = { 'content-type': tipo }
    let status = 0, datos = ''
    const res = { writeHead(s: number) { status = s }, end(s: string) { datos = s } } as unknown as ServerResponse
    await dictado(app, req, res)
    return { status, datos: JSON.parse(datos) }
  }
  assert.deepEqual(await llamar('', '', 'GET'), { status: 200, datos: { disponible: false } })
  assert.equal((await llamar('audio/webm')).status, 503)
  process.env.DEEPGRAM_API_KEY = 'clave-de-prueba'
  assert.deepEqual(await llamar('', '', 'GET'), { status: 200, datos: { disponible: true } })
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
  assert.ok(!JSON.stringify(fallo).includes('clave-de-prueba'))
  globalThis.fetch = async () => Response.json({ results: { channels: [] } })
  assert.equal((await llamar('audio/webm')).status, 422)
})
