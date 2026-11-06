/**
 * La voz de Voices Cloning (https://www.voicescloning.art), el proveedor de voz de Sloth. Sloth es su socio: tiene un
 * saldo general, que el creador recarga pagándoles, y cada quien es un usuario suyo con sus propios créditos. Asignar
 * créditos no gasta el saldo; solo lo gasta generar.
 *
 * La llave del socio (`VOICES_PK_LIVE`, secreto) solo vive aquí: la app corre en la computadora de cada quien y no puede
 * guardarla. Aquí se sabe quién pide, como en la comunidad (`x-sloth-clave` y `x-sloth-equipo` de una cuenta o un apoyo
 * activos, o el creador con `PUBLICAR`), y se le pone su `X-Partner-User`, que nadie más puede elegir. Ese
 * `external_id` es el `id` de la primera licencia de su correo, así que su cuenta gratis y su apoyo son el mismo usuario
 * y el correo no sale de aquí; el del creador es `creador`.
 *
 * Para la app (`server/voz/voices-cloning.ts`):
 * - `GET /voz`: si se puede usar y cuántos créditos te quedan.
 * - `POST /voz/sesion`: te da de alta (con `VOZ_CREDITOS` la primera vez) y pide el pase de la ventana de voces, que
 *   dura una hora y solo sirve para ti.
 * - `POST /voz/tts` `{text, voice_id, speed?}`: un trozo de hasta 5.000 letras. Da `audio_url` (MP3) y los créditos que
 *   gastó y te quedan. Si tarda de más responde 504 con un `task_id`, sin cobrar.
 * - `GET /voz/tareas/<id>`: esa tarea; 202 mientras sigue.
 *
 * Para el creador (Administrador, en su Sloth):
 * - `GET /voz/admin?pagina=&consumo=`: el saldo general, los usuarios (con su correo y sus planes de Sloth), el consumo
 *   que da Voices Cloning (recargas y gastos, `items`), el registro de aquí y su resumen de 30 días. Cada lista va por
 *   páginas de 100 (`pagina` la de usuarios, `consumo` la del consumo). Lo de Voices Cloning va tal cual lo responde.
 * - `GET /voz/admin/usuario?externo=`: uno, con su registro.
 * - `POST /voz/admin/creditos` `{externo, amount}`: suma (o, negativo, quita) créditos.
 * - `POST /voz/admin/estado` `{externo, status}`: `active` o `suspended`.
 * - `POST /voz/admin/alta` `{email, creditos}`: da de alta a una cuenta de Sloth por su correo, con créditos.
 *
 * Cada llamada queda en `voz_registro` (migración 0020): quién, qué, cuántas letras y créditos, y si falló, por qué. El
 * cron borra lo de más de `GUARDAR_DIAS`.
 *
 * Con `VOZ_SOLO_CREADOR` en `"1"`, nadie más que el creador la usa, aunque tenga créditos: a los demás `GET /voz` les
 * dice que no está, lo demás responde 403 y Administrador no da de alta a nadie.
 */
import { BLOQUEADA, CLAVE, EQUIPO, type Env, Rechazo, cuerpo, iguales, json, vigencia, vigilar } from './index.ts'
import { DE_LA_APP } from './comunidad.ts'

const BASE = 'https://www.voicescloning.art'
/** El usuario del creador en Voices Cloning. */
export const CREADOR_VOZ = 'creador'
/** Lo más que acepta `/api/v1/tts` en una llamada. */
export const MAX_LETRAS = 5000
/** Lo que se guarda del registro. */
export const GUARDAR_DIAS = 180
const SIN_LLAVE = 'Las voces de Voices Cloning aún no están listas en Sloth.'
const CERRADA = 'Las voces de Voices Cloning aún no están abiertas en Sloth.'
const soloCreador = (env: Env) => env.VOZ_SOLO_CREADOR === '1'
const EXTERNO = /^[\w-]{1,100}$/
const TAREA = /^[\w-]{1,100}$/

interface Quien {
  externo: string
  creador: boolean
}

/** Lo que respondió Voices Cloning: su estado, su cuerpo y, si pide esperar, cuánto. */
export interface Respuesta {
  status: number
  datos: Record<string, unknown>
  espera?: string
}

/** Lo que va en `voz_registro`. */
interface Anotacion {
  externo: string
  accion: 'alta' | 'sesion' | 'tts' | 'tarea' | 'creditos' | 'estado'
  voz?: string
  letras?: number
  /** Para `creditos`, los que se sumaron o quitaron; si no, los que gastó. */
  creditos?: number
  ms: number
  r: Respuesta
}

export async function voz(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const ruta = url.pathname
  const q = await quien(req, env)
  if (ruta.startsWith('/voz/admin')) {
    if (!q.creador) throw new Rechazo(403, 'Esto solo lo ve el creador de Sloth.')
    return admin(req, env, ctx, url)
  }
  if (!q.creador && soloCreador(env)) {
    if (req.method === 'GET' && ruta === '/voz') return json({ disponible: false, creador: false })
    throw new Rechazo(403, CERRADA)
  }
  if (req.method === 'GET' && ruta === '/voz') {
    if (!env.VOICES_PK_LIVE) return json({ disponible: false, creador: q.creador })
    const r = await vc(env, 'GET', `/api/partner/v1/users/${encodeURIComponent(q.externo)}`)
    if (r.status === 404) return json({ disponible: true, creador: q.creador, alta: false, creditos: q.creador ? 0 : creditosIniciales(env) })
    if (r.status >= 400) return responder(r)
    const u = r.datos
    return json({ disponible: true, creador: q.creador, alta: true, creditos: u.credits, usados: u.used_total, hoy: u.used_today, generaciones: u.generations, estado: u.status })
  }
  if (!env.VOICES_PK_LIVE) throw new Rechazo(503, SIN_LLAVE)
  if (req.method === 'POST' && ruta === '/voz/sesion') {
    await alta(env, ctx, q)
    const t = Date.now()
    const r = await vc(env, 'POST', '/api/v1/embed/session', { usuario: q.externo, cuerpo: {} })
    anotar(env, ctx, { externo: q.externo, accion: 'sesion', ms: Date.now() - t, r })
    return responder(r)
  }
  if (req.method === 'POST' && ruta === '/voz/tts') {
    const pedido = pedidoTts(await cuerpo(req))
    await alta(env, ctx, q)
    const t = Date.now()
    const r = await vc(env, 'POST', '/api/v1/tts', { usuario: q.externo, cuerpo: pedido })
    anotar(env, ctx, { externo: q.externo, accion: 'tts', voz: pedido.voice_id, letras: pedido.text.length, creditos: numero(r.datos.credits_used), ms: Date.now() - t, r })
    return responder(r)
  }
  const tarea = /^\/voz\/tareas\/([^/]+)$/.exec(ruta)?.[1]
  if (req.method === 'GET' && tarea) {
    if (!TAREA.test(tarea)) throw new Rechazo(400, 'Esa tarea no existe.')
    const t = Date.now()
    const r = await vc(env, 'GET', `/api/v1/tasks/${tarea}`, { usuario: q.externo })
    // Las vueltas mientras sigue (202) no se anotan: solo cuando acaba, bien o mal.
    if (r.status !== 202) anotar(env, ctx, { externo: q.externo, accion: 'tarea', creditos: numero(r.datos.credits_used), ms: Date.now() - t, r })
    return responder(r)
  }
  return json({ error: 'No existe' }, 404)
}

// ── El creador ──────────────────────────────────────────────────────────────────────────────────────────────────

async function admin(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const ruta = url.pathname
  if (req.method === 'GET' && ruta === '/voz/admin') {
    const pagina = Math.max(1, Math.floor(Number(url.searchParams.get('pagina')) || 1))
    const consumo = Math.max(1, Math.floor(Number(url.searchParams.get('consumo')) || 1))
    const configurado = !!env.VOICES_PK_LIVE
    const [saldo, usuarios, uso] = configurado
      ? await Promise.all([
          vc(env, 'GET', '/api/partner/v1/balance'),
          vc(env, 'GET', `/api/partner/v1/users?per_page=100&page=${pagina}`),
          vc(env, 'GET', `/api/partner/v1/usage?per_page=100&page=${consumo}`)
        ])
      : [undefined, undefined, undefined]
    const deLista = (r: Respuesta | undefined, campo: string) => (Array.isArray(r?.datos[campo]) ? (r.datos[campo] as { external_id?: unknown }[]) : []).map((u) => String(u.external_id ?? ''))
    const externos = [...new Set([...deLista(usuarios, 'users'), ...deLista(uso, 'items'), ...(await externosDelRegistro(env))])].filter((e) => EXTERNO.test(e))
    const desde = new Date(Date.now() - 30 * 86400_000).toISOString()
    const [cuentas, registro, resumen, errores] = await Promise.all([
      cuentasDe(env, externos),
      env.DB.prepare('SELECT * FROM voz_registro ORDER BY id DESC LIMIT 300').all(),
      env.DB.prepare(
        'SELECT accion, COUNT(*) AS llamadas, SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS fallidas, SUM(letras) AS letras, SUM(CASE WHEN accion = \'creditos\' THEN 0 ELSE creditos END) AS creditos, COUNT(DISTINCT externo) AS usuarios, AVG(ms) AS ms FROM voz_registro WHERE cuando > ? GROUP BY accion ORDER BY llamadas DESC'
      )
        .bind(desde)
        .all(),
      env.DB.prepare('SELECT status, codigo, COUNT(*) AS veces, MAX(cuando) AS ultima, MAX(error) AS error FROM voz_registro WHERE status >= 400 AND cuando > ? GROUP BY status, codigo ORDER BY veces DESC').bind(desde).all()
    ])
    return json({
      configurado,
      soloCreador: soloCreador(env),
      creditosIniciales: creditosIniciales(env),
      pagina,
      consumo,
      saldo,
      usuarios,
      uso,
      cuentas,
      registro: registro.results,
      resumen: resumen.results,
      errores: errores.results
    })
  }
  if (!env.VOICES_PK_LIVE) throw new Rechazo(503, SIN_LLAVE)
  if (req.method === 'GET' && ruta === '/voz/admin/usuario') {
    const externo = externoDe(url.searchParams.get('externo'))
    const [r, registro, cuentas] = await Promise.all([
      vc(env, 'GET', `/api/partner/v1/users/${encodeURIComponent(externo)}`),
      env.DB.prepare('SELECT * FROM voz_registro WHERE externo = ? ORDER BY id DESC LIMIT 300').bind(externo).all(),
      cuentasDe(env, [externo])
    ])
    return json({ usuario: r, registro: registro.results, cuenta: cuentas[externo] ?? null })
  }
  if (req.method !== 'POST') return json({ error: 'No existe' }, 404)
  const c = await cuerpo(req)
  if (ruta === '/voz/admin/creditos') {
    const externo = externoDe(c.externo)
    const amount = Number(c.amount)
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100_000_000) throw new Rechazo(400, 'Di cuántos créditos, un número entero (negativo para quitar).')
    const t = Date.now()
    const r = await vc(env, 'POST', `/api/partner/v1/users/${encodeURIComponent(externo)}/credits`, { cuerpo: { amount } })
    anotar(env, ctx, { externo, accion: 'creditos', creditos: amount, ms: Date.now() - t, r })
    return responder(r)
  }
  if (ruta === '/voz/admin/estado') {
    const externo = externoDe(c.externo)
    if (c.status !== 'active' && c.status !== 'suspended') throw new Rechazo(400, 'El estado es active o suspended.')
    const t = Date.now()
    const r = await vc(env, 'PATCH', `/api/partner/v1/users/${encodeURIComponent(externo)}`, { cuerpo: { status: c.status } })
    anotar(env, ctx, { externo, accion: 'estado', ms: Date.now() - t, r: { ...r, datos: { ...r.datos, error: r.status >= 400 ? r.datos.error : c.status } } })
    return responder(r)
  }
  if (ruta === '/voz/admin/alta') {
    if (soloCreador(env)) throw new Rechazo(409, 'Voices Cloning aún es solo para ti (VOZ_SOLO_CREADOR en el cobro): quítalo para darlo a alguien más.')
    const email = String(c.email ?? '').trim().toLowerCase()
    const creditos = Math.max(0, Math.floor(Number(c.creditos) || 0))
    const fila = await env.DB.prepare('SELECT id FROM licencias WHERE email = ? ORDER BY creada LIMIT 1').bind(email).first<{ id: string }>()
    if (!fila) throw new Rechazo(404, 'No hay ninguna cuenta de Sloth con ese correo.')
    const r = await alta(env, ctx, { externo: fila.id, creador: false }, creditos)
    // Ya existía: el alta no cambia sus créditos, así que se le suman.
    if (r.status === 200 && creditos > 0) {
      const t = Date.now()
      const s = await vc(env, 'POST', `/api/partner/v1/users/${encodeURIComponent(fila.id)}/credits`, { cuerpo: { amount: creditos } })
      anotar(env, ctx, { externo: fila.id, accion: 'creditos', creditos, ms: Date.now() - t, r: s })
      if (s.status >= 400) return responder(s)
    }
    return json({ externo: fila.id, creado: r.status === 201 })
  }
  return json({ error: 'No existe' }, 404)
}

/** Los usuarios que el registro conoce, aunque Voices Cloning no los liste en esta página. */
async function externosDelRegistro(env: Env): Promise<string[]> {
  const r = await env.DB.prepare('SELECT externo FROM voz_registro GROUP BY externo ORDER BY MAX(id) DESC LIMIT 200').all<{ externo: string }>()
  return r.results.map((f) => f.externo)
}

/** De cada usuario (el `id` de una licencia), su correo y todas las licencias de ese correo: cuenta, apoyo… */
async function cuentasDe(env: Env, externos: string[]): Promise<Record<string, { email: string; licencias: Record<string, unknown>[] }>> {
  const ids = externos.filter((e) => e !== CREADOR_VOZ).slice(0, 90)
  if (!ids.length) return {}
  const marcas = ids.map(() => '?').join(', ')
  const r = await env.DB.prepare(
    `SELECT o.id AS externo, l.email, l.plan, l.estado, l.monto, l.moneda, l.pagado_hasta, l.creada, l.fundador FROM licencias o JOIN licencias l ON l.email = o.email WHERE o.id IN (${marcas}) ORDER BY l.creada`
  )
    .bind(...ids)
    .all<{ externo: string; email: string } & Record<string, unknown>>()
  const cuentas: Record<string, { email: string; licencias: Record<string, unknown>[] }> = {}
  for (const { externo, email, ...l } of r.results) (cuentas[externo] ??= { email, licencias: [] }).licencias.push(l)
  return cuentas
}

// ── Lo de todos ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Quién pide: el creador, con la llave `PUBLICAR`, o una cuenta o un apoyo activos en una computadora que lo usa. */
async function quien(req: Request, env: Env): Promise<Quien> {
  if (env.PUBLICAR && iguales(req.headers.get('authorization') ?? '', `Bearer ${env.PUBLICAR}`)) return { externo: CREADOR_VOZ, creador: true }
  const clave = (req.headers.get('x-sloth-clave') ?? '').replace(/\s+/g, '').toUpperCase()
  const equipo = req.headers.get('x-sloth-equipo') ?? ''
  const fila =
    CLAVE.test(clave) && EQUIPO.test(equipo)
      ? await env.DB.prepare(
          "SELECT l.estado, l.pagado_hasta, l.email, (SELECT v.id FROM licencias v WHERE v.email = l.email ORDER BY v.creada LIMIT 1) AS externo, EXISTS (SELECT 1 FROM licencias v WHERE v.email = l.email AND v.estado = 'vetada') AS vetada FROM licencias l JOIN equipos e ON e.clave = l.clave WHERE l.clave = ? AND e.equipo = ?"
        )
          .bind(clave, equipo)
          .first<{ estado: string; pagado_hasta: string | null; email: string; externo: string; vetada: number }>()
      : null
  if (fila?.vetada) throw new Rechazo(403, BLOQUEADA)
  if (!fila || !vigencia(fila as Parameters<typeof vigencia>[0], Date.now()).activa) throw new Rechazo(401, 'Para usar las voces de Voices Cloning, crea tu cuenta gratis de Sloth.')
  if (!DE_LA_APP.test(equipo)) {
    await vigilar(env, fila.email, 'pidió voces de Voices Cloning sin la app de Sloth, con un identificador de computadora inventado')
    throw new Rechazo(403, 'Detectamos actividad sospechosa: esto no viene de la app de Sloth. Tu cuenta queda vigilada.')
  }
  return { externo: fila.externo, creador: false }
}

/** Da de alta a quien pide, si aún no lo estaba (Voices Cloning no lo duplica: responde 200 si ya existía). */
async function alta(env: Env, ctx: ExecutionContext, q: Quien, creditos = q.creador ? 0 : creditosIniciales(env)): Promise<Respuesta> {
  const t = Date.now()
  const r = await vc(env, 'POST', '/api/partner/v1/users', { cuerpo: { external_id: q.externo, name: q.creador ? 'Vancci (creador de Sloth)' : 'Usuario de Sloth', credits: creditos } })
  if (r.status === 201 || r.status >= 400) anotar(env, ctx, { externo: q.externo, accion: 'alta', creditos, ms: Date.now() - t, r })
  if (r.status >= 400) throw new Rechazo(r.status === 401 ? 502 : r.status, mensajeDe(r))
  return r
}

const creditosIniciales = (env: Env) => Math.max(0, Math.floor(Number(env.VOZ_CREDITOS) || 0))

/** Lo que se manda a `/api/v1/tts`, comprobado: el texto (hasta 5.000 letras), la voz y, si viene, la velocidad. */
export function pedidoTts(c: Record<string, unknown>): { text: string; voice_id: string; speed?: number } {
  const text = typeof c.text === 'string' ? c.text.trim() : ''
  const voice_id = typeof c.voice_id === 'string' ? c.voice_id.trim() : ''
  if (!text) throw new Rechazo(400, 'Falta el texto.')
  if (text.length > MAX_LETRAS) throw new Rechazo(400, `Son ${text.length} letras: Voices Cloning acepta ${MAX_LETRAS} por llamada.`)
  if (!voice_id || voice_id.length > 200) throw new Rechazo(400, 'Falta la voz.')
  if (c.speed === undefined) return { text, voice_id }
  const speed = Number(c.speed)
  if (!(speed >= 0.5 && speed <= 1.5)) throw new Rechazo(400, 'La velocidad va de 0.5 a 1.5.')
  return { text, voice_id, speed }
}

function externoDe(e: unknown): string {
  const externo = String(e ?? '')
  if (!EXTERNO.test(externo)) throw new Rechazo(400, 'Ese usuario no existe.')
  return externo
}

/** Una llamada a Voices Cloning con la llave del socio. Sin conexión, responde como un 502 suyo. */
async function vc(env: Env, metodo: string, ruta: string, o: { usuario?: string; cuerpo?: unknown } = {}): Promise<Respuesta> {
  let r: Response
  try {
    r = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: { authorization: `Bearer ${env.VOICES_PK_LIVE}`, 'content-type': 'application/json', ...(o.usuario ? { 'x-partner-user': o.usuario } : {}) },
      body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo)
    })
  } catch {
    return { status: 502, datos: { error: 'No hubo conexión con Voices Cloning.', code: 'sin_conexion' } }
  }
  const datos = (await r.json().catch(() => null)) as unknown
  return { status: r.status, datos: datos && typeof datos === 'object' && !Array.isArray(datos) ? (datos as Record<string, unknown>) : { valor: datos }, espera: r.headers.get('retry-after') ?? undefined }
}

/** Lo que respondió, para la app: igual, salvo que un error se dice en español y lo suyo queda en `detalle`. */
function responder(r: Respuesta): Response {
  const datos = r.status >= 400 ? { ...r.datos, error: mensajeDe(r), detalle: r.datos.error ?? null } : r.datos
  // Su 401 es que la llave del socio no sirve: para la app no es que falte su cuenta.
  return json(datos, r.status === 401 ? 502 : r.status, r.espera ? { 'retry-after': r.espera } : {})
}

/** Por qué no salió, dicho para quien usa Sloth (y su agente). */
export function mensajeDe(r: Pick<Respuesta, 'status' | 'datos' | 'espera'>): string {
  const codigo = String(r.datos.code ?? '')
  const suyo = typeof r.datos.error === 'string' ? r.datos.error : ''
  if (codigo === 'insufficient_credits') return 'Se te acabaron los créditos de voz de Voices Cloning. Pídele más al creador de Sloth o usa otra voz.'
  if (codigo === 'partner_balance_empty') return 'Las voces de Voices Cloning no están disponibles ahora: se acabó el saldo de Sloth. El creador ya puede verlo; mientras, usa otra voz.'
  if (codigo === 'partner_daily_limit') return 'Se llegó al tope del día de las voces de Voices Cloning en Sloth. Se libera a medianoche, hora de Lima (las 23:00 en la Ciudad de México).'
  if (codigo === 'queue_full' || r.status === 429) return `Voices Cloning tiene mucha demanda ahora. Intenta otra vez en ${r.espera ?? 'unos'} segundos.`
  if (r.status === 504) return 'La voz tardó más de lo normal (no se cobró): sigue con su tarea o vuelve a pedirla.'
  if (r.status === 401) return 'Voices Cloning no aceptó la llave de Sloth. Avísale al creador.'
  if (r.status === 403) return 'Tu usuario de voces de Voices Cloning está suspendido. Pregúntale al creador de Sloth.'
  if (r.status === 404) return suyo ? `Voices Cloning no lo encontró: ${suyo}` : 'Voices Cloning no tiene eso (¿la voz existe?).'
  if (codigo === 'invalid_body' || r.status === 400) return `Voices Cloning no aceptó el pedido${suyo ? `: ${suyo}` : '.'}`
  if (codigo === 'sin_conexion') return 'No hubo conexión con Voices Cloning. Intenta otra vez en un momento.'
  return `Voices Cloning respondió ${r.status}${suyo ? `: ${suyo}` : '.'}`
}

/** Anota la llamada en `voz_registro` sin detener la respuesta. */
function anotar(env: Env, ctx: ExecutionContext, a: Anotacion) {
  const d = a.r.datos
  const fallo = a.r.status >= 400
  ctx.waitUntil(
    env.DB.prepare('INSERT INTO voz_registro (cuando, externo, accion, voz, letras, creditos, restantes, tarea, status, codigo, error, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        new Date().toISOString(),
        a.externo,
        a.accion,
        a.voz ?? null,
        a.letras ?? null,
        a.creditos ?? null,
        // Tras sumar o quitar, Voices Cloning da `credits`: los que le quedan.
        numero(d.credits_remaining) ?? (a.accion === 'creditos' ? numero(d.credits) : undefined) ?? null,
        typeof d.task_id === 'string' || typeof d.task_id === 'number' ? String(d.task_id) : null,
        a.r.status,
        fallo && d.code ? String(d.code) : null,
        fallo ? String(d.error ?? '').slice(0, 500) || null : null,
        a.ms
      )
      .run()
      .catch((e) => console.error('Registro de la voz', e instanceof Error ? e.message : e))
  )
}

/** Lo del registro que ya pasó de `GUARDAR_DIAS`. Lo llama el cron. */
export const olvidarRegistroVoz = (env: Env) => env.DB.prepare('DELETE FROM voz_registro WHERE cuando < ?').bind(new Date(Date.now() - GUARDAR_DIAS * 86400_000).toISOString()).run()

const numero = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
