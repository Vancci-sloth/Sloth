import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { type AddressInfo, createServer } from 'node:net'
import { join } from 'node:path'
import type { Browser } from 'playwright-core'
import { WebSocket } from 'ws'
import { MAX_CUENTAS } from '../../shared/flow.ts'
import { chromiumDelSistema, lanzarChromium, nombreDe, paginaNueva, SIN_CHROMIUM, SIN_VENTANA } from '../chromium.ts'
import { guardar } from '../disco.ts'
import { conectarCDP } from '../playwright.ts'
import { URL_FLOW } from './pagina.ts'

/**
 * Las cuentas de Google que se agregan a Flow además de la de la voz, para tener más créditos: cada una con su perfil de
 * Edge (Chrome en Mac), `data/flow/cuentas/<id>/`, donde se entró una vez, y su Edge sin ventana para generar. Cada Edge
 * abre su CDP en un puerto libre (`puertoLibre`), que Sloth deja escrito en su perfil: así varios generan a la vez sin
 * pisarse.
 *
 * Para entrar se abre ese Edge con ventana en el inicio de sesión de Google, y Sloth solo mira por CDP qué página tiene y
 * si ya hay sesión, sin Playwright (que toca cada pestaña y Google lo nota), como al conectar la voz. Al llegar a Flow,
 * cada quien acepta su aviso y cierra la ventana; entonces se lee el correo y la cuenta queda. Agregar una que ya estaba
 * es volver a conectarla: se queda el perfil nuevo.
 */

/** Una cuenta con que Flow genera: la de la voz o una de estas. */
export interface CuentaFlow {
  correo: string
  deLaVoz: boolean
  /** Hace `fn` con su Edge sin ventana, en su turno: dos pedidos de la misma cuenta van de uno en uno. */
  enEdge<T>(fn: (b: Browser) => Promise<T>): Promise<T>
  /** Abre su Edge con ventana en `url`, para ver Flow o aceptar su aviso. */
  abrir(url: string): Promise<void>
}

const ENTRAR = `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(URL_FLOW)}`
/** Lo más que espera a que entres y cierres la ventana. */
const PLAZO_ENTRAR = 10 * 60_000
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Un puerto que nadie usa ahora: el sistema da uno y se suelta para Edge. */
const puertoLibre = () =>
  new Promise<number>((ok, mal) => {
    const s = createServer()
    s.once('error', mal)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo
      s.close(() => ok(port))
    })
  })
const navegador = () => chromiumDelSistema(process.platform === 'darwin')
export const nombreNavegador = () => nombreDe(navegador() ?? (process.platform === 'win32' ? 'msedge' : undefined))

/** El Edge de un perfil: lo abre, lo usa con Playwright y lo cierra. */
function edgeDe(perfil: string) {
  // Edge solo escribe `DevToolsActivePort` con el puerto `0`: el elegido se guarda aquí, para hallar su Edge tras reiniciar.
  const archivoPuerto = join(perfil, 'puerto-sloth')
  const puerto = () => {
    try {
      return Number(readFileSync(archivoPuerto, 'utf8').split('\n')[0]) || 0
    } catch {
      return 0
    }
  }
  const direccion = () => `http://127.0.0.1:${puerto()}`
  const responde = () => (puerto() ? fetch(`${direccion()}/json/version`).then((r) => r.ok, () => false) : Promise.resolve(false))
  const paginas = () =>
    fetch(`${direccion()}/json/list`)
      .then((r) => r.json() as Promise<{ type: string; url: string }[]>)
      .then((l) => l.filter((t) => t.type === 'page'), () => [])

  /** Un comando a Edge por CDP, sin Playwright ni tocar sus pestañas. */
  async function alNavegador<T>(metodo: string): Promise<T> {
    const { webSocketDebuggerUrl } = (await (await fetch(`${direccion()}/json/version`)).json()) as { webSocketDebuggerUrl: string }
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

  async function cerrar() {
    await alNavegador('Browser.close').catch(() => {})
    for (let i = 0; i < 20 && (await responde()); i++) await espera(250)
  }

  /** Lo abre, si no lo estaba. Con `ventana`, en `url` y como un Edge cualquiera; si no, sin ventana ni sonido. */
  async function lanzar(ventana: boolean, url = URL_FLOW) {
    if (await responde()) {
      if (!ventana) return
      await cerrar()
    }
    const exe = navegador()
    if (!exe) throw new Error(SIN_CHROMIUM)
    mkdirSync(perfil, { recursive: true })
    const extra = ventana ? [url] : [...SIN_VENTANA, 'about:blank']
    // Un puerto libre ya elegido, nunca `0`: con `0`, Edge dice a las páginas que lo maneja un programa
    // (`navigator.webdriver`) y Google no deja entrar («Es posible que el navegador no sea seguro»).
    const nuevo = await puertoLibre()
    writeFileSync(archivoPuerto, String(nuevo))
    lanzarChromium(exe, [`--remote-debugging-port=${nuevo}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', ...extra], ventana)
    for (let i = 0; i < 40 && !(await responde()); i++) await espera(500)
    if (!(await responde())) throw new Error(`${nombreNavegador()} no abrió.`)
  }

  let turno: Promise<unknown> = Promise.resolve()
  const enTurno = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = turno.then(fn, fn)
    turno = r.catch(() => {})
    return r
  }

  return {
    lanzar,
    cerrar,
    paginas,
    /**
     * Si ya tiene la sesión de Google y la de Flow. La de Flow (`OSID` en su dominio) la pone Google un momento después de
     * llegar: sin ella, el Edge sin ventana tenía que pedirla otra vez y Google no se la daba, así que Flow abría sin
     * cuenta («Entraste, pero Flow no dijo con qué cuenta»), a quien cerraba la ventana en cuanto veía Flow.
     */
    sesiones: () =>
      alNavegador<{ cookies: { name: string; domain: string }[] }>('Storage.getCookies').then(
        ({ cookies }) => {
          const de = (dominio: RegExp, nombre: RegExp) => cookies.some((c) => nombre.test(c.name) && dominio.test(c.domain.replace(/^\./, '')))
          return { google: de(/(^|\.)google\.com$/, /^SAPISID$/), flow: de(new RegExp(`^${new URL(URL_FLOW).hostname.replaceAll('.', '\\.')}$`), /^(__Secure-)?OSID$/) }
        },
        () => ({ google: false, flow: false })
      ),
    enEdge: <T>(fn: (b: Browser) => Promise<T>) =>
      enTurno(async () => {
        await lanzar(false)
        const b = await conectarCDP(direccion())
        try {
          return await fn(b)
        } finally {
          await b.close().catch(() => {})
          await cerrar()
        }
      }),
    abrir: (url: string) => enTurno(() => lanzar(true, url))
  }
}

/**
 * El correo de la cuenta con que está Flow, de su botón de cuenta («Cuenta de Google: Nombre (correo)»). Si no lo
 * enseña, deja en `captura` lo que enseñó, para saber por qué.
 */
async function correoEnFlow(b: Browser, captura: string): Promise<string | null> {
  const page = await paginaNueva(b)
  try {
    await page.goto(URL_FLOW, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    const etiqueta = await page
      .locator('[aria-label*="@"]')
      .first()
      .getAttribute('aria-label', { timeout: 15_000 })
      .catch(() => null)
    const correo = etiqueta?.match(/\(([^()\s]+@[^()\s]+)\)/)?.[1] ?? null
    if (!correo) await page.screenshot({ path: captura }).catch(() => {})
    return correo
  } finally {
    await page.close().catch(() => {})
  }
}

export function cuentasFlow(carpeta: string) {
  const archivo = join(carpeta, 'cuentas.json')
  let lista: { id: string; correo: string }[] = []
  try {
    lista = JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {
    // Aún no se agregó ninguna.
  }
  const guardarLista = () => (mkdirSync(carpeta, { recursive: true }), guardar(archivo, JSON.stringify(lista, null, 1)))
  const perfil = (id: string) => join(carpeta, 'cuentas', id)
  const edges = new Map<string, ReturnType<typeof edgeDe>>()
  const edge = (id: string) => edges.get(id) ?? edges.set(id, edgeDe(perfil(id))).get(id)!
  let agregando = false
  let error: string | undefined

  async function borrarPerfil(id: string) {
    await edge(id).cerrar()
    edges.delete(id)
    // Cerrado, Edge tarda unos segundos más en soltar los archivos del perfil (EPERM, que `maxRetries` no reintenta).
    for (let i = 0; ; i++) {
      try {
        return rmSync(perfil(id), { recursive: true, force: true })
      } catch (e) {
        if (i >= 60) throw e
        await espera(500)
      }
    }
  }

  /**
   * Abre la ventana para entrar con otra cuenta y la agrega al cerrarla. `deLaVoz`, el correo de la voz, que ya genera.
   * `alAgregar` recibe el correo, que ya puede generar aunque descansara.
   */
  async function agregar(deLaVoz: string | null, alAgregar: (correo: string) => void) {
    const id = randomBytes(4).toString('hex')
    const e = edge(id)
    try {
      await e.lanzar(true, ENTRAR)
      let google = false
      let flow = false
      // Sin pestañas dos veces seguidas es que cerraste la ventana: recién abierto, Edge puede tardar en enseñar la suya.
      for (let fin = Date.now() + PLAZO_ENTRAR, vacias = 0; Date.now() < fin && vacias < 2; ) {
        await espera(1500)
        const abiertas = await e.paginas()
        vacias = abiertas.length ? 0 : vacias + 1
        if (!flow && abiertas.some((p) => p.url.startsWith(URL_FLOW))) {
          const s = await e.sesiones()
          google ||= s.google
          flow = s.google && s.flow
        }
      }
      await e.cerrar()
      if (!google) throw new Error(`No entraste con Google en ${nombreNavegador()}, o cerraste la ventana antes de llegar a Flow. Vuelve a intentarlo.`)
      if (!flow) throw new Error('Cerraste la ventana antes de que Flow abriera con tu cuenta. Vuelve a intentarlo y ciérrala cuando veas tu foto arriba a la derecha de Flow.')
      const correo = await e.enEdge((b) => correoEnFlow(b, join(carpeta, 'error.png')))
      if (!correo) throw new Error('Entraste, pero Flow no dijo con qué cuenta. Vuelve a intentarlo.')
      if (correo === deLaVoz) throw new Error(`${correo} es la cuenta de la voz: ya genera en Flow.`)
      const vieja = lista.find((c) => c.correo === correo)
      if (vieja) await borrarPerfil(vieja.id)
      lista = [...lista.filter((c) => c !== vieja), { id, correo }]
      guardarLista()
      alAgregar(correo)
    } catch (x) {
      await borrarPerfil(id).catch(() => {})
      throw x
    }
  }

  return {
    lista: (): CuentaFlow[] => lista.map((c) => ({ correo: c.correo, deLaVoz: false, enEdge: edge(c.id).enEdge, abrir: edge(c.id).abrir })),
    agregando: () => agregando,
    error: () => error,
    /** Empieza a agregar una cuenta; acaba cuando cierras la ventana. */
    agregar(deLaVoz: string | null, alAgregar: (correo: string) => void) {
      if (agregando) return
      if (lista.length + 1 >= MAX_CUENTAS) {
        error = `Ya tienes ${MAX_CUENTAS} cuentas en Flow, contando la de la voz: quita una para agregar otra.`
        return
      }
      agregando = true
      error = undefined
      void agregar(deLaVoz, alAgregar)
        .catch((x) => void (error = String(x instanceof Error ? x.message : x).split('\n')[0]))
        .finally(() => void (agregando = false))
    },
    /** Quita la cuenta y borra su perfil (su sesión). Quien llama ya comprobó que no está generando. */
    async quitar(correo: string) {
      const c = lista.find((x) => x.correo === correo)
      if (!c) return
      lista = lista.filter((x) => x !== c)
      guardarLista()
      await borrarPerfil(c.id)
    }
  }
}
