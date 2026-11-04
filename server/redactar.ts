import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { NOMBRE_AGENTE, proveedorDe } from '../shared/providers.ts'
import { llaveGuardada } from './acceso.ts'
import { asegurarAgente, conAgente, programaClaude, rutaAgente } from './agentes.ts'
import { codexModels } from './codex.ts'
import { entornoDeepSeek, SIN_LLAVE } from './deepseek.ts'
import { redactarOpenCode } from './opencode.ts'
import { OTROS } from './proveedores.ts'
import { redactarCodexYoutube } from './youtube-redactor.ts'

/**
 * Una respuesta suelta de un agente, sin herramientas ni sesión que se guarde: la ayuda de «Pedir una mejora»
 * (`server/comunidad.ts`) o el texto de un video para redes (`server/redes/`). Va con el agente de `model`, el de un hilo:
 * con Claude, Sonnet; con DeepSeek, Flash; con Codex, ese modelo con poco esfuerzo y la forma de `esquema`; con OpenCode,
 * el suyo. Grok, Antigravity, Cursor, Muse y Pi no tienen respuesta suelta: se abre uno de un momento, en una carpeta
 * vacía, y se toma lo que escribe en su turno. Sin `model`, el primero que esté bajado: Claude, OpenCode o Codex.
 * Devuelve lo que contestó; el JSON se lee de ahí.
 */
export async function redactar(model: string | undefined, cwd: string, prompt: string, instruccion: string, esquema: Record<string, unknown>): Promise<string> {
  const p = model ? proveedorDe(model) : rutaAgente('claude') ? 'claude' : rutaAgente('opencode') ? 'opencode' : 'codex'
  const nombre = NOMBRE_AGENTE[p]
  const conEsquema = `${prompt}\n\nResponde solo con un JSON que cumpla este esquema:\n${JSON.stringify(esquema)}`
  if (p === 'claude' || p === 'deepseek') return conClaude(prompt, instruccion, p === 'deepseek')
  if (p === 'opencode') return redactarOpenCode(model, cwd, conEsquema, [], instruccion)
  if (p === 'codex') model ??= (await codexModels())[0]?.id
  if (!model) throw new Error('No tienes ningún agente bajado: elige uno en Opciones → Agentes.')
  if (p === 'codex') return conCodex(model, cwd, prompt, instruccion, esquema, nombre)
  return conOtro(model, `<instrucciones>\n${instruccion}\n</instrucciones>\n\n${conEsquema}\n\nNo uses herramientas ni abras archivos: contesta con lo que ya tienes aquí.`, nombre)
}

/** Claude Code sin herramientas; con `deepseek`, contra la API de DeepSeek y su modelo rápido (`server/deepseek.ts`). */
async function conClaude(prompt: string, instruccion: string, deepseek: boolean): Promise<string> {
  const nombre = deepseek ? 'DeepSeek' : 'Claude'
  if (deepseek && !llaveGuardada('deepseek')) throw new Error(SIN_LLAVE)
  // Quien trabaja con otro agente puede no tener aún el programa de Claude: sin él, el SDK solo dice «Native CLI binary
  // for darwin-arm64 not found».
  await asegurarAgente('claude')
  const q = query({
    prompt,
    options: {
      ...programaClaude(),
      ...(deepseek ? { model: 'deepseek-flash', env: entornoDeepSeek('deepseek:deepseek-flash') } : { model: 'sonnet' }),
      systemPrompt: instruccion,
      tools: [],
      maxTurns: 1,
      settingSources: [],
      persistSession: false,
      thinking: { type: 'disabled' }
    }
  })
  const plazo = setTimeout(() => q.close(), 90_000)
  try {
    for await (const m of q) {
      if (m.type !== 'result') continue
      if (m.subtype !== 'success' || m.is_error) throw new Error(`${nombre} no pudo responder. Intenta otra vez.`)
      return m.result
    }
    throw new Error(`${nombre} no respondió a tiempo. Intenta otra vez.`)
  } finally {
    clearTimeout(plazo)
    q.close()
  }
}

function conOtro(model: string, prompt: string, nombre: string): Promise<string> {
  const p = proveedorDe(model)
  const start = OTROS[p]?.start
  if (!start) return Promise.reject(new Error(`${nombre} no puede escribir esto.`))
  const cwd = mkdtempSync(join(tmpdir(), 'sloth-redactar-'))
  return new Promise((ok, mal) => {
    let texto = ''
    let hecho = false
    const acabar = (error?: string) => {
      if (hecho) return
      hecho = true
      clearTimeout(plazo)
      run.close()
      setTimeout(() => rmSync(cwd, { recursive: true, force: true }), 5000).unref()
      if (error) mal(new Error(error))
      else ok(texto)
    }
    const plazo = setTimeout(() => acabar(`${nombre} no respondió a tiempo. Intenta otra vez.`), 180_000)
    const run = conAgente(p, {
      cwd,
      model,
      onEvent(e) {
        if (e.t === 'text' && !e.parent) texto += e.delta
        if (e.t === 'turn_end') acabar(e.ok ? undefined : (e.error ?? `${nombre} no pudo responder. Intenta otra vez.`))
      },
      onProviderSession() {},
      onExit: (caida) => caida && acabar(`${nombre} se cerró antes de responder. Intenta otra vez.`)
    }, start)
    run.send(prompt)
  })
}

async function conCodex(model: string, cwd: string, prompt: string, instruccion: string, esquema: Record<string, unknown>, nombre: string): Promise<string> {
  try {
    return await redactarCodexYoutube(model, cwd, prompt, [], esquema, undefined, 'low', instruccion)
  } catch (error) {
    const detalle = error instanceof Error ? error.message : ''
    if (/límite/.test(detalle)) throw new Error(`Llegaste al límite de tu plan de ${nombre}. Escríbelo tú, o vuelve a intentarlo cuando se reinicie.`)
    if (/Conecta/.test(detalle)) throw new Error(`Conecta tu cuenta de ${nombre} en Opciones → Agentes → Codex.`)
    throw new Error(`${nombre} no pudo responder. Intenta otra vez.`)
  }
}
