import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { query, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { CuentaClaude, LimitesClaude } from '../shared/types.ts'
import { conLlave, llaveDe, llaveEnUso } from './acceso.ts'
import { Inbox } from './agent.ts'
import { asegurarAgente, programaClaude, rutaAgente } from './agentes.ts'

/**
 * La cuenta de Claude con la que trabaja Sloth. Es la del Claude Code que trae el SDK, que la guarda en `~/.claude`: si ya
 * usas Claude Code en esta computadora, ya está conectada. Si no, «Conectar con Claude» abre `claude auth login` en su
 * propia ventana, que abre el navegador para autorizarla, como `/login` en la terminal. Si el navegador no se abre, esa
 * ventana da el enlace y pide ahí el código. Sloth no toca ni el código ni la sesión: Anthropic pide que el inicio de
 * sesión se complete en su propio flujo, sin que una app lo maneje por el usuario.
 */


/** Si sigue abierta la ventana de Claude Code donde se autoriza la cuenta. Solo hay una: mientras esté, no se abre otra. */
let login = false
/**
 * Si se está conectando la cuenta o leyendo sus límites: reiniciar el servidor perdería de vista la ventana del inicio
 * de sesión.
 */
export const conectando = () =>
  login ? 'Se está conectando la cuenta de Claude. Termina de autorizarla primero.' : leyendo ? 'Se están leyendo los límites del plan de Claude. Es un momento.' : null
/** Por qué falló el último inicio de sesión. */
let fallo = ''
/**
 * La cuenta, mientras esté conectada. Preguntarla es lanzar Claude Code, y se preguntaba en cada hilo nuevo: conectada no
 * se vuelve a mirar. Conectar otra y abrir Opciones (`fresco`) miran de nuevo.
 */
let conectada: CuentaClaude | null = null

/**
 * `claude auth status` sale con 1 cuando no hay sesión, pero escribe el JSON igual. Sin el programa de Claude Code (aún
 * no se bajó, `server/agentes.ts`), no hay sesión: mirarla no lo baja; conectarla, sí.
 */
function estado(_app: string): Promise<{ loggedIn?: boolean; email?: string; subscriptionType?: string; apiKeySource?: string }> {
  return new Promise((ok) => {
    const exe = rutaAgente('claude')
    if (!exe) return ok({})
    execFile(exe, ['auth', 'status', '--json'], { timeout: 10000 }, (_error, salida) => {
      try {
        ok(JSON.parse(salida))
      } catch {
        ok({})
      }
    })
  })
}

export async function cuentaClaude(app: string, fresco = false): Promise<CuentaClaude> {
  if (llaveEnUso('claude')) return conLlave('claude')
  if (conectada && !fresco && !login) return conectada
  const s = await estado(app)
  const cuenta = {
    conectada: !!s.loggedIn,
    quien: s.email ?? (s.apiKeySource ? `llave de API (${s.apiKeySource})` : undefined),
    plan: s.subscriptionType,
    conectando: login ? {} : undefined,
    error: fallo || undefined,
    llave: llaveDe('claude')
  }
  conectada = cuenta.conectada && !login && !fallo ? cuenta : null
  return cuenta
}

/**
 * Abre la ventana de Claude Code que autoriza la cuenta. `start /wait` le da su ventana y espera a que se cierre, pero no
 * devuelve con qué código salió Claude Code: al cerrarse, se mira si la cuenta quedó conectada. En Mac y Linux va en una
 * terminal (`enTerminal`).
 */
export function conectarClaude(app: string): Promise<CuentaClaude> {
  if (!login) {
    login = true
    fallo = ''
    conectada = null
    // Sin el programa de Claude Code, primero se baja (mientras, Opciones dice que se está conectando).
    const ventana = asegurarAgente('claude').then((exe) => {
      const comando = [exe, 'auth', 'login', '--claudeai']
      return process.platform === 'win32'
        ? new Promise<void>((ok, falla) => spawn('cmd', ['/c', 'start', 'Claude Code', '/wait', ...comando], { stdio: 'ignore' }).on('error', falla).on('exit', () => ok()))
        : enTerminal(comando)
    })
    // Sigue conectando hasta saberlo: Opciones deja de preguntar en cuanto deja de estarlo, y no vería el fallo.
    void ventana.then(
      () => cerrar(app),
      (e: Error) => cerrar(app, e)
    )
  }
  return cuentaClaude(app)
}

function cerrar(app: string, error?: Error) {
  void estado(app).then((s) => {
    if (!s.loggedIn) fallo = error?.message ?? 'No se terminó de autorizar la cuenta. Vuelve a intentarlo.'
    login = false
  })
}

/** Las terminales de Linux que se prueban, en orden, con lo que va antes del guion. */
const TERMINALES = [['x-terminal-emulator', '-e'], ['gnome-terminal', '--'], ['konsole', '-e'], ['xfce4-terminal', '-x'], ['kitty'], ['alacritty', '-e'], ['xterm', '-e']]
/** Lo más que se espera a que acabe: si la terminal no avisa, la cuenta deja de estar «conectando» al menos aquí. */
const ESPERA = 15 * 60_000

/**
 * `comando` en su propia terminal (Terminal en Mac; en Linux, la primera de `TERMINALES` que haya). Ninguna dice cuándo
 * se cierra: el guion deja una marca al acabar, también si se cierra la ventana a medias, y aquí se espera a verla.
 */
function enTerminal(comando: string[]): Promise<void> {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-claude-'))
  const fin = join(carpeta, 'fin')
  const guion = join(carpeta, 'Claude Code.command')
  const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`
  // La Terminal de Mac no hereda el entorno de Sloth: la configuración de Claude de la copia del repo va en el guion.
  const config = process.env.CLAUDE_CONFIG_DIR ? `export CLAUDE_CONFIG_DIR=${q(process.env.CLAUDE_CONFIG_DIR)}\n` : ''
  writeFileSync(guion, `#!/bin/sh\ntrap 'touch ${q(fin)}' EXIT HUP INT TERM\n${config}${comando.map(q).join(' ')}\n`, { mode: 0o755 })
  const enElPath = (p: string) => (process.env.PATH ?? '').split(delimiter).some((d) => d && existsSync(join(d, p)))
  const terminal = process.platform === 'darwin' ? ['open', '-a', 'Terminal'] : TERMINALES.find(([t]) => enElPath(t))
  return new Promise<void>((ok, falla) => {
    if (!terminal) return falla(new Error('No encontré una terminal donde autorizar la cuenta. Corre «claude auth login» en la tuya.'))
    const desde = Date.now()
    const reloj = setInterval(() => {
      if (!existsSync(fin) && Date.now() - desde < ESPERA) return
      clearInterval(reloj)
      rmSync(carpeta, { recursive: true, force: true })
      ok()
    }, 2000)
    spawn(terminal[0], [...terminal.slice(1), guion], { stdio: 'ignore', detached: true })
      .on('error', (e) => {
        clearInterval(reloj)
        falla(e)
      })
      .unref()
  })
}

/** Las ventanas de los límites del plan, con su nombre en Opciones. Las de cada modelo llegan aparte, con el que da Claude. */
const VENTANAS = { five_hour: 'Sesión de 5 horas', seven_day: 'Semana', seven_day_opus: 'Semana · Opus', seven_day_sonnet: 'Semana · Sonnet' } as const
type Ventana = { utilization: number | null; resets_at: string | null } | null | undefined

/** La última lectura de los límites, con su hora: preguntar es abrir Claude Code, y Opciones lo pide cada vez que se abre. */
let limites: { leido: number; valor: Promise<LimitesClaude> } | null = null
/** Cuántas lecturas están abiertas (ver `conectando`). */
let leyendo = 0

/**
 * Los límites del plan de la cuenta, como `/usage` en Claude Code: cuánto va de la sesión de 5 horas, de la semana y de
 * cada modelo, y cuándo vuelve a cero cada uno. Se pregunta como mucho una vez por minuto, también si falló. La API es
 * experimental en el SDK: si cambia o deja de estar, falla y Opciones lo dice en una línea.
 */
export function limitesClaude(): Promise<LimitesClaude> {
  // Con la llave no hay plan: se paga por uso.
  if (llaveEnUso('claude')) return Promise.resolve({ ventanas: [] })
  if (!limites || Date.now() - limites.leido > 60_000) limites = { leido: Date.now(), valor: leerLimites() }
  return limites.valor
}

async function leerLimites(): Promise<LimitesClaude> {
  leyendo++
  let q: Query | undefined
  let reloj: ReturnType<typeof setTimeout> | undefined
  try {
    q = query({ prompt: new Inbox<SDKUserMessage>(), options: { ...programaClaude(), settingSources: [] } })
    const tarde = new Promise<never>((_, mal) => (reloj = setTimeout(() => mal(new Error('Claude Code no contestó a tiempo.')), 20_000)))
    const u = await Promise.race([q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), tarde])
    const r = u.rate_limits
    const ventanas: LimitesClaude['ventanas'] = []
    const poner = (nombre: string, v: Ventana) => {
      if (typeof v?.utilization === 'number' && !ventanas.some((x) => x.nombre === nombre)) ventanas.push({ nombre, uso: v.utilization, reinicia: v.resets_at ?? undefined })
    }
    for (const [clave, nombre] of Object.entries(VENTANAS)) poner(nombre, r?.[clave as keyof typeof VENTANAS])
    for (const m of r?.model_scoped ?? []) poner(`Semana · ${m.display_name}`, m)
    return { ventanas }
  } finally {
    clearTimeout(reloj)
    q?.close()
    leyendo--
  }
}
