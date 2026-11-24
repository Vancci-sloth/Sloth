import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Browser, Locator, Page, Request } from 'playwright-core'
import { paginaNueva } from '../chromium.ts'
import { creditosDe, FORMATOS_IMAGEN, FORMATOS_VIDEO, gastoDeRechazo, PALABRA_CREDITOS, type Saldo, saldoDe, sinSesion } from '../../shared/flow.ts'

/**
 * Lo que se hace en la página de Google Flow. Se usan los iconos (el nombre de cada `mat-icon`), no los textos: Flow sale
 * en el idioma de la cuenta y los iconos son iguales en todos. Comprobado el 1 de noviembre de 2026 en `flow.google.com`,
 * con el Edge sin ventana: una imagen tarda unos 60 s por el agente de Flow y un video Lite de 8 s, unos 50 s.
 *
 * Con la ventana angosta Flow enseña su compositor directo, que dice qué se genera y cuánto cuesta. Con la ancha enseña
 * un chat con un agente, que decide por su cuenta y no da el costo: por eso `ANCHO`.
 *
 * Un video se hace en uno de dos modos del panel: «Ingredientes» (texto y, si hay, referencias: los personajes) o
 * «Fotogramas» (empieza en una imagen y, si se pide, acaba en otra). Los dos aceptan todos los modelos y cuestan igual
 * (comprobado el 6 de noviembre de 2026: Lite 10, Fast 20, Quality 100, Omni 1.2 Flash 24 en 720p y 8 en 360p, Omni 1.1
 * Flash 12 y 6; Veo sale siempre en 720p y Omni, si no se elige, en 360p). Los huecos de los fotogramas se
 * vacían al recargar el proyecto, y cada pedido lo recarga.
 */

/** Flow no empezó a generar, así que no gastó: el pedido puede ir a otra cuenta. `aviso` es lo que dijo, si dijo algo. */
export class SinEmpezar extends Error {
  constructor(
    mensaje: string,
    readonly aviso: string,
    readonly sesion = false
  ) {
    super(mensaje)
  }
}

/**
 * La conexión con Flow no dio (una subida que no acabó, una página que no cargó, una espera que venció sin que la red
 * callara) y aún no se había pedido nada: no gastó. El pedido puede reintentarse en la misma cuenta, que no tiene la
 * culpa; `index.ts` lo espera y lo reintenta, cada vez más espaciado.
 */
export class SinConexion extends Error {}

/**
 * Flow empezó el pedido y lo rechazó en su tarjeta (por ejemplo, «Notamos actividad inusual»). `aviso` es lo que dice la
 * tarjeta; `gasto`, lo que bajó el saldo de la cuenta (0 si nada), o `null` si no se supo; `saldo`, el de después.
 */
export class Rechazado extends Error {
  constructor(
    mensaje: string,
    readonly aviso: string,
    readonly gasto: number | null = null,
    readonly saldo: Saldo | null = null
  ) {
    super(mensaje)
  }
}

export const URL_FLOW = 'https://flow.google.com/'
const ANCHO = 800
const ALTO = 1000
/**
 * Lo que espera una subida: mientras la página siga mandando algo a Google, hasta `SUBIDA_MAXIMA`; sin mandar nada,
 * `SUBIDA_QUIETA`. Con mala conexión una imagen tarda más de un minuto en entrar, y cortarla a los 60 s la perdía.
 */
const SUBIDA_QUIETA = 90_000
const SUBIDA_MAXIMA = 6 * 60_000
/** Lo que se espera a que avance una descarga: lo generado ya se pagó, y con mala conexión baja despacio. */
const BAJADA_QUIETA = 90_000
const BAJADA_MAXIMA = 15 * 60_000
/**
 * Lo que espera a que salga la tarjeta del pedido; mientras la página siga mandando el pedido, hasta `APARECE_MAXIMO`.
 * Si no sale, antes de darlo por no empezado se comprueba recargando (`comprobarSiEmpezo`): con mala conexión la tarjeta
 * tarda, y darlo por no empezado mandaba el mismo video a otra cuenta, que lo cobraba otra vez.
 */
const APARECE = 45_000
const APARECE_MAXIMO = 3 * 60_000
/** Sin ver el % de la tarjeta este rato, se recarga para ver si sigue; si tras recargar tampoco avanza, la rechazó. */
const SIN_AVANCE = 60_000
const TERMINA = 10 * 60_000
/** Lo que tarda el interruptor en enseñar lo guardado: al abrir el menú dibuja `false` aunque esté encendido. */
const ASIENTA = 3500

export interface PedidoFlow {
  tipo: 'imagen' | 'video'
  prompt: string
  formato: string
  modelo: string
  /** Solo en Omni (`RESOLUCIONES_OMNI`): Veo no deja elegirla. */
  resolucion?: string
  /** Lo más que puede costar: si cuesta más, no se genera. */
  tope: number
  /** Las imágenes de referencia, en rutas absolutas. Quien las pide ya confirmó sus derechos (ver `subir`). */
  referencias?: string[]
  /** Un video que empieza en la primera imagen y, si hay segunda, acaba en ella («Fotogramas»). Sin referencias. */
  cuadros?: string[]
}

export const paginaFlow = (b: Browser): Promise<Page> => paginaNueva(b, { ancho: ANCHO, alto: ALTO })

/** Lo que espera, tras cargar, a que Flow enseñe sus novedades. */
const NOVEDADES = 2500

/**
 * Abre `url` sin el aviso de novedades de Flow encima. Ese aviso («A faster, easier-to-reach Flow Agent», 20 de noviembre
 * de 2026) tapa toda la página, no se cierra con Escape y su botón de cerrar se apaga hasta pasar sus hojas; todo clic
 * fallaba con «locator.click: Timeout». Sale una vez por cuenta: al recargar ya no está (puede haber otro en cola).
 */
export async function ir(page: Page, url: string) {
  for (let i = 0; i < 3; i++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    // Google a veces pasa por su página de cuentas para renovar la sesión, sin pedir nada: se espera a que vuelva.
    if (page.url().startsWith('https://accounts.google.com/')) await page.waitForURL((u) => u.hostname !== 'accounts.google.com', { timeout: 12_000, waitUntil: 'domcontentloaded' }).catch(() => {})
    if (sinSesion(page.url())) throw new SinEmpezar('Flow ya no tiene la sesión de esta cuenta de Google: vuelve a conectarla (la de la voz en Opciones → Voz; las demás, agregándola otra vez en Opciones → Google Flow).', '', true)
    if (!(await page.locator('mat-dialog-container').first().waitFor({ timeout: NOVEDADES }).then(() => true, () => false))) return
  }
}

const icono = (page: Page | Locator, nombre: string) => page.locator(`button:has(mat-icon:text-is("${nombre}"))`)

/** Lo que dice el aviso de Flow, si enseña uno, para explicar por qué no generó. */
async function avisos(page: Page): Promise<string> {
  const texto = await page.evaluate(() => [...document.querySelectorAll('[role=alert], [role=status], mat-snack-bar-container')].map((d) => (d as HTMLElement).innerText.trim()).filter(Boolean).join(' · ')).catch(() => '')
  return texto ? `: ${texto}` : ''
}

/**
 * Enciende o apaga «Ayudar a mejorar Flow» (que Google use lo que generas para mejorar sus productos), en el menú
 * principal. Lee lo guardado con calma, y al acabar recarga y vuelve a leer: si no quedó como se pidió, falla. Es lo
 * primero que abre Flow en el primer pedido de cada cuenta: sin red, falla aquí, antes de pedir nada (`SinConexion`).
 */
export function ponerAportar(page: Page, quiere: boolean) {
  return aportar(page, quiere).catch((e: unknown) => {
    throw esDeRed(e) ? new SinConexion(`La conexión con Flow falló antes de pedirlo (${primeraLinea(e)}). No se gastó nada.`) : e
  })
}

async function aportar(page: Page, quiere: boolean) {
  const leer = async () => {
    await ir(page, URL_FLOW)
    await icono(page, 'more_vert').first().click({ timeout: 20_000 })
    const opcion = page.getByRole('menuitemcheckbox').first()
    await opcion.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(ASIENTA)
    return { opcion, puesto: (await opcion.getAttribute('aria-checked')) === 'true' }
  }
  const { opcion, puesto } = await leer()
  if (puesto === quiere) return page.keyboard.press('Escape')
  await opcion.click({ timeout: 10_000 })
  // Al apagarlo pide confirmar, y sin eso no se guarda. Confirmar es el último botón del diálogo.
  const confirmar = page.locator('[role=dialog] button, [role=alertdialog] button, mat-dialog-container button').last()
  await confirmar.click({ timeout: 4000 }).catch(() => {})
  await page.waitForTimeout(3000)
  if ((await leer()).puesto !== quiere) throw new Error('No pude cambiar «Ayudar a mejorar Flow». No se generó nada.')
  await page.keyboard.press('Escape')
}

/**
 * Lo que le queda a la cuenta, del menú que abre su botón arriba a la derecha («Detalles de la cuenta»), en la página que
 * esté (el inicio o un proyecto). Su renglón lleva el icono `movie_filter_auto`. `null` si no lo dice.
 */
export async function leerSaldo(page: Page): Promise<Saldo | null> {
  await page.locator('.header-user-button').first().click({ timeout: 15_000 })
  const suyo = page.locator('mat-icon:text-is("movie_filter_auto")').first()
  if (!(await suyo.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
    await page.keyboard.press('Escape').catch(() => {})
    return null
  }
  const texto = await suyo.evaluate((d) => {
    let e = d as HTMLElement
    for (let i = 0; i < 4 && e.parentElement && !/\d.*\n.*\d/.test(e.innerText); i++) e = e.parentElement
    return e.innerText
  })
  await page.keyboard.press('Escape').catch(() => {})
  return saldoDe(texto, Date.now())
}

/** El saldo sin generar nada: en el inicio de Flow. */
export async function saldoEnFlow(page: Page): Promise<Saldo | null> {
  await ir(page, URL_FLOW)
  return leerSaldo(page)
}

/** Entra al proyecto de Sloth en Flow; si no hay (o se borró), crea uno. Devuelve su dirección. */
async function entrar(page: Page, proyecto: string | undefined): Promise<string> {
  const caja = page.locator('.base-prompt-box [role=textbox]').first()
  if (proyecto) {
    await ir(page, proyecto)
    if (await caja.waitFor({ timeout: 15_000 }).then(() => true, () => false)) return proyecto
  }
  await ir(page, URL_FLOW)
  await icono(page, 'add').last().click({ timeout: 20_000 }).catch(() => {
    throw new Error('Flow no dejó crear un proyecto. Si es la primera vez, ábrelo una vez con esta cuenta (Opciones → Google Flow → Abrir Flow) y acepta su aviso.')
  })
  await page.waitForURL(/\/project\//, { timeout: 30_000 })
  await caja.waitFor({ timeout: 30_000 })
  // El recorrido de bienvenida del primer proyecto.
  await page.keyboard.press('Escape').catch(() => {})
  return page.url().split('?')[0]
}

/**
 * Mueve la barra de la duración con las flechas hasta que diga `segundos`. Se lee lo que enseña («8 s»), no su valor: la
 * barra va de 0 a 7 y no dice qué duración es cada paso.
 */
async function ponerSegundos(page: Page, segundos: number) {
  const barra = page.getByRole('slider').first()
  const dice = () =>
    barra.evaluate((d) => {
      let e = d as HTMLElement
      while (e.parentElement && !/\d+\s*s\b/.test(e.innerText)) e = e.parentElement
      return Number(e.innerText.match(/(\d+)\s*s\b/)?.[1] ?? NaN)
    })
  await barra.focus({ timeout: 5000 })
  for (let i = 0; i < 12; i++) {
    const ahora = await dice()
    if (ahora === segundos) return
    if (Number.isNaN(ahora)) break
    await page.keyboard.press(ahora < segundos ? 'ArrowRight' : 'ArrowLeft')
    await page.waitForTimeout(150)
  }
  throw new Error(`No pude poner el video en ${segundos} s en Flow. No se generó nada.`)
}

/** Elige en el panel del compositor lo pedido y devuelve lo que cuesta. Cierra el panel. */
async function elegir(page: Page, p: PedidoFlow): Promise<number> {
  await page.locator('.base-prompt-box button:has(mat-icon:text-matches("^crop_"))').first().click({ timeout: 15_000 })
  const radio = (icon: string) => page.locator(`[role=radio]:has(mat-icon:text-is("${icon}"))`)
  await radio(p.tipo === 'video' ? 'videocam' : 'image').click({ timeout: 10_000 })
  // Fotogramas o Ingredientes: sin elegirlo, queda el de la última vez.
  if (p.tipo === 'video') await radio(p.cuadros?.length ? 'crop_free' : 'chrome_extension').click({ timeout: 10_000 })
  await radio((p.tipo === 'video' ? FORMATOS_VIDEO : FORMATOS_IMAGEN)[p.formato]).click({ timeout: 10_000 })
  await page.getByRole('radio', { name: 'x1', exact: true }).click({ timeout: 10_000 })
  await page.locator('button:has(mat-icon:text-is("arrow_drop_down"))').first().click({ timeout: 10_000 })
  await page.getByRole('menuitem').filter({ hasText: p.modelo }).first().click({ timeout: 10_000 })
  // Omni enseña además la resolución (sin elegirla, 360p) y la duración: se eligen siempre, y 8 s como Veo. En 1.1 la
  // duración son botones (4 a 10 s); en 1.2, una barra (3 a 10 s).
  if (p.resolucion) {
    await page.getByRole('radio', { name: p.resolucion, exact: true }).click({ timeout: 10_000 })
    const boton = page.getByRole('radio', { name: /^8\s*s$/ })
    if (await boton.count()) await boton.click({ timeout: 5000 })
    else await ponerSegundos(page, 8)
  }
  // El costo se rehace tras elegir: se lee cuando dos lecturas seguidas coinciden.
  const panel = () =>
    page.locator('[role=radio]').first().evaluate((d, palabra) => {
      let e = d as HTMLElement
      while (e.parentElement && !new RegExp(palabra, 'i').test(e.innerText)) e = e.parentElement
      return e.innerText
    }, PALABRA_CREDITOS.source)
  let costo = creditosDe(await panel())
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500)
    const otro = creditosDe(await panel())
    if (i && otro === costo) break
    costo = otro
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  if (costo === null) throw new Error('Flow no dijo cuánto cuesta. No se generó nada.')
  return costo
}

const fotos = (page: Page) => page.locator('.base-prompt-box .prompt-top-row img')

/**
 * Las peticiones que la página tiene en vuelo y que mandan algo (no `GET`): mientras haya alguna, una subida avanza.
 * `quieta` dice cuánto lleva sin ninguna; así se distingue una conexión lenta (sigue mandando) de una caída (ya no manda).
 */
export function mirarEnvios(page: Page) {
  const enVuelo = new Set<unknown>()
  let ultima = Date.now()
  const empieza = (r: Request) => {
    if (r.method() === 'GET' || !['fetch', 'xhr'].includes(r.resourceType())) return
    enVuelo.add(r)
    ultima = Date.now()
  }
  const acaba = (r: Request) => {
    if (enVuelo.delete(r)) ultima = Date.now()
  }
  page.on('request', empieza)
  page.on('requestfinished', acaba)
  page.on('requestfailed', acaba)
  return {
    quieta: () => (enVuelo.size ? 0 : Date.now() - ultima),
    soltar: () => {
      page.off('request', empieza)
      page.off('requestfinished', acaba)
      page.off('requestfailed', acaba)
    }
  }
}

/**
 * Sube una imagen en el panel que abre `hueco` (el + de las referencias o un hueco de fotograma) y la elige. Va con un
 * nombre propio, para reconocerla en la lista, y al subir Flow puede pedir aceptar «Derechos para usar esta imagen»: eso
 * lo declaró el usuario en Sloth (`server/flow/index.ts`), y por eso aquí se acepta. `false` si no subió.
 */
async function subir(page: Page, hueco: Locator, ruta: string): Promise<boolean> {
  // Desde antes de poner el archivo: la subida sale al ponerlo, y una petición que ya iba en camino no contaría.
  const envios = mirarEnvios(page)
  const panel = page.locator('.cdk-overlay-pane').filter({ has: page.locator('mat-icon:text-is("upload")') }).last()
  const ext = extname(ruta).toLowerCase()
  const nombre = `sloth-${randomBytes(4).toString('hex')}${ext}`
  const item = panel.locator('button[role=option]').filter({ hasText: nombre })
  try {
    await hueco.click({ timeout: 10_000 })
    const [selector] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15_000 }), panel.locator('button:has(mat-icon:text-is("upload"))').click({ timeout: 10_000 })])
    await selector.setFiles({ name: nombre, mimeType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg', buffer: readFileSync(ruta) })
    await page.locator('mat-dialog-container button').last().click({ timeout: 3000 }).catch(() => {})
    // Elegirla mientras sube la deja marcada sin entrar al compositor. Subiendo, su renglón lleva una rueda (antes, una
    // miniatura suya); al acabar, un icono: la miniatura de Flow ya no llega hasta recargar la lista (18 de noviembre de
    // 2026), y esperarla dejó a todos sin referencias ni fotogramas. Con mala conexión una imagen tarda más de un minuto
    // en subir: se espera mientras la página siga mandando datos, hasta `SUBIDA_MAXIMA`. Si la rueda no se va (deja de
    // mandar `SUBIDA_QUIETA`, o Flow cambió su lista), se elige igual: quien llama mira si entró al compositor, y si no
    // entró, es la red (`SinConexion`).
    const yaSubio = item.filter({ hasNot: page.locator('[role=progressbar], img:not([src^="https://"])') }).first()
    const desde = Date.now()
    while (!(await yaSubio.count())) {
      if (envios.quieta() > SUBIDA_QUIETA || Date.now() - desde > SUBIDA_MAXIMA) break
      await page.waitForTimeout(1000)
    }
  } finally {
    envios.soltar()
  }
  return item.first().click({ timeout: 10_000 }).then(() => true, () => false)
}

/** Pone las referencias en el compositor («Ingredientes»), tras quitar las que hubiera. */
async function adjuntar(page: Page, rutas: string[]) {
  for (let i = await fotos(page).count(); i > 0; i--) {
    await page.locator('.base-prompt-box button:has(mat-icon:text-is("cancel"))').first().click({ timeout: 5000 })
    await page.waitForTimeout(300)
  }
  for (const [i, ruta] of rutas.entries()) {
    const subida = await subir(page, page.locator('.base-prompt-box button:has(mat-icon:text-is("add"))').first(), ruta)
    if (!subida || !(await fotos(page).nth(i).waitFor({ timeout: 30_000 }).then(() => true, () => false))) throw new SinConexion(`Flow no tomó la referencia ${ruta}${await avisos(page)}. No se gastó nada.`)
  }
}

/**
 * Pone el primer fotograma y, si hay, el último («Fotogramas»). Sus huecos son dos botones vacíos («Iniciar» y
 * «Finalizar», en el idioma de la cuenta): el primero vacío es siempre el que toca, y al llenarse deja de estar vacío.
 */
async function ponerCuadros(page: Page, rutas: string[]) {
  const vacios = page.locator('.base-prompt-box button.empty-chip')
  if ((await vacios.count()) !== 2) throw new Error('Flow no enseñó los huecos de los fotogramas. No se generó nada.')
  for (const [i, ruta] of rutas.entries()) {
    const subida = await subir(page, vacios.first(), ruta)
    const puesta = subida && (await page.waitForFunction((n) => document.querySelectorAll('.base-prompt-box button.empty-chip').length === n, 1 - i, { timeout: 30_000 }).then(() => true, () => false))
    if (!puesta) throw new SinConexion(`Flow no tomó el ${i ? 'último' : 'primer'} fotograma, ${ruta}${await avisos(page)}. No se gastó nada.`)
  }
}

const firmaDe = (tarjeta: Locator) => tarjeta.evaluate((d) => `${(d as HTMLElement).innerText} ${d.querySelector('img')?.src ?? ''}`).catch(() => '')
/** Solo el texto: tras recargar, la miniatura de la misma tarjeta vuelve con otra dirección. */
const textoDe = (tarjeta: Locator) => tarjeta.evaluate((d) => (d as HTMLElement).innerText).catch(() => '')

/**
 * Espera a que salga la tarjeta del pedido (cambia la primera del proyecto). Mientras la página siga mandando algo, el
 * pedido aún va de camino, así que no se da por perdido hasta `APARECE_MAXIMO`. `false` si no salió. `pedir` lo manda:
 * se mira la red desde antes, porque el pedido sale al pulsar la flecha y una petición que ya iba en camino no contaría.
 */
async function aparece(page: Page, tarjeta: Locator, antes: string, pedir: () => Promise<void>): Promise<boolean> {
  const envios = mirarEnvios(page)
  try {
    await pedir()
    const desde = Date.now()
    while ((await firmaDe(tarjeta)) === antes) {
      const pasado = Date.now() - desde
      if (pasado > APARECE_MAXIMO || (pasado > APARECE && envios.quieta() > APARECE)) return false
      await page.waitForTimeout(1000)
    }
    return true
  } finally {
    envios.soltar()
  }
}

/**
 * La tarjeta no salió: se recarga el proyecto y se mira si el pedido está y, en un video, si bajó el saldo. Vuelve si
 * empezó (y entonces se espera como siempre). Si no, dice por qué sin culpar a la cuenta de lo que fue la red:
 * - Flow dijo algo (un aviso): `SinEmpezar` con él, como antes.
 * - Un video que cobró sin tarjeta: `Rechazado` con lo gastado (no se pide otra vez).
 * - Sin aviso, sin cobrar y con créditos: la red (`SinConexion`), que se reintenta en la misma cuenta sin castigarla.
 * - Sin créditos para lo que cuesta: `SinEmpezar`, y la cuenta descansa hasta que se renueven.
 * - Un video del que no se pudo leer el saldo: no se sabe si gastó, así que falla sin pasarlo a otra cuenta.
 */
async function comprobarSiEmpezo(page: Page, tarjeta: Locator, p: PedidoFlow, antesTexto: string, saldoAntes: Saldo | null, creditos: number): Promise<void> {
  const aviso = await avisos(page)
  if (aviso) throw new SinEmpezar(`Flow no empezó a generar${aviso}.`, aviso)
  // Un video ya pedido que no se pudo comprobar (la página no recargó o se fue la sesión) no pasa a otra cuenta: pudo cobrarse.
  await ir(page, page.url()).catch((e: unknown) => {
    if (p.tipo === 'video') throw new Error(`Flow no enseñó el video y no pude recargar el proyecto para ver si lo cobró (${primeraLinea(e)}). No lo pidas otra vez sin decírselo al usuario.`)
    throw esDeRed(e) ? new SinConexion(`La tarjeta de la imagen no salió y Flow no recargó (${primeraLinea(e)}). No se gastó nada.`) : e
  })
  await tarjeta.waitFor({ timeout: 20_000 }).catch(() => {})
  const ahora = await textoDe(tarjeta)
  if (ahora && ahora !== antesTexto) return
  if (p.tipo === 'imagen') throw new SinConexion('La tarjeta de la imagen no salió en Flow (la conexión no dio). No se gastó nada.')
  const despues = await leerSaldo(page).catch(() => null)
  const gasto = gastoDeRechazo(saldoAntes, despues)
  if (gasto) throw new Rechazado(`Flow cobró ${gasto} créditos pero no enseña el video.`, '', gasto, despues)
  if (gasto === 0 && despues && despues.creditos < creditos) throw new SinEmpezar(`Flow no empezó a generar: le quedan ${despues.creditos} créditos y cuesta ${creditos}.`, 'sin créditos')
  if (gasto === 0) throw new SinConexion('Flow no recibió el pedido del video (la conexión no dio) y el saldo no bajó. No se gastó nada.')
  throw new Error('Flow no enseñó el video y no pude leer el saldo para saber si lo cobró. No lo pidas otra vez sin decírselo al usuario.')
}

/**
 * Espera a que acabe la tarjeta del pedido: mientras va enseña su % y, al acabar, su imagen o su botón de reproducir.
 * Sin % un rato (`SIN_AVANCE`), puede ser que la página dejó de refrescarse con mala conexión: se recarga y se mira otra
 * vez. Solo si tras recargar tampoco avanza, Flow lo rechazó y deja la tarjeta con su motivo.
 */
async function esperar(page: Page, tarjeta: Locator, tipo: PedidoFlow['tipo']) {
  const fin = Date.now() + TERMINA
  let sinAvance = Date.now()
  let recargada = false
  while (Date.now() < fin) {
    const e = await tarjeta
      .evaluate((d, video) => {
        const texto = (d as HTMLElement).innerText
        const img = d.querySelector('img')
        return { avanza: /\d+\s*%/.test(texto), lista: !/\d+\s*%/.test(texto) && (video ? /play_arrow/.test(texto) : !!img?.complete && img.naturalWidth > 0), texto }
      }, tipo === 'video')
      .catch(() => ({ avanza: false, lista: false, texto: '' }))
    if (e.lista) return
    if (e.avanza) {
      sinAvance = Date.now()
      recargada = false
    } else if (Date.now() - sinAvance > SIN_AVANCE) {
      // Sin % un rato: puede ser la conexión (la página dejó de refrescarse). Se recarga una vez y se vuelve a mirar;
      // solo si tras recargar sigue sin avanzar, Flow lo rechazó.
      if (!recargada) {
        await ir(page, page.url()).catch(() => {})
        await tarjeta.waitFor({ timeout: 20_000 }).catch(() => {})
        recargada = true
        sinAvance = Date.now()
        continue
      }
      const aviso = e.texto.replace(/\s+/g, ' ').trim().slice(0, 200)
      throw new Rechazado(`Flow no lo generó: ${aviso}`, aviso)
    }
    await page.waitForTimeout(2000)
  }
  throw new Error(`Flow no acabó en ${TERMINA / 60_000} minutos.`)
}

/**
 * Baja lo de la tarjeta, con la opción de su menú, a `carpeta`. Devuelve la ruta. Un tope fijo (2 min) cortaba descargas
 * largas de algo ya pagado: en su lugar se vigila el avance: mientras sigan llegando bytes se espera, hasta `BAJADA_MAXIMA`;
 * solo falla si pasan `BAJADA_QUIETA` sin recibir nada.
 */
export async function bajar(page: Page, b: Browser, tarjeta: Locator, carpeta: string): Promise<string> {
  mkdirSync(carpeta, { recursive: true })
  const cdp = await b.newBrowserCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: carpeta, eventsEnabled: true })
  let reloj: NodeJS.Timeout | undefined
  try {
    const bajada = new Promise<string>((ok, mal) => {
      const tope = Date.now() + BAJADA_MAXIMA
      const vigilar = () => {
        clearTimeout(reloj)
        const falta = tope - Date.now()
        reloj = setTimeout(() => mal(new Error(falta <= BAJADA_QUIETA ? `Lo generado no bajó en ${BAJADA_MAXIMA / 60_000} minutos.` : `Lo generado dejó de bajar (${BAJADA_QUIETA / 1000} s sin llegar nada).`)), Math.max(0, Math.min(BAJADA_QUIETA, falta))).unref()
      }
      let guid = ''
      let recibido = -1
      vigilar()
      cdp.on('Browser.downloadWillBegin', (e) => void (guid ||= e.guid))
      cdp.on('Browser.downloadProgress', (e) => {
        if (e.guid !== guid) return
        if (e.state === 'completed') ok(join(carpeta, guid))
        else if (e.state === 'canceled') mal(new Error('Edge canceló la descarga.'))
        else if (e.receivedBytes !== recibido) {
          recibido = e.receivedBytes
          vigilar()
        }
      })
    })
    await tarjeta.click({ button: 'right', timeout: 15_000 })
    await page.getByRole('menuitem').filter({ has: page.locator('mat-icon:text-is("download")') }).first().click({ timeout: 10_000 })
    return await bajada
  } finally {
    clearTimeout(reloj)
    await cdp.detach().catch(() => {})
  }
}

/** Un fallo de la red o una página que tardó, no algo que Flow dijo: antes de pedir nada, se puede reintentar. */
const esDeRed = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || /net::ERR_|Timeout \d+ms exceeded/i.test(e.message))
const primeraLinea = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]

/**
 * Deja el compositor listo para generar, sin generar: entra al proyecto, elige lo pedido, comprueba el costo y pone las
 * imágenes. Devuelve lo que costará.
 */
export async function prepararEnFlow(page: Page, proyecto: string | undefined, p: PedidoFlow, alEntrar: (proyecto: string) => void): Promise<number> {
  alEntrar(await entrar(page, proyecto))
  const creditos = await elegir(page, p)
  if (creditos > p.tope) throw new Error(`Cuesta ${creditos} créditos y el tope es ${p.tope}. No se generó nada.`)
  if (p.cuadros?.length) await ponerCuadros(page, p.cuadros)
  else await adjuntar(page, p.referencias ?? [])
  return creditos
}

/**
 * Genera lo pedido en el proyecto de Sloth y lo baja a `carpeta`. Si cuesta más que `tope`, no genera. Los pedidos van de
 * uno en uno: la tarjeta nueva es la primera del proyecto. `alEntrar` recibe el proyecto en cuanto se sabe, para no crear
 * otro si lo demás falla.
 *
 * Un video lee el saldo justo antes de pedirlo: si Flow lo rechaza, se lee otra vez y `Rechazado` dice si gastó. Así se
 * sabe si se puede pedir de nuevo sin pagarlo dos veces.
 */
/** `alAvanzar`: en qué paso va, para el estudio de Imágenes (`PASOS_IMAGEN`). */
export async function generarEnFlow(b: Browser, page: Page, proyecto: string | undefined, p: PedidoFlow, carpeta: string, alEntrar: (proyecto: string) => void, alAvanzar?: (paso: 'configurar' | 'generar' | 'descargar') => void) {
  // El saldo, antes de entrar al proyecto: el menú de la cuenta no siempre se cierra con Escape, y abierto tapa el
  // compositor (el clic en la caja del prompt fallaba). Entrar al proyecto recarga la página y lo cierra.
  const saldoAntes = p.tipo === 'video' ? await saldoEnFlow(page).catch(() => null) : null
  alAvanzar?.('configurar')
  // Hasta pulsar la flecha no se gasta nada: un corte de la red hasta ahí se puede reintentar (`SinConexion`).
  const creditos = await prepararEnFlow(page, proyecto, p, alEntrar).catch((e: unknown) => {
    throw esDeRed(e) ? new SinConexion(`La conexión con Flow falló antes de pedirlo (${primeraLinea(e)}). No se gastó nada.`) : e
  })
  // Después de preparar: cada imagen subida también es una tarjeta del proyecto, y se queda en su «100 %» un momento
  // más. Se espera a que acabe: si cambia después, parecería la tarjeta del pedido.
  await page.waitForFunction(() => !/\d+\s*%/.test(document.querySelector<HTMLElement>('flow-tile-container')?.innerText ?? ''), null, { timeout: 15_000 }).catch(() => {})
  const tarjeta = page.locator('flow-tile-container').first()
  const hay = (await tarjeta.count()) > 0
  const antes = hay ? await firmaDe(tarjeta) : ''
  const antesTexto = hay ? await textoDe(tarjeta) : ''
  const salio = await aparece(page, tarjeta, antes, async () => {
    await page.locator('.base-prompt-box [role=textbox]').first().click({ timeout: 10_000 })
    await page.keyboard.insertText(p.prompt.split(/\s+/).join(' '))
    await page.waitForTimeout(500)
    await icono(page, 'arrow_forward').last().click({ timeout: 10_000 })
    alAvanzar?.('generar')
  })
  try {
    // Si la tarjeta no sale, antes de darlo por no empezado se comprueba recargando: con mala conexión tarda, y darlo por
    // no empezado mandaba el mismo video a otra cuenta, que lo cobraba de nuevo.
    if (!salio) await comprobarSiEmpezo(page, tarjeta, p, antesTexto, saldoAntes, creditos)
    await esperar(page, tarjeta, p.tipo)
  } catch (e) {
    if (!(e instanceof Rechazado)) throw e
    if (p.tipo === 'imagen') throw new Rechazado(e.message, e.aviso, 0)
    // Si Flow devuelve los créditos, que alcance a verse: se espera un poco y se recarga.
    await page.waitForTimeout(5000)
    const despues = await ir(page, page.url())
      .then(() => leerSaldo(page))
      .catch(() => null)
    throw new Rechazado(e.message, e.aviso, gastoDeRechazo(saldoAntes, despues), despues)
  }
  alAvanzar?.('descargar')
  // Ya está pagado: si la descarga no arranca, se intenta otra vez antes de rendirse (pedirlo de nuevo lo pagaría dos veces).
  for (let intento = 1; ; intento++) {
    try {
      return { creditos, archivo: await bajar(page, b, tarjeta, carpeta) }
    } catch (e) {
      if (intento >= 3) throw new Error(`${primeraLinea(e)} Ya se hizo${p.tipo === 'video' ? ' (y se pagó)' : ''} en el proyecto de Flow de Sloth: no lo pidas otra vez; el usuario lo baja en Opciones → Google Flow → Abrir Flow.`)
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(5000 * intento)
    }
  }
}
