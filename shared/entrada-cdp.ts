import { type EntradaNavegador, TECLAS_NAVEGADOR } from './types.ts'

/**
 * Lo que la web le hace a una página por CDP (ADR 0025): un clic, la rueda, texto o una tecla. Lo usan el navegador de
 * cada hilo (`electron/navegador.ts`, con el depurador de la ventana) y las ventanas de Edge que Sloth abre en la
 * computadora para entrar con Google (`server/ventanas-remotas.ts`, por su WebSocket). `escala`: con la página encogida
 * a su caja, Chromium toma los clics en píxeles de la caja.
 */

/** El código de cada tecla en Windows (`windowsVirtualKeyCode`), que Chromium necesita para Enter, borrar y las flechas. */
const CODIGOS: Record<(typeof TECLAS_NAVEGADOR)[number], number> = {
  Enter: 13,
  Backspace: 8,
  Tab: 9,
  Escape: 27,
  Delete: 46,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34
}

export async function entradaCdp(enviar: (metodo: string, params: Record<string, unknown>) => Promise<unknown>, e: EntradaNavegador, escala = 1) {
  const x = Number((e as { x?: number }).x) * escala
  const y = Number((e as { y?: number }).y) * escala
  if (e.tipo === 'clic' && Number.isFinite(x) && Number.isFinite(y)) {
    await enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  }
  if (e.tipo === 'rueda' && Number.isFinite(x) && Number.isFinite(y))
    await enviar('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: Number(e.dx) || 0, deltaY: Number(e.dy) || 0 })
  if (e.tipo === 'texto' && typeof e.texto === 'string' && e.texto) await enviar('Input.insertText', { text: e.texto.slice(0, 5000) })
  if (e.tipo === 'tecla' && (TECLAS_NAVEGADOR as readonly string[]).includes(e.tecla)) {
    const codigo = CODIGOS[e.tecla]
    const base = { key: e.tecla, code: e.tecla, windowsVirtualKeyCode: codigo, nativeVirtualKeyCode: codigo }
    await enviar('Input.dispatchKeyEvent', { type: e.tecla === 'Enter' ? 'keyDown' : 'rawKeyDown', ...base, ...(e.tecla === 'Enter' ? { text: '\r' } : {}) })
    await enviar('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  }
}
