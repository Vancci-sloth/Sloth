import { entornoSinLlaves } from './acceso.ts'
import { randomBytes } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { extname } from 'node:path'
import type { AgentEvent, Model, Tokens } from '../shared/types.ts'
import { conRutas, IMAGE_TYPES, type AgentOptions, type AgentRun, type SkillRef } from './agent.ts'
import { rutaAgente } from './agentes.ts'
import { cuentaConVentana } from './cuenta-ventana.ts'
import { conSkill, INSTRUCCIONES, mcpSloth } from './instrucciones.ts'
import { RpcLineas } from './rpc-lineas.ts'

/**
 * Muse Code, el agente de Meta, por su protocolo (MSP: JSON-RPC por líneas, `muse serve`), como en T3 Code. Lo instala
 * el instalador de Meta en la carpeta de Sloth (`server/agentes.ts`) y trabaja con la cuenta de Meta de cada quien
 * (`muse login`, que la guarda donde la guarda siempre Muse). Un proceso por hilo, sin permisos (`allowAll`), como los
 * demás agentes de Sloth.
 *
 * Muse no admite instrucciones de sistema: las de Sloth van al principio del primer mensaje.
 */

/** El id de cada orden y de cada sesión: un UUIDv7, como los pide Muse. */
function uuid7() {
  const b = randomBytes(16)
  b.writeUIntBE(Date.now(), 0, 6)
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Sin actualizarse solo: la versión la deja el instalador, y actualizarse a media sesión la cortaría. */
const entorno = () => ({ ...entornoSinLlaves(), MUSE_NO_AUTO_UPDATE: '1' })

/** La carpeta como la quiere Muse en Windows: con la forma `\\?\` y las mayúsculas del disco (T3 Code). */
function raiz(cwd: string) {
  const real = realpathSync.native(cwd)
  return process.platform === 'win32' && !real.startsWith('\\\\') ? `\\\\?\\${real}` : real
}

/** Abre `muse serve` y se presenta. */
async function abrir(args: string[], cwd: string, eventos: Partial<ConstructorParameters<typeof RpcLineas>[4]>) {
  const exe = rutaAgente('muse')
  if (!exe) throw new Error('Muse Code aún no está descargado.')
  const r = new RpcLineas('Muse Code', exe, ['serve', ...args], { cwd, env: entorno() }, { alAvisar() {}, alPedir: () => ({}), alCerrar() {}, ...eventos })
  const ini = await r.request('initialize', { clientInfo: { name: 'sloth', title: 'Sloth', version: '1' }, capabilities: { requestedCapabilities: ['sessionMcp'] } }, 60_000)
  r.notify('initialized', {})
  return { r, ini }
}

/** Los nombres de herramientas de Muse, como los de Claude que ya dibuja la interfaz. */
function herramienta(tool: string, args: Record<string, any>): { name: string; input: unknown } {
  const ruta = args.file_path ?? args.path
  if (/shell|bash|exec_command/i.test(tool)) return { name: 'Bash', input: { command: args.command ?? args.cmd, description: args.description } }
  if (/^write/i.test(tool)) return { name: 'Write', input: { ...args, file_path: ruta } }
  if (/edit|patch/i.test(tool)) return { name: 'Edit', input: { ...args, file_path: ruta } }
  if (/^read/i.test(tool)) return { name: 'Read', input: { ...args, file_path: ruta } }
  if (/grep|search_files/i.test(tool)) return { name: 'Grep', input: args }
  if (/glob|list_dir|^ls$/i.test(tool)) return { name: 'Glob', input: args }
  if (/web_search/i.test(tool)) return { name: 'WebSearch', input: args }
  if (/fetch|browse/i.test(tool)) return { name: 'WebFetch', input: args }
  if (/write_todos/i.test(tool)) return { name: 'TodoWrite', input: { todos: (args.todos ?? []).map((t: any) => ({ content: t.content ?? t.text, status: t.status === 'inProgress' ? 'in_progress' : t.status })) } }
  return { name: tool, input: args }
}

const CERO: Tokens = { input: 0, output: 0, cacheRead: 0 }

export function startMuse(opts: AgentOptions): AgentRun {
  const emit = (e: AgentEvent) => opts.onEvent(e)
  const modelo = opts.model.replace(/^muse:/, '')
  let rpc: RpcLineas | undefined
  let sesion = ''
  let turnoId = ''
  let busy = false
  let cerrado = false
  let detenido = false
  let primero = true
  let tokens = CERO
  /** Los elementos que se ven: su tipo, por su id (las herramientas ya dibujadas, para no repetirlas). */
  const vistos = new Map<string, string>()

  const terminar = (ok: boolean, error?: string) => {
    if (!busy) return
    busy = false
    turnoId = ''
    emit({ t: 'turn_end', at: Date.now(), ok, error, tokens })
    tokens = CERO
  }

  function elemento(item: any, fin: boolean) {
    if (!item?.id) return
    if (item.kind === 'toolCall' && !vistos.has(item.id)) {
      // La pregunta con formulario se cancela (`userInput/requested`): no se dibuja.
      if (/request_user_input/.test(item.tool ?? '')) return
      vistos.set(item.id, 'toolCall')
      let args: Record<string, any> = {}
      try {
        args = typeof item.args === 'string' ? JSON.parse(item.args) : (item.args ?? {})
      } catch {}
      const h = herramienta(item.tool ?? 'herramienta', args)
      emit({ t: 'tool', id: item.id, name: h.name, input: h.input })
    }
    if (item.kind === 'subagent' && !vistos.has(item.id)) {
      vistos.set(item.id, 'subagent')
      emit({ t: 'tool', id: item.id, name: 'Agent', input: { description: item.objective ?? item.role ?? 'Subagente de Muse' } })
      emit({ t: 'subagent', id: item.id, status: 'running', at: Date.now() })
    }
    if (!fin) return
    if (item.kind === 'toolCall') emit({ t: 'tool_update', id: item.id, done: true, error: item.status === 'failed', output: String(item.visibleOutput ?? item.output ?? '') })
    if (item.kind === 'subagent') {
      emit({ t: 'tool_update', id: item.id, done: true, output: String(item.result?.text ?? item.result?.summary ?? '') })
      emit({ t: 'subagent', id: item.id, status: item.status === 'failed' ? 'failed' : 'completed', at: Date.now() })
    }
    vistos.delete(item.id)
  }

  function oir(method: string, p: any) {
    if (p?.sessionId && p.sessionId !== sesion) return
    switch (method) {
      case 'turn/started':
        // Uno que abre Muse solo (terminó un subagente y sigue): es un turno suyo.
        if (!busy) {
          busy = true
          emit({ t: 'turn_start', at: Date.now() })
        }
        turnoId ||= p.turnId
        return
      case 'item/started':
      case 'item/updated':
        return elemento(p.item, false)
      case 'item/completed':
        return elemento(p.item, true)
      case 'item/delta': {
        const campo = p.field ?? 'text'
        if (campo === 'text') emit({ t: 'text', id: p.itemId, delta: p.delta })
        else if (campo.startsWith('summary')) emit({ t: 'thinking', id: `${p.itemId}:${campo}`, delta: p.delta })
        return
      }
      case 'session/contextUsage':
        if (p.windowTokens) emit({ t: 'context', used: p.usedTokens, max: p.windowTokens })
        return
      case 'session/tokenUsage': {
        const u = p.usage ?? {}
        const cache = u.cacheReadTokens ?? u.cachedTokens ?? 0
        tokens = { input: tokens.input + (p.promptTokens ?? u.inputTokens ?? 0) - cache, output: tokens.output + (u.outputTokens ?? 0), cacheRead: tokens.cacheRead + cache }
        return
      }
      case 'turn/retryScheduled':
        emit({ t: 'info', text: `Muse no pudo hablar con el modelo; lo intenta otra vez (${p.nextAttempt} de ${p.maxAttempts}).` })
        return
      case 'turn/completed':
        if (p.turnId !== turnoId && turnoId) return
        return terminar(p.terminal === 'completed', p.terminal === 'cancelled' || detenido ? 'lo detuviste' : p.terminal === 'completed' ? undefined : errorDe(p.error?.message ?? p.reason, p.error?.kind))
      case 'approval/requested': {
        // Con `allowAll` no pregunta; los subagentes y los flujos sí (T3 Code): se aceptan una vez.
        const elegida = (p.availableChoices ?? []).find((c: any) => c.decision === 'approved') ?? (p.availableChoices ?? [])[0]
        if (elegida) void rpc?.request('approval/decide', { commandId: uuid7(), approvalId: p.approvalId, requirementId: p.currentRequirementId, choiceId: elegida.choiceId }).catch(() => {})
        return
      }
      case 'userInput/requested':
        void rpc?.request('userInput/cancel', { commandId: uuid7(), userInputId: p.userInputId, reason: 'Sloth no puede contestar formularios. Pregunta al usuario en un mensaje normal.' }).catch(() => {})
        return
    }
  }

  const ready = (async () => {
    const { r } = await abrir(['--trust-workspace', '--disable-sandbox'], opts.cwd, {
      alAvisar: oir,
      alCerrar(error) {
        const habia = busy
        if (busy) {
          busy = false
          emit({ t: 'turn_end', at: Date.now(), ok: false, error: detenido ? 'lo detuviste' : (error?.message ?? 'Se cerró Muse Code.'), caida: !detenido })
        }
        opts.onExit?.(cerrado || !error ? undefined : { error: error.message, turno: habia })
      }
    })
    rpc = r
    const config = { mcpServers: Object.fromEntries(Object.entries(mcpSloth(opts.lote, opts.hilo)).map(([n, s]) => [n, { transport: 'stdio', mode: 'optional', ...s }])) }
    if (opts.resume) {
      sesion = opts.resume
      const ok = await r.request('session/resume', { commandId: uuid7(), sessionId: sesion, excludeItems: true, config, permissionProfile: ':unrestricted', ...(modelo ? { modelId: modelo } : {}) }).then(
        () => true,
        () => false
      )
      if (ok) await r.request('session/setApprovalMode', { commandId: uuid7(), sessionId: sesion, mode: 'allowAll' }).catch(() => {})
      else sesion = ''
    }
    if (!sesion) {
      sesion = uuid7()
      await r.request('session/start', { commandId: uuid7(), sessionId: sesion, workspaceRoot: realpathSync.native(opts.cwd), approvalMode: 'allowAll', permissionProfile: ':unrestricted', providerId: 'meta', ...(modelo ? { modelId: modelo } : {}), config })
    }
    opts.onProviderSession(sesion)
  })()
  void ready.catch(() => {})

  function partes(text: string, images: string[]) {
    const texto = conRutas(primero ? `<sloth>\n${INSTRUCCIONES}\n</sloth>\n\n${text}` : text, images)
    primero = false
    return [{ type: 'text', text: texto }, ...images.map((p) => ({ type: 'image', mediaType: IMAGE_TYPES[extname(p).toLowerCase()] ?? 'image/png', base64Data: readFileSync(p).toString('base64') }))]
  }

  async function mandar(text: string, images: string[], steer = false) {
    try {
      await ready
      if (cerrado) return
      if (steer && busy && turnoId) {
        await rpc!.request('turn/steer', { commandId: uuid7(), sessionId: sesion, expectedTurnId: turnoId, input: partes(text, images) })
        return
      }
      busy = true
      const commandId = uuid7()
      turnoId = commandId
      await rpc!.request('turn/start', { commandId, sessionId: sesion, input: partes(text, images), displayText: text, workspaceRoots: [raiz(opts.cwd)], ifBusy: 'queue', ...(opts.effort ? { reasoningEffort: opts.effort } : {}) })
    } catch (e) {
      busy = true
      terminar(false, errorDe(e instanceof Error ? e.message : String(e)))
    }
  }

  return {
    send(text, skill?: SkillRef, images = []) {
      detenido = false
      try {
        void mandar(conSkill(text, skill), images)
      } catch (e) {
        busy = true
        terminar(false, e instanceof Error ? e.message : String(e))
      }
    },
    steer(text, images = []) {
      void mandar(text, images, true)
    },
    compact() {
      busy = true
      void ready
        .then(() => rpc!.request('session/compact', { commandId: uuid7(), sessionId: sesion }))
        .then((r) => r?.status === 'noop' && terminar(true))
        .catch((e) => terminar(false, e instanceof Error ? e.message : String(e)))
    },
    async interrupt() {
      detenido = true
      await ready.catch(() => {})
      if (!rpc || !sesion) return
      await rpc.request('turn/interrupt', { commandId: uuid7(), sessionId: sesion, ...(turnoId ? { turnId: turnoId } : {}) }).catch(() => rpc?.close())
      // Si en 30 segundos no corta, se cierra Muse: el siguiente mensaje retoma la sesión.
      const r = rpc
      setTimeout(() => busy && rpc === r && r.close(), 30_000).unref()
    },
    close() {
      cerrado = true
      rpc?.close()
    }
  }
}

/** Los errores de Muse, en palabras de Sloth. */
function errorDe(error = '', tipo?: string): string {
  if (tipo === 'authRequired' || /not logged in|login required|unauthenticated/i.test(error)) return 'Conecta tu cuenta de Meta en Opciones → Muse Code.'
  if (/quota|usage limit|\b429\b/i.test(error)) return 'Llegaste al límite de uso de Muse Code. Espera a que se reinicie.'
  if (/lack access|does not exist/i.test(error)) return 'Tu cuenta de Meta no tiene ese modelo. Elige otro de Muse Code.'
  return error || 'Muse Code falló.'
}

interface ModeloMuse {
  modelId: string
  displayLabel?: string
  isDefault?: boolean
  defaultReasoningEffort?: string
  reasoningEffortVariants?: { tier: string }[]
}

/** Los modelos de la cuenta de Meta. Sin sesión, Muse da la lista vacía. */
export async function modelosMuse(): Promise<Model[]> {
  if (!rutaAgente('muse')) return []
  let r: RpcLineas | undefined
  try {
    r = (await abrir(['--disable-shell', '--disable-write', '--no-session-log'], process.cwd(), {})).r
    const { models } = (await r.request('model/list', {}, 30_000)) as { models: ModeloMuse[] }
    // El predeterminado primero.
    return [...models]
      .sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault))
      .map((m) => ({ id: `muse:${m.modelId}`, label: `Muse · ${m.displayLabel ?? m.modelId}`, efforts: (m.reasoningEffortVariants ?? []).map((v) => v.tier), defaultEffort: m.defaultReasoningEffort }))
  } catch {
    return []
  } finally {
    r?.close()
  }
}

/** La cuenta: Muse no dice si hay sesión, pero sin ella no da modelos. Conectar abre `muse login` en su ventana. */
export const cuentaMuse = cuentaConVentana('muse', {
  comando: (exe) => ({ command: [exe, 'login'], env: { MUSE_NO_AUTO_UPDATE: '1' } }),
  async estado() {
    return { conectada: (await modelosMuse()).length > 0 }
  }
})
