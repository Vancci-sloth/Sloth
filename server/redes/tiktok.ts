import type { Locator, Page } from 'playwright-core'
import { cerrar, elegirArchivo, pestana, SinSesion } from './navegador.ts'
import type { ModuloRed } from './index.ts'

/**
 * TikTok: programa un video desde TikTok Studio (tiktok.com/tiktokstudio/upload) con su texto, sus hashtags y su hora,
 * visible para todo el mundo. La API de TikTok publica en privado mientras la app no pase su auditoría.
 */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const SESION = 'La sesión de TikTok se cerró: vuelve a conectarla en Opciones.'
const MESES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
/** Las publicaciones de la cuenta en TikTok Studio, con su hora. */
const LISTA = 'https://www.tiktok.com/tiktokstudio/content'
/** Una hora de la lista: `16 oct, 16:00`. */
const HORA = /(\d+) (ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic), (\d\d:\d\d)/
const dos = (n: number) => String(n).padStart(2, '0')
/** El tour de las novedades de TikTok Studio («Mira la vista previa…»): tapa la página hasta que lo cierras. */
const TOUR = '.react-joyride__overlay'

/**
 * Cierra el tour cuando tapa lo que Sloth va a pulsar. Sale la primera vez en un perfil nuevo (el de la app) y con cada
 * novedad. Su botón («Entendido», «Siguiente») o, si no se encuentra, Escape; y si sigue, se quita la capa.
 */
async function cerrarTour(page: Page) {
  for (let i = 0; i < 5 && (await page.locator(TOUR).isVisible().catch(() => false)); i++) {
    const boton = page.locator('.react-joyride__tooltip button, [class*=floater] button').last()
    if (await boton.isVisible().catch(() => false)) await boton.click({ timeout: 5000, force: true }).catch(() => {})
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await page.evaluate((s) => document.querySelectorAll(s).forEach((e) => e.remove()), TOUR).catch(() => {})
}

export const tiktok: ModuloRed = {
  id: 'tiktok',
  nombre: 'TikTok',
  login: 'https://www.tiktok.com/login',
  // Según su documentación, TikTok deja programar de 15 minutos a 10 días antes (blog «Introducing Video Scheduler»).
  horizonteDias: 10,

  async cuenta(nav) {
    const r = await (await nav()).request.get('https://www.tiktok.com/passport/web/account/info/?aid=1988').catch(() => null)
    const datos = await r?.json().catch(() => null)
    return { cuenta: datos?.data?.username ? `@${datos.data.username}` : null }
  },

  async programar(nav, p) {
    const ctx = await nav()
    const page = await pestana(ctx)
    await page.addLocatorHandler(page.locator(TOUR), () => cerrarTour(page))
    // Cada error dice en qué paso pasó, y guarda lo que se veía: si TikTok cambia su página, se sabe dónde.
    let paso = 'Al subir el video'
    try {
      // La otra vez pudo quedar sin que Sloth lo viera: si ya está en la lista, no se sube de nuevo, y vale su hora.
      if (p.reintento) {
        await page.goto(LISTA, { waitUntil: 'domcontentloaded' })
        if (page.url().includes('/login')) throw new SinSesion(SESION)
        const fila = await buscar(page, p.texto, diaDeHoy())
        const cuando = fila && horaDe(fila)
        if (cuando) return { cuando }
      }
      await subir(page, p.ruta)
      paso = 'Al escribir el texto'
      await escribir(page, p.texto, p.tags)
      paso = 'Al poner la hora'
      await ponerHora(page, p.cuando)
      paso = 'Al confirmar'
      await confirmar(page, p.texto, p.cuando)
    } catch (e) {
      if (e instanceof SinSesion) throw e
      // Sin sesión, TikTok Studio a veces tarda en mandar al login: la subida falla esperando dónde elegir el archivo.
      if (paso === 'Al subir el video' && page.url().includes('/login')) throw new SinSesion(SESION)
      const captura = await page.screenshot().catch(() => undefined)
      throw Object.assign(new Error(`${paso}: ${e instanceof Error ? e.message : e}`), { captura })
    } finally {
      // TikTok Studio guarda en IndexedDB una copia de cada video que se sube: sin borrarla, el perfil crece sin fin.
      const cdp = await ctx.newCDPSession(page).catch(() => null)
      await cdp?.send('Storage.clearDataForOrigin', { origin: 'https://www.tiktok.com', storageTypes: 'indexeddb' }).catch(() => {})
      await page.removeLocatorHandler(page.locator(TOUR)).catch(() => {})
      await cerrar(page)
    }
  }
}

async function subir(page: Page, ruta: string) {
  await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp', { waitUntil: 'domcontentloaded' })
  if (page.url().includes('/login')) throw new SinSesion(SESION)
  await page.locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 60000 })
  await elegirArchivo(page, 'input[type=file]', ruta)
  await page.locator('[data-e2e=upload_status_container]').getByText('Cargado').waitFor({ timeout: 20 * 60000 })
}

/**
 * El texto y los hashtags. Cada hashtag se elige de las sugerencias, para que quede como enlace y no como texto suelto.
 * Al escribir «#», TikTok abre sus sugerencias y a veces se come las primeras letras (`#Diff` por `#ElDiff`): si no queda
 * igual, se borra y se vuelve a escribir.
 */
async function escribir(page: Page, texto: string, tags: string[]) {
  const esperado = [texto, ...tags.map((t) => '#' + t)].join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
  for (let intento = 0; intento < 3; intento++) if ((await escribirUnaVez(page, texto, tags)) === esperado) return
  throw new Error('El texto no quedó como debía en TikTok.')
}

async function escribirUnaVez(page: Page, texto: string, tags: string[]) {
  const editor = page.locator('[data-e2e=caption_container] [contenteditable=true]')
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.keyboard.type(texto.trim() + ' ', { delay: 20 })
  for (const tag of tags) {
    await page.keyboard.type('#')
    await page.waitForTimeout(800)
    await page.keyboard.type(tag, { delay: 80 })
    let caja: { x: number; y: number } | null = null
    for (let i = 0; i < 12 && !caja; i++) {
      await page.waitForTimeout(300)
      caja = await page.evaluate((tag) => {
        const re = new RegExp(`^#${tag}\\s+[\\d.,]+\\s*[KMB]?\\s+publicaciones$`, 'i')
        const hits = [...document.querySelectorAll<HTMLElement>('div, li')].filter((e) => re.test((e.innerText || '').trim().replace(/\s+/g, ' ')) && e.getBoundingClientRect().height > 0)
        const r = hits.sort((a, b) => a.innerText.length - b.innerText.length)[0]?.getBoundingClientRect()
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
      }, tag)
    }
    // Un hashtag que nadie ha usado no sale en las sugerencias: se queda escrito tal cual.
    if (caja) await page.mouse.click(caja.x, caja.y)
    await page.waitForTimeout(400)
    if (!(await editor.innerText()).endsWith(' ')) await page.keyboard.type(' ')
  }
  return (await editor.innerText()).replace(/\s+/g, ' ').trim().toLowerCase()
}

async function ponerHora(page: Page, cuando: string) {
  const [fecha, hora] = cuando.split(' ')
  const [hh, mm] = hora.padStart(5, '0').split(':')
  const cont = page.locator('[data-e2e=schedule_container]')
  await cont.scrollIntoViewIfNeeded()
  const programacion = page.locator('input[name=postSchedule][value=schedule]')
  for (let i = 0; i < 2 && !(await programacion.isChecked()); i++) {
    await cont.getByText('Programación', { exact: true }).click()
    await page.waitForTimeout(1000)
    // La primera vez, TikTok pregunta si puede guardar el video en sus servidores hasta la hora.
    const permitir = page.getByRole('button', { name: 'Permitir' })
    if (await permitir.isVisible().catch(() => false)) {
      await permitir.click()
      await page.waitForTimeout(1000)
    }
  }
  if (!(await programacion.isChecked())) throw new Error('No pude marcar «Programación».')

  // TikTok alterna dos páginas para lo mismo, sin aviso (el 30 de octubre de 2026 volvió la vieja a media tarde).
  const menus = cont.getByRole('combobox', { name: 'Select date' })
  const campos = cont.locator('input[readonly]')
  await menus.or(campos).first().waitFor({ timeout: 15000 }).catch(() => {
    throw new Error('No encontré la fecha ni la hora: TikTok cambió su página.')
  })
  await ((await menus.isVisible()) ? ponerEnMenus : ponerEnCampos)(page, cont, fecha, hh, mm)
  const visible = await page.locator('[data-e2e=video_visibility_container]').innerText()
  if (!visible.includes('Todo el mundo')) throw new Error('La visibilidad no es «Todo el mundo».')
}

/** La página del 22 de octubre de 2026: un calendario y dos ruedas, que enseñan lo elegido en `.Picker__value` (`23 oct 2026` y `13:00`). */
async function ponerEnMenus(page: Page, cont: Locator, fecha: string, hh: string, mm: string) {
  const campoFecha = cont.getByRole('combobox', { name: 'Select date' })
  const campoHora = cont.getByRole('combobox', { name: 'Select time' })
  const valor = async (campo: Locator) => (await campo.locator('.Picker__value').innerText()).trim()
  const [anio, mes, dia] = fecha.split('-').map(Number)
  await campoFecha.click()
  const cal = page.getByRole('dialog').filter({ has: page.locator('.DatePicker__panel') })
  for (let i = 0; i < 2 && (await cal.locator('.DatePicker__titleMonth').innerText()).trim() !== MESES[mes - 1]; i++) await cal.getByRole('button', { name: 'Next month' }).click()
  const boton = cal.locator('button.DatePicker__day[data-outside=false][data-disabled=false]', { hasText: new RegExp(`^${dia}$`) })
  if (!(await boton.count())) throw new Error(`TikTok todavía no deja programar para el ${fecha}.`)
  await boton.click()
  await page.waitForTimeout(500)

  // La rueda se anima: el campo cambia un momento después del clic.
  for (let i = 0; i < 3 && (await valor(campoHora)) !== `${hh}:${mm}`; i++) {
    await campoHora.click()
    const ruedas = page.getByRole('dialog').filter({ has: page.locator('.TimePicker__panel') })
    await ruedas.getByRole('option', { name: `Hours ${hh}`, exact: true }).click()
    await page.waitForTimeout(800)
    await ruedas.getByRole('option', { name: `Minutes ${mm}`, exact: true }).click()
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape') // cierra las ruedas
    await page.waitForTimeout(500)
  }
  const puesto = `${await valor(campoFecha)} ${await valor(campoHora)}`
  if (puesto !== `${dia} ${MESES3[mes - 1]} ${anio} ${hh}:${mm}`) throw new Error(`La hora no quedó: ${puesto}.`)
}

/** La página de siempre: dos campos, la hora (`14:30`) y la fecha (`2026-10-30`), con un calendario y dos listas. */
async function ponerEnCampos(page: Page, cont: Locator, fecha: string, hh: string, mm: string) {
  const [campoHora, campoFecha] = [cont.locator('input[readonly]').nth(0), cont.locator('input[readonly]').nth(1)]
  const [, mes, dia] = fecha.split('-').map(Number)
  await campoFecha.click()
  const cal = page.locator('.calendar-wrapper')
  for (let i = 0; i < 2 && (await cal.locator('.month-title').innerText()).trim() !== MESES[mes - 1]; i++) await cal.locator('[class*=arrow]').last().click()
  const boton = cal.locator('span.day.valid', { hasText: new RegExp(`^${dia}$`) })
  if (!(await boton.count())) throw new Error(`TikTok todavía no deja programar para el ${fecha}.`)
  await boton.click()
  await page.waitForTimeout(500)

  // La lista se anima: el campo cambia un momento después del clic.
  for (let i = 0; i < 3 && (await campoHora.inputValue()) !== `${hh}:${mm}`; i++) {
    await campoHora.click()
    await page.waitForTimeout(500)
    await page.locator('.tiktok-timepicker-left', { hasText: new RegExp(`^${hh}$`) }).click()
    await page.waitForTimeout(800)
    await page.locator('.tiktok-timepicker-right', { hasText: new RegExp(`^${mm}$`) }).click()
    await page.waitForTimeout(800)
    await page.mouse.click(400, 20) // cierra las listas: un clic en la franja vacía de arriba
    await page.waitForTimeout(500)
  }
  const puesto = `${await campoFecha.inputValue()} ${await campoHora.inputValue()}`
  if (puesto !== `${fecha} ${hh}:${mm}`) throw new Error(`La hora no quedó: ${puesto}.`)
}

/**
 * Pulsa «Programar». Si TikTok no ha terminado de revisar el video, pregunta «¿Seguir con la publicación?» con un botón
 * «Publicar ahora» que respeta la hora (probado el 2026-10-08): la revisión termina sola. Luego comprueba en la lista de
 * publicaciones que salga con su hora y no como ya publicado.
 */
async function confirmar(page: Page, texto: string, cuando: string) {
  const boton = page.locator('[data-e2e=post_video_button]')
  await page.waitForFunction(() => document.querySelector('[data-e2e=post_video_button]')?.getAttribute('aria-disabled') !== 'true', null, { timeout: 120000 })
  await boton.click()
  const seguir = page.getByRole('button', { name: 'Publicar ahora' })
  await Promise.race([page.waitForURL((u) => !u.href.includes('/upload'), { timeout: 30000 }), seguir.waitFor({ timeout: 30000 })]).catch(() => {})
  if (await seguir.isVisible().catch(() => false)) await seguir.click()
  await page.waitForURL((u) => !u.href.includes('/upload'), { timeout: 60000 }).catch(() => {
    throw new Error('TikTok no confirmó la programación.')
  })

  const [fecha, hora] = cuando.split(' ')
  const etiqueta = `${Number(fecha.slice(8))} ${MESES3[Number(fecha.slice(5, 7)) - 1]}, ${hora.padStart(5, '0')}`
  let fila = await buscar(page, texto, fecha)
  if (!fila?.includes(etiqueta)) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    fila = await buscar(page, texto, fecha)
  }
  if (!fila?.includes(etiqueta)) throw new Error(`En la lista de TikTok no sale programado para el ${etiqueta}.`)
}

/**
 * Busca un video en la lista de publicaciones por el principio de su texto y devuelve su fila, con su hora, o `null`. La
 * lista va de lo que sale más tarde a lo que salió antes y solo dibuja lo que se ve: se baja poco a poco, y se deja de
 * buscar al ver filas de antes del día `hasta` (`'2026-10-16'`) o al llegar al final. Antes solo se miraba lo de arriba,
 * y un video que llenaba un hueco de días antes salía como fallado aunque estuviera programado.
 */
async function buscar(page: Page, texto: string, hasta: string): Promise<string | null> {
  const inicio = texto.trim().replace(/\s+/g, ' ').slice(0, 40)
  await page.waitForFunction((re) => new RegExp(re).test(document.body.innerText), HORA.source, { timeout: 30000 }).catch(() => {})
  let ultima = ''
  for (let i = 0, quieto = 0; i < 150 && quieto < 4; i++) {
    const { fila, horas } = await page.evaluate(
      ({ inicio, re }) => {
        const filas = [...document.querySelectorAll<HTMLElement>('div')].filter((d) => d.innerText?.includes(inicio) && d.innerText.length < 400)
        const fila = filas.sort((a, b) => b.innerText.length - a.innerText.length)[0]?.innerText.replace(/\s+/g, ' ') ?? null
        return { fila, horas: [...document.body.innerText.matchAll(new RegExp(re, 'g'))].map((m) => m[0]) }
      },
      { inicio, re: HORA.source }
    )
    if (fila) return fila
    if (horas.some((h) => (horaDe(h) ?? hasta) < hasta)) return null
    // Si lo último que se ve no cambia al bajar, ya es el final.
    quieto = horas.at(-1) === ultima ? quieto + 1 : 0
    ultima = horas.at(-1) ?? ''
    await page.mouse.move(600, 600)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(900)
  }
  return null
}

/** La hora de una fila de la lista (`16 oct, 16:00`) como la guarda Sloth (`2026-10-16 16:00`). La lista no dice el año: el que la deja más cerca de hoy. */
function horaDe(fila: string): string | null {
  const m = HORA.exec(fila)
  if (!m) return null
  const mes = MESES3.indexOf(m[2]) + 1
  const hoy = new Date()
  const anio = hoy.getFullYear() + (mes - (hoy.getMonth() + 1) > 6 ? -1 : mes - (hoy.getMonth() + 1) < -6 ? 1 : 0)
  return `${anio}-${dos(mes)}-${dos(Number(m[1]))} ${m[3]}`
}

/** Hoy, como `'2026-10-11'`. */
const diaDeHoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

