import { entornoAgente, llavesPrestables, llavesPrestadas, prestarLlaves } from './acceso.ts'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentEvent, Model, Tokens } from '../shared/types.ts'
import { conRutas, IMAGE_TYPES, type AgentOptions, type AgentRun, type SkillRef } from './agent.ts'
import { comandoAgente } from './agentes.ts'
import { cuentaConVentana } from './cuenta-ventana.ts'
import { conSkill, INSTRUCCIONES, mcpSloth } from './instrucciones.ts'
import { matarArbol } from './rpc-lineas.ts'

/**
 * Pi (`@earendil-works/pi-coding-agent`), en modo RPC (`pi --mode rpc`), como en T3 Code: un proceso por hilo que habla
 * JSON por líneas. Pi trabaja con el proveedor que cada quien conecte en él (`/login`: Claude, ChatGPT, Gemini, Copilot…,
 * o una llave de API como la de DeepSeek), y guarda las cuentas en `~/.pi/agent`, el mismo Pi de la terminal. Las llaves que
 * guardaste en Sloth las usa solo si se lo eliges en Opciones (`entornoAgente`).
 *
 * Los MCP de Sloth (el navegador y la voz) y sus instrucciones entran con una extensión que Sloth escribe en
 * `data/pi` (`pi.registerMcpServer`): Pi conecta solo sus MCP, como los de `mcp.json`.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXTENSION = join(APP, 'data', 'pi', 'sloth-extension.ts')
const LOGIN = join(APP, 'data', 'pi', 'sloth-login.ts')
/** Pi solo para iniciar sesión: sin sesión ni lo que carga para trabajar. */
const ARGS_LOGIN = ['--no-session', '--no-skills', '--no-context-files', '--no-prompt-templates', '--no-extensions', '--extension']

/** La extensión: registra los MCP del hilo, que le llegan en `SLOTH_MCP`, con sus herramientas a la vista del modelo. */
const FUENTE = `// La escribe Sloth (server/pi.ts) cada vez que abre Pi: no la edites.
export default function (pi: any) {
  const servidores = JSON.parse(process.env.SLOTH_MCP || '{}')
  for (const [nombre, s] of Object.entries(servidores)) pi.registerMcpServer(nombre, { ...(s as object), exposure: 'direct' })
}
`

/**
 * La de iniciar sesión: Pi no tiene un `pi login` y `/login` solo se atiende escrito en su editor, así que lo escribe y le
 * da Enter, y cierra la ventana en cuanto se guarda una cuenta. El Enter usa `focusedComponent`, que no es API pública:
 * si un Pi nuevo lo cambia, queda `/login` escrito y basta con pulsar Enter.
 */
const FUENTE_LOGIN = `// La escribe Sloth (server/pi.ts) cada vez que abre Pi para conectar una cuenta: no la edites.
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CUENTAS = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'), 'auth.json')
const fecha = () => statSync(CUENTAS, { throwIfNoEntry: false })?.mtimeMs

export default function (pi: any) {
  pi.on('session_start', (_e: unknown, ctx: any) => {
    const antes = fecha()
    let tui: any
    ctx.ui.setWidget('sloth', (t: any) => ((tui = t), { render: () => [], invalidate() {} }))
    ctx.ui.setWidget('sloth', undefined)
    ctx.ui.setEditorText('/login')
    // Mientras Pi arranca, el Enter deja el texto donde está: se repite hasta que lo toma.
    const enter = setInterval(() => {
      if (ctx.ui.getEditorText() !== '/login') clearInterval(enter)
      else tui?.focusedComponent?.handleInput('\\r')
    }, 300)
    const guardada = setInterval(() => {
      if (fecha() === antes) return
      clearInterval(guardada)
      setTimeout(() => process.exit(0), 1500)
    }, 500)
  })
}
`

function extension(archivo = EXTENSION, fuente = FUENTE) {
  mkdirSync(dirname(archivo), { recursive: true })
  let actual = ''
  try {
    actual = readFileSync(archivo, 'utf8')
  } catch {}
  if (actual !== fuente) writeFileSync(archivo, fuente)
  return archivo
}

/** `pi:deepseek/deepseek-flash` → el proveedor y el modelo de Pi (el modelo puede llevar `/`). */
function modeloDe(model: string) {
  const [provider, ...resto] = model.replace(/^pi:/, '').split('/')
  return { provider, modelId: resto.join('/') }
}

/** Los nombres de herramientas de Pi, como los de Claude que ya dibuja la interfaz. */
function herramienta(nombre: string, a: Record<string, any>): { name: string; input: unknown } {
  switch (nombre) {
    case 'bash':
    case 'powershell':
      return { name: 'Bash', input: { command: a.command, description: a.description } }
    case 'read':
      return { name: 'Read', input: { ...a, file_path: a.path } }
    case 'write':
      return { name: 'Write', input: { ...a, file_path: a.path, content: a.content } }
    case 'edit':
      return { name: 'Edit', input: { ...a, file_path: a.path } }
    case 'grep':
      return { name: 'Grep', input: a }
    case 'find':
    case 'ls':
      return { name: 'Glob', input: { pattern: a.pattern ?? a.path, path: a.path } }
  }
  return { name: nombre, input: a }
}

const textoDe = (r?: { content?: { type: string; text?: string }[] }) => (r?.content ?? []).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n')

const CERO: Tokens = { input: 0, output: 0, cacheRead: 0 }

/** Un Pi en modo RPC: manda órdenes y reparte sus eventos. Las respuestas llevan el id de la orden. */
class Rpc {
  readonly proc: ChildProcessWithoutNullStreams
  private n = 0
  private esperas = new Map<string, (r: { success: boolean; data?: any; error?: string }) => void>()
  private resto = ''
  errores = ''

  constructor(args: string[], cwd: string, env: NodeJS.ProcessEnv, oir: (e: any) => void, alCerrar: (code: number | null) => void) {
    const c = comandoAgente('pi')
    if (!c) throw new Error('Pi aún no está descargado.')
    this.proc = spawn(c.command, [...c.args, '--mode', 'rpc', ...args], { cwd, env, windowsHide: true, stdio: 'pipe' })
    this.proc.stdout.setEncoding('utf8')
    // Solo en `\n`: readline también parte en U+2028 y U+2029, que llegan dentro del texto (T3 Code).
    this.proc.stdout.on('data', (d: string) => {
      this.resto += d
      let i
      while ((i = this.resto.indexOf('\n')) >= 0) {
        const linea = this.resto.slice(0, i).replace(/\r$/, '')
        this.resto = this.resto.slice(i + 1)
        let m: any
        try {
          m = JSON.parse(linea)
        } catch {
          continue
        }
        if (m.type === 'response' && m.id && this.esperas.has(m.id)) {
          this.esperas.get(m.id)!(m)
          this.esperas.delete(m.id)
        } else oir(m)
      }
    })
    this.proc.stderr.setEncoding('utf8')
    this.proc.stderr.on('data', (d: string) => (this.errores = (this.errores + d).slice(-2000)))
    this.proc.on('exit', (code) => {
      for (const ok of this.esperas.values()) ok({ success: false, error: 'Se cerró Pi.' })
      this.esperas.clear()
      alCerrar(code)
    })
    this.proc.on('error', () => {})
    this.proc.stdin.on('error', () => {})
  }

  orden(type: string, datos: Record<string, unknown> = {}, espera = 60_000): Promise<any> {
    const id = `sloth-${++this.n}`
    return new Promise((ok, mal) => {
      const reloj = espera ? setTimeout(() => (this.esperas.delete(id), mal(new Error(`Pi no contestó a tiempo (${type}).`))), espera) : undefined
      this.esperas.set(id, (r) => {
        clearTimeout(reloj)
        if (r.success) ok(r.data)
        else mal(new Error(r.error ?? `Pi no pudo (${type}).`))
      })
      this.proc.stdin.write(JSON.stringify({ id, type, ...datos }) + '\n')
    })
  }

  responder(m: Record<string, unknown>) {
    this.proc.stdin.write(JSON.stringify(m) + '\n')
  }

  close() {
    matarArbol(this.proc)
  }
}

export function startPi(opts: AgentOptions): AgentRun {
  const emit = (e: AgentEvent) => opts.onEvent(e)
  let rpc: Rpc
  let busy = false
  let cerrado = false
  let detenido = false
  let compactando = false
  let errorTurno: string | undefined
  let tokens = CERO
  let costo = 0
  let ventana = 0
  let turno = 0
  let mensaje = 0
  let usado = 0

  const terminar = (ok: boolean, error?: string) => {
    if (!busy) return
    busy = false
    emit({ t: 'turn_end', at: Date.now(), ok, error, tokens, ...(costo ? { costUsd: costo } : {}) })
    tokens = CERO
    costo = 0
    errorTurno = undefined
  }

  function oir(e: any) {
    switch (e.type) {
      case 'agent_start':
        // Uno que abre Pi solo (sigue tras compactar, o algo de fondo): es un turno suyo.
        if (!busy) {
          busy = true
          emit({ t: 'turn_start', at: Date.now() })
        }
        return
      case 'message_start':
        if (e.message?.role === 'assistant') mensaje++
        return
      case 'message_update': {
        const a = e.assistantMessageEvent
        if (a?.delta && (a.type === 'text_delta' || a.type === 'thinking_delta')) emit({ t: a.type === 'text_delta' ? 'text' : 'thinking', id: `${turno}:${mensaje}:${a.contentIndex ?? 0}${a.type === 'thinking_delta' ? ':pensamiento' : ''}`, delta: a.delta })
        const total = e.usage?.totalTokens
        // Solo cuando cambia: cada trozo de texto lo repite.
        if (typeof total === 'number' && ventana && total !== usado) emit({ t: 'context', used: (usado = total), max: ventana })
        return
      }
      case 'message_end': {
        const m = e.message
        if (m?.role !== 'assistant') return
        const u = m.usage
        if (u) {
          tokens = { input: tokens.input + (u.input ?? 0) + (u.cacheWrite ?? 0), output: tokens.output + (u.output ?? 0), cacheRead: tokens.cacheRead + (u.cacheRead ?? 0) }
          costo += u.cost?.total ?? 0
        }
        if (m.stopReason === 'error') errorTurno = m.errorMessage
        return
      }
      case 'tool_execution_start': {
        const h = herramienta(e.toolName, e.args ?? {})
        emit({ t: 'tool', id: e.toolCallId, name: h.name, input: h.input })
        return
      }
      case 'tool_execution_end':
        emit({ t: 'tool_update', id: e.toolCallId, done: true, error: !!e.isError, output: textoDe(e.result) })
        return
      case 'auto_retry_start':
        emit({ t: 'info', text: `${/\b503\b|high demand|overloaded/i.test(e.errorMessage ?? '') ? 'El modelo está saturado' : /\b429\b|rate.?limit|quota/i.test(e.errorMessage ?? '') ? 'El modelo llegó a su límite por ahora' : 'Pi no pudo hablar con el modelo'}; lo intenta otra vez (${e.attempt} de ${e.maxAttempts}).` })
        return
      case 'compaction_end':
        if (compactando) {
          compactando = false
          terminar(!e.aborted && !e.errorMessage, e.errorMessage)
        } else if (!e.aborted && !e.errorMessage) emit({ t: 'info', text: 'Pi compactó el contexto para continuar.' })
        return
      case 'agent_settled':
        if (!compactando) terminar(!errorTurno && !e.aborted && !detenido, detenido || e.aborted ? 'lo detuviste' : errorTurno)
        return
      case 'extension_ui_request':
        // Las extensiones que piden confirmar algo: sí, como los permisos de los demás agentes. Lo que pide elegir o
        // escribir, no se sabe contestar: se cancela.
        if (e.method === 'notify') emit({ t: 'info', text: String(e.message ?? e.title ?? '') })
        else rpc.responder({ type: 'extension_ui_response', id: e.id, ...(e.method === 'confirm' ? { confirmed: true } : { cancelled: true }) })
        return
    }
  }

  const { provider, modelId } = modeloDe(opts.model)
  const args = ['--extension', extension(), '--append-system-prompt', INSTRUCCIONES, ...(opts.resume ? ['--session', opts.resume] : [])]
  const env = { ...entornoAgente('pi'), SLOTH_MCP: JSON.stringify(mcpSloth(opts.lote, opts.hilo)) }
  rpc = new Rpc(args, opts.cwd, env, oir, (code) => {
    const habia = busy
    if (busy) {
      busy = false
      emit({ t: 'turn_end', at: Date.now(), ok: false, error: detenido ? 'lo detuviste' : `Pi se cerró (código ${code}).`, caida: !detenido })
    }
    opts.onExit?.(cerrado ? undefined : { error: `Pi se cerró (código ${code}).${rpc.errores ? ` ${rpc.errores.trim().split('\n').pop()}` : ''}`, turno: habia })
  })

  const ready = (async () => {
    if (provider && modelId) {
      const m = await rpc.orden('set_model', { provider, modelId })
      ventana = m?.contextWindow ?? 0
    }
    if (opts.effort) await rpc.orden('set_thinking_level', { level: opts.effort }).catch(() => {})
    const s = await rpc.orden('get_state')
    ventana ||= s?.model?.contextWindow ?? 0
    // Pi retoma por la ruta del archivo de la sesión, no por su id.
    if (s?.sessionFile) opts.onProviderSession(s.sessionFile)
  })()
  void ready.catch(() => {})

  async function mandar(text: string, images: string[]) {
    try {
      await ready
      if (cerrado) return
      busy = true
      turno++
      mensaje = 0
      // `steer`: si ya trabaja, lo mete antes de su siguiente llamada al modelo; si no, empieza.
      const r = await rpc.orden(
        'prompt',
        {
          message: conRutas(text, images),
          images: images.map((p) => ({ type: 'image', mimeType: IMAGE_TYPES[extname(p).toLowerCase()] ?? 'image/png', data: readFileSync(p).toString('base64') })),
          streamingBehavior: 'steer'
        },
        0
      )
      // Lo consumió un comando de Pi (`/algo`): no hay turno que esperar.
      if (r?.disposition === 'handled') terminar(true)
    } catch (e) {
      busy = true
      terminar(false, e instanceof Error ? e.message : String(e))
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
      void mandar(text, images)
    },
    compact() {
      busy = true
      compactando = true
      void ready
        .then(() => rpc.orden('compact', {}, 0))
        .catch((e) => {
          compactando = false
          terminar(false, e instanceof Error ? e.message : String(e))
        })
    },
    async interrupt() {
      detenido = true
      // Compactando, `abort` no lo corta: se cierra Pi, y el siguiente mensaje retoma la sesión (T3 Code).
      if (compactando) return rpc.close()
      await rpc.orden('abort').catch(() => rpc.close())
    },
    close() {
      cerrado = true
      rpc.close()
    }
  }
}

/** Un Pi de un momento, sin sesión ni extensiones, para preguntarle algo. */
async function consultar<T>(fn: (rpc: Rpc) => Promise<T>): Promise<T> {
  let rpc: Rpc | undefined
  try {
    rpc = new Rpc(['--no-session', '--no-extensions'], APP, entornoAgente('pi'), () => {}, () => {})
    return await fn(rpc)
  } finally {
    rpc?.close()
  }
}

interface ModeloPi {
  id: string
  name?: string
  provider: string
  reasoning?: boolean
  thinkingLevelMap?: Record<string, string | null>
  cost?: { input?: number; output?: number }
}

/**
 * Lo que cuesta un modelo de Pi, en dólares por millón de tokens; sin nada, es gratis. Un 0 en su catálogo no basta: también
 * lo llevan los planes de pago (Qwen, Xiaomi), los enrutadores y lo que no tiene precio publicado (NVIDIA). Es gratis solo
 * si lo dice su nombre o si es de quien cobra por token (Google, OpenCode Zen).
 */
export function precioPi(m: ModeloPi) {
  const { input = 0, output = 0 } = m.cost ?? {}
  if (input || output) return `$${input} / $${output}`
  return /free/i.test(m.id) || m.provider === 'google' || m.provider === 'opencode' ? undefined : 'precio desconocido'
}

/** Los niveles de pensamiento de un modelo de Pi: los que su mapa no anula (`xhigh` y `max`, solo si los mapea). */
const NIVELES = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const niveles = (m: ModeloPi) => (m.reasoning ? NIVELES.filter((n) => (n === 'xhigh' || n === 'max' ? !!m.thinkingLevelMap?.[n] : m.thinkingLevelMap?.[n] !== null)) : [])

/** Los modelos de los proveedores que conectaste en Pi. Vacío si Pi no se ha bajado o no tiene ninguno. */
export async function modelosPi(): Promise<Model[]> {
  if (!comandoAgente('pi')) return []
  try {
    const { models } = (await consultar((r) => r.orden('get_available_models', {}, 30_000))) as { models: ModeloPi[] }
    return models.map((m) => ({ id: `pi:${m.provider}/${m.id}`, label: `Pi · ${m.name ?? m.id} (${m.provider})`, efforts: niveles(m), defaultEffort: niveles(m).includes('high') ? 'high' : undefined, precio: precioPi(m) }))
  } catch {
    return []
  }
}

/**
 * La cuenta: Pi tiene una si tiene al menos un modelo que usar. Conectar abre Pi en su ventana, ya en su `/login`, donde se
 * elige el proveedor (`FUENTE_LOGIN`).
 */
export const cuentaPi = cuentaConVentana('pi', {
  comando: () => {
    const c = comandoAgente('pi')!
    return { command: [c.command, ...c.args, ...ARGS_LOGIN, extension(LOGIN, FUENTE_LOGIN)], env: llavesPrestadas('pi') }
  },
  async estado() {
    // Quién: los proveedores que tiene conectados («deepseek, anthropic»).
    const proveedores = [...new Set((await modelosPi()).map((m) => modeloDe(m.id).provider))]
    return { conectada: proveedores.length > 0, quien: proveedores.join(', ') || undefined, llavesSloth: llavesPrestables('pi') }
  }
})

/** Darle a Pi las llaves de Sloth, o dejar de dárselas: cambia los modelos que tiene. Los hilos abiertos siguen como estaban. */
export function llavesPi(usar: boolean) {
  prestarLlaves('pi', usar)
  return cuentaPi.cuenta(true)
}
