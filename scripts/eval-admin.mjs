// El eval del Administrador (docs/agents/eval-admin.md): abre Sloth en Edge, hace las mismas tareas que se midieron en
// React-admin, Refine, Filament y PocketBase (eval-admin-ajenas.mjs) y da lo medido, con capturas en
// data/navegador-capturas/admin-*.png.
// Uso: node scripts/eval-admin.mjs [puerto] [--real [--deshacer-de-verdad]]
// Sin `--real`, el panel es uno inventado (85 personas en dos llaves, 300 llamadas, 14 errores) y lo que cambia algo se
// contesta aquí: no toca ninguna cuenta. El cobro de verdad tarda unos 4 s en armar el panel, y el inventado tarda lo
// mismo. Con `--real`, lo que lee es lo de tu cobro (solo en la computadora del creador) y lo que cambiaría algo
// tampoco sale: se contesta aquí.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { abrirConRaton, legibilidad, NAVEGADOR, VENTANA } from './eval-voz-comun.mjs'
import { enIngles, KLM, pintado } from './eval-admin-comun.mjs'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUERTO = process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? '4848'
const REAL = process.argv.includes('--real')
// Con `--real --deshacer-de-verdad`: suma 1 crédito a tu propia cuenta de voz («Tú (creador)») y lo deshace, de verdad.
// Asignar créditos no gasta saldo, y queda como estaba.
const DE_VERDAD = REAL && process.argv.includes('--deshacer-de-verdad')
const CAPTURAS = join(APP, 'data', 'navegador-capturas')
mkdirSync(CAPTURAS, { recursive: true })

// ── El panel inventado ──────────────────────────────────────────────────────────────────────────────────────────────

const DIA = 86400_000
const AHORA = Date.UTC(2026, 10, 11, 18)
const iso = (ms) => new Date(ms).toISOString()
const NOMBRES = ['ana', 'beto', 'carla', 'diego', 'elena', 'fer', 'gabo', 'hilda', 'ivan', 'julia', 'kevin', 'lucia', 'mario', 'nadia', 'oscar', 'paola', 'quique']
const personas = Array.from({ length: 85 }, (_, i) => {
  const externo = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  const email = `${NOMBRES[i % NOMBRES.length]}.${['rios', 'luna', 'vega', 'soto', 'mora'][i % 5]}${i}@correo.mx`
  const plan = i % 7 === 0 ? { plan: 'mensual', estado: 'authorized', monto: 15, moneda: 'USD', fundador: i % 2 } : i % 11 === 0 ? { plan: 'unico', estado: 'pagado', monto: 299, moneda: 'MXN' } : { plan: 'cuenta', estado: 'gratis' }
  return {
    externo,
    email,
    licencias: [plan],
    usuario: { user_id: 1000 + i, external_id: externo, name: email.split('@')[0], credits: (i * 7919) % 120_000, status: i === 13 ? 'suspended' : 'active', created_at: iso(AHORA - i * DIA * 0.7), used_total: (i * 131) % 9000, used_today: i % 9 === 0 ? 240 : 0, generations: i % 23 }
  }
})
const llaves = [personas.slice(0, 80), personas.slice(80)].map((grupo, k) => ({
  id: k ? 'VOICES_PK_LIVE_2' : 'VOICES_PK_LIVE',
  nombre: k ? 'VOICES_PK_LIVE_2' : 'VOICES_PK_LIVE',
  fin: k ? '3a55' : 'cf1f',
  saldo: { status: 200, datos: { balance: k ? 499_890 : 3_950_292, used_today: 8755, used_total: 49_708, generations: 85, users: grupo.length, daily_limit: null, resets_at: iso(AHORA + DIA / 2) } },
  usuarios: { status: 200, datos: { page: 1, per_page: 100, total: grupo.length, users: grupo.map((p) => p.usuario) } },
  uso: { status: 200, datos: { page: 1, per_page: 100, total: 40, items: grupo.slice(0, 40).map((p, i) => ({ date: iso(AHORA - i * 3600_000), kind: i % 5 ? 'consumo' : 'recarga', external_id: p.externo, function: i % 5 ? 'tts' : 'recarga manual', credits: i % 5 ? -120 : 5000 })) } }
}))
const ERRORES = [
  { status: 402, codigo: 'insufficient_credits', error: 'No te quedan créditos de voz.' },
  { status: 502, codigo: 'sin_conexion', error: 'No hubo conexión con las voces de Sloth.' },
  { status: 504, codigo: null, error: null }
]
const registro = Array.from({ length: 300 }, (_, i) => {
  // Las últimas 300 llamadas son de 40 de las 85: las otras 45 no salen en ellas (como en el cobro de verdad).
  const p = personas[(i * 7) % 40]
  const fallo = i % 23 === 4 ? ERRORES[i % 3] : null
  const accion = i % 9 === 0 ? 'creditos' : i % 4 === 0 ? 'sesion' : 'tts'
  return { id: 5000 - i, cuando: iso(AHORA - i * 1800_000), externo: p.externo, accion, voz: accion === 'tts' ? 'vc:abc123' : null, letras: accion === 'tts' ? 180 : null, creditos: accion === 'creditos' ? 5000 : accion === 'tts' ? 160 : null, restantes: 4200, tarea: null, status: fallo?.status ?? 200, codigo: fallo?.codigo ?? null, error: fallo?.error ?? null, ms: 900 + (i % 7) * 400 }
})
const PANEL = {
  configurado: true,
  soloCreador: false,
  reparto: { saldo: 4_450_182, enUsuarios: 4_310_375, beneficiarios: 35, porEntregar: 0, cadaMes: 3_500_000, libres: 139_807 },
  mensuales: 100_000,
  mensualesDesde: '$15 USD (299 MXN en los apoyos en pesos)',
  repartos: personas.filter((_, i) => i % 7 === 0).map((p) => ({ externo: p.externo, periodo: '2026-11', creditos: 100_000, estado: 'entregado', entregado: iso(AHORA - DIA), correo: iso(AHORA - DIA), error: null })),
  creditosIniciales: 0,
  pagina: 1,
  consumo: 1,
  llaves,
  nuevos: 'VOICES_PK_LIVE',
  cuentas: Object.fromEntries(personas.map((p) => [p.externo, { email: p.email, licencias: p.licencias }])),
  registro,
  resumen: [
    { accion: 'sesion', llamadas: 410, fallidas: 0, letras: null, creditos: null, usuarios: 41, ms: 1300 },
    { accion: 'tts', llamadas: 100, fallidas: 10, letras: 44_676, creditos: 49_818, usuarios: 19, ms: 13_300 }
  ],
  // Como los arma el cobro: de las llamadas fallidas, por código, con la última y su mensaje.
  errores: Object.values(
    Object.groupBy(registro.filter((x) => x.status >= 400), (x) => `${x.status}${x.codigo}`)
  ).map((g) => ({ status: g[0].status, codigo: g[0].codigo, veces: g.length, ultima: g.map((x) => x.cuando).sort().at(-1), error: g[0].error }))
}
const RIFA = { abierta: null, ganadores: [], vozAbierta: true }

// ── El navegador ───────────────────────────────────────────────────────────────────────────────────────────────────

const b = await chromium.launch(NAVEGADOR)
const p = await b.newPage({ viewport: VENTANA })
const r = { panel: REAL ? 'el de tu cobro' : 'inventado (85 personas)' }
setTimeout(() => (console.log(JSON.stringify({ ...r, cortado: 'se pasó de 5 minutos' }, null, 1)), process.exit(2)), 300_000)
const errores = []
p.on('pageerror', (e) => errores.push(e.message))
p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errores.push(m.text().slice(0, 200)))
await p.addInitScript(() => localStorage.setItem('bienvenida', '1'))
await p.route('**/api/cards/*/anterior', (x) => x.fulfill({ json: null }))
/** Lo que se habría cambiado: aquí se anota y no sale. */
const cambios = []
/** Lo que el servidor de Sloth anotaría en `admin-cambios.json`. */
const anotados = []
await p.route('**/api/admin/voz/**', async (x) => {
  const q = x.request()
  const ruta = new URL(q.url()).pathname
  // Lo único que sale de verdad: ±1 crédito a la cuenta del creador, con `--deshacer-de-verdad`.
  if (DE_VERDAD && q.method() === 'POST' && ruta.endsWith('/creditos')) {
    const b = q.postDataJSON()
    if (b.externo === 'creador' && Math.abs(b.amount) === 1) return cambios.push({ ruta, cuerpo: b, deVerdad: true }), x.continue()
  }
  if (q.method() === 'POST') {
    const cuerpo = q.postDataJSON()
    cambios.push({ ruta, cuerpo })
    if (ruta.endsWith('/alta')) return x.fulfill({ json: { externo: 'nuevo', creado: true, llave: 'cf1f' } })
    // Como el servidor de Sloth (`anotarCambio`): el cambio anotado, con su id para deshacerlo.
    const cambio = { id: `c${anotados.length + 1}`, externo: cuerpo.externo, tipo: ruta.endsWith('/estado') ? 'estado' : 'creditos', valor: cuerpo.amount ?? cuerpo.status, cuando: new Date().toISOString(), ...(cuerpo.deshace ? { deshace: cuerpo.deshace } : {}) }
    for (const y of anotados) if (y.id === cuerpo.deshace) y.deshecho = cambio.cuando
    // El cobro inventado aplica el cambio: lo que se lea después ya lo trae.
    const per = personas.find((y) => y.externo === cuerpo.externo)
    if (per && cambio.tipo === 'creditos') per.usuario.credits += Number(cuerpo.amount)
    if (per && cambio.tipo === 'estado') per.usuario.status = cuerpo.status
    // Como Voices Cloning: tras sumar o quitar, con cuánto quedó (y el servidor de Sloth lo anota en el cambio).
    if (per && cambio.tipo === 'creditos') cambio.saldo = per.usuario.credits
    anotados.push(cambio)
    return x.fulfill({ json: { ok: true, ...(cambio.saldo !== undefined ? { credits: cambio.saldo } : {}), cambio } })
  }
  if (ruta.endsWith('/cambios')) return x.fulfill({ json: { cambios: anotados.filter((y) => y.externo === new URL(q.url()).searchParams.get('externo')) } })
  if (REAL) return x.continue()
  if (ruta.endsWith('/guardado')) return x.fulfill({ json: { ...PANEL, leido: Date.now() - 6 * 60_000 } })
  // Lo de una persona: su registro entero (también su alta, de antes de las últimas 300). El cobro tarda ~1 s en
  // contestarlo; lo que el servidor de Sloth ya guardó (`/ficha`), al momento.
  const externo = new URL(q.url()).searchParams.get('externo')
  const ficha = () => {
    const per = personas.find((y) => y.externo === externo)
    const alta = per && { id: 100 + personas.indexOf(per), cuando: per.usuario.created_at, externo, accion: 'alta', voz: null, letras: null, creditos: null, restantes: null, tarea: null, status: 200, codigo: null, error: null, ms: 900 }
    return { usuario: per ? { status: 200, datos: per.usuario } : { status: 404, datos: { error: 'No existe' } }, llave: { nombre: 'VOICES_PK_LIVE', fin: 'cf1f' }, registro: [...registro.filter((y) => y.externo === externo), ...(alta ? [alta] : [])], cuenta: per ? { email: per.email, licencias: per.licencias } : null }
  }
  // Como el servidor de Sloth: nadie sale en el panel sin su ficha guardada (`leerFichasNuevas`).
  if (ruta.endsWith('/ficha')) return x.fulfill({ json: { datos: ficha(), leido: Date.now() - 3600_000 } })
  if (ruta.endsWith('/usuario')) return await new Promise((ok) => setTimeout(ok, 1000)), x.fulfill({ json: ficha() })
  return x.fallback()
})
if (!REAL) {
  await p.route(/\/api\/admin\/voz(\?|$)/, async (x) => (await new Promise((ok) => setTimeout(ok, 4000)), x.fulfill({ json: PANEL })))
  await p.route('**/api/comunidad/rifa/admin', (x) => x.fulfill({ json: RIFA }))
}

const lista = '.admin:not([hidden]) .admin-usuarios tbody tr'
const entrada = 'button.new-chat:has-text("Administrador")'
const captura = (nombre) => p.screenshot({ path: join(CAPTURAS, `admin-${nombre}.png`) })

// 1. Abrir: desde «Nuevo chat», quieta 3 s, un clic de persona en «Administrador» hasta ver la lista pintada.
await p.goto(`http://localhost:${PUERTO}/#/`)
await p.waitForSelector(entrada)
await p.waitForTimeout(3000)
r.abrirPrimeraVezMs = await abrirConRaton(p, entrada, lista)
r.abrirMs = []
for (let i = 0; i < 5; i++) {
  await p.goto(`http://localhost:${PUERTO}/#/`).catch(() => {})
  await p.waitForFunction(() => !document.querySelector('.admin:not([hidden])'))
  await p.waitForTimeout(1500)
  r.abrirMs.push(await abrirConRaton(p, entrada, lista))
}
// Lo nuevo del cobro llega solo, sin tocar nada.
await p.waitForFunction(() => /Leído hace un momento/.test(document.querySelector('.admin-leido')?.textContent ?? ''), null, { timeout: 30_000 }).catch(() => {})
r.leidoDeFondo = await p.evaluate(() => document.querySelector('.admin-leido')?.textContent?.trim())
await p.waitForTimeout(500)
r.focoEnElBuscador = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Buscar a alguien')
await captura('lista')

// 7, 8 y 9. Legibilidad, idioma y filas a la vista, con la lista abierta.
r.legibilidad = await legibilidad(p, '.admin-principal')
r.palabrasEnIngles = await enIngles(p, '.admin-principal')
r.filas = await p.evaluate((sel) => {
  const filas = [...document.querySelectorAll(sel)]
  return { aLaVista: filas.filter((f) => f.getBoundingClientRect().bottom <= innerHeight).length, altoPx: +filas[0].getBoundingClientRect().height.toFixed(1) }
}, lista)
r.desplazaDeLado = {}
for (const ancho of [1280, 1024, 390]) {
  await p.setViewportSize({ width: ancho, height: 800 })
  await p.waitForTimeout(200)
  r.desplazaDeLado[ancho] = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
}
await p.setViewportSize(VENTANA)

// 2. Encontrar a alguien por su correo: alguien de abajo de la lista. Se escriben las letras de su correo, una a una,
// hasta que sale primero (y activa: Enter ya lo abre). De cada letra que cambia la lista, los ms hasta verla pintada
// (las que no la cambian, como la «o» que está en todos los correos, no cuentan).
const objetivo = await p.evaluate((sel) => [...document.querySelectorAll(sel)].at(-3).querySelector('td').textContent.trim(), lista)
r.encontrar = { quien: objetivo, pintadoMs: [] }
const primero = () => p.evaluate(() => document.querySelector('.admin-usuarios tr.activa td')?.textContent.trim())
let n = 0
while (n < objetivo.length && (n === 0 || (await primero()) !== objetivo)) {
  const ms = await pintado(p, () => p.keyboard.press(objetivo[n]), '.admin:not([hidden]) .admin-usuarios', 1500)
  if (ms !== null) r.encontrar.pintadoMs.push(ms)
  n++
}
r.encontrar.letras = objetivo.slice(0, n)
r.encontrar.entradas = { clics: 0, teclas: n }
r.encontrar.klmS = KLM({ teclas: n })

await captura('encontrar')

// 3 y 6. Darle créditos: desde su fila (activa), Enter abre su ficha con el cursor en «créditos», 5000 y Enter.
const antes = cambios.length
await p.keyboard.press('Enter')
await p.waitForSelector('.admin-ficha')
r.teclado = { hastaElCampo: n + 1, focoEnCreditos: await p.evaluate(() => document.activeElement?.id === 'admin-cuanto') }
await p.waitForFunction(() => !document.querySelector('#admin-cuanto')?.disabled)
await p.keyboard.type('5000')
await p.keyboard.press('Enter')
await p.waitForFunction((n) => document.querySelector('.admin-hecho'), antes)
r.darCreditos = { entradas: { clics: 0, teclas: 1 + 4 + 1 }, klmS: KLM({ teclas: 6 }), mandado: cambios.slice(antes) }
r.teclado.hastaGuardar = r.teclado.hastaElCampo + 4 + 1
// Los créditos de la ficha ya cuentan lo sumado, sin esperar a leer otra vez.
const persona = personas.find((y) => y.externo === cambios[antes]?.cuerpo.externo)
await p.waitForTimeout(150)
r.darCreditos.fichaAlMomento = { cobro: persona?.usuario.credits.toLocaleString('es-MX'), ahora: await p.evaluate(() => document.querySelector('.admin-ficha-cifras .grande')?.textContent) }
// El cursor sigue en el campo para el siguiente, y a los 2,5 s (cuando ya contestó la lectura pedida antes de sumar) los
// créditos no vuelven a los de antes.
r.darCreditos.focoTrasSumar = await p.evaluate(() => document.activeElement?.id)
await p.waitForTimeout(2400)
r.darCreditos.fichaA2500ms = { cobro: persona?.usuario.credits.toLocaleString('es-MX'), ficha: await p.evaluate(() => document.querySelector('.admin-ficha-cifras .grande')?.textContent) }
await captura('ficha')

// 10. Deshacer: en el aviso, y cuando sea en «Lo que le cambiaste aquí» (créditos y suspender). Lo que el cobro anotó
// por su cuenta (reparto, rifa, regalos) no se puede deshacer desde aquí.
const antesDeshacer = cambios.length
await p.click('.admin-hecho .admin-deshacer')
await p.waitForFunction(() => /Deshiciste/.test(document.querySelector('.admin-ficha .admin-historial')?.textContent ?? ''))
// Otro cambio enseguida: su aviso trae su «Deshacer» listo (no el del aviso anterior, que se pulsó).
await p.focus('#admin-cuanto')
await p.keyboard.type('3000')
await p.keyboard.press('Enter')
await p.waitForFunction(() => /3,000/.test(document.querySelector('.admin-hecho')?.textContent ?? ''))
const avisoNuevoListo = await p.evaluate(() => !document.querySelector('.admin-hecho .admin-deshacer')?.disabled)
await p.click('.admin-hecho .admin-deshacer')
await p.waitForTimeout(300)
r.deshacer = {
  avisoNuevoListo,
  delAviso: cambios.slice(antesDeshacer),
  // Tras deshacer, el cambio y su deshacer ya no ofrecen deshacer otra vez.
  botonesTrasDeshacer: await p.locator('.admin-ficha .admin-historial .admin-deshacer').count(),
  // Suspender, y deshacerlo desde la ficha (no desde el aviso).
  suspender: null
}
const antesSuspender = cambios.length
await p.click('.admin-suspender')
await p.waitForFunction(() => [...document.querySelectorAll('.admin-ficha .admin-historial li')].some((li) => /suspendiste/.test(li.textContent) && li.querySelector('.admin-deshacer')))
await p.locator('.admin-ficha .admin-historial li', { hasText: 'suspendiste' }).locator('.admin-deshacer').click()
await p.waitForTimeout(400)
r.deshacer.suspender = cambios.slice(antesSuspender).map((c) => ({ ruta: c.ruta, status: c.cuerpo.status, deshace: !!c.cuerpo.deshace }))
r.deshacer.enElRegistroDelCobro = await p.locator('.admin-ficha h3:has-text("Su historial") + ol .admin-deshacer').count()

// 5. Todo lo de esa persona. Con el teclado, Enter en su fila (la activa tras buscarla). Con el ratón, un clic de persona
// en su fila (el puntero llega, 300 ms, aprieta, 100 ms, suelta), como en las otras: los ms hasta ver su historial.
r.historial = { teclado: { entradas: 1, klmS: KLM({ teclas: 1 }) }, filas: await p.locator('.admin-historial-cobro li').count() }
await p.keyboard.press('Escape') // cierra la ficha
await p.keyboard.press('Escape') // borra lo buscado
await p.waitForFunction(() => !document.querySelector('.admin-ficha'))
r.historial.raton = { entradas: 1, ms: [] }
// De quien sí salió en las últimas llamadas (filas 4 y 7) y de quien no (45 y 70: su historial sale de su ficha guardada).
for (const k of [4, 7, 45, 70]) {
  const f = `.admin:not([hidden]) .admin-usuarios tbody tr:nth-child(${k})`
  if (!(await p.locator(f).count())) continue
  await p.locator(f).scrollIntoViewIfNeeded()
  await p.waitForTimeout(300)
  r.historial.raton.ms.push(await abrirConRaton(p, f, '.admin-ficha .admin-historial-cobro li'))
  await p.keyboard.press('Escape')
  await p.waitForFunction(() => !document.querySelector('.admin-ficha'))
  await p.mouse.move(5, 5)
  await p.waitForTimeout(300)
}
r.historial.raton.klmS = KLM({ clics: 1 })

// Al cerrar su ficha y volver a abrirla (ya leído lo nuevo), sus créditos son los del cobro: lo sumado no cuenta dos veces.
// Solo con el panel inventado: con `--real` los cambios no llegan al cobro y no hay saldo nuevo con que comparar.
if (!REAL) {
  const f = '.admin:not([hidden]) .admin-usuarios tbody tr:nth-child(5)'
  await p.evaluate((f) => (document.querySelector('.admin-hecho .admin-icono-boton')?.click(), document.querySelector(f).scrollIntoView({ block: 'center' })), f)
  await abrirConRaton(p, f, '.admin-ficha')
  await p.keyboard.type('700')
  await p.keyboard.press('Enter')
  await p.waitForTimeout(5500) // el panel inventado tarda 4 s en volver a leerse
  const externo = cambios.at(-1).cuerpo.externo
  await p.keyboard.press('Escape')
  await p.waitForFunction(() => !document.querySelector('.admin-ficha'))
  await abrirConRaton(p, f, '.admin-ficha')
  await p.waitForTimeout(1500)
  r.darCreditos.alReabrir = { cobro: personas.find((y) => y.externo === externo).usuario.credits.toLocaleString('es-MX'), ficha: await p.evaluate(() => document.querySelector('.admin-ficha-cifras .grande')?.textContent) }
  await p.keyboard.press('Escape')
  await p.waitForFunction(() => !document.querySelector('.admin-ficha'))
}

// 3 con el ratón: un clic de persona en su fila deja el cursor en «créditos»; 5000 y Enter.
{
  const antes = cambios.length
  const f = '.admin:not([hidden]) .admin-usuarios tbody tr:nth-child(5)'
  await p.evaluate((f) => (document.querySelector('.admin-hecho .admin-icono-boton')?.click(), document.querySelector(f).scrollIntoView({ block: 'center' })), f)
  await abrirConRaton(p, f, '.admin-ficha')
  const foco = await p.evaluate(() => document.activeElement?.id)
  await p.keyboard.type('5000')
  await p.keyboard.press('Enter')
  await p.waitForTimeout(500)
  r.darCreditos.conElRaton = { focoTrasElClic: foco, mandado: cambios.slice(antes).map((c) => c.cuerpo.amount), entradas: { clics: 1, teclas: 5 }, klmS: KLM({ clics: 1, teclas: 5 }) }
  await p.keyboard.press('Escape')
  await p.waitForFunction(() => !document.querySelector('.admin-ficha'))
}

/** Un clic de persona en la fila de `externo` (se busca por su correo en la lista) hasta ver su historial. */
const historialDe = async (correo) => {
  const i = await p.evaluate((c) => [...document.querySelectorAll('.admin:not([hidden]) .admin-usuarios tbody tr')].findIndex((f) => f.querySelector('td')?.textContent.trim() === c), correo)
  if (i < 0) return null
  const f = `.admin:not([hidden]) .admin-usuarios tbody tr:nth-child(${i + 1})`
  // Al centro, y sin el aviso de abajo encima (le quitaría el clic).
  await p.evaluate((f) => (document.querySelector('.admin-hecho .admin-icono-boton')?.click(), document.querySelector(f).scrollIntoView({ block: 'center' })), f)
  await p.waitForTimeout(300)
  // Su historial, o el aviso de que no tiene nada (sin esperar al cobro: «Leyendo…» no cuenta).
  const ms = await abrirConRaton(p, f, '.admin-ficha :is(.admin-historial-cobro li, .admin-historial-vacio)')
  await p.keyboard.press('Escape')
  await p.waitForFunction(() => !document.querySelector('.admin-ficha'))
  await p.mouse.move(5, 5)
  await p.waitForTimeout(300)
  return ms
}
if (REAL) {
  // Con tus datos: de quienes NO salen en las últimas llamadas del panel, en cuántos el servidor ya guardó su ficha, y
  // el historial de hasta 5 de ellos (los de más abajo de la lista).
  const real = await (await fetch(`http://localhost:${PUERTO}/api/admin/voz/guardado`)).json()
  const enLlamadas = new Set(real.registro.map((x) => x.externo))
  const todos = real.llaves.flatMap((l) => l.usuarios.datos.users ?? []).map((u) => u.external_id)
  const sinLlamadas = todos.filter((e) => !enLlamadas.has(e))
  let guardadas = 0
  for (const e of sinLlamadas) if ((await (await fetch(`http://localhost:${PUERTO}/api/admin/voz/ficha?externo=${encodeURIComponent(e)}`)).json()) !== null) guardadas++
  r.historial.sinLlamadasRecientes = { personas: sinLlamadas.length, conFichaGuardada: guardadas, ms: [] }
  // Como lo nombra la lista: «Tú (creador)», su correo, su nombre o su id.
  const nombre = (e) => (e === 'creador' ? 'Tú (creador)' : (real.cuentas[e]?.email ?? real.llaves.flatMap((l) => l.usuarios.datos.users ?? []).find((u) => u.external_id === e)?.name ?? e))
  for (const e of sinLlamadas.slice(-5)) r.historial.sinLlamadasRecientes.ms.push(await historialDe(nombre(e)))
  // Y de toda la lista: cuántos tienen ya su ficha guardada (el servidor no da el panel sin ellas).
  let todas = 0
  for (const e of todos) if ((await (await fetch(`http://localhost:${PUERTO}/api/admin/voz/ficha?externo=${encodeURIComponent(e)}`)).json()) !== null) todas++
  r.historial.listaConFicha = { personas: todos.length, conFichaGuardada: todas }
}
await p.evaluate(() => document.querySelector('.admin:not([hidden]) .admin-principal').scrollTo(0, 0))
await p.waitForTimeout(200)

// 4. Ver por qué falló la última llamada: con la lista abierta, sin tocar nada, la cifra de errores ya dice el último y
// su porqué. Un clic en ella abre las que fallaron, con su mensaje.
await p.keyboard.press('Escape')
await p.keyboard.press('Escape')
await p.waitForTimeout(200)
const ultimo = await p.evaluate(() => {
  const e = document.querySelector('.admin:not([hidden]) .admin-ultimo')
  const c = e?.getBoundingClientRect()
  const titulo = e?.closest('.admin-cifra')?.querySelector('.admin-cifra-titulo')
  return e && c.bottom <= innerHeight && c.width > 0 ? { texto: `${titulo.textContent.trim()} · ${e.textContent.trim()}`, mensaje: e.textContent.trim(), cabeEntero: e.scrollHeight <= e.clientHeight + 1 && titulo.scrollWidth <= titulo.clientWidth } : null
})
// Y que sea de verdad la llamada fallida más reciente, con su mensaje (con el panel inventado se sabe cuál es).
if (ultimo && !REAL) {
  const f = registro.filter((x) => x.status >= 400).sort((a, b) => b.cuando.localeCompare(a.cuando))[0]
  ultimo.esLaMasReciente = !!f.error && ultimo.mensaje.includes(f.error)
}
r.verError = { entradas: ultimo ? { clics: 0, teclas: 0 } : { clics: 1, teclas: 0 }, klmS: KLM(ultimo ? {} : { clics: 1 }), sinTocarNada: ultimo }
const caja = await p.locator('.admin:not([hidden]) .admin-cifra-boton').boundingBox()
await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2)
await p.waitForSelector('.admin-errores')
r.verError.alAbrirlos = await p.evaluate(() => document.querySelector('.admin-errores li')?.textContent.trim())
await captura('errores')

if (DE_VERDAD) {
  // De la lista, la cuenta del creador; Enter, 1, Enter; el cobro lo trae; «Deshacer» del aviso; el cobro vuelve a lo de antes.
  const enElCobro = async () => (await (await fetch(`http://localhost:${PUERTO}/api/admin/voz/usuario?externo=creador`)).json()).usuario.datos.credits
  await p.evaluate(() => document.querySelector('.admin:not([hidden]) .admin-principal').scrollTo(0, 0))
  await p.locator('.admin-pestanas button', { hasText: 'Usuarios' }).click()
  await p.focus('.admin-buscar input')
  await p.keyboard.press('Control+A')
  await p.keyboard.type('creador')
  await p.keyboard.press('Enter')
  await p.waitForSelector('.admin-ficha')
  const antes = await enElCobro()
  await p.focus('#admin-cuanto')
  await p.keyboard.type('1')
  await p.keyboard.press('Enter')
  await p.waitForFunction(() => /sumaste 1 crédito/i.test(document.querySelector('.admin-hecho')?.textContent ?? ''))
  const trasSumar = await enElCobro()
  await p.click('.admin-hecho .admin-deshacer')
  await p.waitForFunction(() => /Deshecho/.test(document.querySelector('.admin-hecho')?.textContent ?? ''), null, { timeout: 30_000 })
  const trasDeshacer = await enElCobro()
  const anotados = (await (await fetch(`http://localhost:${PUERTO}/api/admin/voz/cambios?externo=creador`)).json()).cambios.slice(-2)
  r.deshacerDeVerdad = { antes, trasSumar, trasDeshacer, quedoIgual: trasDeshacer === antes && trasSumar === antes + 1, anotados: anotados.map((x) => ({ valor: x.valor, deshecho: !!x.deshecho, deshace: !!x.deshace, saldo: x.saldo })) }
}

r.erroresDeConsola = errores
console.log(JSON.stringify(r, null, 1))
await b.close()
process.exit(0)
