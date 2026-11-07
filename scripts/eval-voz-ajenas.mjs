// Lo mismo que mide scripts/eval-voz.mjs, en las otras apps (docs/agents/eval-voz.md): ElevenLabs, Fish Audio y Suno en
// sus páginas públicas, y AI Studio con una sesión de Google (`--perfil <carpeta de un perfil de Edge con la sesión>`).
// Uso: node scripts/eval-voz-ajenas.mjs fish|eleven|suno|aistudio [--perfil <carpeta>] [--frase] [--clonar]
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { abrirConRaton, abrirHastaPintar, DETECTOR, legibilidad as legible, NAVEGADOR, sonido as sonar, VENTANA } from './eval-voz-comun.mjs'

const [cual] = process.argv.slice(2)
const r = { app: cual }
// Si una página se traba, a los 4 minutos sale con lo que alcanzó a medir (y el navegador se cierra con el proceso).
setTimeout(() => (console.log(JSON.stringify({ ...r, cortado: 'se pasó de 4 minutos' }, null, 1)), process.exit(2)), 240_000)
/** Por dónde va, en la salida de errores: así se ve dónde se traba. */
const paso = (que) => console.error(`[${cual}] ${que}`)
const perfil = process.argv.includes('--perfil') ? process.argv[process.argv.indexOf('--perfil') + 1] : undefined
const navegador = perfil ? undefined : await chromium.launch(NAVEGADOR)
const ctx = perfil ? await chromium.launchPersistentContext(perfil, { ...NAVEGADOR, viewport: VENTANA }) : await navegador.newContext({ viewport: VENTANA })
const p = ctx.pages()[0] ?? (await ctx.newPage())
await p.addInitScript(DETECTOR)
const ahora = () => p.evaluate(() => performance.now())
const sonido = (desde, ms) => sonar(p, desde, ms)
const legibilidad = (sel) => legible(p, sel)
/**
 * La legibilidad de su lista de voces, no de la página entera (sus banners y ofertas no son el selector): el ancestro
 * más chico que contiene las tres primeras voces (`sel`, lo que las marca). En Sloth se mide su menú, lo mismo.
 */
const deLaLista = async (sel) => {
  await p.evaluate((sel) => {
    const v = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width).slice(0, 3)
    let a = v[0]
    while (a && !v.every((x) => a.contains(x))) a = a.parentElement
    a?.setAttribute('data-lista-voces', '')
    a?.scrollIntoView({ block: 'start' }) // solo cuenta lo que está en la pantalla
  }, sel)
  await p.waitForTimeout(800)
  return legibilidad('[data-lista-voces]')
}
/** Va a su biblioteca y mide cuánto tarda en verse la primera voz con su botón de oír (`sel`). */
const irA = async (url, sel) => {
  const t = Date.now()
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.locator(sel).first().waitFor({ state: 'attached', timeout: 60000 }).catch(() => {})
  const ms = Date.now() - t
  await p.waitForTimeout(6000) // que termine de cargar lo demás antes de medir lo siguiente
  return ms
}
/** Pasa 800 ms sobre (x, y) y pulsa: cuánto tarda en sonar. */
const oirEn = async ({ x, y }) => {
  await p.mouse.move(x, y)
  await p.waitForTimeout(800)
  const c = await ahora()
  await p.mouse.click(x, y)
  return sonido(c)
}
/** Desde el foco actual, Tab hasta un botón de oír y Enter: cuántas teclas hasta que suena (o null). */
const teclas = async (esOir) => {
  for (let n = 0; n < 80; n++) {
    const d = await p.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 50))
    if (esOir.test(d)) {
      const c = await ahora()
      await p.keyboard.press('Enter')
      return (await sonido(c)) ? n + 1 : null
    }
    await p.keyboard.press('Tab')
  }
  return null
}
const centro = (sel, n = 0) => p.locator(sel).nth(n).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })

if (cual === 'fish') {
  const ir = () => irA('https://fish.audio/discovery/', 'main img[alt]')
  paso("abre su biblioteca")
  r.verVocesMs = await ir()
  paso("legibilidad")
  r.legibilidad = await deLaLista('main img[alt]')
  // El botón de oír sale al pasar sobre la foto de la tarjeta.
  paso("oír")
  r.oir = await oirEn(await p.evaluate(() => { const i = [...document.querySelectorAll('img')].filter((x) => { const b = x.getBoundingClientRect(); return b.top > 560 && b.width > 30 && b.width < 80 })[1].getBoundingClientRect(); return { x: i.x + i.width / 2, y: i.y + i.height / 2 } }))
  await ir()
  await p.locator('input:visible').first().focus()
  paso("teclado")
  r.teclas = await teclas(/play|reproducir|escuchar|preview/i)
  // Encontrar «grave narración» con sus etiquetas: Narración y Profundo (o en inglés, Narration y Deep).
  await ir()
  let clics = 0
  for (const [es, en] of [['Narración', 'Narration'], ['Profundo', 'Deep']]) {
    // Sus etiquetas son `div` en la barra de arriba de la lista.
    const chip = p.locator('main div.inline-flex:visible').filter({ hasText: new RegExp(`^\\s*(${es}|${en})\\s*$`) }).first()
    if (await chip.count()) await chip.click({ timeout: 5000 }).then(() => clics++, () => {})
    await p.waitForTimeout(2500)
  }
  r.encontrar = { clics, url: p.url(), voces: await p.locator('main img[alt]').count() }
  // `--frase`: su demo pública de texto a voz (fish.audio/text-to-speech): escribir, «Generate & play», y otra voz.
  if (process.argv.includes('--frase')) try {
    paso('tu frase')
    await p.goto('https://fish.audio/text-to-speech/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(7000)
    let entradas = 0
    const caja = p.locator('textarea:visible, [contenteditable=true]:visible').first()
    await caja.click()
    await p.keyboard.press('Control+A')
    await p.keyboard.type(`Hola, esta es una prueba ${Date.now() % 10000} con mi frase.`), entradas++
    const generar = p.getByRole('button', { name: /Generate & play/i }).first()
    let c = await ahora()
    await generar.click(), entradas++
    const primera = await sonido(c, 90_000)
    await p.waitForTimeout(500)
    await p.getByText('Adrian', { exact: true }).first().click(), entradas++
    c = await ahora()
    await generar.click(), entradas++
    r.frase = { entradasDosVoces: entradas, primeraMs: primera?.ms ?? null, segundaMs: (await sonido(c, 90_000))?.ms ?? null }
  } catch (e) {
    r.frase = { error: String(e.message).split('\n')[0] }
  }
} else if (cual === 'eleven') {
  const ir = () => irA('https://elevenlabs.io/voice-library', `[aria-label^='Play "']`)
  paso("abre su biblioteca")
  r.verVocesMs = await ir()
  paso("legibilidad")
  r.legibilidad = await deLaLista(`[aria-label^='Play "']`)
  const b = p.locator('[aria-label^=\'Play "\']').first()
  await b.scrollIntoViewIfNeeded()
  paso("oír")
  r.oir = await oirEn(await centro('[aria-label^=\'Play "\']'))
  await ir()
  // Su página pública no tiene buscador: se cuenta desde arriba.
  paso("teclado")
  r.teclas = await teclas(/^play\b/i)
  // `--frase`: la demo pública de su inicio (elevenlabs.io): escribir, Play, y otra voz en su desplegable.
  if (process.argv.includes('--frase')) try {
    paso('tu frase')
    await p.goto('https://elevenlabs.io/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(7000)
    let entradas = 0
    const caja = p.locator('textarea').first()
    await caja.scrollIntoViewIfNeeded()
    const marco = caja.locator('xpath=ancestor::*[.//button[normalize-space()="Play"]][1]')
    await caja.fill(`Hello, this is test ${Date.now() % 10000} with my own sentence.`), entradas++
    let c = await ahora()
    await marco.getByRole('button', { name: 'Play', exact: true }).click(), entradas++
    const primera = await sonido(c, 90_000)
    await p.waitForTimeout(500)
    await marco.getByRole('button', { name: 'Voice' }).click(), entradas++
    await p.waitForTimeout(700)
    await p.locator('[role=option], [role=menuitem], [role=menuitemradio]').nth(1).click(), entradas++
    await p.waitForTimeout(500)
    c = await ahora()
    await marco.getByRole('button', { name: 'Play', exact: true }).click(), entradas++
    r.frase = { entradasDosVoces: entradas, primeraMs: primera?.ms ?? null, segundaMs: (await sonido(c, 90_000))?.ms ?? null }
  } catch (e) {
    r.frase = { error: String(e.message).split('\n')[0] }
  }
} else if (cual === 'suno') {
  const ir = async () => {
    const ms = await irA('https://suno.com/explore', 'button[aria-label="Play"]')
    await p.keyboard.press('Escape') // el aviso para entrar
    await p.waitForTimeout(600)
    return ms
  }
  paso("abre su biblioteca")
  r.verVocesMs = await ir()
  paso("legibilidad")
  r.legibilidad = await deLaLista('button[aria-label="Play"]')
  const tarjeta = await p.evaluate(() => { const i = [...document.querySelectorAll('img')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 150 && b.top > 100 }).getBoundingClientRect(); return { x: i.x + i.width / 2, y: i.y + i.height / 2 } })
  await p.mouse.move(tarjeta.x, tarjeta.y)
  await p.waitForTimeout(400)
  paso("oír")
  r.oir = await oirEn(await p.evaluate(({ x, y }) => { const b = [...document.querySelectorAll('button[aria-label="Play"]')].map((e) => e.getBoundingClientRect()).find((b) => b.width && Math.abs(b.x + b.width / 2 - x) < 120 && Math.abs(b.y + b.height / 2 - y) < 120); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }, tarjeta))
  await ir()
  await p.locator('input[placeholder^="Search"]').first().focus()
  paso("teclado")
  r.teclas = await teclas(/^play$/i)
  // Sus Voices están en Create, que sin cuenta manda a entrar.
  await p.goto('https://suno.com/create', { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(6000)
  r.voicesSinCuenta = p.url()
} else if (cual === 'aistudio') {
  if (!perfil) throw new Error('AI Studio pide sesión: --perfil <carpeta de un perfil de Edge con la sesión de Google>')
  await p.goto('https://aistudio.google.com/generate-speech', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(8000)
  await p.getByText('Create new dialog', { exact: true }).first().click().catch(() => {})
  await p.waitForTimeout(4000)
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Speaker 1/.test(b.textContent))?.setAttribute('data-medir', ''))
  r.abrirMs = []
  for (let i = 0; i < 5; i++) {
    r.abrirMs.push(await abrirHastaPintar(p, '[data-medir]', '.cdk-overlay-pane [aria-label="Favorite Bodi"]'))
    await p.waitForTimeout(800)
    if (i < 4) await p.keyboard.press('Escape'), await p.waitForTimeout(800)
  }
  const panel = '.cdk-overlay-pane:has(input[aria-label="Search voices"])'
  // Con un clic de persona (aprieta, 100 ms, suelta), desde que aprieta. Igual que en Sloth.
  r.abrirConRatonMs = []
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press('Escape')
    await p.waitForTimeout(800)
    r.abrirConRatonMs.push(await abrirConRaton(p, '[data-medir]', '.cdk-overlay-pane [aria-label="Favorite Bodi"]'))
    await p.waitForTimeout(800)
  }
  paso("legibilidad")
  r.legibilidad = await legibilidad(panel)
  paso("oír")
  r.oir = await oirEn(await centro(`${panel} button[aria-label="Play voice sample"]`))
  await p.locator('input[aria-label="Search voices"]').focus()
  paso("teclado")
  r.teclas = await teclas(/^play voice sample$/i)
  // Encontrar «grave narración» con sus filtros: Pitch → Low y Use case → Storyteller.
  let clics = 0
  // Sus desplegables, en orden: Language, Gender, Pitch, Style, Use case (los botones con «arrow_drop_down»).
  for (const [n, opcion] of [[2, /^\s*Low\b/], [4, /^\s*Storyteller\b/]]) {
    await p.locator(`${panel} button:has-text("arrow_drop_down")`).nth(n).click(), clics++
    await p.waitForTimeout(700)
    const op = p.locator('.cdk-overlay-pane').last().locator('[role=option], mat-option, button').filter({ hasText: opcion }).first()
    if (await op.count()) await op.click(), clics++
    await p.waitForTimeout(1500)
  }
  r.encontrar = { clics, voces: (await p.locator(panel).innerText()).split('\n').filter((l) => /pitch/i.test(l) && /·/.test(l)).length }
  // Oír tu frase (gasta un pedido de su cuota): escribirla, elegir la voz en su panel y Run.
  if (process.argv.includes('--frase')) try {
    // Cerrar el desplegable y el panel de antes (si el panel siguiera abierto, «Speaker 1» lo cerraría).
    for (let i = 0; i < 3 && (await p.locator(panel).count()); i++) await p.keyboard.press('Escape'), await p.waitForTimeout(500)
    let pasos = 0
    const caja = p.locator('textarea[aria-label="Speech block text"]').first()
    await caja.fill(`Hola, esta es una prueba ${Date.now() % 10000}.`), pasos++
    await p.locator('button:has-text("Speaker 1")').first().click(), pasos++
    await p.locator(panel).waitFor({ timeout: 10_000 })
    await p.waitForTimeout(800)
    // Enzo: grave y de narración, sale con los filtros de antes puestos.
    await p.locator(`${panel} button[aria-label]`).filter({ hasText: /^\s*Enzo\b/ }).first().click({ timeout: 10_000 }), pasos++
    await p.waitForTimeout(800)
    await p.keyboard.press('Escape')
    const c = await ahora()
    const respuesta = p.waitForResponse((x) => x.url().includes('GenerateContent'), { timeout: 90_000 }).catch(() => null)
    await p.locator('button:has-text("Run")').last().click({ timeout: 10_000 }), pasos++
    r.frase = { pasos, sono: await sonido(c, 90_000), respuesta: (await respuesta)?.status() ?? 'sin respuesta' }
    // Lo que quedó en la página (si no sonó, ahí se ve por qué: la cuota, un error…).
    await p.screenshot({ path: fileURLToPath(new URL('../data/navegador-capturas/ajena-aistudio-frase.png', import.meta.url)) })
  } catch (e) {
    r.frase = { error: String(e.message).split('\n')[0] }
  }
}

// `--clonar`: su camino para clonar tu voz, entrada por entrada, hasta donde deja llegar sin pulsar lo último (no se
// crea nada). Donde pide entrar o pagar, eso es lo que se anota.
if (process.argv.includes('--clonar')) try {
  paso('clonar')
  const entradas = []
  const pulsar = async (que, loc) => (await loc.first().click({ timeout: 15_000 }), entradas.push(que), p.waitForTimeout(2500))
  if (cual === 'fish') {
    await p.goto('https://fish.audio/es/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(6000)
    await pulsar('Crear voz', p.getByText('Crear voz', { exact: true }))
    await pulsar('Clonación instantánea', p.getByText('Clonación de voz instantánea'))
    await pulsar('Registro', p.getByRole('button', { name: /Registro/ }))
    await pulsar('Empezar', p.getByRole('button', { name: /Empezar/ }))
    await p.waitForTimeout(11_000) // su mínimo son 10 s
    await pulsar('Detener', p.getByRole('button', { name: /Detener/ }))
    await pulsar('Analizar audio', p.getByRole('button', { name: /Analizar audio/ }))
    await p.waitForTimeout(5000)
    const aviso = await p.locator('[role=dialog]').first().innerText({ timeout: 2000 }).catch(() => '')
    r.clonar = { entradas, pideEntrar: /inicie sesión|iniciar sesión|sign in|log in|autenticación/i.test(aviso) }
  } else if (cual === 'aistudio') {
    // Cerrar lo que haya dejado abierto lo de antes (si su panel siguiera abierto, «Speaker 1» lo cerraría).
    for (let i = 0; i < 3; i++) await p.keyboard.press('Escape'), await p.waitForTimeout(400)
    await pulsar('Speaker 1', p.locator('button:has-text("Speaker 1")'))
    await pulsar('New voice', p.locator('.cdk-overlay-pane button', { hasText: 'New voice' }))
    await pulsar('Voice Replication', p.getByText('Voice Replication', { exact: true }))
    await p.waitForTimeout(4000)
    const aviso = await p.locator('body').innerText().catch(() => '')
    r.clonar = { entradas, pidePago: /nivel pagado|paid tier|clave de API pagada|paid API key/i.test(aviso), aviso: (/[^\n]*(nivel pagado|paid tier)[^\n]*/i.exec(aviso) ?? [''])[0].slice(0, 140) }
  } else {
    const url = cual === 'eleven' ? 'https://elevenlabs.io/app/voice-lab' : 'https://suno.com/create'
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(7000)
    r.clonar = { entradas, pideEntrar: /sign-in/.test(p.url()), url: p.url() }
  }
} catch (e) {
  r.clonar = { error: String(e.message).split('\n')[0] }
}

console.log(JSON.stringify(r, null, 1))
// Cerrar a veces no vuelve nunca (visto con Fish Audio y Suno): se espera un momento y se sale igual.
await Promise.race([ctx.close().then(() => navegador?.close()), new Promise((ok) => setTimeout(ok, 5000))])
process.exit(0)
