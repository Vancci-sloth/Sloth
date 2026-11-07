/**
 * La política del navegador integrado (`electron/navegador.ts`), en un archivo para poder cambiarla sin tocar el
 * navegador. Qué sitios puede abrir cada perfil, qué esquemas y descargas se bloquean siempre y qué acciones del agente
 * piden tu confirmación. Todo son funciones puras, que prueba `navegador-politica.test.ts`.
 */

/** Las particiones (perfiles) de Electron. */
export type Particion = 'persist:navegador' | 'persist:redes' | 'persist:voz'

export interface PoliticaPerfil {
  /** Si está, solo estos sitios (y sus subdominios) se abren como página; `null`, cualquiera. */
  sitios: string[] | null
}

/** Lo que cada perfil puede abrir. El del agente es libre; el de las redes y el de la voz, solo lo suyo. */
export const POLITICA: Record<Particion, PoliticaPerfil> = {
  'persist:navegador': { sitios: null },
  'persist:redes': { sitios: ['tiktok.com', 'instagram.com', 'youtube.com', 'google.com', 'facebook.com', 'meta.com'] },
  'persist:voz': { sitios: ['aistudio.google.com', 'accounts.google.com'] }
}

/** Esquemas que ninguna página de ningún perfil abre (la interfaz de Sloth es la ventana, no una página). */
export const ESQUEMAS_BLOQUEADOS = ['file:', 'chrome:', 'chrome-extension:', 'chrome-untrusted:', 'view-source:', 'javascript:']

/** Descargas que no se guardan: programas y scripts que se ejecutan con un doble clic. */
export const DESCARGAS_BLOQUEADAS = ['.exe', '.msi', '.bat', '.ps1', '.cmd', '.scr']

/** Lo que el agente no hace sin preguntarte: el texto de un botón que publica, paga, compra, borra o envía. */
export const ACCIONES_DE_RIESGO = /publicar|pagar|comprar|borrar|eliminar|enviar|post|pay|buy|delete|submit/i

/** ¿`host` es `sitio` o un subdominio suyo? */
export const delSitio = (host: string, sitio: string) => host === sitio || host.endsWith(`.${sitio}`)

export interface Veredicto {
  ok: boolean
  motivo?: string
}

/** ¿Puede la página de este perfil ir a esta dirección? `about:blank` y `data:` de la propia página siempre. */
export function urlPermitida(particion: string, url: string, politica: Record<string, PoliticaPerfil> = POLITICA): Veredicto {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { ok: false, motivo: 'La dirección no es válida.' }
  }
  // Lo que una página se arma sola (un WAV de AI Studio es un blob:) no es una dirección que se pueda elegir.
  if (u.protocol === 'blob:' || u.protocol === 'data:') return { ok: true }
  if (u.protocol === 'about:') return u.pathname === 'blank' ? { ok: true } : { ok: false, motivo: 'about: no se abre.' }
  if (ESQUEMAS_BLOQUEADOS.includes(u.protocol)) return { ok: false, motivo: `${u.protocol} no se abre en el navegador de Sloth.` }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, motivo: `${u.protocol} no se abre en el navegador de Sloth.` }
  const sitios = politica[particion]?.sitios
  if (!sitios) return { ok: true }
  const host = u.hostname.toLowerCase()
  return sitios.some((s) => delSitio(host, s)) ? { ok: true } : { ok: false, motivo: `${host} no está entre los sitios de este perfil.` }
}

/** ¿Es un archivo que se ejecuta? Por su nombre, sin mirar mayúsculas ni lo que venga tras un `?`. */
export function descargaPeligrosa(nombre: string): boolean {
  const limpio = nombre.split(/[?#]/)[0].trim().toLowerCase().replace(/[. ]+$/, '')
  return DESCARGAS_BLOQUEADAS.some((e) => limpio.endsWith(e))
}

/** ¿El texto de un botón pide confirmación? */
export const accionDeRiesgo = (texto: string) => ACCIONES_DE_RIESGO.test(texto)
