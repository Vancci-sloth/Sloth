import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import type { CuentaInvestigacion, RedVertical } from '../../shared/types.ts'
import { cerrar } from '../redes/navegador.ts'
import { Detenido } from './youtube.ts'

/**
 * El navegador de las cuentas de investigación: un Edge con su propio perfil (`data/investigacion/perfil`) donde viven una
 * cuenta de TikTok y una de Instagram que solo buscan, nunca las que publican (`server/redes/navegador.ts`): lo que una red
 * le haga a una cuenta que busca mucho no le pasa a la tuya. Lo comparten `tiktok.ts` e `instagram-web.ts`: una operación
 * a la vez, cada una en su pestaña, y la que pide algo a una persona (un captcha, verificar la cuenta) se queda al frente.
 */

const PUERTO = 9335
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
const PASAPORTE = 'https://www.tiktok.com/passport/web/account/info/?aid=1988'
/** Lo que pide la página de Instagram al abrir «Editar perfil»: trae el usuario, sin abrir pestaña. */
const FORMULARIO = 'https://www.instagram.com/api/v1/accounts/edit/web_form_data/'
/** El id de la aplicación web de Instagram, que su página manda en cada llamada a su API. */
export const APP_INSTAGRAM = '936619743392459'

export function dormir(ms: number, signal: AbortSignal) {
  return new Promise<void>((ok, mal) => {
    if (signal.aborted) return mal(new Detenido('Detenida'))
    const t = setTimeout(ok, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), mal(new Detenido('Detenida'))), { once: true })
  })
}

/** Para pedir la página siguiente de una búsqueda basta con bajar, como con la rueda del ratón. */
export async function bajar(page: Page, signal: AbortSignal) {
  await page.mouse.move(400 + Math.random() * 400, 400 + Math.random() * 200)
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 900 + Math.random() * 600)
    await dormir(300 + Math.random() * 500, signal)
  }
}

const responde = () =>
  fetch(`http://127.0.0.1:${PUERTO}/json/version`).then(
    (r) => r.ok,
    () => false
  )

/** ¿Está abierto el navegador de las cuentas de investigación? Sin abrirlo. */
export const abiertoInvestigacion = responde

let conectado: Browser | null = null
let conectando: Promise<Browser> | null = null
let lanzando: Promise<void> | null = null

async function conectar(): Promise<BrowserContext> {
  if (!conectado?.isConnected()) conectado = await (conectando ??= chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`).finally(() => (conectando = null)))
  return conectado.contexts()[0]
}

/**
 * Sin sonido aunque el navegador no se abriera con `--mute-audio` (si ya estaba abierto): corre en cada pestaña de la
 * investigación antes que la red, y silencia cada video al sonar, y otra vez si la red le devuelve el sonido (en TikTok, un
 * clic en los comentarios cuenta como que quieres oírlo).
 */
function silenciar() {
  const callar = (e: Event) => {
    const m = e.target as HTMLMediaElement
    if (!m.muted) m.muted = true
  }
  document.addEventListener('play', callar, true)
  document.addEventListener('volumechange', callar, true)
}

/** Lo abre como el de las redes, con su perfil y su puerto. Sin sonido: cada pestaña de la investigación reproduce videos. */
async function lanzar(app: string) {
  const edge = EDGE.find((e) => existsSync(e))
  if (!edge) throw new Error('No encontré Microsoft Edge, que es el navegador con el que Sloth investiga TikTok e Instagram.')
  const perfil = join(app, 'data', 'investigacion', 'perfil')
  mkdirSync(perfil, { recursive: true })
  // Sin sincronizar: es un perfil de trabajo, y no tiene por qué traerse tus ajustes ni tus pestañas de otros equipos.
  spawn(edge, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-sync', 'about:blank'], { detached: true, stdio: 'ignore' }).unref()
  for (let i = 0; i < 40 && !(await responde()); i++) await new Promise((r) => setTimeout(r, 500))
  if (!(await responde())) throw new Error('El navegador de las cuentas de investigación no respondió.')
}

/** El navegador, abriéndolo si hace falta. */
export async function navegador(app: string): Promise<BrowserContext> {
  if (!(await responde())) await (lanzando ??= lanzar(app).finally(() => (lanzando = null)))
  return conectar()
}

/**
 * El `@usuario` con sesión en TikTok, o `null`. Si la pregunta falla (no responde, o no da JSON), se repite una vez: eso
 * no es que se cerrara la sesión, y tomarlo así dejó una vuelta entera sin comentarios (2026-10-11).
 */
export async function sesionTikTok(ctx: BrowserContext): Promise<string | null> {
  for (let intento = 0; intento < 2; intento++) {
    const r = await ctx.request.get(PASAPORTE, { timeout: 15_000 }).catch(() => null)
    const d = await r?.json().catch(() => null)
    if (d) return d.data?.username || null
    await new Promise((ok) => setTimeout(ok, 3000))
  }
  return null
}

/** Si hay sesión de Instagram, por su cookie: sin pedir nada a Instagram. Si ya no vale, su página manda a entrar. */
export async function sesionInstagram(ctx: BrowserContext): Promise<boolean> {
  const cookies = await ctx.cookies('https://www.instagram.com').catch(() => [])
  return cookies.some((c) => c.name === 'sessionid' && !!c.value)
}

/** El usuario de cada sesión de Instagram (`ds_user_id`): se pregunta una vez. */
const usuariosInstagram = new Map<string, string>()

/**
 * El `@usuario` con sesión en Instagram, o `null`. Sin cookie no pregunta; con ella, pide lo que la página de «Editar
 * perfil» y lo recuerda. Si Instagram no lo dice (no responde, o pide verificar), `'con sesión'`.
 */
async function usuarioInstagram(ctx: BrowserContext): Promise<string | null> {
  if (!(await sesionInstagram(ctx))) return null
  const id = (await ctx.cookies('https://www.instagram.com')).find((c) => c.name === 'ds_user_id')?.value ?? ''
  if (!usuariosInstagram.has(id)) {
    const r = await ctx.request.get(FORMULARIO, { headers: { 'x-ig-app-id': APP_INSTAGRAM, 'x-requested-with': 'XMLHttpRequest' }, timeout: 15_000, maxRedirects: 0 }).catch(() => null)
    const d = await r?.json().catch(() => null)
    // La cookie quedó, pero la sesión ya no: Instagram manda a entrar.
    if (r && ((r.status() >= 300 && r.status() < 400) || d?.message === 'login_required')) return null
    if (!d?.form_data?.username) return 'con sesión'
    usuariosInstagram.set(id, d.form_data.username)
  }
  return `@${usuariosInstagram.get(id)}`
}

/** Pregunta por las dos sesiones sin abrir el navegador. No espera turno: no usa ninguna pestaña. */
export async function cuentaInvestigacion(): Promise<CuentaInvestigacion> {
  if (!(await responde())) return { abierto: false, cuenta: null, instagram: null }
  const ctx = await conectar().catch(() => null)
  if (!ctx) return { abierto: true, cuenta: null, instagram: null }
  const [tiktok, instagram] = await Promise.all([sesionTikTok(ctx), usuarioInstagram(ctx)])
  return { abierto: true, cuenta: tiktok ? `@${tiktok}` : null, instagram }
}

/** Las pestañas de las operaciones en curso: «Abrir» no las toca. */
const enUso = new Set<Page>()
/**
 * La pestaña donde una red pidió algo a una persona (un captcha, verificar la cuenta): se queda abierta y al frente hasta
 * que lo hagas. `sigue` mira si aún lo pide; mientras, lo siguiente de esa red falla con el mismo error, sin abrir nada.
 */
const pendientes = new Map<RedVertical, { page: Page; sigue: () => Promise<boolean>; error: unknown }>()

/**
 * Abre la ventana en la red que digas (o la trae al frente) para entrar (el QR de TikTok, el formulario de Instagram) o
 * para mirar. Si esa red pidió algo a una persona, enseña esa pestaña.
 */
export async function abrirInvestigacion(app: string, red: RedVertical = 'tiktok'): Promise<void> {
  const ctx = await navegador(app)
  const pendiente = pendientes.get(red)
  if (pendiente && !pendiente.page.isClosed()) return void (await pendiente.page.bringToFront())
  const [sitio, entrar] = red === 'instagram' ? ['https://www.instagram.com/', 'https://www.instagram.com/accounts/login/'] : ['https://www.tiktok.com/', 'https://www.tiktok.com/login/qrcode']
  const conSesion = red === 'instagram' ? await sesionInstagram(ctx) : !!(await sesionTikTok(ctx))
  const page = ctx.pages().find((p) => !enUso.has(p) && (/^(about:blank|edge:\/\/newtab|chrome:\/\/newtab)/.test(p.url()) || p.url().startsWith(sitio))) ?? (await ctx.newPage())
  const url = page.url()
  if (!conSesion && !url.includes('/login')) await page.goto(entrar, { waitUntil: 'domcontentloaded' }).catch(() => {})
  else if (conSesion && !url.startsWith(sitio)) await page.goto(sitio, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.bringToFront()
}

/** La investigación y las herramientas de Claude pueden pedir a la vez: cada operación espera a que acabe la anterior. */
let cola: Promise<unknown> = Promise.resolve()
function enFila<T>(fn: () => Promise<T>): Promise<T> {
  const turno = cola.then(fn)
  cola = turno.catch(() => {})
  return turno
}

/** Lo que distingue a cada red al abrir una pestaña. */
export interface Red {
  red: RedVertical
  /** Antes de abrir la pestaña: falla si no hay sesión. */
  sesion(ctx: BrowserContext): Promise<void>
  /** Si el error es que la red pide algo a una persona, cómo saber, mirando la pestaña, si aún lo pide. */
  retener?(e: unknown, page: Page): Promise<(() => Promise<boolean>) | null>
}

/**
 * Una operación de página: en su turno, con sesión y con su propia pestaña, que se cierra al acabar, salvo si la red pidió
 * algo a una persona (`retener`).
 */
export function conPestana<T>(app: string, signal: AbortSignal, red: Red, fn: (page: Page) => Promise<T>): Promise<T> {
  return enFila(async () => {
    if (signal.aborted) throw new Detenido('Detenida')
    const ctx = await navegador(app)
    const pendiente = pendientes.get(red.red)
    if (pendiente) {
      if (!pendiente.page.isClosed() && (await pendiente.sigue())) throw pendiente.error
      if (!pendiente.page.isClosed()) await cerrar(pendiente.page)
      pendientes.delete(red.red)
    }
    await red.sesion(ctx)
    const page = await ctx.newPage()
    await page.addInitScript(silenciar)
    enUso.add(page)
    try {
      return await fn(page)
    } catch (e) {
      const sigue = await red.retener?.(e, page)
      if (sigue) {
        pendientes.set(red.red, { page, sigue, error: e })
        await page.bringToFront().catch(() => {})
      }
      if (signal.aborted) throw new Detenido('Detenida')
      throw e
    } finally {
      enUso.delete(page)
      if (pendientes.get(red.red)?.page !== page) await cerrar(page)
    }
  })
}
