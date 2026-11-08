/**
 * La voz de Voices Cloning (https://www.voicescloning.art), el proveedor de voz de Sloth. Sloth es su socio: tiene un
 * saldo general, que el creador recarga pagándoles, y cada quien es un usuario suyo con sus propios créditos. Asignar
 * créditos no gasta el saldo; solo lo gasta generar.
 *
 * Las llaves del socio solo viven aquí, como secretos: la app corre en la computadora de cada quien y no puede
 * guardarlas. Puede haber varias (`VOICES_PK_LIVE`, `VOICES_PK_LIVE_2`, `VOICES_PK_LIVE_3`…), cada una con su saldo:
 * cada llave es una cuenta de socio aparte, con sus usuarios, sus créditos y sus voces clonadas, que no pasan a otra.
 * Por eso cada quien vive en una sola, anotada en `voz_cuentas` (migración 0023) por el id de la llave (`idDe`), no por
 * el nombre del secreto: así no importa si se reordenan. Se elige así:
 * - Quien no está anotado se busca en todas (los de antes de que hubiera varias) y, si no está en ninguna, se da de alta
 *   en la de más saldo.
 * - Si la suya se queda sin saldo (`partner_balance_empty`), se muda a la de más saldo con los créditos que le quedaban
 *   (se le quitan de la vieja, para que no cuenten dos veces) y se repite el pedido. Lo que clonó se queda en la vieja.
 * - Si su llave se quita del cobro, se busca o se da de alta otra vez.
 *
 * Aquí se sabe quién pide, como en la comunidad (`x-sloth-clave` y `x-sloth-equipo` de una cuenta o un apoyo activos,
 * o el creador con su llave, `ADMIN` o `PUBLICAR`), y se le pone su `X-Partner-User`, que nadie más puede elegir. Ese `external_id` es el
 * `id` de la primera licencia de su correo, así que su cuenta gratis y su apoyo son el mismo usuario y el correo no sale
 * de aquí; el del creador es `creador`.
 *
 * Para la app (`server/voz/voices-cloning.ts`):
 * - `GET /voz`: si se puede usar y cuántos créditos te quedan.
 * - `POST /voz/sesion`: te da de alta (con `VOZ_CREDITOS` la primera vez) y pide el pase de la ventana de voces, que
 *   dura una hora y solo sirve para ti.
 * - `POST /voz/tts` `{text, voice_id, speed?}`: un trozo de hasta 5.000 letras. Da `audio_url` (MP3) y los créditos que
 *   gastó y te quedan. Si tarda de más responde 504 con un `task_id`, sin cobrar.
 * - `GET /voz/tareas/<id>`: esa tarea (en la llave donde se pidió); 202 mientras sigue.
 *
 * Para el creador (Administrador, en su Sloth):
 * - `GET /voz/admin?pagina=&consumo=`: `reparto`, cuánto saldo queda libre para repartir (`cuentaDeReparto`); de cada llave (`llaves`), su saldo, sus usuarios y el consumo que da Voices
 *   Cloning (recargas y gastos, `items`); `nuevos`, la llave donde entran los nuevos ahora; los correos y planes de
 *   Sloth de cada usuario, el registro de aquí y su resumen de 30 días. Cada lista va por páginas de 100 (`pagina` la de
 *   usuarios, `consumo` la del consumo). Lo de Voices Cloning va tal cual lo responde.
 * - `GET /voz/admin/usuario?externo=`: uno, con su registro y su llave.
 * - `POST /voz/admin/creditos` `{externo, amount}`: suma (o, negativo, quita) créditos, en su llave.
 * - `POST /voz/admin/estado` `{externo, status}`: `active` o `suspended`.
 * - `POST /voz/admin/alta` `{email, creditos}`: da de alta a una cuenta de Sloth por su correo, con créditos.
 *
 * Cada llamada queda en `voz_registro` (migración 0020), con su llave: quién, qué, cuántas letras y créditos, y si
 * falló, por qué. El cron borra lo de más de `GUARDAR_DIAS`.
 *
 * Con `VOZ_SOLO_CREADOR` en `"1"`, nadie más que el creador la usa, aunque tenga créditos: a los demás `GET /voz` les
 * dice que no está, lo demás responde 403 y Administrador no da de alta a nadie, hasta publicar la actualización con
 * `vozMensual` (marca `voz-mensual.json` en R2). Desde ahí `voz-mensual.ts` refresca a 100.000 (sin acumular) por correo y mes, SOLO
 * a quien paga activamente $15 USD o más (`daCreditos`): ni cuentas gratis, ni apoyos de menos, ni lugares gratis de Fundador. El cron también los entrega y manda la clave personal de Sloth por correo.
 */
import { BLOQUEADA, CLAVE, EQUIPO, type Env, Rechazo, cuerpo, delCreador, json, vigencia, vigilar } from './index.ts'
import { DE_LA_APP } from './comunidad.ts'
import { beneficiarioVoz, beneficiariosVoz, CREDITOS_MENSUALES, cuentaDeReparto, desdeTexto, entregarVozMensual, periodoVoz, repartirVozMensual, vocesPublicadas, type RepartidorVoz } from './voz-mensual.ts'

const BASE = 'https://www.voicescloning.art'
/** El usuario del creador en Voices Cloning. */
export const CREADOR_VOZ = 'creador'
/** Lo más que acepta `/api/v1/tts` en una llamada. */
export const MAX_LETRAS = 5000
/** Lo que se guarda del registro. */
export const GUARDAR_DIAS = 180
/** El nombre del secreto de una llave de socio: `VOICES_PK_LIVE`, `VOICES_PK_LIVE_2`… */
export const NOMBRE_LLAVE = /^VOICES_PK_LIVE(?:_(\d+))?$/
const SIN_LLAVE = 'Las voces de Sloth aún no están listas.'
const CERRADA = 'Las voces de Sloth aún no están abiertas.'
const SIN_CUENTA = 'Ese usuario no está en ninguna cuenta de Voices Cloning.'
const soloCreador = async (env: Env) => env.VOZ_SOLO_CREADOR === '1' && !(await vocesPublicadas(env))
const EXTERNO = /^[\w-]{1,100}$/
const TAREA = /^[\w-]{1,100}$/

interface Quien {
  externo: string
  creador: boolean
  email?: string
}

/** Una llave de socio: el secreto donde está, su id (lo que se anota) y sus últimas cuatro letras, para reconocerla. */
export interface Llave {
  nombre: string
  id: string
  fin: string
  valor: string
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
  accion: 'alta' | 'sesion' | 'tts' | 'tarea' | 'creditos' | 'estado' | 'mudanza'
  llave: Llave
  voz?: string
  letras?: number
  /** Para `creditos` y `mudanza`, los que se sumaron, quitaron o se llevó; si no, los que gastó. */
  creditos?: number
  ms: number
  r: Respuesta
}

export async function voz(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const ruta = url.pathname
  const q = await quien(req, env)
  const llaves = await llavesDe(env)
  if (ruta.startsWith('/voz/admin')) {
    if (!q.creador) throw new Rechazo(403, 'Esto solo lo ve el creador de Sloth.')
    return admin(req, env, ctx, url, llaves)
  }
  if (!q.creador && await soloCreador(env)) {
    if (req.method === 'GET' && ruta === '/voz') return json({ disponible: false, creador: false })
    throw new Rechazo(403, CERRADA)
  }
  const beneficiario = q.email && llaves.length && await vocesPublicadas(env) ? await beneficiarioVoz(env, q.email) : null
  if (beneficiario) await entregarVozMensual(env, beneficiario, repartidor(env, ctx, llaves))
  if (req.method === 'GET' && ruta === '/voz') {
    if (!llaves.length) return json({ disponible: false, creador: q.creador })
    const c = await cuentaDe(env, ctx, llaves, q.externo, false)
    if (!c) return json({ disponible: true, creador: q.creador, alta: false, creditos: q.creador ? 0 : creditosIniciales(env) })
    const r = await vc(c.llave, 'GET', `/api/partner/v1/users/${encodeURIComponent(q.externo)}`)
    if (r.status >= 400) return responder(r)
    const u = r.datos
    return json({ disponible: true, creador: q.creador, alta: true, creditos: u.credits, usados: u.used_total, hoy: u.used_today, generaciones: u.generations, estado: u.status, ...(beneficiario ? { mensuales: CREDITOS_MENSUALES } : {}) })
  }
  if (!llaves.length) throw new Rechazo(503, SIN_LLAVE)
  if (req.method === 'POST' && ruta === '/voz/sesion') {
    const { llave } = await cuentaDe(env, ctx, llaves, q.externo, inicialesDe(env, q))
    const t = Date.now()
    const { r, en } = await conMudanza(env, ctx, llaves, q, llave, (l) => vc(l, 'POST', '/api/v1/embed/session', { usuario: q.externo, cuerpo: {} }))
    anotar(env, ctx, { externo: q.externo, accion: 'sesion', llave: en, ms: Date.now() - t, r })
    return responder(r)
  }
  if (req.method === 'POST' && ruta === '/voz/tts') {
    const pedido = pedidoTts(await cuerpo(req))
    const { llave } = await cuentaDe(env, ctx, llaves, q.externo, inicialesDe(env, q))
    const t = Date.now()
    const { r, en } = await conMudanza(env, ctx, llaves, q, llave, (l) => vc(l, 'POST', '/api/v1/tts', { usuario: q.externo, cuerpo: pedido }))
    anotar(env, ctx, { externo: q.externo, accion: 'tts', llave: en, voz: pedido.voice_id, letras: pedido.text.length, creditos: numero(r.datos.credits_used), ms: Date.now() - t, r })
    // Lo clonado no se muda con la persona: esa voz se quedó en la cuenta de antes.
    if (en.id !== llave.id && r.status === 404) throw new Rechazo(409, 'Tus voces de Sloth pasaron a otra cuenta y esta se quedó en la anterior. Elige o clona otra en el menú «Voz».')
    return responder(r)
  }
  const tarea = /^\/voz\/tareas\/([^/]+)$/.exec(ruta)?.[1]
  if (req.method === 'GET' && tarea) {
    if (!TAREA.test(tarea)) throw new Rechazo(400, 'Esa tarea no existe.')
    // La tarea vive en la llave donde se pidió, aunque la persona se haya mudado después.
    const donde = await env.DB.prepare('SELECT llave FROM voz_registro WHERE tarea = ? AND externo = ? AND llave IS NOT NULL ORDER BY id DESC LIMIT 1').bind(tarea, q.externo).first<{ llave: string }>()
    const llave = llaves.find((l) => l.id === donde?.llave) ?? (await cuentaDe(env, ctx, llaves, q.externo, false))?.llave
    if (!llave) throw new Rechazo(404, 'Esa tarea no existe.')
    const t = Date.now()
    const r = await vc(llave, 'GET', `/api/v1/tasks/${tarea}`, { usuario: q.externo })
    // Las vueltas mientras sigue (202) no se anotan: solo cuando acaba, bien o mal.
    if (r.status !== 202) anotar(env, ctx, { externo: q.externo, accion: 'tarea', llave, creditos: numero(r.datos.credits_used), ms: Date.now() - t, r })
    return responder(r)
  }
  return json({ error: 'No existe' }, 404)
}

// ── Las llaves ──────────────────────────────────────────────────────────────────────────────────────────────────

const ids = new Map<string, string>()

/** El id de una llave: lo primero de su SHA-256. No deja sacar la llave y no cambia si se guarda con otro nombre. */
export async function idDe(valor: string): Promise<string> {
  let id = ids.get(valor)
  if (!id) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor)))
    id = [...h.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('')
    ids.set(valor, id)
  }
  return id
}

/** Las llaves de socio puestas en el cobro, en orden (`VOICES_PK_LIVE` es la 1), sin las vacías ni las repetidas. */
export async function llavesDe(env: Env): Promise<Llave[]> {
  const secretos = env as unknown as Record<string, unknown>
  const orden = (nombre: string) => Number(NOMBRE_LLAVE.exec(nombre)?.[1] ?? 1)
  const nombres = Object.keys(secretos)
    .filter((k) => NOMBRE_LLAVE.test(k) && typeof secretos[k] === 'string' && (secretos[k] as string).trim())
    .sort((a, b) => orden(a) - orden(b))
  const llaves = await Promise.all(
    nombres.map(async (nombre) => {
      const valor = (secretos[nombre] as string).trim()
      return { nombre, valor, fin: valor.slice(-4), id: await idDe(valor) }
    })
  )
  return llaves.filter((l, i) => llaves.findIndex((o) => o.id === l.id) === i)
}

/** De las llaves con su saldo leído, la que más tiene; ninguna si a todas se les acabó o no se pudo leer. */
export function laDeMasSaldo(saldos: { llave: Llave; r: Respuesta }[]): Llave | undefined {
  let mejor: { llave: Llave; saldo: number } | undefined
  for (const { llave, r } of saldos) {
    const saldo = r.status < 400 ? numero(r.datos.balance) : undefined
    if (saldo !== undefined && saldo > 0 && (!mejor || saldo > mejor.saldo)) mejor = { llave, saldo }
  }
  return mejor?.llave
}

const conMasSaldo = async (llaves: Llave[]) => laDeMasSaldo(await Promise.all(llaves.map(async (llave) => ({ llave, r: await vc(llave, 'GET', '/api/partner/v1/balance') }))))

/**
 * En qué llave vive alguien. Si no está anotado, se busca en todas. Con `crear` (sus créditos iniciales) y en ninguna,
 * se da de alta en la de más saldo; con `false`, no se crea y puede no haber.
 */
async function cuentaDe(env: Env, ctx: ExecutionContext, llaves: Llave[], externo: string, crear: number): Promise<{ llave: Llave; creado: boolean }>
async function cuentaDe(env: Env, ctx: ExecutionContext, llaves: Llave[], externo: string, crear: false): Promise<{ llave: Llave; creado: boolean } | undefined>
async function cuentaDe(env: Env, ctx: ExecutionContext, llaves: Llave[], externo: string, crear: number | false) {
  const fila = await env.DB.prepare('SELECT llave FROM voz_cuentas WHERE externo = ?').bind(externo).first<{ llave: string }>()
  const anotada = llaves.find((l) => l.id === fila?.llave)
  if (anotada) return { llave: anotada, creado: false }
  const buscadas = await Promise.all(llaves.map((l) => vc(l, 'GET', `/api/partner/v1/users/${encodeURIComponent(externo)}`)))
  const hallada = llaves[buscadas.findIndex((r) => r.status === 200)]
  if (hallada) {
    await anotarCuenta(env, externo, hallada)
    return { llave: hallada, creado: false }
  }
  // Un fallo de conexión no demuestra que el usuario no exista: darlo de alta en otra cuenta duplicaría sus créditos.
  const fallo = buscadas.find((r) => r.status !== 404)
  if (fallo) throw new Rechazo(502, mensajeDe(fallo))
  if (crear === false) return undefined
  const llave = (await conMasSaldo(llaves)) ?? llaves[0]
  const r = await alta(env, ctx, llave, externo, crear)
  await anotarCuenta(env, externo, llave)
  return { llave, creado: r.status === 201 }
}

const anotarCuenta = (env: Env, externo: string, llave: Llave) =>
  env.DB.prepare('INSERT INTO voz_cuentas (externo, llave, desde) VALUES (?, ?, ?) ON CONFLICT (externo) DO UPDATE SET llave = excluded.llave, desde = excluded.desde')
    .bind(externo, llave.id, new Date().toISOString())
    .run()

/** Pide en la llave de alguien y, si a esa se le acabó el saldo, lo muda a la de más saldo y pide otra vez allá. */
async function conMudanza(env: Env, ctx: ExecutionContext, llaves: Llave[], q: Quien, llave: Llave, pedir: (l: Llave) => Promise<Respuesta>): Promise<{ r: Respuesta; en: Llave }> {
  const r = await pedir(llave)
  if (r.status !== 402 || r.datos.code !== 'partner_balance_empty') return { r, en: llave }
  const otra = await mudar(env, ctx, llaves, q, llave)
  return otra ? { r: await pedir(otra), en: otra } : { r, en: llave }
}

/** Pasa a alguien de la llave que se quedó sin saldo a la de más saldo, con los créditos que le quedaban. */
async function mudar(env: Env, ctx: ExecutionContext, llaves: Llave[], q: Quien, desde: Llave): Promise<Llave | undefined> {
  const otra = await conMasSaldo(llaves.filter((l) => l.id !== desde.id))
  if (!otra) return undefined
  const ruta = `/api/partner/v1/users/${encodeURIComponent(q.externo)}`
  const creditos = Math.max(0, Math.floor(numero((await vc(desde, 'GET', ruta)).datos.credits) ?? 0))
  const t = Date.now()
  const r = await vc(otra, 'POST', '/api/partner/v1/users', { cuerpo: { external_id: q.externo, name: nombreDe(q.externo), credits: creditos } })
  anotar(env, ctx, { externo: q.externo, accion: 'mudanza', llave: otra, creditos, ms: Date.now() - t, r })
  if (r.status >= 400) return undefined
  // Ya estaba ahí, de una mudanza de antes: el alta no cambia sus créditos, así que se le suman.
  if (r.status === 200 && creditos > 0) await vc(otra, 'POST', `${ruta}/credits`, { cuerpo: { amount: creditos } })
  if (creditos > 0) await vc(desde, 'POST', `${ruta}/credits`, { cuerpo: { amount: -creditos } })
  await anotarCuenta(env, q.externo, otra)
  return otra
}

// ── El creador ──────────────────────────────────────────────────────────────────────────────────────────────────

async function admin(req: Request, env: Env, ctx: ExecutionContext, url: URL, llaves: Llave[]): Promise<Response> {
  const ruta = url.pathname
  if (req.method === 'GET' && ruta === '/voz/admin') {
    const pagina = Math.max(1, Math.floor(Number(url.searchParams.get('pagina')) || 1))
    const consumo = Math.max(1, Math.floor(Number(url.searchParams.get('consumo')) || 1))
    const deCadaLlave = await Promise.all(
      llaves.map(async (l) => {
        const [saldo, usuarios, uso] = await Promise.all([
          vc(l, 'GET', '/api/partner/v1/balance'),
          vc(l, 'GET', `/api/partner/v1/users?per_page=100&page=${pagina}`),
          vc(l, 'GET', `/api/partner/v1/usage?per_page=100&page=${consumo}`)
        ])
        return { id: l.id, nombre: l.nombre, fin: l.fin, saldo, usuarios, uso }
      })
    )
    const deLista = (r: Respuesta, campo: string) => (Array.isArray(r.datos[campo]) ? (r.datos[campo] as { external_id?: unknown }[]) : []).map((u) => String(u.external_id ?? ''))
    const externos = [...new Set([...deCadaLlave.flatMap((l) => [...deLista(l.usuarios, 'users'), ...deLista(l.uso, 'items')]), ...(await externosDelRegistro(env))])].filter((e) => EXTERNO.test(e))
    const desde = new Date(Date.now() - 30 * 86400_000).toISOString()
    const [cuentas, registro, resumen, errores] = await Promise.all([
      cuentasDe(env, externos),
      env.DB.prepare('SELECT * FROM voz_registro ORDER BY id DESC LIMIT 300').all(),
      env.DB.prepare(
        'SELECT accion, COUNT(*) AS llamadas, SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS fallidas, SUM(letras) AS letras, SUM(CASE WHEN accion IN (\'creditos\', \'mudanza\') THEN 0 ELSE creditos END) AS creditos, COUNT(DISTINCT externo) AS usuarios, AVG(ms) AS ms FROM voz_registro WHERE cuando > ? GROUP BY accion ORDER BY llamadas DESC'
      )
        .bind(desde)
        .all(),
      env.DB.prepare('SELECT status, codigo, COUNT(*) AS veces, MAX(cuando) AS ultima, MAX(error) AS error FROM voz_registro WHERE status >= 400 AND cuando > ? GROUP BY status, codigo ORDER BY veces DESC').bind(desde).all()
    ])
    return json({
      configurado: llaves.length > 0,
      soloCreador: await soloCreador(env),
      reparto: await reparto(env, llaves, deCadaLlave.map((l) => l.saldo)),
      mensuales: CREDITOS_MENSUALES,
      mensualesDesde: desdeTexto(env),
      repartos: (await env.DB.prepare('SELECT externo, periodo, creditos, estado, entregado, correo, error FROM voz_mensual ORDER BY periodo DESC, externo LIMIT 300').all()).results,
      creditosIniciales: creditosIniciales(env),
      pagina,
      consumo,
      llaves: deCadaLlave,
      // La Administrador de antes de las varias llaves lee una sola cuenta: le van las de todas juntas.
      ...juntas(deCadaLlave),
      nuevos: laDeMasSaldo(deCadaLlave.map((l) => ({ llave: llaves.find((o) => o.id === l.id)!, r: l.saldo })))?.id ?? llaves[0]?.id ?? null,
      cuentas,
      registro: registro.results,
      resumen: resumen.results,
      errores: errores.results
    })
  }
  if (!llaves.length) throw new Rechazo(503, SIN_LLAVE)
  if (req.method === 'GET' && ruta === '/voz/admin/usuario') {
    const externo = externoDe(url.searchParams.get('externo'))
    const [c, registro, cuentas] = await Promise.all([
      cuentaDe(env, ctx, llaves, externo, false),
      env.DB.prepare('SELECT * FROM voz_registro WHERE externo = ? ORDER BY id DESC LIMIT 300').bind(externo).all(),
      cuentasDe(env, [externo])
    ])
    const r: Respuesta = c ? await vc(c.llave, 'GET', `/api/partner/v1/users/${encodeURIComponent(externo)}`) : { status: 404, datos: { error: SIN_CUENTA } }
    return json({ usuario: r, llave: c ? { id: c.llave.id, nombre: c.llave.nombre, fin: c.llave.fin } : null, registro: registro.results, cuenta: cuentas[externo] ?? null })
  }
  if (req.method !== 'POST') return json({ error: 'No existe' }, 404)
  const c = await cuerpo(req)
  if (ruta === '/voz/admin/creditos') {
    const externo = externoDe(c.externo)
    const amount = Number(c.amount)
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100_000_000) throw new Rechazo(400, 'Di cuántos créditos, un número entero (negativo para quitar).')
    const donde = await cuentaDe(env, ctx, llaves, externo, false)
    if (!donde) throw new Rechazo(404, SIN_CUENTA)
    const t = Date.now()
    const r = await vc(donde.llave, 'POST', `/api/partner/v1/users/${encodeURIComponent(externo)}/credits`, { cuerpo: { amount } })
    anotar(env, ctx, { externo, accion: 'creditos', llave: donde.llave, creditos: amount, ms: Date.now() - t, r })
    return responder(r)
  }
  if (ruta === '/voz/admin/estado') {
    const externo = externoDe(c.externo)
    if (c.status !== 'active' && c.status !== 'suspended') throw new Rechazo(400, 'El estado es active o suspended.')
    const donde = await cuentaDe(env, ctx, llaves, externo, false)
    if (!donde) throw new Rechazo(404, SIN_CUENTA)
    const t = Date.now()
    const r = await vc(donde.llave, 'PATCH', `/api/partner/v1/users/${encodeURIComponent(externo)}`, { cuerpo: { status: c.status } })
    anotar(env, ctx, { externo, accion: 'estado', llave: donde.llave, ms: Date.now() - t, r: { ...r, datos: { ...r.datos, error: r.status >= 400 ? r.datos.error : c.status } } })
    return responder(r)
  }
  if (ruta === '/voz/admin/alta') {
    if (await soloCreador(env)) throw new Rechazo(409, 'Las voces de Sloth se abrirán cuando se publique la actualización con los créditos mensuales.')
    const email = String(c.email ?? '').trim().toLowerCase()
    const creditos = Math.max(0, Math.floor(Number(c.creditos) || 0))
    const fila = await env.DB.prepare('SELECT id FROM licencias WHERE email = ? ORDER BY creada LIMIT 1').bind(email).first<{ id: string }>()
    if (!fila) throw new Rechazo(404, 'No hay ninguna cuenta de Sloth con ese correo.')
    const donde = await cuentaDe(env, ctx, llaves, fila.id, creditos)
    // Ya existía: el alta no cambia sus créditos, así que se le suman.
    if (!donde.creado && creditos > 0) {
      const t = Date.now()
      const s = await vc(donde.llave, 'POST', `/api/partner/v1/users/${encodeURIComponent(fila.id)}/credits`, { cuerpo: { amount: creditos } })
      anotar(env, ctx, { externo: fila.id, accion: 'creditos', llave: donde.llave, creditos, ms: Date.now() - t, r: s })
      if (s.status >= 400) return responder(s)
    }
    return json({ externo: fila.id, creado: donde.creado, llave: donde.llave.fin })
  }
  return json({ error: 'No existe' }, 404)
}

/**
 * Las cuentas de todas las llaves como si fueran una (`saldo`, `usuarios`, `uso`), para la Administrador de antes: el
 * saldo y sus cifras sumados, y las listas una tras otra. Una que no se pudo leer no suma; si ninguna se leyó, va su error.
 */
export function juntas(cuentas: { saldo: Respuesta; usuarios: Respuesta; uso: Respuesta }[]): { saldo?: Respuesta; usuarios?: Respuesta; uso?: Respuesta } {
  const junta = (campo: 'saldo' | 'usuarios' | 'uso', lista?: string): Respuesta | undefined => {
    const rs = cuentas.map((c) => c[campo])
    const bien = rs.filter((r) => r.status < 400)
    if (!bien.length) return rs[0]
    const datos: Record<string, unknown> = { ...bien[0].datos }
    for (const k of ['balance', 'used_today', 'used_total', 'generations', 'users', 'total']) {
      const n = bien.map((r) => numero(r.datos[k]))
      if (n.some((v) => v !== undefined)) datos[k] = n.reduce<number>((s, v) => s + (v ?? 0), 0)
    }
    if (lista) datos[lista] = bien.flatMap((r) => (Array.isArray(r.datos[lista]) ? r.datos[lista] : []))
    return { status: 200, datos }
  }
  return cuentas.length ? { saldo: junta('saldo'), usuarios: junta('usuarios', 'users'), uso: junta('uso', 'items') } : {}
}

/**
 * Para «Créditos para repartir» de Administrador (`cuentaDeReparto`): el saldo de todas las llaves, los créditos de todos
 * sus usuarios (todas las páginas, hasta 2.000 por llave) y quién recibe los de este mes y a quién ya se le entregaron.
 * Si una llave no responde, no se adivina: va `error`.
 */
async function reparto(env: Env, llaves: Llave[], saldos: Respuesta[]) {
  if (!llaves.length) return null
  const fallo = saldos.find((r) => r.status >= 400)
  if (fallo) return { error: mensajeDe(fallo) }
  const usuarios: { externo: string; creditos: number }[] = []
  for (const l of llaves)
    for (let pagina = 1; pagina <= 20; pagina++) {
      const r = await vc(l, 'GET', `/api/partner/v1/users?per_page=100&page=${pagina}`)
      if (r.status >= 400) return { error: mensajeDe(r) }
      const lista = Array.isArray(r.datos.users) ? (r.datos.users as { external_id?: unknown; credits?: unknown }[]) : []
      for (const u of lista) usuarios.push({ externo: String(u.external_id ?? ''), creditos: numero(u.credits) ?? 0 })
      if (lista.length < 100) break
    }
  const [beneficiarios, entregados] = await Promise.all([
    env.DB.prepare(beneficiariosVoz(env)).bind(new Date().toISOString(), null).all<{ externo: string }>(),
    env.DB.prepare('SELECT externo FROM voz_mensual WHERE periodo = ? AND entregado IS NOT NULL').bind(periodoVoz()).all<{ externo: string }>()
  ])
  return cuentaDeReparto({
    saldo: saldos.reduce((t, r) => t + (numero(r.datos.balance) ?? 0), 0),
    usuarios,
    beneficiarios: beneficiarios.results.map((b) => b.externo),
    entregados: new Set(entregados.results.map((e) => e.externo))
  })
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

/** Quién pide: el creador, con su llave (`delCreador`), o una cuenta o un apoyo activos en una computadora que lo usa. */
async function quien(req: Request, env: Env): Promise<Quien> {
  if (delCreador(req, env)) return { externo: CREADOR_VOZ, creador: true }
  const clave = (req.headers.get('x-sloth-clave') ?? '').replace(/\s+/g, '').toUpperCase()
  const equipo = req.headers.get('x-sloth-equipo') ?? ''
  const fila =
    CLAVE.test(clave) && EQUIPO.test(equipo)
      ? await env.DB.prepare(
          "SELECT l.estado, l.pagado_hasta, l.email, (SELECT v.id FROM licencias v WHERE v.email = l.email ORDER BY v.creada, v.id LIMIT 1) AS externo, EXISTS (SELECT 1 FROM licencias v WHERE v.email = l.email AND v.estado = 'vetada') AS vetada FROM licencias l JOIN equipos e ON e.clave = l.clave WHERE l.clave = ? AND e.equipo = ?"
        )
          .bind(clave, equipo)
          .first<{ estado: string; pagado_hasta: string | null; email: string; externo: string; vetada: number }>()
      : null
  if (fila?.vetada) throw new Rechazo(403, BLOQUEADA)
  if (!fila || !vigencia(fila as Parameters<typeof vigencia>[0], Date.now()).activa) throw new Rechazo(401, 'Para usar las voces de Sloth, crea tu cuenta gratis de Sloth.')
  if (!DE_LA_APP.test(equipo)) {
    await vigilar(env, fila.email, 'pidió voces de Voices Cloning sin la app de Sloth, con un identificador de computadora inventado')
    throw new Rechazo(403, 'Detectamos actividad sospechosa: esto no viene de la app de Sloth. Tu cuenta queda vigilada.')
  }
  return { externo: fila.externo, creador: false, email: fila.email }
}

/** Mismo lote de socio que los demás pedidos de voz; nunca una cuenta personal del proveedor. */
function repartidor(env: Env, ctx: ExecutionContext, llaves: Llave[]): RepartidorVoz {
  return {
    async preparar(externo) {
      return (await cuentaDe(env, ctx, llaves, externo, 0)).llave.id
    },
    async quedan(externo, id) {
      const r = await vc(llaves.find((l) => l.id === id)!, 'GET', `/api/partner/v1/users/${encodeURIComponent(externo)}`)
      if (r.status >= 400) throw new Error(mensajeDe(r))
      return numero(r.datos.credits) ?? 0
    },
    async sumar(externo, id, creditos) {
      const llave = llaves.find((l) => l.id === id)!
      const t = Date.now()
      const r = await vc(llave, 'POST', `/api/partner/v1/users/${encodeURIComponent(externo)}/credits`, { cuerpo: { amount: creditos } })
      anotar(env, ctx, { externo, accion: 'creditos', llave, creditos, ms: Date.now() - t, r })
      if (r.status >= 400) throw new Error(mensajeDe(r))
    }
  }
}

/** Para la rifa (`rifa.ts`): el mismo repartidor de los créditos mensuales, o nada si el cobro no tiene llaves de socio. */
export async function repartidorVoz(env: Env, ctx: ExecutionContext): Promise<RepartidorVoz | undefined> {
  const llaves = await llavesDe(env)
  return llaves.length ? repartidor(env, ctx, llaves) : undefined
}

/** Si las voces de Sloth ya son de todos (no solo del creador). */
export const vozAbierta = async (env: Env) => !(await soloCreador(env))

/** Cada diez minutos: créditos y correo de quienes apoyan, sin que necesiten abrir la app. */
export async function renovarVoces(env: Env, ctx: ExecutionContext): Promise<void> {
  const llaves = await llavesDe(env)
  if (llaves.length) await repartirVozMensual(env, repartidor(env, ctx, llaves))
}

const nombreDe = (externo: string) => (externo === CREADOR_VOZ ? 'Vancci (creador de Sloth)' : 'Usuario de Sloth')

/** Da de alta a alguien en una llave (Voices Cloning no lo duplica: responde 200 si ya existía). */
async function alta(env: Env, ctx: ExecutionContext, llave: Llave, externo: string, creditos: number): Promise<Respuesta> {
  const t = Date.now()
  const r = await vc(llave, 'POST', '/api/partner/v1/users', { cuerpo: { external_id: externo, name: nombreDe(externo), credits: creditos } })
  if (r.status === 201 || r.status >= 400) anotar(env, ctx, { externo, accion: 'alta', llave, creditos, ms: Date.now() - t, r })
  if (r.status >= 400) throw new Rechazo(r.status === 401 ? 502 : r.status, mensajeDe(r))
  return r
}

const creditosIniciales = (env: Env) => Math.max(0, Math.floor(Number(env.VOZ_CREDITOS) || 0))
const inicialesDe = (env: Env, q: Quien) => (q.creador ? 0 : creditosIniciales(env))

/** Lo que se manda a `/api/v1/tts`, comprobado: el texto (hasta 5.000 letras), la voz y, si viene, la velocidad. */
export function pedidoTts(c: Record<string, unknown>): { text: string; voice_id: string; speed?: number } {
  const text = typeof c.text === 'string' ? c.text.trim() : ''
  const voice_id = typeof c.voice_id === 'string' ? c.voice_id.trim() : ''
  if (!text) throw new Rechazo(400, 'Falta el texto.')
  if (text.length > MAX_LETRAS) throw new Rechazo(400, `Son ${text.length} letras: las voces de Sloth aceptan ${MAX_LETRAS} por llamada.`)
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

/** Una llamada a Voices Cloning con una llave del socio. Sin conexión, responde como un 502 suyo. */
async function vc(llave: Llave, metodo: string, ruta: string, o: { usuario?: string; cuerpo?: unknown } = {}): Promise<Respuesta> {
  let r: Response
  try {
    r = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: { authorization: `Bearer ${llave.valor}`, 'content-type': 'application/json', ...(o.usuario ? { 'x-partner-user': o.usuario } : {}) },
      body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo),
      signal: AbortSignal.timeout(ruta === '/api/v1/tts' ? 6 * 60_000 : 30_000)
    })
  } catch {
    return { status: 502, datos: { error: 'No hubo conexión con las voces de Sloth.', code: 'sin_conexion' } }
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
  if (codigo === 'insufficient_credits') return 'Se te acabaron los créditos de voz de Sloth. Pídele más al creador de Sloth o usa otra voz.'
  if (codigo === 'partner_balance_empty') return 'Las voces de Sloth no están disponibles ahora: se acabó su saldo. El creador ya puede verlo; mientras, usa otra voz.'
  if (codigo === 'partner_daily_limit') return 'Se llegó al tope del día de las voces de Sloth. Se libera a medianoche, hora de Lima (las 23:00 en la Ciudad de México).'
  if (codigo === 'queue_full' || r.status === 429) return `Las voces de Sloth tienen mucha demanda ahora. Intenta otra vez en ${r.espera ?? 'unos'} segundos.`
  if (r.status === 504) return 'La voz tardó más de lo normal (no se cobró): sigue con su tarea o vuelve a pedirla.'
  if (r.status === 401) return 'Las voces de Sloth no aceptaron su llave. Avísale al creador.'
  if (r.status === 403) return 'Tu usuario de las voces de Sloth está suspendido. Pregúntale al creador de Sloth.'
  if (r.status === 404) return suyo ? `Las voces de Sloth no lo encontraron: ${suyo}` : 'Las voces de Sloth no tienen eso (¿la voz existe?).'
  if (codigo === 'invalid_body' || r.status === 400) return `Las voces de Sloth no aceptaron el pedido${suyo ? `: ${suyo}` : '.'}`
  if (codigo === 'sin_conexion') return 'No hubo conexión con las voces de Sloth. Intenta otra vez en un momento.'
  return `Las voces de Sloth respondieron ${r.status}${suyo ? `: ${suyo}` : '.'}`
}

/** Anota la llamada en `voz_registro` sin detener la respuesta. */
function anotar(env: Env, ctx: ExecutionContext, a: Anotacion) {
  const d = a.r.datos
  const fallo = a.r.status >= 400
  ctx.waitUntil(
    env.DB.prepare('INSERT INTO voz_registro (cuando, externo, accion, llave, voz, letras, creditos, restantes, tarea, status, codigo, error, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        new Date().toISOString(),
        a.externo,
        a.accion,
        a.llave.id,
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
