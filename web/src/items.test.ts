import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentEvent } from '../../shared/types.ts'
import { buildTimeline, errorLlano, partirOpciones, toolSummary, type EstadoSubagente, type Item, type Subagente } from './items.ts'

/** Como se armaba el hilo antes de leerlo por partes: todo de cero cada vez. Es la referencia. */
function deCero(events: AgentEvent[]): Item[] {
  const lanza = (name: string, input: any) => (name === 'Agent' || name === 'Task') && (input?.tool === undefined || input.tool === 'spawnAgent')
  const items: Item[] = []
  const byId = new Map<string, Item>()
  let turnStart = 0
  const avisos = new Map<string, { status: EstadoSubagente; desde?: number; hasta?: number; cortado?: boolean }>()
  const lanzadores = new Set<string>()
  let fondo: string[] = []
  events.forEach((e, i) => {
    switch (e.t) {
      case 'user':
        items.push({ kind: 'user', key: `u${i}`, text: e.text, images: e.images ?? [] })
        break
      case 'turn_start':
        turnStart = e.at
        break
      case 'text':
      case 'thinking': {
        const key = `${e.t}:${e.id}`
        const found = byId.get(key)
        if (found && (found.kind === 'text' || found.kind === 'thinking')) found.text += e.delta
        else {
          const item: Item = e.t === 'thinking' ? { kind: e.t, key, text: e.delta, parent: e.parent, at: e.at } : { kind: e.t, key, text: e.delta, parent: e.parent }
          byId.set(key, item)
          items.push(item)
        }
        break
      }
      case 'tool': {
        const item: Item = { kind: 'tool', key: `tool:${e.id}`, id: e.id, name: e.name, input: e.input, output: '', done: false, error: false, parent: e.parent }
        byId.set(item.key, item)
        items.push(item)
        if (lanza(e.name, e.input)) lanzadores.add(e.id)
        break
      }
      case 'tool_update': {
        const item = byId.get(`tool:${e.id}`)
        if (item?.kind !== 'tool') break
        if (e.output !== undefined) item.output = e.output
        if (e.delta) item.output += e.delta
        if (e.done) item.done = true
        if (e.error) item.error = true
        break
      }
      case 'turn_end':
        items.push({ kind: 'turn_end', key: `end${i}`, ok: e.ok, error: e.error, caida: e.caida, costUsd: e.costUsd, ms: turnStart ? e.at - turnStart : 0 })
        for (const it of items) if (it.kind === 'tool' && !it.done && !(it.parent && lanzadores.has(it.parent))) it.done = true
        break
      case 'info':
        items.push({ kind: 'info', key: `i${i}`, text: e.text })
        break
      case 'subagent': {
        const a = avisos.get(e.id)
        if (e.status !== 'running') avisos.set(e.id, { ...a, status: e.status, hasta: e.at })
        else if (a?.status !== 'running' || a.cortado) avisos.set(e.id, { status: 'running', desde: e.at })
        break
      }
      case 'background':
        fondo = e.tasks
        if (!e.tasks.length) for (const a of avisos.values()) if (a.status === 'running') a.cortado = true
        break
    }
  })
  const subagentes = new Map<string, Subagente>()
  for (const item of items) {
    if (item.kind !== 'tool' || !lanza(item.name, item.input)) continue
    const i = item.input ?? {}
    const titulo = toolSummary(item.name, i).detail || 'Subagente'
    const a = avisos.get(item.id)
    const estado: EstadoSubagente = a ? (a.cortado && a.status === 'running' ? 'stopped' : a.status) : !item.done || fondo.includes(titulo) ? 'running' : item.error ? 'failed' : 'completed'
    item.subagente = { id: item.id, titulo, encargo: String(i.prompt ?? ''), modelo: i.model, esfuerzo: i.effort, estado, desde: a?.desde, hasta: a?.hasta, items: [] }
    subagentes.set(item.id, item.subagente)
  }
  for (const item of items) {
    const sub = 'parent' in item && item.parent ? subagentes.get(item.parent) : undefined
    if (!sub) continue
    sub.items.push(item)
    if (item.kind === 'tool' && !item.done && sub.estado !== 'running') item.done = true
  }
  for (const item of items) {
    if (item.kind !== 'text') continue
    const { texto, opciones } = partirOpciones(item.text)
    item.text = texto
    if (opciones.length) item.opciones = opciones
  }
  return items
}

/** Un generador con semilla, para que cada vuelta salga igual. */
function azar(semilla: number) {
  let s = semilla
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
}

/** Un hilo inventado con todo lo que puede pasar: texto con opciones, herramientas, subagentes dentro de subagentes, cortes. */
function hilo(semilla: number, largo: number): AgentEvent[] {
  const r = azar(semilla)
  const elige = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const events: AgentEvent[] = []
  const herramientas: string[] = []
  const lanzadores: string[] = []
  let at = 1000
  for (let n = 0; n < largo; n++) {
    at += Math.floor(r() * 500)
    const padre = lanzadores.length && r() < 0.4 ? elige(lanzadores) : undefined
    const x = r()
    if (x < 0.05) events.push({ t: 'user', text: `hola ${n}`, at })
    else if (x < 0.1) events.push({ t: 'turn_start', at })
    else if (x < 0.35) events.push({ t: 'text', id: `t${Math.floor(r() * 6)}`, delta: elige(['palabra ', '\n<opciones>\nSí\n', 'No\n</opciones>\n', '```\ncódigo\n', '```\n', '<op']), parent: padre })
    else if (x < 0.42) events.push({ t: 'thinking', id: `p${Math.floor(r() * 4)}`, delta: 'pienso ', parent: padre })
    else if (x < 0.52) {
      const id = `h${n}`
      const agente = r() < 0.3
      events.push({ t: 'tool', id, name: agente ? 'Agent' : elige(['Bash', 'Read', 'Edit']), input: agente ? { description: `sub ${n}`, prompt: 'haz algo' } : { command: 'ls' }, parent: padre })
      herramientas.push(id)
      if (agente) lanzadores.push(id)
    } else if (x < 0.75 && herramientas.length) {
      const id = r() < 0.05 ? 'nadie' : elige(herramientas)
      events.push({ t: 'tool_update', id, ...(r() < 0.5 ? { output: `salida ${n}` } : { delta: `+${n}` }), ...(r() < 0.3 ? { done: true } : {}), ...(r() < 0.05 ? { error: true } : {}) })
    } else if (x < 0.8) events.push({ t: 'turn_end', at, ok: r() < 0.8, costUsd: r() })
    else if (x < 0.85 && lanzadores.length) events.push({ t: 'subagent', id: elige(lanzadores), status: elige(['running', 'running', 'completed', 'failed', 'stopped']), at })
    else if (x < 0.9) events.push({ t: 'background', tasks: r() < 0.5 ? [] : lanzadores.slice(-2).map((l) => `sub ${l.slice(1)}`) })
    else if (x < 0.93 && herramientas.length) events.push({ t: 'tool', id: elige(herramientas), name: 'Bash', input: { command: 'otra vez' } })
    else events.push({ t: 'info', text: `aviso ${n}` })
  }
  return events
}

/** Lo que se dibuja, sin las referencias: dos armados iguales dan el mismo JSON. */
const plano = (items: Item[]) => JSON.parse(JSON.stringify(items))

test('Timeline: leer el hilo por partes da lo mismo que armarlo de cero', () => {
  for (let semilla = 1; semilla <= 40; semilla++) {
    const events = hilo(semilla, 400)
    const r = azar(semilla * 7)
    // Como llegan por el WebSocket: la lista crece por trozos de cualquier tamaño, cada vez otra lista.
    let lista: AgentEvent[] = []
    while (lista.length < events.length) {
      lista = [...lista, ...events.slice(lista.length, lista.length + 1 + Math.floor(r() * 12))]
      assert.deepEqual(plano(buildTimeline(lista)), plano(deCero(structuredClone(lista))), `semilla ${semilla}, ${lista.length} eventos`)
    }
  }
})

test('Timeline: lo que no cambió sigue siendo el mismo objeto', () => {
  const base: AgentEvent[] = [
    { t: 'user', text: 'hola', at: 1 },
    { t: 'turn_start', at: 1 },
    { t: 'text', id: 'a', delta: 'Uno' },
    { t: 'tool', id: 'h1', name: 'Bash', input: { command: 'ls' } },
    { t: 'tool_update', id: 'h1', output: 'x', done: true },
    { t: 'text', id: 'b', delta: 'Dos' }
  ]
  const antes = buildTimeline(base)
  const despues = buildTimeline([...base, { t: 'text', id: 'b', delta: ' y tres' }])
  assert.equal(despues[0], antes[0])
  assert.equal(despues[1], antes[1])
  assert.equal(despues[2], antes[2])
  assert.notEqual(despues[3], antes[3])
  assert.equal(despues[3].kind === 'text' && despues[3].text, 'Dos y tres')
  // La misma lista, otra vez: lo mismo, sin volver a armarlo.
  assert.equal(buildTimeline(base), antes)
})

test('Timeline: un subagente que no cambió es el mismo; el que trabaja, otro', () => {
  const base: AgentEvent[] = [
    { t: 'user', text: 'hola', at: 1 },
    { t: 'tool', id: 'a1', name: 'Agent', input: { description: 'Uno', prompt: 'p' } },
    { t: 'tool', id: 'a2', name: 'Agent', input: { description: 'Dos', prompt: 'p' } },
    { t: 'text', id: 'x', delta: 'del uno', parent: 'a1' },
    { t: 'text', id: 'y', delta: 'del dos', parent: 'a2' }
  ]
  const antes = buildTimeline(base)
  const despues = buildTimeline([...base, { t: 'text', id: 'y', delta: ' y más', parent: 'a2' }])
  assert.equal(despues[1], antes[1])
  assert.notEqual(despues[2], antes[2])
  assert.equal(despues[2].kind === 'tool' && despues[2].subagente?.items.length, 1)
})

test('Timeline: un hilo de Codex de antes enseña cada subagente en una fila, no un paso por aviso', () => {
  const aviso = (id: string, kind: string, hijo: string): AgentEvent => ({ t: 'tool', id, name: 'subAgentActivity', input: { type: 'subAgentActivity', kind, model: kind === 'started' ? 'gpt-6.1-terra' : null, reasoningEffort: null, agentThreadId: hijo, agentPath: `/root/${hijo}` } })
  const items = buildTimeline([
    { t: 'user', text: 'hola', at: 1 },
    { t: 'turn_start', at: 1 },
    aviso('t:1', 'started', 'escenas'),
    { t: 'tool_update', id: 't:1', done: true, output: '' },
    aviso('t:2', 'interacted', 'escenas'),
    aviso('t:3', 'completed', 'escenas'),
    { t: 'tool', id: 't:4', name: 'Agent', input: { tool: 'wait', prompt: null } },
    { t: 'turn_end', at: 5, ok: true }
  ])
  const pasos = items.flatMap((i) => (i.kind === 'tool' ? [[i.name, i.subagente?.titulo, i.subagente?.estado]] : []))
  assert.deepEqual(pasos, [['Agent', 'escenas', 'completed'], ['Agent', undefined, undefined]])
  assert.equal(toolSummary('Agent', { tool: 'wait', prompt: null }).verb, 'Espera a sus subagentes')
})

test('errorLlano: el límite y la cuenta son los del agente del hilo, y con ChatGPT dice cuándo se reinicia', () => {
  const limite = 'You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at Oct 27th, 2026 1:12 AM.'
  const codex = errorLlano(limite, false, 'codex')
  assert.equal(codex.titulo, 'Llegaste al límite de tu plan de ChatGPT')
  const hora = new Date('Oct 27, 2026 1:12 AM').toLocaleString('es-MX', { weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  assert.equal(codex.ayuda, `Se reinicia: ${hora}. Entonces pulsa «Reintentar».`)
  assert.equal(errorLlano('401 Unauthorized', false, 'codex').titulo, 'Tu cuenta de ChatGPT se desconectó')
  assert.equal(errorLlano('API Error: 529 overloaded').titulo, 'Claude no respondió')
  assert.equal(errorLlano('Se acabó tu uso gratis de OpenCode por ahora.', false, 'opencode').titulo, 'Se acabó tu uso gratis de OpenCode')
  assert.equal(errorLlano('El modelo gratis llegó a su límite por ahora.', false, 'opencode').titulo, 'El modelo gratis está saturado')
  assert.equal(errorLlano('Conecta tu cuenta de OpenCode en Opciones: es gratis.', false, 'opencode').titulo, 'Falta tu cuenta de OpenCode')
})
