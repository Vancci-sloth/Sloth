import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Browser, Locator, Page } from 'playwright-core'
import { creditosDe, FORMATOS_IMAGEN, FORMATOS_VIDEO } from '../../shared/flow.ts'

/**
 * Lo que se hace en la página de Google Flow. Se usan los iconos (el nombre de cada `mat-icon`), no los textos: Flow sale
 * en el idioma de la cuenta y los iconos son iguales en todos. Comprobado el 1 de noviembre de 2026 en `flow.google.com`,
 * con el Edge sin ventana: una imagen tarda unos 60 s por el agente de Flow y un video Lite de 8 s, unos 50 s.
 *
 * Con la ventana angosta Flow enseña su compositor directo, que dice qué se genera y cuánto cuesta. Con la ancha enseña
 * un chat con un agente, que decide por su cuenta y no da el costo: por eso `ANCHO`.
 */

export const URL_FLOW = 'https://flow.google.com/'
const ANCHO = 800
const ALTO = 1000
/** Lo que espera a que salga la tarjeta del pedido: si no sale, Flow lo rechazó (sin créditos, o el pedido no pasó). */
const APARECE = 45_000
const TERMINA = 10 * 60_000
/** Lo que tarda el interruptor en enseñar lo guardado: al abrir el menú dibuja `false` aunque esté encendido. */
const ASIENTA = 3500

export interface PedidoFlow {
  tipo: 'imagen' | 'video'
  prompt: string
  formato: string
  modelo: string
  /** Lo más que puede costar: si cuesta más, no se genera. */
  tope: number
  /** Las imágenes de referencia, en rutas absolutas. Quien las pide ya confirmó sus derechos (ver `adjuntar`). */
  referencias?: string[]
}

export const paginaFlow = async (b: Browser): Promise<Page> => {
  const page = await b.contexts()[0].newPage()
  await page.setViewportSize({ width: ANCHO, height: ALTO })
  return page
}

async function ir(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  if (page.url().startsWith('https://accounts.google.com/')) throw new Error('Flow no tiene tu sesión de Google. Conecta tu cuenta otra vez (Opciones → Voz).')
}

const icono = (page: Page | Locator, nombre: string) => page.locator(`button:has(mat-icon:text-is("${nombre}"))`)

/** Lo que dice el aviso de Flow, si enseña uno, para explicar por qué no generó. */
async function avisos(page: Page): Promise<string> {
  const texto = await page.evaluate(() => [...document.querySelectorAll('[role=alert], [role=status], mat-snack-bar-container')].map((d) => (d as HTMLElement).innerText.trim()).filter(Boolean).join(' · ')).catch(() => '')
  return texto ? `: ${texto}` : ''
}

/**
 * Enciende o apaga «Ayudar a mejorar Flow» (que Google use lo que generas para mejorar sus productos), en el menú
 * principal. Lee lo guardado con calma, y al acabar recarga y vuelve a leer: si no quedó como se pidió, falla.
 */
export async function ponerAportar(page: Page, quiere: boolean) {
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

/** Entra al proyecto de Sloth en Flow; si no hay (o se borró), crea uno. Devuelve su dirección. */
async function entrar(page: Page, proyecto: string | undefined): Promise<string> {
  const caja = page.locator('.base-prompt-box [role=textbox]').first()
  if (proyecto) {
    await ir(page, proyecto)
    if (await caja.waitFor({ timeout: 15_000 }).then(() => true, () => false)) return proyecto
  }
  await ir(page, URL_FLOW)
  await icono(page, 'add').last().click({ timeout: 20_000 }).catch(() => {
    throw new Error('Flow no dejó crear un proyecto. Si es la primera vez, ábrelo una vez (Opciones → Voz → Abrir Flow) y acepta su aviso.')
  })
  await page.waitForURL(/\/project\//, { timeout: 30_000 })
  await caja.waitFor({ timeout: 30_000 })
  // El recorrido de bienvenida del primer proyecto.
  await page.keyboard.press('Escape').catch(() => {})
  return page.url().split('?')[0]
}

/** Elige en el panel del compositor lo pedido y devuelve lo que cuesta. Cierra el panel. */
async function elegir(page: Page, p: PedidoFlow): Promise<number> {
  await page.locator('.base-prompt-box button:has(mat-icon:text-matches("^crop_"))').first().click({ timeout: 15_000 })
  const radio = (icon: string) => page.locator(`[role=radio]:has(mat-icon:text-is("${icon}"))`)
  await radio(p.tipo === 'video' ? 'videocam' : 'image').click({ timeout: 10_000 })
  await radio((p.tipo === 'video' ? FORMATOS_VIDEO : FORMATOS_IMAGEN)[p.formato]).click({ timeout: 10_000 })
  await page.getByRole('radio', { name: 'x1', exact: true }).click({ timeout: 10_000 })
  await page.locator('button:has(mat-icon:text-is("arrow_drop_down"))').first().click({ timeout: 10_000 })
  await page.getByRole('menuitem').filter({ hasText: p.modelo }).first().click({ timeout: 10_000 })
  // El costo se rehace tras elegir: se lee cuando dos lecturas seguidas coinciden.
  const panel = () =>
    page.locator('[role=radio]').first().evaluate((d) => {
      let e = d as HTMLElement
      while (e.parentElement && !/cr[eé]dit/i.test(e.innerText)) e = e.parentElement
      return e.innerText
    })
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
 * Pone las referencias en el compositor, tras quitar las que hubiera. Cada una se sube con un nombre propio, para
 * reconocerla en la lista, y al subir Flow puede pedir aceptar «Derechos para usar esta imagen»: eso lo declaró el usuario
 * en Sloth (`server/flow/index.ts`), y por eso aquí se acepta.
 */
async function adjuntar(page: Page, rutas: string[]) {
  for (let i = await fotos(page).count(); i > 0; i--) {
    await page.locator('.base-prompt-box button:has(mat-icon:text-is("cancel"))').first().click({ timeout: 5000 })
    await page.waitForTimeout(300)
  }
  for (const [i, ruta] of rutas.entries()) {
    await page.locator('.base-prompt-box button:has(mat-icon:text-is("add"))').first().click({ timeout: 10_000 })
    const panel = page.locator('.cdk-overlay-pane').filter({ has: page.locator('mat-icon:text-is("upload")') }).last()
    const [selector] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15_000 }), panel.locator('button:has(mat-icon:text-is("upload"))').click({ timeout: 10_000 })])
    const ext = extname(ruta).toLowerCase()
    const nombre = `sloth-${randomBytes(4).toString('hex')}${ext}`
    await selector.setFiles({ name: nombre, mimeType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg', buffer: readFileSync(ruta) })
    await page.locator('mat-dialog-container button').last().click({ timeout: 3000 }).catch(() => {})
    // Elegirla mientras sube la deja marcada sin entrar al compositor: se espera a que su miniatura venga ya de Flow.
    const item = panel.locator('button[role=option]').filter({ hasText: nombre }).first()
    const subida = await item.locator('img[src^="https://"]').waitFor({ timeout: 60_000 }).then(() => true, () => false)
    if (subida) await item.click({ timeout: 10_000 })
    if (!subida || !(await fotos(page).nth(i).waitFor({ timeout: 15_000 }).then(() => true, () => false))) throw new Error(`Flow no tomó la referencia ${ruta}${await avisos(page)}.`)
  }
}

/** Espera a que acabe la tarjeta del pedido: al salir enseña su % y, al acabar, su imagen o su botón de reproducir. */
async function esperar(page: Page, tarjeta: Locator, tipo: PedidoFlow['tipo'], antes: string) {
  const firma = () => tarjeta.evaluate((d) => `${(d as HTMLElement).innerText} ${d.querySelector('img')?.src ?? ''}`).catch(() => '')
  const salio = Date.now() + APARECE
  while ((await firma()) === antes) {
    if (Date.now() > salio) throw new Error(`Flow no empezó a generar${(await avisos(page)) || ' (¿sin créditos?)'}.`)
    await page.waitForTimeout(1000)
  }
  const fin = Date.now() + TERMINA
  let sinAvance = Date.now()
  while (Date.now() < fin) {
    const e = await tarjeta.evaluate((d, video) => {
      const texto = (d as HTMLElement).innerText
      const img = d.querySelector('img')
      return { avanza: /\d+\s*%/.test(texto), lista: !/\d+\s*%/.test(texto) && (video ? /play_arrow/.test(texto) : !!img?.complete && img.naturalWidth > 0), texto }
    }, tipo === 'video')
    if (e.lista) return
    if (e.avanza) sinAvance = Date.now()
    // Sin % y sin resultado: Flow lo rechazó y deja la tarjeta con su motivo.
    else if (Date.now() - sinAvance > 60_000) throw new Error(`Flow no lo generó: ${e.texto.replace(/\s+/g, ' ').slice(0, 200)}`)
    await page.waitForTimeout(2000)
  }
  throw new Error(`Flow no acabó en ${TERMINA / 60_000} minutos.`)
}

/** Baja lo de la tarjeta, con la opción de su menú, a `carpeta`. Devuelve la ruta. */
async function bajar(page: Page, b: Browser, tarjeta: Locator, carpeta: string): Promise<string> {
  mkdirSync(carpeta, { recursive: true })
  const cdp = await b.newBrowserCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: carpeta, eventsEnabled: true })
  const bajada = new Promise<string>((ok, mal) => {
    let guid = ''
    cdp.on('Browser.downloadWillBegin', (e) => void (guid ||= e.guid))
    cdp.on('Browser.downloadProgress', (e) => {
      if (e.guid !== guid) return
      if (e.state === 'completed') ok(join(carpeta, guid))
      if (e.state === 'canceled') mal(new Error('Edge canceló la descarga.'))
    })
  })
  await tarjeta.click({ button: 'right', timeout: 15_000 })
  await page.getByRole('menuitem').filter({ has: page.locator('mat-icon:text-is("download")') }).first().click({ timeout: 10_000 })
  return Promise.race([bajada, new Promise<string>((_, mal) => setTimeout(() => mal(new Error('Lo generado no bajó en 2 minutos.')), 120_000).unref())])
}

/**
 * Genera lo pedido en el proyecto de Sloth y lo baja a `carpeta`. Si cuesta más que `tope`, no genera. Los pedidos van de
 * uno en uno: la tarjeta nueva es la primera del proyecto. `alEntrar` recibe el proyecto en cuanto se sabe, para no crear
 * otro si lo demás falla.
 */
export async function generarEnFlow(b: Browser, page: Page, proyecto: string | undefined, p: PedidoFlow, carpeta: string, alEntrar: (proyecto: string) => void) {
  alEntrar(await entrar(page, proyecto))
  const creditos = await elegir(page, p)
  if (creditos > p.tope) throw new Error(`Cuesta ${creditos} créditos y el tope es ${p.tope}. No se generó nada.`)
  await adjuntar(page, p.referencias ?? [])
  // Después de adjuntar: cada referencia subida también es una tarjeta del proyecto.
  const tarjeta = page.locator('flow-tile-container').first()
  const antes = (await tarjeta.count()) ? await tarjeta.evaluate((d) => `${(d as HTMLElement).innerText} ${d.querySelector('img')?.src ?? ''}`) : ''
  await page.locator('.base-prompt-box [role=textbox]').first().click({ timeout: 10_000 })
  await page.keyboard.insertText(p.prompt.split(/\s+/).join(' '))
  await page.waitForTimeout(500)
  await icono(page, 'arrow_forward').last().click({ timeout: 10_000 })
  await esperar(page, tarjeta, p.tipo, antes)
  return { creditos, archivo: await bajar(page, b, tarjeta, carpeta) }
}
