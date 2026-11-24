import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from 'playwright-core'
import { chromiumDelSistema } from './chromium.ts'
import { buscar } from './redes/tiktok.ts'

const MESES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const dos = (n: number) => String(n).padStart(2, '0')

/**
 * Una fila como la de TikTok Studio → Publicaciones desde nov-2026: el texto del video, la hora con su zona
 * («21 nov, 12:00 (GMT-5) Lima»), la privacidad y sus números, en nodos hermanos. Con un texto largo pasa de 400
 * caracteres, el tope de antes: Sloth solo veía el título, sin la hora, y daba por fallado lo que sí quedó programado.
 */
function fila(texto: string, etiqueta: string) {
  return `<div class="fila"><div class="titulo"><div>${texto}</div></div><div class="hora">${etiqueta} (GMT-5) Lima</div>
    <div class="privacidad">Todos pueden ver esta publicación · Programado</div><div>0 visualizaciones 0 me gusta 0 comentarios</div>
    <div>Editar · Ver estadísticas · Más opciones · Descargar · Eliminar · Configuración de privacidad</div></div>`
}

const exe = chromiumDelSistema(false)
test('buscar: encuentra la fila con su hora aunque TikTok le meta la zona y la privacidad', { skip: exe ? false : 'no hay Chromium en esta máquina', timeout: 60_000 }, async () => {
  const b = await chromium.launch({ executablePath: exe, headless: true })
  try {
    const page = await b.newPage()
    const d = new Date(Date.now() + 2 * 86_400_000)
    const fecha = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
    const etiqueta = `${d.getDate()} ${MESES3[d.getMonth()]}, 12:00`
    const otra = `${d.getDate()} ${MESES3[d.getMonth()]}, 13:00`
    const largo = `Así se cuela el agua en tu cafetera y nadie te lo dijo. ${'Muele al momento, usa agua filtrada y mide bien. '.repeat(8)}#cafe #barista #cafeteria #mexico #fyp`
    assert.ok(largo.length > 400)
    await page.setContent(`<div id="lista">${fila('Otro video que no es este, con su propio texto #otro', otra)}${fila(largo, etiqueta)}</div>`)
    const encontrada = await buscar(page, largo, fecha)
    assert.ok(encontrada, 'debe encontrar la fila del video')
    assert.ok(encontrada.includes(etiqueta), `la fila debe traer su hora: ${encontrada}`)
    assert.ok(!encontrada.includes(otra), 'no debe confundirla con la fila de otro video')
  } finally {
    await b.close()
  }
})
