import assert from 'node:assert/strict'
import { test } from 'node:test'
import { motorDe } from '../shared/voz.ts'
import { hablarVibi, vocesVibi } from './voz/vibi.ts'

test('Vibi conserva IDs largos y distingue voces con el mismo ID en motores distintos', async () => {
  const id = '7036989371643923969'
  const voces = await vocesVibi(async (ruta) => ruta.includes('default-voices')
    ? Response.json({ voices: [{ voice_id: id, name: 'Aria' }] })
    : Response.json({ voice_list: [{ voice_id: id, voice_name: 'Narrador' }] }))
  assert.deepEqual(voces.map((v) => v.id), ['elevenlabs:', 'minimax:', 'capcut:'].map((motor) => motor + id))
  assert.deepEqual(motorDe(`vibi:${voces[2].id}`), { motor: 'vibi', id: `capcut:${id}` })
})

test('Vibi envía el motor y el idioma correctos y consulta la tarea que acaba de crear', async () => {
  const pedidos: unknown[] = []
  await assert.rejects(hablarVibi(async (ruta, datos) => {
    pedidos.push([ruta, datos?.json])
    return Response.json(datos ? { id: 'tarea-1' } : { status: 'failed' })
  }, 'minimax:123', 'Hola'), /no pudo generar/)
  assert.deepEqual(pedidos, [
    ['/v1/text-to-speech/123', { text: 'Hola', provider: 'minimax', language_code: 'Spanish' }],
    ['/v1/history/tarea-1', undefined]
  ])
})
