// Lo que mide el eval del Administrador (eval-admin.mjs), en cuatro paneles de administración públicos con demo:
// React-admin (Posters Galore), Refine (finefoods), Filament y PocketBase. Entra solo con la cuenta de demo que cada
// página enseña, hace las diez tareas y saca un JSON. No guarda nada en las demos: donde una tarea pide guardar, cuenta
// las entradas hasta el botón de guardar y no lo pulsa. La excepción es deshacer en React-admin, cuyos datos viven en
// la pestaña (no sale nada a la red) y cuyo guardar espera a que pase el aviso con «Undo».
// Uso: node scripts/eval-admin-ajenas.mjs reactadmin|refine|filament|pocketbase
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { abrirConRatonDoc, clicHasta, coloresEnRgb, enIngles, KLM, leerCuando, pintado, prepararCuando } from './eval-admin-comun.mjs'
import { abrirConRaton, legibilidad, NAVEGADOR, VENTANA } from './eval-voz-comun.mjs'

const [cual] = process.argv.slice(2)
const r = { app: cual, medido: new Date().toISOString() }
// Si una demo se traba, a los 8 minutos sale con lo que alcanzó a medir.
setTimeout(() => (console.log(JSON.stringify({ ...r, cortado: 'se pasó de 8 minutos' }, null, 1)), process.exit(2)), 480_000)
const paso = (que) => console.error(`[${cual}] ${que}`)
const captura = (que) => p.screenshot({ path: fileURLToPath(new URL(`../data/navegador-capturas/admin-ajena-${cual}-${que}.png`, import.meta.url)) }).catch(() => {})
const esperar = (ms) => p.waitForTimeout(ms)

/** Lo de cada panel: cómo se entra, dónde está su lista de personas y con qué se busca, se edita y se abre. */
const APPS = {
  reactadmin: {
    base: 'https://marmelab.com/react-admin-demo/',
    async entrar() {
      await p.goto(this.base, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.locator('input[name=username], a[href="#/customers"]').first().waitFor({ timeout: 30_000 })
      if (await p.locator('input[name=username]').count()) {
        // Su pista dice «demo / demo».
        await p.fill('input[name=username]', 'demo')
        await p.fill('input[name=password]', 'demo')
        await p.click('button[type=submit]')
      }
      await p.locator('a[href="#/customers"]').first().waitFor({ timeout: 30_000 })
    },
    // Sus datos se generan en la pestaña al cargarla: recargar cambiaría a la gente. Todo va por la dirección (#).
    irDashboard: () => p.evaluate(() => (location.hash = '#/')),
    async irLista() {
      await p.evaluate(() => (location.hash = '#/customers?filter=%7B%7D&page=1'))
      await p.locator('tr.RaDataTable-row').first().waitFor({ timeout: 30_000 })
    },
    menu: 'a[href="#/customers"]',
    menuDashboard: 'a[href="#/"]',
    listo: 'tbody tr.RaDataTable-row .MuiAvatar-root',
    fila: 'tbody tr.RaDataTable-row',
    principal: '#main-content',
    buscador: 'input[name=q]',
    abreFila: 'a[href^="#/customers/"]',
    async elegir() {
      // La segunda página, y en ella alguien con pedidos (así su historial tiene algo).
      await p.evaluate(() => (location.hash = '#/customers?filter=%7B%7D&page=2'))
      await esperar(2500)
      const filas = await p.locator('tr.RaDataTable-row').evaluateAll((fs) =>
        fs.map((f) => ({ nombre: f.querySelector('a[href^="#/customers/"]')?.innerText.trim(), href: f.querySelector('a[href^="#/customers/"]')?.getAttribute('href'), pedidos: +(f.querySelector('.column-nb_orders')?.innerText || 0) }))
      )
      const quien = filas.slice(4).find((f) => f.pedidos > 0) ?? filas[4]
      await p.evaluate((h) => (location.hash = h), quien.href)
      await p.locator('input[name=email]').waitFor({ timeout: 20_000 })
      await esperar(800)
      const correo = await p.inputValue('input[name=email]')
      return { nombre: quien.nombre, correo, clave: quien.nombre, escribe: correo, pagina: 2 }
    },
    campo: { sel: 'input[name=zipcode]', nombre: 'Zipcode (código postal; no tiene campo numérico ni de saldo)' },
    guardar: 'button[aria-label="Save"]',
    // Su ficha trae al lado «History»: primera y última visita, y sus pedidos y reseñas.
    historial: () =>
      p.evaluate(() => {
        const t = [...document.querySelectorAll('main *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'History')
        let caja = t
        while (caja && caja.innerText.length < 60) caja = caja.parentElement
        return !!caja && { entradas: 0, texto: caja.innerText.replace(/\s+/g, ' ').slice(0, 200) }
      }),
  },
  refine: {
    base: 'https://example.admin.refine.dev/',
    async entrar() {
      await p.goto(this.base, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.locator('a[href="/customers"], button[type=submit]').first().waitFor({ timeout: 30_000 })
      // Su login viene lleno; a veces entra directo.
      if (!(await p.locator('a[href="/customers"]').count())) await p.click('button[type=submit]')
      await p.locator('a[href="/customers"]').first().waitFor({ timeout: 30_000 })
    },
    async irDashboard() {
      await p.goto(this.base, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.locator('a[href="/customers"]').first().waitFor({ timeout: 30_000 })
    },
    async irLista() {
      await p.goto(this.base + 'customers', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.locator('tr.ant-table-row').first().waitFor({ timeout: 30_000 })
    },
    menu: 'aside a[href="/customers"]',
    menuDashboard: 'aside a[href="/"]',
    // Su dashboard también tiene filas de tabla (los pedidos recientes): las de clientes son las que llevan el ojo.
    listo: 'tr.ant-table-row .anticon-eye',
    fila: 'tr.ant-table-row',
    principal: '.ant-layout-content, main',
    // No hay buscador de personas: el de arriba busca pedidos, tiendas y repartidores. Se filtra por nombre desde el
    // embudo de su columna, que no se alcanza con Tab (tabindex -1), y se aplica con «Filter» (Enter no filtra).
    abrirBuscador: ['thead th:has-text("Name") .ant-table-filter-trigger', '.ant-table-filter-dropdown input:visible'],
    buscador: '.ant-table-filter-dropdown input:visible',
    aplicar: '.ant-table-filter-dropdown button:visible:has-text("Filter")',
    abreFila: 'button',
    async elegir() {
      // Sus clientes no tienen correo (ni en la lista, ni en la ficha, ni en su API): se busca por el nombre.
      const gente = await p.evaluate(() => fetch('https://api.finefoods.refine.dev/users?_start=10&_end=20&_sort=id&_order=desc').then((x) => x.json()))
      const quien = gente[3]
      return { nombre: quien.fullName, correo: quien.email ?? null, clave: quien.fullName, escribe: quien.fullName, pagina: 2, nota: 'sin correo: se escribe su nombre' }
    },
    campo: null,
    historial: async () => {
      // Su ficha es un panel con el ojo de la fila: datos y la tabla de sus pedidos.
      const panel = p.locator('.ant-drawer-content').last()
      return (await panel.locator('th:has-text("Order")').count()) > 0 && { texto: (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 160) }
    },
  },
  filament: {
    base: 'https://demo.filamentphp.com/',
    async entrar() {
      await p.goto(this.base + 'login', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      // Su login viene lleno.
      if (p.url().includes('login')) await p.click('button[type=submit]')
      await p.locator('a[href="https://demo.filamentphp.com/shop/customers"]').first().waitFor({ timeout: 30_000 })
    },
    async irDashboard() {
      await p.goto(this.base + 'shop', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.locator('a[href="https://demo.filamentphp.com/shop/customers"]').first().waitFor({ timeout: 30_000 })
    },
    async irLista() {
      await p.goto(this.base + 'shop/customers', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.locator(this.fila).first().waitFor({ timeout: 30_000 })
    },
    menu: 'a.fi-sidebar-item-btn[href="https://demo.filamentphp.com/shop/customers"]',
    menuDashboard: 'a.fi-sidebar-item-btn[href="https://demo.filamentphp.com/shop"]',
    // Su menú navega con `wire:navigate`, que cambia el <body> entero.
    abrirConRaton: abrirConRatonDoc,
    listo: 'tr.fi-ta-row a[href^="https://demo.filamentphp.com/shop/customers/"][href$="/edit"]',
    fila: 'tr.fi-ta-row.fi-clickable',
    principal: '.fi-main, main',
    buscador: '[data-eval-buscador]',
    // Su buscador de la tabla solo mira el nombre (con «gauf» no da nada; con «Alan» sí): los correos se buscan en el
    // de la columna «Email address», bajo su cabecera.
    marcarBuscador: () => p.evaluate(() => [...document.querySelectorAll('input[type=search]')].find((i) => i.getAttribute('wire:model.live.debounce.500ms') === 'tableColumnSearches.email')?.setAttribute('data-eval-buscador', '')),
    notaBuscador: 'su buscador general solo busca nombres: el correo va en el buscador de la columna «Email address»',
    abreFila: 'a[href$="/edit"]',
    async elegir() {
      await p.goto(this.base + 'shop/customers?page=2', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.waitForFunction(() => document.querySelector('.fi-pagination-overview')?.textContent.includes('11 to'), null, { timeout: 20_000 })
      await esperar(800)
      const f = p.locator(this.fila).nth(4)
      const celdas = await f.locator('td').allInnerTexts()
      const correo = celdas.map((c) => c.trim()).find((c) => c.includes('@'))
      const nombre = celdas.map((c) => c.trim()).find((c) => c && !c.includes('@'))
      return { nombre, correo, clave: correo, escribe: correo, pagina: 2 }
    },
    campo: { sel: '[id="form.phone"]', nombre: 'Phone (no tiene campo numérico ni de saldo)' },
    guardar: 'button:has-text("Save changes")',
    historial: async () => {
      // Su ficha trae dos pestañas abajo: Addresses y Payments (sus pagos).
      const pestaña = p.locator('[role=tab]:has-text("Payments"), button:has-text("Payments")').first()
      if (!(await pestaña.count())) return false
      await pestaña.scrollIntoViewIfNeeded()
      await pestaña.click()
      await esperar(2500)
      return { entradas: 1, texto: (await p.locator('.fi-ta').last().innerText()).replace(/\s+/g, ' ').slice(0, 160) }
    },
  },
  pocketbase: {
    base: 'https://pocketbase.io/_/',
    async entrar() {
      await p.goto(this.base, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await p.locator('button:has-text("Login"), a[href="#/logs"]').first().waitFor({ timeout: 30_000 })
      // Su aviso de arriba da la cuenta: test@example.com (123456), y el formulario viene lleno.
      if (await p.locator('button:has-text("Login")').count()) await p.click('button:has-text("Login")')
      await p.locator('a[href="#/logs"]').first().waitFor({ timeout: 30_000 })
    },
    // No tiene dashboard: la otra página suya es «Settings».
    irDashboard: async () => {
      await p.evaluate(() => (location.hash = '#/settings'))
      await esperar(1500)
    },
    async irLista() {
      // Sin filtro (el filtro va en la dirección). Si se queda cargando, se recarga la página.
      await p.evaluate(() => (location.hash = '#/collections?collection=users'))
      await p.locator(this.fila).first().waitFor({ timeout: 10_000 }).catch(async () => {
        await p.reload({ waitUntil: 'domcontentloaded' })
        await p.locator(this.fila).first().waitFor({ timeout: 30_000 })
      })
      await esperar(1500)
    },
    menu: 'a[href="#/collections"]',
    menuDashboard: 'a[href="#/settings"]',
    listo: 'table tbody tr.handle td[data-name="email"]',
    fila: 'table tbody tr.handle',
    // La lista sin la barra de colecciones de la izquierda.
    principal: '.page-content, main',
    buscador: '.searchbar .code-editor-content',
    abreFila: 'tr.handle',
    async elegir() {
      await this.irLista()
      // Solo hay tres: la de más abajo.
      const correo = (await p.locator(`${this.fila} td[data-name="email"]`).last().innerText()).trim()
      return { nombre: correo, correo, clave: correo, escribe: correo, pagina: 1, nota: 'la colección users tiene 3 registros: la de abajo' }
    },
    campo: { sel: '[data-eval-campo]', nombre: 'name (no tiene campo numérico ni de saldo)' },
    // Su campo «name» es un textarea sin nombre fijo (text_<azar>): se reconoce por su etiqueta.
    marcarCampo: () => p.evaluate(() => [...document.querySelectorAll('textarea, input')].find((i) => i.getBoundingClientRect().width && i.closest('.field')?.querySelector('label')?.innerText.trim() === 'name')?.setAttribute('data-eval-campo', '')),
    guardar: 'button:visible:has-text("Save changes")',
    historial: null,
  },
}
const A = APPS[cual]
if (!A) throw new Error('Uso: node scripts/eval-admin-ajenas.mjs reactadmin|refine|filament|pocketbase')

const navegador = await chromium.launch(NAVEGADOR)
const ctx = await navegador.newContext({ viewport: VENTANA, locale: 'es-MX' })
const p = await ctx.newPage()
// Al salir de una ficha sin guardar, algunas preguntan si se descartan los cambios: se descartan.
p.on('dialog', (d) => d.accept().catch(() => {}))
const abrirClic = A.abrirConRaton ?? abrirConRaton
const quieta = () => p.evaluate(() => document.activeElement?.blur())
const primeraFila = () => p.evaluate((fila) => [...document.querySelectorAll(fila)].find((f) => f.getBoundingClientRect().height)?.innerText.replace(/\s+/g, ' ').trim() ?? '', A.fila)
const esPrimera = async (clave) => (await primeraFila()).toLowerCase().includes(clave.toLowerCase())
/** ¿Se aplicó la búsqueda de `texto`? Lo dice su dirección (React-admin, Refine, PocketBase) o la petición que la lleva (Filament). */
const pedidas = []
p.on('request', (q) => ['fetch', 'xhr'].includes(q.resourceType()) && pedidas.push({ t: Date.now(), url: decodeURIComponent(q.url()), cuerpo: q.postData() ?? '' }))
const aplicada = (texto, desde) => decodeURIComponent(p.url()).toLowerCase().includes(texto.toLowerCase()) || pedidas.some((q) => q.t >= desde && (q.url + q.cuerpo).toLowerCase().includes(texto.toLowerCase()))
const esperarAplicada = async (texto, desde, ms = 4000) => {
  for (const hasta = Date.now() + ms; Date.now() < hasta; await esperar(100)) if (aplicada(texto, desde)) return true
  return false
}

try {
  paso('entra')
  await A.entrar()

  // 1. Abrir la lista: con su dashboard recién cargado y quieto 3 s, y luego 5 veces volviendo a él.
  paso('1. abrir la lista')
  await A.irDashboard()
  if (cual === 'reactadmin' || cual === 'pocketbase') await p.reload({ waitUntil: 'domcontentloaded' }), await p.locator(A.menu).first().waitFor({ timeout: 30_000 })
  await esperar(3000)
  const yaEstaba = await p.locator(A.listo).count()
  r.abrir = { primeraMs: await abrirClic(p, A.menu, A.listo), siguientesMs: [], menu: A.menu, listo: A.listo, listoYaEnElDashboard: yaEstaba > 0 }
  for (let i = 0; i < 5; i++) {
    await esperar(1500)
    await p.locator(A.menuDashboard).first().click()
    await esperar(3000)
    r.abrir.siguientesMs.push(await abrirClic(p, A.menu, A.listo))
  }
  await esperar(1500)
  await captura('lista')

  // 7, 8 y 9 con la lista recién abierta, sin buscar.
  paso('7. legibilidad, 8. idioma, 9. filas')
  await A.irLista()
  await esperar(1500)
  await quieta()
  const principal = await p.evaluate((sels) => sels.split(',').map((s) => s.trim()).find((s) => document.querySelector(s)), A.principal)
  const pasadosARgb = await coloresEnRgb(p)
  r.legibilidad = { selector: principal ?? 'body', coloresPasadosARgb: pasadosARgb, ...(await legibilidad(p, principal)) }
  r.idioma = { selector: 'body (toda la vista de la lista: menú, cabeceras, botones, filtros; lista INGLES_UI)', ...(await enIngles(p, null)) }
  // ¿Tiene otro idioma? Su selector, si lo hay, es un botón que dice «English».
  const selectorIdioma = p.locator('button:visible, [role=button]:visible, .ant-dropdown-trigger:visible').filter({ hasText: /^\s*english\s*$/i }).first()
  if (await selectorIdioma.count()) {
    // Lo que aparece al abrirlo (el menú lateral también usa role=menuitem: se quita lo que ya estaba).
    const opcionesSel = '[role=menuitem]:visible, [role=option]:visible, .ant-dropdown-menu-item:visible, [role=menu] li:visible'
    const antes = new Set(await p.locator(opcionesSel).allInnerTexts())
    await selectorIdioma.click()
    await esperar(800)
    const opciones = (await p.locator(opcionesSel).allInnerTexts()).filter((o) => !antes.has(o))
    await p.keyboard.press('Escape')
    r.idioma.idiomas = [...new Set(opciones.map((o) => o.trim()).filter(Boolean))]
  } else r.idioma.idiomas = null
  r.idioma.espanol = !!r.idioma.idiomas?.some((o) => /español|spanish|castellano/i.test(o))
  r.filas = await p.evaluate((fila) => {
    const fs = [...document.querySelectorAll(fila)].map((f) => f.getBoundingClientRect()).filter((b) => b.height)
    const enteras = fs.filter((b) => b.top >= 0 && b.bottom <= innerHeight)
    const altos = fs.map((b) => Math.round(b.height * 10) / 10).sort((a, b) => a - b)
    return { aLaVista: enteras.length, altoPx: { min: altos[0], max: altos.at(-1), mediana: altos[altos.length >> 1] }, enLaPagina: fs.length }
  }, A.fila)

  // A quién se busca: alguien de la segunda página (o el último de la lista).
  paso('elige a quién buscar')
  const quien = await A.elegir()
  r.persona = quien
  const letras4 = quien.escribe.slice(0, 4)

  // 2. Encontrarla escribiendo las 4 primeras letras de su correo, con la lista abierta y nada enfocado.
  paso('2. encontrar')
  await A.irLista()
  await A.marcarBuscador?.()
  const enc = { teclas: 0, clics: 0, notas: [] }
  // ¿Escribir sin hacer clic llega a algún buscador?
  await quieta()
  await p.keyboard.type(letras4, { delay: 150 })
  await esperar(2000)
  enc.escribirSinClicLlega = await p.evaluate((l) => [...document.querySelectorAll('input, [contenteditable]')].some((i) => (i.value ?? i.textContent ?? '').toLowerCase().includes(l.toLowerCase())), letras4)
  await A.irLista()
  await A.marcarBuscador?.()
  await quieta()
  await esperar(1000)
  if (!enc.escribirSinClicLlega) {
    for (const sel of A.abrirBuscador ?? [A.buscador]) {
      await p.locator(sel).first().click()
      enc.clics++
      await esperar(600)
    }
    enc.notas.push(A.abrirBuscador ? `hay que abrir el filtro y hacer clic en su campo (${A.abrirBuscador.length} clics)` : 'hay que hacer clic en el buscador')
  }
  const sinFiltro = await primeraFila()
  /** Escribe `texto` y lo aplica (Enter o su botón, si hace falta); mide la última entrada. */
  const buscar = async (texto, nuevo) => {
    await p.keyboard.type(nuevo.slice(0, -1), { delay: 150 })
    enc.teclas += nuevo.length - 1
    const medir = async (accion) => {
      await prepararCuando(p, A.fila, quien.clave)
      const desde = Date.now()
      const msCambio = await pintado(p, accion, A.fila)
      const filtrada = await leerCuando(p, 6000)
      return { desde, msPrimerCambio: msCambio, msHastaQueEsPrimera: filtrada.ms, yaEraPrimera: filtrada.yaAntes }
    }
    let m = await medir(() => p.keyboard.press(nuevo.at(-1)))
    enc.teclas++
    if (!(await esperarAplicada(texto, m.desde))) {
      m = await medir(() => p.keyboard.press('Enter'))
      enc.teclas++
      enc.enter = true
      if (!(await esperarAplicada(texto, m.desde)) && A.aplicar) {
        m = await medir(() => p.locator(A.aplicar).first().click())
        enc.clics++
        enc.botonAplicar = true
        // Enter no hizo nada: no cuenta como entrada.
        enc.teclas--
        enc.enter = false
        enc.enterNoFiltra = true
        await esperarAplicada(texto, m.desde)
      }
    }
    await esperar(1500)
    return m
  }
  let escrito = letras4
  let m = await buscar(escrito, escrito)
  enc.filtraAlEscribir = !enc.enter && !enc.botonAplicar
  enc.primeraCon4 = await esPrimera(quien.clave)
  enc.medida4 = m
  // Si con 4 letras no queda primera, se siguen escribiendo letras de su correo (o nombre) hasta que lo esté.
  while (!(await esPrimera(quien.clave)) && escrito.length < quien.escribe.length && escrito.length < 16) {
    const sig = quien.escribe[escrito.length]
    escrito += sig
    const sigueEnElBuscador = await p.evaluate((sel) => !!document.activeElement?.closest(sel), A.buscador)
    if (!sigueEnElBuscador) {
      // Su filtro se cierra al aplicar (Refine): volver a abrirlo y seguir escribiendo al final de su campo.
      for (const sel of A.abrirBuscador ?? [A.buscador]) await p.locator(sel).first().click(), enc.clics++, await esperar(600)
      await p.keyboard.press('End')
      enc.teclas++
    }
    m = await buscar(escrito, sig)
  }
  if (enc.enter && !enc.botonAplicar) enc.notas.push('solo Enter filtra')
  if (enc.botonAplicar) enc.notas.push('ni escribir ni Enter filtran: hay que pulsar «Filter»')
  if (enc.filtraAlEscribir) enc.notas.push('filtra al escribir, sin Enter')
  if (A.notaBuscador) enc.notas.push(A.notaBuscador)
  // Lo que pide de verdad, sabiendo cuántas letras hacen falta: abrir el buscador, escribirlas y aplicar una vez. Las
  // entradas hechas para descubrirlo (letra a letra) quedan en `entradasHechas`.
  const minimo = {
    clics: (enc.escribirSinClicLlega ? 0 : (A.abrirBuscador?.length ?? 1)) + (enc.botonAplicar ? 1 : 0),
    teclas: escrito.length + (enc.enter ? 1 : 0),
  }
  Object.assign(enc, { escrito, letras: escrito.length, primera: await esPrimera(quien.clave), primeraFila: await primeraFila(), sinFiltro: sinFiltro.slice(0, 60), ultima: m, entradasHechas: { teclas: enc.teclas, clics: enc.clics }, teclas: minimo.teclas, clics: minimo.clics, segundosKLM: KLM(minimo) })
  r.encontrar = enc
  await captura('encontrar')

  // 3. Cambiar un valor y llegar hasta su botón de guardar (sin pulsarlo), desde su fila en la lista ya filtrada.
  // 5. Su historial. 10. Deshacer.
  paso('3. cambiar, 5. historial')
  const fila = p.locator(A.fila).filter({ hasText: quien.clave }).first()
  if (cual === 'refine') {
    // Su fila no abre nada al pulsarla: la ficha sale con el ojo, y no tiene editar.
    // Con un clic de persona: los ms hasta ver la tabla de sus pedidos con alguno (o su «sin datos»).
    const msHistorial = await clicHasta(p, fila.locator('button').last(), () =>
      [...document.querySelectorAll('.ant-drawer-content th')].some((t) => /Order/.test(t.textContent)) && !!document.querySelector('.ant-drawer-content tbody tr td')
    )
    await esperar(3000)
    const h = await A.historial()
    r.historial = h ? { clics: 1, segundosKLM: KLM({ clics: 1 }), msHastaVerlo: msHistorial, nota: 'el ojo de su fila abre su ficha con sus datos y sus pedidos', ...h } : null
    const editar = await p.locator('.ant-drawer-content button, .ant-drawer-content a').filter({ hasText: /edit/i }).count()
    r.cambiar = editar ? { nota: 'tiene editar: revisar' } : null
    r.cambiarNota = editar ? undefined : 'no lo tiene: la ficha de un cliente solo se ve (sin botón de editar), y su API no lleva saldo ni correo'
    await captura('ficha')
  } else {
    const c = { teclas: 0, clics: 0 }
    // En React-admin, con un clic de persona: los ms hasta ver su panel «History» ya con su contenido.
    const msHistorial =
      cual === 'reactadmin'
        ? await clicHasta(p, fila.locator('td').nth(1), () => {
            const t = [...document.querySelectorAll('main *')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'History')
            let caja = t
            while (caja && caja.innerText.length < 60) caja = caja.parentElement
            return !!caja
          })
        : (await (cual === 'pocketbase' ? fila.locator('td[data-name="email"]') : fila.locator('td').nth(1)).click(), null)
    c.clics++
    await esperar(3500)
    await A.marcarCampo?.()
    await captura('ficha')
    // 5: lo que se ve al abrir su ficha.
    const h = A.historial ? await A.historial() : null
    if (cual === 'pocketbase') {
      const texto = await p.locator('.overlay-panel').last().innerText().catch(() => '')
      r.historial = null
      r.historialNota = `no lo tiene: su ficha solo trae sus campos (${/messages|posts/i.test(texto) ? 'sí nombra otras colecciones: revisar' : 'ni nombra sus mensajes o posts'}); sus peticiones están en Logs, pero no por persona`
    } else r.historial = h ? { clics: 1 + (h.entradas ?? 0), segundosKLM: KLM({ clics: 1 + (h.entradas ?? 0) }), ...(msHistorial !== null ? { msHastaVerlo: msHistorial } : {}), texto: h.texto } : null
    if (cual === 'filament' && h) {
      // Volver a los datos de su ficha (la pestaña de pagos está bajo el formulario, no lo tapa).
      await p.evaluate(() => scrollTo(0, 0))
      await esperar(500)
    }
    const campo = p.locator(A.campo.sel).first()
    await campo.scrollIntoViewIfNeeded()
    const antes = await campo.inputValue()
    const cajaCampo = await campo.boundingBox()
    await campo.click()
    c.clics++
    if (antes) {
      await p.keyboard.press('Control+A')
      c.teclas += 2 // Ctrl y A: borrar lo que había
    }
    await p.keyboard.type('5000', { delay: 120 })
    c.teclas += 4
    await esperar(800)
    const boton = p.locator(A.guardar).first()
    const cajaBoton = await boton.boundingBox()
    c.clics++ // el botón de guardar (no se pulsa)
    Object.assign(c, {
      campo: A.campo.nombre,
      habia: antes,
      quedo: await campo.inputValue(),
      guardarHabilitado: await boton.isEnabled(),
      // Si el campo o el botón no caben en la pantalla, hay que desplazarse (KLM no lo cuenta).
      campoALaVista: cajaCampo.y >= 0 && cajaCampo.y + cajaCampo.height <= VENTANA.height,
      guardarALaVista: !!cajaBoton && cajaBoton.y >= 0 && cajaBoton.y + cajaBoton.height <= VENTANA.height,
    })
    c.segundosKLM = KLM(c)
    r.cambiar = c
    await captura('cambiar')

    // 10. Deshacer: solo React-admin lo tiene, y su guardar no se manda hasta que se va su aviso.
    if (cual === 'reactadmin') {
      paso('10. deshacer')
      // Sus escrituras van a demo.api.marmelab.com, un dominio que no existe: las contesta un service worker (MSW) dentro
      // de la pestaña, con los datos que generó al cargar. Se anota cada una y si la contestó el service worker.
      const escrituras = []
      const anota = (x) => !['GET', 'HEAD', 'OPTIONS'].includes(x.request().method()) && escrituras.push({ t: Date.now(), que: `${x.request().method()} ${x.url()}`, delServiceWorker: x.fromServiceWorker() })
      p.on('response', anota)
      const url = p.url()
      // Primero: guardar y pulsar «Undo»; al volver a abrir su ficha, el campo sigue como estaba.
      await boton.click()
      const undo = p.locator('button:has-text("Undo")').first()
      await undo.waitFor({ timeout: 5000 })
      await esperar(500)
      await undo.click()
      await esperar(1500)
      await p.evaluate(() => (location.hash = '#/customers'))
      await esperar(1500)
      await p.evaluate((u) => (location.hash = new URL(u).hash), url)
      await p.locator(A.campo.sel).waitFor()
      await esperar(1000)
      const trasUndo = await p.inputValue(A.campo.sel)
      const escriturasTrasUndo = escrituras.length
      // Luego: cuánto dura el aviso con «Undo» si no se pulsa (el cambio queda solo en la memoria de esta pestaña,
      // que se cierra al terminar).
      await p.locator(A.campo.sel).click()
      if (trasUndo) await p.keyboard.press('Control+A')
      await p.keyboard.type('5000')
      await p.locator(A.guardar).click()
      const t0 = Date.now()
      await undo.waitFor({ timeout: 5000 })
      await undo.waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {})
      const dura = (Date.now() - t0) / 1000
      await esperar(1500)
      p.off('response', anota)
      r.deshacer = {
        segundos: +dura.toFixed(1),
        campoAntes: antes,
        campoTrasUndo: trasUndo,
        quedoIgual: trasUndo === antes,
        escriturasAlPulsarUndo: escriturasTrasUndo,
        escrituraSinUndo: escrituras.slice(escriturasTrasUndo).map((e) => ({ ...e, t: undefined, segundosTrasGuardar: +((e.t - t0) / 1000).toFixed(1) })),
        nota: 'aviso con «Undo» tras guardar; el cambio no se manda hasta que se va',
      }
    } else {
      // Sin pulsar guardar: ¿hay algo de «deshacer» en su ficha o en su lista?
      const hay = await p.locator('button:visible, a:visible').filter({ hasText: /^\s*(undo|deshacer)\s*$/i }).count()
      r.deshacer = { segundos: 0, hayBotonUndo: hay > 0, nota: 'no ofrece deshacer: guardar y borrar van directo al servidor (con confirmación al borrar); no se guardó nada para comprobarlo en la demo pública' }
      // Salir sin guardar: se recarga (si pregunta por los cambios, se descartan).
      await p.reload({ waitUntil: 'domcontentloaded' })
      await esperar(2000)
    }
  }
  if (cual === 'refine') r.deshacer = { segundos: 0, nota: 'no hay nada que cambiar en la ficha de un cliente; no se guardó nada' }

  // 4. Por qué falló la última petición: desde la lista de personas hasta leer el mensaje del error más reciente.
  paso('4. el último error')
  await A.irLista()
  const enMenu = await p.locator('a:visible').evaluateAll((as) => as.map((a) => a.innerText.trim()).filter((t) => /\b(logs?|activity|audit|errors?|registro)\b/i.test(t)))
  if (cual === 'pocketbase') {
    const e = { teclas: 0, clics: 0 }
    await p.locator('a[href="#/logs"]').click()
    e.clics++
    await p.locator('table tbody tr').first().waitFor({ timeout: 20_000 })
    await esperar(2000)
    // ¿Se ve ya, sin filtrar, el error más reciente con su mensaje?
    const visto = () => p.evaluate(() => {
      const f = [...document.querySelectorAll('table tbody tr')].find((x) => /ERROR/.test(x.innerText))
      if (!f) return null
      const b = f.getBoundingClientRect()
      return { aLaVista: b.top >= 0 && b.bottom <= innerHeight, texto: f.innerText.replace(/\s+/g, ' ').slice(0, 200) }
    })
    let v = await visto()
    e.sinFiltrar = v
    if (!v?.aLaVista) {
      await p.locator('.searchbar .code-editor-content').click()
      e.clics++
      await p.keyboard.type('level>0', { delay: 120 })
      e.teclas += 7
      await p.keyboard.press('Enter')
      e.teclas++
      await esperar(3000)
      v = await visto()
      e.filtrado = true
    }
    e.mensaje = (/error: .+?(?= details:| \d{4}-\d\d-\d\d |\s*$)/.exec(v?.texto ?? '') ?? [v?.texto])[0]
    e.segundosKLM = KLM(e)
    e.nota = e.filtrado ? 'Logs y filtrar por nivel (level>0): el mensaje sale en la fila' : 'Logs: el error más reciente ya se ve en la primera pantalla, con su mensaje en la fila'
    r.ultimoError = e
    await captura('logs')
  } else {
    r.ultimoError = null
    r.ultimoErrorNota = `no lo tiene: ningún registro de peticiones ni de errores (en su menú: ${enMenu.length ? enMenu.join(', ') : 'nada de logs, actividad ni errores'})`
  }

  // 6. Solo con el teclado: desde la lista abierta hasta el campo de la tarea 3 de esa persona.
  paso('6. teclado')
  if (!A.campo) {
    r.teclado = null
    r.tecladoNota = 'no hay campo que cambiar (tarea 3); además el embudo de filtrar no se alcanza con Tab'
  } else {
    await A.irLista()
    await A.marcarBuscador?.()
    await quieta()
    await esperar(1000)
    const t = { teclas: 0, tramos: {} }
    const tabHasta = async (que, cond, arg, max = 200) => {
      for (let n = 0; n <= max; n++) {
        if (await p.evaluate(cond, arg)) return (t.tramos[que] = n), true
        await p.keyboard.press('Tab')
        t.teclas++
        await esperar(40)
      }
      return false
    }
    const enBuscador = (sel) => { const a = document.activeElement; return !!a && (a.matches(sel) || !!a.closest(sel)) }
    const enSuFila = ([fila, abre, clave]) => { const a = document.activeElement; const f = a?.closest(fila) ?? (a?.matches(fila) ? a : null); return !!f && f.innerText.toLowerCase().includes(clave.toLowerCase()) && a.matches(abre) }
    const enCampo = (sel) => document.activeElement?.matches(sel)
    if (!(await tabHasta('hastaElBuscador', enBuscador, A.buscador))) r.teclado = null, r.tecladoNota = 'el buscador no se alcanza con Tab'
    else {
      await p.keyboard.type(escrito, { delay: 150 })
      t.teclas += escrito.length
      if (enc.enter) await p.keyboard.press('Enter'), t.teclas++
      await esperar(3000)
      if (!(await tabHasta('hastaSuFila', enSuFila, [A.fila, A.abreFila, quien.clave]))) r.teclado = null, r.tecladoNota = 'su fila no se alcanza con Tab'
      else {
        await p.keyboard.press('Enter')
        t.teclas++
        await esperar(3500)
        await A.marcarCampo?.()
        if (!(await tabHasta('hastaElCampo', enCampo, A.campo.sel))) r.teclado = null, r.tecladoNota = 'el campo no se alcanza con Tab'
        else r.teclado = { ...t, segundosKLM: KLM(t) }
      }
    }
    await captura('teclado')
  }
} catch (e) {
  r.error = String(e.message).split('\n')[0]
  await captura('error')
}

console.log(JSON.stringify(r, null, 1))
await Promise.race([ctx.close().then(() => navegador.close()), new Promise((ok) => setTimeout(ok, 5000))])
process.exit(0)
