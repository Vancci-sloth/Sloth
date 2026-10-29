import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { OpenCode, type OpenCodeClient, type OpenCodeEvent } from '@opencode/client'
import type { Model, Tokens } from '../shared/types.ts'
import type { AgentOptions, AgentRun, SkillRef } from './agent.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { OPCIONES } from './claude.ts'
import { navegadorAgente } from './navegador-agente.ts'
import { mcpVoz } from './voz/index.ts'
import { SKILLS } from './skills.ts'

/**
 * OpenCode 2 (`opencode serve`), la versión gratis de Sloth: trabaja con la cuenta de OpenCode de cada quien, que se crea
 * gratis (`server/cuenta-opencode.ts`); sus modelos gratis no cobran nada y los de pago, del saldo de la cuenta. Como lo
 * hace T3 Code (`packages/provider-opencode/src/server/v2`): un solo servidor para todos los hilos, cada hilo una sesión
 * en su carpeta (`location`), y lo de cada hilo va en su sesión: las instrucciones de Sloth
 * (`session.instructions.entry.put`) y su navegador, un MCP con su nombre (`mcp.add`) que las reglas de la sesión dejan
 * usar solo a ese hilo. Un servidor por hilo chocaría en la base SQLite que comparten.
 *
 * Lo de OpenCode (sus sesiones, su caché) vive en `data/opencode`, no en el OpenCode que tenga instalado el usuario: así
 * no se toca su configuración ni su base, que OpenCode 2 convierte a su formato al abrirla.
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATOS = join(APP, 'data', 'opencode')
/**
 * Los modelos de Zen y, si la cuenta tiene Go, los de Go: los de otros proveedores salen si el entorno trae su llave (la
 * de Google, por ejemplo), y no se cobrarían en la cuenta de OpenCode.
 */
const ZEN = ['opencode', 'opencode-go']
/** La integración de la cuenta de OpenCode (su consola): la que se conecta en el navegador. */
export const CONSOLA = 'opencode'

/** Lo que Sloth le dice al agente, como a Codex (`developerInstructions`). */
const INSTRUCCIONES = `${OPCIONES}
La interfaz y tus respuestas van en español, también lo que dices mientras trabajas (en una prueba con Big Pickle, las notas de avance salían en inglés). Haz las preguntas en mensajes normales, sin herramientas de preguntas interactivas. Las skills de Sloth están en ${SKILLS}. La skill invocada es siempre la de esa carpeta: si ves otra con el mismo nombre, es una copia vieja y no se usa. Respeta la skill invocada y lee sus referencias cuando hagan falta.`

/**
 * Sloth no pide permisos (como Claude con `bypassPermissions` y Codex con `approvalPolicy: never`). La pregunta interactiva
 * se niega: dejaría el turno esperando una respuesta que la interfaz no sabe dar. La última regla que coincide manda.
 */
const REGLAS = [
  { action: '*', resource: '*', effect: 'allow' as const },
  { action: 'question', resource: '*', effect: 'deny' as const }
]

/**
 * La configuración del servidor: sin formateadores ni LSP que toquen o bajen nada, y sin copias de la carpeta del video.
 * Sin búsqueda web: sin cuenta, OpenCode no tiene buscador («Web search provider is required»), y el modelo perdía turnos
 * en ella; lee la web con WebFetch y el navegador.
 */
const CONFIG = { permissions: REGLAS, skills: [SKILLS], share: 'disabled', snapshots: false, lsp: false, formatter: false, websearch: false }

interface Servidor {
  client: OpenCodeClient
  proc: ChildProcess
  /** Lo que escucha cada sesión de Sloth, por su id. */
  oyentes: Map<string, (e: Evento) => void>
  /** La sesión de Sloth de cada subagente (sesión hija), hasta la del agente principal. */
  raiz: Map<string, string>
}

let servidor: Promise<Servidor> | null = null

/** El servidor de OpenCode, que se abre la primera vez que hace falta (y se baja, si falta). */
export function conexion(): Promise<Servidor> {
  servidor ??= abrir().catch((error) => {
    servidor = null
    throw error
  })
  return servidor
}

async function abrir(): Promise<Servidor> {
  const exe = await asegurarAgente('opencode')
  const password = randomBytes(24).toString('base64url')
  const xdg = Object.fromEntries(['DATA', 'CONFIG', 'CACHE', 'STATE'].map((k) => [`XDG_${k}_HOME`, join(DATOS, k.toLowerCase())]))
  for (const dir of Object.values(xdg)) mkdirSync(dir, { recursive: true })
  // OPENCODE_PASSWORD manda sobre la de 1.x, que no se hereda (T3 Code, `serverEnvironment`).
  const { OPENCODE_SERVER_PASSWORD: _, OPENCODE_CONFIG_CONTENT: __, ...env } = process.env
  const proc = spawn(exe, ['serve', '--hostname=127.0.0.1', '--port=0'], {
    env: { ...env, ...xdg, OPENCODE_PASSWORD: password, OPENCODE_CONFIG_CONTENT: JSON.stringify(CONFIG) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const url = await new Promise<string>((ok, mal) => {
    let salida = ''
    const reloj = setTimeout(() => mal(new Error('OpenCode tardó demasiado en arrancar.')), 60_000)
    const leer = (d: Buffer) => {
      // Solo hasta saber la dirección: luego se drena sin guardar, para que no se llenen los tubos.
      if (salida === null) return
      salida = (salida + d).slice(-64 * 1024)
      const m = /listening on\s+(https?:\/\/\S+)/i.exec(salida)
      if (m) {
        clearTimeout(reloj)
        ok(m[1])
      }
    }
    proc.stdout!.on('data', leer)
    proc.stderr!.on('data', leer)
    proc.once('error', (e) => (clearTimeout(reloj), mal(e)))
    proc.once('exit', (code) => (clearTimeout(reloj), mal(new Error(`OpenCode se cerró al arrancar (código ${code}): ${salida.trim().slice(-600)}`))))
  })
  const client = OpenCode.make({ baseUrl: url, headers: { authorization: `Basic ${Buffer.from(`opencode:${password}`, 'utf8').toString('base64')}` } })
  await client.server.info()
  const s: Servidor = { client, proc, oyentes: new Map(), raiz: new Map() }
  const corte = new AbortController()
  const cerrar = () => proc.kill()
  process.once('exit', cerrar)
  proc.once('exit', () => {
    process.off('exit', cerrar)
    corte.abort()
    if (servidor) servidor = null
    for (const oye of s.oyentes.values()) oye({ type: 'sloth.caida', data: {} } as never)
    s.oyentes.clear()
  })
  void (async () => {
    try {
      for await (const e of client.event.subscribe({ signal: corte.signal })) repartir(s, e)
    } catch {
      // Se cerró el servidor o se cortó la conexión: `exit` avisa a las sesiones.
    }
    proc.kill()
  })()
  return s
}

/** Cada evento a su sesión de Sloth: el de un subagente, a la del agente que lo lanzó. */
function repartir(s: Servidor, e: OpenCodeEvent) {
  const d = (e as { data?: { sessionID?: string; parentID?: string; form?: { sessionID?: string } } }).data
  // El de un formulario va dentro de él.
  const id = d?.sessionID ?? d?.form?.sessionID
  if (!d || !id) return
  if (e.type === 'session.created' && d.parentID) {
    const raiz = s.oyentes.has(d.parentID) ? d.parentID : s.raiz.get(d.parentID)
    if (raiz) s.raiz.set(id, raiz)
  }
  const raiz = s.oyentes.has(id) ? id : s.raiz.get(id)
  if (raiz) s.oyentes.get(raiz)?.(e as Evento)
}

type Evento = OpenCodeEvent & { data: Record<string, any> }

/** `opencode:opencode/big-pickle` → el proveedor y el modelo de OpenCode. */
function modeloDe(model: string) {
  const [providerID, ...resto] = model.replace(/^opencode:/, '').split('/')
  return { providerID, id: resto.join('/') }
}

/** Los nombres de herramientas de OpenCode, como los de Claude que ya dibuja la interfaz, y sus entradas igual. */
function herramienta(nombre: string, input: Record<string, any>, mcp: string): { name: string; input: unknown } {
  const ruta = input.filePath ?? input.file_path ?? input.path
  switch (nombre) {
    case 'shell':
    case 'bash':
      return { name: 'Bash', input: { command: input.command, description: input.description } }
    case 'read':
      return { name: 'Read', input: { ...input, file_path: ruta } }
    case 'write':
      return { name: 'Write', input: { ...input, file_path: ruta } }
    case 'edit':
    case 'patch':
    case 'multiedit':
      return { name: 'Edit', input: { ...input, file_path: ruta } }
    case 'grep':
      return { name: 'Grep', input }
    case 'glob':
      return { name: 'Glob', input }
    case 'webfetch':
      return { name: 'WebFetch', input }
    case 'websearch':
      return { name: 'WebSearch', input }
    case 'todowrite':
      return { name: 'TodoWrite', input }
    case 'skill':
      return { name: 'Skill', input: { ...input, skill: input.name ?? input.id } }
    case 'subagent':
    case 'task':
      return { name: 'Agent', input: { ...input, description: input.description ?? input.title } }
  }
  // Las de un MCP del hilo: `<servidor>_<herramienta>`, como `mcp__<servidor>__<herramienta>` en Claude.
  const m = new RegExp(`^${mcp}-([^_]+)_(.+)$`).exec(nombre)
  return { name: m ? `mcp__${m[1]}__${m[2]}` : nombre, input }
}

/** El texto de lo que devolvió una herramienta. */
const textoDe = (content?: { type: string; text?: string }[]) => (content ?? []).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n')

export function startOpenCode(opts: AgentOptions, conectar: () => Promise<Servidor> = conexion): AgentRun {
  let sesion = ''
  let busy = false
  let cerrado = false
  let serie = Promise.resolve()
  let servidorDe: Servidor | undefined
  /** Lo que gastó el turno, paso a paso, también lo de sus subagentes. */
  let tokens: Tokens = CERO
  let costo = 0
  let errorTurno: string | undefined
  let detenido = false
  /** Compactando a pedido (`compact`): el turno acaba con la compactación. */
  let compactando = false
  const { providerID, id: modelo } = modeloDe(opts.model)
  let ventana = 0
  // El nombre de los MCP del hilo: `sloth-<hilo>-<nombre>`. OpenCode esconde los nombres de más de 64 letras.
  const mcp = `sloth-${(opts.hilo ?? randomBytes(4).toString('hex')).replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 24)}`
  // El navegador y la voz: las herramientas de Ideas corren dentro del servidor de Sloth (como con Codex, no llegan).
  const servidoresMcp = { ...navegadorAgente(opts.lote, opts.hilo), ...mcpVoz() }
  const reglas = [...REGLAS, { action: 'sloth-*', resource: '*', effect: 'deny' as const }, { action: `${mcp}-*`, resource: '*', effect: 'allow' as const }]
  const emit = opts.onEvent
  // Lo que va llegando a trozos, por id; las herramientas, con su nombre hasta que llega su entrada.
  const textos = new Map<string, string>()
  const nombres = new Map<string, string>()
  const herramientas = new Set<string>()
  /** Los subagentes que trabajan: la herramienta que lo lanzó (su fila), por su sesión, y su título. */
  const subagentes = new Map<string, { fila: string; titulo: string }>()
  /** Las filas de subagente que aún no tienen sesión, por la sesión que las lanzó. */
  const sinSesion = new Map<string, string[]>()

  const segundoPlano = () => emit({ t: 'background', tasks: [...subagentes.values()].map((s) => s.titulo) })
  const terminar = (ok: boolean, error?: string, caida?: boolean) => {
    if (!busy) return
    busy = false
    emit({ t: 'turn_end', at: Date.now(), ok, error, caida, tokens, costUsd: costo })
    tokens = CERO
    costo = 0
  }

  function oir(e: Evento) {
    const d = e.data
    if (e.type === ('sloth.caida' as string)) {
      const turno = busy
      terminar(false, 'Se cerró OpenCode.', true)
      opts.onExit?.(cerrado ? undefined : { error: 'Se cerró OpenCode.', turno })
      subagentes.clear()
      segundoPlano()
      return
    }
    const propio = d.sessionID === sesion || d.form?.sessionID === sesion
    const hijo = propio ? undefined : subagentes.get(d.sessionID ?? d.form?.sessionID)
    if (!propio && e.type === 'session.created' && d.parentID) {
      // Un subagente nuevo: cuelga de la herramienta que lo lanzó en su sesión madre.
      const fila = sinSesion.get(d.parentID)?.shift()
      if (fila) {
        subagentes.set(d.sessionID, { fila, titulo: d.title ?? 'Subagente de OpenCode' })
        emit({ t: 'subagent', id: fila, status: 'running', at: Date.now() })
        segundoPlano()
      }
      return
    }
    const suyo = hijo ? { parent: hijo.fila } : {}
    const clave = (x: string) => `${d.sessionID}:${x}`
    // El texto y el razonamiento de un mensaje se numeran aparte, los dos desde 0, y se cruzan (el razonamiento puede
    // acabar con el texto ya empezado): cada uno va con su id, como el `:pensamiento` de Codex.
    const delMensaje = () => clave(`${d.assistantMessageID}:${d.ordinal}${e.type.startsWith('session.reasoning.') ? ':pensamiento' : ''}`)
    switch (e.type) {
      case 'session.text.delta':
      case 'session.reasoning.delta': {
        const id = delMensaje()
        textos.set(id, (textos.get(id) ?? '') + d.delta)
        if (d.delta) emit({ t: e.type === 'session.text.delta' ? 'text' : 'thinking', id, delta: d.delta, ...suyo })
        return
      }
      case 'session.text.ended':
      case 'session.reasoning.ended': {
        // El texto entero: lo que no llegó a trozos (si llegó alguno) se completa.
        const id = delMensaje()
        const previo = textos.get(id) ?? ''
        const falta = typeof d.text === 'string' && d.text.startsWith(previo) ? d.text.slice(previo.length) : ''
        if (falta) emit({ t: e.type === 'session.text.ended' ? 'text' : 'thinking', id, delta: falta, ...suyo })
        textos.delete(id)
        return
      }
      case 'session.tool.input.started':
        nombres.set(clave(d.id), d.name)
        return
      case 'session.tool.called': {
        const id = clave(d.id)
        if (herramientas.has(id)) return
        herramientas.add(id)
        const nombre = nombres.get(id) ?? 'herramienta'
        const h = herramienta(nombre, d.input ?? {}, mcp)
        emit({ t: 'tool', id, name: h.name, input: h.input, ...suyo })
        if (h.name === 'Agent') sinSesion.set(d.sessionID, [...(sinSesion.get(d.sessionID) ?? []), id])
        return
      }
      case 'session.tool.success':
      case 'session.tool.failed': {
        const id = clave(d.id)
        const error = e.type === 'session.tool.failed'
        emit({ t: 'tool_update', id, done: true, output: textoDe(d.content) || (error ? d.error?.message : '') || '', error })
        herramientas.delete(id)
        nombres.delete(id)
        // Si era la de un subagente, ese subagente acabó.
        for (const [s, sub] of subagentes) {
          if (sub.fila !== id) continue
          subagentes.delete(s)
          emit({ t: 'subagent', id, status: error ? 'failed' : 'completed', at: Date.now() })
          segundoPlano()
        }
        return
      }
      case 'session.step.ended':
      case 'session.step.failed': {
        const t = d.tokens
        if (t) {
          tokens = suma(tokens, { input: t.input, output: t.output + t.reasoning, cacheRead: t.cache.read })
          if (propio && ventana) emit({ t: 'context', used: t.input + t.cache.read + t.cache.write + t.output, max: ventana })
        }
        costo += d.cost ?? 0
        if (e.type === 'session.step.failed' && propio) errorTurno = d.error?.message
        return
      }
      case 'session.retry.scheduled':
        if (propio) emit({ t: 'info', text: `${sinUsoGratis(d.error) ? 'Se acabó tu uso gratis de OpenCode' : limite(d.error) ? 'El modelo gratis está saturado' : 'OpenCode no pudo hablar con el modelo'}; vuelve a intentarlo ${new Date(d.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.` })
        return
      case 'session.compaction.ended':
      case 'session.compaction.failed':
        if (!propio) return
        if (compactando) {
          compactando = false
          terminar(e.type === 'session.compaction.ended', e.type === 'session.compaction.failed' ? 'OpenCode no pudo compactar el contexto.' : undefined)
        } else if (e.type === 'session.compaction.ended') emit({ t: 'info', text: 'OpenCode compactó el contexto para continuar.' })
        return
      case 'form.created':
        // Un formulario que pide elegir algo (un buscador, una respuesta): la interfaz no sabe contestarlo y el turno se
        // quedaría esperando. Se cancela y el agente sigue sin eso.
        void servidorDe?.client.session.form.cancel({ sessionID: d.form.sessionID, formID: d.form.id, message: 'Sloth no puede contestar formularios. Sigue sin esto, o pregúntaselo al usuario en un mensaje normal.' }).catch(() => {})
        return
      case 'permission.asked':
        // Con las reglas no debería pedir nada; si lo pide (una regla de OpenCode que va antes), se acepta como Codex.
        void servidorDe?.client.permission.reply({ sessionID: d.sessionID, requestID: d.id, decision: 'once' }).catch(() => {})
        return
      case 'session.execution.started':
        if (propio && !busy) {
          busy = true
          emit({ t: 'turn_start', at: Date.now() })
        }
        return
      case 'session.execution.succeeded':
        if (propio) terminar(true)
        return
      case 'session.execution.failed':
        if (propio) terminar(false, errorDe(d.error, errorTurno))
        return
      case 'session.execution.interrupted':
        if (propio) terminar(false, detenido || d.reason === 'user' ? 'lo detuviste' : `OpenCode cortó el turno (${d.reason}).`)
        return
    }
  }

  const ready = (async () => {
    const s = await conectar()
    servidorDe = s
    if (cerrado) return
    const c = s.client
    const location = { directory: opts.cwd }
    const lista = await c.model.list({ location }).catch(() => undefined)
    ventana = lista?.data.find((m) => m.providerID === providerID && m.id === modelo)?.limit.context ?? 0
    let viva = opts.resume ? await c.session.get({ sessionID: opts.resume }).then((x) => x.id, () => '') : ''
    if (!viva) {
      // Con título: si no, OpenCode gasta una llamada al modelo en ponerle uno.
      const nueva = await c.session.create({ location, title: 'Sloth', model: { providerID, id: modelo, ...(opts.effort ? { variant: opts.effort } : {}) }, permissions: reglas })
      viva = nueva.id
    }
    sesion = viva
    s.oyentes.set(sesion, oir)
    await c.session.instructions.entry.put({ sessionID: sesion, key: 'sloth', value: INSTRUCCIONES })
    // Si el navegador no arranca, el hilo sigue sin él.
    await Promise.all(
      Object.entries(servidoresMcp).map(([nombre, srv]) =>
        c.mcp
          .add({ server: `${mcp}-${nombre}`, location, config: { type: 'local', command: [srv.command, ...(srv.args ?? [])], ...(srv.env ? { environment: srv.env as Record<string, string> } : {}), codemode: false } })
          .catch(() => {})
      )
    )
    opts.onProviderSession(sesion)
  })()
  void ready.catch(() => {})

  const enOrden = (fn: () => Promise<void>, cerrarTurno = true) => {
    serie = serie.then(fn).catch((error) => {
      const mensaje = error instanceof Error ? error.message : String(error)
      if (cerrarTurno || !busy) terminar(false, mensaje)
      else emit({ t: 'info', text: `OpenCode no pudo recibir el mensaje: ${mensaje}. El turno sigue trabajando; vuelve a intentarlo.` })
    })
  }

  /**
   * La skill va por su ruta, como con Codex, y además por su id si OpenCode la encontró en `SKILLS`: así no usa otra
   * copia con ese nombre.
   */
  async function mandar(text: string, images: string[], skill?: SkillRef, steer = false) {
    await ready
    if (cerrado) return
    const c = servidorDe!.client
    if (!steer && !(await conCuenta(c))) throw new Error(SIN_CUENTA)
    const path = skill?.path ?? (skill && join(SKILLS, skill.name, 'SKILL.md'))
    if (path && !existsSync(path)) throw new Error(`No se encontró la skill ${skill!.name}.`)
    const conocidas = skill ? await c.skill.list({ location: { directory: opts.cwd } }).then((l) => l.data.map((x) => x.id), () => [] as string[]) : []
    const texto = skill ? `Usa la skill ${skill.name} de Sloth, la de ${path} (no otra copia con ese nombre).\n\n${text}` : text
    if (!steer) busy = true
    await c.session.prompt({
      sessionID: sesion,
      text: texto,
      files: images.filter((p) => existsSync(p)).map((p) => ({ uri: pathToFileURL(p).href })),
      ...(skill && conocidas.includes(skill.name) ? { skills: [{ id: skill.name }] } : {}),
      delivery: steer ? 'steer' : 'queue'
    })
  }

  return {
    // El `turn_start` de lo que manda el usuario lo da sessions.ts; aquí, solo el de un turno que empieza OpenCode.
    send(text, skill, images = []) {
      busy = true
      detenido = false
      errorTurno = undefined
      enOrden(() => mandar(text, images, skill))
    },
    steer(text, images = []) {
      enOrden(() => mandar(text, images, undefined, true), false)
    },
    compact() {
      if (busy || subagentes.size) throw new Error('Espera a que OpenCode termine antes de compactar.')
      busy = true
      compactando = true
      enOrden(async () => {
        await ready
        if (!cerrado) await servidorDe!.client.session.compact({ sessionID: sesion })
      })
    },
    async interrupt() {
      detenido = true
      enOrden(async () => {
        await ready
        if (sesion) await servidorDe!.client.session.interrupt({ sessionID: sesion })
      }, false)
      await serie
    },
    close() {
      cerrado = true
      const s = servidorDe
      if (!s) return
      s.oyentes.delete(sesion)
      for (const [hijo, raiz] of s.raiz) if (raiz === sesion) s.raiz.delete(hijo)
      for (const nombre of Object.keys(servidoresMcp)) void s.client.mcp.remove({ server: `${mcp}-${nombre}`, location: { directory: opts.cwd } }).catch(() => {})
      if (busy) void s.client.session.interrupt({ sessionID: sesion }).catch(() => {})
    }
  }
}

/** Un 429: el modelo gratis no da más por ahora. */
const limite = (error?: { status?: number; type?: string; message?: string }) => error?.status === 429 || /rate.?limit|too many requests|quota/i.test(error?.message ?? '')

/**
 * «Free usage limit reached»: no es un modelo saturado, se acabó el uso gratis de esta computadora en todos los modelos.
 * OpenCode no publica de cuánto es ni cuándo vuelve (suele ser en horas, a veces al día siguiente).
 */
const sinUsoGratis = (error?: { message?: string }) => /free usage/i.test(error?.message ?? '')
const SIN_USO_GRATIS = 'Se acabó tu uso gratis de OpenCode por ahora (OpenCode no dice cuándo vuelve).'

/** El error de un turno o de una respuesta suelta, en palabras de Sloth. */
const errorDe = (error: { status?: number; message?: string } | undefined, otro: string | undefined) =>
  sinUsoGratis(error) ? SIN_USO_GRATIS : limite(error) ? 'El modelo gratis llegó a su límite por ahora. Espera unos minutos o elige otro modelo gratis.' : (error?.message ?? otro)

const CERO: Tokens = { input: 0, output: 0, cacheRead: 0 }
const suma = (a: Tokens, b: Tokens): Tokens => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead })

/**
 * Los modelos de OpenCode Zen, con sus esfuerzos (`variants`): primero los gratis y luego los de pago, con su precio. El
 * catálogo lo da OpenCode y cambia solo (los gratis lo son «por tiempo limitado»). Vacío si OpenCode no se ha bajado (el
 * catálogo no lo baja) o si no hay cuenta conectada.
 */
export async function opencodeModels(): Promise<Model[]> {
  if (!rutaAgente('opencode')) return []
  try {
    const { client } = await conexion()
    if (!(await conCuenta(client))) return []
    const lista = await client.model.list({ location: { directory: APP } })
    const usables = lista.data.filter((m) => ZEN.includes(m.providerID) && m.enabled && m.status !== 'deprecated' && m.capabilities.tools !== false)
    const gratis = (m: (typeof usables)[number]) => m.cost.every((c) => c.input === 0 && c.output === 0)
    const modelo = (m: (typeof usables)[number]): Model => ({
      id: `opencode:${m.providerID}/${m.id}`,
      label: `${m.providerID === ZEN[0] ? 'OpenCode' : 'OpenCode Go'} · ${m.name}`,
      efforts: m.variants.map((v) => v.id),
      ...(gratis(m) ? {} : { precio: `$${m.cost[0].input} / $${m.cost[0].output}` })
    })
    // Los gratis primero, en el orden del catálogo; los de pago, por nombre.
    return [...usables.filter(gratis).map(modelo), ...usables.filter((m) => !gratis(m)).map(modelo).sort((a, b) => a.label.localeCompare(b.label))]
  } catch {
    return []
  }
}

/** Si hay una cuenta de OpenCode activa: sin ella, Sloth no trabaja con OpenCode (`server/cuenta-opencode.ts`). */
export const conCuenta = (client: OpenCodeClient) =>
  client.credential.list().then((l) => l.some((c) => c.integrationID === CONSOLA && c.active), () => false)

export const SIN_CUENTA = 'Conecta tu cuenta de OpenCode en Opciones: es gratis.'

/**
 * Una respuesta de un solo turno, sin herramientas ni sesión que quede: lo que en Claude es un `query` con `tools: []`
 * («Pedir una mejora», el redactor de YouTube). Sin `model`, el primer modelo gratis del catálogo.
 */
export async function redactarOpenCode(model: string | undefined, cwd: string, prompt: string, imagenes: string[], instruccion: string): Promise<string> {
  const s = await conexion()
  const c = s.client
  if (!(await conCuenta(c))) throw new Error(SIN_CUENTA)
  const elegido = model ?? (await opencodeModels())[0]?.id
  if (!elegido) throw new Error('OpenCode no tiene modelos gratis ahora. Intenta más tarde.')
  const { providerID, id } = modeloDe(elegido)
  const sesion = await c.session.create({ location: { directory: cwd }, title: 'Sloth', model: { providerID, id }, permissions: [{ action: '*', resource: '*', effect: 'deny' }] })
  const textos = new Map<string, string>()
  try {
    const listo = new Promise<string>((ok, mal) => {
      const reloj = setTimeout(() => mal(new Error('OpenCode tardó demasiado en responder. Intenta otra vez.')), 180_000)
      s.oyentes.set(sesion.id, (e) => {
        const d = e.data
        if (e.type === 'session.text.ended') textos.set(`${d.assistantMessageID}:${d.ordinal}`, d.text)
        if (e.type === 'session.execution.succeeded') (clearTimeout(reloj), ok([...textos.values()].join('\n').trim()))
        if (e.type === 'session.execution.failed' || e.type === 'session.execution.interrupted' || e.type === ('sloth.caida' as string)) {
          clearTimeout(reloj)
          mal(new Error(errorDe(d.error, 'OpenCode no pudo responder. Intenta otra vez.')))
        }
      })
    })
    await c.session.instructions.entry.put({ sessionID: sesion.id, key: 'sloth', value: instruccion })
    await c.session.prompt({ sessionID: sesion.id, text: prompt, files: imagenes.filter((p) => existsSync(p)).map((p) => ({ uri: pathToFileURL(p).href })) })
    return await listo
  } finally {
    s.oyentes.delete(sesion.id)
    void c.session.remove({ sessionID: sesion.id }).catch(() => {})
  }
}
