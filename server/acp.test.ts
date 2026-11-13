import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import { startAcp, type SaborAcp } from './acp.ts'
import { elegirCuenta, errorAntigravity, grupoDe, renuevaEn } from './antigravity.ts'
import { errorGemini } from './gemini.ts'

/**
 * El cliente ACP (Grok, Antigravity, Gemini) contra un agente de mentira que contesta como Grok 1.0.70 (el `initialize`, las
 * opciones de la sesión y el uso de `_meta.usage`, vistos en vivo y en las grabaciones de T3 Code). Sin red ni cuenta.
 */
const AGENTE = `
let resto = ''
const decir = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n')
const pedidos = []
let turno
process.stdin.on('data', (d) => {
  resto += d
  let i
  while ((i = resto.indexOf('\\n')) >= 0) {
    const m = JSON.parse(resto.slice(0, i))
    resto = resto.slice(i + 1)
    // La respuesta de Sloth al permiso: con ella acaba el turno.
    if (m.id === 900 && !m.method) {
      pedidos.push('permiso ' + m.result.outcome.optionId)
      const u = (update) => decir({ method: 'session/update', params: { sessionId: 's1', update } })
      u({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'hola' } }] })
      u({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' listo: ' + pedidos.join(',') } })
      decir({ id: turno, result: { stopReason: 'end_turn', _meta: { usage: { inputTokens: 1000, cachedReadTokens: 600, cacheCreationTokens: 100, outputTokens: 50, costUsdTicks: 25000000 } } } })
      // Acaba una tarea de fondo y Grok se despierta solo.
      if (process.env.DE_FONDO) setTimeout(() => {
        u({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ya acabó' } })
        if (process.env.DE_FONDO !== 'mudo') decir({ method: '_x.ai/session_notification', params: { sessionId: 's1', update: { sessionUpdate: 'turn_completed', prompt_id: 'task-completed-1', stop_reason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5, costUsdTicks: 10000000 } } } })
      }, 30)
      continue
    }
    pedidos.push(m.method)
    if (m.method === 'initialize') decir({ id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [{ id: 'grok.com' }] } })
    if (m.method === 'session/new') {
      if (process.env.SIN_CUENTA) decir({ id: m.id, error: { code: -32000, message: 'Authentication required' } })
      else decir({ id: m.id, result: { sessionId: 's1', models: { availableModels: [{ modelId: 'grok-4.6', _meta: { totalContextTokens: 500000 } }] }, configOptions: [
        { id: 'model', category: 'model', type: 'select', currentValue: 'grok-4.5', options: [{ value: 'grok-4.6' }, { value: 'grok-4.5' }] },
        { id: 'reasoning_effort', category: 'thought_level', type: 'select', currentValue: 'high', options: [{ value: 'high' }, { value: 'low' }] }
      ] } })
    }
    if (m.method === 'session/set_config_option') decir({ id: m.id, result: {} })
    if (m.method === 'session/prompt') {
      turno = m.id
      const texto = m.params.prompt[0].text
      const u = (update) => decir({ method: 'session/update', params: { sessionId: 's1', update } })
      u({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'pienso' } })
      u({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: texto.includes('<sloth>') ? 'con instrucciones' : 'sin instrucciones' } })
      u({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Run echo', kind: 'execute', status: 'pending', rawInput: { command: 'echo hola' } })
      decir({ id: 900, method: 'session/request_permission', params: { sessionId: 's1', options: [{ optionId: 'always-allow', kind: 'allow_always' }, { optionId: 'allow-once', kind: 'allow_once' }] } })
    }
  }
})
`

const SCRIPT = join(mkdtempSync(join(tmpdir(), 'sloth-acp-')), 'agente.mjs')
writeFileSync(SCRIPT, AGENTE)

function correr(env: Record<string, string> = {}) {
  const events: AgentEvent[] = []
  const sesiones: string[] = []
  const sabor: SaborAcp = {
    nombre: 'Grok',
    prefijo: 'grok',
    lanzar: () => ({ command: process.execPath, args: [SCRIPT], env: { ...process.env, ...env } }),
    sinCuenta: 'Conecta tu cuenta de Grok en Opciones.',
    silencio: 150
  }
  let fin!: () => void
  const listo = new Promise<void>((ok) => (fin = ok))
  const run = startAcp(sabor, {
    cwd: tmpdir(),
    model: 'grok:grok-4.6',
    effort: 'low',
    onEvent(e) {
      events.push(e)
      if (e.t === 'turn_end') fin()
    },
    onProviderSession: (id) => sesiones.push(id)
  })
  return { run, events, listo, sesiones }
}

test('ACP: un turno elige el modelo y el esfuerzo, acepta el permiso una vez y cuenta tokens y dólares', async () => {
  const { run, events, listo, sesiones } = correr()
  run.send('hola')
  await listo
  run.close()
  const texto = events.flatMap((e) => (e.t === 'text' ? [e.delta] : [])).join('')
  assert.match(texto, /^con instrucciones listo: /)
  // El modelo y el esfuerzo, por las opciones de la sesión, antes del mensaje; el permiso, una vez (`allow-once`): el de
  // «siempre» lo guardaría Grok en el proyecto.
  assert.match(texto, /initialize,session\/new,session\/set_config_option,session\/set_config_option,session\/prompt,permiso allow-once$/)
  assert.deepEqual(sesiones, ['s1'])
  assert.ok(events.some((e) => e.t === 'thinking' && e.delta === 'pienso'))
  assert.deepEqual(
    events.filter((e) => e.t === 'tool' || e.t === 'tool_update'),
    [
      { t: 'tool', id: 't1', name: 'Bash', input: { command: 'echo hola', description: 'Run echo' } },
      { t: 'tool_update', id: 't1', done: true, error: false, output: 'hola' }
    ]
  )
  const fin = events.find((e) => e.t === 'turn_end')
  assert.deepEqual(fin && fin.t === 'turn_end' && { ok: fin.ok, tokens: fin.tokens, costUsd: fin.costUsd }, { ok: true, tokens: { input: 400, output: 50, cacheRead: 600 }, costUsd: 0.0025 })
})

test('ACP: el turno que Grok abre solo al acabar una tarea de fondo se cierra, con su costo', async () => {
  const { run, events, listo } = correr({ DE_FONDO: '1' })
  run.send('hola')
  await listo
  while (events.filter((e) => e.t === 'turn_end').length < 2) await new Promise((ok) => setTimeout(ok, 10))
  run.close()
  const fin = events.filter((e) => e.t === 'turn_end').at(-1)
  assert.deepEqual(fin && fin.t === 'turn_end' && { ok: fin.ok, tokens: fin.tokens, costUsd: fin.costUsd }, { ok: true, tokens: { input: 10, output: 5, cacheRead: 0 }, costUsd: 0.001 })
  assert.equal(events.filter((e) => e.t === 'turn_start').length, 1)
})

test('ACP: un turno que el agente abrió solo y nadie cierra acaba tras el silencio', async () => {
  const { run, events, listo } = correr({ DE_FONDO: 'mudo' })
  run.send('hola')
  await listo
  while (events.filter((e) => e.t === 'turn_end').length < 2) await new Promise((ok) => setTimeout(ok, 10))
  run.close()
  const fin = events.filter((e) => e.t === 'turn_end').at(-1)
  assert.deepEqual(fin && fin.t === 'turn_end' && { ok: fin.ok, error: fin.error }, { ok: true, error: undefined })
})

/** Uno que lleva varias sesiones a la vez y dice en cada respuesta su proceso, cuántas veces arrancó y de qué sesión es. */
const VARIAS = `
let resto = '', inicios = 0, sesiones = 0
const decir = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n')
process.stdin.on('data', (d) => {
  resto += d
  let i
  while ((i = resto.indexOf('\\n')) >= 0) {
    const m = JSON.parse(resto.slice(0, i))
    resto = resto.slice(i + 1)
    if (m.method === 'initialize') (inicios++, decir({ id: m.id, result: { protocolVersion: 1 } }))
    else if (m.method === 'session/new') decir({ id: m.id, result: { sessionId: 's' + ++sesiones } })
    else if (m.method === 'session/prompt') {
      const s = m.params.sessionId
      setTimeout(() => {
        decir({ method: 'session/update', params: { sessionId: s, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: process.pid + ' ' + inicios + ' ' + s } } } })
        decir({ id: m.id, result: { stopReason: 'end_turn' } })
      }, 50)
    } else if (m.id !== undefined && m.method) decir({ id: m.id, result: {} })
  }
})
`
const SCRIPT_VARIAS = join(dirname(SCRIPT), 'varias.mjs')
writeFileSync(SCRIPT_VARIAS, VARIAS)

test('ACP compartido: dos hilos a la vez van en un solo proceso, cada uno con su sesión y su texto', async () => {
  const sabor: SaborAcp = {
    nombre: 'Antigravity',
    prefijo: 'antigravity',
    lanzar: () => ({ command: process.execPath, args: [SCRIPT_VARIAS], env: process.env }),
    sinCuenta: 'Conecta tu cuenta.',
    compartido: true,
    arranque: { dura: () => 1000, medido: (ms) => medidos.push(ms) }
  }
  const medidos: number[] = []
  const hilo = () => {
    let texto = ''
    const barra: boolean[] = []
    let fin!: () => void
    const listo = new Promise<void>((ok) => (fin = ok))
    const run = startAcp(sabor, {
      cwd: tmpdir(),
      model: 'antigravity:x',
      onEvent(e) {
        if (e.t === 'text') texto += e.delta
        if (e.t === 'arranque') barra.push(!!e.listo)
        if (e.t === 'turn_end') fin()
      },
      onProviderSession() {}
    })
    run.send('hola')
    return { run, listo, texto: () => texto, barra }
  }
  const [a, b] = [hilo(), hilo()]
  await Promise.all([a.listo, b.listo])
  const [pidA, iniciosA, sesionA] = a.texto().split(' ')
  const [pidB, iniciosB, sesionB] = b.texto().split(' ')
  assert.equal(pidA, pidB)
  assert.deepEqual([iniciosA, iniciosB], ['1', '1'])
  assert.deepEqual([sesionA, sesionB].sort(), ['s1', 's2'])
  // Los dos esperaron a que arrancara, con su barra.
  assert.deepEqual([a.barra, b.barra], [[false, true], [false, true]])
  assert.equal(medidos.length, 2)
  // Cerrados los dos, el proceso se queda para el siguiente hilo.
  a.run.close()
  b.run.close()
  const c = hilo()
  await c.listo
  assert.equal(c.texto().split(' ')[0], pidA)
  assert.equal(c.texto().split(' ')[2], 's3')
  assert.deepEqual(c.barra, [])
  c.run.close()
  process.kill(Number(pidA))
})

test('ACP compartido con varias cuentas: un proceso por cuenta, y cada hilo vuelve al de la suya', async () => {
  const lanzadas: (string | undefined)[] = []
  const sabor: SaborAcp = {
    nombre: 'Antigravity',
    prefijo: 'antigravity',
    cuenta: (opts) => (opts.model.endsWith('-a') ? 'A' : 'B'),
    lanzar: (_opts, cuenta) => (lanzadas.push(cuenta), { command: process.execPath, args: [SCRIPT_VARIAS], env: process.env }),
    sinCuenta: 'Conecta tu cuenta.',
    compartido: true
  }
  const hilo = (model: string) => {
    let texto = ''
    let fin!: () => void
    const listo = new Promise<void>((ok) => (fin = ok))
    const run = startAcp(sabor, { cwd: tmpdir(), model, onEvent: (e) => (e.t === 'text' && (texto += e.delta), e.t === 'turn_end' && fin()), onProviderSession() {} })
    run.send('hola')
    return { run, listo, pid: () => texto.split(' ')[0] }
  }
  const [a, b] = [hilo('antigravity:x-a'), hilo('antigravity:x-b')]
  await Promise.all([a.listo, b.listo])
  assert.notEqual(a.pid(), b.pid())
  const otraA = hilo('antigravity:y-a')
  await otraA.listo
  assert.equal(otraA.pid(), a.pid())
  assert.deepEqual(lanzadas.sort(), ['A', 'B'])
  for (const h of [a, b, otraA]) h.run.close()
  for (const pid of new Set([a.pid(), b.pid()])) process.kill(Number(pid))
})

/** Uno que contesta como Gemini CLI 0.66.0: modo y modelo fuera de `configOptions`, y el uso en `result.usage`. */
const COMO_GEMINI = `
let resto = ''
const decir = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n')
const u = (update) => decir({ method: 'session/update', params: { sessionId: 'g1', update } })
const pedidos = []
process.stdin.on('data', (d) => {
  resto += d
  let i
  while ((i = resto.indexOf('\\n')) >= 0) {
    const m = JSON.parse(resto.slice(0, i))
    resto = resto.slice(i + 1)
    pedidos.push(m.method)
    if (m.method === 'session/new') decir({ id: m.id, result: { sessionId: 'g1', modes: { currentModeId: 'default', availableModes: [{ id: 'default' }, { id: 'yolo' }] }, models: { availableModels: [{ modelId: 'auto' }] } } })
    else if (m.method === 'session/set_mode') {
      u({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '[MODE_UPDATE] yolo' } })
      decir({ id: m.id, result: {} })
    } else if (m.method === 'session/prompt') {
      if (process.env.LLAVE_MALA) decir({ id: m.id, error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } })
      else {
        u({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: pedidos.join(',') } })
        decir({ id: m.id, result: { stopReason: 'end_turn', usage: { inputTokens: 1000, cachedReadTokens: 600, outputTokens: 20, thoughtTokens: 30 } } })
      }
    } else if (m.id !== undefined) decir({ id: m.id, result: {} })
  }
})
`
const SCRIPT_GEMINI = join(dirname(SCRIPT), 'gemini.mjs')
writeFileSync(SCRIPT_GEMINI, COMO_GEMINI)

function correrGemini(env: Record<string, string> = {}) {
  const events: AgentEvent[] = []
  const sabor: SaborAcp = {
    nombre: 'Gemini',
    prefijo: 'gemini',
    lanzar: () => ({ command: process.execPath, args: [SCRIPT_GEMINI], env: { ...process.env, ...env } }),
    autenticar: 'gemini-api-key',
    modo: 'yolo',
    sinCompactar: true,
    sinCuenta: 'Pega tu llave.',
    traducir: errorGemini
  }
  let fin!: () => void
  const listo = new Promise<void>((ok) => (fin = ok))
  const run = startAcp(sabor, {
    cwd: tmpdir(),
    model: 'gemini:auto',
    onEvent(e) {
      events.push(e)
      if (e.t === 'turn_end') fin()
    },
    onProviderSession() {}
  })
  return { run, events, listo }
}

test('ACP como Gemini: el modo va con set_mode sin abrir un turno, y cuenta como salida lo que piensa', async () => {
  const { run, events, listo } = correrGemini()
  run.send('hola')
  await listo
  run.close()
  assert.deepEqual(events.flatMap((e) => (e.t === 'text' ? [e.delta] : [])), ['initialize,authenticate,session/new,session/set_mode,session/set_model,session/prompt'])
  assert.equal(events.filter((e) => e.t === 'turn_end').length, 1)
  const fin = events.find((e) => e.t === 'turn_end')
  assert.deepEqual(fin && fin.t === 'turn_end' && { ok: fin.ok, tokens: fin.tokens }, { ok: true, tokens: { input: 400, output: 50, cacheRead: 600 } })
  assert.equal(run.compact, undefined)
})

test('ACP como Gemini: una llave que Google rechaza acaba el turno en palabras de Sloth', async () => {
  const { run, events, listo } = correrGemini({ LLAVE_MALA: '1' })
  run.send('hola')
  await listo
  run.close()
  const fin = events.find((e) => e.t === 'turn_end')
  assert.deepEqual(fin && fin.t === 'turn_end' && { ok: fin.ok, error: fin.error }, { ok: false, error: 'Google no aceptó tu llave de Gemini. Cámbiala en Opciones.' })
})

test('Gemini: el límite de la llave se dice en palabras de Sloth, y lo demás no se toca', () => {
  assert.match(errorGemini('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}') ?? '', /límite de tu llave/)
  assert.equal(errorGemini('otro fallo'), undefined)
})

/** Uno como Antigravity: el error del modelo es un texto con `end_turn`, y la sesión que lo dio puede no contestar más. */
const COLGADO = `
let resto = '', prompts = 0
const decir = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n')
process.stdin.on('data', (d) => {
  resto += d
  let i
  while ((i = resto.indexOf('\\n')) >= 0) {
    const m = JSON.parse(resto.slice(0, i))
    resto = resto.slice(i + 1)
    if (m.method === 'initialize') decir({ id: m.id, result: { protocolVersion: 1 } })
    else if (m.method === 'session/new') decir({ id: m.id, result: { sessionId: 's1' } })
    else if (m.method === 'session/prompt') {
      if (++prompts > 1 || process.env.MODO === 'mudo') continue
      const u = (update) => decir({ method: 'session/update', params: { sessionId: 's1', update } })
      u({ sessionUpdate: 'usage_update', used: 100, size: 1000 })
      u({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: process.env.MODO === 'bien' ? 'Sobre tu error: The input token count exceeds the maximum.' : 'Requested token count exceeds the model\\'s maximum context length of 131072 tokens.' } })
      setTimeout(() => decir({ id: m.id, result: { stopReason: 'end_turn' } }), 30)
    } else if (m.id !== undefined && m.method) decir({ id: m.id, result: {} })
  }
})
`
const SCRIPT_COLGADO = join(dirname(SCRIPT), 'colgado.mjs')
writeFileSync(SCRIPT_COLGADO, COLGADO)

function colgado(modo: string, sabor: Partial<SaborAcp> = {}) {
  const events: AgentEvent[] = []
  let fin!: () => void
  const listo = new Promise<void>((ok) => (fin = ok))
  const run = startAcp({
    nombre: 'Antigravity',
    prefijo: 'antigravity',
    lanzar: () => ({ command: process.execPath, args: [SCRIPT_COLGADO], env: { ...process.env, MODO: modo } }),
    sinCuenta: 'Conecta tu cuenta.',
    errorDe: errorAntigravity,
    contextoOpaco: true,
    ...sabor
  }, {
    cwd: tmpdir(),
    model: 'antigravity:x',
    onEvent(e) {
      events.push(e)
      if (e.t === 'turn_end') fin()
    },
    onProviderSession() {}
  })
  const finDe = () => events.find((e): e is Extract<AgentEvent, { t: 'turn_end' }> => e.t === 'turn_end')
  return { run, events, listo, finDe }
}

test('ACP: el desborde que llega como texto cierra el turno con relevo, y lo que escribiste no va a esa sesión', async () => {
  const { run, events, listo, finDe } = colgado('error')
  run.send('hola')
  while (!events.some((e) => e.t === 'text')) await new Promise((ok) => setTimeout(ok, 1))
  run.steer('otro mensaje')
  await listo
  await new Promise((ok) => setTimeout(ok, 30))
  run.close()
  assert.deepEqual([finDe()?.ok, finDe()?.relevo, finDe()?.caida], [false, 'sigue', true])
  assert.equal(events.filter((e) => e.t === 'turn_end').length, 1)
  // El anillo de Antigravity no se presenta: se queda muy por debajo de lo que manda de verdad.
  assert.ok(!events.some((e) => e.t === 'context'))
})

test('ACP: el error del turno sabe con qué modelo y con qué cuenta pasó', async () => {
  const vistos: unknown[] = []
  const { run, listo } = colgado('error', { cuenta: () => 'A', errorDe: (texto, de) => (vistos.push(de), errorAntigravity(texto)) })
  run.send('hola')
  await listo
  run.close()
  assert.deepEqual(vistos, [{ modelo: 'x', cuenta: 'A' }])
})

test('ACP: un texto que solo habla de tokens no es un error', async () => {
  const { run, listo, finDe } = colgado('bien')
  run.send('hola')
  await listo
  run.close()
  assert.equal(finDe()?.ok, true)
})

test('ACP: si se calla, el turno acaba con relevo en vez de esperar para siempre', async () => {
  const { run, listo, finDe } = colgado('mudo', { mudo: { sin: 40, con: 1000 } })
  run.send('hola')
  await listo
  run.close()
  assert.deepEqual([finDe()?.ok, finDe()?.error, finDe()?.relevo], [false, 'Antigravity dejó de contestar.', 'sigue'])
})

test('ACP: sin `mudo` no hay plazo, y `/compact` de Antigravity es pasar a otra sesión', async () => {
  const { run, listo, finDe } = colgado('mudo')
  run.compact!()
  await listo
  run.close()
  assert.deepEqual([finDe()?.ok, finDe()?.relevo], [true, 'espera'])
})

test('Antigravity: conoce sus errores y deja pasar lo demás', () => {
  assert.deepEqual(errorAntigravity('Usage Limit Reached\n\nYou have reached your current quota for this period. Your limit will reset in 5 days, 2 hours.'), {
    error: 'Se acabó tu cuota de este grupo de modelos. Se renueva en 5 días, 2 horas. Mientras, elige abajo un modelo del otro grupo (Gemini, o Claude y GPT) y pulsa «Reintentar», o conecta otra cuenta de Google en Opciones → Antigravity.',
    cuota: true
  })
  assert.equal(errorAntigravity("Requested token count exceeds the model's maximum context length of 131072 tokens. You requested a total of 158550 tokens.")?.relevo, true)
  assert.equal(errorAntigravity('The input token count exceeds the maximum number of tokens allowed (131072).')?.relevo, true)
  assert.equal(errorAntigravity('Listo: el video pesa 12 MB y el modelo usó 3000 tokens.'), undefined)
  assert.equal(errorAntigravity(`The input tokens exceed… ${'x'.repeat(3000)}`), undefined)
})

test('Antigravity: la cuota es por grupo, y al acabarse en una cuenta sigue la siguiente que tenga', () => {
  assert.equal(renuevaEn('Your limit will reset in 5 days, 2 hours.'), (5 * 24 + 2) * 3_600_000)
  assert.equal(renuevaEn('Your limit will reset in 45 minutes.'), 45 * 60_000)
  assert.equal(renuevaEn('Usage Limit Reached'), undefined)
  assert.deepEqual([grupoDe('gemini-3.8-flash'), grupoDe('claude-opus-4-6-thinking'), grupoDe('gpt-oss-120b-medium'), grupoDe('')], ['gemini', 'otros', 'otros', 'gemini'])
  const ahora = 1_000
  const lista = { activa: 'b', cuentas: [{ id: 'a' }, { id: 'b', agotada: { gemini: 2_000 } }, { id: 'c', agotada: { gemini: 500 } }] }
  // La que está en uso, mientras le quede; si no, la que le sigue (la de c ya se renovó).
  assert.equal(elegirCuenta(lista, 'otros', ahora), 'b')
  assert.equal(elegirCuenta(lista, 'gemini', ahora), 'c')
  assert.equal(elegirCuenta({ ...lista, cuentas: lista.cuentas.map((c) => ({ ...c, agotada: { gemini: 5_000 } })) }, 'gemini', ahora), undefined)
  assert.equal(elegirCuenta({ cuentas: [] }, 'gemini', ahora), undefined)
})

test('ACP: sin cuenta, el turno acaba pidiendo conectarla', async () => {
  const { run, events, listo } = correr({ SIN_CUENTA: '1' })
  run.send('hola')
  await listo
  run.close()
  const fin = events.find((e) => e.t === 'turn_end')
  assert.deepEqual(fin && fin.t === 'turn_end' && { ok: fin.ok, error: fin.error }, { ok: false, error: 'Conecta tu cuenta de Grok en Opciones.' })
})
