import { entornoSinLlaves } from './acceso.ts'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { copyFileSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentEvent, CuentaClaude, Model, Tokens } from '../shared/types.ts'
import { conRutas, IMAGE_TYPES, type AgentOptions, type AgentRun, type SkillRef } from './agent.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { conSkill, INSTRUCCIONES, mcpSloth } from './instrucciones.ts'
import { matarArbol } from './rpc-lineas.ts'

/**
 * Cursor con su SDK (`@cursor/sdk`), como en T3 Code: el agente de Cursor corre en la computadora, con la cuenta de Cursor
 * de cada quien (pide un plan de pago). El SDK no va dentro del servidor: corre en un puente (`cursor-puente.mjs`) con
 * el Node de Sloth, uno por hilo, desde la carpeta donde se bajó.
 *
 * La cuenta se conecta en el navegador: el SDK da un enlace, se autoriza, y guarda una llave de 90 días en
 * `~/.cursor/sdk/auth.json` (la misma del SDK en la terminal).
 */

/** El puente, junto al SDK que se bajó (`server/agentes.ts`): el SDK busca sus ayudantes desde el script que corre. */
function puente(): string {
  const sdk = rutaAgente('cursor')
  if (!sdk) throw new Error('Cursor aún no está descargado.')
  const destino = join(dirname(sdk), '..', '..', '..', 'cursor-puente.mjs')
  copyFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cursor-puente.mjs'), destino)
  return destino
}

function lanzar(modo: string, cwd: string) {
  return spawn(process.execPath, [puente(), modo], { cwd, windowsHide: true, stdio: 'pipe', env: { ...entornoSinLlaves(), CURSOR_HOST_APP_NAME: 'Sloth' } })
}

/** Lee lo que escribe el puente, una línea JSON a la vez. */
function lineas(proc: ChildProcessWithoutNullStreams, oir: (m: any) => void) {
  let resto = ''
  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (d: string) => {
    resto += d
    let i
    while ((i = resto.indexOf('\n')) >= 0) {
      const linea = resto.slice(0, i)
      resto = resto.slice(i + 1)
      try {
        oir(JSON.parse(linea))
      } catch {}
    }
  })
}

/** Una consulta de un momento (`estado`, `modelos`, `salir`): su primera línea. */
function consultar<T>(modo: string): Promise<T> {
  return new Promise((ok, mal) => {
    const proc = lanzar(modo, dirname(puente()))
    let listo = false
    const reloj = setTimeout(() => (matarArbol(proc), mal(new Error('Cursor no contestó a tiempo.'))), 30_000)
    lineas(proc, (m) => {
      if (listo) return
      listo = true
      clearTimeout(reloj)
      ok(m)
    })
    proc.stderr.resume()
    proc.on('exit', () => (clearTimeout(reloj), listo || mal(new Error('Cursor se cerró sin contestar.'))))
  })
}

/** Los nombres de herramientas de Cursor, como los de Claude que ya dibuja la interfaz. */
function herramienta(t: { type?: string; args?: any }): { name: string; input: unknown } {
  const a = t.args ?? {}
  switch (t.type) {
    case 'shell':
      return { name: 'Bash', input: { command: a.command, description: a.description } }
    case 'read':
      return { name: 'Read', input: { ...a, file_path: a.path } }
    case 'write':
      return { name: 'Write', input: { file_path: a.path, content: a.fileText } }
    case 'edit':
    case 'delete':
      return { name: 'Edit', input: { ...a, file_path: a.path } }
    case 'grep':
    case 'semSearch':
      return { name: 'Grep', input: { ...a, pattern: a.pattern ?? a.query } }
    case 'glob':
    case 'ls':
      return { name: 'Glob', input: { ...a, pattern: a.globPattern ?? a.pattern ?? a.path } }
    case 'mcp':
      return { name: `mcp__${a.providerIdentifier}__${a.toolName}`, input: a.args }
    case 'task':
      return { name: 'Agent', input: { description: a.description, prompt: a.prompt } }
    case 'updateTodos':
      return { name: 'TodoWrite', input: { todos: (a.todos ?? []).map((x: any) => ({ content: x.content, status: x.status === 'inProgress' ? 'in_progress' : x.status })) } }
  }
  return { name: t.type ?? 'Herramienta', input: a }
}

/** Lo que devolvió una herramienta, en texto. */
function salida(r: any): string {
  if (!r) return ''
  if (r.status === 'error') return typeof r.error === 'string' ? r.error : JSON.stringify(r.error)
  const v = r.value
  if (typeof v === 'string') return v
  if (v && (typeof v.stdout === 'string' || typeof v.stderr === 'string')) return [v.stdout, v.stderr].filter(Boolean).join('\n')
  return v ? JSON.stringify(v, null, 2).slice(0, 20_000) : ''
}

/** `cursor:claude-opus-4-8` y el esfuerzo → lo que pide el SDK. */
const seleccion = (model: string, effort?: string) => ({ id: model.replace(/^cursor:/, ''), ...(effort ? { params: [{ id: 'effort', value: effort }] } : {}) })

const CERO: Tokens = { input: 0, output: 0, cacheRead: 0 }

export function startCursor(opts: AgentOptions): AgentRun {
  const emit = (e: AgentEvent) => opts.onEvent(e)
  let busy = false
  let cerrado = false
  let detenido = false
  let primero = true
  let turno = 0
  let parte = 0
  let pendiente: string[] = []
  const herramientas = new Set<string>()
  let alAbrir!: () => void
  let alFallar!: (e: Error) => void
  const abierto = new Promise<void>((ok, mal) => ((alAbrir = ok), (alFallar = mal)))
  void abierto.catch(() => {})

  const proc = lanzar('agente', opts.cwd)
  let errores = ''
  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (d: string) => (errores = (errores + d).slice(-2000)))
  const orden = (o: Record<string, unknown>) => proc.stdin.write(`${JSON.stringify(o)}\n`)

  const terminar = (ok: boolean, error?: string, tokens?: Tokens) => {
    if (!busy) return
    busy = false
    emit({ t: 'turn_end', at: Date.now(), ok, error, tokens })
  }

  lineas(proc, (m) => {
    if (m.type === 'abierto') {
      opts.onProviderSession(m.agentId)
      return alAbrir()
    }
    if (m.type === 'update') return oir(m.update)
    if (m.type === 'fin') {
      // Si no se abrió, el error es de abrir.
      alFallar(new Error(m.error ?? 'Cursor no pudo abrir la sesión.'))
      const u = m.usage
      const tokens = u ? { input: (u.inputTokens ?? 0) + (u.cacheWriteTokens ?? 0), output: u.outputTokens ?? 0, cacheRead: u.cacheReadTokens ?? 0 } : CERO
      const siguiente = pendiente.shift()
      if (siguiente !== undefined && !detenido && m.status === 'finished') return enviar(siguiente)
      pendiente = []
      return terminar(m.status === 'finished', m.status === 'cancelled' || detenido ? 'lo detuviste' : m.status === 'error' ? errorDe(m.error) : undefined, tokens)
    }
    // Lo metió en el turno: ya no va al acabar.
    const i = m.type === 'steer' && m.ack !== 'revert_to_followup' ? pendiente.indexOf(m.texto) : -1
    if (i >= 0) pendiente.splice(i, 1)
  })
  proc.on('exit', (code) => {
    alFallar(new Error(`Cursor se cerró (código ${code}).`))
    const habia = busy
    if (busy) {
      busy = false
      emit({ t: 'turn_end', at: Date.now(), ok: false, error: detenido ? 'lo detuviste' : `Cursor se cerró${errores ? `: ${errores.trim().split('\n').pop()}` : '.'}`, caida: !detenido })
    }
    opts.onExit?.(cerrado ? undefined : { error: `Cursor se cerró (código ${code}).`, turno: habia })
  })
  proc.stdin.on('error', () => {})

  function oir(u: any) {
    switch (u.type) {
      case 'text-delta':
      case 'thinking-delta':
        if (u.text) emit({ t: u.type === 'text-delta' ? 'text' : 'thinking', id: `${turno}:${parte}${u.type === 'thinking-delta' ? ':pensamiento' : ''}`, delta: u.text })
        return
      case 'tool-call-started':
      case 'tool-call-completed': {
        if (!herramientas.has(u.callId)) {
          herramientas.add(u.callId)
          parte++
          const h = herramienta(u.toolCall ?? {})
          emit({ t: 'tool', id: u.callId, name: h.name, input: h.input })
        }
        if (u.type === 'tool-call-completed') {
          herramientas.delete(u.callId)
          emit({ t: 'tool_update', id: u.callId, done: true, error: u.toolCall?.result?.status === 'error', output: salida(u.toolCall?.result) })
        }
        return
      }
      case 'summary-completed':
        emit({ t: 'info', text: 'Cursor compactó el contexto para continuar.' })
        return
    }
  }

  // Los MCP de Sloth, como los pide el SDK, y la configuración del proyecto y del usuario (sus reglas, skills y MCP).
  const mcpServers = Object.fromEntries(Object.entries(mcpSloth(opts.lote, opts.hilo)).map(([n, s]) => [n, { type: 'stdio', ...s }]))
  orden({
    type: 'abrir',
    resume: opts.resume,
    opciones: {
      model: seleccion(opts.model, opts.effort),
      name: `Sloth ${opts.hilo ?? ''}`.trim(),
      mode: 'agent',
      mcpServers,
      local: { cwd: opts.cwd, settingSources: ['project', 'user', 'team', 'mdm', 'plugins'], sandboxOptions: { enabled: false }, enableAgentRetries: true, autoReview: false }
    }
  })

  function enviar(texto: string, images: string[] = []) {
    busy = true
    turno++
    parte = 0
    // Cursor no tiene instrucciones de sistema que el SDK deje poner: van al principio del primer mensaje.
    const text = conRutas(primero ? `<sloth>\n${INSTRUCCIONES}\n</sloth>\n\n${texto}` : texto, images)
    primero = false
    const mensaje = images.length ? { text, images: images.map((p) => ({ mimeType: IMAGE_TYPES[extname(p).toLowerCase()] ?? 'image/png', data: readFileSync(p).toString('base64') })) } : text
    orden({ type: 'mandar', mensaje, modelo: seleccion(opts.model, opts.effort) })
  }

  async function mandar(texto: string, images: string[]) {
    try {
      await abierto
      if (!cerrado) enviar(texto, images)
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
    // Lo mete en el turno si el SDK puede; si no, va al acabar (`revert_to_followup`).
    steer(text) {
      if (!busy) return void mandar(text, [])
      pendiente.push(text)
      orden({ type: 'steer', texto: text })
    },
    // `/compress` es el comando de Cursor que resume la conversación.
    compact() {
      void mandar('/compress', [])
    },
    async interrupt() {
      detenido = true
      pendiente = []
      orden({ type: 'cancelar' })
      // Si en 10 segundos no corta, se cierra el puente: el siguiente mensaje retoma el agente.
      setTimeout(() => busy && matarArbol(proc), 10_000).unref()
    },
    close() {
      cerrado = true
      orden({ type: 'cerrar' })
      setTimeout(() => matarArbol(proc), 5000).unref()
    }
  }
}

/** Los errores de Cursor, en palabras de Sloth. */
function errorDe(error = ''): string {
  if (/plan_required|paid plan/i.test(error)) return 'Cursor pide un plan de pago para usar su agente.'
  if (/unauthenticated|not logged in|AuthenticationError|api key/i.test(error)) return 'Conecta tu cuenta de Cursor en Opciones.'
  if (/rate.?limit|usage.?limit|resource_exhausted|\b429\b/i.test(error)) return 'Llegaste al límite de uso de tu plan de Cursor. Espera o revisa tu plan.'
  return error || 'Cursor falló.'
}

interface ModeloCursor {
  id: string
  displayName?: string
  parameters?: { id: string; values: { value: string }[] }[]
  variants?: { params: { id: string; value: string }[]; isDefault?: boolean }[]
}

/** Los modelos de la cuenta de Cursor, con sus esfuerzos (`effort`). Vacío si no se ha bajado o no hay cuenta. */
export async function modelosCursor(): Promise<Model[]> {
  if (!rutaAgente('cursor')) return []
  try {
    const { modelos } = await consultar<{ modelos: ModeloCursor[] }>('modelos')
    return modelos.map((m) => {
      const esfuerzos = m.parameters?.find((p) => p.id === 'effort' || p.id === 'reasoning')?.values.map((v) => v.value) ?? []
      const porDefecto = m.variants?.find((v) => v.isDefault)?.params.find((p) => p.id === 'effort')?.value
      return { id: `cursor:${m.id}`, label: `Cursor · ${m.displayName ?? m.id}`, efforts: esfuerzos, defaultEffort: porDefecto }
    })
  } catch {
    return []
  }
}

/** Mientras se inicia sesión: el enlace de Cursor y el puente que espera. */
let login: { url?: string; proc?: ChildProcessWithoutNullStreams } | undefined
let fallo = ''

export async function cuentaCursor(): Promise<CuentaClaude> {
  if (login) return { conectada: false, conectando: { url: login.url } }
  if (!rutaAgente('cursor')) return { conectada: false, error: fallo || undefined }
  const s = await consultar<{ conectada: boolean; quien?: string }>('estado').catch(() => ({ conectada: false, quien: undefined }))
  return { ...s, error: fallo || undefined, uso: 'https://cursor.com/dashboard' }
}

export const conectandoCursor = () => (login ? 'Se está conectando la cuenta de Cursor. Termina de autorizarla primero.' : null)

/** Abre el inicio de sesión del SDK: da un enlace que se autoriza en el navegador; el puente espera hasta 5 minutos. */
export async function conectarCursor(): Promise<CuentaClaude> {
  if (login) return cuentaCursor()
  login = {}
  fallo = ''
  try {
    await asegurarAgente('cursor')
    const proc = lanzar('login', dirname(puente()))
    login.proc = proc
    proc.stderr.resume()
    lineas(proc, (m) => {
      if (m.type === 'url' && login) login.url = m.url
      if (m.type === 'error') fallo = /abort/i.test(m.error) ? '' : m.error
    })
    proc.on('exit', () => (login = undefined))
    for (let i = 0; i < 60 && login && !login.url; i++) await new Promise((r) => setTimeout(r, 500))
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e)
    login = undefined
  }
  return cuentaCursor()
}

export async function cancelarCursor(): Promise<CuentaClaude> {
  if (login?.proc) matarArbol(login.proc)
  login = undefined
  return cuentaCursor()
}

/** Olvida la cuenta en esta computadora (la llave sigue valiendo en Cursor hasta que caduque o se revoque). */
export async function salirCursor(): Promise<CuentaClaude> {
  await consultar('salir').catch(() => {})
  return cuentaCursor()
}
