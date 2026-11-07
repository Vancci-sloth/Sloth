import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright-core'
import { detectados, elegirNavegador, leerPreferencia, marcaDe } from './navegador-sistema.ts'

/**
 * Chrome o Edge del sistema, con un perfil de Sloth y CDP, donde se entra con Google (la voz y Flow, `server/voz/`; las
 * redes, `server/redes/navegador.ts`): Google no deja entrar dentro de una app, y Safari no se deja manejar por CDP, así
 * que sin uno de los dos la sesión no tiene cómo pasar a Sloth. Sin ventana, se abre con `SIN_VENTANA` y sus páginas con
 * `paginaNueva`, para que Google no lo vea como un robot.
 */

/** En Mac, Chrome y Edge también se instalan solo para tu usuario, en `~/Applications`. */
const enMac = (app: string, exe: string) => ['/Applications', join(homedir(), 'Applications')].map((d) => join(d, `${app}.app`, 'Contents', 'MacOS', exe))
const CHROME =
  process.platform === 'win32'
    ? []
    : process.platform === 'darwin'
      ? enMac('Google Chrome', 'Google Chrome')
      : ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
const EDGE =
  process.platform === 'win32'
    ? ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
    : process.platform === 'darwin'
      ? enMac('Microsoft Edge', 'Microsoft Edge')
      : ['/opt/microsoft/msedge/msedge']

/** El primero que haya, Chrome antes que Edge si `chromePrimero`. */
export function chromiumDelSistema(chromePrimero: boolean): string | undefined {
  return (chromePrimero ? [...CHROME, ...EDGE] : [...EDGE, ...CHROME]).find((e) => existsSync(e))
}

/**
 * El navegador de la voz, las redes y Google: el que se eligió en Opciones → Navegador (`chrome` o `edge`) y, con
 * «automático», `chromiumDelSistema(chromePrimero)`, como siempre. Flow no pasa por aquí.
 */
export const chromiumElegido = (chromePrimero: boolean, pref = leerPreferencia(), hay = detectados()): string | undefined =>
  elegirNavegador(pref, hay)?.exe ?? chromiumDelSistema(chromePrimero)

/**
 * El perfil de Sloth de `base` para el navegador elegido. El que se usaba antes sigue en `base`; si eligieron el otro
 * navegador, va en `base-chrome` o `base-edge`: las cookies de uno no se pueden leer en el otro (cada navegador las cifra
 * con su llave), así que ahí se inicia sesión una vez, y la que ya había queda intacta por si vuelven.
 */
export function perfilDe(base: string, chromePrimero: boolean, pref = leerPreferencia(), hay = detectados()): string {
  const exe = chromiumElegido(chromePrimero, pref, hay)
  if (!exe) return base
  const de = chromiumDelSistema(chromePrimero)
  const habitual = de ? marcaDe(de) : process.platform === 'win32' ? 'edge' : 'chrome'
  return marcaDe(exe) === habitual ? base : `${base}-${marcaDe(exe)}`
}

export const nombreDe = (exe: string | undefined) => (exe && /edge/i.test(exe) ? 'Edge' : 'Chrome')

/** Lo que se dice si no hay ninguno: en Mac casi siempre es que solo hay Safari. */
export const SIN_CHROMIUM =
  process.platform === 'win32'
    ? 'No encontré Microsoft Edge, donde se entra con Google.'
    : process.platform === 'darwin'
      ? 'Para entrar con Google hace falta Google Chrome (o Microsoft Edge): Safari no deja pasar la sesión a Sloth. Instálalo desde google.com/chrome y vuelve a intentarlo.'
      : 'No encontré Google Chrome ni Microsoft Edge: instala uno para entrar con Google.'

/**
 * Lo abre con `args`. Con `ventana`, en Mac va por `open`: lanzado directo desde Sloth, macOS no lo trae al frente y la
 * ventana queda detrás, como si no se hubiera abierto. `-n` abre otro aunque ya tengas el tuyo abierto.
 */
export function lanzarChromium(exe: string, args: string[], ventana: boolean) {
  const [cmd, ...resto] = comoLanzar(exe, args, ventana)
  spawn(cmd, resto, { detached: true, stdio: 'ignore' }).unref()
}

/**
 * Sin ventana, Chrome y Edge se delatan ante las páginas, y Google puede tomarlo por un robot: Flow rechazó clips por
 * «actividad inusual» a una cuenta gratis y sin VPN (4 de noviembre de 2026). Se veía en dos cosas, que se arreglan aquí:
 *
 * - Cada pedido decía `HeadlessChrome`. La página que abre `paginaNueva` se presenta como el mismo navegador con ventana:
 *   el texto sin `Headless` y las mismas marcas (`userAgentData`), también en sus workers y cabeceras. Las marcas se leen
 *   una vez por navegador, en una dirección local que no sale a la red (solo existen en un origen seguro).
 * - La pantalla medía 800×600, más chica que la ventana. Se abre con una pantalla de 1920×1080 (`SIN_VENTANA`), y una
 *   `vista` fija no la cambia.
 *
 * Si algo falla, la página sale como antes.
 */
export const PANTALLA = { ancho: 1920, alto: 1080 }
export const SIN_VENTANA = ['--headless=new', '--mute-audio', `--screen-info={${PANTALLA.ancho}x${PANTALLA.alto}}`, '--window-size=800,1100']

type Marca = { brand: string; version: string }
type Marcas = { brands?: Marca[]; fullVersionList?: Marca[]; platform: string; platformVersion: string; architecture: string; model: string; mobile: boolean; bitness?: string; wow64?: boolean }
type Identidad = { userAgent: string; userAgentMetadata: Marcas }
const identidades = new WeakMap<Browser, Identidad>()
const LOCAL = 'http://127.0.0.1/sloth-identidad'

export async function paginaNueva(b: Browser, vista?: { ancho: number; alto: number }): Promise<Page> {
  const page = await b.contexts()[0].newPage()
  const cdp = await page.context().newCDPSession(page)
  // Como `setViewportSize`, que pondría la pantalla del tamaño de la vista.
  if (vista)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vista.ancho, height: vista.alto, deviceScaleFactor: 1, mobile: false, screenWidth: PANTALLA.ancho, screenHeight: PANTALLA.alto })
  try {
    let id = identidades.get(b)
    if (!id) {
      const { userAgent } = await cdp.send('Browser.getVersion')
      if (!/Headless/.test(userAgent)) return page
      await page.route(LOCAL, (r) => r.fulfill({ contentType: 'text/html', body: '' }))
      await page.goto(LOCAL)
      await page.unroute(LOCAL)
      const altos = ['architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList', 'wow64']
      const datos = await page.evaluate((h) => (navigator as unknown as { userAgentData: { getHighEntropyValues(h: string[]): Promise<Marcas> } }).userAgentData.getHighEntropyValues(h), altos)
      id = { userAgent: userAgent.replace(/Headless(Chrome)/, '$1'), userAgentMetadata: datos }
      identidades.set(b, id)
    }
    await cdp.send('Emulation.setUserAgentOverride', id)
  } catch {
    // Sin identidad, como antes.
  }
  return page
}

/** El comando con que `lanzarChromium` lo abre. */
export const comoLanzar = (exe: string, args: string[], ventana: boolean, so = process.platform) =>
  ventana && so === 'darwin' ? ['open', '-n', '-a', exe.replace(/\/Contents\/MacOS\/[^/]+$/, ''), '--args', ...args] : [exe, ...args]
