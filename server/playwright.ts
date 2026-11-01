import type { Browser } from 'playwright-core'

/**
 * Se conecta por CDP a un navegador. Playwright se carga aquí, la primera vez que hace falta: importarlo al arrancar
 * costaba casi 400 ms de cada apertura de Sloth, aunque ese día no se publicara ni se generara ninguna voz.
 */
export async function conectarCDP(direccion: string): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  return chromium.connectOverCDP(direccion)
}
