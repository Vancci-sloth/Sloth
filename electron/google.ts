/**
 * Entrar con Google en el navegador integrado. Google no deja iniciar sesión dentro de una app («este navegador o app
 * puede no ser seguro»), pero sí acepta la sesión ya iniciada: como la voz (`server/voz/`) y las redes
 * (`server/redes/navegador.ts`), ese paso se da en Edge (Chrome en Mac), con un perfil de Sloth, y sus cookies de Google
 * pasan al perfil de las páginas. Luego la página vuelve a la dirección de Google que pedía, ya con la sesión: el «Entrar
 * con Google» de cualquier sitio sigue ahí.
 *
 * Edge se abre en la página de Google y no en la del sitio: así no gasta el pedido de una vez (OAuth) que hará la app.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Session, WebContents } from 'electron'
import { WebSocket } from 'ws'
import { chromiumDelSistema, lanzarChromium, nombreDe, SIN_CHROMIUM } from '../server/chromium.ts'

/** El de la voz es 9336 y el de las redes 9334. */
const PUERTO = 9337
const ENTRAR = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F'
/** Lo que espera a que entres antes de dejarlo. */
const ESPERA = 15 * 60_000

const deGoogle = (url?: string) => !!url?.startsWith('https://accounts.google.com/')
/** El aviso con que Google rechaza el navegador. */
const rechazo = (url: string) => /^https:\/\/accounts\.google\.com\/(v3\/)?signin\/rejected/.test(url)

type Cookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite?: string; partitionKey?: unknown }

/** Qué hacer con una página mientras se entra en Edge: `esperar` la saca de Google; `listo`, al acabar, con el porqué si no entró. */
export interface EnGoogle {
  esperar(wc: WebContents, navegador: string): void
  listo(wc: WebContents, url: string, error?: string): void
}

/** Vigila una página del perfil: si va a iniciar sesión con Google y el perfil no la tiene, la manda a Edge. */
export function vigilarGoogle(perfil: Session, carpeta: string, wc: WebContents, en: EnGoogle) {
  const mirar = async (url: string) => {
    if (!deGoogle(url) || esperando.has(wc)) return
    if (!rechazo(url) && (await perfil.cookies.get({ domain: 'google.com', name: 'SAPISID' })).length) return
    const vuelta = rechazo(url) ? (ultima.get(wc) ?? ENTRAR) : url
    // Si Google rechaza también la sesión recién pasada, Edge la volvería a pasar sin fin.
    if (Date.now() - pasada < 60_000) return en.listo(wc, vuelta, 'Google no dejó seguir con tu sesión dentro de la app.')
    entrar(perfil, carpeta, wc, vuelta, en)
  }
  wc.on('did-navigate', (_e, url) => void mirar(url))
  wc.on('did-navigate-in-page', (_e, url, principal) => principal && void mirar(url))
  // La de Google antes del rechazo, para volver a ella con la sesión.
  wc.on('did-navigate', (_e, url) => deGoogle(url) && !rechazo(url) && ultima.set(wc, url))
  wc.once('destroyed', () => {
    esperando.delete(wc)
    ultima.delete(wc)
  })
}

const ultima = new WeakMap<WebContents, string>()
/** Las páginas que esperan a que entres en Edge, con la dirección a la que vuelven. */
const esperando = new Map<WebContents, { url: string; en: EnGoogle }>()
let reloj: ReturnType<typeof setInterval> | undefined
/** Cuándo pasó la última sesión de Edge. */
let pasada = 0

function entrar(perfil: Session, carpeta: string, wc: WebContents, url: string, en: EnGoogle) {
  const exe = chromiumDelSistema(process.platform === 'darwin')
  if (!exe) return en.listo(wc, url, SIN_CHROMIUM)
  esperando.set(wc, { url, en })
  en.esperar(wc, nombreDe(exe))
  if (reloj) return
  const dir = join(carpeta, 'data', 'navegador-google')
  mkdirSync(dir, { recursive: true })
  lanzarChromium(exe, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', ENTRAR], true)
  const desde = Date.now()
  let abierto = false
  let mirando = false
  reloj = setInterval(async () => {
    if (mirando) return
    mirando = true
    try {
      const cookies = await cookiesDeEdge().catch(() => null)
      abierto ||= !!cookies
      const sesion = cookies?.some((c) => c.name === 'SAPISID')
      // Lo cerraste sin entrar, o pasó el rato.
      if (!sesion && ((abierto && !cookies) || Date.now() - desde > ESPERA)) return acabar('No entraste con Google en la ventana que se abrió.')
      if (!sesion) return
      await pasar(perfil, cookies!)
      pasada = Date.now()
      await alNavegador('Browser.close').catch(() => {})
      acabar()
    } finally {
      mirando = false
    }
  }, 1500)
}

function acabar(error?: string) {
  clearInterval(reloj)
  reloj = undefined
  for (const [wc, { url, en }] of esperando) if (!wc.isDestroyed()) en.listo(wc, url, error)
  esperando.clear()
}

/** Las de un solo sitio van con su dirección: con `domain`, Chromium las haría de todo el dominio. */
async function pasar(perfil: Session, cookies: Cookie[]) {
  const sitio = { Strict: 'strict', Lax: 'lax', None: 'no_restriction' } as const
  for (const c of cookies) {
    await perfil.cookies
      .set({
        url: `https://${c.domain.replace(/^\./, '')}${c.path}`,
        name: c.name,
        value: c.value,
        ...(c.domain.startsWith('.') ? { domain: c.domain } : {}),
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        ...(c.sameSite && c.sameSite in sitio ? { sameSite: sitio[c.sameSite as keyof typeof sitio] } : {}),
        ...(c.expires > 0 ? { expirationDate: c.expires } : {})
      })
      .catch(() => {})
  }
}

/** Las cookies de Google del Edge; falla si ya no está abierto. */
async function cookiesDeEdge(): Promise<Cookie[]> {
  const { cookies } = await alNavegador<{ cookies: Cookie[] }>('Storage.getCookies')
  return cookies.filter((c) => /(^|\.)google\.com$/.test(c.domain.replace(/^\./, '')) && !c.partitionKey)
}

/** Un comando a Edge por CDP, sin tocar sus pestañas. */
async function alNavegador<T>(metodo: string): Promise<T> {
  const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`, { signal: AbortSignal.timeout(2000) })
  const { webSocketDebuggerUrl } = (await r.json()) as { webSocketDebuggerUrl: string }
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
