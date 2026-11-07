// Lo que comparten el eval del menú «Voz» (eval-voz.mjs) y el de las otras apps (eval-voz-ajenas.mjs): el mismo
// navegador, el mismo detector de sonido y el mismo cálculo de legibilidad, para que se midan igual.

/** Edge en Windows; Chrome en lo demás. Fuera de la pantalla, sin pedir gesto para sonar. */
export const NAVEGADOR = {
  ...(process.platform === 'win32' ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : { channel: 'chrome' }),
  headless: false,
  args: ['--window-position=-2400,0', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
}
export const VENTANA = { width: 1280, height: 800 }

/** Cada vez que algo empieza a sonar se anota cuándo; no cuenta el clip de silencio con que Suno desbloquea el audio. */
export const DETECTOR = () => {
  window.__sonidos = []
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    this.addEventListener('playing', () => /sil-\d+\.mp3/.test(this.currentSrc) || window.__sonidos.push({ t: performance.now(), src: this.currentSrc }), { once: true })
    return play.call(this)
  }
  // Y lo que suena por Web Audio (AI Studio toca así lo que genera).
  const start = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...a) {
    window.__sonidos.push({ t: performance.now(), src: 'webaudio' })
    return start.apply(this, a)
  }
}

/**
 * Pulsa `disparador` y mide los ms hasta que lo de `listo` está en pantalla de verdad: el cuadro siguiente a que
 * aparece ya pintado (requestAnimationFrame y luego un MessageChannel, que corre tras pintar). Vale igual para un
 * menú que se arma al abrir y para uno que ya estaba armado y solo se enseña (por eso mira también los atributos).
 */
export const abrirHastaPintar = (p, disparador, listo) =>
  p.evaluate(
    ([disparador, listo]) =>
      new Promise((ok) => {
        const t = performance.now()
        let ya = false
        const hecho = () => {
          if (ya || !document.querySelector(listo)) return false
          ya = true
          requestAnimationFrame(() => {
            const mc = new MessageChannel()
            mc.port1.onmessage = () => ok(Math.round(performance.now() - t))
            mc.port2.postMessage(0)
          })
          return true
        }
        new MutationObserver((_, o) => hecho() && o.disconnect()).observe(document.body, { childList: true, subtree: true, attributes: true })
        document.querySelector(disparador).click()
        hecho()
      }),
    [disparador, listo]
  )

/**
 * Lo mismo, con un clic como el de una persona: el ratón aprieta, pasan `apretado` ms (unos 100 en la gente) y suelta.
 * Cuenta desde que aprieta hasta que lo de `listo` está pintado. Un menú que abre al soltar paga esos ms; uno que abre
 * al apretar, no.
 */
export async function abrirConRaton(p, disparador, listo, apretado = 100) {
  const caja = await p.locator(disparador).first().boundingBox()
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
  await p.waitForTimeout(300)
  await p.evaluate((listo) => {
    window.__abrir = { desde: 0, hasta: 0 }
    addEventListener('pointerdown', () => (window.__abrir.desde = performance.now()), { capture: true, once: true })
    const hecho = () => {
      if (!window.__abrir.desde || !document.querySelector(listo)) return false
      requestAnimationFrame(() => {
        const mc = new MessageChannel()
        mc.port1.onmessage = () => (window.__abrir.hasta = performance.now())
        mc.port2.postMessage(0)
      })
      return true
    }
    new MutationObserver((_, o) => hecho() && o.disconnect()).observe(document.body, { childList: true, subtree: true, attributes: true })
  }, listo)
  await p.mouse.down()
  await p.waitForTimeout(apretado)
  await p.mouse.up()
  await p.waitForFunction(() => window.__abrir.hasta, null, { timeout: 10_000 }).catch(() => {})
  return p.evaluate(() => (window.__abrir.hasta ? Math.round(window.__abrir.hasta - window.__abrir.desde) : null))
}

/** Espera a que suene algo pedido después de `desde` (un `performance.now()` de la página). */
export async function sonido(p, desde, ms = 8000) {
  const hasta = Date.now() + ms
  while (Date.now() < hasta) {
    const s = await p.evaluate((d) => window.__sonidos.find((x) => x.t >= d), desde)
    if (s) return { ms: Math.round(s.t - desde), src: s.src.slice(0, 90) }
    await p.waitForTimeout(15)
  }
  return null
}

/**
 * El contraste más bajo (razón WCAG) y la letra más chica del texto visible dentro de `sel` (sin `sel`, o si no está, la
 * página). Entiende color(srgb …), lo que da color-mix, y mezcla los fondos semitransparentes con los de debajo. No
 * cuenta el texto pintado encima de una imagen o un video, ni el de color transparente con un degradado: su fondo o su
 * color de verdad no se pueden leer del CSS.
 */
export const legibilidad = (p, sel) =>
  p.evaluate((sel) => {
    const raiz = (sel && document.querySelector(sel)) || document.body
    const leer = (c) => { const n = (c.match(/[\d.]+/g) || []).map(Number); return c.startsWith('color(srgb') ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : [n[0], n[1], n[2], n[3] ?? 1] }
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const sobre = (a, b) => [0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3])).concat(1)
    const fondo = (el) => { const capas = []; for (let e = el; e; e = e.parentElement) { const c = leer(getComputedStyle(e).backgroundColor); if (c.length >= 3 && c[3] > 0) { capas.push(c); if (c[3] >= 1) break } } let base = [255, 255, 255, 1]; for (const c of capas.reverse()) base = sobre(c, base); return base }
    const imagenes = [...document.querySelectorAll('img, picture, video, canvas, *')]
      .filter((e) => e.matches('img, picture, video, canvas') || getComputedStyle(e).backgroundImage.includes('url('))
      .map((e) => e.getBoundingClientRect())
      // Una foto o una portada, no un contenedor entero con una textura de fondo.
      .filter((r) => r.width > 8 && r.height > 8 && r.width * r.height < innerWidth * innerHeight * 0.25)
    const encima = (r) => imagenes.some((i) => r.left < i.right && r.right > i.left && r.top < i.bottom && r.bottom > i.top)
    let peor = { ratio: 99 }, chica = { px: 99 }
    for (const el of raiz.querySelectorAll('*')) {
      const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
      if (!t) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || encima(r)) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || +s.opacity === 0) continue
      // Un texto de color transparente pintado con un degradado (`background-clip: text`): su color no está en el CSS.
      if (leer(s.color)[3] < 0.05) continue
      const f = fondo(el), a = lum(sobre(leer(s.color), f)), b = lum(f)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      if (ratio < peor.ratio) peor = { ratio: +ratio.toFixed(2), texto: t.slice(0, 30) }
      if (parseFloat(s.fontSize) < chica.px) chica = { px: parseFloat(s.fontSize), texto: t.slice(0, 30) }
    }
    return { contrasteMinimo: peor, letraMinima: chica }
  }, sel)

/**
 * Palabras en inglés de las que dicen cómo suena una voz: si una sale en la descripción, no está en español. Es la
 * lista de las que traen AI Studio, Fish Audio y ElevenLabs.
 */
export const INGLES = /\b(male|female|young|old|middle|aged|narration|narrator|deep|calm|soft|low|high|pitch|and|warm|clear|voice|serious|news|social|character|story|storyteller|conversational|professional|friendly|gentle|bright|smooth|confident|energetic|mature|youthful|upbeat|firm|breezy|husky|raspy|whisper|dramatic|funny|happy|sad|angry|english|spanish|american|british|mexican|latin)\b/i
