import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { Browser, Page } from 'playwright-core'
import { WebSocket } from 'ws'
import { conectarCDP } from '../playwright.ts'
import { type EstadoVoz, type ProveedorVoz, NAVEGADOR_VOZ, type TrabajoVoz, type VozApi, type VozStudio } from '../../shared/types.ts'
import { VENTA } from '../../shared/venta.ts'
import { juntarVoces, MOTORES, motorDe, segundosWav, textoParaVoz, vocesDeLista, vocesDelPanel } from '../../shared/voz.ts'
import { chromiumDelSistema, lanzarChromium, nombreDe, paginaNueva, SIN_CHROMIUM, SIN_VENTANA } from '../chromium.ts'
import { guardar } from '../disco.ts'
import { bytes, cuerpo } from '../http.ts'
import { integrado } from '../navegador-agente.ts'
import { vozPorApi } from './apis.ts'
import { enviarAudio, muestras } from './muestras.ts'
import { voicesCloning } from './voices-cloning.ts'

/**
 * La voz de los videos, generada en Google AI Studio («Generate speech», Gemini 3.8 Flash TTS) con la cuenta de Google
 * del usuario, como la generaría él a mano: sin llave de API (la gratis da unos 10 pedidos al día) y con la cuota de la
 * página. Los agentes la piden con el MCP `voz` (`mcp.mjs`, para Claude, Codex y OpenCode), que habla con la API de aquí;
 * la línea `Voz:` del primer mensaje (`shared/voz.ts`) dice cuál quiere el usuario.
 *
 * Se genera en la página `NAVEGADOR_VOZ` del navegador integrado (`electron/navegador.ts`), con su propio perfil: la
 * sesión de Google no la tiene ningún agente. Google no deja iniciar sesión dentro de una app, así que se entra en Edge
 * (Chrome en Mac) con su perfil, `data/voz/perfil`, y las cookies de Google pasan a la página (`copiarSesion`).
 * Si la página la pierde, se vuelven a pasar de Edge sin preguntar; solo si Edge también la perdió hay que volver a
 * entrar. Sin la ventana de Sloth (Sloth en Edge), se genera en ese Edge, sin ventana. Probado el 29 de octubre de 2026:
 * Google acepta en la app la sesión copiada, y una frase sale en unos 4 s; un guion de 6 minutos, en unos 100 s.
 *
 * Una voz a la vez, en fila: los videos de un lote no se pisan la página. El WAV (24 kHz, mono) lo baja el botón
 * Download de la página a una carpeta propia y se copia a donde lo pidió el agente. Si el texto y la voz no cambiaron
 * desde el último WAV de ese sitio (`.huella`), no se pide nada.
 *
 * Los botones se buscan por su texto en inglés, que es como sale AI Studio en cualquier idioma de la cuenta (solo
 * cambian los de la cuenta y el de cerrar el panel). Si la página cambia, falla con una captura en `data/voz/error.png`.
 *
 * Las voces de Fish Audio y ElevenLabs (`fish:<id>`, `elevenlabs:<id>`) van por su API, con la llave de cada quien
 * (`apis.ts`): no pasan por la página ni esperan su fila, y dejan el WAV en el mismo sitio, con la misma huella. Igual
 * las de Voices Cloning (`vc:<id>`, `voices-cloning.ts`), el proveedor de Sloth, que van por el cobro con los créditos
 * que da Sloth.
 */

const URL_VOZ = 'https://aistudio.google.com/generate-speech'
/**
 * La bienvenida de AI Studio («Welcome to AI Studio»): la primera vez que una cuenta entra, la página la manda ahí a
 * aceptar sus términos, y hasta entonces no deja generar. Solo se aceptan a mano, en la ventana donde se entra.
 */
const BIENVENIDA = /^https:\/\/aistudio\.google\.com\/(onboarding|welcome)\b/
const SIN_BIENVENIDA = 'AI Studio te pide aceptar sus términos la primera vez. Pulsa «Conectar con Google» (Opciones → Voz) y acéptalos en la ventana que se abre: se cierra sola al terminar.'
const ENTRAR = `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(URL_VOZ)}`
/** El del script con que El Diff generaba antes la voz: si dejó abierto su Edge, con el mismo perfil, se usa ese. */
const PUERTO = 9336
/**
 * Donde se entra con Google, el primero que haya: en Windows Edge, que viene con el sistema; en Mac Chrome, que es el que
 * suele haber (allí la comunidad no podía entrar en Edge). Safari no sirve (`server/chromium.ts`).
 */
const navegadorDeGoogle = () => chromiumDelSistema(process.platform === 'darwin')
/** Su nombre, para decirte dónde entrar. */
const nombreEdge = () => nombreDe(navegadorDeGoogle() ?? (process.platform === 'win32' ? 'msedge' : undefined))
/** Lo más que espera una petición a que acabe su voz: el MCP repite, y Codex corta una herramienta a los 60 s. */
const ESPERA_MAXIMA = 50_000
/** Lo más largo que se prueba una voz en el menú, en letras: una frase, no un guion. */
const PRUEBA_MAXIMA = 240
/** Cuántas pruebas se guardan en `data/voz/pruebas`. */
const PRUEBAS_GUARDADAS = 80

type Trabajo = TrabajoVoz & { texto: string; salida: string; huella: string }
type Cookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite?: string; partitionKey?: unknown }

/**
 * Lo que el servidor monta: su API, si está generando y la configuración del MCP para los agentes. `socio`: con qué se
 * habla al cobro para Voices Cloning (tu cuenta o tu apoyo, o la llave del creador) y si esta es la computadora del creador.
 */
export function voz(app: string, socio: Parameters<typeof voicesCloning>[1]) {
  const carpeta = join(app, 'data', 'voz')
  const descargas = join(carpeta, 'descargas')
  // El perfil del Edge donde se entra con Google. El del script viejo de El Diff ya tiene la sesión: se usa mientras no
  // haya uno de Sloth.
  const nuevo = join(carpeta, 'perfil')
  const viejo = join(process.env.LOCALAPPDATA ?? join(homedir(), '.cache'), 'video-el-diff', 'aistudio')
  const perfil = () => (existsSync(nuevo) || !existsSync(viejo) ? nuevo : viejo)
  const archivoCuenta = join(carpeta, 'cuenta.json')

  let guardada: { correo?: string | null; voces?: VozStudio[] } = {}
  try {
    guardada = JSON.parse(readFileSync(archivoCuenta, 'utf8'))
  } catch {
    // Aún no se conectó.
  }
  let cuenta: string | null = guardada.correo ?? null
  let voces: VozStudio[] = guardada.voces ?? []
  let conectando = false
  let error: string | undefined
  const guardarCuenta = () => (mkdirSync(carpeta, { recursive: true }), guardar(archivoCuenta, JSON.stringify({ correo: cuenta, voces }, null, 1)))

  const apis = vozPorApi(carpeta)
  const vc = voicesCloning(carpeta, socio)
  const deMuestra = muestras(carpeta)
  // Las frases con que se probaron voces en el menú, para oírlas otra vez sin gastar. Se quedan las últimas.
  const pruebas = join(carpeta, 'pruebas')
  const limpiarPruebas = () => {
    try {
      const viejas = readdirSync(pruebas)
        .filter((f) => f.endsWith('.wav'))
        .map((f) => ({ f, t: statSync(join(pruebas, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(PRUEBAS_GUARDADAS)
      for (const { f } of viejas) for (const x of [f, `${f}.huella`]) rmSync(join(pruebas, x), { force: true })
    } catch {
      // Aún no hay ninguna.
    }
  }
  /** Las que se están generando por API, que no hacen fila. */
  let porApi = 0

  const trabajos = new Map<string, Trabajo>()
  const fila: Trabajo[] = []
  let trabajando = false
  /** Lo que usa la página va de uno en uno: generar, leer las voces o pasar la sesión. */
  let turno: Promise<unknown> = Promise.resolve()
  const enTurno = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = turno.then(fn, fn)
    turno = r.catch(() => {})
    return r
  }

  // ── Edge, con el perfil donde se entra ──────────────────────────────────────────────────────────────────────────

  const responde = () => fetch(`http://127.0.0.1:${PUERTO}/json/version`).then((r) => r.ok, () => false)
  /** ¿Le queda alguna ventana? En Mac, cerrar la ventana no cierra el navegador. */
  const conVentana = () =>
    fetch(`http://127.0.0.1:${PUERTO}/json/list`)
      .then((r) => r.json() as Promise<{ type: string }[]>)
      .then((l) => l.some((t) => t.type === 'page'), () => false)
  /**
   * ¿Ya volvió a AI Studio, y no a su bienvenida? Google pone la sesión antes de llegar ahí, y lo que falta lo pone al
   * llegar.
   */
  const enAIStudio = () =>
    fetch(`http://127.0.0.1:${PUERTO}/json/list`)
      .then((r) => r.json() as Promise<{ type: string; url: string }[]>)
      .then((l) => l.some((t) => t.type === 'page' && t.url.startsWith('https://aistudio.google.com/') && !BIENVENIDA.test(t.url)), () => false)

  /**
   * Abre Edge con el perfil, si no lo estaba. `ventana`, con `url`, para entrar: ahí no se engancha Playwright (que toca
   * cada pestaña y Google lo nota), y es un Edge como cualquiera. Si no, sin ventana ni sonido.
   */
  async function lanzarEdge(ventana: boolean, url = ENTRAR) {
    if (await responde()) {
      if (!ventana) return
      // Para entrar hace falta la ventana: se cierra el de sin ventana (la sesión vive en el perfil).
      await cerrarEdge()
    }
    const edge = navegadorDeGoogle()
    if (!edge) throw new Error(SIN_CHROMIUM)
    mkdirSync(perfil(), { recursive: true })
    const extra = ventana ? [url] : [...SIN_VENTANA, 'about:blank']
    lanzarChromium(edge, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil()}`, '--no-first-run', '--no-default-browser-check', ...extra], ventana)
    for (let i = 0; i < 40 && !(await responde()); i++) await espera(500)
  }

  /** El Edge sin ventana, con Playwright, para trabajar en él. */
  async function abrirEdge(): Promise<Browser> {
    await lanzarEdge(false)
    return conectarCDP(`http://127.0.0.1:${PUERTO}`)
  }

  async function cerrarEdge() {
    await alNavegador('Browser.close').catch(() => {})
    for (let i = 0; i < 20 && (await responde()); i++) await espera(250)
  }

  /** Un comando a Edge por CDP, sin Playwright ni tocar sus pestañas. */
  async function alNavegador<T>(metodo: string): Promise<T> {
    const { webSocketDebuggerUrl } = (await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json()) as { webSocketDebuggerUrl: string }
    const ws = new WebSocket(webSocketDebuggerUrl)
    try {
      return await new Promise<T>((ok, mal) => {
        ws.once('open', () => ws.send(JSON.stringify({ id: 1, method: metodo })))
        ws.on('message', (d) => {
          const m = JSON.parse(String(d)) as { id?: number; result?: T; error?: { message: string } }
          if (m.id === 1) m.error ? mal(new Error(m.error.message)) : ok(m.result as T)
        })
        ws.once('error', mal)
        ws.once('close', () => mal(new Error('Edge se cerró.')))
      })
    } finally {
      ws.close()
    }
  }

  /** Las cookies de Google del Edge, y si tienen la sesión. */
  async function cookiesDeEdge(): Promise<{ cookies: Cookie[]; sesion: boolean }> {
    const { cookies } = await alNavegador<{ cookies: Cookie[] }>('Storage.getCookies')
    const deGoogle = cookies.filter((c) => /(^|\.)google\.com$/.test(c.domain.replace(/^\./, '')) && !c.partitionKey)
    return { cookies: deGoogle, sesion: deGoogle.some((c) => c.name === 'SAPISID') }
  }

  /**
   * Pasa la sesión de Google del Edge a la página de la app (sin la ventana de Sloth, se queda en Edge, que es donde se
   * genera). `false` si Edge no la tiene. Antes abre AI Studio en Edge, para que Google renueve lo que haga falta.
   */
  async function copiarSesion(): Promise<boolean> {
    const b = await abrirEdge()
    let leidas: Awaited<ReturnType<typeof cookiesDeEdge>>
    try {
      const page = await paginaNueva(b)
      await page.goto(URL_VOZ, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {})
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
      leidas = await cookiesDeEdge()
    } finally {
      await cerrarEdge()
    }
    if (!leidas.sesion) return false
    const ventana = integrado()
    if (!ventana?.voz) return true
    const enApp = await conectarCDP(`ws://127.0.0.1:${ventana.puerto}/${ventana.secreto}/${NAVEGADOR_VOZ}`)
    try {
      // Las de un solo sitio van con su dirección: con `domain`, Chromium las haría de todo el dominio (y las `__Host-`
      // no se dejarían poner).
      await enApp.contexts()[0].addCookies(
        leidas.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          ...(c.domain.startsWith('.') ? { domain: c.domain, path: c.path } : { url: `https://${c.domain}${c.path}` }),
          httpOnly: c.httpOnly,
          secure: c.secure,
          ...(c.sameSite === 'Strict' || c.sameSite === 'Lax' || c.sameSite === 'None' ? { sameSite: c.sameSite } : {}),
          ...(c.expires > 0 ? { expires: c.expires } : {})
        }))
      )
    } finally {
      await enApp.close().catch(() => {})
    }
    return true
  }

  // ── La página de AI Studio ──────────────────────────────────────────────────────────────────────────────────────

  /**
   * La página donde se trabaja: la del navegador integrado o, sin la ventana de Sloth, una pestaña del Edge sin ventana.
   * `bajarA` pone la carpeta de lo que baje; `soltar` la deja.
   */
  async function pagina(): Promise<{ page: Page; bajarA(carpeta: string): Promise<void>; soltar(): Promise<void> }> {
    const ventana = integrado()
    if (ventana?.voz) {
      const b = await conectarCDP(`ws://127.0.0.1:${ventana.puerto}/${ventana.secreto}/${NAVEGADOR_VOZ}`)
      const ctx = b.contexts()[0]
      const page = ctx.pages()[0] ?? (await ctx.waitForEvent('page'))
      // Playwright, al conectarse, la pone en tema claro: se deja como estaba.
      await page.emulateMedia({ colorScheme: null }).catch(() => {})
      return {
        page,
        // El relevo anota la carpeta antes de pasarle el comando a Electron, que puede no tenerlo: basta con eso.
        bajarA: async (c) => void (await (await b.newBrowserCDPSession()).send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: c }).catch(() => {})),
        soltar: async () => {
          await page.goto('about:blank').catch(() => {})
          await b.close().catch(() => {})
        }
      }
    }
    const b = await abrirEdge()
    const page = await paginaNueva(b)
    return {
      page,
      bajarA: async (c) => void (await (await b.newBrowserCDPSession()).send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: c, eventsEnabled: true })),
      soltar: async () => {
        await page.close().catch(() => {})
        if (!fila.length) await cerrarEdge()
      }
    }
  }

  /** El correo de la cuenta con que está la página, de su botón de cuenta («Cuenta de Google: Nombre (correo)»). */
  async function correoDe(page: Page): Promise<string | null> {
    const etiqueta = await page
      .locator('button[aria-label*="@"]')
      .first()
      .getAttribute('aria-label', { timeout: 15_000 })
      .catch(() => null)
    return etiqueta?.match(/\(([^()\s]+@[^()\s]+)\)/)?.[1] ?? null
  }

  /**
   * Abre AI Studio con un diálogo nuevo. Sin sesión, la vuelve a pasar de Edge una vez; si Edge tampoco la tiene, la
   * cuenta queda sin conectar.
   */
  async function abrirDialogo(page: Page) {
    for (let intento = 0; ; intento++) {
      await page.goto(URL_VOZ, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      // Con la sesión, pero sin aceptar la bienvenida: pasarla otra vez no sirve.
      if (BIENVENIDA.test(page.url())) {
        cuenta = null
        guardarCuenta()
        throw new Error(SIN_BIENVENIDA)
      }
      const correo = page.url().startsWith('https://accounts.google.com/') ? null : await correoDe(page)
      if (correo) {
        if (correo !== cuenta) (cuenta = correo), guardarCuenta()
        break
      }
      // Sin la ventana de Sloth la página ya es la de Edge: no hay de dónde pasarla.
      if (intento === 0 && integrado()?.voz && (await copiarSesion().catch(() => false))) continue
      cuenta = null
      guardarCuenta()
      throw new Error('AI Studio ya no tiene tu sesión de Google. Conecta tu cuenta otra vez (Opciones → Voz).')
    }
    const caja = page.locator('textarea[aria-label="Speech block text"]').first()
    if (!(await caja.isVisible().catch(() => false))) await page.getByText('Create new dialog', { exact: true }).first().click({ timeout: 30_000 })
    await caja.waitFor({ timeout: 20_000 })
    return caja
  }

  const hablante = (page: Page) => page.locator('button:has-text("Speaker 1")').first()
  const vozPuesta = async (page: Page) => (await hablante(page).innerText()).match(/Speaker 1\s*-\s*(\S+)/)?.[1] ?? ''

  /** Abre el panel de voces del hablante, hace `fn` con él y lo cierra. */
  async function conPanel<T>(page: Page, fn: (panel: ReturnType<Page['locator']>) => Promise<T>): Promise<T> {
    await hablante(page).click()
    const panel = page.locator('.cdk-overlay-pane').filter({ hasText: 'Speaker settings' }).last()
    await panel.waitFor({ timeout: 15_000 })
    try {
      return await fn(panel)
    } finally {
      await page.keyboard.press('Escape').catch(() => {})
      await panel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    }
  }

  /** Pone la voz `nombre` (la busca en el panel). Devuelve su nombre como lo escribe AI Studio. */
  async function ponerVoz(page: Page, nombre: string): Promise<string> {
    if ((await vozPuesta(page)).toLowerCase() === nombre.toLowerCase()) return vozPuesta(page)
    await conPanel(page, async (panel) => {
      await panel.locator('input[aria-label="Search voices"]').fill(nombre)
      const boton = panel.locator('button[aria-label]').filter({ hasText: new RegExp(`^\\s*${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }).first()
      await boton.click({ timeout: 15_000 })
      await page.waitForTimeout(500)
    })
    const puesta = await vozPuesta(page)
    if (puesta.toLowerCase() !== nombre.toLowerCase()) throw new Error(`AI Studio no tiene la voz «${nombre}» (quedó «${puesta}»). Mira las que hay con la herramienta voces.`)
    return puesta
  }

  /** Lee las voces del panel y la cuenta. Va en su turno. */
  async function leerVoces() {
    const p = await pagina()
    try {
      await abrirDialogo(p.page)
      const leidas = await conPanel(p.page, async (panel) => {
        const grupos = vocesDelPanel(await panel.innerText())
        // Sin filtro, el panel solo enseña 3 de cada grupo; filtrado por género, todas. Si algo de esto cambia en la
        // página, se quedan las de los grupos.
        const porGenero: Parameters<typeof juntarVoces>[1] = {}
        const genero = (cual: string) => async () => {
          await panel.locator('button:has-text("arrow_drop_down")').nth(1).click({ timeout: 5000 })
          await p.page.locator('.cdk-overlay-pane').last().getByText(cual, { exact: true }).click({ timeout: 5000 })
          await p.page.waitForTimeout(1500)
        }
        try {
          for (const [g, cual] of [['mujer', 'Feminine'], ['hombre', 'Masculine']] as const) {
            await genero(cual)()
            porGenero[g] = vocesDeLista(await panel.innerText())
          }
        } catch {
          // Se quedan las de los grupos.
        } finally {
          // El filtro se queda puesto en la página: se quita, o `ponerVoz` no encontraría las del otro género.
          await genero('All genders')().catch(() => {})
        }
        return juntarVoces(grupos, porGenero)
      })
      if (leidas.length) voces = leidas
      guardarCuenta()
    } finally {
      await p.soltar()
    }
  }

  // ── Conectar la cuenta ─────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Conecta la cuenta de Google: si el Edge del perfil ya la tiene, solo la pasa; si no, abre Edge con ventana para que
   * entres (hasta 10 minutos, o hasta que cierres la ventana) y luego la pasa. Al final lee tu correo y las voces.
   */
  async function conectar() {
    if (conectando) return
    conectando = true
    error = undefined
    try {
      // Una sesión vieja en el perfil también se copia, pero AI Studio no abre con ella: entonces se entra otra vez.
      const lista = (await enTurno(copiarSesion)) && (await enTurno(leerVoces).then(() => !!cuenta, () => false))
      if (!lista) {
        await lanzarEdge(true)
        // Se cierra cuando lleva unos 4 s en AI Studio con la sesión: a una cuenta nueva, AI Studio la abre y un momento
        // después la manda a su bienvenida, que hay que aceptar antes (cerrarla ahí la dejaba sin conectar). En esos
        // segundos Google pone lo que falta después de entrar.
        let sesion = false
        for (let i = 0, seguidas = 0; i < 400 && !sesion; i++) {
          await espera(1500)
          if (!(await conVentana())) break
          seguidas = (await enAIStudio()) && (await cookiesDeEdge().then((c) => c.sesion, () => false)) ? seguidas + 1 : 0
          sesion = seguidas >= 3
        }
        await cerrarEdge()
        if (!sesion) throw new Error(`No entraste con Google en ${nombreEdge()}. Vuelve a intentarlo.`)
        if (!(await enTurno(copiarSesion))) throw new Error(`${nombreEdge()} no guardó la sesión de Google. Vuelve a intentarlo.`)
        await enTurno(leerVoces)
      }
      if (!cuenta) throw new Error('AI Studio no abrió con tu cuenta de Google.')
    } catch (e) {
      error = mensaje(e)
    } finally {
      conectando = false
    }
  }

  /**
   * Quita la sesión de la página de la app y la de Edge: si la de Edge se quedaba, conectar otra vez entraba solo con la
   * misma cuenta y no había cómo elegir otra (con la cuota del día agotada, 5 de noviembre). El perfil del script viejo
   * de El Diff no se toca: se deja de usar y se empieza uno de Sloth, vacío.
   */
  async function desconectar() {
    const ventana = integrado()
    if (ventana?.voz)
      await enTurno(async () => {
        const b = await conectarCDP(`ws://127.0.0.1:${ventana.puerto}/${ventana.secreto}/${NAVEGADOR_VOZ}`)
        await b.contexts()[0].clearCookies().catch(() => {})
        await b.close().catch(() => {})
      })
    await enTurno(async () => {
      if (await responde()) await cerrarEdge()
      if (perfil() !== nuevo) return void mkdirSync(nuevo, { recursive: true })
      await lanzarEdge(false)
      await alNavegador('Storage.clearCookies').catch(() => {})
      await cerrarEdge()
    }).catch(() => {})
    cuenta = null
    guardarCuenta()
  }

  // ── Generar ────────────────────────────────────────────────────────────────────────────────────────────────────

  async function generar(t: Trabajo) {
    t.estado = 'generando'
    const p = await pagina()
    const bajada = join(descargas, t.id)
    try {
      const caja = await abrirDialogo(p.page)
      t.voz = await ponerVoz(p.page, t.voz)
      await caja.fill(t.texto)
      rmSync(bajada, { recursive: true, force: true })
      mkdirSync(bajada, { recursive: true })
      await p.bajarA(bajada)
      const respuesta = p.page.waitForResponse((r) => r.url().includes('MakerSuiteService/GenerateContent'), { timeout: 15 * 60_000 })
      await p.page.locator('button:has-text("Run")').last().click()
      const r = await respuesta
      if (r.status() !== 200) {
        await p.page.waitForTimeout(1500)
        throw new Error(`AI Studio no generó la voz (${r.status()}${(await avisos(p.page)) || ''}). Si es la cuota del día, pide la voz al usuario.`)
      }
      // Llega por partes (la página ya reproduce el principio): Download baja lo que haya, así que se espera a que acabe.
      const corte = await r.finished()
      if (corte) throw new Error(`AI Studio cortó la voz a medias (${corte}). Vuelve a pedirla una vez; si se repite, pide la voz al usuario.`)
      const bajar = p.page.getByRole('button', { name: 'Download' }).first()
      await bajar.waitFor({ timeout: 120_000 }).catch(async () => {
        throw new Error(`AI Studio no dio el audio${(await avisos(p.page)) || ''}.`)
      })
      // El botón sale antes de que el audio esté listo, y ese primer clic no baja nada: se repite hasta que baje.
      let wav: { ruta: string; segundos: number } | null = null
      for (let i = 0; i < 10 && !wav; i++) {
        await p.page.mouse.move(5, 5) // el aviso de Run tapa el botón
        await bajar.click({ force: true })
        for (let k = 0; k < 10 && !wav; k++) {
          await espera(300)
          wav = completo(bajada)
        }
      }
      if (!wav) throw new Error('El WAV de AI Studio no bajó.')
      mkdirSync(dirname(t.salida), { recursive: true })
      copyFileSync(wav.ruta, t.salida)
      guardar(`${t.salida}.huella`, t.huella)
      t.segundos = Math.round(wav.segundos * 10) / 10
      t.archivo = t.salida
      t.estado = 'lista'
    } catch (e) {
      t.estado = 'error'
      t.error = mensaje(e)
      await p.page.screenshot({ path: join(carpeta, 'error.png') }).catch(() => {})
    } finally {
      rmSync(bajada, { recursive: true, force: true })
      await p.soltar()
    }
  }

  /** El primer WAV entero de la carpeta (Electron lo nombra a su modo, Edge con su `guid`). */
  function completo(dir: string): { ruta: string; segundos: number } | null {
    for (const f of readdirSync(dir)) {
      const ruta = join(dir, f)
      const segundos = statSync(ruta).size > 44 ? segundosWav(readFileSync(ruta)) : null
      if (segundos) return { ruta, segundos }
    }
    return null
  }

  async function seguir() {
    if (trabajando) return
    trabajando = true
    try {
      for (let t = fila.shift(); t; t = fila.shift()) {
        const actual = t
        await enTurno(() => generar(actual))
      }
    } finally {
      trabajando = false
    }
  }

  /** Una voz de Fish Audio o ElevenLabs: por su API, sin la página. */
  async function generarPorApi(t: Trabajo) {
    t.estado = 'generando'
    porApi++
    try {
      const { motor, id } = motorDe(t.voz)
      const { wav, segundos } = motor === 'vc' ? await vc.generar(id, t.texto) : await apis.generar(t.voz, t.texto)
      mkdirSync(dirname(t.salida), { recursive: true })
      guardar(t.salida, wav)
      guardar(`${t.salida}.huella`, t.huella)
      t.segundos = Math.round(segundos * 10) / 10
      t.archivo = t.salida
      t.estado = 'lista'
    } catch (e) {
      t.estado = 'error'
      t.error = mensaje(e)
    } finally {
      porApi--
    }
  }

  function pedir(texto: string, nombre: string, salida: string): Trabajo {
    const huella = createHash('sha1').update(`${nombre.toLowerCase()}\n${texto}`).digest('hex')
    const t: Trabajo = { id: randomBytes(6).toString('hex'), estado: 'en-fila', voz: nombre, palabras: texto.split(/\s+/).length, texto, salida, huella }
    trabajos.set(t.id, t)
    // Los de hace rato ya los recogió su agente.
    for (const id of [...trabajos.keys()].slice(0, -100)) trabajos.delete(id)
    const igual = existsSync(salida) && existsSync(`${salida}.huella`) && readFileSync(`${salida}.huella`, 'utf8') === huella
    const segundos = igual ? segundosWav(readFileSync(salida)) : null
    if (segundos) return Object.assign(t, { estado: 'lista', archivo: salida, segundos: Math.round(segundos * 10) / 10 })
    if (motorDe(nombre).motor !== 'ai-studio') void generarPorApi(t)
    else fila.push(t), void seguir()
    return t
  }

  const publico = ({ texto: _t, salida: _s, huella: _h, ...t }: Trabajo): TrabajoVoz => t
  const estado = (): EstadoVoz => ({ cuenta, conectando, navegador: nombreEdge(), voces, enFila: fila.length + (trabajando ? 1 : 0) + porApi, ...(error ? { error } : {}), motores: apis.estado(), vc: vc.estado() })

  // ── La API ─────────────────────────────────────────────────────────────────────────────────────────────────────

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/api/voz')) return false
    const metodo = req.method ?? 'GET'
    const enviar = (status: number, datos: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(datos))
    }
    if (path === '/api/voz' && metodo === 'GET') return enviar(200, estado()), true
    if (path === '/api/voz/conectar' && metodo === 'POST') {
      void conectar()
      return enviar(200, { ...estado(), conectando: true }), true
    }
    if (path === '/api/voz/desconectar' && metodo === 'POST') {
      await desconectar()
      return enviar(200, estado()), true
    }
    if (path === '/api/voz/voces' && metodo === 'POST') {
      if (!cuenta) return enviar(409, { error: 'Sin cuenta de Google conectada.' }), true
      try {
        await enTurno(leerVoces)
        return enviar(200, estado()), true
      } catch (e) {
        return enviar(500, { error: mensaje(e) }), true
      }
    }
    if (path === '/api/voz/generar' && metodo === 'POST') {
      const d = await cuerpo<{ texto?: string; archivo?: string; voz?: string; salida?: string }>(req)
      let texto = d.texto?.trim()
      // Un guion en Markdown se narra como lo copia «Copiar»: sin títulos ni encabezados.
      if (!texto && d.archivo) {
        if (!isAbsolute(d.archivo) || !existsSync(d.archivo)) return enviar(400, { error: `No encuentro ${d.archivo}: pasa su ruta absoluta.` }), true
        const crudo = readFileSync(d.archivo, 'utf8')
        texto = (/\.md$/i.test(d.archivo) ? textoParaVoz(crudo) : crudo).trim()
      }
      if (!texto || !d.voz?.trim() || !d.salida || !isAbsolute(d.salida) || !/\.wav$/i.test(d.salida))
        return enviar(400, { error: 'Pide el texto (o el archivo con él), la voz y la ruta absoluta del .wav donde va.' }), true
      const { motor } = motorDe(d.voz)
      if (motor === 'vc' && !vc.puede()) await vc.refrescar()
      if (motor === 'vc' && !vc.puede())
        return enviar(409, { error: 'Las voces de Sloth no están disponibles en esta computadora (hace falta la cuenta de Sloth y créditos de voz). Mientras, pídele la voz al usuario.' }), true
      if (motor !== 'ai-studio' && motor !== 'vc' && !apis.tieneLlave(motor))
        return enviar(409, { error: `No hay llave de ${MOTORES[motor]}: que el usuario la ponga en Opciones → Voz. Mientras, pídele la voz.` }), true
      if (motor === 'ai-studio' && !cuenta)
        return enviar(409, { error: 'No hay cuenta de Google conectada para AI Studio: que el usuario la conecte en Opciones → Voz (o en el selector Voz del compositor). Mientras, pídele la voz.' }), true
      return enviar(200, publico(pedir(texto, d.voz.trim(), resolve(d.salida)))), true
    }
    if (await deMuestra.api(req, res, path)) return true
    // Oír una voz con tu frase antes de elegirla (el menú «Voz»): sale una vez y se guarda, la segunda no gasta nada.
    if (path === '/api/voz/probar' && metodo === 'POST') {
      const d = await cuerpo<{ texto?: string; voz?: string }>(req)
      const texto = d.texto?.trim().slice(0, PRUEBA_MAXIMA)
      const nombre = d.voz?.trim()
      if (!texto || !nombre) return enviar(400, { error: 'Escribe una frase y elige una voz.' }), true
      const { motor } = motorDe(nombre)
      if (motor === 'ai-studio' ? !cuenta : motor === 'vc' ? !vc.puede() : !apis.tieneLlave(motor)) return enviar(409, { error: 'Esa voz aún no está conectada.' }), true
      const huella = createHash('sha1').update(`${nombre.toLowerCase()}\n${texto}`).digest('hex').slice(0, 20)
      const t = pedir(texto, nombre, join(pruebas, `${huella}.wav`))
      const hasta = Date.now() + ESPERA_MAXIMA
      while ((t.estado === 'en-fila' || t.estado === 'generando') && Date.now() < hasta) await espera(300)
      limpiarPruebas()
      // El error de la fila está dicho para el agente; aquí lo lee quien prueba voces.
      const cuota = motor === 'ai-studio' && /\(429\b/.test(t.error ?? '')
      if (cuota) return enviar(429, { error: 'AI Studio llegó al límite de hoy con tu cuenta. Oye su muestra (sin tu frase) o prueba una voz de otro motor.' }), true
      if (t.estado !== 'lista') return enviar(t.estado === 'error' ? 500 : 202, { error: t.error ?? 'Sigue generándose: vuelve a pulsar en un momento.' }), true
      return enviar(200, { url: `/api/voz/prueba/${huella}.wav`, segundos: t.segundos }), true
    }
    const prueba = /^\/api\/voz\/prueba\/(\w+)\.wav$/.exec(path)
    if (prueba && metodo === 'GET') {
      const ruta = join(pruebas, `${prueba[1]}.wav`)
      if (!existsSync(ruta)) return enviar(404, { error: 'Ya no está: vuelve a probarla.' }), true
      enviarAudio(req, res, readFileSync(ruta), 'audio/wav', 86400)
      return true
    }
    // Buscar en toda la biblioteca de Fish Audio, y dejar en el menú la que eliges de ahí.
    if (path === '/api/voz/buscar' && metodo === 'GET') {
      const q = new URL(req.url ?? '', 'http://x').searchParams.get('q')?.trim() ?? ''
      return enviar(200, q.length < 2 ? [] : await apis.buscar(q)), true
    }
    const elegir = /^\/api\/voz\/(fish|elevenlabs)\/elegir$/.exec(path)
    if (elegir && metodo === 'POST') {
      const { voz: v } = await cuerpo<{ voz?: VozApi }>(req)
      if (!v?.id || !v.nombre) return enviar(400, { error: 'Falta la voz.' }), true
      apis.elegir(elegir[1] as ProveedorVoz, { id: v.id, nombre: v.nombre, descripcion: v.descripcion ?? '', propia: false, ...(v.muestra ? { muestra: v.muestra } : {}), ...(v.usos ? { usos: v.usos } : {}) })
      return enviar(200, estado()), true
    }
    // Quitar una voz tuya guardada en esta computadora (las que Fish no dejó crear sin saldo).
    const quitar = /^\/api\/voz\/(fish|elevenlabs)\/quitar$/.exec(path)
    if (quitar && metodo === 'POST') {
      try {
        const { id } = await cuerpo<{ id?: unknown }>(req)
        if (typeof id !== 'string') return enviar(400, { error: 'Falta la voz.' }), true
        apis.quitarTuya(quitar[1] as ProveedorVoz, id)
        return enviar(200, estado()), true
      } catch (e) {
        return enviar(400, { error: mensaje(e) }), true
      }
    }
    if (await vc.api(req, res, path, estado)) return true
    // Fish Audio y ElevenLabs: poner o quitar la llave, volver a leer sus voces y clonar la tuya.
    const m = /^\/api\/voz\/(fish|elevenlabs)\/(llave|voces|clonar)$/.exec(path)
    if (m && metodo === 'POST') {
      const motor = m[1] as ProveedorVoz
      try {
        if (m[2] === 'llave') await apis.guardarLlave(motor, (await cuerpo<{ llave?: string | null }>(req)).llave || null)
        if (m[2] === 'voces') await apis.actualizar(motor)
        if (m[2] === 'clonar') {
          const q = new URL(req.url ?? '', 'http://x').searchParams
          const audio = await bytes(req)
          if (audio.length < 1000) return enviar(400, { error: 'Elige una grabación de tu voz.' }), true
          if (audio.length > 25e6) return enviar(400, { error: 'La grabación pesa más de 25 MB: con un minuto basta.' }), true
          await apis.clonar(motor, q.get('nombre')?.trim() || 'Mi voz', audio, String(req.headers['content-type'] ?? ''), q.get('archivo') || 'voz.wav')
        }
        return enviar(200, estado()), true
      } catch (e) {
        return enviar(400, { error: mensaje(e) }), true
      }
    }
    const t = /^\/api\/voz\/trabajos\/(\w+)$/.exec(path)
    if (t && metodo === 'GET') {
      const trabajo = trabajos.get(t[1])
      if (!trabajo) return enviar(404, { error: 'No conozco esa voz: Sloth se reinició. Vuelve a pedirla (si ya estaba hecha, sale al momento).' }), true
      const hasta = Date.now() + Math.min(ESPERA_MAXIMA, Number(new URL(req.url ?? '', 'http://x').searchParams.get('esperar') ?? 0) * 1000)
      while ((trabajo.estado === 'en-fila' || trabajo.estado === 'generando') && Date.now() < hasta) await espera(500)
      return enviar(200, publico(trabajo)), true
    }
    return false
  }

  return {
    api,
    /** La sección Administrador del creador (`/api/admin*`, `voices-cloning.ts`). */
    admin: vc.apiAdmin,
    /** Por qué no se puede reiniciar el servidor: cortaría una voz a medias. */
    ocupado: () => (trabajando || porApi ? 'Sloth está generando una voz. Espera a que termine.' : null),
    /** Lo que Flow (`server/flow/`) toma de aquí: la cuenta y el Edge con la sesión, en el turno de la voz (ver `enTurno`). */
    google: {
      cuenta: () => cuenta,
      enEdge: <T>(fn: (b: Browser) => Promise<T>) =>
        enTurno(async () => {
          const b = await abrirEdge()
          try {
            return await fn(b)
          } finally {
            await cerrarEdge()
          }
        }),
      abrirEnEdge: (url: string) => enTurno(() => lanzarEdge(true, url))
    }
  }
}

/** El MCP `voz` para los agentes (`mcp.mjs`): lo corre el Node de Sloth y habla con la API de este servidor. */
export function mcpVoz(): Record<string, McpStdioServerConfig> {
  const aqui = dirname(fileURLToPath(import.meta.url))
  // Compilada (`scripts/compilar.mjs`), el servidor va en un solo archivo, server/index.mjs, y el MCP a su lado.
  const script = VENTA ? join(aqui, 'voz', 'mcp.mjs') : join(aqui, 'mcp.mjs')
  if (!existsSync(script) || !process.env.SLOTH_URL) return {}
  return { voz: { type: 'stdio', command: process.execPath, args: [script], env: { SLOTH_URL: process.env.SLOTH_URL } } }
}

/** Los avisos que la página enseña, para decir por qué no generó. */
async function avisos(page: Page): Promise<string> {
  const texto = await page
    .evaluate(() => [...document.querySelectorAll('mat-snack-bar-container, [role=alert], .error, .error-message')].map((d) => (d as HTMLElement).innerText.trim()).filter(Boolean).join(' · '))
    .catch(() => '')
  return texto ? `: ${texto}` : ''
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]
