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
import { apoyaHoy, delCreador, EQUIPO, json, porClave, Rechazo, type Env } from './index.ts'

const DIA = 24 * 3600_000
export const CELULARES = 2
/** Un celular que no pregunta en esto deja de contar. */
const VISTO = 30 * DIA
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
  const otros = await env.DB.prepare('SELECT COUNT(*) AS n FROM celulares WHERE clave = ? AND equipo != ? AND visto > ?')
    .bind(fila.clave, equipo, new Date(ahora - VISTO).toISOString())
    .first<{ n: number }>()
  if ((otros?.n ?? 0) >= CELULARES)
    throw new Rechazo(409, `Esta clave ya se usa en ${CELULARES} celulares. Si cambiaste de celular, escríbenos a soporte@vancci.org y la liberamos.`)
  await env.DB.prepare('INSERT INTO celulares (clave, equipo, visto) VALUES (?, ?, ?) ON CONFLICT (clave, equipo) DO UPDATE SET visto = excluded.visto')
    .bind(fila.clave, equipo, new Date(ahora).toISOString())
    .run()
  return json({ cobra, apoya: await apoyaHoy(env, fila.email), email: fila.email, hasta })
}
