import assert from 'node:assert/strict'
import test from 'node:test'
import { errorRedactorYoutube, redactarCodexYoutube } from './youtube-redactor.ts'
import { PLAN_YOUTUBE } from './youtube-esquemas.ts'

test('el rechazo real por límite semanal se explica sin pedir reconectar ni exponer texto del proveedor', () => {
  const e = errorRedactorYoutube('Claude', 'success', "You've hit your weekly limit · resets Oct 14, 11pm (America/Mexico_City)")
  assert.match(e.message, /Claude.*límite semanal/)
  assert.doesNotMatch(e.message, /conexión|Oct 14|weekly/)
})

test('la petición visual exige el esquema y devuelve la respuesta del turno correcto', async () => {
  let peticion: Record<string, unknown> | undefined
  let cerrado = false
  const salida = await redactarCodexYoutube('codex:prueba', 'C:/dev', 'Analiza la imagen', ['C:/fotograma.jpg'], PLAN_YOUTUBE, (avisar, _salir, config) => {
    assert.equal(config.web_search, 'disabled')
    return { ready: Promise.resolve(), close() { cerrado = true }, async request<T>(method: string, params?: unknown): Promise<T> {
      if (method === 'account/read') return { account: { type: 'chatgpt' } } as T
      if (method === 'thread/start') return { thread: { id: 'hilo' } } as T
      peticion = params as Record<string, unknown>
      queueMicrotask(() => {
        avisar('item/completed', { threadId: 'otro', item: { type: 'agentMessage', text: 'ignorado' } })
        avisar('item/completed', { threadId: 'hilo', item: { type: 'agentMessage', text: '{"tema":"Editor","consultas":["Claude"],"hechos":[]}' } })
        avisar('turn/completed', { threadId: 'hilo', turn: { status: 'completed' } })
      })
      return {} as T
    } }
  }, 'low')
  assert.equal(JSON.parse(salida).tema, 'Editor')
  assert.deepEqual(peticion!.outputSchema, PLAN_YOUTUBE)
  assert.equal(peticion!.effort, 'low')
  assert.deepEqual((peticion!.input as unknown[])[1], { type: 'localImage', path: 'C:/fotograma.jpg' })
  assert.equal(cerrado, true)
})

test('la recomendación interrumpe cualquier intento de usar herramientas', async () => {
  let cerrado = false
  await assert.rejects(redactarCodexYoutube('codex:prueba', 'C:/dev', 'Analiza', [], PLAN_YOUTUBE, (avisar) => ({ ready: Promise.resolve(), close() { cerrado = true }, async request<T>(method: string): Promise<T> {
    if (method === 'account/read') return { account: { type: 'chatgpt' } } as T
    if (method === 'thread/start') return { thread: { id: 'hilo' } } as T
    queueMicrotask(() => avisar('item/started', { threadId: 'hilo', item: { type: 'commandExecution' } }))
    return {} as T
  } })), /herramienta/)
  assert.equal(cerrado, true)
})
