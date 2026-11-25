/**
 * Los avisos por correo a quienes apoyan hoy o tienen un lugar gratis de por vida, uno por persona: los términos piden
 * avisarles 30 días antes de un cambio. `POST /aviso-correo` `{aviso, probar?, prueba?, limite?}`, solo del creador
 * (`node scripts/aviso-correo.mjs <aviso>`):
 * - `probar`: a quiénes les falta, sin mandar nada.
 * - `prueba`: lo manda solo a ese correo (o, con `true`, a soporte), sin anotarlo, para verlo antes.
 * - si no, se lo manda a los siguientes `limite` y anota cada uno en `avisos_correo` (migración 0039): repetirlo sigue
 *   donde se quedó y nadie lo recibe dos veces (Resend tampoco, por su llave de idempotencia).
 * El texto de cada aviso vive aquí, en `AVISOS`, con su id; uno nuevo es otra entrada.
 */
import { correo, cuerpo, delCreador, json, Rechazo, type Env } from './index.ts'

export const AVISOS: Record<string, { asunto: string; parrafos: string[] }> = {
  'terminos-2026-11-24': {
    asunto: 'Actualizamos los términos y el aviso de privacidad de Sloth',
    parrafos: [
      'Hola:',
      'Actualizamos los términos y condiciones y el aviso de privacidad de Sloth para que digan lo que Sloth hace hoy: las trece IA con que funciona (ya no hace falta Claude Pro o Max), sus ocho estilos, que su código es abierto con licencia MIT, el dictado por voz (tu audio pasa por nuestro servidor hacia Deepgram, que lo convierte en texto, y nadie lo guarda), Sloth en la web y en la nube, y que ya no aceptamos pagos con PayPal.',
      'Tu precio y tus beneficios no cambian. Los cambios aplican desde el 24 de diciembre de 2026. Si no estás de acuerdo, puedes cancelar tu apoyo sin penalización desde Sloth (Opciones, Apoyo, «Cancelar apoyo») y te devolvemos la parte no usada de lo que pagaste.',
      'Léelos en sloth.vancci.org/terminos y sloth.vancci.org/privacidad. Si tienes dudas, responde a este correo.',
      'Gracias por apoyar a Sloth.'
    ]
  }
}

/**
 * A quiénes les llega: un apoyo de producción pagado y sin vencer (también el que ya canceló y sigue en su periodo), o un
 * lugar gratis de por vida. Las rifas dan apoyos con un correo de Sloth: no son de nadie.
 */
export const DESTINATARIOS = `SELECT DISTINCT lower(email) AS email FROM licencias
  WHERE modo = 'produccion' AND email IS NOT NULL AND email NOT LIKE '%@sloth.vancci.org'
    AND ((plan IN ('mensual', 'anual', 'unico') AND autorizada IS NOT NULL AND julianday(pagado_hasta) > julianday('now'))
      OR (plan = 'gratis' AND estado = 'gratis'))`

/** A quiénes les falta el aviso `aviso`, en orden. */
export async function faltan(env: Pick<Env, 'DB'>, aviso: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT email FROM (${DESTINATARIOS}) WHERE email NOT IN (SELECT email FROM avisos_correo WHERE aviso = ?) ORDER BY email`
  )
    .bind(aviso)
    .all<{ email: string }>()
  return results.map((r) => r.email)
}

export async function avisoCorreo(req: Request, env: Env): Promise<Response> {
  if (!delCreador(req, env)) throw new Rechazo(401, 'No autorizado.')
  const c = await cuerpo(req)
  const id = String(c.aviso ?? '')
  const aviso = AVISOS[id]
  if (!aviso) throw new Rechazo(400, `No hay aviso «${id}». Los que hay: ${Object.keys(AVISOS).join(', ')}.`)
  if (c.prueba) {
    // A soporte llega con su forma de correo interno (sin firma ni «respóndeme»); a otro correo, como lo verá cada quien.
    const para = typeof c.prueba === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.prueba) ? c.prueba : env.CORREO_RESPUESTA
    const salio = await correo(env, para, `[Prueba] ${aviso.asunto}`, aviso.parrafos)
    return json({ prueba: para, salio })
  }
  const pendientes = await faltan(env, id)
  if (c.probar === true) return json({ quedan: pendientes.length, emails: pendientes })
  const limite = Math.min(20, Math.max(1, Number(c.limite) || 10))
  const hechos: { email: string; salio: boolean; error?: string }[] = []
  for (const email of pendientes.slice(0, limite)) {
    try {
      const salio = await correo(env, email, aviso.asunto, aviso.parrafos, `aviso-${id}-${email}`)
      if (salio) await env.DB.prepare('INSERT OR IGNORE INTO avisos_correo (aviso, email, enviado) VALUES (?, ?, ?)').bind(id, email, new Date().toISOString()).run()
      hechos.push({ email, salio })
    } catch (e) {
      hechos.push({ email, salio: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return json({ quedan: pendientes.length - hechos.filter((h) => h.salio).length, hechos })
}
