import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import { startCodex } from './codex.ts'
import { buildTimeline } from '../web/src/items.ts'

/** Prueba el protocolo y las carreras entre turnos, sin gastar el plan ni tocar las credenciales del usuario. */
function preparar(resume?: string) {
  const events: AgentEvent[] = []
  const pedidos: { method: string; params: Record<string, unknown> }[] = []
  const sesiones: string[] = []
  let notify!: (method: string, params: unknown) => void
  let exit!: (error?: Error) => void
  let turno = 0
  let fallo: string | undefined
  const run = startCodex({
    cwd: process.cwd(), model: 'codex:gpt-prueba', effort: 'high', resume,
    onEvent: (e) => events.push(e), onProviderSession: (id) => sesiones.push(id)
  }, (n, e) => {
    notify = n
    exit = e
    return {
      ready: Promise.resolve(),
      async request<T>(method: string, params: unknown = {}): Promise<T> {
        const p = params as Record<string, unknown>
        pedidos.push({ method, params: p })
        if (fallo === method) throw new Error('Falló la petición')
        let result: unknown = {}
        if (method === 'account/read') result = { account: { type: 'chatgpt' } }
        if (method === 'thread/start' || method === 'thread/resume') result = { thread: { id: 'hilo' } }
        if (method === 'turn/start') {
          const turn = { id: `turno-${++turno}`, status: 'inProgress' }
          notify('turn/started', { threadId: 'hilo', turn })
          result = { turn }
        }
        if (method === 'turn/interrupt') notify('turn/completed', { threadId: 'hilo', turn: { id: `turno-${turno}`, status: 'interrupted' } })
        return result as T
      },
      close() { exit() }
    }
  })
  return { run, events, pedidos, sesiones, notify: (method: string, params: unknown) => notify(method, params), caer: () => exit(new Error('Se cayó Codex')), fallar: (method: string) => { fallo = method } }
}

test('retoma el id de Codex y envía modelo, esfuerzo e imágenes al proveedor correcto', async () => {
  const h = preparar('guardado')
  h.run.send('Mira esta imagen', undefined, ['C:/imagen.png'])
  await setImmediate()
  const resume = h.pedidos.find((p) => p.method === 'thread/resume')!
  assert.equal(resume.params.threadId, 'guardado')
  assert.equal(resume.params.model, 'gpt-prueba')
  assert.equal(resume.params.modelProvider, 'openai')
  assert.deepEqual(h.sesiones, ['hilo'])
  const turn = h.pedidos.find((p) => p.method === 'turn/start')!
  assert.equal(turn.params.effort, 'high')
  assert.deepEqual((turn.params.input as unknown[])[0], { type: 'localImage', path: 'C:/imagen.png' })
  h.run.close()
})

test('texto por trozos y mensaje completo no duplican la respuesta; cada turno tiene ids propios', async () => {
  const h = preparar()
  h.run.send('Hola')
  await setImmediate()
  h.notify('item/agentMessage/delta', { threadId: 'hilo', turnId: 'turno-1', itemId: 'a', delta: 'Ho' })
  h.notify('item/completed', { threadId: 'hilo', item: { id: 'a', type: 'agentMessage', text: 'Hola' } })
  h.notify('turn/completed', { threadId: 'hilo', turn: { id: 'turno-1', status: 'completed' } })
  assert.equal(h.events.filter((e) => e.t === 'text').map((e) => e.delta).join(''), 'Hola')
  h.run.send('Otra')
  await setImmediate()
  h.notify('item/completed', { threadId: 'hilo', item: { id: 'a', type: 'agentMessage', text: 'Segunda' } })
  const textos = h.events.filter((e) => e.t === 'text')
  assert.notEqual(textos[0].id, textos.at(-1)!.id)
  h.run.close()
})

test('un mensaje en curso usa steer; si el turno acabó abre otro y avisa a Sloth', async () => {
  const h = preparar()
  h.run.send('Primero')
  h.run.steer('Cambio durante el arranque')
  await setImmediate()
  assert.equal(h.pedidos.filter((p) => p.method === 'turn/start').length, 1)
  const steer = h.pedidos.find((p) => p.method === 'turn/steer')!
  assert.equal(steer.params.expectedTurnId, 'turno-1')
  h.notify('turn/completed', { threadId: 'hilo', turn: { id: 'turno-1', status: 'completed' } })
  h.run.steer('Mensaje que llegó al terminar')
  await setImmediate()
  assert.equal(h.pedidos.filter((p) => p.method === 'turn/start').length, 2)
  assert.equal(h.events.filter((e) => e.t === 'turn_start').length, 1)
  h.run.close()
})

test('Detener termina una sola vez y los errores de la API cierran el turno', async () => {
  const h = preparar()
  h.run.send('Trabaja')
  await setImmediate()
  await h.run.interrupt()
  assert.deepEqual(h.events.filter((e) => e.t === 'turn_end').map((e) => [e.ok, e.error]), [[false, 'lo detuviste']])
  h.fallar('turn/start')
  h.run.send('Otra')
  await setImmediate()
  assert.equal(h.events.filter((e) => e.t === 'turn_end').at(-1)!.error, 'Falló la petición')
  h.run.close()
})

test('rechazar un mensaje durante el turno no marca como detenido al agente que sigue vivo', async () => {
  const h = preparar()
  h.run.send('Trabaja')
  await setImmediate()
  h.fallar('turn/steer')
  h.run.steer('Un cambio')
  await setImmediate()
  assert.equal(h.events.filter((e) => e.t === 'turn_end').length, 0)
  assert.ok(h.events.some((e) => e.t === 'info' && e.text.includes('sigue trabajando')))
  h.notify('turn/completed', { threadId: 'hilo', turn: { id: 'turno-1', status: 'completed' } })
  assert.equal(h.events.filter((e) => e.t === 'turn_end')[0].ok, true)
  h.run.close()
})

test('la salida de comandos se acumula y el uso de tokens cuenta solo el turno', async () => {
  const h = preparar()
  const uso = (inputTokens: number, outputTokens: number, cachedInputTokens: number) => ({ inputTokens, outputTokens, cachedInputTokens, totalTokens: inputTokens + outputTokens })
  const medir = (total: ReturnType<typeof uso>) => h.notify('thread/tokenUsage/updated', { threadId: 'hilo', tokenUsage: { total, last: total, modelContextWindow: 1000 } })
  h.run.send('Prueba')
  await setImmediate()
  h.notify('item/started', { threadId: 'hilo', item: { id: 'c', type: 'commandExecution', command: 'dir' } })
  h.notify('item/commandExecution/outputDelta', { threadId: 'hilo', itemId: 'c', delta: 'uno\n' })
  h.notify('item/commandExecution/outputDelta', { threadId: 'hilo', itemId: 'c', delta: 'dos\n' })
  const salida = buildTimeline(h.events).find((i) => i.kind === 'tool')
  assert.equal(salida?.kind === 'tool' && salida.output, 'uno\ndos\n')
  assert.deepEqual(h.events.filter((e) => e.t === 'tool_update').map((e) => e.delta), ['uno\n', 'dos\n'])
  h.notify('item/completed', { threadId: 'hilo', item: { id: 'c', type: 'commandExecution' } })
  assert.equal(h.events.filter((e) => e.t === 'tool_update').at(-1)!.output, 'uno\ndos\n')
  medir(uso(100, 20, 40))
  h.notify('turn/completed', { threadId: 'hilo', turn: { id: 'turno-1', status: 'completed' } })
  h.run.send('Más')
  await setImmediate()
  medir(uso(150, 30, 50))
  h.notify('turn/completed', { threadId: 'hilo', turn: { id: 'turno-2', status: 'completed' } })
  assert.deepEqual(h.events.filter((e) => e.t === 'turn_end').at(-1)!.tokens, { input: 40, output: 10, cacheRead: 10 })
  h.run.close()
})

test('una caída no deja el hilo trabajando ni cierra dos veces el turno', async () => {
  const h = preparar()
  h.run.send('Prueba')
  await setImmediate()
  h.caer()
  h.caer()
  assert.equal(h.events.filter((e) => e.t === 'turn_end').length, 1)
  assert.equal(h.events.filter((e) => e.t === 'turn_end')[0].caida, true)
})

test('compactar usa el comando nativo, espera su fin y muestra el contexto medido por Codex', async () => {
  const h = preparar('guardado')
  h.run.compact!()
  await setImmediate()
  assert.deepEqual(h.pedidos.find((p) => p.method === 'thread/compact/start')?.params, { threadId: 'hilo' })
  assert.equal(h.pedidos.some((p) => p.method === 'turn/start' || p.method === 'turn/steer'), false)
  assert.equal(h.events.some((e) => e.t === 'turn_end'), false)
  h.notify('turn/started', { threadId: 'hilo', turn: { id: 'compactar-1', status: 'inProgress' } })
  h.notify('item/completed', { threadId: 'hilo', item: { id: 'c', type: 'contextCompaction' } })
  const uso = { inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, totalTokens: 110 }
  h.notify('thread/tokenUsage/updated', { threadId: 'hilo', tokenUsage: { total: uso, last: uso, modelContextWindow: 1000 } })
  h.notify('turn/completed', { threadId: 'hilo', turn: { id: 'compactar-1', status: 'completed' } })
  assert.deepEqual(h.events.find((e) => e.t === 'context'), { t: 'context', used: 110, max: 1000 })
  assert.equal(h.events.filter((e) => e.t === 'turn_end').length, 1)
  assert.equal(h.events.find((e) => e.t === 'turn_end')!.ok, true)
  h.run.send('Seguimos')
  await setImmediate()
  assert.equal(h.pedidos.filter((p) => p.method === 'turn/start').length, 1)
  h.run.close()
})

test('un fallo al compactar cierra la operación sin afirmar que se compactó', async () => {
  const h = preparar('guardado')
  h.fallar('thread/compact/start')
  h.run.compact!()
  await setImmediate()
  assert.equal(h.events.find((e) => e.t === 'turn_end')!.ok, false)
  assert.equal(h.events.some((e) => e.t === 'info' && e.text.includes('compactó')), false)
  h.run.close()
})

test('la fila de los subagentes sabe cuándo empezaron y cómo acabó el último que lanzó su herramienta', async () => {
  const h = preparar()
  h.run.send('Prueba')
  await setImmediate()
  const lanza = { id: 'a', type: 'collabAgentToolCall', tool: 'spawnAgent', prompt: 'Revisar material', agentsStates: { uno: { status: 'running' }, dos: { status: 'pendingInit' } } }
  h.notify('item/started', { threadId: 'hilo', item: lanza })
  h.notify('item/completed', { threadId: 'hilo', item: lanza })
  const avisos = () => h.events.filter((e) => e.t === 'subagent').map((e) => [e.id, e.status])
  assert.deepEqual(avisos(), [['turno-1:a', 'running']])
  h.notify('turn/completed', { threadId: 'uno', turn: { id: 'uno-1', status: 'completed' } })
  assert.equal(avisos().length, 1)
  h.notify('item/completed', { threadId: 'hilo', item: { id: 'w', type: 'collabAgentToolCall', tool: 'wait', agentsStates: { dos: { status: 'shutdown' } } } })
  assert.deepEqual(avisos(), [['turno-1:a', 'running'], ['turno-1:a', 'stopped']])
  // La espera no es otro subagente: su herramienta se ve como siempre.
  const items = buildTimeline(h.events)
  assert.deepEqual(items.flatMap((i) => (i.kind === 'tool' ? [[i.id, i.subagente?.estado]] : [])), [['turno-1:a', 'stopped'], ['turno-1:w', undefined]])
  h.run.close()
})

test('un subagente mantiene ocupado el hilo hasta terminar, y Detener limpia el segundo plano', async () => {
  const h = preparar()
  h.run.send('Prueba')
  await setImmediate()
  h.notify('item/completed', { threadId: 'hilo', item: { id: 'a', type: 'collabAgentToolCall', prompt: 'Revisar material', agentsStates: { hijo: { status: 'running' } } } })
  h.notify('turn/completed', { threadId: 'hilo', turn: { id: 'turno-1', status: 'completed' } })
  assert.deepEqual(h.events.filter((e) => e.t === 'background').at(-1)!.tasks, ['Revisar material'])
  h.notify('turn/completed', { threadId: 'hijo', turn: { id: 'hijo-1', status: 'completed' } })
  assert.deepEqual(h.events.filter((e) => e.t === 'background').at(-1)!.tasks, [])
  h.notify('item/completed', { threadId: 'hilo', item: { id: 'b', type: 'collabAgentToolCall', agentsStates: { otro: { status: 'running' } } } })
  await h.run.interrupt()
  assert.deepEqual(h.events.filter((e) => e.t === 'background').at(-1)!.tasks, [])
})
