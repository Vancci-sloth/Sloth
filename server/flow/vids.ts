import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Browser, Page } from 'playwright-core'
import { motivoDeVids, tipoDeArchivo } from '../../shared/flow.ts'
import { paginaNueva } from '../chromium.ts'
import { Rechazado, SinEmpezar } from './pagina.ts'

/**
 * Lo que se hace en Google Vids (`docs.google.com/videos`): un video de Omni en el panel «Vídeo de IA» de su editor, con
 * la misma sesión de Google que Flow (el perfil de Edge de cada cuenta). Comprobado el 23 de noviembre de 2026 con una
 * cuenta gratis: un clip vertical de 3 s salió en unos 30 s, en 720×1280 y con audio, con la marca ✦ abajo a la derecha.
 *
 * Vids sale en el idioma de la cuenta y sus botones no tienen iconos con nombre, como Flow: se buscan por sus clases
 * (`collapsiblePromptBox…`, `…GenerationSettingsButton`), que no cambian con el idioma, y por su orden.
 *
 * Lo generado no queda en ningún lado hasta insertarlo en el video («se descartarán cuando cierres esta pestaña»): no se
 * inserta, se baja en cuanto sale. Cada cuenta tiene un archivo de Vids para Sloth, que solo abre el panel.
 */

export const URL_VIDS = 'https://docs.google.com/videos/'
const CREAR = 'https://docs.google.com/videos/create'
/** Con la ventana ancha el panel cabe al lado del editor. */
const ANCHO = 1400
const ALTO = 1000
const TERMINA = 6 * 60_000

export interface PedidoVids {
  prompt: string
  formato: string
  segundos: number
  /** Hasta 3 imágenes (PNG o JPEG), «Imagen 1» a «Imagen 3» para Vids. Quien las pide ya confirmó sus derechos. */
  referencias: string[]
}

export const paginaVids = (b: Browser): Promise<Page> => paginaNueva(b, { ancho: ANCHO, alto: ALTO })

const caja = (page: Page) => page.locator('.promptTextAreaPromptRichTextInputInternal').first()
/** Abre el panel «Vídeo de IA» al cargar el archivo, sin buscar su botón (que solo dice su nombre en el idioma). */
const conPanel = (archivo: string) => `${archivo}?gs_dl=videogen`

async function ir(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  // Google a veces pasa por su página de cuentas para renovar la sesión, sin pedir nada: se espera a que vuelva.
  if (page.url().startsWith('https://accounts.google.com/')) await page.waitForURL((u) => u.hostname !== 'accounts.google.com', { timeout: 12_000, waitUntil: 'domcontentloaded' }).catch(() => {})
  if (page.url().startsWith('https://accounts.google.com/'))
    throw new SinEmpezar('Google Vids ya no tiene la sesión de esta cuenta de Google: vuelve a conectarla (la de la voz en Opciones → Voz; las demás, agregándola otra vez en Opciones → Google Flow).', '', true)
}

/** Abre el archivo de Vids de Sloth con su panel; si no hay (o se borró), crea uno. Devuelve su dirección. */
async function entrar(page: Page, archivo: string | undefined): Promise<string> {
  if (archivo) {
    await ir(page, conPanel(archivo))
    if (await caja(page).waitFor({ timeout: 20_000 }).then(() => true, () => false)) return archivo
  }
  await ir(page, CREAR)
  if (!/\/videos\/(u\/\d+\/)?d\//.test(page.url())) throw new Error('Google Vids no dejó crear un archivo con esta cuenta. No se generó nada.')
  const nuevo = page.url().replace(/[?#].*$/, '')
  await ir(page, conPanel(nuevo))
  if (!(await caja(page).waitFor({ timeout: 30_000 }).then(() => true, () => false))) throw new Error('Google Vids no abrió su panel de video con IA. No se generó nada.')
  return nuevo
}

/**
 * Marca con `data-sloth` los botones visibles que no lo estaban: así se halla el que abre un clic sin leer su texto. Los
 * evaluados van sin funciones con nombre: tsx les pone `__name`, que en la página no existe.
 */
const marcarVisibles = (page: Page, marca: string) =>
  page.evaluate((m) => {
    for (const b of document.querySelectorAll('button')) if (b.getBoundingClientRect().width > 0 && !b.dataset.sloth) b.dataset.sloth = m
  }, marca)

/**
 * Sube una imagen como ingrediente: el botón de ingredientes abre cuatro fuentes (avatar, Drive, Fotos, subir de la
 * compu) y subir es la última. Al subir, Vids puede pedir aceptar que se tienen los derechos de la imagen («Crea
 * contenido a partir de imágenes en Workspace»): eso lo declaró el usuario en Sloth, y por eso aquí se acepta. Entra a la
 * caja del prompt como una ficha («Imagen 1»).
 */
async function subir(page: Page, ruta: string, n: number) {
  await marcarVisibles(page, 'antes')
  await page.locator('.videoGenCreationViewFileInputsInputSelectButton').first().click({ force: true, timeout: 10_000 })
  await page.waitForTimeout(1200)
  const nuevos = page.locator('button:not([data-sloth]):visible')
  if ((await nuevos.count()) < 2) throw new Error('Google Vids no enseñó de dónde subir la imagen. No se generó nada.')
  const eleccion = page.waitForEvent('filechooser', { timeout: 20_000 })
  await nuevos.last().click({ timeout: 10_000 })
  const dialogo = page.locator('[role=dialog]:visible, [role=alertdialog]:visible, .javascriptMaterialdesignGm3WizDialog-dialog__surface:visible').last()
  if (await dialogo.waitFor({ timeout: 4000 }).then(() => true, () => false)) await dialogo.locator('button').last().click({ timeout: 5000 })
  const selector = await eleccion.catch(() => {
    throw new Error(`Google Vids no dejó subir la referencia ${ruta}. No se generó nada.`)
  })
  const ext = extname(ruta).toLowerCase()
  await selector.setFiles({ name: `sloth-${randomBytes(4).toString('hex')}${ext}`, mimeType: ext === '.png' ? 'image/png' : 'image/jpeg', buffer: readFileSync(ruta) })
  const entro = await page
    .waitForFunction((k) => document.querySelectorAll('.promptTextAreaPromptRichTextInputInternal .appsElementsRichTextInputInputChip').length >= k, n, { timeout: 60_000 })
    .then(() => true, () => false)
  if (!entro) throw new Error(`Google Vids no tomó la referencia ${ruta}. No se generó nada.`)
  await page.evaluate(() => document.querySelectorAll('[data-sloth]').forEach((b) => delete (b as HTMLElement).dataset.sloth))
}

/** Elige la orientación y la duración en el menú de la generación, y comprueba lo que dice su botón. Lo cierra. */
async function ajustar(page: Page, p: PedidoVids) {
  const boton = page.locator('[class*=MenubuttonGenerationSettingsButton]').first()
  await boton.click({ force: true, timeout: 10_000 })
  const menu = page.locator('[class*=MenubuttonPopoverContainer]').last()
  await menu.waitFor({ timeout: 10_000 })
  // Horizontal y vertical, en ese orden.
  await menu.locator('[role=radio]').nth(p.formato === '16:9' ? 0 : 1).click({ timeout: 10_000 })
  const barra = menu.locator('input[type=range]').first()
  await barra.focus({ timeout: 5000 })
  for (let i = 0; i < 20; i++) {
    const ahora = Number(await barra.inputValue())
    if (ahora === p.segundos || Number.isNaN(ahora)) break
    await page.keyboard.press(ahora < p.segundos ? 'ArrowRight' : 'ArrowLeft')
    await page.waitForTimeout(120)
  }
  const puesta = Number(await barra.inputValue())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  if (puesta !== p.segundos) throw new Error(`No pude poner el video en ${p.segundos} s en Google Vids. No se generó nada.`)
  // «Configuración de la generación: Omni, 720p, Vertical, 3 segundos», en el idioma de la cuenta.
  const dice = (await boton.getAttribute('aria-label')) ?? ''
  if (!/720p/.test(dice)) throw new Error(`Google Vids no está en 720p (dice «${dice}»). No se generó nada.`)
}

const generados = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('video')].map((v) => v.currentSrc || v.src).filter((s) => s.includes('usercontent.google.com')))
const renglones = (page: Page) => page.evaluate(() => document.body.innerText.split('\n').map((r) => r.trim()).filter(Boolean)).catch(() => [] as string[])
/** Lo que dice Vids cuando no hace un video: su cupo, un límite corto, una política o un error. */
const AVISO = /l[ií]mite|limit|cuota|quota|no se (ha )?podido|couldn.?t|unable|error|pol[ií]tica|policy|int[eé]ntalo|try again/i

/**
 * Pide el video y espera a que salga uno nuevo en el panel. Si sale un aviso de cupo o de límite corto, no empezó y no
 * gastó (`SinEmpezar`): el pedido puede ir a otra cuenta. Otro aviso es `Rechazado`, sin saber si gastó: Vids no dice lo
 * que le queda a la cuenta hasta que casi se acaba.
 */
async function esperar(page: Page): Promise<string> {
  const antes = new Set(await generados(page))
  const dichos = new Set(await renglones(page))
  await page.locator('.collapsiblePromptBoxGenerateButton').first().click({ force: true, timeout: 10_000 })
  const fin = Date.now() + TERMINA
  while (Date.now() < fin) {
    await page.waitForTimeout(2000)
    const nuevo = (await generados(page)).find((s) => !antes.has(s))
    if (nuevo) {
      // Que acabe de cargar: el reproductor sabe su duración cuando ya está entero.
      await page.waitForFunction((s) => [...document.querySelectorAll('video')].some((v) => (v.currentSrc || v.src) === s && v.duration > 0), nuevo, { timeout: 60_000 }).catch(() => {})
      return nuevo
    }
    const aviso = (await renglones(page)).filter((r) => !dichos.has(r) && AVISO.test(r)).join(' · ').slice(0, 300)
    if (aviso) {
      if (motivoDeVids(aviso)) throw new SinEmpezar(`Google Vids no lo empezó: ${aviso}`, aviso)
      throw new Rechazado(`Google Vids no lo generó: ${aviso}`, aviso)
    }
  }
  throw new Error(`Google Vids no acabó en ${TERMINA / 60_000} minutos.`)
}

/**
 * Genera el video en el archivo de Vids de Sloth y lo baja a `carpeta`. `alEntrar` recibe el archivo en cuanto se sabe,
 * para no crear otro si lo demás falla.
 */
export async function generarEnVids(page: Page, archivo: string | undefined, p: PedidoVids, carpeta: string, alEntrar: (archivo: string) => void) {
  alEntrar(await entrar(page, archivo))
  await page.keyboard.press('Escape').catch(() => {})
  // El prompt primero: con la caja vacía, el botón de ingredientes y el de la generación no están.
  await caja(page).click({ force: true, timeout: 10_000 })
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.insertText(p.prompt.split(/\s+/).join(' '))
  await page.waitForTimeout(800)
  for (const [i, ruta] of p.referencias.entries()) await subir(page, ruta, i + 1)
  await ajustar(page, p)
  const fuente = await esperar(page)
  const r = await page.context().request.get(fuente, { timeout: 120_000 })
  const bytes = r.ok() ? await r.body() : Buffer.alloc(0)
  if (tipoDeArchivo(bytes) !== 'video') throw new Error(`Lo que bajó de Google Vids no es un video (respondió ${r.status()}).`)
  mkdirSync(carpeta, { recursive: true })
  const ruta = join(carpeta, 'vids.mp4')
  writeFileSync(ruta, bytes)
  return { creditos: 0, archivo: ruta }
}
