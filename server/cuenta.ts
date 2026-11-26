import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { query, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { CuentaClaude, LimitesClaude } from '../shared/types.ts'
import { conLlave, entornoSinLlaves, llaveDe, llaveEnUso } from './acceso.ts'
import { Inbox } from './agent.ts'
import { asegurarAgente, descartarRoto, programaClaude, rutaAgente } from './agentes.ts'
import { CLAUDE_ORIGINAL, entornoPerfilClaude, perfilesClaude, variablesPerfilClaude } from './perfiles-agentes.ts'

/**
 * La cuenta de Claude con la que trabaja VyMotion. Es la del Claude Code que trae el SDK, que la guarda en `~/.claude`: si ya
 * usas Claude Code en esta computadora, ya está conectada. Si no, «Conectar con Claude» abre `claude auth login` en su
 * propia ventana, que abre el navegador para autorizarla, como `/login` en la terminal. Si el navegador no se abre, esa
 * ventana da el enlace y pide ahí el código. VyMotion no toca ni el código ni la sesión: Anthropic pide que el inicio de
 * sesión se complete en su propio flujo, sin que una app lo maneje por el usuario.
 */


/** Si sigue abierta la ventana de Claude Code donde se autoriza la cuenta. Solo hay una: mientras esté, no se abre otra. */
let login: string | undefined
export const perfilClaudeAutorizando = (id: string) => login === id
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
function estado(app: string, id: string): Promise<{ loggedIn?: boolean; email?: string; subscriptionType?: string; apiKeySource?: string }> {
  const dir = perfilesClaude(app).configuracion(id)
  return new Promise((ok) => {
    const exe = rutaAgente('claude')
    if (!exe) return ok({})
    try {
      execFile(exe, ['auth', 'status', '--json'], { timeout: 10000, windowsHide: true, env: dir ? entornoPerfilClaude(dir) : undefined }, (_error, salida) => {
        try {
          ok(JSON.parse(salida))
        } catch {
          ok({})
        }
      })
    } catch (e) {
      // No arrancó (EFTYPE sale de golpe): si se bajó a medias, se borra y «Conectar con Claude» lo baja otra vez.
      fallo = descartarRoto('claude', e)
        ? 'El programa de Claude Code se había bajado a medias. «Conectar con Claude» lo baja otra vez.'
        : `No se pudo abrir Claude Code (${e instanceof Error ? e.message : e}).`
      ok({})
    }
  })
}

export async function cuentaClaude(app: string, fresco = false): Promise<CuentaClaude> {
  if (login) return { conectada: !!conectada?.conectada, quien: conectada?.quien, plan: conectada?.plan, conectando: {}, llave: llaveDe('claude') }
  if (llaveEnUso('claude')) return conLlave('claude')
  if (conectada && !fresco && !login) return conectada
  const { activa: perfil, perfiles } = perfilesClaude(app).leer()
  if (perfiles.some(p => p.id === perfil && p.bloqueado)) return { conectada: false, error: fallo || 'Vuelve a autorizar el perfil de Claude con su correo original.', llave: llaveDe('claude') }
  const s = await estado(app, perfil)
  if (perfilesClaude(app).leer().activa !== perfil) return cuentaClaude(app)
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
export function conectarClaude(app: string, perfil?: string): Promise<CuentaClaude> {
  if (!login) {
    const perfiles = perfilesClaude(app)
    const id = perfil === 'nuevo' ? perfiles.nuevo() : perfil ?? perfiles.leer().activa
    if (id !== CLAUDE_ORIGINAL && !perfiles.leer().perfiles.some(p => p.id === id)) throw new Error('Perfil de Claude desconocido.')
    const dir = perfiles.configuracion(id)
    login = id
    fallo = ''
    for (const f of alEntrar) f(id)
    // Sin el programa de Claude Code, primero se baja (mientras, Opciones dice que se está conectando).
    const ventana = asegurarAgente('claude').then((exe) => {
      const comando = [exe, 'auth', 'login', '--claudeai']
      return enVentana('Claude', comando, dir ? variablesPerfilClaude(dir) : undefined)
    })
    // Sigue conectando hasta saberlo: Opciones deja de preguntar en cuanto deja de estarlo, y no vería el fallo.
    void ventana.then(
      () => cerrar(app, id),
      (e: Error) => cerrar(app, id, e)
    )
  }
  return cuentaClaude(app)
}

/**
 * Cierra la sesión de Claude Code en esta computadora (`claude auth logout`, que borra lo que guardó al entrar). La llave
 * de API guardada en VyMotion no se toca: se quita aparte. Los hilos quietos sueltan su Claude Code, como al entrar.
 */
export async function salirClaude(app: string): Promise<CuentaClaude> {
  const exe = rutaAgente('claude')
  const dir = perfilesClaude(app).configuracion(perfilesClaude(app).leer().activa)
  if (exe && !login) await new Promise<void>((ok) => execFile(exe, ['auth', 'logout'], { timeout: 30_000, windowsHide: true, env: dir ? entornoPerfilClaude(dir) : undefined }, () => ok()))
  conectada = null
  limites.clear()
  fallo = ''
  for (const f of alEntrar) f(perfilesClaude(app).leer().activa)
  return cuentaClaude(app, true)
}

/** Quienes deben saber que se entró con una cuenta (`alEntrarClaude`). */
const alEntrar: ((id: string) => void)[] = []
/**
 * Al terminar de entrar, con la misma cuenta o con otra: los hilos quietos sueltan su Claude Code, que pudo quedarse con
 * la sesión de antes, y el siguiente mensaje lo abre ya con la nueva (`soltarQuietos` en sessions.ts).
 */
export const alEntrarClaude = (f: (id: string) => void) => void alEntrar.push(f)

export function usarPerfilClaude(app: string, id: string) {
  if (login) throw new Error('Termina el inicio de sesión de Claude antes de cambiar de cuenta.')
  perfilesClaude(app).usar(id)
  conectada = null
  limites.clear()
  fallo = ''
}

async function cerrar(app: string, id: string, error?: Error) {
  try {
    if (error) throw error
    const s = await estado(app, id)
    if (!s.loggedIn || (id !== CLAUDE_ORIGINAL && !s.email)) throw new Error('No se terminó de autorizar la suscripción. Vuelve a intentarlo.')
    const perfiles = perfilesClaude(app)
    if (id === CLAUDE_ORIGINAL) perfiles.usar(id)
    else perfiles.autorizar(id, s.email!)
    conectada = null
    limites.clear()
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e)
    conectada = null
  } finally {
    for (const f of alEntrar) f(id)
    login = undefined
  }
}

/** Las terminales de Linux que se prueban, en orden, con lo que va antes del guion. */
const TERMINALES = [['x-terminal-emulator', '-e'], ['gnome-terminal', '--'], ['konsole', '-e'], ['xfce4-terminal', '-x'], ['kitty'], ['alacritty', '-e'], ['xterm', '-e']]
/** Lo más que se espera a que acabe: si la terminal no avisa, la cuenta deja de estar «conectando» al menos aquí. */
const ESPERA = 15 * 60_000

/**
 * `comando` en su propia terminal (Terminal en Mac; en Linux, la primera de `TERMINALES` que haya). Ninguna dice cuándo
 * se cierra: el guion deja una marca al acabar, también si se cierra la ventana a medias, y aquí se espera a verla.
 */
/**
 * Un comando en su propia ventana, para iniciar sesión en un agente (`grok login`, `muse login`, `/login` de Pi): en
 * Windows con `start /wait`, que espera a que se cierre; en Mac y Linux, en una terminal (`enTerminal`). `env`, lo que se
 * le añade al entorno de VyMotion, que va sin sus llaves (en Mac, la Terminal no lo hereda: va en el guion). `start` solo lee el título si va entre
 * comillas, y Node solo se las pone si lleva un espacio: «Pi» a secas lo intenta abrir como programa.
 */
export function enVentana(titulo: string, comando: string[], env: Record<string, string> = {}): Promise<void> {
  if (process.platform === 'win32')
    return new Promise<void>((ok, falla) =>
      spawn('cmd', ['/c', 'start', `Cuenta de ${titulo}`, '/wait', ...comando], { stdio: 'ignore', env: { ...entornoSinLlaves(), ...env } })
        .on('error', falla)
        .on('exit', () => ok())
    )
  return enTerminal(comando, env)
}

function enTerminal(comando: string[], env: Record<string, string> = {}): Promise<void> {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-claude-'))
  const fin = join(carpeta, 'fin')
  const guion = join(carpeta, 'Claude Code.command')
  const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`
  // La Terminal de Mac no hereda el entorno de VyMotion: la configuración de Claude de la copia del repo va en el guion.
  const variables = { ...(process.env.CLAUDE_CONFIG_DIR ? { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR } : {}), ...env }
  const config = Object.entries(variables).map(([k, v]) => `export ${k}=${q(v)}\n`).join('')
  writeFileSync(guion, `#!/bin/sh\ntrap 'touch ${q(fin)}' EXIT HUP INT TERM\n${config}${comando.map(q).join(' ')}\n`, { mode: 0o755 })
  const enElPath = (p: string) => (process.env.PATH ?? '').split(delimiter).some((d) => d && existsSync(join(d, p)))
  const terminal = process.platform === 'darwin' ? ['open', '-a', 'Terminal'] : TERMINALES.find(([t]) => enElPath(t))
  return new Promise<void>((ok, falla) => {
    if (!terminal) return falla(new Error(`No encontré una terminal donde autorizar la cuenta. Corre «${comando.map((c) => c.split('/').pop()).join(' ')}» en la tuya.`))
    const desde = Date.now()
    const reloj = setInterval(() => {
      if (!existsSync(fin) && Date.now() - desde < ESPERA) return
      clearInterval(reloj)
      rmSync(carpeta, { recursive: true, force: true })
      ok()
    }, 2000)
    spawn(terminal[0], [...terminal.slice(1), guion], { stdio: 'ignore', detached: true, env: entornoSinLlaves() })
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
const limites = new Map<string, { leido: number; valor: Promise<LimitesClaude> }>()
/** Cuántas lecturas están abiertas (ver `conectando`). */
let leyendo = 0

/**
 * Los límites del plan de la cuenta, como `/usage` en Claude Code: cuánto va de la sesión de 5 horas, de la semana y de
 * cada modelo, y cuándo vuelve a cero cada uno. Se pregunta como mucho una vez por minuto, también si falló. La API es
 * experimental en el SDK: si cambia o deja de estar, falla y Opciones lo dice en una línea.
 */
export function limitesClaude(app: string, id?: string): Promise<LimitesClaude> {
  // Con la llave no hay plan: se paga por uso.
  if ((!id || id === CLAUDE_ORIGINAL) && llaveEnUso('claude')) return Promise.resolve({ ventanas: [], llave: true })
  const perfiles = perfilesClaude(app)
  const estado = perfiles.leer()
  const perfil = id ?? estado.activa
  if (perfilClaudeAutorizando(perfil) || estado.perfiles.some(p => p.id === perfil && p.bloqueado)) return Promise.resolve({ ventanas: [] })
  const ahora = Date.now()
  for (const [cuenta, dato] of limites) if (ahora - dato.leido > 60_000) limites.delete(cuenta)
  const anterior = limites.get(perfil)
  if (anterior) return anterior.valor
  const valor = leerLimites(perfiles.configuracion(perfil))
  limites.set(perfil, { leido: ahora, valor })
  return valor
}

async function leerLimites(dir?: string): Promise<LimitesClaude> {
  leyendo++
  let q: Query | undefined
  let reloj: ReturnType<typeof setTimeout> | undefined
  try {
    q = query({ prompt: new Inbox<SDKUserMessage>(), options: { ...programaClaude(), settingSources: [], ...(dir ? { env: entornoPerfilClaude(dir) } : {}) } })
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
