import type { IncomingMessage } from 'node:http'

/**
 * Solo admite la ventana de Sloth y los scripts locales. Host corta el DNS rebinding; Sec-Fetch-Site y Origin impiden
 * que otra página use la API o abra el WebSocket. Google puede volver solo a YouTube OAuth como navegación de documento:
 * ese adaptador comprueba además el state único y PKCE antes de guardar una cuenta o sus permisos.
 */
export function peticionDeConfianza(req: Pick<IncomingMessage, 'headers' | 'method' | 'url'>, puerto: number | string): boolean {
  const propios = [`localhost:${puerto}`, `127.0.0.1:${puerto}`]
  if (!propios.includes(req.headers.host ?? '')) return false
  const origen = req.headers.origin
  const propio = !origen || propios.some((p) => origen === `http://${p}`)
  const retornoYoutube = req.method === 'GET'
    && req.url?.split('?')[0] === '/api/youtube/oauth'
    && req.headers['sec-fetch-mode'] === 'navigate'
    && req.headers['sec-fetch-dest'] === 'document'
  if (retornoYoutube && (propio || origen === 'https://accounts.google.com')) return true
  // La vista en vivo del estudio (el motor o la de la skill) se abre desde la otra dirección de esta computadora
  // (`127.0.0.1` si la ventana es `localhost`): para el navegador es otro sitio y la carga en su propio proceso, sin
  // frenar la interfaz (web/src/Monitor.tsx). Solo como marco de la ventana de Sloth: lo dice su `Referer`.
  const marcoPropio = req.method === 'GET'
    && /^\/api\/sessions\/[\w-]+\/(motor|vivo)(\/|\?|$)/.test(req.url ?? '')
    && req.headers['sec-fetch-dest'] === 'iframe'
    && propios.some((p) => (req.headers.referer ?? '').startsWith(`http://${p}/`))
  if (marcoPropio) return true
  const sitio = req.headers['sec-fetch-site']
  if (sitio && sitio !== 'same-origin' && sitio !== 'none') return false
  return propio
}
