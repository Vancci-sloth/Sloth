/**
 * El navegador integrado, como el de T3 Code: una página por hilo dentro de la ventana de Sloth, que la interfaz pone a
 * la derecha del chat (o en el centro del estudio) con el botón del globo (`web/src/Navegador.tsx`). La usan tú y el
 * agente a la vez: Playwright MCP (`server/navegador-agente.ts`) se conecta a la del hilo por el relevo CDP de aquí
 * (`relevo.ts`), y lo que abre se ve sin otra ventana.
 *
 * Las páginas son de este proceso, no de la interfaz: siguen vivas si la interfaz se recarga o miras otro hilo, y el
 * agente las usa aunque no se vean. Una que nadie ve ni usa en `OCIOSA` se cierra; al volver a verla, se abre en su
 * última dirección. Todas comparten un perfil aparte del de la interfaz (`persist:navegador`): lo que inicies en una lo
 * tiene el agente en todas. La de las redes (`NAVEGADOR_REDES`), donde Sloth publica en TikTok, va con el suyo
 * (`persist:redes`): la sesión con la que publicas no la tiene ningún agente.
 *
 * El relevo escucha en 127.0.0.1, con un secreto en la ruta, y anota dónde en `data/navegador-integrado.json` (con el
 * pid de este proceso, para que el servidor sepa si sigue vivo). La próxima vez repite puerto y secreto: el agente de un
 * hilo que siguió abierto vuelve a encontrarlo.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { app, ipcMain, session, shell, WebContentsView, type BrowserWindow, type Session } from 'electron'
import { WebSocketServer, type WebSocket } from 'ws'
import { guardar } from '../server/disco.ts'
import { crearRelevo, type Relevo } from './relevo.ts'
import { type AccionNavegador, type EstadoNavegador, NAVEGADOR_REDES } from '../shared/types.ts'

const PARTICION = 'persist:navegador'
const PARTICION_REDES = 'persist:redes'
/** Lo que espera una página que nadie ve ni usa antes de cerrarse. */
const OCIOSA = 20 * 60_000
/** --bg de web/src/styles.css: lo que se ve mientras la página pinta. */
const FONDO = '#0f0e0c'

type Caja = { x: number; y: number; width: number; height: number }

interface Hoja {
  hilo: string
  vista: WebContentsView
  /** Las conexiones del agente, cada una con su relevo. */
  conexiones: Map<WebSocket, Relevo>
  /** La última vez que se vio o se usó. */
  usada: number
  /** Por qué no abrió la última dirección. */
  error?: string
  /** Lo que baja el agente: dónde, y el nombre que le puso Chromium a la descarga en curso. */
  descargas: string | null
  guid: string | null
  /** Su id en CDP: no cambia mientras viva. */
  id?: Promise<string>
  /** Ya cargó su primera página: antes, Chromium no tiene en qué depurarla. */
  lista: Promise<unknown>
}

const hojas = new Map<string, Hoja>()
/** La última dirección de cada hilo, para volver a ella si su página se cerró por ociosa. */
const ultimas = new Map<string, string>()
let ventana: BrowserWindow | undefined
/** El hilo que se ve y dónde. */
let vista: { hilo: string; caja: Caja } | null = null
/**
 * El tamaño de una página que no se ve: el del panel la última vez, en píxeles de la ventana. Sin tamaño mediría 0×0, y
 * el agente no podría pulsar nada en ella.
 */
let medida = { width: 1280, height: 800 }

/** Pone el navegador: lo que pide la interfaz, el perfil de las páginas y el relevo para el agente. */
export function iniciarNavegador(appDir: string) {
  for (const p of [PARTICION, PARTICION_REDES]) prepararPerfil(session.fromPartition(p))

  ipcMain.on('navegador:ver', (_e, hilo: string | null, caja?: Caja) => ver(hilo, caja))
  ipcMain.on('navegador:ir', (_e, hilo: string, url: string) => {
    if (!/^https?:\/\//i.test(url)) return
    const h = hojas.get(hilo) ?? abrir(hilo)
    void h.vista.webContents.loadURL(url).catch(() => {}) // el error llega por did-fail-load
  })
  ipcMain.on('navegador:hacer', (_e, hilo: string, accion: AccionNavegador) => hacer(hilo, accion))
  ipcMain.handle('navegador:estados', () => [...hojas.values()].map(estado))
  setInterval(() => {
    for (const h of hojas.values()) if (vista?.hilo !== h.hilo && !h.conexiones.size && Date.now() - h.usada > OCIOSA) cerrar(h)
  }, 60_000).unref()

  mkdirSync(join(appDir, 'data'), { recursive: true })
  relevar(join(appDir, 'data', 'navegador-integrado.json'))
}

/** Un perfil de las páginas: cómo se presenta a los sitios, qué permisos da y dónde van las descargas. */
function prepararPerfil(perfil: Session) {
  // Sin «Electron» ni el nombre de la app: algunos sitios no dejan entrar a un navegador que no conocen.
  perfil.setUserAgent(perfil.getUserAgent().replace(/ Electron\/\S+/, '').replace(new RegExp(` ${app.getName().replace(/\W/g, '\\$&')}/\\S+`, 'i'), ''))
  // Ningún permiso que pida una página (cámara, ubicación, avisos), salvo copiar y la pantalla completa.
  const permitidos = new Set(['clipboard-sanitized-write', 'fullscreen'])
  perfil.setPermissionRequestHandler((_wc, permiso, responder) => responder(permitidos.has(permiso)))
  perfil.setPermissionCheckHandler((_wc, permiso) => permitidos.has(permiso))
  // Lo que pidió bajar el agente va a la carpeta que dijo; lo tuyo, donde elijas.
  perfil.on('will-download', (_e, item, wc) => {
    const h = [...hojas.values()].find((x) => x.vista.webContents === wc)
    if (h?.descargas && h.guid) item.setSavePath(join(h.descargas, h.guid))
  })
}

/** La ventana de Sloth, cada vez que se abre: las páginas van dentro de ella. */
export function ventanaDelNavegador(v: BrowserWindow) {
  ventana = v
  for (const h of hojas.values()) v.contentView.addChildView(h.vista)
  // Si la interfaz se recarga, vuelve a decir qué hilo se ve; mientras tanto, nada tapa su arranque.
  v.webContents.on('did-start-navigation', (d) => d.isMainFrame && !d.isSameDocument && ver(null))
  v.on('closed', () => {
    if (ventana === v) ventana = undefined
    vista = null
  })
}

/** Una página nueva para un hilo, en blanco y escondida. */
function abrir(hilo: string): Hoja {
  const partition = hilo === NAVEGADOR_REDES ? PARTICION_REDES : PARTICION
  const v = new WebContentsView({ webPreferences: { partition, sandbox: true, backgroundThrottling: false } })
  v.setBackgroundColor(FONDO)
  v.setVisible(false)
  v.setBounds({ x: 0, y: 0, ...medida })
  const wc = v.webContents
  // La de las redes publica escondida: el video que sube no suena.
  if (hilo === NAVEGADOR_REDES) wc.setAudioMuted(true)
  // Lista en cuanto navega por primera vez (ya tiene proceso), aunque lo que carga tarde.
  const lista = new Promise<void>((r) => {
    wc.once('did-navigate', () => r())
    wc.once('did-stop-loading', () => r())
  })
  const h: Hoja = { hilo, vista: v, conexiones: new Map(), usada: Date.now(), descargas: null, guid: null, lista }
  hojas.set(hilo, h)
  void wc.loadURL('about:blank')
  // Una sola página por hilo: lo que abriría otra pestaña se abre en ella.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void wc.loadURL(url).catch(() => {})
    return { action: 'deny' }
  })
  // El «¿Salir del sitio?» de una página: la ventana no lo enseña, y sin esto cancelaría cada navegación (la del agente,
  // la de las redes y la tuya). Se sale sin preguntar.
  wc.on('will-prevent-unload', (e) => e.preventDefault())
  wc.on('did-start-navigation', (d) => {
    if (!d.isMainFrame || d.isSameDocument) return
    h.error = undefined
    avisar(h)
  })
  wc.on('did-fail-load', (_e, codigo, descripcion, url, principal) => {
    // -3 es una carga que otra cortó: no es un error.
    if (!principal || codigo === -3) return
    h.error = `${descripcion || `Error ${codigo}`} · ${url}`
    avisar(h)
  })
  wc.on('did-stop-loading', () => avisar(h))
  wc.on('did-navigate', () => avisar(h))
  wc.on('did-navigate-in-page', () => avisar(h))
  wc.on('page-title-updated', () => avisar(h))
  wc.debugger.on('message', (_e, metodo, params, sesion) => {
    if (metodo === 'Browser.downloadWillBegin') h.guid = typeof params?.guid === 'string' ? params.guid : null
    for (const relevo of h.conexiones.values()) relevo.evento(metodo, params, sesion || undefined)
  })
  // Se soltó el depurador (se cerró la página o se cayó): el agente se entera al cortarse su conexión.
  wc.debugger.on('detach', () => {
    for (const ws of h.conexiones.keys()) ws.close()
  })
  // Si aun así se cerró, la siguiente vez que se pida nace otra.
  wc.once('destroyed', () => {
    if (hojas.get(hilo) !== h) return
    hojas.delete(hilo)
    for (const ws of h.conexiones.keys()) ws.close()
    ventana?.contentView.removeChildView(v)
  })
  ventana?.contentView.addChildView(v)
  return h
}

/** Cierra la página de un hilo, que vuelve a su última dirección la próxima vez que se vea. */
function cerrar(h: Hoja) {
  hojas.delete(h.hilo)
  for (const ws of h.conexiones.keys()) ws.close()
  ventana?.contentView.removeChildView(h.vista)
  h.vista.webContents.close()
}

function estado(h: Hoja): EstadoNavegador {
  const wc = h.vista.webContents
  const url = wc.getURL()
  return {
    hilo: h.hilo,
    url: url === 'about:blank' ? '' : url,
    titulo: wc.getTitle(),
    cargando: wc.isLoading(),
    atras: wc.navigationHistory.canGoBack(),
    adelante: wc.navigationHistory.canGoForward(),
    agente: h.conexiones.size > 0,
    ...(h.error ? { error: h.error } : {})
  }
}

const mandar = (e: EstadoNavegador) => ventana && !ventana.isDestroyed() && ventana.webContents.send('navegador:estado', e)

/** Le dice a la interfaz cómo va la página, y la enseña o la esconde. */
function avisar(h: Hoja) {
  if (h.vista.webContents.isDestroyed()) return
  const e = estado(h)
  if (e.url) ultimas.set(h.hilo, e.url)
  mandar(e)
  colocar(h)
}

/**
 * Lo que pide la interfaz: la página del hilo, en la caja del panel. Sin hilo (o con algo encima del panel, un modal),
 * ninguna. Si la página del hilo se cerró por ociosa, vuelve a abrirse en su última dirección.
 */
function ver(hilo: string | null, caja?: Caja) {
  const antes = vista?.hilo
  vista = hilo && caja && caja.width > 0 && caja.height > 0 ? { hilo, caja } : null
  if (antes && antes !== vista?.hilo) {
    const h = hojas.get(antes)
    if (h) colocar(h)
  }
  if (!vista) return
  let h = hojas.get(vista.hilo)
  const ultima = ultimas.get(vista.hilo)
  if (!h && ultima) {
    h = abrir(vista.hilo)
    void h.vista.webContents.loadURL(ultima).catch(() => {})
  }
  if (h) colocar(h)
}

/** Se ve si es la del hilo que se ve y tiene algo que enseñar; si no, la interfaz enseña su aviso o su error. */
function colocar(h: Hoja) {
  const v = h.vista
  const e = estado(h)
  const visible = !!ventana && vista?.hilo === h.hilo && !!e.url && !e.error
  if (!visible || !ventana || !vista) return v.setVisible(false)
  // La caja llega en píxeles de la interfaz: con zoom, no son los de la ventana.
  const z = ventana.webContents.getZoomFactor()
  const { x, y, width, height } = vista.caja
  medida = { width: Math.round(width * z), height: Math.round(height * z) }
  v.setBounds({ x: Math.round(x * z), y: Math.round(y * z), ...medida })
  // Encima de las demás páginas.
  ventana.contentView.addChildView(v)
  v.setVisible(true)
  h.usada = Date.now()
}

function hacer(hilo: string, accion: AccionNavegador) {
  const h = hojas.get(hilo)
  if (!h) return
  const wc = h.vista.webContents
  if (accion === 'atras') wc.navigationHistory.goBack()
  if (accion === 'adelante') wc.navigationHistory.goForward()
  if (accion === 'recargar') wc.reload()
  if (accion === 'parar') wc.stop()
  if (accion === 'fuera' && /^https?:\/\//i.test(wc.getURL())) void shell.openExternal(wc.getURL())
}

/**
 * El relevo para el agente: `ws://127.0.0.1:<puerto>/<secreto>/<hilo>` es un navegador con una sola página, la del hilo
 * (que se abre si no estaba). Lo que llega de una página web (con `Origin`) o sin el secreto se cierra.
 */
function relevar(archivo: string) {
  let antes: { puerto?: number; secreto?: string } = {}
  try {
    antes = JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {
    // La primera vez.
  }
  const secreto = typeof antes.secreto === 'string' && antes.secreto ? antes.secreto : randomBytes(18).toString('hex')
  const http = createServer((_req, res) => res.writeHead(404).end())
  new WebSocketServer({ server: http, maxPayload: 64 * 1024 * 1024 }).on('connection', (ws, req) => {
    const [, s, hilo] = new URL(req.url ?? '/', 'http://x').pathname.split('/')
    if (s !== secreto || !hilo || req.headers.origin) return ws.close(1008)
    void conectar(ws, decodeURIComponent(hilo))
  })
  let puerto = typeof antes.puerto === 'number' ? antes.puerto : 0
  http.on('error', (e: NodeJS.ErrnoException) => {
    // Su puerto de la otra vez ya es de otro: cualquiera libre.
    if (e.code === 'EADDRINUSE' && puerto) http.listen((puerto = 0), '127.0.0.1')
    else console.error('El navegador integrado no puede escuchar al agente:', e.message)
  })
  http.listen(puerto, '127.0.0.1', () => {
    // `redes`: tiene la página de las redes, con su perfil y sus cookies (una ventana de antes no).
    guardar(archivo, JSON.stringify({ puerto: (http.address() as AddressInfo).port, secreto, pid: process.pid, redes: true }))
  })
}

/**
 * Un agente se conecta a la página de un hilo: comparte su depurador, que se suelta cuando se va el último. Lo que mande
 * mientras la página nace espera a que esté lista.
 */
async function conectar(ws: WebSocket, hilo: string) {
  const antes: string[] = []
  const guardarlo = (d: unknown) => antes.push(String(d))
  ws.on('message', guardarlo)
  const h = hojas.get(hilo) ?? abrir(hilo)
  const wc = h.vista.webContents
  await h.lista
  ws.off('message', guardarlo)
  if (ws.readyState !== ws.OPEN || wc.isDestroyed()) return ws.close()
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
  } catch (e) {
    console.error('El agente no pudo tomar el navegador del hilo:', e instanceof Error ? e.message : e)
    return ws.close(1011)
  }
  h.id ??= wc.debugger.sendCommand('Target.getTargetInfo').then((r: { targetInfo: { targetId: string } }) => r.targetInfo.targetId)
  const relevo = crearRelevo(
    {
      // Cerrar la página la deja en blanco: es la del hilo, y el panel la sigue enseñando.
      enviar: (metodo, params, sesion) =>
        metodo === 'Page.close' && !sesion ? wc.loadURL('about:blank').then(() => ({}), () => ({})) : wc.debugger.sendCommand(metodo, params, sesion),
      id: () => h.id!,
      url: () => wc.getURL(),
      titulo: () => wc.getTitle(),
      agente: () => wc.getUserAgent(),
      descargas: (carpeta) => void (h.descargas = carpeta)
    },
    (texto) => ws.readyState === ws.OPEN && ws.send(texto)
  )
  h.conexiones.set(ws, relevo)
  for (const d of antes) relevo.recibir(d)
  ws.on('message', (d) => relevo.recibir(String(d)))
  ws.on('close', () => {
    h.conexiones.delete(ws)
    h.usada = Date.now()
    if (h.conexiones.size || wc.isDestroyed()) return
    try {
      wc.debugger.detach()
    } catch {
      // Ya se había soltado.
    }
    h.id = undefined
    avisar(h)
  })
  avisar(h)
}
