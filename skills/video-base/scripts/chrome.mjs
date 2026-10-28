// Chrome sin interfaz, manejado por el protocolo de DevTools por tuberías, solo con Node. Sin puppeteer ni
// playwright: no hay nada que instalar en la carpeta del vídeo.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/** El más nuevo de `<raiz>/<version>/<sub>`, si hay alguno. */
function masNuevo(raiz, sub) {
  if (!existsSync(raiz)) return []
  return readdirSync(raiz)
    .map((v) => join(raiz, v, sub))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
}

/**
 * Dónde está Chrome. Primero `CHROME` si el usuario la puso; después el headless shell (el más rápido para capturar),
 * el de las piezas de Sloth, el de puppeteer o playwright, Chrome instalado y, al final, Edge. Nunca una ruta fija con
 * versión: se rompe en cuanto se actualiza.
 */
export function buscarChrome() {
  const casa = homedir()
  const local = process.env.LOCALAPPDATA ?? join(casa, 'AppData', 'Local')
  const mac = process.platform === 'darwin'
  // Cada sistema, con su carpeta de Playwright, cómo se llaman las de puppeteer y Playwright por dentro y su Chrome o Edge.
  const { playwright, shell, chrome, sistema } =
    process.platform === 'win32'
      ? {
          playwright: join(local, 'ms-playwright'),
          shell: join('chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
          chrome: join('chrome-win64', 'chrome.exe'),
          sistema: [
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
            'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
          ]
        }
      : mac
        ? {
            playwright: join(casa, 'Library', 'Caches', 'ms-playwright'),
            shell: join(`chrome-headless-shell-mac-${process.arch}`, 'chrome-headless-shell'),
            chrome: join(`chrome-mac-${process.arch}`, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
            sistema: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
          }
        : {
            playwright: join(casa, '.cache', 'ms-playwright'),
            shell: join('chrome-headless-shell-linux64', 'chrome-headless-shell'),
            chrome: join('chrome-linux64', 'chrome'),
            sistema: ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/microsoft/msedge/msedge']
          }
  const candidatos = [
    process.env.CHROME,
    process.env.PRODUCER_HEADLESS_SHELL_PATH,
    ...masNuevo(join(casa, '.cache', 'puppeteer', 'chrome-headless-shell'), shell),
    ...masNuevo(playwright, shell),
    ...masNuevo(join(casa, '.cache', 'puppeteer', 'chrome'), chrome),
    ...masNuevo(playwright, chrome),
    ...sistema
  ].filter(Boolean)
  const hallado = candidatos.find((p) => existsSync(p))
  if (!hallado) throw new Error('No encontré Chrome ni Edge. Pon la ruta en la variable CHROME.')
  return hallado
}

/**
 * Borra los perfiles que dejaron los Chrome que no se cerraron (un render o una revisión cortados): el 22 de octubre
 * eran 410 carpetas y 18 GB en %TEMP%. Uno vivo tiene su `lockfile` abierto y no se deja borrar: ese se queda.
 */
function barrerPerfiles() {
  for (const n of readdirSync(tmpdir())) {
    if (!n.startsWith('video-base-chrome-')) continue
    const p = join(tmpdir(), n)
    try {
      // Uno recién creado aún no tiene su `lockfile`: borrarlo tumba al Chrome que abre otro proceso en ese momento.
      if (Date.now() - statSync(p).mtimeMs < 10 * 60 * 1000) continue
      if (existsSync(join(p, 'lockfile'))) rmSync(join(p, 'lockfile'))
      rmSync(p, { recursive: true, force: true })
    } catch {}
  }
}

/**
 * Con qué dibuja Chrome, en cada sistema (ADR 0006: lo de Windows lleva su par en Mac y Linux). Con `gpu`, la tarjeta por
 * ANGLE: compone, rasteriza y hace el WebGL. ANGLE habla con la tarjeta por D3D11 en Windows, por Metal en Mac y por
 * EGL en Linux (las de Remotion: `angle` y `angle-egl`); sin decírselo, Chrome sin ventana en Linux suele quedarse en
 * SwiftShader, y allí la tarjeta también hace falta sacarla de la lista negra. Sin tarjeta, en Windows WebGL (Three.js)
 * va por WARP, el rasterizador por CPU de D3D11, unas 5 veces más rápido que SwiftShader, que queda de respaldo; en Mac y
 * Linux no hay WARP: SwiftShader. Y componer y rasterizar en la CPU con Skia es mucho más rápido que emularlo: el
 * rasterizador queda solo para WebGL.
 */
export function banderasTarjeta(gpu, sistema = process.platform) {
  if (sistema === 'win32') {
    return gpu ? ['--use-angle=d3d11', '--enable-gpu-rasterization'] : ['--use-angle=d3d11-warp', '--enable-unsafe-swiftshader', '--disable-gpu-compositing']
  }
  if (!gpu) return ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing']
  if (sistema === 'darwin') return ['--use-gl=angle', '--use-angle=metal', '--enable-gpu-rasterization']
  return ['--use-gl=angle', '--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
}

/**
 * Abre un Chrome y una pestaña. Devuelve `{ enviar(metodo, params), alEvento(nombre, fn), capturar(formato, calidad), cerrar() }`.
 * `extra`: más banderas de arranque (las que solo necesita quien captura páginas de internet).
 * `gpu`: `true` dibuja con la tarjeta, `false` en la CPU y `'si-hay'` con la tarjeta si Chrome compone con ella; si no
 * puede (no hay tarjeta, o su controlador falla o Chrome no lo admite), vuelve a abrirlo en la CPU.
 */
export async function abrirChrome({ ancho, alto, gpu = false, extra = [] } = {}) {
  const exe = buscarChrome()
  // El headless shell deja que quien lo maneja dé cada fotograma (HeadlessExperimental.beginFrame): dibuja y captura en
  // una pasada, sin esperar al vsync de Chrome (unos 50 ms por captura). Chrome normal no lo tiene: captura como siempre.
  const marcos = /chrome-headless-shell/i.test(exe)
  barrerPerfiles()
  const perfil = mkdtempSync(join(tmpdir(), 'video-base-chrome-'))
  const args = [
    '--headless=new',
    '--remote-debugging-pipe',
    `--user-data-dir=${perfil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    ...banderasTarjeta(Boolean(gpu)),
    ...(marcos ? ['--deterministic-mode'] : []),
    ...extra,
    'about:blank'
  ]
  // Se le habla por dos tuberías (las 3 y 4 del proceso), un JSON por mensaje terminado en un byte 0. No por WebSocket:
  // el de Node pide permessage-deflate y Chrome comprimía cada captura (megas en base64) para que Node la descomprimiera.
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
  const [, , errores, aChrome, deChrome] = proc.stdio
  let texto = ''
  errores.on('data', (d) => (texto += d))
  aChrome.on('error', () => {})
  let id = 0
  let vivo = true
  const pendientes = new Map()
  const oyentes = new Map()
  const recibir = (msg) => {
    if (msg.id !== undefined) {
      const p = pendientes.get(msg.id)
      pendientes.delete(msg.id)
      if (msg.error) p?.mal(new Error(`${p.metodo}: ${msg.error.message}`))
      else p?.ok(msg.result)
    } else for (const fn of oyentes.get(msg.method) ?? []) fn(msg.params)
  }
  let partes = []
  deChrome.on('data', (d) => {
    for (let i; (i = d.indexOf(0)) !== -1; d = d.subarray(i + 1)) {
      partes.push(d.subarray(0, i))
      recibir(JSON.parse(Buffer.concat(partes).toString()))
      partes = []
    }
    if (d.length) partes.push(d)
  })
  // Si Chrome se cierra o se cae, lo que esperaba respuesta falla en vez de esperar para siempre.
  deChrome.on('close', () => {
    vivo = false
    for (const p of pendientes.values()) p.mal(new Error(`${p.metodo}: Chrome se cerró\n${texto}`))
    pendientes.clear()
  })
  const crudo = (metodo, params = {}, sessionId) =>
    new Promise((ok, mal) => {
      if (!vivo) return mal(new Error(`${metodo}: Chrome se cerró\n${texto}`))
      const n = ++id
      pendientes.set(n, { ok, mal, metodo })
      aChrome.write(JSON.stringify({ id: n, method: metodo, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
    })

  // Lo pregunta mientras abre la pestaña: Chrome contesta cuando arrancó su proceso de la tarjeta.
  const conTarjeta = gpu === 'si-hay' && crudo('SystemInfo.getInfo').then((r) => r.gpu?.featureStatus?.gpu_compositing === 'enabled', () => false)
  // Si en 30 s no contesta, no arrancó: se mata, y la primera orden falla con lo que haya dicho.
  const arranque = setTimeout(() => proc.kill(), 30000).unref()
  const { targetId } = await crudo('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: marcos })
  clearTimeout(arranque)
  const { sessionId } = await crudo('Target.attachToTarget', { targetId, flatten: true })
  const enviar = (metodo, params) => crudo(metodo, params, sessionId)
  // Los fotogramas, de uno en uno. Un reloj da uno sin dibujar cada 16 ms, como el vsync de siempre: así
  // requestAnimationFrame, los estilos y la carga de fuentes e imágenes siguen igual. Solo la captura dibuja.
  let cola = Promise.resolve()
  const fotograma = (params) => (cola = cola.catch(() => {}).then(() => enviar('HeadlessExperimental.beginFrame', params)))
  let latiendo = false
  const reloj = marcos && setInterval(() => {
    if (latiendo) return
    latiendo = true
    fotograma({ noDisplayUpdates: true }).catch(() => {}).finally(() => (latiendo = false))
  }, 16)
  await enviar('Page.enable')
  await enviar('Runtime.enable')
  if (conTarjeta && !(await conTarjeta)) {
    await apagar()
    return abrirChrome({ ancho, alto, gpu: false, extra })
  }
  if (ancho && alto) await enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false })
  let anterior = null

  return {
    enviar,
    /**
     * Dibuja lo que hay en la página y, en cuanto está en pantalla, devuelve `{ imagen }`: la promesa de su imagen (un
     * Buffer). Mientras Chrome la copia y la comprime, la página ya puede ir al instante siguiente.
     */
    async capturar(formato, calidad) {
      const imagen = { format: formato, ...(formato === 'jpeg' ? { quality: calidad } : {}), optimizeForSpeed: true }
      if (!marcos) return { imagen: Promise.resolve(Buffer.from((await enviar('Page.captureScreenshot', { ...imagen, fromSurface: true })).data, 'base64')) }
      // Primero se dibuja. Si nada cambió en pantalla (un collage a 12 fps repite fotogramas en un vídeo a 30), la
      // imagen es la de antes: ni se rasteriza ni se comprime otra vez.
      const clave = JSON.stringify(imagen)
      const { hasDamage } = await fotograma({})
      if (hasDamage !== false || anterior?.clave !== clave) {
        // La captura no dibuja (noDisplayUpdates): copia lo que ya está en pantalla, cambie lo que cambie la página.
        const buf = fotograma({ screenshot: imagen, noDisplayUpdates: true }).then((r) => Buffer.from(r.screenshotData, 'base64'))
        buf.catch(() => {})
        anterior = { clave, buf }
      }
      return { imagen: anterior.buf }
    },
    alEvento(nombre, fn) {
      oyentes.set(nombre, [...(oyentes.get(nombre) ?? []), fn])
    },
    /** Evalúa una expresión en la página; espera a las promesas. */
    async evaluar(expr) {
      const r = await enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    },
    cerrar: apagar
  }

  async function apagar() {
    // Chrome a veces se cierra sin contestar: no se espera más de 5 s a cada paso, y si sigue vivo, se mata.
    clearInterval(reloj)
    const espera = (ms) => new Promise((r) => setTimeout(r, ms).unref())
    await Promise.race([crudo('Browser.close').catch(() => {}), espera(5000)])
    aChrome.end()
    if (proc.exitCode === null && proc.signalCode === null) await Promise.race([new Promise((r) => proc.once('exit', r)), espera(5000)])
    if (proc.exitCode === null && proc.signalCode === null) proc.kill()
    try {
      // Los procesos hijos de Chrome sueltan sus archivos un momento después que el principal.
      rmSync(perfil, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    } catch {}
  }
}
