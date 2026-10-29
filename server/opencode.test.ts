import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import { startOpenCode } from './opencode.ts'

/**
 * Como en T3 Code, el adaptador se prueba con lo que de verdad manda OpenCode: `opencode.grabacion.json` es un turno de
 * Big Pickle grabado de `opencode serve` 2.2.1 (crear un archivo con shell, leerlo y responder). El servidor es de
 * mentira: no baja OpenCode ni gasta nada.
 */
const GRABACION: { type: string; data: Record<string, any> }[] = JSON.parse(readFileSync(new URL('./opencode.grabacion.json', import.meta.url), 'utf8'))
const SESION = GRABACION[0].data.sessionID

function preparar(resume?: string, conCuenta = true) {
  const events: AgentEvent[] = []
  const pedidos: { metodo: string; input: any }[] = []
  const sesiones: string[] = []
  const salidas: unknown[] = []
  const oyentes = new Map<string, (e: any) => void>()
  const pedir = (metodo: string, respuesta: (input: any) => unknown = () => undefined) => async (input: any) => {
    pedidos.push({ metodo, input })
    return respuesta(input)
  }
  const client = {
    model: { list: pedir('model.list', () => ({ data: [{ providerID: 'opencode', id: 'big-pickle', limit: { context: 200000 } }] })) },
    session: {
      get: pedir('session.get', ({ sessionID }) => (sessionID === 'guardada' ? { id: 'guardada' } : Promise.reject(new Error('no existe')))),
      create: pedir('session.create', () => ({ id: SESION })),
      prompt: pedir('session.prompt'),
      interrupt: pedir('session.interrupt'),
      compact: pedir('session.compact'),
      instructions: { entry: { put: pedir('instructions.put') } },
      form: { cancel: pedir('form.cancel') }
    },
    mcp: { add: pedir('mcp.add'), remove: pedir('mcp.remove') },
    skill: { list: pedir('skill.list', () => ({ data: [{ id: 'video-explicativo' }] })) },
    permission: { reply: pedir('permission.reply') },
    credential: { list: pedir('credential.list', () => (conCuenta ? [{ id: 'cred-1', integrationID: 'opencode', label: 'yo@correo.com', active: true }] : [])) }
  }
  const servidor = { client, proc: {}, oyentes, raiz: new Map() } as any
  const run = startOpenCode(
    {
      cwd: process.cwd(), model: 'opencode:opencode/big-pickle', effort: 'high', hilo: 'hilo-1', resume,
      onEvent: (e) => events.push(e), onProviderSession: (id) => sesiones.push(id), onExit: (c) => salidas.push(c)
    },
    async () => servidor
  )
  const oir = (e: { type: string; data: Record<string, any> }) => oyentes.get(e.data.sessionID ?? e.data.form?.sessionID ?? SESION)?.(e)
  return { run, events, pedidos, sesiones, salidas, oir, oyentes }
}

test('un turno grabado de OpenCode se ve como uno de Claude: herramientas, texto, tokens y fin', async () => {
  const h = preparar()
  h.run.send('Crea hola.txt', undefined, [])
  await setImmediate()
  await setImmediate()
  for (const e of GRABACION) h.oir(e)
  const herramientas = h.events.filter((e) => e.t === 'tool')
  assert.deepEqual(herramientas.map((e) => e.t === 'tool' && e.name), ['Bash', 'Read'])
  assert.equal((herramientas[0] as any).input.command, 'echo "hola desde opencode" > hola.txt')
  assert.equal((herramientas[1] as any).input.file_path, 'hola.txt')
  const salidas = h.events.filter((e) => e.t === 'tool_update' && e.done)
  assert.match((salidas[1] as any).output, /hola desde opencode/)
  const texto = h.events.filter((e) => e.t === 'text').map((e) => (e as any).delta).join('')
  assert.equal(texto, 'listo.')
  const fin = h.events.at(-1) as Extract<AgentEvent, { t: 'turn_end' }>
  assert.equal(fin.t, 'turn_end')
  assert.equal(fin.ok, true)
  // La suma de los tres pasos; el razonamiento cuenta como salida.
  assert.deepEqual(fin.tokens, { input: 7567 + 121 + 191, output: 48 + 44 + 39 + 4, cacheRead: 2688 + 10240 + 10240 })
  assert.equal(fin.costUsd, 0)
  assert.ok(h.events.some((e) => e.t === 'context' && e.max === 200000))
  // `turn_start` del mensaje lo da sessions.ts, no el adaptador.
  assert.equal(h.events.filter((e) => e.t === 'turn_start').length, 0)
})

test('el razonamiento que acaba con el texto ya empezado no repite el texto ni se mezcla con él', async () => {
  const h = preparar()
  h.run.send('Hola', undefined, [])
  await setImmediate()
  await setImmediate()
  const m = { sessionID: SESION, assistantMessageID: 'm1', ordinal: 0 }
  // El orden en que lo mandó OpenCode en un hilo de video: el texto empieza antes de que acabe el razonamiento.
  h.oir({ type: 'session.reasoning.delta', data: { ...m, delta: 'Pienso.' } })
  h.oir({ type: 'session.text.delta', data: { ...m, delta: 'Hola, ' } })
  h.oir({ type: 'session.reasoning.ended', data: { ...m, text: 'Pienso.' } })
  h.oir({ type: 'session.text.delta', data: { ...m, delta: 'listo.' } })
  h.oir({ type: 'session.text.ended', data: { ...m, text: 'Hola, listo.' } })
  const texto = h.events.filter((e) => e.t === 'text')
  assert.equal(texto.map((e) => (e as any).delta).join(''), 'Hola, listo.')
  const pensamiento = h.events.filter((e) => e.t === 'thinking')
  assert.equal(pensamiento.map((e) => (e as any).delta).join(''), 'Pienso.')
  assert.notEqual((texto[0] as any).id, (pensamiento[0] as any).id)
})

test('crea la sesión en la carpeta del hilo con su modelo, sus reglas y su navegador solo para él', async () => {
  const h = preparar()
  h.run.send('Hola', { name: 'video-explicativo' }, [])
  await setImmediate()
  await setImmediate()
  await setImmediate()
  const crear = h.pedidos.find((p) => p.metodo === 'session.create')!.input
  assert.deepEqual(crear.model, { providerID: 'opencode', id: 'big-pickle', variant: 'high' })
  assert.equal(crear.location.directory, process.cwd())
  assert.equal(crear.title, 'Sloth')
  // La última regla manda: las preguntas interactivas no, los MCP de otros hilos no, los suyos sí.
  assert.deepEqual(crear.permissions.slice(-3), [
    { action: 'question', resource: '*', effect: 'deny' },
    { action: 'sloth-*', resource: '*', effect: 'deny' },
    { action: 'sloth-hilo-1-*', resource: '*', effect: 'allow' }
  ])
  for (const add of h.pedidos.filter((p) => p.metodo === 'mcp.add')) assert.match(add.input.server, /^sloth-hilo-1-/)
  assert.deepEqual(h.sesiones, [SESION])
  const prompt = h.pedidos.find((p) => p.metodo === 'session.prompt')!.input
  assert.deepEqual(prompt.skills, [{ id: 'video-explicativo' }])
  assert.match(prompt.text, /^Usa la skill video-explicativo de Sloth, la de /)
  assert.equal(prompt.delivery, 'queue')
})

test('retoma la sesión guardada sin crear otra', async () => {
  const h = preparar('guardada')
  h.run.send('Sigue', undefined, [])
  await setImmediate()
  await setImmediate()
  assert.equal(h.pedidos.some((p) => p.metodo === 'session.create'), false)
  assert.deepEqual(h.sesiones, ['guardada'])
})

test('las herramientas del MCP del hilo se nombran como en Claude', async () => {
  const h = preparar()
  h.run.send('Abre la página', undefined, [])
  await setImmediate()
  await setImmediate()
  const base = { sessionID: SESION, assistantMessageID: 'm1' }
  h.oir({ type: 'session.tool.input.started', data: { ...base, id: 't1', name: 'sloth-hilo-1-playwright_browser_navigate' } })
  h.oir({ type: 'session.tool.called', data: { ...base, id: 't1', input: { url: 'https://example.com' } } })
  const tool = h.events.find((e) => e.t === 'tool') as any
  assert.equal(tool.name, 'mcp__playwright__browser_navigate')
})

test('detenerlo acaba el turno con «lo detuviste», y si se cae OpenCode el turno queda cortado', async () => {
  const h = preparar()
  h.run.send('Corre sleep 40', undefined, [])
  await setImmediate()
  await setImmediate()
  h.oir({ type: 'session.execution.started', data: { sessionID: SESION } })
  await h.run.interrupt()
  assert.ok(h.pedidos.some((p) => p.metodo === 'session.interrupt'))
  h.oir({ type: 'session.execution.interrupted', data: { sessionID: SESION, reason: 'user' } })
  assert.deepEqual((h.events.at(-1) as any).error, 'lo detuviste')

  h.run.send('Otra vez', undefined, [])
  await setImmediate()
  h.oir({ type: 'sloth.caida', data: { sessionID: SESION } })
  const fin = h.events.at(-1) as any
  assert.equal(fin.t, 'background')
  const corte = h.events.findLast((e) => e.t === 'turn_end') as any
  assert.equal(corte.caida, true)
  assert.deepEqual(h.salidas.at(-1), { error: 'Se cerró OpenCode.', turno: true })
})

test('un formulario que la interfaz no sabe contestar se cancela, y el turno sigue', async () => {
  const h = preparar()
  h.run.send('Busca en la web', undefined, [])
  await setImmediate()
  await setImmediate()
  h.oir({ type: 'form.created', data: { form: { id: 'f1', sessionID: SESION, title: 'Elige un buscador', fields: [] } } })
  await setImmediate()
  const cancelar = h.pedidos.find((p) => p.metodo === 'form.cancel')
  assert.equal(cancelar?.input.formID, 'f1')
})

test('un 429 del modelo gratis se dice como saturado, no como un error raro', async () => {
  const h = preparar()
  h.run.send('Hola', undefined, [])
  await setImmediate()
  await setImmediate()
  h.oir({ type: 'session.execution.failed', data: { sessionID: SESION, error: { type: 'api', status: 429, message: 'Too Many Requests' } } })
  assert.match((h.events.at(-1) as any).error, /modelo gratis llegó a su límite/)
})

test('si se acabó el uso gratis, lo dice así y no como un modelo saturado', async () => {
  const h = preparar()
  h.run.send('Hola', undefined, [])
  await setImmediate()
  await setImmediate()
  h.oir({ type: 'session.execution.failed', data: { sessionID: SESION, error: { type: 'api', status: 429, message: 'Free usage limit reached. Free models work in OpenCode (https://opencode.ai); subscribe to OpenCode Go to keep going: https://opencode.ai/go' } } })
  assert.match((h.events.at(-1) as any).error, /Se acabó tu uso gratis de OpenCode/)
})

test('sin cuenta de OpenCode no se manda nada: el turno acaba pidiendo conectarla', async () => {
  const h = preparar(undefined, false)
  h.run.send('Hola', undefined, [])
  for (let i = 0; i < 5; i++) await setImmediate()
  assert.equal(h.pedidos.some((p) => p.metodo === 'session.prompt'), false)
  const fin = h.events.at(-1) as Extract<AgentEvent, { t: 'turn_end' }>
  assert.equal(fin.t, 'turn_end')
  assert.match(fin.error ?? '', /^Conecta tu cuenta de OpenCode/)
})
