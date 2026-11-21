/**
 * Sloth en la nube (ADR 0026): la misma Sloth de Linux corriendo en un Codespace de GitHub de cada quien
 * (`.devcontainer/`), sin su computadora. `.devcontainer/sloth-nube.sh` la arranca con `SLOTH_NUBE`, la dirección que
 * GitHub le da al puerto de Sloth (`<codespace>-4848.app.github.dev`). Esa dirección es privada: GitHub solo deja
 * pasar a quien es dueño del Codespace, con su sesión de GitHub. Por eso aquí se atiende como a la propia ventana, con
 * las mismas reglas contra otros sitios (su `Origin` y `Sec-Fetch-Site`).
 *
 * Todo lo que en la computadora abriría algo en su pantalla (una terminal para iniciar sesión, un Edge de Google) va
 * como desde la web (`remoto`): ahí no hay nadie que vea esa pantalla.
 */
import type { IncomingMessage } from 'node:http'

/** La dirección pública de esta Sloth en la nube, o `null` en una computadora. */
export const NUBE = nubeDe(process.env.SLOTH_NUBE)

/** Solo un nombre de host (letras, números, guiones y puntos, y si acaso su puerto), sin esquema ni ruta. */
export function nubeDe(valor: string | undefined): string | null {
  const v = valor?.trim().toLowerCase()
  return v && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/.test(v) ? v : null
}

/** Si la petición llega por la dirección de la nube, de la propia página de Sloth (no de otro sitio). */
export function deLaNube(req: Pick<IncomingMessage, 'headers'>, host: string | null = NUBE): boolean {
  // GitHub la pasa con su `Host`; un proxy que la reescriba, en `X-Forwarded-Host`.
  if (!host || (req.headers.host !== host && req.headers['x-forwarded-host'] !== host)) return false
  const origen = req.headers.origin
  if (origen && origen !== `https://${host}`) return false
  const sitio = req.headers['sec-fetch-site']
  return !sitio || sitio === 'same-origin' || sitio === 'none'
}
