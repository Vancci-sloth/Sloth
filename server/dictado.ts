/**
 * El dictado del compositor (`web/src/Dictado.tsx`): el micrófono graba hasta un minuto y Deepgram (Nova-3, en español)
 * lo pasa a texto, que entra al campo para revisarlo antes de mandarlo. Es para quien apoya a Sloth: el audio va del
 * navegador a este servidor, de aquí al cobro (`licencias/src/dictado.ts`), que tiene las llaves de Deepgram de Sloth, y
 * de ahí a Deepgram; en vivo, por el WebSocket de `dictado-vivo.ts`. No se guarda en disco ni en el cobro.
 *
 * `GET /api/dictado` le pregunta al cobro si puedes dictar (`{disponible, minutos}`, los que te quedan hoy); si no, el
 * botón no sale. Con la cuenta de esta computadora, o con la llave del creador en la suya.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { json } from './http.ts'
import { COBRO } from '../shared/cobro.ts'
import type { Credencial } from './comunidad.ts'

/** Con qué se habla al cobro. */
export type CredencialDictado = () => Credencial | undefined | Promise<Credencial | undefined>

export const NUBE = process.env.SLOTH_COBRO || COBRO
export const cabecerasDe = (c: Credencial): Record<string, string> =>
  'llave' in c ? { authorization: `Bearer ${c.llave}` } : { 'x-sloth-clave': c.clave, 'x-sloth-equipo': c.equipo }

export async function dictado(credencial: CredencialDictado, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'El dictado va por /api/dictado/vivo.' })
  try {
    const c = await credencial()
    if (!c) return json(res, 200, { disponible: false })
    const r = await fetch(`${NUBE}/dictado`, { headers: cabecerasDe(c), signal: AbortSignal.timeout(8000) })
    const d = (await r.json()) as { disponible?: boolean; minutos?: number | null }
    return json(res, 200, r.ok && d.disponible ? { disponible: true, minutos: d.minutos ?? null } : { disponible: false })
  } catch {
    // Sin internet o sin cobro, el botón no sale; no es un error que enseñar.
    return json(res, 200, { disponible: false })
  }
}
