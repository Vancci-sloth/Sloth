/**
 * El candado de la app del celular (`movil/src/candado.ts`, ADR 0025). Al abrir y cada pocas horas, la app pregunta
 * `POST /celular` con el identificador del teléfono (`equipo`) y, si la tiene, una clave de Sloth: la que se escribió en
 * el celular o la que trajo de la computadora. El creador entra con su llave (`authorization`).
 *
 * Con `CELULAR_SOLO_APOYO` en `"1"` (`licencias/wrangler.jsonc`), la app solo abre a quien apoya hoy (`apoyaHoy`) o al
 * creador; si no, abre para todos. Se cambia ahí y con un deploy, sin sacar otra versión de la app.
 *
 * Los celulares de cada clave se cuentan aparte de las computadoras (`celulares`, migración 0037): `CELULARES` como
 * mucho. La respuesta no va firmada: la app la guarda en el llavero del teléfono y, sin internet, vale hasta `hasta`.
 */
import { apoyaHoy, delCreador, EQUIPO, json, porClave, Rechazo, recordarEquipo, type Env } from './index.ts'

const DIA = 24 * 3600_000
export const CELULARES = 2
/** Sin internet, lo último que se supo vale esto. */
const SIN_CONEXION = 7 * DIA

export async function celular(req: Request, env: Env, c: Record<string, unknown>): Promise<Response> {
  const cobra = env.CELULAR_SOLO_APOYO === '1'
  const ahora = Date.now()
  const hasta = new Date(ahora + SIN_CONEXION).toISOString()
  if (delCreador(req, env)) return json({ cobra, apoya: true, hasta })
  const equipo = String(c.equipo ?? '')
  if (!EQUIPO.test(equipo)) throw new Rechazo(400, 'Falta el identificador de este celular.')
  // Apagado, abre aunque la clave guardada ya no sirva: un error dejaría al celular con lo que supo antes.
  if (!cobra || !c.clave) return json({ cobra, hasta })
  const fila = await porClave(env, c.clave)
  if (!(await recordarEquipo(env, fila.clave, equipo, ahora, 'celulares', CELULARES)))
    throw new Rechazo(409, `Esta clave ya se usa en ${CELULARES} celulares. Si cambiaste de celular, escríbenos a soporte@vancci.org y la liberamos.`)
  return json({ cobra, apoya: await apoyaHoy(env, fila.email), email: fila.email, hasta })
}
