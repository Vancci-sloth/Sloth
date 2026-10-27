/**
 * La app de escritorio de Sloth, con Electron. En la que se vende (`npm run compilar`) es Sloth.exe: levanta el servidor
 * con su propio Node (`node\node.exe app\scripts\start.mjs`), lo enseña en su ventana y deja su icono junto al reloj para
 * volver a abrirla o cerrar Sloth. También pone las versiones nuevas: electron-updater pregunta al cobro de Sloth y baja
 * solo lo que cambió. En el repo, `npm start` levanta el servidor y abre esta misma ventana con `SLOTH_VENTANA`, su
 * dirección: entonces solo se pone la ventana.
 *
 * En Windows todo va junto a Sloth.exe, como hasta la 0.2: `app\` (el servidor, la interfaz, y tus videos y tus hilos en
 * `app\trabajo` y `app\data`) y `node\`. Al actualizar, el instalador cambia lo demás y deja eso (scripts/instalador.nsh).
 * En Mac y Linux la app no se puede escribir (un .app firmado, un AppImage): el servidor viaja en resources/sloth y pasa a
 * `DATOS` al estrenar cada versión, junto a tus videos y tus hilos (`prepararApp`); Node se queda en resources/node.
 * Lo de fuera (enlaces, el pago, autorizar cuentas) se abre en el navegador de cada quien; lo que abre el agente, en el de
 * cada hilo, dentro de esta ventana (navegador.ts). Lo compila scripts/electron.mjs.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, createWriteStream, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, type WriteStream } from 'node:fs'
import { cp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, screen, session, shell, Tray, type WebContents } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import { guardar } from '../server/disco.ts'
import { anclada, anclar } from './barra.ts'
import { MODELOS_VIEJOS } from './modelos-viejos.ts'
import { iniciarNavegador, ventanaDelNavegador } from './navegador.ts'
import type { ActualizacionSloth } from '../shared/types.ts'

/** En el repo: la dirección del servidor que ya levantó `npm start`. */
const SOLO_VENTANA = process.env.SLOTH_VENTANA
const URL_SLOTH = SOLO_VENTANA ?? `http://localhost:${process.env.PORT ?? '4848'}`
const WINDOWS = process.platform === 'win32'
const MAC = process.platform === 'darwin'
/** Fuera de Windows, dónde viven Sloth y lo tuyo: la app no se puede escribir. */
const DATOS = MAC ? join(homedir(), 'Library', 'Application Support', 'Sloth') : join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'sloth')
/** La carpeta de Sloth.exe. */
const RAIZ = dirname(process.execPath)
const APP = SOLO_VENTANA ? (process.env.SLOTH_APP ?? process.cwd()) : WINDOWS ? join(RAIZ, 'app') : DATOS
/** El cobro de Sloth (`licencias/`): de ahí bajan el instalador y las actualizaciones. */
const COBRO = 'https://api.sloth.vancci.org'
/**
 * En Mac, electron-updater solo pone la versión nueva en una app firmada por Apple (scripts/compilar.mjs). Sin firma,
 * «Actualizar» abre en el navegador la descarga de la nueva, que se instala encima.
 */
declare const __MAC_FIRMADA__: boolean
const A_MANO = MAC && !__MAC_FIRMADA__
const REGISTRO = join(APP, 'data', 'sloth.log')
/** Dónde se dejó la ventana. */
const LUGAR = join(APP, 'data', 'ventana.json')
/** --bg de web/src/styles.css: el fondo mientras carga y el de la barra de título. */
const FONDO = '#0f0e0c'
/** Cada cuánto se pregunta si hay versión nueva. */
const CADA = 6 * 3600_000
/**
 * Si la descarga pasa este tiempo sin avanzar, está muerta: al irse el internet, la de Electron no siempre falla, se
 * queda esperando para siempre. Se corta y empieza otra.
 */
const ATORADA = 30_000
/** Tras un fallo, cuánto se espera para volver a intentar; sin internet, se espera a que vuelva. */
const REINTENTO = 5000
/** Fallos seguidos con internet y sin avanzar nada antes de decirlo y dejar el botón otra vez. */
const INTENTOS = 5

let ventana: BrowserWindow | undefined
let servidor: ChildProcess | undefined
let icono: Tray | undefined
let registro: WriteStream | undefined
/** El servidor ya dijo «Sloth en …»: la ventana puede cargar la interfaz. */
let listo = !!SOLO_VENTANA
/** Sloth ya corría, abierta de otra forma: esta es solo su ventana, y sale al cerrarla. */
let ajena = !!SOLO_VENTANA
let cerrando = false
let actualizacion: ActualizacionSloth = { actual: app.getVersion(), ...(A_MANO && { aMano: true }) }
/** La descarga en curso: cancelarla la da por muerta. */
let bajada: CancellationToken | undefined
let avanzo = 0
let fallos = 0
/** La primera pregunta por la versión nueva: la interfaz la espera, o no la vería hasta su siguiente vuelta. */
let primera: Promise<unknown> = Promise.resolve()

// Su propio nombre ante Windows: la ventana se junta con el acceso anclado y los avisos salen a nombre de Sloth.
app.setAppUserModelId(SOLO_VENTANA ? 'Sloth.Dev' : 'Sloth.App')
app.setPath('userData', join(APP, 'data', 'ventana'))
nativeTheme.themeSource = 'dark'

if (!app.requestSingleInstanceLock()) app.quit()
else {
  mudarPerfil()
  app.on('second-instance', () => abrir())
  app.on('activate', () => abrir())
  // Cerrar la ventana no cierra Sloth: sigue en su icono, trabajando.
  app.on('window-all-closed', () => ajena && app.quit())
  app.on('before-quit', () => {
    cerrando = true
    detener()
  })
  ipcMain.on('traer', () => ventana && traer(ventana))
  ipcMain.handle('actualizacion', async () => {
    await primera
    return actualizacion
  })
  ipcMain.handle('actualizar', () => {
    if (A_MANO) fuera(`${COBRO}/descargar?so=mac`)
    else if (actualizacion.nueva && actualizacion.avance === undefined) {
      actualizacion = { ...actualizacion, avance: 0, error: undefined }
      fallos = 0
      bajar()
    }
    return actualizacion
  })
  ipcMain.handle('anclada', () => anclada())
  ipcMain.handle('anclar', () => anclar())
  void app.whenReady().then(iniciar)
}

async function iniciar() {
  permisos()
  Menu.setApplicationMenu(menu())
  iniciarNavegador(APP)
  abrir()
  if (SOLO_VENTANA) return
  mkdirSync(join(APP, 'data'), { recursive: true })
  registro = createWriteStream(REGISTRO)
  process.on('uncaughtException', (e) => anotar(e.stack ?? e.message))
  // En Mac está el Dock: no hace falta el icono junto al reloj.
  if (!MAC) ponerIcono()
  try {
    if (!WINDOWS) await prepararApp()
    await prepararSkills()
  } catch (e) {
    anotar(`No se pudo poner esta versión de Sloth: ${e instanceof Error ? e.message : e}`)
  }
  arrancar()
  actualizaciones()
}

/** La ventana, o al frente si ya está. Se enseña en cuanto se pide y carga la interfaz cuando el servidor contesta. */
function abrir() {
  if (ventana) return traer(ventana)
  const { maximizada, ...medidas } = lugar()
  const v = new BrowserWindow({
    ...medidas,
    title: 'Sloth',
    show: false,
    backgroundColor: FONDO,
    // En Windows 11, la barra de título y el borde del color de Sloth (Electron los vuelve a pintar al enfocarla). En
    // Windows 10 solo se oscurecen.
    accentColor: FONDO,
    // La compilada lleva el logo en Sloth.exe y en Sloth.app; en el repo es electron.exe, con el suyo. Linux lo pide siempre.
    icon: MAC || (WINDOWS && app.isPackaged) ? undefined : app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(APP, 'assets', WINDOWS ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, autoplayPolicy: 'no-user-gesture-required' }
  })
  ventana = v
  v.setMenuBarVisibility(false)
  enlaces(v.webContents)
  ventanaDelNavegador(v)
  // Si la interfaz se cae, se recarga. Si se cae una y otra vez, recargarla sin parar solo calentaba la máquina: tras la
  // tercera en un minuto se avisa, y Ctrl+R la vuelve a cargar.
  let caidas: number[] = []
  v.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return
    caidas = [...caidas.filter((t) => Date.now() - t < 60_000), Date.now()]
    if (caidas.length <= 3) v.reload()
    else if (caidas.length === 4) dialog.showErrorBox('Sloth', 'La ventana se cerró varias veces seguidas. Recárgala con Ctrl+R: los agentes y tus archivos siguen trabajando.')
  })
  v.on('close', () => guardarLugar(v))
  v.on('closed', () => (ventana = undefined))
  if (maximizada) v.maximize()
  v.show()
  if (listo) void v.loadURL(URL_SLOTH)
}

/** Al frente, como estaba antes de minimizarla. */
function traer(v: BrowserWindow) {
  if (v.isMinimized()) v.restore()
  v.show()
  v.focus()
}

/** Dónde se dejó la ventana; la primera vez, o en una pantalla que ya no está, centrada. */
function lugar(): { x?: number; y?: number; width: number; height: number; maximizada?: boolean } {
  try {
    const l = JSON.parse(readFileSync(LUGAR, 'utf8'))
    const visible = screen.getAllDisplays().some(({ workArea: a }) => l.x < a.x + a.width && l.x + l.width > a.x && l.y < a.y + a.height && l.y + l.height > a.y)
    if (visible) return l
  } catch {
    // La primera vez.
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return { width: Math.round((width * 4) / 5), height: Math.round((height * 5) / 6) }
}

function guardarLugar(v: BrowserWindow) {
  const { x, y, width, height } = v.getNormalBounds()
  try {
    guardar(LUGAR, JSON.stringify({ x, y, width, height, maximizada: v.isMaximized() }))
  } catch {
    // Se abrirá centrada.
  }
}

const propia = (url: string) => url === URL_SLOTH || url.startsWith(`${URL_SLOTH}/`)

/** En el navegador predeterminado. Solo http y https: nada de rutas ni programas. */
function fuera(url: string) {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') void shell.openExternal(u.href)
  } catch {
    // No era una dirección.
  }
}

/**
 * Lo de fuera, al navegador: un enlace que abre otra pestaña, `window.open` o uno que cambiaría esta página. Lo que abre
 * una pestaña vacía en el clic y le pone la dirección después (el pago, autorizar Codex o YouTube) recibe una ventana
 * oculta que manda esa dirección al navegador y se cierra.
 */
function enlaces(wc: WebContents) {
  wc.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: { show: false } }
    fuera(url)
    return { action: 'deny' }
  })
  wc.on('did-create-window', (hija) => {
    hija.webContents.on('will-navigate', (e, url) => {
      e.preventDefault()
      fuera(url)
      hija.close()
    })
    setTimeout(() => hija.isDestroyed() || hija.close(), 10 * 60_000)
  })
  wc.on('will-navigate', (e, url) => {
    if (propia(url)) return
    e.preventDefault()
    fuera(url)
  })
}

/** Lo que pide la interfaz (avisos, portapapeles, micrófono) se da sin preguntar: es Sloth. A nadie más. */
function permisos() {
  session.defaultSession.setPermissionRequestHandler((_wc, _permiso, responder, d) => responder(propia(d.requestingUrl)))
  session.defaultSession.setPermissionCheckHandler((_wc, _permiso, origen) => propia(origen))
}

/**
 * Editar y Ver, con sus atajos (recargar, el zoom, las herramientas de desarrollo). En Windows no se ve; en Mac es la barra
 * de arriba, con el de la app y el de la ventana.
 */
function menu() {
  const mac = process.platform === 'darwin'
  return Menu.buildFromTemplate([...(mac ? [{ role: 'appMenu' as const }] : []), { role: 'editMenu' }, { role: 'viewMenu' }, ...(mac ? [{ role: 'windowMenu' as const }] : [])])
}

function ponerIcono() {
  icono = new Tray(join(process.resourcesPath, WINDOWS ? 'icon.ico' : 'icon.png'))
  icono.setToolTip('Sloth')
  icono.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Sloth', click: () => abrir() },
      { label: 'Ver el registro', click: () => void shell.openPath(REGISTRO) },
      { type: 'separator' },
      { label: 'Cerrar Sloth', click: () => void cerrar() }
    ])
  )
  icono.on('click', () => abrir())
}

/**
 * Fuera de Windows, el servidor y la interfaz de esta versión (resources/sloth) pasan a `DATOS` al estrenarla: cada cosa
 * reemplaza a la de antes, y lo tuyo (data, trabajo, skills) se queda. Los enlaces de node_modules/.bin van tal cual:
 * resueltos, apuntarían dentro de la app, que en un AppImage cambia de sitio cada vez que se abre.
 */
async function prepararApp() {
  const marca = join(APP, 'data', 'skills.txt')
  if (existsSync(marca) && readFileSync(marca, 'utf8') === app.getVersion()) return
  const de = join(process.resourcesPath, 'sloth')
  for (const cosa of readdirSync(de)) {
    rmSync(join(APP, cosa), { recursive: true, force: true })
    await cp(join(de, cosa), join(APP, cosa), { recursive: true, verbatimSymlinks: true })
  }
  // La copia hereda la marca de «bajado de internet» del .dmg, y macOS revisaría uno a uno los programas de los paquetes
  // (Claude Code, Codex) al lanzarlos: ya se revisó Sloth al abrirla.
  if (MAC) spawnSync('xattr', ['-dr', 'com.apple.quarantine', join(APP, 'node_modules')])
}

/**
 * Las skills viajan en resources\skills y se ponen en app\skills al estrenar cada versión, como hacía el instalador de
 * antes: lo que cada skill guarda de los tuyos (las huellas, el banco de temas, la biblioteca 3D) se queda. Los modelos
 * 3D del dueño de Sloth que traían las versiones de antes (la moneda incluida) se van, menos los que cambiaste
 * (`MODELOS_VIEJOS`).
 */
async function prepararSkills() {
  const marca = join(APP, 'data', 'skills.txt')
  if (existsSync(marca) && readFileSync(marca, 'utf8') === app.getVersion()) return
  await cp(join(process.resourcesPath, 'skills'), join(APP, 'skills'), { recursive: true })
  // Las skills de las versiones de antes llevaban una bitácora que ya no se usa.
  for (const s of readdirSync(join(APP, 'skills'))) rmSync(join(APP, 'skills', s, 'BITACORA.md'), { force: true })
  const modelos = join(APP, 'skills', 'modelos-3d', 'modelos')
  for (const [id, huellas] of Object.entries(MODELOS_VIEJOS)) {
    try {
      const fuente = readFileSync(join(modelos, id, `${id}.tsx`), 'utf8').replaceAll('\r\n', '\n')
      if (huellas.includes(createHash('sha256').update(fuente).digest('hex').slice(0, 16))) rmSync(join(modelos, id), { recursive: true, force: true })
    } catch {
      // No está: nunca llegó o ya se fue.
    }
  }
  writeFileSync(marca, app.getVersion())
}

/**
 * Hasta la 0.2.5 la ventana era WebView2, con su perfil en este mismo sitio: lo que guardó la interfaz (los borradores, lo
 * que elegiste) pasa al de Electron. Antes de abrirlo, que después ya no se puede.
 */
function mudarPerfil() {
  const perfil = app.getPath('userData')
  const viejo = join(perfil, 'EBWebView')
  if (!existsSync(viejo)) return
  const guardado = join(viejo, 'Default', 'Local Storage')
  try {
    if (existsSync(guardado) && !existsSync(join(perfil, 'Local Storage'))) cpSync(guardado, join(perfil, 'Local Storage'), { recursive: true })
    rmSync(viejo, { recursive: true, force: true })
    rmSync(join(APP, 'data', 'ventana.txt'), { force: true })
  } catch {
    // Es comodidad: sin ella, la interfaz empieza de cero.
  }
}

/** El servidor, sin consola. Lo que dice queda en app\data\sloth.log. */
function arrancar() {
  const node = WINDOWS ? join(RAIZ, 'node', 'node.exe') : join(process.resourcesPath, 'node', 'bin', 'node')
  // La ventana la pone este proceso, no start.mjs. Fuera de Windows, en su propio grupo, para cerrarlo con lo que lanzó.
  const s = spawn(node, ['scripts/start.mjs', '--no-open'], { cwd: APP, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' })
  servidor = s
  s.stdout!.on('data', escribir)
  s.stderr!.on('data', escribir)
  s.on('error', (e) => {
    dialog.showErrorBox('Sloth', `No se pudo abrir Sloth: ${e.message}`)
    salir()
  })
  s.on('exit', termino)
}

function escribir(d: Buffer) {
  registro?.write(d)
  // Lo que escribe el servidor al quedar escuchando (server/index.ts).
  if (!listo && String(d).includes('Sloth en ')) marcarListo()
}

function marcarListo() {
  listo = true
  void ventana?.loadURL(URL_SLOTH)
}

/**
 * start.mjs terminó solo. Con 0, Sloth ya corría (abierta de otra forma): queda su ventana, y al cerrarla se sale. Si no,
 * el servidor se cayó tres veces seguidas.
 */
function termino(codigo: number | null) {
  servidor = undefined
  if (cerrando) return
  if (codigo === 0) {
    ajena = true
    icono?.destroy()
    marcarListo()
    if (!ventana) app.quit()
    return
  }
  dialog.showMessageBoxSync({ type: 'warning', title: 'Sloth', message: 'Sloth se cerró.', detail: `Lo que pasó está en el registro:\n${REGISTRO}` })
  salir()
}

/** El servidor y lo que lanzó (start.mjs, los agentes, el radar…). */
function detener() {
  const pid = servidor?.pid
  servidor = undefined
  if (!pid) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  else {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      // Ya había salido.
    }
  }
}

async function cerrar() {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Sloth',
    message: '¿Cerrar Sloth?',
    detail: 'Se detiene todo lo que Sloth esté haciendo, también los videos a medias.',
    buttons: ['Cerrar Sloth', 'Cancelar'],
    defaultId: 0,
    cancelId: 1
  })
  if (response === 0) salir()
}

function salir() {
  cerrando = true
  detener()
  app.quit()
}

/**
 * Baja la versión nueva. Si se cae (sin internet, o atorada y cortada), vuelve a empezar sola en cuanto hay internet: no
 * hace falta pulsar otra vez «Actualizar». Solo tras varios fallos seguidos con internet lo dice y deja el botón.
 */
function bajar() {
  const t = (bajada = new CancellationToken())
  avanzo = Date.now()
  autoUpdater.downloadUpdate(t).catch((e: Error) => {
    if (bajada !== t) return
    const enLinea = net.isOnline()
    if (enLinea && !t.cancelled && ++fallos >= INTENTOS) {
      bajada = undefined
      actualizacion = { ...actualizacion, avance: undefined, sinRed: undefined, error: `No se pudo bajar la versión nueva: ${e.message}. Intenta otra vez.` }
      return
    }
    actualizacion = { ...actualizacion, avance: 0, sinRed: !enLinea || undefined }
    const otra = () => (net.isOnline() ? bajar() : setTimeout(otra, REINTENTO))
    setTimeout(otra, REINTENTO)
  })
}

/**
 * El instalador de la versión puesta (installer.exe, que deja ahí el instalador) es de donde salen los pedazos que no
 * cambian. Hay limpiadores de Windows (el Sensor de almacenamiento, los antivirus) que lo borran, y sin él se baja el
 * instalador entero: cientos de MB en vez de unos pocos. Se guarda un enlace duro en app\data, que no ocupa más disco,
 * y desde ahí se repone. En Mac y Linux los pedazos salen de la app misma, que nadie limpia.
 */
function guardarInstalador(cache: string) {
  const puesto = join(cache, 'installer.exe')
  const datos = join(APP, 'data')
  const copia = `instalador-${app.getVersion()}.exe`
  const mismo = (a: string, b: string) => statSync(a, { bigint: true }).ino === statSync(b, { bigint: true }).ino
  try {
    if (existsSync(puesto)) {
      if (!existsSync(join(datos, copia)) || !mismo(puesto, join(datos, copia))) {
        rmSync(join(datos, copia), { force: true })
        linkSync(puesto, join(datos, copia))
      }
    } else if (existsSync(join(datos, copia))) {
      linkSync(join(datos, copia), puesto)
      anotar('El instalador de esta versión no estaba: se repuso')
    }
    for (const f of readdirSync(datos)) if (/^instalador-.+\.exe$/.test(f) && f !== copia) rmSync(join(datos, f), { force: true })
  } catch (e) {
    anotar(`No se pudo guardar el instalador de esta versión: ${e instanceof Error ? e.message : e}`)
  }
}

function anotar(texto: unknown) {
  registro?.write(`[sloth] ${texto}\n`)
}

/**
 * Las versiones nuevas, del cobro de Sloth (`/actualizaciones`, lo que sube `npm run publicar`). Al abrir y cada 6 horas
 * pregunta; «Actualizar» (web/src/Actualizar.tsx) la baja: solo los pedazos del instalador que cambiaron desde esta
 * versión. Luego cierra Sloth, el instalador la pone y la vuelve a abrir.
 */
function actualizaciones() {
  // La versión que se bajó la última vez ya está puesta: su instalador sobra. El de esta versión se queda aparte
  // (installer.exe), que es de donde salen los pedazos que no cambian.
  const cache = WINDOWS && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'sloth-updater') : undefined
  try {
    if (cache) rmSync(join(cache, 'pending'), { recursive: true, force: true })
  } catch {
    // Aún lo usa el instalador, que acaba de abrir esta versión: se quita la próxima vez.
  }
  if (cache) guardarInstalador(cache)
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = { info: anotar, warn: anotar, error: anotar }
  autoUpdater.on('update-available', (i) => {
    // Lo que trae, en un renglón (novedad.txt al compilarla).
    const notas = typeof i.releaseNotes === 'string' ? i.releaseNotes : i.releaseNotes?.[0]?.note
    actualizacion = { ...actualizacion, nueva: i.version, novedad: notas?.split('\n')[0].trim() || undefined }
  })
  autoUpdater.on('download-progress', (p) => {
    avanzo = Date.now()
    fallos = 0
    actualizacion = { ...actualizacion, avance: Math.min(0.99, p.percent / 100), sinRed: undefined }
  })
  autoUpdater.on('update-downloaded', () => {
    bajada = undefined
    actualizacion = { ...actualizacion, avance: 1 }
    cerrando = true
    detener()
    autoUpdater.quitAndInstall(false, true)
  })
  // Sin internet al preguntar: se vuelve a preguntar en la próxima vuelta. Al bajar, los fallos los ve bajar().
  autoUpdater.on('error', (e) => bajada && anotar(`La descarga falló: ${e.message}`))
  setInterval(() => {
    if (!bajada || bajada.cancelled || Date.now() - avanzo < ATORADA) return
    anotar('La descarga no avanza: se empieza otra')
    bajada.cancel()
  }, REINTENTO)
  const revisar = async () => {
    // Quien apoya recibe lo nuevo antes: el cobro lo reconoce por su clave y esta computadora, que da el servidor.
    const c = (await fetch(`${URL_SLOTH}/api/licencia/credencial`).then((r) => r.json()).catch(() => ({}))) as { clave?: string; equipo?: string }
    autoUpdater.requestHeaders = c.clave && c.equipo ? { 'x-sloth-clave': c.clave, 'x-sloth-equipo': c.equipo } : null
    await autoUpdater.checkForUpdates().catch(() => {})
  }
  primera = revisar()
  setInterval(revisar, CADA)
}
