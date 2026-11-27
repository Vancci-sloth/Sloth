import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { nombreVc, sinSocio, voicesCloning } from './voz/voices-cloning.ts'

test('una voz clonada con la que no se puede hablar no entra al menú, ni a tu catálogo, y pide otra grabación', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-vc-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  // clone_1 es la grabación que no sirve (502 siempre); clone_2, una buena.
  let clonadas = 0
  const probadas: string[] = []
  const fetchDeVerdad = globalThis.fetch
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url))
    const responde = (datos: unknown, status = 200) => new Response(JSON.stringify(datos), { status })
    if (u.pathname === '/voz/sesion') return responde({ token: 'et_x', expires_at: new Date(Date.now() + 3600_000).toISOString() })
    if (u.pathname === '/voz') return responde({ disponible: true, creador: false, creditos: 1000 })
    if (u.pathname === '/api/v1/voices/clone') return responde({ voice_id: `clone_${++clonadas}`, name: 'Mi voz' })
    if (u.pathname === '/voz/tts') {
      const { voice_id } = JSON.parse(String(init?.body)) as { voice_id: string }
      probadas.push(voice_id)
      return voice_id === 'clone_1' ? responde({}, 502) : responde({ audio_url: 'https://www.voicescloning.art/api/media/x.mp3', credits_remaining: 970 })
    }
    if (u.pathname === '/api/v1/voices') return responde({ voices: [{ voice_id: 'clone_1', name: 'Mi voz' }, { voice_id: 'clone_2', name: 'Mi voz' }], total: 2 })
    return responde({ error: 'No existe' }, 404)
  }) as typeof fetch
  t.after(() => void (globalThis.fetch = fetchDeVerdad))
  const vc = voicesCloning(carpeta, { credencial: () => ({ clave: 'CLAVE', equipo: 'equipo' }), creador: () => undefined })

  async function pedir(ruta: string, cuerpo?: Buffer) {
    let status = 0
    let texto = ''
    const res = { writeHead: (s: number) => void (status = s), end: (c: string) => void (texto = c) } as unknown as ServerResponse
    const req = Object.assign(Readable.from(cuerpo ? [cuerpo] : []), { method: cuerpo ? 'POST' : 'GET', url: ruta, headers: { 'content-type': 'audio/webm' } }) as unknown as IncomingMessage
    await vc.api(req, res, new URL(ruta, 'http://localhost').pathname, () => vc.estado())
    return { status, datos: JSON.parse(texto) as { error?: string; voces?: { id: string }[]; total?: number } }
  }
  const grabacion = Buffer.alloc(5000, 1)

  const rota = await pedir('/api/voz/vc/clonar?nombre=Mi%20voz&archivo=voz.webm', grabacion)
  assert.equal(rota.status, 422)
  assert.match(rota.datos.error ?? '', /no pueden hablar con esa grabación/)
  assert.deepEqual(probadas, ['clone_1', 'clone_1'], 'un 502 se prueba dos veces antes de darla por rota')
  assert.deepEqual(vc.estado().voces, [])

  const buena = await pedir('/api/voz/vc/clonar?nombre=Mi%20voz&archivo=voz.webm', grabacion)
  assert.equal(buena.status, 200)
  assert.deepEqual(vc.estado().voces.map((v) => v.id), ['clone_2'])

  const catalogo = await pedir('/api/voz/vc/catalogo?proveedor=clone')
  assert.deepEqual(catalogo.datos.voces?.map((v) => v.id), ['clone_2'])
  assert.equal(catalogo.datos.total, 1)
  // Se recuerda al volver a abrir Sloth.
  assert.deepEqual(JSON.parse(readFileSync(join(carpeta, 'voices-cloning.json'), 'utf8')).rotas, ['clone_1'])
})

test('las voces de Edge en Voices Cloning se nombran como persona y país, no con su nombre técnico', () => {
  assert.equal(nombreVc('es-AR-ElenaNeural'), 'Elena (Argentina)')
  assert.equal(nombreVc('es-MX-DaliaNeural'), 'Dalia (México)')
  assert.equal(nombreVc('es-ES-XimenaMultilingualNeural'), 'Ximena (España)')
  // Las demás, tal cual.
  assert.equal(nombreVc('Elias - Spanish, Natural, Storyteller'), 'Elias - Spanish, Natural, Storyteller')
})

test('los errores del cobro le llegan al cliente como de las voces de Sloth', () => {
  assert.equal(sinSocio('Se te acabaron los créditos de voz de Voices Cloning. Pídele más al creador de Sloth o usa otra voz.'), 'Se te acabaron los créditos de voz de Sloth. Pídele más al creador de Sloth o usa otra voz.')
  assert.equal(sinSocio('Voices Cloning tiene mucha demanda ahora.'), 'Las voces de Sloth tiene mucha demanda ahora.')
  assert.equal(sinSocio('Se llegó al tope del día de las voces de Voices Cloning en Sloth.'), 'Se llegó al tope del día de las voces de Sloth.')
  assert.equal(sinSocio('Tu usuario de voces de Voices Cloning está suspendido.'), 'Tu usuario de las voces de Sloth está suspendido.')
  assert.equal(sinSocio('Sin créditos.'), 'Sin créditos.')
})
