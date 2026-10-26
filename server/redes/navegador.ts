import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { NAVEGADOR_REDES } from '../../shared/types.ts'
import { integrado } from '../navegador-agente.ts'

/**
 * El navegador de las redes, donde viven las sesiones de TikTok y de las redes que vengan. Sloth lo maneja por CDP,
 * como lo harías tú a mano. TikTok no tiene API abierta para publicar en público sin una auditoría (ver `docs/adr/`),
 * así que se usa su página web. Instagram sí la tiene y no lo usa.
 *
 * Con la ventana de Sloth abierta, es su página `NAVEGADOR_REDES` del navegador integrado (`electron/navegador.ts`), con
 * su propio perfil: no abre otra ventana, y se ve en Opciones → Redes. Es una sola página: `pestana` la da y `cerrar` la
 * deja en blanco. Sin la ventana (Sloth en Edge), un Edge con su propio perfil (`data/redes/perfil`).
 *
 * Google no deja iniciar sesión dentro de una app («el navegador no es seguro»): si la página de la app va a Google, ese
 * paso se da en Edge (`conGoogle`), y la sesión de la red pasa a la app al entrar (`pasarDeEdge`).
 */

const PUERTO = 9334
/** Edge donde lo instala cada sistema y, si no está (lo normal en Mac y Linux), Chrome: Google deja entrar en los dos. */
const EDGE =
  process.platform === 'win32'
    ? ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/opt/microsoft/msedge/msedge', '/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']

/**
 * La red cerró la sesión. No es un fallo del video: lo que espera en la cola de esa red se queda ahí hasta que se vuelva a
 * conectar, y la barra lateral lo avisa.
 */
export class SinSesion extends Error {}

let conectado: Browser | null = null
/** El de ahora es la página del navegador integrado. */
let enLaApp = false

const responde = () =>
  fetch(`http://127.0.0.1:${PUERTO}/json/version`).then(
    (r) => r.ok,
    () => false
  )

/** ¿Está abierto? Para saber de la sesión sin abrir una ventana. El de la app siempre: no abre ninguna. */
export const abierto = async () => !!conectado?.isConnected() || !!integrado()?.redes || (await responde())

/** El navegador, abriéndolo si hace falta. `url` es la página con la que se abre (por ejemplo, la de iniciar sesión). */
export async function navegador(app: string, url = 'about:blank'): Promise<BrowserContext> {
  if (conectado?.isConnected()) return conectado.contexts()[0]
  const ventana = integrado()
  if (ventana?.redes) {
    conectado = await chromium.connectOverCDP(`ws://127.0.0.1:${ventana.puerto}/${ventana.secreto}/${NAVEGADOR_REDES}`)
    enLaApp = true
    // Playwright, al conectarse, pone la página en tema claro; se deja en el de la app, que es el que tenía.
    await Promise.all(conectado.contexts()[0].pages().map((p) => p.emulateMedia({ colorScheme: null })))
    return conectado.contexts()[0]
  }
  enLaApp = false
  conectado = await abrirEdge(app, url)
  return conectado.contexts()[0]
}

/** Edge con el perfil de las redes, abriéndolo con `url` si no estaba. */
async function abrirEdge(app: string, url: string): Promise<Browser> {
  if (!(await responde())) {
    const edge = EDGE.find((e) => existsSync(e))
    if (!edge) throw new Error(process.platform === 'win32' ? 'No encontré Microsoft Edge, que es el navegador con el que Sloth publica.' : 'No encontré Microsoft Edge ni Google Chrome: instala uno para entrar con Google.')
    const perfil = join(app, 'data', 'redes', 'perfil')
    mkdirSync(perfil, { recursive: true })
    spawn(edge, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', url], { detached: true, stdio: 'ignore' }).unref()
    for (let i = 0; i < 40 && !(await responde()); i++) await new Promise((r) => setTimeout(r, 500))
  }
  return chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`)
}

/** La página va a iniciar sesión con Google, que no lo deja hacer dentro de la app. */
export const deGoogle = (url: string) => url.startsWith('https://accounts.google.com/')

/** El Edge donde inicias sesión con Google mientras conectas una red en la app, y desde cuándo. */
let google: { edge: Browser; desde: number } | null = null
/** ¿Hay un Edge de Google abierto? Pasados 15 minutos sin entrar, ya no cuenta (el servidor puede reiniciarse). */
export const enGoogle = () => !!google?.edge.isConnected() && Date.now() - google.desde < 15 * 60_000

/** Abre en Edge la página de iniciar sesión de la red (`login`), para entrar con Google ahí. Al cerrarlo, se olvida. */
export async function conGoogle(app: string, login: string) {
  if (enGoogle()) return
  const edge = await abrirEdge(app, login)
  const ctx = edge.contexts()[0]
  if (!ctx.pages().some((p) => p.url().startsWith(login))) await (await ctx.newPage()).goto(login, { waitUntil: 'commit' })
  google = { edge, desde: Date.now() }
  edge.on('disconnected', () => google?.edge === edge && (google = null))
}

/** El contexto del Edge de Google, para mirar ahí si ya entraste. */
export const contextoDeGoogle = () => google!.edge.contexts()[0]

/**
 * Ya entraste en Edge: las cookies de la red (las de su dominio, `login`) pasan al navegador de la app, y Edge se cierra.
 */
export async function pasarDeEdge(app: string, login: string) {
  if (!google) return
  const nombre = new URL(login).hostname.split('.').slice(-2)[0]
  const cookies = (await google.edge.contexts()[0].cookies()).filter((c) => c.domain.includes(nombre))
  const ctx = await navegador(app)
  await ctx.addCookies(cookies)
  const { edge } = google
  google = null
  const cdp = await edge.newBrowserCDPSession()
  await cdp.send('Browser.close').catch(() => {})
  const page = ctx.pages()[0]
  if (page) await sinAviso(page).then(() => page.reload({ waitUntil: 'commit' })).catch(() => {})
}

/** Va en la página del navegador integrado: lo que se abre en él se ve en la app, no en otra ventana. */
export const deLaApp = () => (conectado?.isConnected() ? enLaApp : !!integrado()?.redes)

/** Una pestaña para trabajar: en el navegador integrado, su única página. */
export async function pestana(ctx: BrowserContext) {
  if (!enLaApp) return ctx.newPage()
  const page = ctx.pages()[0] ?? (await ctx.waitForEvent('page'))
  await sinAviso(page)
  return page
}

/**
 * Quita el «¿Salir del sitio?» de la página (TikTok Studio lo pone): en la app nadie lo contesta, y la ventana cancela
 * cualquier navegación. Va antes de llevarla a otra; las ventanas nuevas ya no lo hacen (`electron/navegador.ts`).
 */
export const sinAviso = (page: Page) =>
  page.evaluate("onbeforeunload = null; addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true)").catch(() => {})

/**
 * Cierra Edge cuando ya no hace falta, al acabar la cola: solo si le quedan pestañas en blanco. Con otra página abierta
 * (la de iniciar sesión, o una tuya) se queda. La sesión de cada red vive en el perfil y sigue al volver a abrirlo. Del
 * navegador integrado solo se desconecta: su página se cierra sola cuando nadie la ve.
 */
export async function soltar() {
  if (enLaApp && conectado) {
    const page = conectado.contexts()[0]?.pages()[0]
    if (page) await sinAviso(page).then(() => page.goto('about:blank')).catch(() => {})
    return desconectar()
  }
  if (!conectado?.isConnected() || conectado.contexts().some((c) => c.pages().some((p) => p.url() !== 'about:blank'))) return
  const cdp = await conectado.newBrowserCDPSession()
  await cdp.send('Browser.close').catch(() => {})
  conectado = null
  // Hasta que se va del todo: si algo lo pide justo ahora, abre uno nuevo en vez de conectarse al que se está cerrando.
  for (let i = 0; i < 20 && (await responde()); i++) await new Promise((r) => setTimeout(r, 250))
}

/**
 * Suelta el navegador de la app sin tocar su página (puedes estar iniciando sesión en ella): sin nadie conectado ni
 * mirándola, se cierra sola. Con Edge, nada.
 */
export async function desconectar() {
  if (!enLaApp || !conectado) return
  const b = conectado
  conectado = null
  await b.close().catch(() => {})
}

/**
 * Cierra una pestaña sin dejar Edge vacío: si fuera la última, Edge se cerraría entero. La del navegador integrado no se
 * cierra: queda en blanco.
 */
export async function cerrar(page: Page) {
  if (enLaApp && page.context().browser() === conectado) return void (await sinAviso(page).then(() => page.goto('about:blank')).catch(() => {}))
  const ctx = page.context()
  if (ctx.pages().length < 2) await ctx.newPage()
  await page.close({ runBeforeUnload: false }).catch(() => {})
}

/**
 * Elige un archivo en un `<input type=file>` pasándole la ruta por CDP. Playwright, conectado a un navegador que no
 * lanzó él, no manda archivos de más de 50 MB.
 */
export async function elegirArchivo(page: Page, selector: string, archivo: string) {
  const cdp = await page.context().newCDPSession(page)
  const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})` })
  if (!result.objectId) throw new Error('No encontré dónde elegir el archivo.')
  await cdp.send('DOM.setFileInputFiles', { files: [archivo], objectId: result.objectId })
  await cdp.detach()
}
