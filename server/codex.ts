import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Model, Tokens } from '../shared/types.ts'
import type { AgentOptions, AgentRun, SkillRef } from './agent.ts'
import { OPCIONES } from './claude.ts'
import { CodexRpc } from './codex-rpc.ts'
import { navegadorAgente } from './navegador-agente.ts'
import { costoCodex } from './precios.ts'

/** Codex conserva los hilos en su almacén; Sloth conserva su id y traduce el protocolo al mismo AgentEvent de Claude. */
export function startCodex(opts: AgentOptions, connect: Conectar = (notify, exit, config) => new CodexRpc(notify, exit, config), precio = costoCodex): AgentRun {
  let threadId = ''
  let turnId = ''
  let busy = false
  let cerrado = false
  let serie = Promise.resolve()
  let antes: Tokens | undefined
  let total: Tokens | undefined
  /** Los dólares del turno a precio de la API, petición a petición. `undefined` si falta alguna (sin precio o sin `antes`). */
  let gastado: number | undefined
  const modelo = opts.model.replace(/^codex:/, '')
  let errorTurno: string | undefined
  // Lo que va llegando a trozos: lo del turno se olvida al abrir otro; lo de los subagentes, que trabajan aparte de los
  // turnos, cuando acaba cada uno.
  const delTurno = { textos: new Map<string, string>(), salidas: new Map<string, string>(), herramientas: new Set<string>() }
  const deSubagentes = { textos: new Map<string, string>(), salidas: new Map<string, string>(), herramientas: new Set<string>() }
  /** Los subagentes que trabajan, por su hilo de Codex, con lo que dice de ellos el segundo plano. */
  const subagentes = new Map<string, string>()
  // La fila de cada subagente (la herramienta que lo lanzó), por su hilo: dice si trabaja y cómo acabó, y lo que hace
  // cuelga de ella. Con el protocolo de antes, una herramienta podía lanzar varios.
  const lanzador = new Map<string, string>()
  // Lo que gastaron los subagentes, que cuenta en el turno abierto o, si ya acabó, en el siguiente: su modelo y sus tokens
  // hasta ahora, por hilo. Sin tokens de partida (uno de antes de retomar) no se sabe qué es nuevo.
  const modeloDe = new Map<string, string>()
  const usoDe = new Map<string, Tokens>()
  let deHijos: { tokens: Tokens; usd?: number } = { tokens: CERO, usd: 0 }
  const emit = opts.onEvent
  const segundoPlano = () => emit({ t: 'background', tasks: [...subagentes.values()] })
  const ocupada = (fila: string) => [...subagentes.keys()].some((h) => lanzador.get(h) === fila)
  /** Un subagente que empieza o vuelve a trabajar. Su fila trabaja desde el primero de los suyos. */
  const trabaja = (hijo: string, titulo: string) => {
    const fila = lanzador.get(hijo)
    if (!fila || subagentes.has(hijo)) return
    if (!ocupada(fila)) emit({ t: 'subagent', id: fila, status: 'running', at: Date.now() })
    subagentes.set(hijo, titulo)
    segundoPlano()
  }
  /** Un subagente que acaba. Su fila acaba con el último de los suyos, y dice cómo acabó ese. */
  const acaba = (hijo: string, estado?: string) => {
    if (!subagentes.delete(hijo)) return
    segundoPlano()
    for (const mapa of Object.values(deSubagentes)) for (const k of mapa.keys()) if (k.startsWith(`${hijo}:`)) mapa.delete(k)
    const fila = lanzador.get(hijo)
    if (!fila || ocupada(fila)) return
    emit({ t: 'subagent', id: fila, status: estado === 'completed' ? 'completed' : estado === 'interrupted' || estado === 'shutdown' ? 'stopped' : 'failed', at: Date.now() })
  }
  // El hilo que lanzó a cada subagente (el del agente principal o el de otro subagente).
  const padreDe = new Map<string, string>()
  /** Si `otro` es el hilo `desde` o uno de los que lo lanzaron, hasta el agente principal. */
  const deArriba = (otro: string, desde: string) => {
    for (let h: string | undefined = desde; h; h = padreDe.get(h)) if (h === otro) return true
    return otro === threadId
  }
  /**
   * Un subagente nuevo, con el protocolo de ahora: su fila es como la de `Agent` en Claude, con su nombre en Codex. Llega
   * en el hilo de quien le habla (`emisor`). Cuando un subagente le entrega su informe al que lo lanzó, el aviso va en
   * su hilo y nombra a ese padre: no es un subagente nuevo. Contarlo así dejaba «root», el agente principal, en segundo
   * plano para siempre, y el hilo parecía trabajar cuando ya había terminado.
   */
  const actividad = (a: NonNullable<Notificacion['item']>, parent?: string, emisor = threadId) => {
    const hijo = a.agentThreadId!
    if (deArriba(hijo, emisor)) return
    const titulo = a.agentPath?.split('/').filter(Boolean).pop() || 'Subagente de Codex'
    if (!lanzador.has(hijo)) {
      padreDe.set(hijo, emisor)
      const fila = `subagente:${hijo}`
      lanzador.set(hijo, fila)
      if (a.model) modeloDe.set(hijo, a.model)
      if (a.kind === 'started') usoDe.set(hijo, CERO)
      emit({ t: 'tool', id: fila, name: 'Agent', input: { description: titulo, model: a.model ?? undefined, effort: a.reasoningEffort ?? undefined }, ...(parent ? { parent } : {}) })
    }
    if (a.kind === 'completed' || a.kind === 'interrupted') acaba(hijo, a.kind)
    else trabaja(hijo, titulo)
  }
  /** Lo nuevo que gastó un subagente, a precio de la API de su modelo. */
  const gastoDeHijo = (hijo: string, u: NonNullable<Notificacion['tokenUsage']>) => {
    const nuevo = tokensDe(u.total)
    const previo = usoDe.get(hijo)
    usoDe.set(hijo, nuevo)
    if (!previo) return
    const d = resta(nuevo, previo)
    const c = precio(modeloDe.get(hijo) ?? modelo, d, u.last.inputTokens)
    deHijos = { tokens: suma(deHijos.tokens, d), usd: deHijos.usd === undefined || c === undefined ? undefined : deHijos.usd + c }
  }
  const terminar = (ok: boolean, error?: string, caida?: boolean) => {
    if (!busy) return
    busy = false
    turnId = ''
    const tokens = total && antes ? suma(resta(total, antes), deHijos.tokens) : undefined
    const costUsd = tokens && gastado !== undefined && deHijos.usd !== undefined ? gastado + deHijos.usd : undefined
    deHijos = { tokens: CERO, usd: 0 }
    emit({ t: 'turn_end', at: Date.now(), ok, error, caida, tokens, costUsd })
  }
  /** Lo que hace el agente del hilo o, con `hijo`, un subagente: lo suyo cuelga de su fila y sus ids van por su hilo. */
  function trabajo(method: string, p: Notificacion, hijo?: string) {
    const { textos, salidas, herramientas } = hijo ? deSubagentes : delTurno
    const parent = hijo ? lanzador.get(hijo) : undefined
    const suyo = parent ? { parent } : {}
    const idDe = (id: string) => `${hijo ?? turnId}:${id}`
    const texto = (id: string, delta: string, thinking = false) => {
      const key = idDe(id)
      textos.set(key, (textos.get(key) ?? '') + delta)
      if (delta) emit({ t: thinking ? 'thinking' : 'text', id: key, delta, ...suyo })
    }
    const completo = (id: string, text: string, thinking = false) => {
      const previo = textos.get(idDe(id)) ?? ''
      if (text.startsWith(previo)) texto(id, text.slice(previo.length), thinking)
    }
    if (method === 'item/agentMessage/delta') texto(p.itemId!, p.delta!)
    if (method === 'item/reasoning/summaryTextDelta') texto(`${p.itemId}:pensamiento`, p.delta!, true)
    if (method === 'item/commandExecution/outputDelta') {
      const id = idDe(p.itemId!)
      const output = (salidas.get(id) ?? '') + (p.delta ?? '')
      salidas.set(id, output)
      if (p.delta) emit({ t: 'tool_update', id, delta: p.delta })
    }
    if ((method !== 'item/started' && method !== 'item/completed') || !p.item) return
    const item = p.item
    const id = idDe(item.id)
    const done = method === 'item/completed'
    // Llega al empezar y al acabar el aviso, y lo de su hilo puede llegar entre los dos.
    if (item.type === 'subAgentActivity') actividad(item, parent, hijo)
    else if (done && item.type === 'agentMessage') completo(item.id, item.text ?? '')
    else if (done && item.type === 'reasoning') completo(`${item.id}:pensamiento`, (item.summary ?? []).join('\n'), true)
    else if (item.type === 'contextCompaction' && done) emit({ t: 'info', text: 'Codex compactó el contexto para continuar.' })
    else if (!['agentMessage', 'reasoning', 'userMessage', 'contextCompaction', 'hookPrompt'].includes(item.type)) {
      if (!herramientas.has(id)) {
        herramientas.add(id)
        const name = item.type === 'commandExecution' ? 'Bash' : item.type === 'fileChange' ? 'Edit' : item.type === 'mcpToolCall' ? `mcp__${item.server}__${item.tool}` : item.type === 'webSearch' ? 'WebSearch' : item.type === 'collabAgentToolCall' ? 'Agent' : item.type
        const input = item.type === 'commandExecution' ? { command: item.command, cwd: item.cwd } : item.type === 'fileChange' ? { changes: item.changes } : item.arguments ?? item
        emit({ t: 'tool', id, name, input, ...suyo })
      }
      if (done) {
        emit({ t: 'tool_update', id, done: true, output: item.aggregatedOutput ?? salidas.get(id) ?? JSON.stringify(item.result ?? item.changes ?? item.agentsStates ?? ''), error: item.status === 'failed' || item.status === 'declined' || !!item.error || (item.exitCode != null && item.exitCode !== 0) })
        salidas.delete(id)
      }
    }
    // El protocolo de antes: después de su herramienta, que es la fila del subagente.
    if (item.type === 'collabAgentToolCall' && done) {
      for (const [otro, state] of Object.entries(item.agentsStates ?? {})) {
        // Lo que un subagente le dice al que lo lanzó tampoco es un subagente (ver `actividad`).
        if (deArriba(otro, hijo ?? threadId)) continue
        if (state.status === 'running' || state.status === 'pendingInit') {
          if (!lanzador.has(otro)) {
            padreDe.set(otro, hijo ?? threadId)
            lanzador.set(otro, id)
            usoDe.set(otro, CERO)
          }
          trabaja(otro, item.prompt?.slice(0, 100) || 'Subagente de Codex')
        } else acaba(otro, state.status)
      }
    }
  }
  const rpc = connect((method, value) => {
    const p = value as Notificacion
    if (p.threadId && p.threadId !== threadId) {
      const hijo = p.threadId
      if (!lanzador.has(hijo)) return
      if (method === 'turn/completed') acaba(hijo, p.turn?.status)
      else if (method === 'thread/tokenUsage/updated' && p.tokenUsage) gastoDeHijo(hijo, p.tokenUsage)
      else trabajo(method, p, hijo)
      return
    }
    if (p.turnId && turnId && p.turnId !== turnId) return
    if (method === 'turn/started' && p.turn) turnId = p.turn.id
    trabajo(method, p)
    if (method === 'thread/tokenUsage/updated' && p.tokenUsage) {
      const u = p.tokenUsage
      const nuevo = tokensDe(u.total)
      // Cada aviso es una petición: lo que subió desde el anterior, con la tarifa que toca a lo que leyó (`last`).
      const previo = total ?? antes
      if (busy && previo && gastado !== undefined) {
        const c = precio(modelo, resta(nuevo, previo), u.last.inputTokens)
        gastado = c === undefined ? undefined : gastado + c
      }
      total = nuevo
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
    padreDe.clear()
    segundoPlano()
  }, {
    mcp_servers: Object.fromEntries(Object.entries(navegadorAgente(opts.lote, opts.hilo)).map(([name, server]) => [name, { command: server.command, args: server.args ?? [], ...(server.env ? { env: server.env } : {}) }]))
  })
  const ready = (async () => {
    await rpc.ready
    const account = await rpc.request<{ account: { type: string } | null }>('account/read', { refreshToken: false })
    if (account.account?.type !== 'chatgpt') throw new Error('Conecta tu cuenta de ChatGPT en Opciones → Agentes → Codex.')
    const r = await rpc.request<{ thread: { id: string } }>(opts.resume ? 'thread/resume' : 'thread/start', {
      ...(opts.resume ? { threadId: opts.resume } : {}), model: modelo, modelProvider: 'openai', cwd: opts.cwd,
      approvalPolicy: 'never', sandbox: 'danger-full-access',
      developerInstructions: `${OPCIONES}\nLa interfaz y tus respuestas van en español. Haz las preguntas en mensajes normales, sin herramientas de preguntas interactivas. Las skills de Sloth están en ${join(homedir(), '.claude', 'skills')}. La skill invocada es siempre la de esa carpeta: si ves otra con el mismo nombre (en ${join(homedir(), '.codex', 'skills')} u otra), es una copia vieja y no se usa. Respeta la skill invocada y lee sus referencias cuando hagan falta.`
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
  /**
   * La skill va por su ruta, no como `$nombre`: Codex no lee ~/.claude/skills, y un `$nombre` lo resuelve con la suya de
   * ese nombre (en ~/.codex/skills), si hay. Así, en octubre de 2026, un El Diff siguió una copia vieja de la skill.
   */
  function input(text: string, images: string[], skill?: SkillRef) {
    const path = skill?.path ?? (skill && join(homedir(), '.claude', 'skills', skill.name, 'SKILL.md'))
    if (path && !existsSync(path)) throw new Error(`No se encontró la skill ${skill!.name}.`)
    return [
      ...images.map((path) => ({ type: 'localImage', path })),
      { type: 'text', text: skill ? `Usa la skill ${skill.name} de Sloth, la de ${path} (no otra copia con ese nombre).

${text}` : text, text_elements: [] },
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
    antes = total ?? (opts.resume ? undefined : CERO)
    gastado = antes ? 0 : undefined
    for (const mapa of Object.values(delTurno)) mapa.clear()
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
        gastado = antes ? 0 : undefined
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
  item?: { id: string; type: string; text?: string; summary?: string[]; command?: string; cwd?: string; changes?: unknown; server?: string; tool?: string; arguments?: unknown; status?: string; aggregatedOutput?: string | null; result?: unknown; error?: unknown; exitCode?: number | null; prompt?: string | null; agentsStates?: Record<string, { status: string }>; kind?: string; agentThreadId?: string; agentPath?: string; model?: string | null; reasoningEffort?: string | null }
}
interface Uso { inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number }

const CERO: Tokens = { input: 0, output: 0, cacheRead: 0 }
/** Los tokens que cuenta Sloth: la entrada sin la caché, aparte. */
const tokensDe = (u: Uso): Tokens => ({ input: u.inputTokens - u.cachedInputTokens, output: u.outputTokens, cacheRead: u.cachedInputTokens })
const resta = (a: Tokens, b: Tokens): Tokens => ({ input: a.input - b.input, output: a.output - b.output, cacheRead: a.cacheRead - b.cacheRead })
const suma = (a: Tokens, b: Tokens): Tokens => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead })
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
