// Captura una página real (o un post de X) y guarda, dentro del mismo PNG, el texto que se ve: cada palabra con su caja,
// su línea base y su letra (familia, tamaño, peso, color y fondo), leídos de la página y no de la imagen. `ubicar.py` los
// usa en vez del OCR: la frase se busca con el texto de verdad, la marca cae justo encima y la traducción sale con la
// letra, el tamaño y el color del original.
//
//   node <skill>/scripts/pagina.mjs <url> <salida.png> [--ancho 400] [--alto 1600] [--escala 3] [--frase "texto exacto" ...]
//                                   [--contexto] [--elemento "selector css"] [--angosta 380] [--tema claro|oscuro]
//   node <skill>/scripts/pagina.mjs <copia.mhtml> <salida.png> --ancho 300     otra vez, desde la copia y sin internet
//
// Qué se recorta:
// - Con `--frase` (se repite), un recorte por frase: el bloque más chico que la contiene (párrafo, cita, título; la fila
//   si es un dato de una celda corta), con un margen, sin lo fijo que lo tape y bajando por la página si carga al llegar.
//   Mayúsculas, espacios, saltos y comillas o guiones curvos no cuentan. Una frase va a `<salida>`; varias, a
//   `<salida>-1.png`, `-2.png`... Lo alto no pasa de `--alto`: si el bloque no cabe, van los renglones enteros alrededor
//   de la frase. Imprime un JSON por frase con su PNG, el texto tal como está en la página y cuántas veces sale, o «no está
//   en la página»; sale con error solo si no encontró ninguna.
//   Con `--contexto`, la frase corta que queda en tira (a cualquier ancho) se lleva lo de alrededor hasta llenar media
//   zona: el artículo si cabe (en x.com, el post entero) o los párrafos de abajo y de arriba.
// - Con `--elemento`, ese elemento.
// - Un post de x.com, el post solo (del avatar a la barra de likes), sin lo de arriba ni las respuestas.
// - Si no, la ventana de `--ancho` x `--alto` desde arriba.
// Lo fijo (cabeceras, avisos de cookies, barras de «inicia sesión») se quita antes de capturar.
//
// `--angosta 380` deja además `<png>-angosto.png` de cada uno, la misma página en una ventana de celular, para el corte
// vertical: el texto se vuelve a acomodar en más renglones y sale más grande.
//
// Junto a la imagen queda `fuentes/paginas/<nombre>.mhtml`, la página entera tal como estaba (texto, estilos, letras e
// imágenes): con ella se saca otra vez a otro ancho sin internet, aunque la página cambie o desaparezca. Desde la copia,
// la frase es la de entonces; si eran varias, la del número del PNG (`<nombre>-2.png`), y sale solo ese PNG.
import { mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const AQUI = dirname(fileURLToPath(import.meta.url))
const { abrirChrome } = await import(pathToFileURL(join(AQUI, '..', '..', 'video-base', 'scripts', 'chrome.mjs')).href)

const USO = `Uso: node pagina.mjs <url | copia.mhtml> <salida.png> [--ancho 400] [--alto 1600] [--escala 3]
       [--frase "texto exacto" ...] [--contexto] [--elemento "selector"] [--angosta 380] [--tema claro|oscuro]`
/** Así se llama el bloque de texto dentro del PNG; `ubicar.py` lo lee con el mismo nombre. */
export const CLAVE = 'sloth-pagina'
/** En una zona de 1080 px de ancho, la letra citada se lee en un celular desde unos 28 px. */
const LEGIBLE = 28
/** A 1080 de ancho, una captura de menos de este alto deja media zona vacía (1156 px; `BANDAS` de reglas.mjs). */
const TIRA = Math.round(0.55 * 1156)

function opciones(argv) {
  const o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) o._.push(a)
    else if (a === '--vista') o.vista = argv[++i]
    else if (a === '--frase') (o.frase ??= []).push(argv[++i] ?? '')
    else if (a.includes('=')) o[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1)
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o[a.slice(2)] = argv[++i]
    else o[a.slice(2)] = true
  }
  return o
}

/** El navegador: Edge (la captura normal; el headless shell solo sirve para el motor de video) o Chrome. */
function navegador() {
  const hay = [process.env.CHROME, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    // Mac y Linux.
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/microsoft/msedge/msedge', '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter((p) => p && existsSync(p) && !/headless-shell/i.test(p))
  if (!hay.length) throw new Error('No encontré Edge ni Chrome. Pon la ruta en la variable CHROME.')
  return hay[0]
}

/** El tema de Windows (x.com sale claro u oscuro según él), si no se pide uno. */
function temaDeWindows() {
  try {
    const r = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'], { encoding: 'utf8' })
    return /0x1\b/.test(r) ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Mete `texto` en el PNG como un bloque iTXt comprimido, antes del final. Si el PNG se edita, el bloque se pierde. */
function conTexto(png, clave, texto) {
  const datos = Buffer.concat([Buffer.from(clave, 'latin1'), Buffer.from([0, 1, 0, 0, 0]), deflateSync(Buffer.from(texto, 'utf8'))])
  const tipo = Buffer.from('iTXt', 'latin1')
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([tipo, datos])) >>> 0)
  const fin = png.length - 12 // IEND
  return Buffer.concat([png.subarray(0, fin), largo, tipo, datos, crc, png.subarray(fin)])
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

// Anuncios y rastreadores: no son material, y son lo que no deja quieta una página de noticias (amny pide a 289
// dominios, retrasa su DOMContentLoaded 5 s y en 18 s no para). Se cortan en la red; la página, sus CDN y sus fuentes pasan.
const ANUNCIOS = ['doubleclick.net', 'googlesyndication.com', 'googletagservices.com', 'googletagmanager.com',
  'google-analytics.com', 'googleadservices.com', 'adtrafficquality.google', 'amazon-adsystem.com', 'adnxs.com',
  'pubmatic.com', 'rubiconproject.com', 'openx.net', '3lift.com', 'adsrvr.org', 'bidswitch.net', 'casalemedia.com',
  'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'id5-sync.com', 'liadm.com', 'rlcdn.com', 'quantserve.com',
  'scorecardresearch.com', 'ops.co', 'smartadserver.com', 'media.net', 'yieldmo.com', 'richaudience.com', 'unrulymedia.com',
  'lijit.com', 'tapad.com', '1rx.io', 'onetag-sys.com', 'a-mx.com', 'sharethrough.com', 'teads.tv', 'adform.net', 'moatads.com',
  'doubleverify.com', 'adsafeprotected.com', 'confiant-integrations.net', 'chartbeat.com', 'chartbeat.net', 'hotjar.com',
  'cloudflareinsights.com']

// Cuándo la página está entera en la ventana. Ni `networkidle` (x.com y las webs con anuncios tienen pedidos que no
// acaban) ni el evento load (un anuncio colgado lo retiene): sus hojas de estilo y fuentes, cada imagen y video de la
// ventana ya dibujable, ningún «cargando» a la vista (no todas las webs lo marcan con role=progressbar) y 1 s sin que
// entren ni salgan nodos. La red se mira aparte, en `quieta`.
const VIGILAR = 'window.__cambio = 0; new MutationObserver(() => { window.__cambio = performance.now() }).observe(document, { childList: true, subtree: true })'
const ENTERA = `(() => {
  const H = innerHeight, W = innerWidth
  const seve = (e) => { const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W && getComputedStyle(e).visibility !== 'hidden' }
  if (document.readyState === 'loading' || document.fonts.status !== 'loaded') return false
  for (const l of document.querySelectorAll('link[rel=stylesheet]')) if (l.href && !l.sheet && !l.disabled && matchMedia(l.media || 'all').matches) return false
  if (performance.now() - window.__cambio < 1000) return false
  for (const i of document.images) if (!i.complete && seve(i)) return false
  for (const v of document.querySelectorAll('video')) if (v.readyState < 2 && seve(v)) return false
  for (const e of document.querySelectorAll('[role=progressbar],[aria-busy=true]')) if (seve(e)) return false
  const textos = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT)
  for (let t; (t = textos.nextNode());) if (/^\\s*(loading|cargando)\\s*(\\.{2,}|…)\\s*$/i.test(t.data) && seve(t.parentElement)) return false
  return true
})()`

/**
 * Vigila la red desde antes de navegar. `quieta()` espera, sin pasar de 30 s, a 1 s sin pedidos (sin contar los que
 * llevan más de 5 s abiertos: GitHub trae sus cifras y openai.com su índice después) y a que la página esté ENTERA. Los 5 s
 * no valen para el código ni los estilos: un script lento no está colgado, es que la página aún no se ha montado.
 */
function red(c) {
  const vivos = new Map()
  let ultimo = Date.now()
  c.alEvento('Network.requestWillBeSent', (e) => {
    // Los blob: y data: no avisan cuando acaban (amny deja tres scripts blob: «abiertos» para siempre).
    if (/^(Media|WebSocket|EventSource|Ping)$/.test(e.type) || !/^https?:/.test(e.request.url)) return
    vivos.set(e.requestId, [Date.now(), e.type])
    ultimo = Date.now()
  })
  const sale = (e) => { if (vivos.delete(e.requestId)) ultimo = Date.now() }
  c.alEvento('Network.loadingFinished', sale)
  c.alEvento('Network.loadingFailed', sale)
  return async function quieta(tope = 30000) {
    const t0 = Date.now()
    while (Date.now() - t0 < tope) {
      await esperar(100)
      const ahora = Date.now()
      if (ahora - ultimo > 1000 && [...vivos.values()].every(([t, tipo]) => ahora - t > 5000 && !/^(Script|Stylesheet)$/.test(tipo)) &&
        await c.evaluar(ENTERA)) return true
    }
    return false
  }
}

// La frase llega como argumento, nunca pegada al código. Se compara sin espacios ni saltos (así cruza nodos y renglones),
// en minúsculas y con un solo tipo de comillas y guiones; vale la primera aparición que se ve (no la de los lectores de
// pantalla) y que no tapa otra cosa (vals.ai pone una copia de su tabla debajo de la que se ve). Pone la frase en el
// centro de la ventana, vuelve invisible lo fijo o pegajoso que no la contiene (cabeceras, banners de cookies, «Sign up»
// de x.com) y devuelve su recorte en px CSS del documento, o null.
const BUSCAR = String.raw`(frase) => {
  const salta = /[\s­​⁠﻿]/
  const igual = (c) => ({ '‘': "'", '’': "'", '“': '"', '”': '"', '‐': '-', '‑': '-',
    '–': '-', '—': '-' })[c] ?? c.toLowerCase()[0]
  const buscada = [...frase].filter((c) => !salta.test(c)).map(igual).join('')
  const mostrar = () => { for (const e of window.__ocultos ?? []) e.style.removeProperty('visibility'), e.style.removeProperty('opacity')
    window.__ocultos = [] }
  mostrar()
  if (!buscada) return null
  let texto = ''
  const nodos = [], pos = []
  // Sin filtro en el TreeWalker: en la copia (MHTML) no corre ningún callback de la página.
  const textos = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let t; (t = textos.nextNode());) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(t.parentElement?.tagName)) continue
    for (let i = 0; i < t.data.length; i++) if (!salta.test(t.data[i])) { texto += igual(t.data[i]); nodos.push(t); pos.push(i) }
  }
  const seve = (t) => { const r = t.parentElement.getBoundingClientRect()
    return r.width > 2 && r.height > 2 && t.parentElement.checkVisibility({ visibilityProperty: true, opacityProperty: true }) }
  // El bloque de cada punta: el primer antepasado que no va en línea. Una cifra o un nombre solos no dicen nada: si
  // están en una celda corta, va su fila.
  const bloque = (t) => { let e = t.parentElement
    while (e.parentElement && /^(inline|contents)/.test(getComputedStyle(e).display)) e = e.parentElement
    const celda = e.closest('td, th, [role=cell], [role=gridcell]')
    return celda && celda.innerText.length < 200 ? celda.closest('tr, [role=row]') ?? e : e }
  const M = 16, alto = Math.min(innerHeight - 2 * M, window.__recorte ?? 1e9), ctx = window.__contexto ?? 0
  // Esconde lo fijo que no la contiene, centra la aparición y mide su recorte: lo que ocupa el texto de los dos bloques
  // o, si no cabe en la ventana, los renglones enteros alrededor de la frase. tapada si en su sitio se ve otra cosa.
  const preparar = (ini) => {
    mostrar()
    const fin = ini + buscada.length - 1, rango = document.createRange()
    rango.setStart(nodos[ini], pos[ini])
    rango.setEnd(nodos[fin], pos[fin] + 1)
    const a = bloque(nodos[ini]), b = bloque(nodos[fin]), p = nodos[ini].parentElement
    for (const e of document.querySelectorAll('body *'))
      if ((/fixed|sticky/.test(getComputedStyle(e).position) || e.matches('.notion-topbar')) && ![a, b].some((x) => e.contains(x) || x.contains(e))) {
        e.style.setProperty('visibility', 'hidden', 'important'); e.style.setProperty('opacity', '0', 'important'); window.__ocultos.push(e) }
    const medir = () => {
      const r = document.createRange(), caja = (e) => { r.selectNodeContents(e); return r.getBoundingClientRect() }
      let u = caja(a), v = caja(b)
      const f = rango.getBoundingClientRect()
      // Con contexto, si no llena media zona (ctx px CSS), lo de alrededor: el artículo entero si cabe (en x.com, el
      // post) o, si no, bloques enteros de abajo y de arriba (subiendo de nivel si no tiene hermanos), sin pasar de 1.5 ctx.
      if (ctx && Math.max(u.bottom, v.bottom) - Math.min(u.top, v.top) < ctx) {
        let e = a
        while (!e.contains(b)) e = e.parentElement
        const art = e.closest('article')
        const juntos = (x, y) => { let t = 1e9, d = -1e9, l = 1e9, de = -1e9
          for (let z = x; z; z = z === y ? null : z.nextElementSibling) {
            if (!z.checkVisibility() || /fixed|sticky/.test(getComputedStyle(z).position)) continue
            const q = z.getBoundingClientRect()
            if (q.height) { t = Math.min(t, q.top); d = Math.max(d, q.bottom); l = Math.min(l, q.left); de = Math.max(de, q.right) }
          }
          return { top: t, bottom: d, left: l, right: de, height: d - t } }
        let ini = e, fin = e, abajo = true
        if (art && caja(art).height <= alto) ini = fin = art
        else while (juntos(ini, fin).height < ctx) {
          const sig = fin.nextElementSibling, ant = ini.previousElementSibling, cabe = (x, y) => juntos(x, y).height <= 1.5 * ctx
          if (abajo && sig && cabe(ini, sig)) fin = sig
          else if (ant && cabe(ant, fin)) ini = ant
          else if (sig && cabe(ini, sig)) fin = sig
          else if (ini === fin && ini.parentElement !== document.body && cabe(ini.parentElement, ini.parentElement)) ini = fin = ini.parentElement
          else break
          abajo = !abajo
        }
        u = v = juntos(ini, fin)
      }
      let y0 = Math.min(u.top, v.top), y1 = Math.max(u.bottom, v.bottom), my = M
      if (y1 - y0 > alto) {  // en renglones enteros, sin margen: asomaría el renglón de al lado
        const aire = Math.max(0, (alto - f.height) / 2), lineas = [...r.getClientRects()]
        y0 = Math.min(f.top, ...lineas.filter((l) => l.top >= f.top - aire).map((l) => l.top))
        y1 = Math.max(f.bottom, ...lineas.filter((l) => l.bottom <= f.bottom + aire).map((l) => l.bottom))
        my = 0
      }
      return [Math.min(u.left, v.left) - M, y0 - my, Math.max(u.right, v.right) + M, y1 + my]
    }
    p.scrollIntoView({ block: 'center', behavior: 'instant' })
    const [, y0, , y1] = medir()
    scrollBy({ top: (y0 + y1 - innerHeight) / 2, behavior: 'instant' })
    let [x0, z0, x1, z1] = medir(), f = rango.getClientRects()[0]
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(innerWidth, x1); z1 = Math.min(innerHeight, z1)
    const encima = f && document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2)
    return { tapada: !encima || !(p.contains(encima) || encima.contains(p)),
             caja: [x0 + scrollX, z0 + scrollY, x1 - x0, z1 - z0], texto: rango.toString().replace(/\s+/g, ' ').trim() }
  }
  let veces = 0, primera = -1, elegida = null
  for (let i = texto.indexOf(buscada); i >= 0; i = texto.indexOf(buscada, i + 1)) {
    if (!seve(nodos[i])) continue
    veces++
    if (primera < 0) primera = i
    if (!elegida) { const r = preparar(i); if (!r.tapada) elegida = r }
  }
  if (primera < 0) return null
  return { ...(elegida ?? preparar(primera)), veces }
}`
const BAJAR = `(() => {
  const y = scrollY; scrollBy({ top: innerHeight * 0.9, behavior: 'instant' }); if (scrollY > y) return true
  // Notion y otras páginas bajan dentro de un contenedor propio y no por la ventana.
  const c = [...document.querySelectorAll('div,main')].filter((e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
  if (!c) return false
  const t = c.scrollTop; c.scrollBy({ top: c.clientHeight * 0.9, behavior: 'instant' }); return c.scrollTop > t
})()`

/** Busca la frase, bajando hasta el final si hace falta: hay secciones y comentarios que solo cargan al llegar. */
async function buscar(c, frase, quieta) {
  const llamar = () => c.evaluar(`(${BUSCAR})(${JSON.stringify(frase)})`)
  let r = null
  for (let i = 0; i < 60; i++) {
    r = await llamar()
    if (r || !(await c.evaluar(BAJAR))) break
    await esperar(300)
  }
  if (!r) return null
  // Lo que entra al llegar (imágenes, animaciones de entrada) mueve la página: se mide otra vez.
  await esperar(500)
  await quieta(10000)
  return (await llamar()) ?? r
}

/**
 * Corre en la página. Quita lo fijo, elige qué recortar y devuelve el recorte (px CSS del documento) y el texto que se ve
 * en él: renglones de palabras con su caja y su línea base (px de la imagen) y la letra de cada renglón.
 */
const LEER = `(async ({ elemento, statusId, caja, escala, alto }) => {
  let raiz = null, clip
  // Con la caja de una frase ya está todo: BUSCAR la eligió, escondió lo fijo y se esperó a que la página se calmara.
  if (caja) clip = { x: caja[0], y: caja[1], width: caja[2], height: caja[3] }
  else {
    for (const e of document.querySelectorAll('body *')) {
      const s = getComputedStyle(e)
      if (s.position === 'fixed' || s.position === 'sticky') e.style.setProperty('display', 'none', 'important')
    }
    if (elemento) raiz = document.querySelector(elemento)
    else if (statusId) raiz = [...document.querySelectorAll('article')].find((a) => a.querySelector('a[href$="/status/' + statusId + '"] time')) || document.querySelector('article')
    if (elemento && !raiz) return { error: 'no hay ningún ' + elemento }
    if (raiz) {
      // Lo de alrededor se oculta sin moverlo: así el margen del recorte queda en el fondo y no asoma el renglón vecino.
      for (const e of document.body.querySelectorAll('*')) if (!e.contains(raiz) && !raiz.contains(e)) e.style.setProperty('visibility', 'hidden', 'important')
      raiz.scrollIntoView({ block: 'center' })
    }
    const encuadre = () => raiz ? raiz.getBoundingClientRect() : { left: 0, top: -scrollY, width: innerWidth, height: alto }
    // En la copia (MHTML) la página no corre scripts ni temporizadores, y ya trae todo cargado: solo se espera en la real,
    // y solo a las imágenes del recorte. Las que esperan al scroll (loading=lazy) se piden ya: si no, salen en blanco.
    if (location.protocol !== 'file:') {
      if (raiz) await new Promise((r) => setTimeout(r, 600))
      const b0 = encuadre()
      const dentro = (i) => { const r = i.getBoundingClientRect(); return r.bottom > b0.top && r.top < b0.top + b0.height && r.right > b0.left && r.left < b0.left + b0.width }
      const faltan = [...document.images].filter((i) => !i.complete && dentro(i))
      for (const i of faltan) if (i.loading === 'lazy') i.loading = 'eager'
      await Promise.all(faltan.map((i) => new Promise((r) => { i.addEventListener('load', r); i.addEventListener('error', r); setTimeout(r, 8000) })))
    }
    await document.fonts.ready
    const margen = raiz ? 16 : 0
    const b = encuadre()
    clip = { x: Math.max(0, b.left + scrollX - margen), y: Math.max(0, b.top + scrollY - margen), width: Math.min(document.documentElement.scrollWidth, b.width + 2 * margen), height: b.height + 2 * margen }
    clip.width = Math.min(clip.width, document.documentElement.scrollWidth - clip.x)
  }

  // La letra de un elemento, una vez: familia (la primera de la lista), tamaño, peso, cursiva, color y el fondo que tiene
  // detrás (el primero que no es transparente subiendo por los padres; null si es una imagen o un degradado).
  const lienzo = document.createElement('canvas').getContext('2d')
  const letras = new Map()
  const letra = (el) => {
    if (letras.has(el)) return letras.get(el)
    const s = getComputedStyle(el)
    let fondo = null
    for (let e = el; e; e = e.parentElement) {
      const t = getComputedStyle(e)
      if (t.backgroundImage !== 'none') break
      if (t.backgroundColor && !/rgba\\(.*, 0\\)$|transparent/.test(t.backgroundColor)) { fondo = t.backgroundColor; break }
    }
    lienzo.font = s.fontStyle + ' ' + s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily
    const m = lienzo.measureText('Hg')
    const familia = s.fontFamily.split(',')[0].replace(/["']/g, '').trim()
    const generica = /serif/i.test(s.fontFamily) && !/sans-serif/i.test(s.fontFamily) ? 'serif' : 'sans-serif'
    const r = { familia, generica, tam: +(parseFloat(s.fontSize) * escala).toFixed(1), peso: +s.fontWeight || 400, italica: s.fontStyle !== 'normal', color: s.color, fondo, sube: m.fontBoundingBoxAscent }
    letras.set(el, r)
    return r
  }
  // Lo que se ve de un elemento: nada si está oculto o transparente; si un padre recorta, solo lo de adentro.
  const visibles = new Map()
  const vista = (el) => {
    if (visibles.has(el)) return visibles.get(el)
    let v = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 }
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) { v = null; break }
      if (e !== el && s.overflow !== 'visible') { const q = e.getBoundingClientRect(); v = { l: Math.max(v.l, q.left), t: Math.max(v.t, q.top), r: Math.min(v.r, q.right), b: Math.min(v.b, q.bottom) } }
    }
    visibles.set(el, v)
    return v
  }
  const palabras = []
  const bloques = new Map()
  const andar = document.createTreeWalker(raiz || document.body, NodeFilter.SHOW_TEXT)
  const rango = document.createRange()
  for (let n; (n = andar.nextNode()); ) {
    const el = n.parentElement
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue
    const q = el.getBoundingClientRect()
    if (q.bottom + scrollY < clip.y || q.top + scrollY > clip.y + clip.height) continue
    const v = vista(el)
    if (!v) continue
    const L = letra(el)
    if (/rgba\\(.*, 0\\)$|transparent/.test(L.color)) continue
    let bloque = el
    while (bloque.parentElement && getComputedStyle(bloque).display.startsWith('inline')) bloque = bloque.parentElement
    if (!bloques.has(bloque)) bloques.set(bloque, bloques.size)
    for (const m of n.textContent.matchAll(/\\S+/g)) {
      rango.setStart(n, m.index)
      rango.setEnd(n, m.index + m[0].length)
      const rs = [...rango.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5)
      if (!rs.length) continue
      const r = rs[0]
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      if (cx < v.l || cx > v.r || cy < v.t || cy > v.b) continue
      const x = (r.left + scrollX - clip.x) * escala, y = (r.top + scrollY - clip.y) * escala
      const w = r.width * escala, h = r.height * escala
      // Solo las que se leen en el recorte: con el centro dentro.
      if (x + w / 2 < 0 || y + h / 2 < 0 || x + w / 2 > clip.width * escala || y + h / 2 > clip.height * escala) continue
      palabras.push({ t: m[0], r: [x, y, w, h].map(Math.round), b: Math.round(y + L.sube * escala), k: bloques.get(bloque), L })
    }
  }
  // Renglones: palabras seguidas a la misma altura y hacia la derecha.
  const lineas = []
  for (const p of palabras) {
    const u = lineas.at(-1)?.palabras.at(-1)
    const misma = u && u.k === p.k && Math.abs((u.r[1] + u.r[3] / 2) - (p.r[1] + p.r[3] / 2)) < 0.5 * Math.max(u.r[3], p.r[3]) && p.r[0] >= u.r[0]
    if (!misma) lineas.push({ palabras: [], letra: p.L })
    lineas.at(-1).palabras.push(p)
  }
  for (const l of lineas) {
    const { sube, ...resto } = l.letra
    l.letra = resto
    for (const p of l.palabras) delete p.L
  }
  return { clip, lineas, url: location.href, titulo: document.title }
})`

/**
 * Saca un PNG con su texto a `ancho`: el de la frase (si la hay) o el que elige LEER. Devuelve lo que se imprime de él, o
 * `null` si la frase no está en la página.
 */
async function sacar(c, o, { ancho, escala, salida, copia, frase, quieta }) {
  const alto = Number(o.alto ?? 1600)
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: Number(o.vista ?? alto), deviceScaleFactor: escala, mobile: ancho < 500 })
  // Media zona, en px CSS de esta ventana: lo que pide --contexto (TIRA es a 1080 de ancho).
  const ctx = o.contexto ? Math.round(TIRA * Math.max(ancho * escala, 1080) / 1080 / escala) : 0
  await c.evaluar(`window.__recorte = ${alto}; window.__contexto = ${ctx}`)
  await esperar(400)
  const hallada = frase === undefined ? null : await buscar(c, frase, quieta)
  if (frase !== undefined && !hallada) return null
  const statusId = !hallada && /x\.com|twitter\.com/.test(o.url) ? /\/status\/(\d+)/.exec(o.url)?.[1] : null
  const r = await c.evaluar(`${LEER}(${JSON.stringify({ elemento: hallada ? null : o.elemento, statusId, caja: hallada?.caja, escala, alto })})`)
  if (r.error) throw new Error(r.error)
  const shot = await c.enviar('Page.captureScreenshot', { format: 'png', clip: { ...r.clip, scale: 1 }, captureBeyondViewport: true })
  // El tamaño de verdad, el del PNG: Chrome redondea el recorte a su manera.
  const png = Buffer.from(shot.data, 'base64')
  const ancho_px = png.readUInt32BE(16)
  const alto_px = png.readUInt32BE(20)
  const datos = { ancho: ancho_px, alto: alto_px, url: o.url, fecha: new Date().toISOString().slice(0, 10), ancho_css: ancho, escala, copia, lineas: r.lineas }
  mkdirSync(dirname(salida), { recursive: true })
  writeFileSync(salida, conTexto(png, CLAVE, JSON.stringify(datos)))
  // La letra en la zona del video vertical (1080 de ancho): lo que importa para que se lea en un celular.
  const tams = r.lineas.map((l) => l.letra.tam).sort((a, b) => a - b)
  const mediana = tams[Math.floor(tams.length / 2)] ?? 0
  const en1080 = Math.round(mediana * Math.min(1, 1080 / ancho_px))
  const n = r.lineas.reduce((s, l) => s + l.palabras.length, 0)
  const tira = alto_px * Math.min(1, 1080 / ancho_px) < TIRA
  // Más angosta, la letra crece; una frase corta sigue en tira a cualquier ancho: le hace falta lo de alrededor.
  const aviso = en1080 < LEGIBLE ? (/x\.com|twitter\.com/.test(o.url)
      ? 'chica para un celular; un post de X no baja de 380 px (encima los números de la barra de likes)'
      : 'chica para un celular; sácala otra vez desde su copia con --ancho 300 --escala 3.6')
    : !tira ? undefined
    : !hallada ? 'en tira, deja la zona medio vacía'
    : o.contexto ? 'en tira aun con lo de alrededor, deja la zona medio vacía'
    : 'en tira, deja la zona medio vacía; sácala otra vez desde su copia con --contexto'
  if (hallada) return { frase, png: salida, texto: hallada.texto, veces: hallada.veces, px: [ancho_px, alto_px], letra_1080: en1080, aviso }
  return `${salida} · ${ancho_px}x${alto_px} · ${n} palabras en ${r.lineas.length} renglones · letra ${mediana} px` +
    ` (${en1080} px a lo ancho de 1080${aviso ? `: ${aviso}` : ''})`
}

/**
 * Un Edge sin ventana listo para capturar: sin anuncios, con el agente de usuario de Edge y vigilando la red y el DOM.
 * `capturar.mjs` abre varios y les reparte una lista; `pagina.mjs` abre uno para una página.
 */
export async function abrir() {
  process.env.CHROME = navegador()
  // Sin HTTP/3: por QUIC, los JS de openai.com (Cloudflare) tardaban a veces 5-26 s en dar el primer byte, y por HTTP/2
  // nunca más de 1 s. Edge pasa a QUIC solo, en cuanto la web lo anuncia.
  const c = await abrirChrome({ extra: ['--disable-quic', '--disable-blink-features=AutomationControlled'] })
  c.quieta = red(c)
  await c.enviar('Network.enable')
  await c.enviar('Network.setBlockedURLs', { urls: ANUNCIOS.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]) })
  await c.enviar('Page.addScriptToEvaluateOnNewDocument', { source: VIGILAR })
  // Con el agente de usuario de HeadlessChrome, x.com contesta con un error.
  await c.enviar('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0' })
  return c
}

/**
 * Captura `fuente` (una URL o una copia .mhtml) en `salidaArg` con las opciones de la línea de comandos (`frase` es una
 * lista). Devuelve lo que se imprime de cada PNG: un texto sin frase, un objeto por frase (`error` si no está).
 */
export async function capturarEn(c, fuente, salidaArg, opciones_ = {}) {
  const o = { ...opciones_ }
  if (typeof o.frase === 'string') o.frase = [o.frase]
  const salida = resolve(salidaArg)
  const nombre = basename(salida, extname(salida))
  const desdeCopia = /\.mhtml$/i.test(fuente)
  const copia = desdeCopia ? resolve(fuente) : resolve('fuentes', 'paginas', `${nombre}.mhtml`)
  // De la copia salen la URL original y el recorte con que se capturó, si no se piden otros.
  if (desdeCopia) {
    const meta = copia.replace(/\.mhtml$/i, '.json')
    if (existsSync(meta)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(meta, 'utf8')))) o[k] ??= v
    // Una copia de varias frases dejó `<nombre>-1.png`, `-2.png`...: el PNG pedido dice cuál, y sale solo ese.
    if (opciones_.frase === undefined && o.frase?.length > 1) {
      const n = Number(/-(\d+)$/.exec(nombre)?.[1])
      if (!o.frase[n - 1]) throw new Error(`la copia es de ${o.frase.length} frases: pide su PNG (${nombre}-1${extname(salida)}...) o una con --frase`)
      o.frase = [o.frase[n - 1]]
    }
  }
  o.url ??= fuente
  o.tema ??= temaDeWindows() === 'light' ? 'claro' : 'oscuro'
  // Un PNG por frase: `<salida>` si es una, `<salida>-1.png`, `-2.png`... si son varias. Sin frases, uno.
  const frases = o.frase ?? [undefined]
  const pngs = frases.length === 1 ? [salida] : frases.map((_, i) => join(dirname(salida), `${nombre}-${i + 1}${extname(salida)}`))
  // En la copia no hay red ni scripts que esperar.
  const quieta = desdeCopia ? async () => true : c.quieta
  await c.enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: o.tema === 'claro' ? 'light' : 'dark' }] })
  // Por omisión, para el celular (Capturas para el celular, en MATERIAL.md).
  const ancho = Number(o.ancho ?? 400)
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: Number(o.vista ?? o.alto ?? 1600), deviceScaleFactor: Number(o.escala ?? 3), mobile: ancho < 500 })
  // La copia ya trae todo y no corre scripts: basta con que cargue. La real se espera hasta que esté entera.
  const lista = new Promise((r) => c.alEvento(desdeCopia ? 'Page.loadEventFired' : 'Page.domContentEventFired', r))
  await c.enviar('Page.navigate', { url: desdeCopia ? pathToFileURL(copia).href : fuente })
  // El tope no retiene a Node al terminar (unref): si no, cada captura duraba sus 90 s enteros.
  await Promise.race([lista, new Promise((r) => setTimeout(r, 90000).unref())])
  const avisos = []
  if (!desdeCopia) {
    if (!(await quieta())) avisos.push('la página no se quedó quieta en 30 s; mira que la captura esté entera')
    // La copia, antes de tocar nada: la página tal como se ve, para volver a sacarla sin internet.
    const { data } = await c.enviar('Page.captureSnapshot', { format: 'mhtml' })
    mkdirSync(dirname(copia), { recursive: true })
    writeFileSync(copia, data)
    writeFileSync(copia.replace(/\.mhtml$/i, '.json'), JSON.stringify({ url: fuente, frase: o.frase, elemento: o.elemento, tema: o.tema }, null, 1))
  }
  const pasadas = [[ancho, Number(o.escala ?? 3), '']]
  if (o.angosta) pasadas.push([Number(o.angosta), Number(o.escala ?? 3), '-angosto'])
  const salidas = []
  for (const [w, escala, sufijo] of pasadas) {
    for (const [i, frase] of frases.entries()) {
      const png = sufijo ? join(dirname(pngs[i]), `${basename(pngs[i], extname(pngs[i]))}${sufijo}${extname(pngs[i])}`) : pngs[i]
      const r = await sacar(c, o, { ancho: w, escala, salida: png, copia, frase, quieta })
      salidas.push(r ?? { frase, png, error: 'no está en la página' })
    }
  }
  return { salidas, avisos, copia }
}

async function main() {
  const o = opciones(process.argv.slice(2))
  const [fuente, salidaArg] = o._
  if (!fuente || !salidaArg) {
    console.error(USO)
    process.exit(1)
  }
  const c = await abrir()
  let hallo = false
  try {
    const { salidas, avisos } = await capturarEn(c, fuente, salidaArg, o)
    for (const a of avisos) console.error('Aviso: ' + a + '.')
    for (const r of salidas) {
      console.log(typeof r === 'string' ? r : JSON.stringify(r))
      hallo ||= !r.error
    }
  } finally {
    await c.cerrar()
  }
  if (!hallo) process.exit(1)
}

// Como script, captura una página; como módulo (capturar.mjs), solo presta abrir() y capturarEn().
// Con la ruta real: llamado por el enlace de ~/.claude/skills, argv[1] no es la del módulo y no haría nada.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
