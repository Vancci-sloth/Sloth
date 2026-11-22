/**
 * Tu Sloth en otra computadora (ADR 0020): cada Sloth con clave guarda aquí una copia de lo suyo (sus estilos, sus chats,
 * «Sobre ti» y sus marcas; qué entra lo dice `server/respaldo.ts`) y, al escribir la clave en otra computadora, esa
 * ofrece traerla. Una copia por clave y computadora: el paquete en R2 (`DESCARGAS`, bajo `respaldos/`) y su ficha en D1
 * (`respaldos`, migración 0031).
 *
 * Entra una clave activa en una computadora que la usa (`x-sloth-clave` y `x-sloth-equipo`, como en la comunidad). Las
 * claves de un mismo correo (su cuenta gratis y la de su apoyo) ven las mismas copias.
 * - `GET /respaldo`: las copias de esa persona; `esta` dice cuál es la de quien pregunta.
 * - `PUT /respaldo?nombre=<computadora>&resumen=<json>`, con el paquete de cuerpo: guarda la de esta computadora, encima
 *   de la anterior.
 * - `GET /respaldo/<equipo>`: el paquete de esa computadora.
 * - `DELETE /respaldo`: borra la de esta computadora (quien apaga la copia en Opciones).
 *
 * No tiene que costar: R2 da gratis 10 GB y un millón de escrituras al mes, y ahí viven también los instaladores y lo de
 * la comunidad. Por eso cada copia pesa hasta `PESO_RESPALDO`, todas juntas hasta `TOTAL` (con eso lleno, las nuevas
 * esperan a que se libere sitio), cada computadora sube una cada `CADA` como mucho, y la que nadie renueva en `CADUCA`
 * se borra (`olvidarRespaldos`, cada mañana; la app la renueva al mes aunque nada haya cambiado).
 */
import { PESO_RESPALDO, resumenLimpio, type RespaldoNube } from '../../shared/respaldo.ts'
import { DE_LA_APP } from './comunidad.ts'
import { guardado } from './guardado.ts'
import { CLAVE, type Env, type Fila, json, Rechazo, servir, vigencia } from './index.ts'

const DIA = 24 * 3600_000
/** Todas las copias juntas. Bajo lo gratis de R2 con sitio para lo demás: súbelo solo si R2 pasa a ser de pago. */
export const TOTAL = 5 * 1024 ** 3
/** Lo menos que pasa entre dos copias de la misma computadora. */
export const CADA = 30 * 60_000
/** Sin renovarse en esto, una copia se borra. */
export const CADUCA = 90 * DIA

interface Ficha {
  clave: string
  equipo: string
  nombre: string
  bytes: number
  resumen: string
  guardado: string
}

/** Dónde va el paquete en R2. */
export const llaveDe = (clave: string, equipo: string) => `respaldos/${clave}/${equipo}`

/** Si cabe una copia de `bytes` cuando las demás ocupan `otras`. */
export const cabe = (otras: number, bytes: number, total = TOTAL) => bytes > 0 && bytes <= PESO_RESPALDO && otras + bytes <= total

/**
 * Las fichas como las ve la app: una por computadora (si cambió de clave, la más nueva), de la más nueva a la más vieja.
 * Un resumen que no se puede leer cuenta como vacío.
 */
export function listar(fichas: Ficha[], equipo: string): RespaldoNube[] {
  const por = new Map<string, Ficha>()
  for (const f of fichas) if (!por.has(f.equipo) || por.get(f.equipo)!.guardado < f.guardado) por.set(f.equipo, f)
  return [...por.values()]
    .sort((a, b) => b.guardado.localeCompare(a.guardado))
    .map((f) => {
      let resumen: unknown
      try {
        resumen = JSON.parse(f.resumen)
      } catch {}
      return { equipo: f.equipo, nombre: f.nombre, bytes: f.bytes, guardado: f.guardado, esta: f.equipo === equipo, ...resumenLimpio(resumen) }
    })
}

/** Quién pide: su clave, activa, en una computadora que la usa. No lo hace miembro de la comunidad. */
async function quien(req: Request, env: Env, ahora: number): Promise<{ clave: string; equipo: string }> {
  const clave = (req.headers.get('x-sloth-clave') ?? '').replace(/\s+/g, '').toUpperCase()
  const equipo = req.headers.get('x-sloth-equipo') ?? ''
  const fila =
    CLAVE.test(clave) && DE_LA_APP.test(equipo)
      ? await env.DB.prepare(
          "SELECT l.estado, l.pagado_hasta, EXISTS (SELECT 1 FROM licencias v WHERE v.email = l.email AND v.estado = 'vetada') AS vetada FROM licencias l JOIN equipos e ON e.clave = l.clave WHERE l.clave = ? AND e.equipo = ?"
        )
          .bind(clave, equipo)
          .first<Pick<Fila, 'estado' | 'pagado_hasta'> & { vetada: number }>()
      : null
  if (!fila || fila.vetada || !vigencia(fila, ahora).activa) throw new Rechazo(401, 'Para guardar tu Sloth y traerlo a otra computadora, entra con tu clave de Sloth.')
  return { clave, equipo }
}

/** Las fichas de la persona de esa clave: las de todas las claves de su correo. */
async function fichasDe(env: Env, clave: string): Promise<Ficha[]> {
  const { results } = await env.DB.prepare('SELECT r.* FROM respaldos r JOIN licencias l ON l.clave = r.clave WHERE l.email = (SELECT email FROM licencias WHERE clave = ?)')
    .bind(clave)
    .all<Ficha>()
  return results
}

export async function respaldo(req: Request, env: Env, url: URL): Promise<Response> {
  const ahora = Date.now()
  const yo = await quien(req, env, ahora)
  const de = /^\/respaldo\/([\w-]{8,64})$/.exec(url.pathname)?.[1]

  if (req.method === 'GET' && url.pathname === '/respaldo') return json({ respaldos: listar(await fichasDe(env, yo.clave), yo.equipo) })

  if (req.method === 'GET' && de) {
    const f = (await fichasDe(env, yo.clave)).filter((x) => x.equipo === de).sort((a, b) => b.guardado.localeCompare(a.guardado))[0]
    if (!f) throw new Rechazo(404, 'Esa copia ya no está.')
    return servir(req, env, llaveDe(f.clave, f.equipo), f.bytes, { 'cache-control': 'private, no-store' })
  }

  if (req.method === 'PUT' && url.pathname === '/respaldo') {
    const bytes = Number(req.headers.get('content-length'))
    if (!req.body || !bytes) throw new Rechazo(411, 'Falta la copia.')
    if (bytes > PESO_RESPALDO) throw new Rechazo(413, `La copia pesa más de ${PESO_RESPALDO / 1024 ** 2} MB.`)
    const previa = await env.DB.prepare('SELECT guardado, bytes FROM respaldos WHERE clave = ? AND equipo = ?').bind(yo.clave, yo.equipo).first<Pick<Ficha, 'guardado' | 'bytes'>>()
    if (previa && ahora - Date.parse(previa.guardado) < CADA) throw new Rechazo(429, 'Tu copia se guardó hace un momento. La siguiente va en un rato.')
    // Lo que pesan todas recorre la tabla entera: se lee guardado (`guardado.ts`), que para un tope de sobra alcanza.
    const todas = await guardado(env, 'respaldos', async () => (await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM respaldos').first<{ n: number }>())?.n ?? 0)
    if (!cabe(Math.max(0, todas - (previa?.bytes ?? 0)), bytes)) throw new Rechazo(507, 'Por ahora no hay sitio para más copias en la nube de Sloth. Se vuelve a intentar sola.')
    let resumen: unknown
    try {
      resumen = JSON.parse(url.searchParams.get('resumen') ?? '{}')
    } catch {}
    const guardada = await env.DESCARGAS.put(llaveDe(yo.clave, yo.equipo), req.body, { httpMetadata: { contentType: 'application/octet-stream' } })
    const cuando = new Date(ahora).toISOString()
    await env.DB.prepare(
      'INSERT INTO respaldos (clave, equipo, nombre, bytes, resumen, guardado) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (clave, equipo) DO UPDATE SET nombre = excluded.nombre, bytes = excluded.bytes, resumen = excluded.resumen, guardado = excluded.guardado'
    )
      .bind(yo.clave, yo.equipo, (url.searchParams.get('nombre') ?? '').trim().slice(0, 60), guardada.size, JSON.stringify(resumenLimpio(resumen)), cuando)
      .run()
    return json({ guardado: cuando })
  }

  if (req.method === 'DELETE' && url.pathname === '/respaldo') {
    await env.DESCARGAS.delete(llaveDe(yo.clave, yo.equipo))
    await env.DB.prepare('DELETE FROM respaldos WHERE clave = ? AND equipo = ?').bind(yo.clave, yo.equipo).run()
    return json({ ok: true })
  }

  throw new Rechazo(404, 'No existe')
}

/** Cada mañana: las copias que nadie renovó en `CADUCA` se borran, con su ficha. */
export async function olvidarRespaldos(env: Env, ahora = Date.now()) {
  const { results } = await env.DB.prepare('SELECT clave, equipo FROM respaldos WHERE guardado < ?')
    .bind(new Date(ahora - CADUCA).toISOString())
    .all<Pick<Ficha, 'clave' | 'equipo'>>()
  // R2 borra hasta mil de una vez.
  for (let i = 0; i < results.length; i += 1000) await env.DESCARGAS.delete(results.slice(i, i + 1000).map((f) => llaveDe(f.clave, f.equipo)))
  if (results.length) await env.DB.prepare('DELETE FROM respaldos WHERE guardado < ?').bind(new Date(ahora - CADUCA).toISOString()).run()
}
