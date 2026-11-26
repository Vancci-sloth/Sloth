import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, win32 } from 'node:path'
import type { Browser, Page } from 'playwright-core'
import type { NavegadorDeFuera } from '../shared/types.ts'
import { guardar } from './disco.ts'

/**
 * Chrome, Edge u otro Chromium del sistema, con un perfil de VyMotion y CDP, donde se entra con Google (la voz y Flow, `server/voz/`; las
 * redes, `server/redes/navegador.ts`): Google no deja entrar dentro de una app, y Safari no se deja manejar por CDP, así
 * que sin uno de los dos la sesión no tiene cómo pasar a VyMotion. Sin ventana, se abre con `SIN_VENTANA` y sus páginas con
 * `paginaNueva`, para que Google no lo vea como un robot. Cuál se usa lo eliges en Opciones → Navegador (`elegirNavegador`).
 */

/** En Mac, los navegadores también se instalan solo para tu usuario, en `~/Applications`. */
const enMac = (app: string, exe = app) => ['/Applications', join(homedir(), 'Applications')].map((d) => join(d, `${app}.app`, 'Contents', 'MacOS', exe))
/** En Windows, en Archivos de programa o, instalado solo para tu usuario, en `%LOCALAPPDATA%`. */
const programas = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter((p): p is string => !!p)
const enWindows = (...ruta: string[]) => programas.map((p) => join(p, ...ruta, 'Application'))
const WINDOWS = process.platform === 'win32'
const MAC = process.platform === 'darwin'
const CHROME = WINDOWS
  ? enWindows('Google', 'Chrome').map((d) => join(d, 'chrome.exe'))
  : MAC
    ? enMac('Google Chrome')
    : ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
const EDGE = WINDOWS
  ? ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ...enWindows('Microsoft', 'Edge').map((d) => join(d, 'msedge.exe'))]
  : MAC
    ? enMac('Microsoft Edge')
    : ['/opt/microsoft/msedge/msedge']
/** Los demás Chromium donde también se entra con Google, cuando no hay Chrome ni Edge. */
const OTROS = WINDOWS
  ? [...enWindows('BraveSoftware', 'Brave-Browser').map((d) => join(d, 'brave.exe')), ...enWindows('Vivaldi').map((d) => join(d, 'vivaldi.exe'))]
  : MAC
    ? [...enMac('Brave Browser'), ...enMac('Vivaldi')]
    : ['/usr/bin/brave-browser', '/usr/bin/vivaldi']
/** Opera y Opera GX solo si los eliges: nunca se toman solos. En Windows se instalan para tu usuario, en `Programs`. */
const OPERA = WINDOWS
  ? [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'), process.env.PROGRAMFILES].flatMap((p) => (p ? ['Opera', 'Opera GX'].map((o) => join(p, o, 'opera.exe')) : []))
  : MAC
    ? [...enMac('Opera'), ...enMac('Opera GX', 'Opera')]
    : ['/usr/bin/opera']

/**
 * El que elegiste en Opciones → Navegador o, sin elegir (o si ya no está instalado), el primero que haya, Chrome antes
 * que Edge si `chromePrimero`. En Windows, Edge sigue primero (ahí está la sesión de quien ya entró) y, sin él, tu
 * navegador predeterminado si es un Chromium: hay quien quitó Edge (avisado en la comunidad el 8 de noviembre de 2026).
 * Firefox no sirve: ya no habla CDP, y sin eso la sesión no pasa a VyMotion.
 */
export function chromiumDelSistema(chromePrimero: boolean): string | undefined {
  return elegido() ?? automatico(chromePrimero)
}

function automatico(chromePrimero: boolean): string | undefined {
  const chrome = [...(WINDOWS ? [predeterminado()].filter((e): e is string => !!e) : []), ...CHROME]
  return [...(chromePrimero ? [...chrome, ...EDGE] : [...EDGE, ...chrome]), ...OTROS].find((e) => existsSync(e))
}

/**
 * Dónde se guarda el elegido (`data/navegador-elegido.json`). Lo dicen al arrancar el servidor y la ventana, que son dos
 * procesos y lo leen del mismo archivo, cada vez: el cambio vale desde la siguiente ventana que se abra.
 */
let archivo: string | undefined
export const navegadorEn = (app: string) => void (archivo = join(app, 'data', 'navegador-elegido.json'))

function elegido(): string | undefined {
  if (!archivo) return undefined
  try {
    const { exe } = JSON.parse(readFileSync(archivo, 'utf8')) as { exe?: unknown }
    return typeof exe === 'string' && existsSync(exe) ? exe : undefined
  } catch {
    return undefined
  }
}

/** Los instalados donde se puede entrar con Google, uno por nombre. */
function instalados() {
  const vistos = new Set<string>()
  return [...EDGE, ...(WINDOWS ? [predeterminado()].filter((e): e is string => !!e) : []), ...CHROME, ...OTROS, ...OPERA]
    .filter((exe) => existsSync(exe))
    .map((exe) => ({ exe, nombre: nombreDe(exe) }))
    .filter((n) => !vistos.has(n.nombre) && vistos.add(n.nombre))
}

/** Lo que enseña Opciones → Navegador: el elegido, el que se toma sin elegir y entre cuáles se puede. */
export function navegadorDeFuera(): NavegadorDeFuera {
  const auto = automatico(MAC)
  return { elegido: elegido() ?? null, automatico: auto ? nombreDe(auto) : null, lista: instalados() }
}

/** Guarda el que eliges, o `null` para que VyMotion vuelva a tomar el de siempre. Solo uno de los instalados. */
export function elegirNavegador(exe: string | null) {
  if (!archivo) throw new Error('VyMotion aún no sabe dónde guardar el navegador.')
  if (exe && !instalados().some((n) => n.exe === exe)) throw new Error('Ese navegador ya no está instalado.')
  mkdirSync(dirname(archivo), { recursive: true })
  guardar(archivo, `${JSON.stringify({ exe }, null, 1)}\n`)
}

/** El navegador predeterminado de Windows si es un Chromium, leído una vez del registro. */
let leido: string | null | undefined
function predeterminado(): string | null {
  if (leido !== undefined) return leido
  const reg = (...args: string[]) => {
    try {
      return execFileSync('reg', ['query', ...args], { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      return ''
    }
  }
  // Windows 11 lo guarda en `UserChoiceLatest`; antes, y aún en muchos equipos, en `UserChoice`.
  const clave = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\'
  const progId = ['UserChoiceLatest', 'UserChoice'].map((k) => /ProgId\s+REG_SZ\s+(\S+)/.exec(reg(clave + k, '/v', 'ProgId'))?.[1]).find(Boolean)
  const comando = progId ? /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(reg(`HKCR\\${progId}\\shell\\open\\command`, '/ve'))?.[1] : undefined
  return (leido = comando ? chromiumDeComando(comando) : null)
}

/** El programa de un comando del registro (`"C:\…\chrome.exe" --single-argument %1`), si es un Chromium que sirve. */
export function chromiumDeComando(comando: string): string | null {
  const m = /^\s*(?:"([^"]+)"|(\S+))/.exec(comando)
  const exe = m?.[1] ?? m?.[2]
  return exe && /^(chrome|msedge|brave|vivaldi|chromium)\.exe$/i.test(win32.basename(exe)) ? exe : null
}

/** Su nombre, para decirte dónde entrar. */
export function nombreDe(exe: string | undefined) {
  const n = win32.basename(exe ?? '').toLowerCase()
  // El programa de Opera GX también se llama `opera`: se distingue por su carpeta.
  if (n.includes('opera')) return /opera gx/i.test(exe ?? '') ? 'Opera GX' : 'Opera'
  return n.includes('edge') ? 'Edge' : n.includes('brave') ? 'Brave' : n.includes('vivaldi') ? 'Vivaldi' : n.includes('chromium') ? 'Chromium' : 'Chrome'
}

/** Lo que se dice si no hay ninguno: en Mac casi siempre es que solo hay Safari, y en Windows, Firefox. */
export const SIN_CHROMIUM =
  process.platform === 'win32'
    ? 'Para entrar con Google hace falta Chrome, Edge o Brave: Firefox no deja pasar la sesión a VyMotion. Instala Chrome desde google.com/chrome y vuelve a intentarlo.'
    : process.platform === 'darwin'
      ? 'Para entrar con Google hace falta Google Chrome (o Microsoft Edge): Safari no deja pasar la sesión a VyMotion. Instálalo desde google.com/chrome y vuelve a intentarlo.'
      : 'No encontré Google Chrome ni Microsoft Edge: instala uno para entrar con Google.'

/**
 * Lo abre con `args`. Con `ventana`, en Mac va por `open`: lanzado directo desde VyMotion, macOS no lo trae al frente y la
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
