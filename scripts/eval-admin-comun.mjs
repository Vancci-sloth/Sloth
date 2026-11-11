// Lo que comparten el eval del Administrador (eval-admin.mjs) y el de los otros paneles (eval-admin-ajenas.mjs), para
// que se midan igual. El navegador, la ventana, el clic de persona y la legibilidad son los del eval de la voz
// (eval-voz-comun.mjs).

/** Keystroke-Level Model: una tecla, 0,28 s; apuntar y hacer clic, 1,3 s. Da los segundos. */
export const KLM = ({ teclas = 0, clics = 0 }) => +(teclas * 0.28 + clics * 1.3).toFixed(2)

/**
 * Corre `accion` (una tecla, un clic) y da los ms hasta que lo de `listo` cambió y ya está pintado: el cuadro siguiente
 * al cambio (requestAnimationFrame y luego un MessageChannel, que corre tras pintar). Cuenta como cambio cualquier
 * mutación dentro de `listo` (o de la página, si aún no está). Si en `espera` ms no cambió nada, da `null`.
 */
export async function pintado(p, accion, listo, espera = 15_000) {
  await p.evaluate((listo) => {
    window.__pintado = { desde: 0, hasta: 0 }
    const raiz = document.querySelector(listo)?.closest('table, [role="grid"], [role="table"], ul, ol, section, main') ?? document.body
    const o = new MutationObserver(() => {
      if (window.__pintado.hasta || !window.__pintado.desde) return
      o.disconnect()
      requestAnimationFrame(() => {
        const mc = new MessageChannel()
        mc.port1.onmessage = () => (window.__pintado.hasta = performance.now())
        mc.port2.postMessage(0)
      })
    })
    o.observe(raiz, { childList: true, subtree: true, characterData: true, attributes: true })
    addEventListener('keydown', () => (window.__pintado.desde ||= performance.now()), { capture: true, once: true })
    addEventListener('pointerdown', () => (window.__pintado.desde ||= performance.now()), { capture: true, once: true })
  }, listo)
  await accion()
  await p.waitForFunction(() => window.__pintado.hasta, null, { timeout: espera }).catch(() => {})
  return p.evaluate(() => (window.__pintado.hasta ? Math.round(window.__pintado.hasta - window.__pintado.desde) : null))
}

/**
 * Las palabras en inglés del texto visible dentro de `sel` (menú, cabeceras, botones, filtros, avisos). Es una lista de
 * las palabras de interfaz que usan estos paneles; no cuenta los correos ni los nombres de la gente.
 */
export const INGLES_UI =
  /\b(customers?|users?|orders?|search|filters?|export|import|create|new|edit|delete|remove|save|cancel|status|logs?|settings|dashboard|name|email|actions?|total|page|rows?|per|next|previous|prev|balance|credits?|id|external|partner|api|usage|segments?|reviews?|products?|categories|catalog|sales|invoices?|posters?|visitors?|last|seen|since|latest|purchases?|spent|groups?|newsletter|has|ordered|show|list|view|records?|collections?|fields?|columns?|sort|refresh|loading|of|to|and|the|from|all|active|inactive|suspended|created|updated|date|amount|count|admin|manage|account|profile|logout|sign|in|out|menu|home|shop|blog|team|load|more|clear|apply|reset|select|selected|none|any|items?|details?|history|activity|requests?|errors?|method|url|level|message|duration|ago|today|yesterday|week|month)\b/gi

export const enIngles = (p, sel) =>
  p.evaluate(
    ([sel, fuente]) => {
      const raiz = (sel && document.querySelector(sel)) || document.body
      const re = new RegExp(fuente, 'gi')
      const palabras = []
      const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
      for (let n = andar.nextNode(); n; n = andar.nextNode()) {
        const el = n.parentElement
        const t = n.textContent.replace(/\S+@\S+/g, ' ').trim()
        if (!t || !el) continue
        // Lo de dentro de un <details> cerrado no se ve (salvo su <summary>), aunque tenga caja.
        if (el.closest('details:not([open])') && !el.closest('summary')) continue
        const caja = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        if (!caja.width || caja.bottom < 0 || caja.top > innerHeight || caja.right < 0 || caja.left > innerWidth || s.visibility === 'hidden') continue
        for (const m of t.matchAll(re)) palabras.push(m[0].toLowerCase())
      }
      // También lo que se lee sin ser texto: los placeholder de los buscadores.
      for (const i of raiz.querySelectorAll('input[placeholder]')) for (const m of i.placeholder.matchAll(re)) palabras.push(m[0].toLowerCase())
      return { cuantas: palabras.length, distintas: [...new Set(palabras)].slice(0, 40) }
    },
    [sel, INGLES_UI.source]
  )

/**
 * Para medir junto con `pintado` hasta que la búsqueda dio con quien se busca: desde la próxima tecla o clic, cuándo
 * la primera fila visible de `fila` contiene `texto` y ya está pintada. Se prepara antes de la entrada y se lee con
 * `leerCuando` (ms, o null si no pasó en `ms`). `yaAntes` dice si ya estaba primera antes de la entrada.
 */
export const prepararCuando = (p, fila, texto) =>
  p.evaluate(
    ([fila, texto]) => {
      const primera = () => [...document.querySelectorAll(fila)].find((f) => f.getBoundingClientRect().height)
      const esta = () => (primera()?.innerText ?? '').toLowerCase().includes(texto.toLowerCase())
      window.__cuando = { desde: 0, hasta: 0, yaAntes: esta() }
      const empezar = () => {
        if (window.__cuando.desde) return
        window.__cuando.desde = performance.now()
        const mirar = () => {
          if (window.__cuando.hasta) return
          if (!esta()) return requestAnimationFrame(mirar)
          requestAnimationFrame(() => {
            const mc = new MessageChannel()
            mc.port1.onmessage = () => (window.__cuando.hasta = performance.now())
            mc.port2.postMessage(0)
          })
        }
        // El cuadro de la tecla misma aún no trae el resultado: se mira desde el siguiente.
        requestAnimationFrame(mirar)
      }
      addEventListener('keydown', empezar, { capture: true, once: true })
      addEventListener('pointerdown', empezar, { capture: true, once: true })
    },
    [fila, texto]
  )

export async function leerCuando(p, ms = 10_000) {
  await p.waitForFunction(() => window.__cuando?.hasta, null, { timeout: ms }).catch(() => {})
  return p.evaluate(() => ({ ms: window.__cuando.hasta ? Math.round(window.__cuando.hasta - window.__cuando.desde) : null, yaAntes: window.__cuando.yaAntes }))
}

/**
 * `legibilidad` (eval-voz-comun.mjs) lee los colores como rgb() o color(srgb …). Filament los da en oklch(), que leería
 * mal: esto pone a cada elemento con un color en otro espacio el mismo color en rgba, leído de un píxel de un canvas
 * (lo que de verdad se pinta). Se ve igual. Correrlo antes de `legibilidad`; da cuántos colores cambió.
 */
export const coloresEnRgb = (p) =>
  p.evaluate(() => {
    const lienzo = document.createElement('canvas')
    lienzo.width = lienzo.height = 1
    const c = lienzo.getContext('2d', { willReadFrequently: true })
    const rgba = (v) => {
      c.clearRect(0, 0, 1, 1)
      c.fillStyle = '#000'
      c.fillStyle = v
      c.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data
      return `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`
    }
    let n = 0
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el)
      for (const [prop, css] of [['color', 'color'], ['backgroundColor', 'background-color']]) {
        const v = s[prop]
        if (/^(rgba?\(|color\(srgb )/.test(v) || v === 'transparent') continue
        el.style.setProperty(css, rgba(v), 'important')
        n++
      }
    }
    return n
  })

/**
 * `abrirConRaton` (eval-voz-comun.mjs) para los paneles que al navegar cambian el `<body>` entero (Filament, con
 * `wire:navigate`): el mismo clic de persona (aprieta, `apretado` ms, suelta), pero mira todo el documento, no el body
 * de antes.
 */
export async function abrirConRatonDoc(p, disparador, listo, apretado = 100) {
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
    new MutationObserver((_, o) => hecho() && o.disconnect()).observe(document.documentElement, { childList: true, subtree: true, attributes: true })
  }, listo)
  await p.mouse.down()
  await p.waitForTimeout(apretado)
  await p.mouse.up()
  await p.waitForFunction(() => window.__abrir.hasta, null, { timeout: 10_000 }).catch(() => {})
  return p.evaluate(() => (window.__abrir.hasta ? Math.round(window.__abrir.hasta - window.__abrir.desde) : null))
}

/**
 * Un clic de persona en `objetivo` (un locator: el puntero llega, 300 ms, aprieta, `apretado` ms, suelta) y los ms
 * desde que aprieta hasta que `listo()` (una función que corre en la página) da verdadero y ya está pintado. Mira todo
 * el documento, así vale también si el clic cambia de página dentro de la app.
 */
export async function clicHasta(p, objetivo, listo, apretado = 100) {
  const caja = await objetivo.boundingBox()
  await p.mouse.move(caja.x + Math.min(40, caja.width / 2), caja.y + caja.height / 2)
  await p.waitForTimeout(300)
  await p.evaluate((fuente) => {
    const listo = new Function(`return (${fuente})()`)
    window.__clic = { desde: 0, hasta: 0 }
    addEventListener('pointerdown', () => (window.__clic.desde = performance.now()), { capture: true, once: true })
    const mira = () => {
      if (!window.__clic.desde || window.__clic.hasta || !listo()) return false
      requestAnimationFrame(() => {
        const mc = new MessageChannel()
        mc.port1.onmessage = () => (window.__clic.hasta = performance.now())
        mc.port2.postMessage(0)
      })
      return true
    }
    const o = new MutationObserver(() => mira() && o.disconnect())
    o.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
  }, listo.toString())
  await p.mouse.down()
  await p.waitForTimeout(apretado)
  await p.mouse.up()
  await p.waitForFunction(() => window.__clic.hasta, null, { timeout: 20_000 }).catch(() => {})
  return p.evaluate(() => (window.__clic.hasta ? Math.round(window.__clic.hasta - window.__clic.desde) : null))
}
