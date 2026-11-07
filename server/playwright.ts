import type { Browser } from 'playwright-core'

/**
 * Se conecta por CDP a un navegador. Playwright se carga aquí, la primera vez que hace falta: importarlo al arrancar
 * costaba casi 400 ms de cada apertura de Sloth, aunque ese día no se publicara ni se generara ninguna voz.
 */
export async function conectarCDP(direccion: string): Promise<Browser> {
  // Puerto 0 (o sin puerto): el navegador no llegó a arrancar o ya se cerró. Node lo cambiaría por el 80 y el error
  // diría `ECONNREFUSED 127.0.0.1:80`, que no ayuda a nadie.
  if (/^(https?|wss?):\/\/[^/]+:0(\/|$)/.test(direccion) || /^https?:\/\/127\.0\.0\.1\/?$/.test(direccion))
    throw new Error('El navegador (Chrome o Edge) no arrancó o se cerró antes de tiempo. Ciérralo si lo tienes abierto con el perfil de Sloth y vuelve a intentarlo.')
  const { chromium } = await import('playwright-core')
  return chromium.connectOverCDP(direccion)
}
