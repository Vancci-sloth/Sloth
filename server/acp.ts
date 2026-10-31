import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname } from 'node:path'
import type { AgentEvent, Tokens } from '../shared/types.ts'
import { conRutas, IMAGE_TYPES, type AgentOptions, type AgentRun, type SkillRef } from './agent.ts'
import { conSkill, INSTRUCCIONES, mcpSloth } from './instrucciones.ts'
import { RpcLineas } from './rpc-lineas.ts'

/**
 * Los agentes que hablan ACP (Agent Client Protocol) por stdio: Grok (`grok agent stdio`) y Antigravity (el servidor ACP
 * de Google). Como lo hace T3 Code (`packages/provider-acp`), pero solo lo que usa Sloth: sin permisos (se acepta cada
 * herramienta, como con los demás agentes), sin terminal ni escritura de archivos del lado de Sloth (el agente las hace
 * él mismo) y un proceso por hilo, salvo los `compartido`: uno para todos sus hilos, cada uno en su sesión.
 *
 * ACP no tiene instrucciones de sistema: las de Sloth van al principio del primer mensaje de cada proceso. El modelo y su
 * esfuerzo se eligen con las opciones de la sesión (`configOptions`), o con `session/set_model` si no las trae.
 */

export interface SaborAcp {
  /** «Grok», «Antigravity»: en los mensajes. */
  nombre: string
  /** El prefijo de sus modelos (`grok:`). */
  prefijo: string
  /** El programa con sus argumentos y su entorno. Puede fallar (falta la cuenta). */
  lanzar(opts: AgentOptions): { command: string; args: string[]; env: NodeJS.ProcessEnv; alCerrar?(): void }
  /** Cómo se presenta Sloth: Antigravity solo ofrece los modelos que no son de Gemini a clientes que conoce (Zed). */
  clientInfo?: { name: string; version: string }
  /** Lee él mismo los archivos que le piden (Antigravity). */
  leeArchivos?: boolean
  /** Inicia sesión antes de abrirla, cada vez (Antigravity). */
  autenticar?: string
  /** El modo que se elige al abrir la sesión, si lo tiene como opción (`yolo` en Antigravity: sin preguntar). */
  modo?: string
  /** Lo que lleva `session/cancel` (Grok: `ctrl_c`, que no deja que las tareas de fondo lo despierten). */
  cancelarMeta?: Record<string, unknown>
  /** Un error que dice que falta iniciar sesión, en palabras de Sloth. */
  sinCuenta: string
  /** Los modelos que dio la sesión, para guardarlos (Antigravity no tiene otra forma de listarlos). */
  alVerModelos?(opciones: OpcionAcp[]): void
  /**
   * Un solo proceso para todos sus hilos, cada uno en su sesión (Antigravity: cada proceso desempaca cientos de MB y
   * tarda unos 40 s en arrancar). Sigue vivo `SIN_HILOS` después de que se cierra el último, para el que venga.
   */
  compartido?: boolean
  /** Lo que se espera sin novedades para dar por acabado un turno que abrió solo, en ms (60 s si no se dice). */
  silencio?: number
  /** Si tarda en arrancar: lo que se espera que tarde, en ms, para la barra del hilo, y lo que tardó. */
  arranque?: { dura(): number; medido(ms: number): void }
  /** Una línea que no es del protocolo. */
  alTexto?(linea: string): void
}

export interface OpcionAcp {
  id: string
  category?: string
  type?: string
  currentValue?: string
  options?: ({ value: string; name?: string } | { group?: string; name?: string; options: { value: string; name?: string }[] })[]
}

/** Las opciones de un select de ACP, aunque vengan en grupos. */
export const valoresDe = (o?: OpcionAcp) => (o?.options ?? []).flatMap((x) => ('options' in x ? x.options : [x]))

const CERO: Tokens = { input: 0, output: 0, cacheRead: 0 }

/** Un proceso del agente con su `initialize` (y su inicio de sesión), y las sesiones que lo usan, por su id. */
export interface Conexion {
  rpc: RpcLineas
  ini: Promise<any>
  /** Cuándo se lanzó, y si ya acabó de arrancar. */
  desde: number
  lista?: boolean
  sesiones: Map<string, (method: string, params: any) => void>
  cierres: Set<(error?: Error) => void>
  usos: number
  reloj?: ReturnType<typeof setTimeout>
}

/** Las de los sabores `compartido`, por su prefijo, mientras vivan. */
const compartidas = new Map<string, Conexion>()
const SIN_HILOS = 10 * 60_000
process.once('exit', () => compartidas.forEach((c) => c.rpc.close(true)))

/** Cierra el proceso compartido, con los hilos que lleve: al cambiar la cuenta ya no vale. */
export const cerrarCompartida = (sabor: SaborAcp) => compartidas.get(sabor.prefijo)?.rpc.close()

/** La conexión para un hilo: la compartida si la hay y sigue viva, o un proceso nuevo. `lanzar` puede fallar. */
export function conectar(sabor: SaborAcp, opts: AgentOptions): Conexion {
  const viva = sabor.compartido ? compartidas.get(sabor.prefijo) : undefined
  if (viva && !viva.rpc.terminado) {
    clearTimeout(viva.reloj)
    viva.usos++
    return viva
  }
  const l = sabor.lanzar(opts)
  const c = { desde: Date.now(), sesiones: new Map(), cierres: new Set(), usos: 1 } as unknown as Conexion
  // El compartido no es de la carpeta de ningún hilo: cada sesión lleva la suya.
  c.rpc = new RpcLineas(sabor.nombre, l.command, l.args, { cwd: sabor.compartido ? tmpdir() : opts.cwd, env: l.env }, {
    alAvisar: (method, params) => c.sesiones.get(params?.sessionId)?.(method, params),
    alPedir: (method, params) => pedir(sabor, method, params),
    alTexto: sabor.alTexto,
    alCerrar(error) {
      l.alCerrar?.()
      if (compartidas.get(sabor.prefijo) === c) compartidas.delete(sabor.prefijo)
      for (const f of [...c.cierres]) f(error)
    }
  })
  c.ini = (async () => {
    const ini = await c.rpc.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: !!sabor.leeArchivos, writeTextFile: false }, terminal: false },
      clientInfo: sabor.clientInfo ?? { name: 'sloth', version: '1' }
    }, 180_000)
    if (sabor.autenticar) await c.rpc.request('authenticate', { methodId: sabor.autenticar }, 300_000)
    c.lista = true
    return ini
  })()
  // Si no arranca (sin cuenta), el siguiente hilo prueba con otro proceso.
  c.ini.catch(() => compartidas.get(sabor.prefijo) === c && compartidas.delete(sabor.prefijo))
  if (sabor.compartido) compartidas.set(sabor.prefijo, c)
  return c
}

/** Un hilo deja la conexión: la suya se cierra; la compartida, un rato después del último. */
export function soltar(sabor: SaborAcp, c: Conexion) {
  if (--c.usos > 0) return
  // La que no arrancó ya no es la compartida: se cierra ya.
  if (!sabor.compartido || compartidas.get(sabor.prefijo) !== c) return c.rpc.close()
  c.reloj = setTimeout(() => c.rpc.close(), SIN_HILOS)
  c.reloj.unref()
}

/** Lo que el agente le pide a Sloth, de cualquier sesión. */
async function pedir(sabor: SaborAcp, method: string, params: any) {
  if (method === 'session/request_permission') {
    // Sin permisos, como con Claude y Codex: una vez (las de «siempre» se guardan en el proyecto).
    const ops: { optionId: string; kind: string }[] = params?.options ?? []
    const elegida = ops.find((o) => o.kind === 'allow_once') ?? ops.find((o) => o.kind === 'allow_always')
    return elegida ? { outcome: { outcome: 'selected', optionId: elegida.optionId } } : { outcome: { outcome: 'cancelled' } }
  }
  if (method === 'fs/read_text_file' && sabor.leeArchivos) {
    const lineas = readFileSync(params.path, 'utf8').split('\n')
    const desde = Math.max(0, (params.line ?? 1) - 1)
    return { content: lineas.slice(desde, params.limit ? desde + params.limit : undefined).join('\n') }
  }
  // Las preguntas con formulario: la interfaz no sabe contestarlas, y el turno se quedaría esperando.
  if (/ask_user_question|exit_plan_mode/.test(method)) return { outcome: 'cancelled' }
  throw new Error('Sloth no admite esta petición. Pregunta al usuario con un mensaje normal.')
}

/** El nombre y la entrada de una herramienta de ACP, como las de Claude que ya dibuja la interfaz. */
function herramienta(t: { kind?: string; title?: string; rawInput?: any; locations?: { path: string }[] }): { name: string; input: unknown } {
  const r = t.rawInput && typeof t.rawInput === 'object' ? t.rawInput : {}
  const ruta = t.locations?.[0]?.path ?? r.path ?? r.file_path ?? r.filePath ?? r.AbsolutePath ?? r.TargetFile
  const titulo = t.title ?? ''
  if (/^mcp__/.test(titulo)) return { name: titulo.split(/\s/)[0], input: r }
  switch (t.kind) {
    case 'execute':
      return { name: 'Bash', input: { command: r.command ?? r.CommandLine ?? r.cmd ?? titulo, description: titulo } }
    case 'edit':
    case 'delete':
    case 'move':
      return { name: 'Edit', input: { ...r, file_path: ruta ?? titulo } }
    case 'read':
      return { name: 'Read', input: { ...r, file_path: ruta ?? titulo } }
    case 'search':
      return { name: 'Grep', input: { pattern: r.pattern ?? r.query ?? titulo, path: ruta } }
    case 'fetch':
      return { name: 'WebFetch', input: { url: r.url ?? titulo, prompt: titulo } }
  }
  return { name: titulo || 'Herramienta', input: r }
}

/** El texto de lo que devolvió una herramienta de ACP. */
function salida(u: { content?: any[]; rawOutput?: unknown }): string {
  const partes = (u.content ?? []).map((c) => (c.type === 'content' && c.content?.type === 'text' ? c.content.text : c.type === 'diff' ? `${c.path}` : ''))
  const texto = partes.filter(Boolean).join('\n')
  if (texto) return texto
  if (typeof u.rawOutput === 'string') return u.rawOutput
  return u.rawOutput ? JSON.stringify(u.rawOutput, null, 2) : ''
}

export function startAcp(sabor: SaborAcp, opts: AgentOptions): AgentRun {
  const emit = (e: AgentEvent) => opts.onEvent(e)
  const modelo = opts.model.slice(sabor.prefijo.length + 1)
  let con: Conexion | undefined
  let sesion = ''
  let cerrado = false
  let busy = false
  /** Si hay un `session/prompt` sin contestar: el turno lo cierra su respuesta. */
  let pidiendo = false
  /** En un turno que abrió el agente solo: las herramientas sin acabar y el reloj del silencio (`vigilar`). */
  const abiertas = new Set<string>()
  let reloj: ReturnType<typeof setTimeout> | undefined
  /** Cuándo se lanzó el proceso, si aún no había arrancado: su primer mensaje enseña la barra (`arranque`). */
  let arrancando = 0
  /** Hasta que no llega la respuesta de `session/load`, lo que manda es el historial que repite: no se dibuja. */
  let cargando = false
  let detenido = false
  let primero = true
  let ventana = 0
  /** El número del mensaje del turno: cada herramienta abre otro, para que el texto de después no se pegue al de antes. */
  let parte = 0
  let turno = 0
  let pendiente: { text: string; images: string[] }[] = []
  let tokens = CERO
  let costo = 0

  const terminar = (ok: boolean, error?: string) => {
    if (!busy) return
    busy = false
    emit({ t: 'turn_end', at: Date.now(), ok, error, tokens, ...(costo ? { costUsd: costo } : {}) })
    tokens = CERO
    costo = 0
  }

  function oir(method: string, p: any) {
    if (method !== 'session/update') return oirVendedor(method, p)
    if (p?.sessionId !== sesion || cargando) return
    const u = p.update ?? {}
    if (u._meta?.isReplay) return
    // Lo que manda solo, sin un mensaje de Sloth (termina algo de fondo y sigue): es un turno suyo.
    if (!busy && ['agent_message_chunk', 'agent_thought_chunk', 'tool_call'].includes(u.sessionUpdate)) {
      busy = true
      turno++
      abiertas.clear()
      emit({ t: 'turn_start', at: Date.now() })
    }
    if (u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') {
      if (u.status === 'completed' || u.status === 'failed') abiertas.delete(u.toolCallId)
      else if (u.sessionUpdate === 'tool_call') abiertas.add(u.toolCallId)
    }
    if (busy && !pidiendo) vigilar()
    const total = u._meta?.totalTokens
    if (typeof total === 'number' && ventana) emit({ t: 'context', used: total, max: ventana })
    switch (u.sessionUpdate) {
      case 'agent_message_chunk':
      case 'agent_thought_chunk': {
        const texto = u.content?.type === 'text' ? u.content.text : ''
        if (texto) emit({ t: u.sessionUpdate === 'agent_message_chunk' ? 'text' : 'thinking', id: `${turno}:${parte}${u.sessionUpdate === 'agent_thought_chunk' ? ':pensamiento' : ''}`, delta: texto })
        return
      }
      case 'tool_call': {
        parte++
        const h = herramienta(u)
        emit({ t: 'tool', id: u.toolCallId, name: h.name, input: h.input })
        if (u.status === 'completed' || u.status === 'failed') emit({ t: 'tool_update', id: u.toolCallId, done: true, error: u.status === 'failed', output: salida(u) })
        return
      }
      case 'tool_call_update':
        if (u.status === 'completed' || u.status === 'failed') emit({ t: 'tool_update', id: u.toolCallId, done: true, error: u.status === 'failed', output: salida(u) })
        return
      case 'plan':
        // Como la lista de tareas de Claude (TodoWrite), que la interfaz ya dibuja.
        parte++
        emit({ t: 'tool', id: `plan:${turno}:${parte}`, name: 'TodoWrite', input: { todos: (u.entries ?? []).map((e: any) => ({ content: e.content, status: e.status === 'in_progress' ? 'in_progress' : e.status })) } })
        emit({ t: 'tool_update', id: `plan:${turno}:${parte}`, done: true, output: '' })
        return
      case 'usage_update':
        if (typeof u.used === 'number' && typeof u.size === 'number') {
          ventana = u.size
          emit({ t: 'context', used: u.used, max: u.size })
        }
        return
    }
  }

  /** Los tokens y el costo de un turno, como los da Grok. */
  function contar(u: any) {
    if (!u) return
    const cache = (u.cachedReadTokens ?? 0) + (u.cacheCreationTokens ?? 0)
    tokens = { input: tokens.input + Math.max(0, (u.inputTokens ?? 0) - cache) + (u.cacheCreationTokens ?? 0), output: tokens.output + (u.outputTokens ?? 0), cacheRead: tokens.cacheRead + (u.cachedReadTokens ?? 0) }
    // Grok cuenta el costo en diezmilmillonésimas de dólar.
    if (typeof u.costUsdTicks === 'number') costo += u.costUsdTicks / 10_000_000_000
  }

  /** Cierra un turno que el agente abrió solo. Lo que escribiste mientras va después, como en `mandar`. */
  function cerrarSolo(fin?: string) {
    clearTimeout(reloj)
    const siguiente = pendiente.shift()
    if (siguiente && !detenido) return void mandar(siguiente.text, siguiente.images)
    const fallo = fin === 'error'
    terminar(!detenido && !fallo && fin !== 'cancelled', detenido || fin === 'cancelled' ? 'lo detuviste' : fallo ? `${sabor.nombre} falló.` : undefined)
  }

  // Un turno que el agente abrió solo (una tarea de fondo que terminó y lo despertó) no tiene `session/prompt` que conteste.
  // Grok lo cierra con este aviso. Antigravity no avisa, y un aviso que cambie no debe dejar el hilo trabajando para
  // siempre: sin novedades ni herramientas abiertas durante `silencio`, se da por acabado. Si sigue, abre otro turno.
  function oirVendedor(method: string, p: any) {
    const u = p?.update
    if (method !== '_x.ai/session_notification' || u?.sessionUpdate !== 'turn_completed' || p.sessionId !== sesion) return
    if (!busy || pidiendo || !String(u.prompt_id ?? '').startsWith('task-completed-')) return
    contar(u.usage)
    cerrarSolo(u.stop_reason)
  }

  function vigilar() {
    clearTimeout(reloj)
    reloj = setTimeout(() => busy && !pidiendo && !abiertas.size && cerrarSolo(), sabor.silencio ?? 60_000)
    reloj.unref()
  }

  /** Se cerró el proceso (también el compartido, con todos sus hilos) o este hilo lo dejó (`close`). */
  function alCerrar(error?: Error) {
    const habia = busy
    if (busy) {
      busy = false
      emit({ t: 'turn_end', at: Date.now(), ok: false, error: detenido ? 'lo detuviste' : (error?.message ?? `Se cerró ${sabor.nombre}.`), caida: !detenido })
    }
    opts.onExit?.(cerrado || !error ? undefined : { error: error.message, turno: habia })
  }

  const ready = (async () => {
    const c = conectar(sabor, opts)
    con = c
    if (sabor.arranque && !c.lista) arrancando = c.desde
    c.cierres.add(alCerrar)
    const r = c.rpc
    const ini = await c.ini
    // Los MCP de Sloth, como los pide ACP 1: `env` es una lista.
    const mcpServers = Object.entries(mcpSloth(opts.lote, opts.hilo)).map(([name, s]) => ({ name, command: s.command, args: s.args ?? [], env: Object.entries(s.env ?? {}).map(([n, value]) => ({ name: n, value })) }))
    let abierta: { sessionId?: string; configOptions?: OpcionAcp[]; models?: { availableModels?: { modelId: string; _meta?: any }[] } } | undefined
    if (opts.resume) {
      const cap = ini?.agentCapabilities ?? {}
      const metodo = cap.sessionCapabilities?.resume ? 'session/resume' : cap.loadSession ? 'session/load' : ''
      if (metodo) {
        cargando = true
        c.sesiones.set(opts.resume, oir)
        abierta = await r.request(metodo, { sessionId: opts.resume, cwd: opts.cwd, mcpServers }, 120_000).then(
          (x) => ({ ...x, sessionId: opts.resume }),
          () => void c.sesiones.delete(opts.resume!)
        )
        cargando = false
      }
    }
    if (!abierta) {
      try {
        abierta = await r.request('session/new', { cwd: opts.cwd, mcpServers }, 120_000)
      } catch (e: any) {
        throw new Error(e?.code === -32000 ? sabor.sinCuenta : e.message)
      }
    }
    sesion = abierta!.sessionId!
    // Si el hilo se cerró mientras se abría, su sesión no escucha nada.
    if (cerrado) return void c.sesiones.delete(sesion)
    c.sesiones.set(sesion, oir)
    opts.onProviderSession(sesion)
    let config = abierta!.configOptions ?? []
    if (config.length) sabor.alVerModelos?.(config)
    const elegir = async (categoria: string, valor: string | undefined) => {
      const o = config.find((x) => x.category === categoria || x.id === categoria)
      if (!o || !valor || o.currentValue === valor || !valoresDe(o).some((v) => v.value === valor)) return !!o
      const res = await r.request('session/set_config_option', { sessionId: sesion, configId: o.id, value: valor })
      config = res?.configOptions ?? config
      return true
    }
    if (sabor.modo) await elegir('mode', sabor.modo).catch(() => {})
    if (!(await elegir('model', modelo).catch(() => false)) && modelo) await r.request('session/set_model', { sessionId: sesion, modelId: modelo }).catch(() => {})
    if (opts.effort) await elegir('thought_level', opts.effort).catch(() => {})
    ventana = abierta!.models?.availableModels?.find((m) => m.modelId === modelo)?._meta?.totalContextTokens ?? ventana
  })()
  void ready.catch(() => {})

  function bloques(text: string, images: string[]) {
    const texto = conRutas(primero ? `<sloth>\n${INSTRUCCIONES}\n</sloth>\n\n${text}` : text, images)
    primero = false
    return [
      { type: 'text', text: texto },
      ...images.map((p) => ({ type: 'image', mimeType: IMAGE_TYPES[extname(p).toLowerCase()] ?? 'image/png', data: readFileSync(p).toString('base64') }))
    ]
  }

  /** Un mensaje: abre su turno y lo cierra con lo que diga el agente. Lo que llegue mientras, va después (`pendiente`). */
  async function mandar(text: string, images: string[]) {
    const desde = arrancando
    arrancando = 0
    if (desde) emit({ t: 'arranque', nombre: sabor.nombre, desde, dura: sabor.arranque!.dura() })
    try {
      await ready
    } catch (e) {
      busy = true
      return terminar(false, e instanceof Error ? e.message : String(e))
    }
    if (cerrado) return
    if (desde) {
      sabor.arranque!.medido(Date.now() - desde)
      emit({ t: 'arranque', nombre: sabor.nombre, desde, dura: 0, listo: true })
    }
    busy = true
    const mio = ++turno
    parte = 0
    pidiendo = true
    try {
      const res = await con!.rpc.request('session/prompt', { sessionId: sesion, prompt: bloques(text, images) }, 0)
      pidiendo = false
      // Uno que se dio por detenido sin que el agente cortara (`interrupt`): lo de ahora ya es de otro turno.
      if (turno !== mio) return
      contar(res?._meta?.usage)
      const siguiente = pendiente.shift()
      if (siguiente && !detenido) return void (await mandar(siguiente.text, siguiente.images))
      const fin = res?.stopReason
      terminar(fin !== 'refusal' && fin !== 'cancelled' && fin !== 'error', fin === 'cancelled' ? 'lo detuviste' : fin === 'refusal' ? `${sabor.nombre} se negó a seguir.` : fin === 'rate_limit' ? `Llegaste al límite de uso de ${sabor.nombre}. Espera o revisa tu plan.` : undefined)
    } catch (e: any) {
      pidiendo = false
      if (turno !== mio) return
      pendiente = []
      terminar(false, detenido ? 'lo detuviste' : e?.code === -32000 ? sabor.sinCuenta : e instanceof Error ? e.message : String(e))
    }
  }

  return {
    send(text, skill?: SkillRef, images = []) {
      detenido = false
      let texto: string
      try {
        texto = conSkill(text, skill)
      } catch (e) {
        busy = true
        return terminar(false, e instanceof Error ? e.message : String(e))
      }
      void mandar(texto, images)
    },
    // ACP no mete mensajes en un turno en curso: va en cuanto acabe, dentro del mismo turno de Sloth.
    steer(text, images = []) {
      if (busy) pendiente.push({ text, images })
      else void mandar(text, images)
    },
    compact() {
      void mandar('/compact', [])
    },
    async interrupt() {
      detenido = true
      pendiente = []
      await ready.catch(() => {})
      if (!con || !sesion) return
      con.rpc.notify('session/cancel', { sessionId: sesion, ...(sabor.cancelarMeta ? { _meta: sabor.cancelarMeta } : {}) })
      // Si en 15 segundos no corta, se cierra su proceso y el siguiente mensaje retoma la sesión. El compartido no, que
      // cortaría a los demás hilos: el turno se da por detenido.
      const c = con
      const mio = turno
      setTimeout(() => {
        if (!busy || turno !== mio || cerrado) return
        if (sabor.compartido) terminar(false, 'lo detuviste')
        else c.rpc.close()
      }, 15_000).unref()
    },
    close() {
      if (cerrado) return
      cerrado = true
      const c = con
      if (!c) return
      if (busy && sesion) c.rpc.notify('session/cancel', { sessionId: sesion, ...(sabor.cancelarMeta ? { _meta: sabor.cancelarMeta } : {}) })
      c.sesiones.delete(sesion)
      c.cierres.delete(alCerrar)
      alCerrar()
      soltar(sabor, c)
    }
  }
}
