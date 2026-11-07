// El eval del menú «Voz» (docs/agents/eval-voz.md): abre Sloth en Edge, hace las mismas tareas que se midieron en
// ElevenLabs, Fish Audio, AI Studio y Suno (eval-voz-ajenas.mjs), y da lo medido con capturas en
// data/navegador-capturas/voz-*.png.
// Uso: node scripts/eval-voz.mjs [puerto] [--frio] [--frase-aistudio] [--clonar-de-verdad <grabación>]
// (la copia del repo que corre, con alguna voz conectada; --frase-aistudio gasta un pedido de AI Studio)
// `--frio` borra antes las muestras que Sloth ya guardó (data/voz/muestras): como la primera vez en una computadora.
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { abrirConRaton, abrirHastaPintar, DETECTOR, INGLES, legibilidad, NAVEGADOR, sonido as sonar, VENTANA } from './eval-voz-comun.mjs'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUERTO = process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? '4848'
const CAPTURAS = join(APP, 'data', 'navegador-capturas')
mkdirSync(CAPTURAS, { recursive: true })
if (process.argv.includes('--frio')) rmSync(join(APP, 'data', 'voz', 'muestras'), { recursive: true, force: true })

const b = await chromium.launch(NAVEGADOR)
const p = await b.newPage({ viewport: VENTANA })
await p.addInitScript(DETECTOR)
await p.goto(`http://localhost:${PUERTO}/#/new/video-explicativo`)
await p.waitForTimeout(1500)
const empezar = p.locator('.modal-actions button', { hasText: 'Empezar' })
if (await empezar.isVisible().catch(() => false)) await empezar.click()
await p.waitForFunction(() => [...document.querySelectorAll('.elegir-voz .picker-trigger')].some((x) => !x.disabled))

const r = { frio: process.argv.includes('--frio') }
// Si algo se traba, a los 6 minutos sale con lo que alcanzó a medir.
setTimeout(() => (console.log(JSON.stringify({ ...r, cortado: 'se pasó de 6 minutos' }, null, 1)), process.exit(2)), 360_000)
const ahora = () => p.evaluate(() => performance.now())
const sonido = (desde, ms) => sonar(p, desde, ms)
const panel = '.voz-panel'
/** Las descripciones de las filas a la vista que llevan alguna palabra en inglés. */
const enIngles = () => p.evaluate((re) => [...document.querySelectorAll('.voz-fila small')].map((s) => s.textContent).filter((t) => new RegExp(re, 'i').test(t)), INGLES.source)
const captura = async (nombre) => {
  const caja = await p.locator(panel).boundingBox()
  await p.screenshot({ path: join(CAPTURAS, `voz-${nombre}.png`), clip: { x: caja.x - 8, y: caja.y - 8, width: caja.width + 16, height: caja.height + 56 } })
}

// 1. Abrir: un clic, y cuánto tarda en verse ya pintado, cinco veces. Lo mismo se mide en el panel de AI Studio.
/** Baja con ↓ hasta la primera voz que trae muestra (las que no, generan una frase y no se miden aquí). */
const aLaPrimeraConMuestra = async () => {
  for (let i = 0; i < 30; i++) {
    await p.keyboard.press('ArrowDown')
    if (await p.evaluate(() => /^Oír su muestra/.test(document.querySelector('.voz-fila.activa .voz-oir')?.getAttribute('title') ?? ''))) return
  }
}
const abrir = () => abrirHastaPintar(p, '.elegir-voz .picker-trigger', '.voz-panel:not(.voz-oculto) .voz-fila:not(.voz-propia)')
// Con la página ya quieta, como se midió AI Studio (allí, 12 s después de cargar).
await p.waitForTimeout(3000)
// En frío, antes que nada: abrir por primera vez y oír la primera voz (800 ms encima), sin muestras guardadas.
if (r.frio) {
  await abrir()
  await aLaPrimeraConMuestra()
  await p.waitForTimeout(800)
  const c0 = await ahora()
  await p.keyboard.press('ArrowRight')
  r.oirRecienAbiertoEnFrio = await sonido(c0)
  await p.keyboard.press('Escape') // para el sonido
  await p.keyboard.press('Escape') // cierra
  await p.waitForTimeout(500)
}
// Con el menú ya armado y oculto, la página no se mueve de lado (en ningún ancho).
r.desplazaDeLado = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
r.abrirMs = []
for (let i = 0; i < 5; i++) {
  r.abrirMs.push(await abrir())
  if (i < 4) await p.keyboard.press('Escape'), await p.waitForTimeout(300)
}
await p.waitForTimeout(300)
// 1b. Con un clic de persona (aprieta, 100 ms, suelta), desde que aprieta. Igual que en AI Studio.
r.abrirConRatonMs = []
for (let i = 0; i < 3; i++) {
  await p.keyboard.press('Escape')
  await p.locator(panel).waitFor({ state: 'hidden' })
  await p.waitForTimeout(300)
  r.abrirConRatonMs.push(await abrirConRaton(p, '.elegir-voz .picker-trigger', '.voz-panel:not(.voz-oculto) .voz-fila:not(.voz-propia)'))
}
r.focoTrasAbrirConRaton = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Buscar una voz')
r.legibilidad = await legibilidad(p, panel)
r.focoEnBuscador = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Buscar una voz')
const filas = await p.evaluate(() => {
  const f = [...document.querySelectorAll('.voz-fila')]
  const texto = f.map((x) => x.querySelector('small')?.textContent ?? '')
  return {
    filas: f.length,
    botonesOirVisibles: [...document.querySelectorAll('.voz-oir')].filter((x) => getComputedStyle(x).opacity !== '0' && x.getBoundingClientRect().width > 0).length,
    descripcionesEnIngles: texto.filter((t) => /\bpitch\b|\band\b|\bmale\b|\bfemale\b/i.test(t)).length,
    descripciones: texto.length,
    motores: [...document.querySelectorAll('.voz-pestanas[aria-label=Motor] button')].length - 1,
    altoFila: Math.round(f[1]?.getBoundingClientRect().height ?? 0),
    roles: { combobox: !!document.querySelector('[role=combobox][aria-activedescendant]'), opciones: document.querySelectorAll('[role=option]').length }
  }
})
Object.assign(r, filas)
r.descripcionesEnIngles = await enIngles()
await captura('despues')

r.anchoPanel = Math.round((await p.locator(panel).boundingBox()).width)

// 2. Oír la voz que está a la vista: una tecla (→) desde el buscador, sin tocar el ratón. Como en las otras apps (el
// puntero 800 ms encima antes del clic), se da el mismo rato sobre la fila antes de pulsar.
await aLaPrimeraConMuestra()
await p.waitForTimeout(800)
let c = await ahora()
await p.keyboard.press('ArrowRight')
r.oirPrimera = await sonido(c)
await p.waitForTimeout(600)
await captura('sonando')

// 3. Comparar: mientras suena, ↓ toca la siguiente. Tres voces: ↓ → ↓ ↓, cuatro teclas desde que abre.
c = await ahora()
await p.keyboard.press('ArrowDown')
r.oirSegunda = await sonido(c)
c = await ahora()
await p.keyboard.press('ArrowDown')
r.oirTercera = await sonido(c)
await p.keyboard.press('Escape') // para el sonido, el menú sigue
r.anchoPanelSonando = Math.round((await p.locator(panel).boundingBox()).width)

// 3b. Con el ratón: pasar por una fila y pulsar su botón de oír (lo mismo que en ElevenLabs y Fish Audio).
const fila = p.locator('.voz-fila:not(.voz-propia)').filter({ has: p.locator('.voz-oir[title^="Oír su muestra"]') }).nth(5)
// Igual que en eval-voz-ajenas.mjs (`oirEn`): el puntero a su botón, 800 ms encima y un clic ahí, sin las esperas de
// `locator.click()` (que mira que esté quieto unos cuadros antes de pulsar).
await fila.scrollIntoViewIfNeeded()
const boton = await fila.locator('.voz-oir').evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
await p.mouse.move(boton.x, boton.y)
await p.waitForTimeout(800)
c = await ahora()
await p.mouse.click(boton.x, boton.y)
r.oirConRaton = await sonido(c)
await p.keyboard.press('Escape')

// 4. Buscar en español por cómo suena: «grave narración».
c = Date.now()
await p.keyboard.type('grave')
await p.waitForTimeout(50)
r.buscarGrave = { ms: Date.now() - c, halladas: await p.locator('.voz-fila').count() }
await p.keyboard.type(' narración')
await p.waitForTimeout(50)
r.buscarGraveNarradora = await p.evaluate(() => [...document.querySelectorAll('.voz-fila strong')].map((s) => s.textContent))
await captura('buscar')

// 4a'. Solo con el teclado y abreviado: «gra nar» (7 teclas). Cada palabra se busca por su principio o dentro.
await p.locator('[aria-label="Buscar una voz"]').fill('')
await p.keyboard.type('gra nar')
await p.waitForTimeout(50)
r.graNar = await p.evaluate(() => [...document.querySelectorAll('.voz-fila strong')].map((s) => s.textContent))

// 4a. El camino corto a «grave narración»: «Grave» (un clic) y «narr» (cuatro teclas).
await p.locator('.voz-limpiar').click()
await p.locator('.voz-pestanas[aria-label="Tono"] button', { hasText: 'Grave' }).click()
await p.keyboard.type('narr')
await p.waitForTimeout(50)
r.graveYNarr = await p.evaluate(() => [...document.querySelectorAll('.voz-fila strong')].map((s) => s.textContent))
await p.locator('.voz-pestanas[aria-label="Tono"] button', { hasText: 'Grave' }).click()
await p.locator('[aria-label="Buscar una voz"]').fill('grave narración')
await p.waitForTimeout(50)

// 4b. Por género y tono con dos clics: «Mujer» y «Aguda».
await p.locator('.voz-limpiar').click()
await p.locator('.voz-pestanas[aria-label="Género"] button', { hasText: 'Mujer' }).click()
await p.locator('.voz-pestanas[aria-label="Tono"] button', { hasText: 'Aguda' }).click()
r.mujerAguda = await p.evaluate(() => [...document.querySelectorAll('.voz-fila small')].map((s) => s.textContent))
await captura('filtros')
await p.locator('.voz-pestanas[aria-label="Género"] button', { hasText: 'Mujer' }).click()
await p.locator('.voz-pestanas[aria-label="Tono"] button', { hasText: 'Aguda' }).click()
await p.locator('[aria-label="Buscar una voz"]').fill('grave narración')
await p.waitForTimeout(50)

// 4c. Buscando, también en toda la biblioteca de Fish Audio (si hay llave): lo que no está ya en el menú.
if (await p.locator('.voz-pestanas[aria-label=Motor] button', { hasText: 'Fish Audio' }).count()) {
  await p.locator('[aria-label="Buscar una voz"]').fill('locutor')
  await p.waitForSelector('.voz-seccion:has-text("En toda la biblioteca")', { timeout: 10_000 }).catch(() => {})
  r.bibliotecaFish = await p.locator('.voz-seccion:has-text("En toda la biblioteca") ~ .voz-fila').count()
  r.bibliotecaEnIngles = await enIngles()
  await captura('biblioteca')
  await p.locator('[aria-label="Buscar una voz"]').fill('grave narración')
  await p.waitForTimeout(50)
}

// 5. Elegir con Enter y ver que la etiqueta cambia.
await p.keyboard.press('Enter')
await p.waitForTimeout(200)
r.etiquetaTrasElegir = await p.locator('.elegir-voz .picker-trigger').first().innerText()
r.cerroAlElegir = !(await p.locator(panel).isVisible())
// Y la que elegiste sale en «Recientes» al volver a abrir.
await p.locator('.elegir-voz .picker-trigger').first().click()
r.recienteTrasElegir = await p.evaluate(() => [...document.querySelectorAll('.voz-panel:not(.voz-oculto) [role=group][aria-label=Recientes] strong')].map((x) => x.firstChild?.textContent))
await p.keyboard.press('Escape')
await p.locator(panel).waitFor({ state: 'hidden' })

// 6. Tu frase: oír una voz diciendo lo tuyo, sin salir del menú. Con una de Fish Audio (gratis hasta el 30-nov-2026):
// la primera vez se genera; la segunda suena de lo guardado.
await p.locator('.elegir-voz .picker-trigger').first().click()
r.frase = await p.locator('.voz-frase input').isVisible()
const fish = p.locator('.voz-pestanas[aria-label=Motor] button', { hasText: 'Fish Audio' })
if (await fish.count()) {
  await fish.click()
  const texto = `Hola, soy la prueba ${Date.now() % 100000} del menú de voces.`
  await p.locator('.voz-frase input').fill(texto)
  c = await ahora()
  await p.keyboard.press('Enter')
  r.fraseGenerada = await sonido(c, 45_000)
  await p.keyboard.press('Escape') // para el sonido; el menú sigue
  c = await ahora()
  await p.keyboard.press('Enter')
  r.fraseRepetida = await sonido(c)
  // Otra voz con la misma frase: un clic en su botón de oír (en Fish y ElevenLabs son 2 y 3: elegirla y generar).
  await p.keyboard.press('Escape')
  const otra = p.locator('.voz-panel:not(.voz-oculto) .voz-fila:not(.voz-propia)').nth(1).locator('.voz-oir')
  const o = await otra.evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
  await p.mouse.move(o.x, o.y)
  c = await ahora()
  await p.mouse.click(o.x, o.y)
  r.fraseOtraVozUnClic = await sonido(c, 45_000)
  await p.keyboard.press('Escape') // para el sonido
  await p.locator('.voz-frase input').fill('')
  await p.keyboard.press('Escape') // cierra (el menú se queda armado, oculto)
  await p.locator(panel).waitFor({ state: 'hidden' })
  await p.locator('.elegir-voz .picker-trigger').first().click()
}

// 6b. `--frase-aistudio`: lo mismo con una voz de AI Studio (gasta un pedido de su cuota).
const ai = p.locator('.voz-pestanas[aria-label=Motor] button', { hasText: 'AI Studio' })
if (process.argv.includes('--frase-aistudio') && (await ai.count())) {
  await ai.click()
  await p.locator('.voz-frase input').fill(`Hola, así suena esta voz de AI Studio. Prueba ${Date.now() % 100000}.`)
  c = await ahora()
  await p.keyboard.press('Enter')
  r.fraseAIStudio = await sonido(c, 120_000)
  if (!r.fraseAIStudio) r.fraseAIStudioAviso = await p.locator('.voz-aviso').innerText()
  await p.keyboard.press('Escape')
  await p.locator('.voz-frase input').fill('')
  await p.keyboard.press('Escape')
  await p.locator(panel).waitFor({ state: 'hidden' })
  await p.locator('.elegir-voz .picker-trigger').first().click()
}

// 6c. `--clonar-de-verdad <archivo>`: clonar subiendo esa grabación, sin contestar nada aquí (con Fish sin saldo, se
// guarda en esta computadora y va de referencia). Queda en el menú como «Prueba del eval».
const deVerdad = process.argv.includes('--clonar-de-verdad') ? process.argv[process.argv.indexOf('--clonar-de-verdad') + 1] : undefined
if (deVerdad && (await p.locator('.voz-clonar').isVisible())) {
  let pasos = 0
  await p.locator('.voz-clonar').click(), pasos++
  await p.locator('.voz-subir input[type=file]').setInputFiles(deVerdad), pasos++
  await p.locator('.voz-nombre').fill('Prueba del eval'), pasos++
  const t = Date.now()
  await p.locator('.voz-clonar-pie button').click(), pasos++
  await p.waitForFunction(() => /Prueba del eval/.test(document.querySelector('.elegir-voz .picker-trigger')?.textContent ?? '') || document.querySelector('.voz-clonar-panel .bad'), null, { timeout: 180_000 }).catch(() => {})
  r.clonarDeVerdad = { pasos, segundos: (Date.now() - t) / 1000, etiqueta: await p.locator('.elegir-voz .picker-trigger').first().innerText(), error: await p.locator('.voz-clonar-panel .bad').innerText({ timeout: 300 }).catch(() => '') }
  await p.locator('.elegir-voz .picker-trigger').first().click()
  await p.locator('[aria-label="Buscar una voz"]').fill('Prueba del eval')
  await p.locator('.voz-frase input').fill('Ahora hablo con la voz que acabas de clonar.')
  c = await ahora()
  await p.keyboard.press('Enter')
  r.clonarDeVerdad.habla = await sonido(c, 60_000)
  // Y se quita, para que no quede en el menú de las corridas siguientes.
  r.clonarDeVerdad.quitada = await p.evaluate(async () => { const e = await (await fetch('/api/voz')).json(); const v = e.motores.fish.voces.find((x) => x.nombre === 'Prueba del eval' && x.id.startsWith('tuya-')); if (!v) return false; return (await fetch('/api/voz/fish/quitar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: v.id }) })).ok })
  await p.keyboard.press('Escape')
  await p.locator('.voz-frase input').fill('')
  await p.keyboard.press('Escape')
  await p.locator(panel).waitFor({ state: 'hidden' })
  await p.locator('.elegir-voz .picker-trigger').first().click()
}

// 7. Clonar tu voz desde el menú, grabándola ahí (micrófono de prueba del navegador). El pedido a Fish Audio se
// contesta aquí, para no crear una voz de verdad en la cuenta: se mide el camino, no a Fish.
const clonar = p.locator('.voz-clonar')
if (await clonar.isVisible()) {
  let pasos = 0
  await p.route('**/api/voz/*/clonar*', async (ruta) => {
    const motor = /\/api\/voz\/(\w+)\/clonar/.exec(ruta.request().url())[1]
    const e = await (await fetch(`http://localhost:${PUERTO}/api/voz`)).json()
    e.motores[motor].voces.unshift({ id: 'prueba-eval', nombre: 'Mi voz', descripcion: 'Tu voz', propia: true })
    r.clonarSubio = { bytes: ruta.request().postDataBuffer()?.length ?? 0, tipo: ruta.request().headers()['content-type'] }
    await ruta.fulfill({ json: e })
  })
  await clonar.click(), pasos++
  await p.locator('.voz-grabar button').click(), pasos++
  await p.waitForTimeout(3200)
  await captura('grabando')
  await p.locator('.voz-grabar button').click(), pasos++
  await p.waitForTimeout(300)
  await captura('clonar')
  await p.locator('.voz-clonar-pie button').click(), pasos++
  await p.waitForTimeout(600)
  r.clonarPasos = pasos
  r.clonarYUsada = await p.locator('.elegir-voz .picker-trigger').first().innerText()
} else r.clonarPasos = 'sin motor para clonar'

// La página tampoco se mueve de lado en una ventana chica ni a lo ancho de un teléfono, con el menú armado y oculto.
if (await p.locator(panel).isVisible()) await p.keyboard.press('Escape')
// Abierto a 1280, se achica la ventana a 1024 y se cierra: tampoco se queda movida de lado.
await p.locator('.elegir-voz .picker-trigger').first().click()
await p.setViewportSize({ width: 1024, height: 800 })
await p.waitForTimeout(400)
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
r.desplazaTrasAchicarAbierto = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
r.desplazaDeLadoPorAncho = {}
for (const ancho of [1024, 390]) {
  await p.setViewportSize({ width: ancho, height: 800 })
  await p.reload()
  await p.waitForTimeout(3500)
  r.desplazaDeLadoPorAncho[ancho] = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
}

console.log(JSON.stringify(r, null, 1))
// Cerrar a veces no vuelve nunca: se espera un momento y se sale igual.
await Promise.race([b.close(), new Promise((ok) => setTimeout(ok, 5000))])
process.exit(0)
