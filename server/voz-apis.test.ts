import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { segundosWav, wavDePcm } from '../shared/voz.ts'
import { msgpack, vozPorApi } from './voz/apis.ts'

/** Fish Audio y ElevenLabs de mentira: lo que se les pide y lo que contestan, sin salir a internet. */
function conApis(t: { after(f: () => void): void }) {
  const pedidos: { url: string; cabeceras: Record<string, string>; cuerpo?: unknown }[] = []
  const original = globalThis.fetch
  const llaves = { fish: process.env.FISH_API_KEY, eleven: process.env.ELEVENLABS_API_KEY }
  process.env.FISH_API_KEY = 'llave-fish'
  process.env.ELEVENLABS_API_KEY = 'llave-eleven'
  let saturado = 1
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const cabeceras = init.headers as Record<string, string>
    pedidos.push({ url, cabeceras, cuerpo: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    if (url.includes('/model?self=true')) return Response.json({ items: [{ _id: 'mia', title: 'Mi voz', tags: ['es'] }] })
    // Sin saldo de API, Fish no deja crear voces (como contesta de verdad, visto el 6-nov-2026).
    if (url.endsWith('/model')) return Response.json({ message: 'API model creation limit reached (0/0). Top up API credit to raise the limit.' }, { status: 402 })
    if (url.includes('/model?language=es')) return Response.json({ items: [{ _id: 'mia', title: 'Mi voz' }, { _id: 'pub', title: 'Narrador', tags: ['narration', 'male'] }] })
    if (url.endsWith('/v1/tts')) {
      // La primera vez está saturado: se repite sola.
      if (saturado-- > 0) return new Response('{}', { status: 429 })
      return new Response(wavDePcm([new Uint8Array(44100 * 2)], 44100))
    }
    if (url.includes('/v2/voices')) return Response.json({ voices: [{ voice_id: 'rachel', name: 'Rachel', category: 'premade', labels: { accent: 'american', gender: 'female' } }] })
    if (url.includes('/v1/text-to-speech/rachel')) return new Response(new Uint8Array(24000))
    if (url.includes('/v1/text-to-speech/')) return Response.json({ detail: { status: 'quota_exceeded', message: 'You have 0 credits left.' } }, { status: 401 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const carpeta = mkdtempSync(join(tmpdir(), 'voz-apis-'))
  t.after(() => {
    globalThis.fetch = original
    process.env.FISH_API_KEY = llaves.fish ?? ''
    process.env.ELEVENLABS_API_KEY = llaves.eleven ?? ''
    if (!llaves.fish) delete process.env.FISH_API_KEY
    if (!llaves.eleven) delete process.env.ELEVENLABS_API_KEY
    rmSync(carpeta, { recursive: true, force: true })
  })
  return { pedidos, apis: vozPorApi(carpeta) }
}

test('Fish Audio: lee tus voces y las de español, y genera con el modelo gratis, por trozos', async (t) => {
  const { pedidos, apis } = conApis(t)
  await apis.actualizar('fish')
  assert.deepEqual(
    apis.estado().fish.voces.map((v) => [v.id, v.propia]),
    [
      ['mia', true],
      ['pub', false]
    ]
  )
  assert.equal(apis.nombre('fish:mia'), 'Mi voz')
  const { wav, segundos } = await apis.generar('fish:mia', `${'Uno. '.repeat(400)}\n\n${'Dos. '.repeat(400)}`)
  const tts = pedidos.filter((p) => p.url.endsWith('/v1/tts'))
  assert.equal(tts.length, 3) // el saturado y los dos trozos
  assert.equal(tts[0].cabeceras.model, 's2.1-pro-free')
  assert.equal(tts[0].cabeceras.authorization, 'Bearer llave-fish')
  assert.equal((tts[1].cuerpo as { reference_id: string }).reference_id, 'mia')
  // Dos trozos de 1 s a 44,1 kHz con su respiro de 0,3 s.
  assert.equal(segundos, 2.3)
  assert.equal(segundosWav(wav), 2.3)
})

test('ElevenLabs: genera en PCM de 24 kHz y, sin créditos, lo dice para el agente', async (t) => {
  const { pedidos, apis } = conApis(t)
  const { segundos } = await apis.generar('elevenlabs:rachel', 'Hola.')
  const pedido = pedidos.find((p) => p.url.includes('/v1/text-to-speech/rachel'))!
  assert.match(pedido.url, /output_format=pcm_24000/)
  assert.equal(pedido.cabeceras['xi-api-key'], 'llave-eleven')
  assert.equal((pedido.cuerpo as { model_id: string }).model_id, 'eleven_v3')
  assert.equal(segundos, 0.5)
  await assert.rejects(apis.generar('elevenlabs:otra', 'Hola.'), /ElevenLabs se quedó sin créditos este mes, o tu plan no deja hacer esto: You have 0 credits left/)
})

test('msgpack, lo justo para mandarle a Fish Audio tu grabación de referencia', () => {
  assert.deepEqual([...msgpack({ a: 'b' })], [0x81, 0xa1, 0x61, 0xa1, 0x62])
  assert.deepEqual([...msgpack([true, false])], [0x92, 0xc3, 0xc2])
  // Un texto de 40 letras ya no cabe en el corto: va con su largo en un byte.
  assert.deepEqual([...msgpack('x'.repeat(40)).subarray(0, 2)], [0xd9, 40])
  assert.deepEqual([...msgpack('ñ')], [0xa2, 0xc3, 0xb1])
  // Los bytes de una grabación: de 8, 16 o 32 bits según cuánto pesen.
  assert.deepEqual([...msgpack(Uint8Array.of(1, 2))], [0xc4, 2, 1, 2])
  assert.deepEqual([...msgpack(new Uint8Array(300)).subarray(0, 3)], [0xc5, 1, 44])
  assert.deepEqual([...msgpack(new Uint8Array(70_000)).subarray(0, 5)], [0xc6, 0, 1, 0x11, 0x70])
  // Lo que no se pone (undefined) no viaja.
  assert.deepEqual([...msgpack({ a: undefined, b: true })], [0x81, 0xa1, 0x62, 0xc3])
  // Lo que no sabe mandar, lo dice (antes un número salía como un mapa vacío).
  assert.throws(() => msgpack({ n: 3 }), /no sé mandar number/)
  assert.throws(() => msgpack(null), /no sé mandar null/)
})

test('Fish Audio sin saldo para crear voces: tu grabación se queda aquí y va de referencia en cada pedido', async (t) => {
  const { pedidos, apis } = conApis(t)
  await apis.actualizar('fish')
  const id = await apis.clonar('fish', 'Yo', Uint8Array.of(1, 2, 3), 'audio/webm', 'yo.webm')
  assert.match(id, /^tuya-/)
  assert.deepEqual(apis.estado().fish.voces[0], { id, nombre: 'Yo', descripcion: 'Tu voz, guardada en esta computadora', propia: true })
  await apis.generar(`fish:${id}`, 'Hola.')
  const ultimo = pedidos.filter((p) => p.url.endsWith('/v1/tts')).at(-1)!
  assert.equal(ultimo.cabeceras['content-type'], 'application/msgpack')
  // Quitarla borra su grabación: ya no se puede generar con ella.
  apis.quitarTuya('fish', id)
  assert.ok(!apis.estado().fish.voces.some((v) => v.id === id))
  await assert.rejects(apis.generar(`fish:${id}`, 'Hola.'), /Ya no está la grabación/)
  assert.throws(() => apis.quitarTuya('fish', 'mia'), /Solo se quitan desde aquí/)
})
