// El eval de «Modelos 3D» (web/src/Modelos3D.tsx) en las otras bibliotecas, sin cuenta, en sus páginas públicas:
// Sketchfab, Poly Pizza, Poly Haven y Fab. Las 10 medidas, igual en las cuatro (y en Sloth): mismo navegador, misma
// ventana y misma legibilidad que el eval de la voz (eval-voz-comun.mjs). Donde una app pide entrar o pagar, eso es lo
// medido: hasta dónde llega sin cuenta.
// Uso: node scripts/eval-modelos3d-ajenas.mjs sketchfab|polypizza|polyhaven|fab [--solo moverse,girar,…]
// Las medidas: moverse, girar, espanol, filtro, ficha, siguiente, usar, teclado, rapidez, legibilidad; y aparte,
// solo con `--solo escritura`, las palabras como las escribe la gente (ESCRITAS); con `--solo navegar`, llegar a la
// biblioteca desde su página de inicio.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { chromium } from 'playwright-core'
import { abrirConRaton, legibilidad as legible, NAVEGADOR, VENTANA } from './eval-voz-comun.mjs'

const [cual] = process.argv.slice(2)
const r = { app: cual }
// Si una página se traba, a los 4 minutos sale con lo que alcanzó a medir (y el navegador se cierra con el proceso).
setTimeout(() => (console.log(JSON.stringify({ ...r, cortado: 'se pasó de 4 minutos' }, null, 1)), process.exit(2)), 240_000)
const paso = (que) => console.error(`[${cual}] ${que}`)
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1].split(',') : null
const toca = (que) => !solo || solo.includes(que)
const CAPTURAS = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'navegador-capturas')
mkdirSync(CAPTURAS, { recursive: true })
const captura = (nombre) => p.screenshot({ path: join(CAPTURAS, `m3d-ajena-${cual}-${nombre}.png`) }).catch(() => {})

/** Las palabras de la prueba en español y lo que cuenta como acierto en un título (sin acentos, en minúsculas). */
const PALABRAS = {
  alcancía: /alcancia|piggy|\bbank\b/,
  camión: /camion|truck|lorry/,
  palmera: /palmera|\bpalm/,
  pulmones: /pulmon|\blung/,
  reloj: /reloj|clock|watch/,
  maleta: /maleta|suitcase|luggage/
}
/** Lo mismo, como lo escribe la gente: plurales, sin acento, junto o con una letra de menos (`--solo escritura`). */
const ESCRITAS = {
  camiones: /camion|truck|lorry/,
  palmeras: /palmera|palm/,
  alcancia: /alcanc|piggy|money ?bank/,
  pulmon: /pulmon|lung/,
  relojes: /reloj|clock|watch/,
  maletas: /maleta|suitcase|luggage/,
  cajafuerte: /caja ?fuerte|safe|vault|boveda/,
  pulmnes: /pulmon|lung/
}

/**
 * Cada biblioteca: su página de modelos, su buscador, el enlace de cada tarjeta (`enlace`) y cómo leer su título, y los
 * pasos que solo ella tiene (filtrar, girar, usarlo).
 */
const APPS = {
  sketchfab: {
    dominio: 'sketchfab.com',
    biblioteca: 'https://sketchfab.com/3d-models',
    buscar: (q) => `https://sketchfab.com/search?q=${encodeURIComponent(q)}&type=models`,
    enlace: 'a.card-model__thumbnail-link',
    buscador: 'input[name=query]',
    titulo: (a) => a.closest('.card-model')?.querySelector('meta[itemprop=name]')?.content,
    // Lo que se ve al abrir la ficha: su ventana encima de la rejilla, con el visor (un iframe que arranca solo).
    visor: 'iframe[src*="/embed"]'
  },
  polypizza: {
    dominio: 'poly.pizza',
    biblioteca: 'https://poly.pizza/explore',
    buscar: (q) => `https://poly.pizza/search/${encodeURIComponent(q)}`,
    // Las «Paid picks» de arriba son anuncios de la Unity Asset Store, no resultados: no van a /m/.
    enlace: 'a[href^="/m/"]',
    buscador: 'input[aria-label=search]',
    titulo: (a) => a.querySelector('img')?.alt,
    visor: 'model-viewer'
  },
  polyhaven: {
    dominio: 'polyhaven.com',
    biblioteca: 'https://polyhaven.com/models',
    buscar: (q) => `https://polyhaven.com/models?s=${encodeURIComponent(q)}`,
    enlace: 'a[href^="/a/"]',
    buscador: 'input[placeholder="Search..."]',
    titulo: (a) => a.querySelector('h3')?.textContent,
    visor: 'canvas'
  },
  fab: {
    dominio: 'fab.com',
    biblioteca: 'https://www.fab.com/search',
    buscar: (q) => `https://www.fab.com/search?q=${encodeURIComponent(q)}`,
    enlace: 'a[href^="/listings/"]',
    buscador: 'input[aria-label=Buscar]',
    titulo: (a) => a.closest('[class*=fabkit-Stack-root]')?.querySelector('a[href^="/listings/"][aria-label] .fabkit-Typography-ellipsisWrapper')?.textContent ?? a.textContent,
    // Su visor 3D, en su propio dominio (/dope/).
    visor: 'iframe[src*="/dope/"]'
  }
}
const app = APPS[cual]
if (!app) throw new Error('Uso: node scripts/eval-modelos3d-ajenas.mjs sketchfab|polypizza|polyhaven|fab')

/**
 * El vigía de cada documento (también los iframes de su dominio): cuando se le pide (sessionStorage `m3d-medir`), mira
 * en cada cuadro si lo pedido ya está pintado y avisa con la hora absoluta, que vale entre páginas y marcos:
 * - `ficha`: una foto del modelo grande (≥ 60.000 px², unos 245 × 245, y la mitad a la vista) ya cargada, un
 *   `<model-viewer>` con el modelo cargado o el visor de Sketchfab ya dibujando, en una página que ya no es la de la
 *   rejilla y que no estaba antes del clic (`data-m3d-antes`: una app de una sola página cambia la dirección antes de
 *   quitar la rejilla).
 * - `miniatura`: la primera imagen de una tarjeta (`sel`) que se dibuja, cargada; dice si está a la vista.
 * Y anota cuándo aprieta el ratón (pointerdown), para contar desde ahí como en `abrirConRaton`.
 */
const VIGIA = (dominio) => {
  // No se mira aquí el dominio: un iframe nace en about:blank y, al cargar su página del mismo origen, conserva la
  // misma ventana (y este script). Se mira en cada cuadro.
  const cfg = () => { try { return JSON.parse(sessionStorage.getItem('m3d-medir') || 'null') } catch { return null } }
  addEventListener('pointerdown', () => cfg() && window.__m3dApreto?.(performance.timeOrigin + performance.now()), { capture: true })
  const pintada = (e) => {
    const b = e.getBoundingClientRect()
    const vis = Math.max(0, Math.min(b.right, innerWidth) - Math.max(b.left, 0)) * Math.max(0, Math.min(b.bottom, innerHeight) - Math.max(b.top, 0))
    return { area: b.width * b.height, vis, top: Math.round(b.top) }
  }
  // La hora de la última vuelta: si un documento nuevo heredó la ventana, sus cuadros pendientes se perdieron y hay
  // que volver a empezar (`vigilar` lo pide cada 250 ms).
  let ultima = -1e9
  const mirar = () => {
    ultima = performance.now()
    const c = cfg()
    if (!c) return (ultima = -1e9)
    if (!location.hostname.endsWith(dominio)) return requestAnimationFrame(mirar)
    let hallado = null
    if (c.tipo === 'ficha' && (window !== top || location.href !== c.desde)) {
      // Lo que cubre la opacidad de él y de sus ancestros (un velo que se desvanece la deja en 0).
      const opaco = (e) => { let o = 1; for (; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o }
      for (const e of document.querySelectorAll('img, model-viewer, canvas')) {
        const { area, vis } = pintada(e)
        if (e.hasAttribute('data-m3d-antes') || area < 60_000 || vis < area / 2 || opaco(e) === 0) continue
        // Una foto de verdad (no la miniatura borrosa de 64 px que algunas estiran mientras cargan).
        if (e.tagName === 'IMG' && e.complete && e.naturalWidth >= 200) hallado = `foto ${(e.currentSrc || e.src).slice(-60)}`
        if (e.tagName === 'MODEL-VIEWER' && e.loaded) hallado = 'model-viewer con el modelo cargado'
        // El visor de Sketchfab: su lienzo, cuando ya se fue la miniatura borrosa que lo tapa mientras carga.
        const velo = document.querySelector('.loading-thumbnail')
        if (e.tagName === 'CANVAS' && velo && opaco(velo) === 0) hallado = 'visor con el modelo dibujado'
        if (hallado) break
      }
    }
    if (c.tipo === 'miniatura' && window === top && (!c.otraPagina || location.href !== c.desde)) {
      const e = [...document.querySelectorAll(c.sel)].find((x) => x.getBoundingClientRect().width > 50 && !x.hasAttribute('data-m3d-antes'))
      if (e?.complete && e.naturalWidth > 0) { const { vis, top } = pintada(e); hallado = { aLaVista: vis > 0, top } }
    }
    if (hallado) {
      // El cuadro siguiente ya está pintado (requestAnimationFrame y luego un MessageChannel, como abrirHastaPintar).
      sessionStorage.removeItem('m3d-medir')
      requestAnimationFrame(() => {
        const mc = new MessageChannel()
        mc.port1.onmessage = () => window.__m3dListo?.(performance.timeOrigin + performance.now(), hallado, performance.now())
        mc.port2.postMessage(0)
      })
      return (ultima = -1e9)
    }
    requestAnimationFrame(mirar)
  }
  window.__m3dEmpezar = () => performance.now() - ultima < 300 || requestAnimationFrame(mirar)
  if (cfg()) window.__m3dEmpezar()
}

const navegador = await chromium.launch(NAVEGADOR)
const ctx = await navegador.newContext({ viewport: VENTANA, acceptDownloads: true })
const p = await ctx.newPage()
let apreto = 0
let alListo = null
await ctx.exposeBinding('__m3dApreto', (_, t) => (apreto = t))
await ctx.exposeBinding('__m3dListo', (_, t, que, rel) => alListo?.({ t, que, rel }))
await ctx.addInitScript(VIGIA, app.dominio)
/** Arma el vigía en esta página (y en las que se abran después en la pestaña) y espera a que avise. */
const vigilar = async (cfg, ms = 30_000) => {
  for (let i = 0; ; i++) {
    try {
      await p.evaluate((cfg) => (sessionStorage.setItem('m3d-medir', JSON.stringify({ ...cfg, desde: location.href })), window.__m3dEmpezar?.()), cfg)
      break
    } catch (e) {
      // Una página que todavía navega (una redirección): se espera y se vuelve a pedir.
      if (i > 3) throw e
      await p.waitForLoadState('load').catch(() => {})
    }
  }
  // Mientras espera, cada 250 ms se le pide a cada marco que mire: un iframe que heredó la ventana de su about:blank
  // perdió los cuadros pendientes, y el script de inicio no vuelve a correr en él.
  const pedir = setInterval(() => p.frames().forEach((f) => f.evaluate(() => window.__m3dEmpezar?.()).catch(() => {})), 250)
  const listo = new Promise((ok) => { alListo = ok; setTimeout(() => ok(null), ms) }).finally(() => clearInterval(pedir))
  // En un objeto: devolver la promesa sola haría que `await vigilar()` esperara al aviso.
  return { listo }
}
const callar = () => p.evaluate(() => sessionStorage.removeItem('m3d-medir')).catch(() => {})

/** Los avisos de cookies (y el de Poly Haven), si están. */
const cerrarAvisos = async () => {
  for (const t of ['Got it!', 'Accept cookies', 'Accept All Cookies', 'Accept all', 'Aceptar todas las cookies', 'Aceptar todo']) {
    const b = p.getByRole('button', { name: t, exact: true }).first()
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => {})
  }
}
const ir = async (url, esperar = app.enlace) => {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  if (esperar) await p.locator(esperar).first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {})
  await p.waitForTimeout(2500)
  await cerrarAvisos()
}
/**
 * Las tarjetas a la vista en orden, una por modelo: su enlace, su título y su imagen (o su enlace), que queda marcada
 * con `data-m3d-tarjeta` para encontrarla después aunque la página se haya movido.
 */
const tarjetas = (n = 8) =>
  p.evaluate(([sel, titulo, n]) => {
    const tit = eval(titulo)
    const vistas = new Map()
    for (const a of document.querySelectorAll(sel)) {
      const href = new URL(a.getAttribute('href'), location.href).href
      if (vistas.has(href)) continue
      // La tarjeta: el ancestro más chico que tiene una imagen grande (en Fab la imagen no va dentro del enlace).
      let c = a
      while (c && ![...c.querySelectorAll('img')].some((i) => i.getBoundingClientRect().width > 100)) c = c.parentElement
      const img = c && [...c.querySelectorAll('img')].find((i) => i.getBoundingClientRect().width > 100)
      const el = img ?? a
      if (!el.getBoundingClientRect().width) continue
      el.setAttribute('data-m3d-tarjeta', vistas.size)
      vistas.set(href, { i: vistas.size, href, titulo: (tit(a) ?? '').trim() })
      if (vistas.size >= n) break
    }
    return [...vistas.values()]
  }, [app.enlace, app.titulo.toString(), n])
/** Pone la imagen de la tarjeta `t` en medio de la pantalla y da su caja y su centro. */
const aLaVista = async (t) => {
  const el = p.locator(`[data-m3d-tarjeta="${t.i}"]`).first()
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await p.waitForTimeout(400)
  const c = await el.boundingBox()
  return { ...c, cx: c.x + c.width / 2, cy: c.y + c.height / 2 }
}

// --- Píxeles: para ver si algo se mueve o responde a un arrastre, se comparan capturas (PNG decodificado aquí). ---
/** Los píxeles de un PNG de 8 bits (RGB o RGBA, como los de Playwright). */
function pixeles(png) {
  let i = 8, w = 0, h = 0, tipo = 6
  const datos = []
  while (i < png.length) {
    const largo = png.readUInt32BE(i), trozo = png.toString('ascii', i + 4, i + 8)
    if (trozo === 'IHDR') (w = png.readUInt32BE(i + 8)), (h = png.readUInt32BE(i + 12)), (tipo = png[i + 17])
    else if (trozo === 'IDAT') datos.push(png.subarray(i + 8, i + 8 + largo))
    else if (trozo === 'IEND') break
    i += 12 + largo
  }
  const bpp = tipo === 6 ? 4 : 3, fila = w * bpp, crudo = inflateSync(Buffer.concat(datos)), out = Buffer.alloc(fila * h)
  for (let y = 0; y < h; y++) {
    const f = crudo[y * (fila + 1)], s = y * (fila + 1) + 1, d = y * fila
    for (let x = 0; x < fila; x++) {
      const a = x >= bpp ? out[d + x - bpp] : 0, b = y ? out[d - fila + x] : 0, c = x >= bpp && y ? out[d - fila + x - bpp] : 0
      let v = crudo[s + x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      out[d + x] = v & 255
    }
  }
  return { bpp, out }
}
/** La parte de los píxeles que cambió (más de 24 en algún canal) entre dos capturas del mismo tamaño. */
const cambio = (a, b) => {
  const x = pixeles(a), y = pixeles(b)
  if (x.out.length !== y.out.length) return 1
  let n = 0
  for (let i = 0; i < x.out.length; i += x.bpp) if (Math.abs(x.out[i] - y.out[i]) > 24 || Math.abs(x.out[i + 1] - y.out[i + 1]) > 24 || Math.abs(x.out[i + 2] - y.out[i + 2]) > 24) n++
  return n / (x.out.length / x.bpp)
}
const foto = (caja) => p.screenshot({ clip: { x: caja.x, y: caja.y, width: caja.width, height: caja.height }, animations: 'allow', caret: 'initial' })

// 1. Verlo moverse: el puntero llega a la imagen de una tarjeta y se capturan cuadros 6 s, de dos maneras: quieto
// encima, y barriéndola de lado a lado (Sketchfab gira su vista 360 así, siguiendo el puntero, cuando ya la bajó).
// Se mueve si la imagen sigue cambiando (más del 3 % de sus píxeles; una barra de carga no llega): una racha de cambios
// sin huecos de más de 500 ms con 3 o más pasados los 400 ms (un velo o un borde que aparecen al pasar el ratón
// cambian al principio y paran). Cuenta desde que el puntero llega hasta el inicio de esa racha. Resolución: lo que
// tarda una captura (~40–80 ms).
async function moverse(t, barrer) {
  const caja = await aLaVista(t)
  await p.mouse.move(5, 795)
  await p.waitForTimeout(500)
  let antes = await foto(caja)
  const cambios = []
  const t0 = Date.now()
  await p.mouse.move(caja.cx, caja.cy)
  for (let i = 0; Date.now() - t0 < 6000; i++) {
    // Barriendo: 8 puestos de ida y vuelta por el 80 % de su ancho.
    if (barrer) await p.mouse.move(caja.x + caja.width * (0.1 + 0.1 * Math.abs((i % 16) - 8)), caja.cy)
    const ahora = await foto(caja)
    const dt = Date.now() - t0
    if (cambio(antes, ahora) > 0.03) cambios.push(dt)
    antes = ahora
  }
  let inicio = 0, tarde = 0, ms = null
  for (let i = 0; i < cambios.length && ms === null; i++) {
    if (i === 0 || cambios[i] - cambios[i - 1] > 500) (inicio = cambios[i]), (tarde = 0)
    if (cambios[i] > 400) tarde++
    if (tarde >= 3) ms = inicio
  }
  return { titulo: t.titulo, como: barrer ? 'barriéndola con el puntero' : 'puntero quieto', seMueve: ms !== null, ms, cambios: cambios.length, ...(ms === null && { tiempos: cambios.slice(0, 12) }) }
}

/** Los clics de más que pide cada una para que aparezca su visor, ya en la ficha. */
const activarVisor = {
  sketchfab: async () => 0,
  polypizza: async () => 0,
  // El botón «3D» bajo la foto.
  polyhaven: async () => (await p.locator('[class*=Carousel_iconBtn]').first().click({ timeout: 15_000 }), 1),
  // Su visor (en /dope/) sale al elegir, entre sus fotos, la que lleva el cubo; no todas las fichas lo traen.
  fab: async () => {
    await p.locator('button[aria-label^="Mostrar multimedia"]').first().waitFor({ timeout: 15_000 })
    const b = p.locator('.fabkit-Thumbnail-root:has(.edsicon-cube) button[aria-label^="Mostrar multimedia"]').first()
    if (!(await b.count())) return null
    await b.click({ timeout: 10_000 })
    // En su lugar sale la foto del modelo con un botón de reproducir encima: un clic más carga el visor.
    await p.waitForTimeout(1500)
    const foto = await p.evaluate(() => { const i = [...document.querySelectorAll('img')].map((x) => x.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]; return { x: i.x + i.width / 2, y: i.y + i.height / 2 } })
    await p.mouse.click(foto.x, foto.y)
    return 2
  }
}
// 2. Girarlo a mano: desde la rejilla, clic en el primer resultado y lo que pida su visor; luego, cada ~0,6 s, un
// arrastre de 200 px en el visor hasta que su imagen cambia por el arrastre (más del 3 % de los píxeles y más del doble
// de lo que cambia sola en el mismo tiempo, por si gira sola).
async function girar(n) {
  await ir(app.buscar('truck'))
  const t = (await tarjetas(n + 1))[n]
  const caja = await aLaVista(t)
  const t0 = Date.now()
  await p.mouse.click(caja.cx, caja.cy)
  let entradas = 1
  const mas = await activarVisor[cual]().catch((e) => (paso(`visor: ${e.message.split('\n')[0]}`), null))
  if (mas === null) return { titulo: t.titulo, sePuede: false, porque: 'su ficha no trae visor 3D' }
  entradas += mas
  const visor = p.locator(app.visor).filter({ visible: true }).first()
  if (!(await visor.waitFor({ timeout: 20_000 }).then(() => true, () => false))) return { titulo: t.titulo, sePuede: false, porque: 'no apareció el visor en 20 s', entradas }
  while (Date.now() - t0 < 45_000) {
    const v = await visor.boundingBox()
    if (!v || v.width < 100) { await p.waitForTimeout(300); continue }
    const zona = { x: v.x + v.width * 0.2, y: v.y + v.height * 0.2, width: v.width * 0.6, height: v.height * 0.6 }
    const a = await foto(zona)
    await p.waitForTimeout(120)
    const a2 = await foto(zona)
    const solo = cambio(a, a2)
    const desde = Date.now() - t0
    await p.mouse.move(v.x + v.width / 2 - 100, v.y + v.height / 2)
    await p.mouse.down()
    await p.mouse.move(v.x + v.width / 2 + 100, v.y + v.height / 2, { steps: 8 })
    await p.mouse.up()
    const b = await foto(zona)
    const arrastre = cambio(a2, b)
    if (arrastre > 0.03 && arrastre > 2 * solo + 0.01) return { titulo: t.titulo, sePuede: true, entradas, ms: desde, cambio: +arrastre.toFixed(3), solo: +solo.toFixed(3) }
    await p.waitForTimeout(300)
  }
  return { titulo: t.titulo, sePuede: false, porque: 'el visor no respondió a un arrastre en 45 s', entradas }
}

// 3. Encontrar en español: los títulos de los primeros 8 resultados de cada palabra; acierta si alguno lleva la
// palabra o su traducción (en minúsculas y sin acentos), y se anota también si el primero acierta.
async function buscarPalabras(palabras) {
  const res = {}
  let aciertos = 0, primeros = 0
  const lleva = (re, t) => re.test(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
  for (const [palabra, re] of Object.entries(palabras)) {
    await ir(app.buscar(palabra))
    await p.waitForTimeout(1500)
    const titulos = (await tarjetas(8)).map((t) => t.titulo)
    const acierto = titulos.some((t) => lleva(re, t))
    const primero = titulos.length > 0 && lleva(re, titulos[0])
    aciertos += acierto
    primeros += primero
    res[palabra] = { acierto, primero, titulos }
  }
  const n = Object.keys(palabras).length
  return { aciertos: `${aciertos} de ${n}`, primeroAcierta: `${primeros} de ${n}`, palabras: res }
}
const espanol = () => buscarPalabras(PALABRAS)

/** Pulsa algo y lo cuenta. */
const pulsar = async (lista, que, loc, opciones = {}) => {
  await loc.first().click({ timeout: 15_000, ...opciones }).catch((e) => { throw new Error(`no se pudo pulsar «${que}» (paso ${lista.length + 1}): ${e.message.split('\n')[0]}`) })
  lista.push(que)
  await p.waitForTimeout(1500)
}
// 4. Filtrar por tipo: desde su biblioteca, las entradas para dejar solo vehículos.
const filtrar = {
  sketchfab: async (e) => {
    await pulsar(e, 'Category', p.getByText('All categories', { exact: true }).filter({ visible: true }).first())
    await pulsar(e, 'Cars & Vehicles', p.getByText('Cars & Vehicles', { exact: true }).filter({ visible: true }))
  },
  polypizza: async (e) => {
    await pulsar(e, 'Category', p.locator('#mui-component-select-Category, div:has(> input[name=Category])').first())
    await pulsar(e, 'Transport', p.getByRole('option', { name: 'Transport' }))
  },
  polyhaven: async (e) => {
    await pulsar(e, 'Vehicles & Transport', p.getByText('Vehicles & Transport', { exact: true }).filter({ visible: true }))
  },
  fab: async (e) => {
    // «3D» en «Tipos de productos» se despliega con su flecha; dentro, «Vehículos y transporte».
    const rama = (re) => p.locator('button.fabkit-TreeView-item').filter({ hasText: re })
    await pulsar(e, '3D (desplegar)', rama(/^3D[\d.,]+K?$/).locator('.fabkit-TreeView-arrow'))
    await pulsar(e, 'Vehículos y transporte', rama(/^Vehículos y transporte/))
  }
}
async function filtro() {
  await ir(app.biblioteca)
  const entradas = []
  try {
    await filtrar[cual](entradas)
  } catch (e) {
    return { entradas, error: e.message.split('\n')[0], url: p.url() }
  }
  await p.waitForTimeout(2000)
  await captura('filtro')
  return { entradas: entradas.length, pasos: entradas, url: p.url(), primeros: (await tarjetas(6)).map((t) => t.titulo) }
}

// 5. Abrir la ficha: un clic de persona (aprieta, 100 ms, suelta) en el resultado n, desde que aprieta hasta que la
// imagen del modelo está pintada en su ficha (VIGIA). En Sketchfab, además, hasta ver su ventana (abrirConRaton).
async function ficha(n) {
  await ir(app.buscar('truck'))
  const t = (await tarjetas(n + 1))[n]
  const caja = await aLaVista(t)
  await p.mouse.move(caja.cx, caja.cy)
  await p.waitForTimeout(300)
  apreto = 0
  await p.evaluate(() => document.querySelectorAll('img, model-viewer, canvas').forEach((e) => e.setAttribute('data-m3d-antes', '')))
  const { listo } = await vigilar({ tipo: 'ficha' })
  await p.waitForTimeout(50)
  await p.mouse.down()
  await p.waitForTimeout(100)
  await p.mouse.up()
  const fin = await listo
  await callar()
  if (n === 0) await captura('ficha')
  return { titulo: t.titulo, ms: fin && apreto ? Math.round(fin.t - apreto) : null, que: fin?.que ?? 'no se vio la imagen en 30 s', url: p.url() }
}

// 6. Pasar al siguiente: desde la ficha del primero, a la del segundo resultado. Si trae flecha (o → la mueve), 1.
async function siguiente() {
  await ir(app.buscar('truck'))
  const [t1, t2] = await tarjetas(2)
  const caja = await aLaVista(t1)
  await p.mouse.click(caja.cx, caja.cy)
  await p.waitForTimeout(5000)
  const enLa2 = () => p.url().split('?')[0] === t2.href.split('?')[0]
  if (cual === 'sketchfab') {
    // Su ventana trae flechas a los lados; y se prueba → también.
    await p.locator('.c-model-page-popup__arrow.--right').click({ timeout: 10_000 })
    await p.waitForTimeout(2500)
    const conFlecha = enLa2()
    await p.goBack()
    await p.waitForTimeout(2500)
    await p.keyboard.press('ArrowRight')
    await p.waitForTimeout(2500)
    return { entradas: conFlecha ? 1 : null, como: 'flecha → de su ventana', conTecla: enLa2() }
  }
  const antes = p.url()
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(2000)
  const conTecla = p.url() !== antes && enLa2()
  await p.goBack()
  await p.locator(app.enlace).first().waitFor({ timeout: 20_000 })
  await p.waitForTimeout(1500)
  const t = (await tarjetas(2))[1]
  const c2 = await aLaVista(t)
  await p.mouse.click(c2.cx, c2.cy)
  await p.waitForTimeout(3000)
  return { entradas: 2, como: 'no trae flecha: volver + clic en el segundo', conTecla, llego: enLa2() }
}

// 7. Usarlo: desde la rejilla, las entradas hasta tener el archivo (o hasta donde pide entrar).
const pideEntrar = async () => /login|sign-?in|signin|\/id\//i.test(p.url()) || (await p.getByText(/Log in to Sketchfab|Iniciar sesión con|Inicia sesión|Sign in with/i).filter({ visible: true }).count()) > 0
async function usar() {
  const e = []
  try {
    return await usarCon(e)
  } catch (err) {
    await captura('usar')
    return { entradas: e.length, pasos: e, error: err.message.split('\n')[0], url: p.url() }
  }
}
async function usarCon(e) {
  const q = cual === 'sketchfab' ? 'https://sketchfab.com/search?q=truck&type=models&features=downloadable' : cual === 'fab' ? 'https://www.fab.com/search?q=truck&is_free=1' : app.buscar('truck')
  await ir(q)
  const caja = await aLaVista((await tarjetas(1))[0])
  await p.mouse.click(caja.cx, caja.cy), e.push('el resultado')
  await p.waitForTimeout(5000)
  const bajada = p.waitForEvent('download', { timeout: 25_000 }).catch(() => null)
  const fin = async (extra = {}) => {
    const d = await Promise.race([bajada, p.waitForTimeout(extra.espera ?? 25_000).then(() => null)])
    const archivo = d?.suggestedFilename() ?? null
    await d?.cancel().catch(() => {})
    await captura('usar')
    const entrar = !archivo && (await pideEntrar())
    return { entradas: e.length, pasos: e, archivo, pideEntrar: entrar ? `en el paso ${e.length}` : false, url: p.url() }
  }
  if (cual === 'sketchfab') {
    await pulsar(e, 'Download 3D Model', p.getByRole('button', { name: /Download 3D Model/ }))
    return fin({ espera: 4000 })
  }
  if (cual === 'polypizza') {
    await pulsar(e, 'Download', p.getByRole('button', { name: /^download$/i }))
    await pulsar(e, 'Download GLB', p.locator('li:visible', { hasText: 'Download GLB' }))
    const r = await fin()
    // Antes de bajar pasa por Cloudflare Turnstile, que a un navegador automatizado no le deja.
    if (!r.archivo) r.nota = 'no bajó: pasa por Cloudflare Turnstile (challenges.cloudflare.com), que no deja al navegador automatizado'
    return r
  }
  if (cual === 'polyhaven') {
    await pulsar(e, 'Download', p.locator('[class*=Download_downloadBtnWrapper]').getByText(/^Download/).first())
    return fin()
  }
  // Fab: elegir la licencia gratis, Descargar, aceptar su licencia de uso (casilla + Aceptar), y lo que siga.
  await pulsar(e, 'Elige una licencia', p.getByRole('button', { name: /Elige una licencia/ }).filter({ visible: true }))
  await pulsar(e, 'Personal (gratis)', p.locator('[role=option]').filter({ hasText: /Personal/ }))
  await pulsar(e, 'Descargar', p.getByRole('button', { name: /^Descargar$/ }))
  // La casilla es un input escondido bajo su dibujo: el clic va a él (force), como el de una persona en el cuadrito.
  await pulsar(e, 'He leído y aceptado', p.locator('[role=dialog] input[type=checkbox]'), { force: true })
  await pulsar(e, 'Aceptar', p.getByRole('button', { name: /^Aceptar$/ }))
  // Sale «Descargar» con un archivo por formato: el botón de bajar de la fila del .glb (el de three.js).
  await p.getByRole('dialog').getByText(/\.glb$/).first().waitFor({ timeout: 15_000 })
  await p.evaluate(() => {
    let c = [...document.querySelectorAll('[role=dialog] *')].find((x) => /\.glb$/.test(x.textContent.trim()) && !x.children.length)
    while (c && !c.querySelector('button')) c = c.parentElement
    c?.querySelector('button')?.setAttribute('data-m3d-bajar', '')
  })
  await pulsar(e, 'bajar el .glb', p.locator('[data-m3d-bajar]'))
  return fin({ espera: 20_000 })
}

// 8. Teclado: con el foco en el buscador (texto escrito y resultados a la vista), Tab hasta el primer resultado y
// Enter: cuántas teclas hasta abrir su ficha.
async function teclado() {
  await ir(app.buscar('truck'))
  const [t1] = await tarjetas(1)
  await p.locator(app.buscador).filter({ visible: true }).first().focus()
  for (let n = 0; n < 80; n++) {
    const href = await p.evaluate(() => { const a = document.activeElement?.closest('a'); return a ? a.href : null })
    if (href && href.split('?')[0] === t1.href.split('?')[0]) {
      const antes = p.url()
      await p.keyboard.press('Enter')
      await p.waitForTimeout(3000)
      return { teclas: n + 1, abrio: p.url() !== antes, url: p.url() }
    }
    await p.keyboard.press('Tab')
  }
  return { teclas: null, porque: 'con 80 Tab no llegó al primer resultado' }
}

// 9. Rapidez: de pedir su biblioteca a que la primera miniatura está cargada y pintada (3 veces, la primera sin caché),
// y la fluidez al bajar 3000 px con la rueda en ~2 s (cuadros de más de 50 ms).
const MINIATURA = { sketchfab: '.card-model img.image-container__image', polypizza: 'a[href^="/m/"] img', polyhaven: '[class*=GridItem_thumb] img', fab: 'a[href^="/listings/"] img, [class*=fabkit-Thumbnail-root] img' }
async function rapidez() {
  const corridas = []
  for (let i = 0; i < 3; i++) {
    // sessionStorage es de cada dominio: se arma desde una página suya (robots.txt) y vale para la que se pide después.
    await p.goto(new URL('/robots.txt', app.biblioteca).href, { waitUntil: 'domcontentloaded' })
    const { listo } = await vigilar({ tipo: 'miniatura', sel: MINIATURA[cual] })
    await p.goto(app.biblioteca, { waitUntil: 'commit', timeout: 60_000 })
    const fin = await listo
    corridas.push(fin ? { ms: Math.round(fin.rel), ...fin.que } : { ms: null, porque: 'no se pintó en 30 s' })
    await p.waitForTimeout(1500)
  }
  await p.waitForTimeout(4000)
  await cerrarAvisos()
  await p.mouse.move(640, 450)
  await p.evaluate(() => {
    window.__cuadros = []
    let antes = performance.now()
    const f = (t) => { window.__cuadros.push(t - antes); antes = t; if (window.__cuadros.length < 600) requestAnimationFrame(f) }
    requestAnimationFrame(f)
  })
  // Lo que bajó: la página o la caja con barra que tenga debajo (algunas desplazan un contenedor, no la ventana).
  const alturas = () => p.evaluate(() => [document.scrollingElement, ...document.querySelectorAll('*')].filter((e) => e && e.scrollHeight > e.clientHeight + 50).map((e) => e.scrollTop))
  const y0 = await alturas()
  for (let i = 0; i < 30; i++) (await p.mouse.wheel(0, 100)), await p.waitForTimeout(66)
  await p.waitForTimeout(500)
  const fl = await p.evaluate(() => { const c = window.__cuadros.splice(0); return { cuadros: c.length, deMasDe50ms: c.filter((d) => d > 50).length, peorMs: Math.round(Math.max(...c)) } })
  const y1 = await alturas()
  return { corridas, fluidez: { ...fl, bajo: Math.max(0, ...y1.map((y, i) => y - (y0[i] ?? 0))) } }
}

// 9b. Llegar a la biblioteca desde dentro: en su página de inicio, un clic de persona en el enlace a sus modelos hasta
// ver la primera miniatura pintada. Es lo que en Sloth es pulsar «Modelos 3D» en la barra (la app ya está abierta).
const INICIO = {
  sketchfab: ['https://sketchfab.com/', ['a[href="/3d-models/popular"]', 'a[href^="/3d-models"]']],
  polypizza: ['https://poly.pizza/', ['a[href="/explore"]', 'a[href^="/explore"]']],
  // El «Models» de su barra está en un menú escondido: el que se ve es «Browse Models», más abajo.
  polyhaven: ['https://polyhaven.com/', ['a[href="/models"]:has-text("Browse Models")', 'a[href="/models"]']],
  fab: ['https://www.fab.com/', ['a[href="/category/3d-model"]', 'a[href^="/category/3d-model"]']]
}
async function navegar() {
  const [inicio, enlaces] = INICIO[cual]
  const corridas = []
  for (let i = 0; i < 4; i++) {
    await ir(inicio, null)
    let enlace = null
    for (const sel of enlaces) {
      const e = p.locator(sel).filter({ visible: true }).first()
      if (await e.isVisible().catch(() => false)) {
        enlace = e
        break
      }
    }
    if (!enlace) return { corridas, porque: 'no se encontró el enlace a sus modelos en el inicio' }
    await enlace.scrollIntoViewIfNeeded()
    await p.waitForTimeout(500)
    const caja = await enlace.boundingBox()
    await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
    await p.waitForTimeout(400)
    // Las miniaturas que ya están en el inicio no cuentan: solo las de la biblioteca a la que se llega.
    await p.evaluate(() => document.querySelectorAll('img').forEach((i) => i.setAttribute('data-m3d-antes', '')))
    const { listo } = await vigilar({ tipo: 'miniatura', sel: MINIATURA[cual], otraPagina: true })
    apreto = 0
    await p.mouse.down()
    await p.waitForTimeout(100)
    await p.mouse.up()
    const fin = await listo
    corridas.push(fin && apreto ? { ms: Math.round(fin.t - apreto), ...fin.que, a: p.url() } : { ms: null, porque: 'no se pintó en 30 s', a: p.url() })
    await callar()
    await p.waitForTimeout(1000)
  }
  return { corridas }
}

// 10. Legibilidad: sobre su rejilla de resultados (el ancestro más chico que tiene las tres primeras tarjetas), no la
// página entera ni sus banners.
async function legibilidad() {
  await ir(app.buscar('truck'))
  await p.evaluate((sel) => {
    const v = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width).slice(0, 3)
    let a = v[0]
    while (a && !v.every((x) => a.contains(x))) a = a.parentElement
    a?.setAttribute('data-rejilla', '')
    a?.scrollIntoView({ block: 'start' })
  }, app.enlace)
  await p.waitForTimeout(800)
  const rejilla = await legible(p, '[data-rejilla]')
  // Sin texto fuera de las fotos (el de Poly Haven va encima de la imagen, y solo al pasar el ratón): no hay qué medir
  // en la rejilla, y se mide lo que se ve de la página.
  return rejilla.letraMinima.px === 99 ? { rejilla: 'sin texto fuera de las fotos', pagina: await legible(p) } : rejilla
}

/** Corre una medida y anota su error en vez de parar todo. */
const medir = async (nombre, f) => {
  if (!toca(nombre)) return
  paso(nombre)
  try {
    r[nombre] = await f()
  } catch (e) {
    r[nombre] = { error: e.message.split('\n')[0] }
  }
}
await medir('rapidez', rapidez)
await medir('moverse', async () => {
  await ir(app.buscar('truck'))
  const ts = await tarjetas(6)
  const res = []
  for (const [i, barrer] of [[0, false], [1, false], [2, true], [3, true], [4, true]]) res.push(await moverse(ts[i], barrer))
  return res
})
await medir('ficha', async () => {
  const c = [await ficha(0), await ficha(1), await ficha(2)]
  // En Sketchfab la ficha es una ventana encima de la rejilla: también hasta verla pintada, con abrirConRaton.
  if (cual === 'sketchfab') {
    await ir(app.buscar('truck'))
    c.push({ ventanaConRatonMs: await abrirConRaton(p, app.enlace, '.c-model-page-popup') })
  }
  return c
})
await medir('girar', async () => [await girar(0), await girar(1)])
await medir('siguiente', siguiente)
await medir('teclado', teclado)
await medir('filtro', filtro)
await medir('usar', usar)
await medir('legibilidad', legibilidad)
await medir('espanol', espanol)
// Solo cuando se pide (`--solo escritura`): con las otras diez no cabría en los 4 minutos.
if (solo?.includes('escritura')) await medir('escritura', () => buscarPalabras(ESCRITAS))
// Y `--solo navegar`: llegar a la biblioteca desde su inicio.
if (solo?.includes('navegar')) await medir('navegar', navegar)

console.log(JSON.stringify(r, null, 1))
// Cerrar a veces no vuelve nunca: se espera un momento y se sale igual.
await Promise.race([ctx.close().then(() => navegador.close()), new Promise((ok) => setTimeout(ok, 5000))])
process.exit(0)
