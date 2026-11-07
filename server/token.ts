import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import { guardar } from './disco.ts'

/**
 * El token del servidor local: 32 bytes al azar en `data/servidor-token`, creado al arrancar si no existe. Con
 * `SLOTH_EXIGIR_TOKEN=1` se pide en todas las rutas `/api` y en `/ws`, además de lo que ya mira `origen.ts` (Host, Origin,
 * Sec-Fetch-Site): un programa de esta computadora que no es Sloth (otro usuario, una extensión, un script) ya no puede
 * lanzar agentes ni leer los hilos solo por conocer el puerto. Sin la variable, el token se crea y se reparte igual,
 * pero no se exige: así se puede encender sin que nada se rompa.
 * - La ventana (Electron, o el navegador) lo recibe en una cookie HttpOnly y SameSite=Strict, que el servidor pone al
 *   servir la página de la app (`pideLaPagina`); el JavaScript de la página no lo ve. Lleva el puerto en el nombre: la
 *   Sloth instalada y la del repo abiertas en el mismo navegador no se pisan la cookie.
 * - Lo que llama al servidor desde fuera del navegador (los MCP de la voz y de Flow, los scripts de las skills,
 *   scripts/start.mjs y scripts/redes.ts, el proceso principal de Electron) lo manda en la cabecera `x-sloth-token`, y lo
 *   recibe en la variable `SLOTH_TOKEN` junto a `SLOTH_URL`, o lo lee de `data/servidor-token`.
 * Exentas (`exentaDeToken`): la vuelta de Google a YouTube OAuth, que llega de otro sitio (la cookie Strict no viaja) y se
 * comprueba con su state y PKCE; y la vista en vivo del estudio (motor/vivo), solo GET y solo cargada como marco o
 * recurso desde la otra dirección de esta computadora (127.0.0.1), que no lleva la cookie de localhost.
 */
export const CABECERA_TOKEN = 'x-sloth-token'
export const cookieDe = (puerto: number | string) => `sloth_token_${puerto}`

/** Si el servidor exige el token. Apagado por omisión. */
export const exigirToken = () => process.env.SLOTH_EXIGIR_TOKEN === '1'

export function tokenDelServidor(archivo: string): string {
  if (existsSync(archivo)) {
    const t = readFileSync(archivo, 'utf8').trim()
    if (/^[\w-]{43,}$/.test(t)) return t
  }
  mkdirSync(dirname(archivo), { recursive: true })
  const t = randomBytes(32).toString('base64url')
  guardar(archivo, t)
  if (process.platform !== 'win32') chmodSync(archivo, 0o600)
  return t
}

/** El token que trae la petición: en la cabecera o en la cookie de ese puerto. */
export function tokenDe(req: Pick<IncomingMessage, 'headers'>, puerto: number | string): string | undefined {
  const cabecera = req.headers[CABECERA_TOKEN]
  if (typeof cabecera === 'string' && cabecera) return cabecera
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = parte.trim().split('=')
    if (k === cookieDe(puerto)) return v.join('=')
  }
  return undefined
}

export function tokenValido(req: Pick<IncomingMessage, 'headers'>, token: string, puerto: number | string): boolean {
  const dado = tokenDe(req, puerto)
  if (!dado) return false
  const a = Buffer.from(dado)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Las rutas que no llevan token (ver la cabecera). Se piden además de `peticionDeConfianza`. */
export function exentaDeToken(req: Pick<IncomingMessage, 'headers' | 'method' | 'url'>): boolean {
  if (req.method !== 'GET') return false
  const ruta = req.url?.split('?')[0] ?? ''
  const navegacion = req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document'
  if (ruta === '/api/youtube/oauth' && navegacion) return true
  // El marco mismo, o lo que carga ese marco desde su propia dirección.
  const delMarco = req.headers['sec-fetch-dest'] === 'iframe' || req.headers['sec-fetch-site'] === 'same-origin'
  return /^\/api\/sessions\/[\w-]+\/(motor|vivo)(\/|$)/.test(ruta) && delMarco
}

/** Si a esta petición se le da la cookie: una navegación del navegador a la página de la app (no a la API). */
export const pideLaPagina = (req: Pick<IncomingMessage, 'headers' | 'method' | 'url'>) =>
  req.method === 'GET' && !req.url?.startsWith('/api/') && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document'

export const cookieDelToken = (token: string, puerto: number | string) => `${cookieDe(puerto)}=${token}; HttpOnly; SameSite=Strict; Path=/`
