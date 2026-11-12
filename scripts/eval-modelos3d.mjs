// El eval de «Modelos 3D» (docs/agents/eval-modelos3d.md): abre Sloth en Edge, hace las mismas tareas que se midieron en
// Sketchfab, Poly Pizza, Poly Haven y Fab (eval-modelos3d-ajenas.mjs) y da lo medido, con capturas en
// data/navegador-capturas/m3d-*.png.
// Uso: node scripts/eval-modelos3d.mjs [puerto] [--compilada]   (la copia del repo que corre, con la biblioteca llena)
// `--compilada` mide todo con la interfaz compilada, como la instalada (eval-compilada.mjs), y no con Vite en desarrollo.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { servirCompilada } from './eval-compilada.mjs'
import { legibilidad, NAVEGADOR, VENTANA } from './eval-voz-comun.mjs'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUERTO = process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? '4848'
const compilada = process.argv.includes('--compilada') ? await servirCompilada(PUERTO) : null
const URL_ = `${compilada ? compilada.url : `http://localhost:${PUERTO}`}/#/modelos-3d`
const CAPTURAS = join(APP, 'data', 'navegador-capturas')
mkdirSync(CAPTURAS, { recursive: true })

/** Las palabras de la prueba de español, con lo que cuenta como acierto (en español o en inglés, como en las otras). */
export const ESPANOL = {
  alcancía: /alcanc|piggy|money ?bank/,
  camión: /camion|truck|lorry/,
  palmera: /palmera|palm/,
  pulmones: /pulmon|lung/,
  reloj: /reloj|clock|watch/,
  maleta: /maleta|suitcase|luggage/,
}
/** Lo mismo escrito como lo escribe la gente: en plural, sin acentos o con una letra de más o de menos. Solo Sloth. */
const COMO_SE_ESCRIBE = { camiones: /camion|truck|lorry/, palmeras: /palmera|palm/, alcancia: /alcanc|piggy|money ?bank/, pulmon: /pulmon|lung/, relojes: /reloj|clock|watch/, maletas: /maleta|suitcase|luggage/, cajafuerte: /caja ?fuerte|safe|vault|boveda/, pulmnes: /pulmon|lung/ }

const b = await chromium.launch(NAVEGADOR)
const ctx = await b.newContext({ viewport: VENTANA, permissions: ['clipboard-read', 'clipboard-write'] })
const p = await ctx.newPage()
const r = {}
// Si algo se traba, a los 6 minutos sale con lo que alcanzó a medir.
setTimeout(() => (console.log(JSON.stringify({ ...r, cortado: 'se pasó de 6 minutos' }, null, 1)), process.exit(2)), 360_000)
const paso = (s) => console.error(`· ${s}`)

/** Cierra los avisos que tapan la página en un navegador nuevo (bienvenida, «el estilo cambió»). */
async function sinAvisos() {
  for (let i = 0; i < 4; i++) {
    for (const sel of ['.estilo-cambio .ec-cerrar', '.modal-actions button:has-text("Empezar")']) {
      const x = p.locator(sel).first()
      if (await x.isVisible().catch(() => false)) await x.click().catch(() => {})
    }
    await p.waitForTimeout(250)
  }
}
const cartel = '.m3d-cartel:not(.m3d-esqueleto)'
const ficha = '.m3d-ficha'
async function cargar() {
  await p.goto(URL_)
  await p.waitForSelector(cartel)
  await sinAvisos()
  await p.waitForTimeout(1500)
}
await cargar()
r.modelos = await p.locator(cartel).count()

// 9. Rapidez: de navegar a la biblioteca a ver la primera miniatura pintada (página nueva, como en las otras), y de
// pulsar «Modelos 3D» en la barra, ya con Sloth abierto, a lo mismo.
paso('rapidez')
const primeraPintada = () =>
  p.evaluate(
    () =>
      new Promise((ok) => {
        const mira = () => {
          const img = [...document.querySelectorAll('.m3d-cartel img')].find((i) => i.complete && i.naturalWidth && i.getBoundingClientRect().top < innerHeight)
          if (!img) return requestAnimationFrame(mira)
          requestAnimationFrame(() => {
            const mc = new MessageChannel()
            mc.port1.onmessage = () => ok(Math.round(performance.now()))
            mc.port2.postMessage(0)
          })
        }
        mira()
      })
  )
r.rapidezPaginaNueva = { con: compilada ? 'interfaz compilada' : 'Vite en desarrollo', ms: [] }
for (let i = 0; i < 5; i++) {
  const q = await ctx.newPage()
  await q.goto(URL_)
  r.rapidezPaginaNueva.ms.push(
    await q.evaluate(
      () =>
        new Promise((ok) => {
          const mira = () => {
            const img = [...document.querySelectorAll('.m3d-cartel img')].find((i) => i.complete && i.naturalWidth && i.getBoundingClientRect().top < innerHeight)
            if (!img) return requestAnimationFrame(mira)
            requestAnimationFrame(() => {
              const mc = new MessageChannel()
              mc.port1.onmessage = () => ok(Math.round(performance.now()))
              mc.port2.postMessage(0)
            })
          }
          mira()
        })
    )
  )
  await q.close()
}
// Con un clic de persona (aprieta, 100 ms, suelta), contado desde que aprieta: igual que el clic en el enlace a sus
// modelos desde el inicio de las otras (`eval-modelos3d-ajenas.mjs --solo navegar`).
r.rapidezDesdeLaBarra = []
for (let i = 0; i < 4; i++) {
  await p.locator('.new-chat', { hasText: 'Nuevo chat' }).first().click()
  await p.waitForTimeout(800)
  await sinAvisos()
  const boton = await p.locator('.new-chat', { hasText: 'Modelos 3D' }).first().boundingBox()
  await p.mouse.move(boton.x + boton.width / 2, boton.y + boton.height / 2)
  await p.waitForTimeout(300)
  await p.evaluate(() => addEventListener('pointerdown', () => (window.__aprieta = performance.now()), { capture: true, once: true }))
  await p.mouse.down()
  await p.waitForTimeout(100)
  await p.mouse.up()
  const pintada = await primeraPintada()
  r.rapidezDesdeLaBarra.push(pintada - Math.round(await p.evaluate(() => window.__aprieta)))
}
await p.mouse.move(5, 5)
await p.waitForTimeout(1500)

// Fluidez: bajar 3000 px con la rueda en unos 2 s y contar los cuadros de más de 50 ms.
r.fluidez = await (async () => {
  const caja = await p.locator('.m3d').boundingBox()
  await p.mouse.move(caja.x + caja.width / 2, caja.y + 400)
  await p.evaluate(() => {
    window.__cuadros = []
    let antes = performance.now()
    const f = (t) => {
      window.__cuadros.push(t - antes)
      antes = t
      if (window.__cuadros.length < 400) requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  })
  for (let i = 0; i < 30; i++) {
    await p.mouse.wheel(0, 100)
    await p.waitForTimeout(66)
  }
  await p.waitForTimeout(300)
  const c = await p.evaluate(() => window.__cuadros.slice(2))
  await p.evaluate(() => document.querySelector('.m3d').scrollTo(0, 0))
  return { cuadros: c.length, lentos: c.filter((x) => x > 50).length, peorMs: Math.round(Math.max(...c)) }
})()
await p.waitForTimeout(800)

// 1. Verlo moverse: del momento en que el puntero entra a un cartel a que su modelo ya se mueve en pantalla.
paso('moverse')
r.moverse = []
for (let i = 0; i < 5; i++) {
  await p.mouse.move(5, 5)
  await p.waitForTimeout(500)
  const n = [4, 5, 6, 7, 1][i]
  await p.locator(cartel).nth(n).scrollIntoViewIfNeeded()
  // Al desplazar, la rejilla no responde al ratón 200 ms (`desplazando`, Modelos3D.tsx).
  await p.waitForTimeout(300)
  const caja = await p.locator(cartel).nth(n).boundingBox()
  await p.evaluate((n) => {
    window.__mueve = null
    const c = document.querySelectorAll('.m3d-cartel:not(.m3d-esqueleto)')[n]
    c.addEventListener('pointerenter', () => {
      const desde = performance.now()
      const mira = () => {
        const v = c.querySelector('video')
        if (v && !v.paused && v.currentTime > 0 && v.readyState >= 2 && getComputedStyle(v).opacity > 0.5) {
          window.__mueve = Math.round(performance.now() - desde)
          return
        }
        if (performance.now() - desde < 5000) requestAnimationFrame(mira)
      }
      requestAnimationFrame(mira)
    }, { once: true })
  }, n)
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: 2 })
  await p.waitForFunction(() => window.__mueve, null, { timeout: 5000 }).catch(() => {})
  r.moverse.push(await p.evaluate(() => window.__mueve))
}
await p.locator(cartel).nth(5).hover()
await p.waitForTimeout(900)
await p.screenshot({ path: join(CAPTURAS, 'm3d-encima.png') })
await p.mouse.move(5, 5)

// 10. Legibilidad, en la rejilla.
const legRejilla = await legibilidad(p, '.m3d')
await p.screenshot({ path: join(CAPTURAS, 'm3d-rejilla.png') })

// 5. Abrir la ficha: un clic de persona en un cartel hasta ver pintado el primer cuadro de su modelo (el video ya con
// imagen, o la foto cargada), no solo la ventana.
paso('ficha')
/** En la página: desde que el ratón aprieta, cuánto tarda en pintarse el modelo de la ficha. */
const vigilarFicha = () =>
  p.evaluate(() => {
    window.__ficha = null
    addEventListener('pointerdown', () => {
      const desde = performance.now()
      let pedido = false
      // Lo primero que llegue: el primer cuadro del video pintado, o el visor 3D ya a la vista (si estaba caliente, se
      // pone antes que ese cuadro y el video se pausa sin pintarlo).
      const listo = () => requestAnimationFrame(() => { const mc = new MessageChannel(); mc.port1.onmessage = () => (window.__ficha ??= Math.round(performance.now() - desde)); mc.port2.postMessage(0) })
      const mira = () => {
        if (window.__ficha !== null) return
        if (document.querySelector('.m3d-visor:not(.oculto)')) return listo()
        const v = document.querySelector('.m3d-ficha-escena video')
        const i = document.querySelector('.m3d-ficha-escena img')
        if (v && v.readyState >= 2 && !pedido) {
          pedido = true
          v.requestVideoFrameCallback(() => listo())
        }
        if (!v && i?.complete && i.naturalWidth) return listo()
        if (performance.now() - desde < 5000) requestAnimationFrame(mira)
      }
      requestAnimationFrame(mira)
    }, { capture: true, once: true })
  })
r.abrirFicha = []
for (let i = 0; i < 5; i++) {
  await p.locator(cartel).nth(i).scrollIntoViewIfNeeded()
  // Al desplazar, la rejilla no responde al ratón 200 ms (`desplazando`, Modelos3D.tsx).
  await p.waitForTimeout(300)
  const caja = await p.locator(cartel).nth(i).boundingBox()
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
  await p.waitForTimeout(300)
  await vigilarFicha()
  await p.mouse.down()
  await p.waitForTimeout(100)
  await p.mouse.up()
  await p.waitForFunction(() => window.__ficha, null, { timeout: 5000 }).catch(() => {})
  const ms = await p.evaluate(() => window.__ficha)
  // Si no llegó, qué había: para saber si fue la medida o la ficha.
  if (ms === null) paso(`abrir sin medida: ${JSON.stringify(await p.evaluate(([x, y]) => { const v = document.querySelector('.m3d-ficha-escena video'); const e = document.elementFromPoint(x, y); return { abierta: !!document.querySelector('.m3d-ficha'), rs: v?.readyState, visor: document.querySelector('.m3d-visor')?.className ?? 'no', encima: e ? e.outerHTML.slice(0, 160) : null } }, [caja.x + caja.width / 2, caja.y + caja.height / 2]))}`)
  r.abrirFicha.push(ms)
  await p.waitForTimeout(600)
  if (i === 0) await p.screenshot({ path: join(CAPTURAS, 'm3d-ficha.png') })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
}

// 10. Legibilidad, en la ficha; se queda la peor de las dos.
await p.locator(cartel).first().click()
await p.waitForSelector(ficha)
await p.waitForTimeout(600)
const legFicha = await legibilidad(p, ficha)
r.legibilidad = {
  contrasteMinimo: legRejilla.contrasteMinimo.ratio <= legFicha.contrasteMinimo.ratio ? legRejilla.contrasteMinimo : legFicha.contrasteMinimo,
  letraMinima: legRejilla.letraMinima.px <= legFicha.letraMinima.px ? legRejilla.letraMinima : legFicha.letraMinima,
}
// ¿Se ve entera, sin desplazar, la forma de usarlo? (lo que se hace con ella)
r.fichaUsarALaVista = await p.evaluate(() => {
  const u = document.querySelector('.m3d-usar, [data-usar]')
  if (!u) return false
  const r = u.getBoundingClientRect()
  return r.top >= 0 && r.bottom <= innerHeight
})

// 6. Pasar al siguiente, en la ficha.
const titulo = () => p.locator(`${ficha} h2`).textContent()
const antes = await titulo()
await p.keyboard.press('ArrowRight')
await p.waitForTimeout(300)
r.siguiente = { teclas: (await titulo()) !== antes ? 1 : null }

// 2. Girarlo a mano: desde la rejilla, un clic en un cartel y, sin esperar, arrastrar sobre su modelo: cuánto pasa
// desde que aprieta el cartel hasta que la vista sigue al ratón (no que siga sola). Y cuánto da la vuelta: con
// vuelta.webm, entera; sin ella, el vaivén de 48°. Luego pasa al siguiente con → y vuelve a arrastrar: tiene que girar.
paso('girar')
await p.keyboard.press('Escape')
await p.waitForTimeout(400)
/** En la página: desde `desde` (el próximo pointerdown, o ya), cuánto tarda la vista en seguir un arrastre. */
const vigilarGiro = (alApretar) =>
  p.evaluate((alApretar) => {
    window.__giro = null
    // Solo cuenta lo que cambia después de que el arrastre empezó (el video, al cargar, salta solo a la altura de su foto).
    window.__arrastra = false
    addEventListener('pointerdown', (e) => e.target.closest?.('.m3d-ficha-escena') && (window.__arrastra = true), { capture: true })
    const empieza = () => {
      const desde = performance.now()
      let t0 = null
      const mira = () => {
        const v = document.querySelector('.m3d-ficha-escena video.m3d-mano') ?? document.querySelector('.m3d-ficha-escena video')
        if (v && t0 === null && window.__arrastra && v.paused) t0 = v.currentTime
        if (v && v.paused && t0 !== null && Math.abs(v.currentTime - t0) > 0.03) {
          v.requestVideoFrameCallback(() => (window.__giro = Math.round(performance.now() - desde)))
          return
        }
        if (performance.now() - desde < 5000) requestAnimationFrame(mira)
      }
      requestAnimationFrame(mira)
    }
    if (alApretar) addEventListener('pointerdown', empieza, { capture: true, once: true })
    else empieza()
  }, alApretar)
const arrastrar = async () => {
  const escena = await p.locator(`${ficha}-escena`).boundingBox()
  const x = escena.x + escena.width / 2
  const y = escena.y + escena.height / 3
  await p.mouse.move(x, y)
  await p.mouse.down()
  for (let i = 1; i <= 8; i++) await p.mouse.move(x + i * 15, y)
  await p.waitForFunction(() => window.__giro, null, { timeout: 5000 }).catch(() => {})
  await p.mouse.up()
  return p.evaluate(() => window.__giro)
}
r.girar = await (async () => {
  await p.locator(cartel).nth(2).scrollIntoViewIfNeeded()
  // Al desplazar, la rejilla no responde al ratón 200 ms (`desplazando`, Modelos3D.tsx).
  await p.waitForTimeout(300)
  const caja = await p.locator(cartel).nth(2).boundingBox()
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
  await p.waitForTimeout(300)
  await vigilarGiro(true)
  await p.evaluate(() => addEventListener('pointerdown', () => (window.__aprieta = performance.timeOrigin + performance.now()), { capture: true, once: true }))
  await p.mouse.down()
  await p.waitForTimeout(100)
  await p.mouse.up()
  // Sin esperar: arrastrar en cuanto abre. Responde lo que esté puesto: la vuelta en video (dos ejes) o, si ya llegó, el
  // visor 3D. Cuenta lo primero que siga al ratón.
  const visorDe = async () => (await p.$('.m3d-visor:not(.oculto)')) && (await (await p.$('.m3d-visor')).contentFrame())
  const fAntes = await visorDe()
  if (fAntes) await fAntes.evaluate(() => (window.__visor.respondio = 0))
  const enVideo = await arrastrar()
  const aprieta = await p.evaluate(() => window.__aprieta)
  const fDespues = fAntes ?? (await visorDe())
  const enVisor = fDespues ? await fDespues.evaluate(() => window.__visor.respondio) : 0
  const desdeLaRejilla = enVideo ?? (enVisor ? Math.round(enVisor - aprieta) : null)
  // El visor 3D: cuándo está listo, cuánto tarda en seguir un arrastre y qué alcanza (los dos ejes y acercar la geometría).
  const visor = await (async () => {
    const hay = await p.waitForSelector('.m3d-visor:not(.oculto)', { timeout: 8000 }).catch(() => null)
    if (!hay) return { listo: null }
    const f = await (await p.$('.m3d-visor')).contentFrame()
    const v = () => f.evaluate(() => ({ ...window.__visor }))
    const listo = Math.round((await v()).listo - aprieta)
    await f.evaluate(() => (window.__visor.respondio = 0))
    const b = await p.locator('.m3d-visor').boundingBox()
    const x = b.x + b.width / 2
    const y = b.y + b.height / 2
    const a0 = await v()
    await p.mouse.move(x, y)
    const t = await f.evaluate(() => performance.timeOrigin + performance.now())
    await p.mouse.down()
    for (let i = 1; i <= 8; i++) await p.mouse.move(x + i * 20, y + i * 12)
    await p.mouse.up()
    await p.waitForTimeout(400)
    const a1 = await v()
    for (let i = 0; i < 5; i++) await p.mouse.wheel(0, -200)
    await p.waitForTimeout(500)
    const a2 = await v()
    return {
      listo,
      responde: a1.respondio ? Math.round(a1.respondio - t) : null,
      deLado: Math.abs(a1.azimut - a0.azimut) > 0.1,
      deArribaAbajo: Math.abs(a1.polar - a0.polar) > 0.05,
      acerca: a2.distancia < a1.distancia * 0.8,
    }
  })()
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(1500)
  // Tras pasar de modelo con →, se sigue girando: con su visor si ya está, o con la vuelta en video.
  const despuesDeCambiar = await (async () => {
    if (await p.locator('.m3d-visor:not(.oculto)').count()) {
      const f = await (await p.$('.m3d-visor')).contentFrame()
      const b = await p.locator('.m3d-visor').boundingBox()
      const az = await f.evaluate(() => window.__visor.azimut)
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await p.mouse.down()
      for (let i = 1; i <= 6; i++) await p.mouse.move(b.x + b.width / 2 + i * 20, b.y + b.height / 2)
      await p.mouse.up()
      await p.waitForTimeout(300)
      return { con: 'visor', gira: Math.abs((await f.evaluate(() => window.__visor.azimut)) - az) > 0.1 }
    }
    await vigilarGiro(false)
    return { con: 'video', ms: await arrastrar() }
  })()
  return { desdeLaRejilla, visor, despuesDeCambiar }
})()
await p.keyboard.press('Escape')
await p.waitForTimeout(400)

// 7. Usarlo: desde la rejilla, las entradas hasta tener en el portapapeles lo que se le pide al agente.
paso('usar')
r.usar = await (async () => {
  await p.evaluate(() => navigator.clipboard.writeText(''))
  const c = p.locator(cartel).first()
  await c.hover()
  await p.waitForTimeout(400)
  const boton = c.locator('.m3d-copiar, [data-copiar]').first()
  if (!(await boton.isVisible().catch(() => false))) return { entradas: null }
  await boton.click()
  await p.waitForTimeout(300)
  const copiado = await p.evaluate(() => navigator.clipboard.readText())
  const fichaAbierta = await p.locator(ficha).isVisible().catch(() => false)
  if (fichaAbierta) await p.keyboard.press('Escape')
  return { entradas: 1, copiado, abrioLaFicha: fichaAbierta }
})()
await p.mouse.move(5, 5)

// 3. Encontrar en español: los primeros 8 resultados de cada palabra.
paso('español')
const buscar = async (texto) => {
  await p.locator('.m3d-busca input').fill(texto)
  await p.waitForTimeout(250)
  return p.evaluate(() => [...document.querySelectorAll('.m3d-cartel:not(.m3d-esqueleto)')].slice(0, 8).map((c) => `${c.dataset.id ?? ''} ${c.querySelector('.m3d-pie strong')?.textContent ?? ''}`.trim()))
}
const plano = (s) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()
r.espanol = { aciertos: 0, primeroAcierta: 0, de: Object.keys(ESPANOL).length, titulos: {} }
for (const [palabra, re] of Object.entries(ESPANOL)) {
  const t = await buscar(palabra)
  r.espanol.titulos[palabra] = t
  if (t.some((x) => re.test(plano(x)))) r.espanol.aciertos++
  if (t[0] && re.test(plano(t[0]))) r.espanol.primeroAcierta++
}
r.comoSeEscribe = { aciertos: 0, primeroAcierta: 0, de: Object.keys(COMO_SE_ESCRIBE).length, fallos: [], primeros: {} }
for (const [palabra, re] of Object.entries(COMO_SE_ESCRIBE)) {
  const t = await buscar(palabra)
  r.comoSeEscribe.primeros[palabra] = t[0] ?? null
  if (t.some((x) => re.test(plano(x)))) r.comoSeEscribe.aciertos++
  else r.comoSeEscribe.fallos.push(palabra)
  if (t[0] && re.test(plano(t[0]))) r.comoSeEscribe.primeroAcierta++
}
await p.locator('.m3d-busca input').fill('')
await p.locator('.m3d-busca input').blur()

// 8. Teclado: con «maleta» escrito en el buscador, las teclas hasta tener abierta la ficha del primer resultado.
paso('teclado')
r.teclado = await (async () => {
  const abiertaLaMaleta = async () => /maleta/i.test((await p.locator(`${ficha} h2`).textContent({ timeout: 300 }).catch(() => '')) ?? '')
  const desdeElBuscador = async () => {
    if (await p.locator(ficha).isVisible().catch(() => false)) await p.keyboard.press('Escape')
    await p.locator('.m3d-busca input').fill('maleta')
    await p.locator('.m3d-busca input').focus()
    await p.waitForTimeout(200)
  }
  // Enter, o ↓ y Enter, desde el buscador.
  for (const teclas of [['Enter'], ['ArrowDown', 'Enter']]) {
    await desdeElBuscador()
    for (const t of teclas) await p.keyboard.press(t)
    await p.waitForTimeout(250)
    if (await abiertaLaMaleta()) return { teclas: teclas.length, cuales: teclas.join(' ') }
  }
  // Si no, Tab hasta el primer cartel y Enter.
  await desdeElBuscador()
  for (let n = 1; n <= 40; n++) {
    await p.keyboard.press('Tab')
    if (await p.evaluate(() => document.activeElement?.closest('.m3d-cartel') === document.querySelector('.m3d-cartel:not(.m3d-esqueleto)'))) {
      await p.keyboard.press('Enter')
      await p.waitForTimeout(250)
      if (await abiertaLaMaleta()) return { teclas: n + 1, cuales: `Tab ×${n}, Enter` }
      return { teclas: null }
    }
  }
  return { teclas: null }
})()
await p.keyboard.press('Escape')
await p.locator('.m3d-busca input').fill('')
await p.locator('.m3d-busca input').blur()
await p.waitForTimeout(300)

// Lo que la revisión encontró roto, para que no vuelva: con la ficha abierta, lo tecleado no va al buscador de atrás;
// con «Nuevo modelo» abierto, los números no filtran; la tecla C en un cartel copia su nombre.
paso('regresiones')
r.regresiones = await (async () => {
  const salida = {}
  await p.locator('.m3d-busca input').fill('maleta')
  await p.locator('.m3d-busca input').focus()
  await p.keyboard.press('Enter')
  await p.waitForTimeout(400)
  await p.keyboard.type('x')
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(200)
  salida.fichaTomaElFoco = (await p.locator('.m3d-busca input').inputValue()) === 'maleta'
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  salida.escNoBorraLaBusqueda = (await p.locator('.m3d-busca input').inputValue()) === 'maleta'
  await p.locator('.m3d-busca input').fill('')
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await p.locator('.m3d-accion', { hasText: 'Nuevo modelo' }).click()
  await p.waitForTimeout(300)
  await p.keyboard.press('4')
  await p.waitForTimeout(200)
  salida.numerosConVentana = (await p.locator('.m3d-tipos button.on').textContent())?.startsWith('Todos') ?? false
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  // Un aviso de la app encima (como «el estilo cambió», con position: fixed): los números tampoco filtran.
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'aviso-prueba'; d.setAttribute('role', 'dialog'); d.style.cssText = 'position:fixed;inset:40%;background:#000;z-index:99'; document.body.append(d) })
  await p.keyboard.press('3')
  await p.waitForTimeout(200)
  salida.numerosConAvisoEncima = (await p.locator('.m3d-tipos button.on').textContent())?.startsWith('Todos') ?? false
  await p.evaluate(() => document.getElementById('aviso-prueba')?.remove())
  // Cambiar de modelo rápido (→ y ← con 60 ms): al final, el visor enseña el de la ficha abierta.
  await p.locator('.m3d-busca input').fill('maleta')
  await p.locator('.m3d-busca input').focus()
  await p.keyboard.press('Enter')
  await p.waitForSelector('.m3d-visor:not(.oculto)', { timeout: 5000 }).catch(() => {})
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(60)
  await p.keyboard.press('ArrowLeft')
  await p.waitForTimeout(2500)
  salida.cambioRapido = await (async () => {
    const enLaFicha = await p.locator('.m3d-usar code').textContent().catch(() => null)
    const visible = await p.locator('.m3d-visor:not(.oculto)').count()
    const f = visible ? await (await p.$('.m3d-visor')).contentFrame() : null
    const enElVisor = f ? await f.evaluate(() => window.__visor.id) : null
    return { enLaFicha, enElVisor, bien: !!visible && enLaFicha === enElVisor }
  })()
  // Con el foco en el visor (un clic en el modelo), Tab y Mayús+Tab siguen en la ficha, no en la rejilla de atrás.
  salida.tabDesdeElVisor = await (async () => {
    const e = await p.locator('.m3d-ficha-escena').boundingBox()
    const dentro = []
    for (const tecla of ['Shift+Tab', 'Tab']) {
      await p.mouse.click(e.x + e.width / 2, e.y + e.height / 2)
      await p.waitForTimeout(200)
      await p.keyboard.press(tecla)
      await p.waitForTimeout(200)
      dentro.push(await p.evaluate(() => !!document.activeElement?.closest('.m3d-ficha')))
    }
    return dentro.every(Boolean)
  })()
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  await p.locator('.m3d-busca input').fill('')
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await p.evaluate(() => navigator.clipboard.writeText(''))
  await p.locator(cartel).nth(1).focus()
  await p.keyboard.press('c')
  await p.waitForTimeout(200)
  salida.teclaC = await p.evaluate(() => navigator.clipboard.readText())
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  return salida
})()

// 4. Filtrar por tipo: con el ratón, un clic; con el teclado, ¿hay atajo? Se da en tiempo KLM (tecla 0,28 s; apuntar y
// clic 1,3 s), como en las otras.
paso('filtrar')
r.filtrar = await (async () => {
  const total = await p.locator(cartel).count()
  const conRaton = await p.locator('.m3d-tipos button').nth(1).isVisible().catch(() => false)
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await p.keyboard.press('2')
  await p.waitForTimeout(250)
  const conTecla = (await p.locator(cartel).count()) < total
  await p.keyboard.press('0')
  await p.keyboard.press('1')
  await p.waitForTimeout(250)
  return { clics: conRaton ? 1 : null, atajo: conTecla, klmS: conTecla ? 0.28 : conRaton ? 1.3 : null }
})()

// Lo que no es de una medida pero sí de las reglas de Sloth: nada se sale de lado, ningún botón en cápsula, ningún
// carácter haciendo de ícono.
paso('reglas')
r.reglas = {}
for (const ancho of [1280, 1024, 390]) {
  await p.setViewportSize({ width: ancho, height: 800 })
  await p.waitForTimeout(400)
  r.reglas[`sobraDeLado${ancho}`] = await p.evaluate(() => {
    const m = document.querySelector('.m3d')
    return Math.max(0, m.scrollWidth - m.clientWidth)
  })
  if (ancho === 390) {
    await p.screenshot({ path: join(CAPTURAS, 'm3d-movil.png') })
    // La ficha en angosto: el modelo se ve (no se aplasta) y la forma de usarlo también, sin desplazar.
    await p.locator(cartel).first().click()
    // Con el visor ya encima (si lo hay): es el que podía tapar el botón de cerrar.
    // Que salga dice además que cambiar de ancho no lo volvió a cargar (antes se perdía lo pedido y no salía).
    const visorALaVista = await p.waitForSelector('.m3d-visor:not(.oculto)', { timeout: 4000 }).then(() => true, () => false)
    await p.waitForTimeout(400)
    await p.screenshot({ path: join(CAPTURAS, 'm3d-movil-ficha.png') })
    r.reglas.fichaAngosta = { visorALaVista }
    Object.assign(r.reglas.fichaAngosta, await p.evaluate(() => {
      const e = document.querySelector('.m3d-ficha-escena')?.getBoundingClientRect()
      const u = document.querySelector('.m3d-usar')?.getBoundingClientRect()
      const t = document.querySelector('.m3d-ficha-texto')?.getBoundingClientRect()
      const x = document.querySelector('.m3d-cerrar')?.getBoundingClientRect()
      const encima = x && document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2)
      return { altoDelModelo: Math.round(e?.height ?? 0), textoBajoElModelo: !!t && !!e && t.top >= e.bottom - 1, cerrarALaVista: !!x && x.top >= 0 && x.bottom <= innerHeight, cerrarSeAprieta: !!encima?.closest('.m3d-cerrar'), usarALaVista: !!u && u.top >= 0 && u.bottom <= innerHeight }
    }))
    await p.keyboard.press('Escape')
  }
}
await p.setViewportSize(VENTANA)
await p.waitForTimeout(300)
const reglas = () =>
  p.evaluate(() => {
    const capsulas = []
    const glifos = []
    for (const el of document.querySelectorAll('.m3d *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const s = getComputedStyle(el)
      const radio = parseFloat(s.borderTopLeftRadius)
      const conBorde = parseFloat(s.borderTopWidth) > 0 || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent')
      if (conBorde && r.height < 48 && radio >= r.height / 2 - 1 && r.width > r.height * 1.3) capsulas.push((el.textContent || el.className).trim().slice(0, 24))
      const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
      if (/^[✕✓×‹›▶★☆←→↑↓]$/.test(t)) glifos.push(t)
    }
    return { capsulas, glifos }
  })
await p.locator(cartel).nth(2).hover()
await p.waitForTimeout(400)
const enRejilla = await reglas()
await p.locator(cartel).nth(2).click()
await p.waitForTimeout(500)
const enFicha = await reglas()
await p.keyboard.press('Escape')
r.reglas.capsulas = [...new Set([...enRejilla.capsulas, ...enFicha.capsulas])]
r.reglas.glifosComoIcono = [...new Set([...enRejilla.glifos, ...enFicha.glifos])]

compilada?.cerrar()
console.log(JSON.stringify(r, null, 1))
await Promise.race([b.close(), new Promise((ok) => setTimeout(ok, 5000))])
process.exit(0)
