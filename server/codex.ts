import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Model, Tokens } from '../shared/types.ts'
import type { AgentOptions, AgentRun, SkillRef } from './agent.ts'
import { OPCIONES } from './claude.ts'
import { CodexRpc } from './codex-rpc.ts'
import { navegadorAgente } from './navegador-agente.ts'

/** Codex conserva los hilos en su almacén; Sloth conserva su id y traduce el protocolo al mismo AgentEvent de Claude. */
export function startCodex(opts: AgentOptions, connect: Conectar = (notify, exit, config) => new CodexRpc(notify, exit, config)): AgentRun {
  let threadId = ''
  let turnId = ''
  let busy = false
  let cerrado = false
  let serie = Promise.resolve()
  let antes: Tokens | undefined
  let total: Tokens | undefined
  let errorTurno: string | undefined
  const textos = new Map<string, string>()
  const salidas = new Map<string, string>()
  const herramientas = new Set<string>()
  const subagentes = new Map<string, string>()
  // La herramienta que lanzó cada subagente, para que su fila diga si trabaja y cómo acabó. Una puede lanzar varios.
  const lanzador = new Map<string, string>()
  const emit = opts.onEvent
  const segundoPlano = () => emit({ t: 'background', tasks: [...subagentes.values()] })
  /** Un subagente que acaba. Su herramienta acaba con el último de los que lanzó, y dice cómo acabó ese. */
  const acaba = (hijo: string, estado?: string) => {
    const herramienta = lanzador.get(hijo)
    lanzador.delete(hijo)
    if (!herramienta || [...lanzador.values()].includes(herramienta)) return
    emit({ t: 'subagent', id: herramienta, status: estado === 'completed' ? 'completed' : estado === 'interrupted' || estado === 'shutdown' ? 'stopped' : 'failed', at: Date.now() })
  }
  const terminar = (ok: boolean, error?: string, caida?: boolean) => {
    if (!busy) return
    busy = false
    turnId = ''
    const tokens = total && antes ? { input: total.input - antes.input, output: total.output - antes.output, cacheRead: total.cacheRead - antes.cacheRead } : undefined
    emit({ t: 'turn_end', at: Date.now(), ok, error, caida, tokens })
  }
  const idDe = (id: string) => `${turnId}:${id}`
  const texto = (id: string, delta: string, thinking = false) => {
    const key = idDe(id)
    textos.set(key, (textos.get(key) ?? '') + delta)
    if (delta) emit({ t: thinking ? 'thinking' : 'text', id: key, delta })
  }
  const completo = (id: string, text: string, thinking = false) => {
    const previo = textos.get(idDe(id)) ?? ''
    if (text.startsWith(previo)) texto(id, text.slice(previo.length), thinking)
  }
  const rpc = connect((method, value) => {
    const p = value as Notificacion
    if (p.threadId && p.threadId !== threadId) {
      if (subagentes.has(p.threadId) && method === 'turn/completed') {
        subagentes.delete(p.threadId)
        acaba(p.threadId, p.turn?.status)
        segundoPlano()
      }
      return
    }
    if (p.turnId && turnId && p.turnId !== turnId) return
    if (method === 'turn/started' && p.turn) turnId = p.turn.id
    if (method === 'item/agentMessage/delta') texto(p.itemId!, p.delta!)
    if (method === 'item/reasoning/summaryTextDelta') texto(`${p.itemId}:pensamiento`, p.delta!, true)
    if (method === 'item/commandExecution/outputDelta') {
      const id = idDe(p.itemId!)
      const output = (salidas.get(id) ?? '') + (p.delta ?? '')
      salidas.set(id, output)
      if (p.delta) emit({ t: 'tool_update', id, delta: p.delta })
    }
    if ((method === 'item/started' || method === 'item/completed') && p.item) {
      const item = p.item
      const id = idDe(item.id)
      const done = method === 'item/completed'
      if (done && item.type === 'agentMessage') completo(item.id, item.text ?? '')
      else if (done && item.type === 'reasoning') completo(`${item.id}:pensamiento`, (item.summary ?? []).join('\n'), true)
      else if (item.type === 'contextCompaction' && done) emit({ t: 'info', text: 'Codex compactó el contexto para continuar.' })
      else if (!['agentMessage', 'reasoning', 'userMessage', 'contextCompaction', 'hookPrompt'].includes(item.type)) {
        if (!herramientas.has(id)) {
          herramientas.add(id)
          const name = item.type === 'commandExecution' ? 'Bash' : item.type === 'fileChange' ? 'Edit' : item.type === 'mcpToolCall' ? `mcp__${item.server}__${item.tool}` : item.type === 'webSearch' ? 'WebSearch' : item.type === 'collabAgentToolCall' ? 'Agent' : item.type
          const input = item.type === 'commandExecution' ? { command: item.command, cwd: item.cwd } : item.type === 'fileChange' ? { changes: item.changes } : item.arguments ?? item
          emit({ t: 'tool', id, name, input })
        }
        if (done) {
          emit({ t: 'tool_update', id, done: true, output: item.aggregatedOutput ?? salidas.get(id) ?? JSON.stringify(item.result ?? item.changes ?? item.agentsStates ?? ''), error: item.status === 'failed' || item.status === 'declined' || !!item.error || (item.exitCode != null && item.exitCode !== 0) })
          salidas.delete(id)
        }
      }
      // Después de su herramienta: la fila del subagente es la de ella.
      if (item.type === 'collabAgentToolCall' && done) {
        for (const [hijo, state] of Object.entries(item.agentsStates ?? {})) {
          if (state.status === 'running' || state.status === 'pendingInit') {
            subagentes.set(hijo, item.prompt?.slice(0, 100) || 'Subagente de Codex')
            if (lanzador.has(hijo)) continue
            if (![...lanzador.values()].includes(id)) emit({ t: 'subagent', id, status: 'running', at: Date.now() })
            lanzador.set(hijo, id)
          } else {
            subagentes.delete(hijo)
            acaba(hijo, state.status)
          }
        }
        segundoPlano()
      }
    }
    if (method === 'thread/tokenUsage/updated' && p.tokenUsage) {
      const u = p.tokenUsage
      total = { input: u.total.inputTokens - u.total.cachedInputTokens, output: u.total.outputTokens, cacheRead: u.total.cachedInputTokens }
      if (u.modelContextWindow) emit({ t: 'context', used: u.last.totalTokens, max: u.modelContextWindow })
    }
    if (method === 'error' && !p.willRetry) errorTurno = p.error?.message
    if (method === 'turn/completed' && p.turn) terminar(p.turn.status === 'completed', p.turn.status === 'interrupted' ? 'lo detuviste' : p.turn.error?.message ?? errorTurno)
  }, (error) => {
    const turno = busy
    terminar(false, error?.message ?? 'Se cerró Codex.', !!error)
    opts.onExit?.(error && !cerrado ? { error: error.message, turno } : undefined)
    subagentes.clear()
    lanzador.clear()
    segundoPlano()
  }, {
    mcp_servers: Object.fromEntries(Object.entries(navegadorAgente(opts.lote, opts.hilo)).map(([name, server]) => [name, { command: server.command, args: server.args ?? [], ...(server.env ? { env: server.env } : {}) }]))
  })
  const ready = (async () => {
    await rpc.ready
    const account = await rpc.request<{ account: { type: string } | null }>('account/read', { refreshToken: false })
    if (account.account?.type !== 'chatgpt') throw new Error('Conecta tu cuenta de ChatGPT en Opciones → Agentes → Codex.')
    const r = await rpc.request<{ thread: { id: string } }>(opts.resume ? 'thread/resume' : 'thread/start', {
      ...(opts.resume ? { threadId: opts.resume } : {}), model: opts.model.replace(/^codex:/, ''), modelProvider: 'openai', cwd: opts.cwd,
      approvalPolicy: 'never', sandbox: 'danger-full-access',
      developerInstructions: `${OPCIONES}\nLa interfaz y tus respuestas van en español. Haz las preguntas en mensajes normales, sin herramientas de preguntas interactivas. Las skills de Sloth están en ${join(homedir(), '.claude', 'skills')}. Respeta la skill invocada y lee sus referencias cuando hagan falta.`
    })
    threadId = r.thread.id
    opts.onProviderSession(threadId)
  })()
  void ready.catch(() => {})

  const enOrden = (fn: () => Promise<void>, cerrarTurno = true) => {
    serie = serie.then(fn).catch((error) => {
      const mensaje = error instanceof Error ? error.message : String(error)
      if (cerrarTurno || !turnId) terminar(false, mensaje)
      else emit({ t: 'info', text: `Codex no pudo recibir la petición: ${mensaje}. El turno sigue trabajando; vuelve a intentarlo.` })
      if (!threadId) rpc.close()
    })
  }
  function input(text: string, images: string[], skill?: SkillRef) {
    const path = skill?.path ?? (skill && join(homedir(), '.claude', 'skills', skill.name, 'SKILL.md'))
    if (path && !existsSync(path)) throw new Error(`No se encontró la skill ${skill!.name}.`)
    return [
      ...images.map((path) => ({ type: 'localImage', path })),
      { type: 'text', text: skill ? `$${skill.name} ${text}` : text, text_elements: [] },
      ...(skill ? [{ type: 'skill', name: skill.name, path }] : [])
    ]
  }
  async function mandar(text: string, images: string[], skill?: SkillRef, steer = false) {
    await ready
    if (cerrado) return
    const datos = input(text, images, skill)
    if (steer && turnId) {
      try {
        await rpc.request('turn/steer', { threadId, expectedTurnId: turnId, input: datos })
        return
      } catch (error) {
        // Si el turno acabó justo antes de recibir el mensaje, abre otro. Un error de otro tipo no se reenvía.
        if (turnId) throw error
      }
    }
    if (!busy) { busy = true; emit({ t: 'turn_start', at: Date.now() }) }
    antes = total ?? (opts.resume ? undefined : { input: 0, output: 0, cacheRead: 0 })
    textos.clear()
    salidas.clear()
    herramientas.clear()
    errorTurno = undefined
    const r = await rpc.request<{ turn: { id: string; status: string } }>('turn/start', { threadId, input: datos, effort: opts.effort, summary: 'concise' })
    if (busy) turnId = r.turn.id
  }

  return {
    send(text, skill, images = []) { busy = true; enOrden(() => mandar(text, images, skill)) },
    steer(text, images = []) { enOrden(() => mandar(text, images, undefined, true), false) },
    compact() {
      if (busy || subagentes.size) throw new Error('Espera a que Codex termine antes de compactar.')
      busy = true
      enOrden(async () => {
        await ready
        if (cerrado) return
        antes = total
        errorTurno = undefined
        await rpc.request('thread/compact/start', { threadId })
      })
    },
    async interrupt() {
      if (!busy && subagentes.size) { cerrado = true; rpc.close(); return }
      enOrden(async () => { await ready; if (turnId) await rpc.request('turn/interrupt', { threadId, turnId }) }, false)
      await serie
    },
    close() { cerrado = true; rpc.close() }
  }
}

/** Solo la parte del protocolo que se dibuja; los campos nuevos del app-server no entran en la interfaz. */
interface Notificacion {
  threadId?: string
  turnId?: string
  itemId?: string
  delta?: string
  willRetry?: boolean
  error?: { message: string }
  turn?: { id: string; status: string; error?: { message: string } | null }
  tokenUsage?: { total: Uso; last: Uso; modelContextWindow: number | null }
  item?: { id: string; type: string; text?: string; summary?: string[]; command?: string; cwd?: string; changes?: unknown; server?: string; tool?: string; arguments?: unknown; status?: string; aggregatedOutput?: string | null; result?: unknown; error?: unknown; exitCode?: number | null; prompt?: string | null; agentsStates?: Record<string, { status: string }> }
}
interface Uso { inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number }
type Conectar = (notify: (method: string, params: unknown) => void, exit: (error?: Error) => void, config: Record<string, unknown>) => Pick<CodexRpc, 'ready' | 'request' | 'close'>

/** El catálogo viene de Codex, con sus esfuerzos: no se fija una lista de GPT en Sloth. */
export async function codexModels(): Promise<Model[]> {
  const rpc = new CodexRpc()
  try {
    await rpc.ready
    const lista: Model[] = []
    let cursor: string | null = null
    do {
      const r: { data: { model: string; displayName: string; supportedReasoningEfforts: { reasoningEffort: string }[]; defaultReasoningEffort: string }[]; nextCursor: string | null } = await rpc.request('model/list', { cursor, limit: 100 })
      lista.push(...r.data.map((m) => ({ id: `codex:${m.model}`, label: `Codex · ${m.displayName}`, efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort), defaultEffort: m.defaultReasoningEffort })))
      cursor = r.nextCursor
    } while (cursor)
    return lista
  } catch { return [] } finally { rpc.close() }
}
