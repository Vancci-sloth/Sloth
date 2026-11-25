import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dictado } from './dictado.ts'

const cuenta = { clave: 'SLOTH-AAAA-BBBB-CCCC-DDDD', equipo: '0123456789abcdef0123456789abcdef' }

test('GET /api/dictado pregunta al cobro con tu cuenta; sin cuenta, sin apoyo o sin red, el botón no sale', async (t) => {
  const anterior = globalThis.fetch
  t.after(() => { globalThis.fetch = anterior })
  async function llamar(credencial: () => typeof cuenta | undefined, metodo = 'GET') {
    let status = 0, datos = ''
    const res = { writeHead(s: number) { status = s }, end(s: string) { datos = s } } as unknown as ServerResponse
    await dictado(credencial, { method: metodo, headers: {} } as IncomingMessage, res)
    return { status, datos: JSON.parse(datos) }
  }
  assert.deepEqual(await llamar(() => undefined), { status: 200, datos: { disponible: false } })
  const pedidos: { url: string; headers: Record<string, string> }[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url, headers: init?.headers as Record<string, string> })
    return Response.json({ disponible: true, minutos: 29 })
  }) as typeof fetch
  assert.deepEqual(await llamar(() => cuenta), { status: 200, datos: { disponible: true, minutos: 29 } })
  assert.match(pedidos[0].url, /\/dictado$/)
  assert.equal(pedidos[0].headers['x-sloth-clave'], cuenta.clave)
  globalThis.fetch = (async () => Response.json({ disponible: false })) as typeof fetch
  assert.deepEqual(await llamar(() => cuenta), { status: 200, datos: { disponible: false } })
  globalThis.fetch = (async () => { throw new Error('sin red') }) as typeof fetch
  assert.deepEqual(await llamar(() => cuenta), { status: 200, datos: { disponible: false } })
  assert.equal((await llamar(() => cuenta, 'POST')).status, 405)
})
