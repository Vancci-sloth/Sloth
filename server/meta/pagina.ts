import type { Browser, Page } from 'playwright-core'
import { paginaNueva } from '../chromium.ts'
import { mensajeMeta, type PedidoMeta, URL_MUSE, usoDe, type UsoMeta } from '../../shared/meta.ts'

/**
 * Lo que se hace en muse.ai, el agente de Meta. No tiene API (Meta solo vende Muse Image, sin video): se le pide en su
 * chat, como lo pediría el usuario. Se usan los atributos de su página (`data-testid`, `data-message-role`,
 * `data-pel-click`), no los textos: sale en el idioma de la cuenta. Comprobado el 23 de noviembre de 2026 con una cuenta
 * gratis, en el Edge sin ventana: una imagen tardó unos 20 s (1600×1600 en 1:1, WebP) y un video, unos 40 s (10 s,
 * 720×1280 en 9:16, con audio y la voz entre comillas). En el plan gratis, una imagen gastó del 0 al 1 % de la semana y
 * un video, del 8 al 9 %.
 *
 * Cada pedido va en un chat nuevo (de los «chats paralelos» de Muse): así no se mezcla con lo que el usuario le cuenta en
 * el principal ni con el pedido anterior.
 */

/** No abrió con la cuenta: nada se pidió. */
export class SinSesionMeta extends Error {}

/** Muse contestó sin el archivo (se negó, preguntó algo o falló). `texto`, lo que dijo. */
export class SinArchivoMeta extends Error {
  constructor(readonly texto: string) {
    super(`Muse no lo generó${texto ? `: «${texto.slice(0, 400)}»` : '.'}`)
  }
}

/** Ya se usó toda la semana: nada se pidió. */
export class SinUsoMeta extends Error {
  constructor(readonly uso: UsoMeta) {
    super(`Ya se usó el ${uso.porcentaje} % de la semana de Muse${uso.detalle ? ` (${uso.detalle})` : ''}. No se pidió nada.`)
  }
}

const VISTA = { ancho: 1280, alto: 1000 }
const ABRE = 60_000
/** useapi.net vio videos de hasta 140 s; con margen. */
const TERMINA = 8 * 60_000
/** Sin trabajar y sin el archivo todo este rato, Muse ya contestó lo que iba a contestar. */
const CALLADA = 25_000

const LISTA = '[data-hatch-shell-hydration-state=hydrated]'
const COMPOSITOR = '[data-hatch-composer-root] textarea'
const RESPUESTA = '[data-message-role=assistant]'
const PRESENTACION = { imagen: '[data-testid=hatch-chat-attachment-presentation-image]', video: '[data-testid=hatch-chat-attachment-presentation-video]' }
const VISOR = '[data-hatch-media-lightbox]'

export const paginaMuse = (b: Browser) => paginaNueva(b, VISTA)

/** Abre un chat nuevo y espera su compositor. Sin él, no hay sesión (o Meta pide algo que solo el usuario puede dar). */
async function chatNuevo(page: Page) {
  const sinSesion = new SinSesionMeta('muse.ai no abrió con tu cuenta de Meta: vuelve a conectarla en Opciones → Meta Muse.')
  // Sin su cookie de sesión no hay que esperar a que no salga el compositor.
  if (!(await page.context().cookies(URL_MUSE)).some((c) => c.name === 'hatch_sess')) throw sinSesion
  await page.goto(new URL('thread/new', URL_MUSE).href, { waitUntil: 'domcontentloaded', timeout: ABRE })
  const listo = await page
    .locator(`${LISTA} ${COMPOSITOR}`)
    .first()
    .waitFor({ state: 'visible', timeout: ABRE })
    .then(
      () => true,
      () => false
    )
  if (!listo) throw sinSesion
}

/** Sube las imágenes al mensaje y espera a que el compositor las enseñe todas. */
async function adjuntar(page: Page, imagenes: string[]) {
  if (!imagenes.length) return
  await page.locator('input[type=file]').first().setInputFiles(imagenes)
  await page.waitForFunction(
    ({ compositor, n }) => {
      const raiz = document.querySelector(compositor)?.closest('[data-hatch-composer-root]')
      return !!raiz && raiz.querySelectorAll('img').length >= n && !raiz.querySelector('[aria-busy=true]')
    },
    { compositor: COMPOSITOR, n: imagenes.length },
    { timeout: 90_000 }
  )
  await page.waitForTimeout(1000)
}

/** Espera la respuesta de Muse con un archivo del tipo pedido. Si acaba sin él, `SinArchivoMeta` con lo que dijo. */
async function esperar(page: Page, tipo: 'imagen' | 'video') {
  const inicio = Date.now()
  let ocupada = Date.now()
  while (Date.now() - inicio < TERMINA) {
    await page.waitForTimeout(2000)
    const e = await page.evaluate(
      ({ respuesta, presentacion }) => {
        const respuestas = [...document.querySelectorAll<HTMLElement>(respuesta)]
        return {
          trabajando: !!document.querySelector('[role=log] [aria-busy=true]'),
          hecho: respuestas.some((r) => r.querySelector(presentacion)),
          texto: respuestas.map((r) => r.innerText.trim()).filter(Boolean).join('\n')
        }
      },
      { respuesta: RESPUESTA, presentacion: PRESENTACION[tipo] }
    )
    if (e.hecho && !e.trabajando) return
    if (e.trabajando) ocupada = Date.now()
    else if (Date.now() - ocupada > CALLADA) throw new SinArchivoMeta(e.texto.replace(/\s+/g, ' ').trim())
  }
  throw new Error(`Muse no acabó en ${TERMINA / 60_000} minutos.`)
}

/**
 * Los bytes de un `blob:` de la página. `tipo`, el de la imagen que se quiere (PNG o JPEG): Muse da WebP y se convierte
 * ahí mismo, sin otro programa.
 */
async function bytesDe(page: Page, src: string, tipo?: string): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ src, tipo }) => {
      let blob = await (await fetch(src)).blob()
      if (tipo && blob.type !== tipo) {
        const bmp = await createImageBitmap(blob)
        const lienzo = new OffscreenCanvas(bmp.width, bmp.height)
        lienzo.getContext('2d')!.drawImage(bmp, 0, 0)
        blob = await lienzo.convertToBlob({ type: tipo, quality: 0.95 })
      }
      const u = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
      return btoa(s)
    },
    { src, tipo }
  )
  return Buffer.from(b64, 'base64')
}

/** El archivo de la respuesta: el video tal cual; la imagen, la grande del visor (en el chat sale una miniatura). */
async function archivo(page: Page, tipo: 'imagen' | 'video', formatoImagen?: string): Promise<Buffer> {
  const presentacion = page.locator(`${RESPUESTA} ${PRESENTACION[tipo]}`).first()
  if (tipo === 'video') {
    const src = await presentacion.locator('[data-hatch-video-src]').first().getAttribute('data-hatch-video-src', { timeout: 10_000 })
    if (!src) throw new Error('Muse hizo el video, pero no encontré su archivo en la página.')
    return bytesDe(page, src)
  }
  // El visor enseña primero la miniatura y luego carga la grande: se espera una más ancha que la del chat.
  const miniatura = await presentacion.locator('img').first().evaluate((i) => (i as HTMLImageElement).naturalWidth, null, { timeout: 10_000 })
  await presentacion.locator('button').first().click({ timeout: 10_000 })
  const buscar = (minimo: number) =>
    page.waitForFunction(
      ({ visor, minimo }) => {
        const imgs = [...document.querySelectorAll<HTMLImageElement>(`${visor} img`)].filter((i) => i.complete && i.naturalWidth > minimo)
        return imgs.sort((a, b) => b.naturalWidth - a.naturalWidth)[0]?.src || false
      },
      { visor: VISOR, minimo },
      { timeout: 30_000 }
    )
  // Si no llega una más grande, la imagen era así de chica.
  const grande = await buscar(miniatura).catch(() => buscar(0))
  const src = (await grande.jsonValue()) as string
  const bytes = await bytesDe(page, src, formatoImagen)
  await page.keyboard.press('Escape')
  return bytes
}

/**
 * Lo usado de la semana, de Configuración → General (`Ctrl+,`). `null` si no se pudo leer; no cambia nada.
 */
export async function usoEnMuse(page: Page): Promise<UsoMeta | null> {
  await page.keyboard.press('ControlOrMeta+Comma')
  const barra = page.locator(`[role=dialog] [role=progressbar]`).first()
  const porcentaje = await barra.getAttribute('aria-valuenow', { timeout: 15_000 }).catch(() => null)
  const texto = await barra.evaluate((e) => (e.parentElement?.parentElement as HTMLElement | null)?.innerText ?? '').catch(() => '')
  await page.keyboard.press('Escape')
  return usoDe(porcentaje, texto, Date.now())
}

/**
 * El correo de la cuenta, del Centro de cuentas de Meta, que abre con la sesión de muse.ai: Muse no lo enseña. `null`
 * si no tiene correo (solo teléfono) o no se pudo leer.
 */
export async function correoEnMeta(page: Page): Promise<string | null> {
  await page.goto('https://accountscenter.meta.com/personal_info/contact_points', { waitUntil: 'domcontentloaded', timeout: ABRE })
  const correo = await page
    .waitForFunction(() => document.body.innerText.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0] ?? false, null, { timeout: 30_000 })
    .then((h) => h.jsonValue() as Promise<string>)
    .catch(() => null)
  return correo?.toLowerCase() ?? null
}

/** Lee el uso en un chat nuevo: comprueba también la sesión. */
export async function leerUso(page: Page): Promise<UsoMeta | null> {
  await chatNuevo(page)
  return usoEnMuse(page)
}

/**
 * Pide en un chat nuevo lo de `p`, con sus `imagenes` (rutas; el primer cuadro primero), y devuelve el archivo:
 * MP4 el video; la imagen, en `formatoImagen` (`image/png`, `image/jpeg`) o el WebP de Muse. Lee el uso antes y
 * después: con la semana gastada no pide nada (`SinUsoMeta`), y así se sabe cuánto gastó.
 */
export async function generarEnMuse(
  page: Page,
  p: Omit<PedidoMeta, 'imagenes'>,
  imagenes: string[],
  formatoImagen?: string
): Promise<{ bytes: Buffer; texto: string; antes: UsoMeta | null; despues: UsoMeta | null }> {
  await chatNuevo(page)
  const antes = await usoEnMuse(page)
  if (antes && antes.porcentaje >= 100) throw new SinUsoMeta(antes)
  await adjuntar(page, imagenes)
  const compositor = page.locator(COMPOSITOR).first()
  await compositor.click({ timeout: 10_000 })
  await compositor.fill(mensajeMeta({ ...p, imagenes: imagenes.length }))
  await page.keyboard.press('Enter')
  await esperar(page, p.tipo)
  const texto = await page.locator(RESPUESTA).last().innerText().catch(() => '')
  const bytes = await archivo(page, p.tipo, formatoImagen)
  return { bytes, texto: texto.replace(/\s+/g, ' ').trim(), antes, despues: await usoEnMuse(page).catch(() => null) }
}
