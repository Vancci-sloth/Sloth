import assert from 'node:assert/strict'
import test from 'node:test'
import type { BrowserContext, Page } from 'playwright-core'
import { tiktok } from './redes/tiktok.ts'

/** Doble del editor: reproduce la selección de cada sistema sin abrir TikTok ni usar una cuenta real. */
function preparar(sistema: 'darwin' | 'win32' | 'linux', prellenado: string) {
  let texto = prellenado
  let cursor = texto.length
  let seleccionado = false
  let escrituras = 0
  let cerrada = false
  const teclas: string[] = []
  const cdp = {
    send: async (metodo: string) => metodo === 'Runtime.evaluate' ? { result: { objectId: 'archivo' } } : {},
    detach: async () => {}
  }
  const editor = {
    click: async () => { cursor = texto.length },
    innerText: async () => texto
  }
  const page = {
    goto: async () => {},
    url: () => 'https://www.tiktok.com/tiktokstudio/upload',
    addLocatorHandler: async () => {},
    removeLocatorHandler: async () => {},
    locator: (selector: string) => {
      if (selector === '.react-joyride__overlay') return {}
      if (selector === 'input[type=file]') return { first: () => ({ waitFor: async () => {} }) }
      if (selector === '[data-e2e=upload_status_container]') return { getByText: () => ({ waitFor: async () => {} }) }
      if (selector === '[data-e2e=caption_container] [contenteditable=true]') return editor
      // Llegar aquí prueba que programar aceptó el texto. No hace falta simular el calendario ni publicar.
      if (selector === '[data-e2e=schedule_container]') return { scrollIntoViewIfNeeded: async () => { throw new Error('Fin de la prueba del texto') } }
      throw new Error(`Selector inesperado: ${selector}`)
    },
    keyboard: {
      press: async (tecla: string) => {
        const resuelta = tecla.replace('ControlOrMeta', sistema === 'darwin' ? 'Meta' : 'Control')
        teclas.push(resuelta)
        if (resuelta === (sistema === 'darwin' ? 'Meta+A' : 'Control+A')) seleccionado = true
        else if (sistema === 'darwin' && resuelta === 'Control+A') cursor = 0
        else if (resuelta === 'Delete') {
          texto = seleccionado ? '' : texto.slice(0, cursor) + texto.slice(cursor + 1)
          if (seleccionado) cursor = 0
          seleccionado = false
        } else throw new Error(`Tecla inesperada: ${resuelta}`)
      },
      type: async (valor: string) => {
        escrituras++
        texto = texto.slice(0, cursor) + valor + texto.slice(cursor)
        cursor += valor.length
      }
    },
    waitForTimeout: async () => {},
    // Un hashtag nuevo no tiene sugerencia: se conserva como texto, igual que en TikTok.
    evaluate: async () => null,
    screenshot: async () => Buffer.from('captura de prueba'),
    context: () => ctx,
    close: async () => { cerrada = true }
  } as unknown as Page
  const ctx = {
    newPage: async () => page,
    pages: () => [page, page],
    newCDPSession: async () => cdp
  } as unknown as BrowserContext
  return {
    ejecutar: () => tiktok.programar(async () => ctx, {
      ruta: 'video-1109-1134.mp4', huella: 'prueba', texto: 'Una descripción nueva', tags: ['Prueba'],
      cuando: '2099-01-02 12:00', ref: 'prueba', reintento: false
    }),
    resultado: () => ({ texto, escrituras, cerrada, teclas })
  }
}

for (const sistema of ['darwin', 'win32', 'linux'] as const) {
  test(`reemplaza el nombre del archivo por el texto y sus hashtags en ${sistema}`, async () => {
    const f = preparar(sistema, 'video-1109-1134')
    await assert.rejects(f.ejecutar(), { message: 'Al poner la hora: Fin de la prueba del texto' })
    assert.deepEqual(f.resultado(), {
      texto: 'Una descripción nueva #Prueba ', escrituras: 4, cerrada: true,
      teclas: [sistema === 'darwin' ? 'Meta+A' : 'Control+A', 'Delete']
    })
  })
}

test('conserva la escritura del texto y sus hashtags cuando el editor está vacío', async () => {
  const f = preparar('darwin', '')
  await assert.rejects(f.ejecutar(), { message: 'Al poner la hora: Fin de la prueba del texto' })
  const { texto, escrituras, cerrada } = f.resultado()
  assert.deepEqual({ texto, escrituras, cerrada }, {
    texto: 'Una descripción nueva #Prueba ', escrituras: 4, cerrada: true
  })
})
