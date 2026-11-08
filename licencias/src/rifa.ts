/**
 * La rifa de la comunidad: el creador rifa créditos de voz de Sloth (o algo que da a mano) entre quienes no tienen los
 * créditos de cada mes. Arriba de la comunidad sale «Participa en la rifa · Llévate créditos de Sloth» (`web/src/Rifa.tsx`)
 * y en Administrador se abre, se sortea con la ruleta y se cierra (`web/src/RifaAdmin.tsx`).
 *
 * - Participa una persona por correo (`externo`, el id de la primera licencia de su correo, el mismo usuario que en las
 *   voces), con un botón. Quien ya recibe los créditos de cada mes (paga activamente $15 USD o más, `daCreditos`) o es
 *   Fundador queda fuera (`fuera`). Las cuentas gratis y quien apoya con menos sí entran. Se vuelve a mirar en cada
 *   sorteo: quien empezó a apoyar después ya no entra.
 * - Abrirla no dice qué se rifa. La rifa sigue abierta hasta que el creador la cierra, y mientras sortea cuando quiere:
 *   ahora unos premios, veinte minutos después otros. Cada sorteo lleva una lista de premios, del mayor al menor, y cada
 *   premio (`rifa_sorteos`, migración 0025) dice cuántos lo ganan y los créditos de cada uno (o es uno a mano). Nadie gana dos veces en la misma rifa, y quien entra entre sorteos
 *   participa en los siguientes. Solo una abierta a la vez.
 * - Sortear elige al azar (`crypto.getRandomValues`, sin sesgo) y guarda el sorteo y sus ganadores en una sola
 *   transacción: con la rifa ya cerrada no entra nada, y dos sorteos cruzados no dan el mismo ganador dos veces.
 * - A cada ganador se le suman sus créditos en su cuenta de voz de Sloth (el repartidor de `voz.ts`, como los mensuales),
 *   le llega un correo y, en su Sloth, el aviso a pantalla completa (`web/src/GanasteRifa.tsx`, que sale de
 *   `GET /comunidad/avisos?cuenta`). La suma no se repite sola si pudo haber llegado (`revisar`); el creador decide en
 *   Administrador. Lo que quedó a medias, y los correos que no salieron, los retoma el cron (`entregarRifas`).
 *
 * Rutas (dentro de `/comunidad`, con quién eres de `comunidad.ts`):
 * - `GET /comunidad/rifa`: la abierta (con quién ya ganó), si participas, ganaste o por qué no puedes, la última que se
 *   cerró y lo que ganaste sin verlo.
 * - `POST /comunidad/rifa/participar` y `POST /comunidad/rifa/visto` `{rifa}` (cerraste el aviso de que ganaste).
 * - Solo el creador: `GET /comunidad/rifa/admin`; `POST /comunidad/rifa/crear`, `/sortear` `{rifa, premios: [{ganadores,
 *   creditos, premio?}]}`, `/cerrar` `{rifa}` y `/ganador` `{rifa, externo, accion: 'reintentar' | 'entregado'}`.
 */
import type { GanadorRifa, RifaAdmin, RifaComunidad, RifaGanada, SorteoRifa } from '../../shared/types.ts'
import { correo, cuerpo, esFundador, type Env, letras, Rechazo } from './index.ts'
import { repartidorVoz, vozAbierta } from './voz.ts'
import { daCreditos, desdeCuanto, type RepartidorVoz } from './voz-mensual.ts'

/** Quién pide, de `comunidad.ts`. */
export interface QuienRifa {
  id: string
  clave: string
  nombre: string
  creador: boolean
}

const MAX_GANADORES = 100
const MAX_CREDITOS = 10_000_000
/** Cuánto se enseña en la comunidad quién ganó la última. */
const RECIENTE = 7 * 24 * 3600_000
const ID = /^[a-z0-9]{12}$/
const SIN_NOMBRE = 'Alguien de la comunidad'

type Fuera = 'vetada' | 'fundador' | 'apoya'
function porQue(env: Env, f: Fuera): string {
  const d = desdeCuanto(env)
  if (f === 'vetada') return 'Tu cuenta está bloqueada.'
  if (f === 'fundador') return `Los Fundadores no participan en la rifa: es para quien no tiene los créditos de cada mes (cuentas gratis y apoyos de menos de $${d.monto} ${d.moneda}).`
  return `Tú ya apoyas a Sloth con $${d.monto} ${d.moneda} o más y tienes tus 100,000 créditos cada mes: la rifa es para quien no los tiene.`
}

/**
 * Lo que deja fuera de la rifa al correo `email` (una expresión SQL), o NULL si puede entrar: bloqueado, Fundador (el
 * que pagó su lugar o el gratis de por vida, por decisión del creador) o quien ya recibe los créditos de cada mes
 * (`daCreditos`: paga activamente $15 USD o más). Quien apoya con menos (el monto que elige, desde $1) sí participa.
 * Su alias (`rf`) no es el de ninguna consulta que la use: con el mismo, compararía cada correo consigo mismo.
 */
export const fuera = (env: Env, email: string) => `(SELECT CASE
  WHEN MAX(rf.estado = 'vetada') THEN 'vetada'
  WHEN MAX(${esFundador('rf')}) THEN 'fundador'
  WHEN MAX(${daCreditos(env, 'rf', "'now'")}) THEN 'apoya'
  END FROM licencias rf WHERE rf.email = ${email})`

interface Guardada {
  id: string
  estado: 'abierta' | 'terminada' | 'cancelada'
  creada: string
  terminada: string | null
  participantes?: number
}

interface Ganador {
  rifa: string
  externo: string
  miembro: string
  email: string
  premio: string
  creditos: number
  estado: GanadorRifa['estado']
  intento: string | null
  correo: string | null
}

interface Participante {
  externo: string
  miembro: string
  desde: string
  nombre: string
  email: string
  fuera: Fuera | null
  /** Lo que ya ganó en esta rifa. */
  gano: string | null
}

export async function rifa(req: Request, env: Env, ctx: ExecutionContext, yo: QuienRifa, ruta: string): Promise<unknown> {
  if (req.method === 'GET' && ruta === '/comunidad/rifa') return vista(env, yo)
  if (req.method === 'POST' && ruta === '/comunidad/rifa/participar') return participar(env, yo)
  if (req.method === 'POST' && ruta === '/comunidad/rifa/visto') {
    const id = String((await cuerpo(req)).rifa ?? '')
    await env.DB.prepare('UPDATE rifa_ganadores SET visto = ? WHERE rifa = ? AND miembro = ? AND visto IS NULL').bind(new Date().toISOString(), id, yo.id).run()
    return { ok: true }
  }
  if (!yo.creador) throw new Rechazo(403, 'Eso solo lo hace el creador de Sloth.')
  if (req.method === 'GET' && ruta === '/comunidad/rifa/admin') return panel(env)
  if (req.method !== 'POST') throw new Rechazo(404, 'No existe')
  const c = await cuerpo(req)
  if (ruta === '/comunidad/rifa/crear') return crear(env)
  if (ruta === '/comunidad/rifa/sortear') return sortear(env, ctx, c)
  if (ruta === '/comunidad/rifa/cerrar') {
    // Con ganadores queda terminada (y la comunidad ve quién ganó qué); sin ninguno, cancelada.
    const r = await env.DB.prepare(
      "UPDATE rifas SET estado = CASE WHEN EXISTS (SELECT 1 FROM rifa_ganadores g WHERE g.rifa = rifas.id) THEN 'terminada' ELSE 'cancelada' END, terminada = ? WHERE id = ? AND estado = 'abierta'"
    )
      .bind(new Date().toISOString(), String(c.rifa ?? ''))
      .run()
    if (!r.meta.changes) throw new Rechazo(409, 'Esa rifa ya estaba cerrada.')
    return panel(env)
  }
  if (ruta === '/comunidad/rifa/ganador') return ganador(env, ctx, c)
  throw new Rechazo(404, 'No existe')
}

// ── Lo de todos ─────────────────────────────────────────────────────────────────────────────────────────────────

/** La persona de una clave: su correo, su usuario (`externo`) y si la rifa la deja fuera. El creador no tiene. */
async function persona(env: Env, clave: string) {
  return env.DB.prepare(
    `SELECT l.email, (SELECT v.id FROM licencias v WHERE v.email = l.email ORDER BY v.creada, v.id LIMIT 1) AS externo, ${fuera(env, 'l.email')} AS fuera FROM licencias l WHERE l.clave = ?`
  )
    .bind(clave)
    .first<{ email: string; externo: string; fuera: Fuera | null }>()
}

const abiertaAhora = (env: Env) =>
  env.DB.prepare("SELECT r.*, (SELECT COUNT(*) FROM rifa_participantes p WHERE p.rifa = r.id) AS participantes FROM rifas r WHERE r.estado = 'abierta'").first<Guardada>()

const nombresDe = (filas: { nombre: string | null }[]) => filas.map((x) => x.nombre || SIN_NOMBRE)

async function vista(env: Env, yo: QuienRifa): Promise<RifaComunidad> {
  const [abierta, p, ultima, gane] = await Promise.all([
    abiertaAhora(env),
    yo.creador ? null : persona(env, yo.clave),
    env.DB.prepare("SELECT * FROM rifas WHERE estado = 'terminada' AND terminada > ? ORDER BY terminada DESC LIMIT 1").bind(new Date(Date.now() - RECIENTE).toISOString()).first<Guardada>(),
    ganada(env, yo.id)
  ])
  const quienes = (rifa: string) =>
    env.DB.prepare('SELECT m.nombre, g.premio, g.externo FROM rifa_ganadores g LEFT JOIN miembros m ON m.id = g.miembro WHERE g.rifa = ? ORDER BY g.cuando, g.rowid')
      .bind(rifa)
      .all<{ nombre: string | null; premio: string; externo: string }>()
      .then((r) => r.results)
  const [enLaAbierta, enLaUltima, participo] = await Promise.all([
    abierta ? quienes(abierta.id) : [],
    ultima ? quienes(ultima.id) : [],
    abierta && p ? env.DB.prepare('SELECT 1 FROM rifa_participantes WHERE rifa = ? AND externo = ?').bind(abierta.id, p.externo).first() : null
  ])
  const ganaste = p ? enLaAbierta.find((g) => g.externo === p.externo)?.premio : undefined
  return {
    // Sin qué se rifa: el creador lo elige en cada sorteo.
    ...(abierta ? { abierta: { id: abierta.id, creada: abierta.creada, participantes: abierta.participantes ?? 0, ganadores: nombresDe(enLaAbierta) } } : {}),
    participo: !!participo,
    ...(ganaste ? { ganaste } : {}),
    ...(yo.creador ? { fuera: 'El creador no participa en su propia rifa.' } : p?.fuera ? { fuera: porQue(env, p.fuera) } : {}),
    ...(p ? { correo: p.email } : {}),
    ...(ultima && enLaUltima.length ? { ultima: { ganadores: enLaUltima.map((g) => ({ nombre: g.nombre || SIN_NOMBRE, premio: g.premio })), terminada: ultima.terminada! } } : {}),
    ...(gane ? { gane } : {})
  }
}

/** Lo que ganó el miembro `miembro` y aún no ve en su Sloth (el aviso a pantalla completa). */
export async function ganada(env: Env, miembro: string): Promise<RifaGanada | undefined> {
  const g = await env.DB.prepare('SELECT rifa, premio, creditos, estado FROM rifa_ganadores WHERE miembro = ? AND visto IS NULL ORDER BY cuando DESC LIMIT 1')
    .bind(miembro)
    .first<{ rifa: string; premio: string; creditos: number; estado: string }>()
  return g ? { rifa: g.rifa, premio: g.premio, creditos: g.creditos, entregados: g.estado === 'entregado' } : undefined
}

async function participar(env: Env, yo: QuienRifa): Promise<RifaComunidad> {
  if (yo.creador) throw new Rechazo(403, 'El creador no participa en su propia rifa.')
  const abierta = await abiertaAhora(env)
  if (!abierta) throw new Rechazo(409, 'Ahora no hay ninguna rifa abierta.')
  const p = await persona(env, yo.clave)
  if (!p) throw new Rechazo(401, 'Para participar, crea tu cuenta gratis de Sloth.')
  if (p.fuera) throw new Rechazo(403, porQue(env, p.fuera))
  await env.DB.prepare('INSERT OR IGNORE INTO rifa_participantes (rifa, externo, miembro, desde) VALUES (?, ?, ?, ?)').bind(abierta.id, p.externo, yo.id, new Date().toISOString()).run()
  return vista(env, yo)
}

// ── El creador ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Lo que se lleva cada ganador de un premio con créditos, sin nombre: «1 llave de 10,000 créditos de Sloth». */
export const premioDe = (creditos: number) => `1 llave de ${creditos.toLocaleString('en-US')} créditos de Sloth`

/** Abrir no dice qué se rifa: la comunidad solo ve «llévate créditos de Sloth». Qué y para cuántos, en cada sorteo. */
async function crear(env: Env): Promise<RifaAdmin> {
  try {
    await env.DB.prepare("INSERT INTO rifas (id, estado, creada) VALUES (?, 'abierta', ?)").bind(letras(12).toLowerCase(), new Date().toISOString()).run()
  } catch (e) {
    if (/UNIQUE/i.test(String(e instanceof Error ? e.message : e))) throw new Rechazo(409, 'Ya hay una rifa abierta: ciérrala antes de abrir otra.')
    throw e
  }
  return panel(env)
}

/** El azar sin sesgo, de 0 a `max - 1`. */
export function azarSeguro(max: number): number {
  const tope = Math.floor(0x1_0000_0000 / max) * max
  const u = new Uint32Array(1)
  do crypto.getRandomValues(u)
  while (u[0] >= tope)
  return u[0] % max
}

/** `n` distintos de `lista`, al azar y en el orden en que salieron (Fisher-Yates a medias). */
export function elegir<T>(lista: T[], n: number, azar: (max: number) => number = azarSeguro): T[] {
  const copia = [...lista]
  const k = Math.min(Math.max(0, n), copia.length)
  for (let i = 0; i < k; i++) {
    const j = i + azar(copia.length - i)
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia.slice(0, k)
}

const participantes = (env: Env, rifa: string) =>
  env.DB.prepare(
    `SELECT p.externo, p.miembro, p.desde, COALESCE(m.nombre, '') AS nombre, o.email, ${fuera(env, 'o.email')} AS fuera,
    (SELECT g.premio FROM rifa_ganadores g WHERE g.rifa = p.rifa AND g.externo = p.externo) AS gano
    FROM rifa_participantes p JOIN licencias o ON o.id = p.externo LEFT JOIN miembros m ON m.id = p.miembro WHERE p.rifa = ? ORDER BY p.desde`
  )
    .bind(rifa)
    .all<Participante>()
    .then((r) => r.results)

/** Para la ruleta, que puede verse en un live: su nombre o, sin él, el correo tapado. */
export function nombreDe(p: { nombre: string; email: string }): string {
  if (p.nombre) return p.nombre
  const [usuario, dominio] = p.email.split('@')
  return `${usuario.slice(0, 2)}•••@${dominio ?? ''}`
}

/** Un premio del sorteo: cuántos lo ganan, los créditos de cada uno (0: un premio a mano) y lo que se lleva cada ganador. */
/** Lo más que lleva una lista de premios. */
const MAX_PREMIOS = 20

/**
 * Los premios de un sorteo, en el orden en que se rifan (el mayor primero): `premios` es la lista; sin ella, el cuerpo
 * es un premio solo. Entre todos, no más de `MAX_GANADORES` ganadores.
 */
export function premiosDelSorteo(c: Record<string, unknown>): { ganadores: number; creditos: number; premio: string }[] {
  const lista = Array.isArray(c.premios) ? c.premios : [c]
  if (!lista.length || lista.length > MAX_PREMIOS) throw new Rechazo(400, `Pon de 1 a ${MAX_PREMIOS} premios.`)
  const premios = lista.map((x) => premioDelSorteo(x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
  if (premios.reduce((n, x) => n + x.ganadores, 0) > MAX_GANADORES) throw new Rechazo(400, `Entre todos los premios, no más de ${MAX_GANADORES} ganadores.`)
  return premios
}

export function premioDelSorteo(c: Record<string, unknown>): { ganadores: number; creditos: number; premio: string } {
  const ganadores = Number(c.ganadores)
  const creditos = Number(c.creditos ?? 0)
  if (!Number.isInteger(ganadores) || ganadores < 1 || ganadores > MAX_GANADORES) throw new Rechazo(400, `Di cuántos ganan: de 1 a ${MAX_GANADORES}.`)
  if (!Number.isInteger(creditos) || creditos < 0 || creditos > MAX_CREDITOS) throw new Rechazo(400, 'Los créditos de cada ganador son un número entero, 0 si no lleva créditos.')
  const premio = String(c.premio ?? '').replace(/\s+/g, ' ').trim().slice(0, 140) || (creditos ? premioDe(creditos) : '')
  if (!premio) throw new Rechazo(400, 'Di qué se rifa.')
  return { ganadores, creditos, premio }
}

async function sortear(env: Env, ctx: ExecutionContext, c: Record<string, unknown>): Promise<SorteoRifa> {
  const id = String(c.rifa ?? '')
  const r = ID.test(id) ? await env.DB.prepare('SELECT * FROM rifas WHERE id = ?').bind(id).first<Guardada>() : null
  if (!r || r.estado !== 'abierta') throw new Rechazo(409, 'Esa rifa ya está cerrada.')
  const premios = premiosDelSorteo(c)
  if (premios.some((x) => x.creditos > 0)) {
    if (!(await vozAbierta(env))) throw new Rechazo(409, 'Las voces de Sloth aún son solo para ti: los créditos se rifan cuando se publique la actualización que las abre.')
    if (!(await repartidorVoz(env, ctx))) throw new Rechazo(503, 'Falta la llave de socio de Voices Cloning en el cobro.')
  }
  // Entran quienes siguen pudiendo participar y aún no ganan en esta rifa.
  const entran = (await participantes(env, id)).filter((p) => !p.fuera && !p.gano)
  if (!entran.length) throw new Rechazo(409, 'Nadie puede ganar: no hay participantes que no hayan ganado ya.')
  // Todos los ganadores de una vez, sin repetir, y se reparten en orden: los primeros, el primer premio. Si hay menos
  // participantes que ganadores, se quedan sin rifar los últimos premios.
  const elegidos = elegir(entran, premios.reduce((n, x) => n + x.ganadores, 0))
  const cuando = new Date().toISOString()
  const reparto: { sorteo: string; premio: (typeof premios)[number]; quienes: Participante[] }[] = []
  let i = 0
  for (const premio of premios) {
    const quienes = elegidos.slice(i, i + premio.ganadores)
    i += premio.ganadores
    if (quienes.length) reparto.push({ sorteo: letras(12).toLowerCase(), premio, quienes })
  }
  // Una sola transacción: con la rifa cerrada no entra ningún premio, ni sus ganadores; si otro sorteo cruzado ya eligió
  // a alguien de estos, la llave lo rechaza y no entra nada.
  let hechos: D1Result[]
  try {
    hechos = await env.DB.batch(
      reparto.flatMap(({ sorteo, premio, quienes }) => [
        env.DB.prepare("INSERT INTO rifa_sorteos (id, rifa, premio, creditos, ganadores, cuando) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rifas WHERE id = ? AND estado = 'abierta')").bind(
          sorteo,
          id,
          premio.premio,
          premio.creditos,
          quienes.length,
          cuando,
          id
        ),
        ...quienes.map((g) =>
          env.DB.prepare(
            'INSERT INTO rifa_ganadores (rifa, externo, sorteo, miembro, email, premio, creditos, estado, cuando) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rifa_sorteos WHERE id = ?)'
          ).bind(id, g.externo, sorteo, g.miembro, g.email, premio.premio, premio.creditos, premio.creditos > 0 ? 'pendiente' : 'a-mano', cuando, sorteo)
        )
      ])
    )
  } catch (e) {
    if (/UNIQUE|PRIMARY|constraint/i.test(String(e instanceof Error ? e.message : e))) throw new Rechazo(409, 'Se cruzó con otro sorteo: vuelve a girar.')
    throw e
  }
  if (!hechos[0].meta.changes) throw new Rechazo(409, 'Esa rifa ya está cerrada.')
  // La ruleta empieza ya; los créditos y los correos salen mientras gira.
  ctx.waitUntil(entregarRifas(env, ctx, id).catch((e) => console.error('Premios de la rifa', id, e instanceof Error ? e.message : e)))
  return {
    participantes: entran.map((p) => ({ externo: p.externo, nombre: nombreDe(p) })),
    ganadores: reparto.flatMap(({ premio, quienes }) => quienes.map((p) => ({ externo: p.externo, nombre: nombreDe(p), premio: premio.premio })))
  }
}

async function ganador(env: Env, ctx: ExecutionContext, c: Record<string, unknown>): Promise<RifaAdmin> {
  const rifa = String(c.rifa ?? '')
  const externo = String(c.externo ?? '')
  if (c.accion === 'reintentar') {
    const r = await env.DB.prepare("UPDATE rifa_ganadores SET estado = 'pendiente', error = NULL WHERE rifa = ? AND externo = ? AND estado IN ('revisar', 'pendiente')").bind(rifa, externo).run()
    if (!r.meta.changes) throw new Rechazo(409, 'Ese premio ya no está para volver a intentar.')
  } else if (c.accion === 'entregado') {
    const r = await env.DB.prepare("UPDATE rifa_ganadores SET estado = 'entregado', entregado = ?, error = NULL WHERE rifa = ? AND externo = ? AND estado IN ('revisar', 'pendiente', 'enviando')")
      .bind(new Date().toISOString(), rifa, externo)
      .run()
    if (!r.meta.changes) throw new Rechazo(409, 'Ese premio ya estaba entregado.')
  } else throw new Rechazo(400, 'La acción es reintentar o entregado.')
  await entregarRifas(env, ctx, rifa)
  return panel(env)
}

async function panel(env: Env): Promise<RifaAdmin> {
  const [abierta, ganadores, abiertaVoz] = await Promise.all([
    abiertaAhora(env),
    env.DB.prepare("SELECT g.*, COALESCE(m.nombre, '') AS nombre FROM rifa_ganadores g LEFT JOIN miembros m ON m.id = g.miembro ORDER BY g.cuando DESC, g.rowid DESC LIMIT 200").all<
      GanadorRifa & { miembro: string }
    >(),
    vozAbierta(env)
  ])
  let conLista: RifaAdmin['abierta']
  if (abierta) {
    const lista = await participantes(env, abierta.id)
    conLista = {
      id: abierta.id,
      creada: abierta.creada,
      participantes: abierta.participantes ?? 0,
      ganadores: nombresDe(ganadores.results.filter((g) => g.rifa === abierta.id).reverse()),
      lista: lista.map((p) => ({ externo: p.externo, nombre: p.nombre, email: p.email, desde: p.desde, ...(p.fuera ? { fuera: porQue(env, p.fuera) } : {}), ...(p.gano ? { gano: p.gano } : {}) }))
    }
  }
  return {
    vozAbierta: abiertaVoz,
    ...(conLista ? { abierta: conLista } : {}),
    ganadores: ganadores.results.map((g) => ({
      rifa: g.rifa,
      externo: g.externo,
      nombre: g.nombre,
      email: g.email,
      premio: g.premio,
      creditos: g.creditos,
      cuando: g.cuando,
      estado: g.estado,
      correo: g.correo,
      visto: g.visto,
      error: g.error
    }))
  }
}

// ── La entrega ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Los premios a medias: los créditos que faltan por sumar y los correos que no salieron, de una rifa o de todas (el
 * cron, cada diez minutos). Pocos a la vez: uno que falla no frena al resto.
 */
export async function entregarRifas(env: Env, ctx: ExecutionContext, rifa?: string): Promise<void> {
  const viejo = new Date(Date.now() - 5 * 60_000).toISOString()
  const filas = await env.DB.prepare(
    `SELECT g.* FROM rifa_ganadores g WHERE (?1 IS NULL OR g.rifa = ?1)
    AND (g.estado = 'pendiente' OR (g.estado = 'preparando' AND g.intento < ?2) OR (g.estado IN ('entregado', 'a-mano') AND g.correo IS NULL)) LIMIT 20`
  )
    .bind(rifa ?? null, viejo)
    .all<Ganador>()
  if (!filas.results.length) return
  const repartidor = filas.results.some((g) => g.estado === 'pendiente' || g.estado === 'preparando') ? await repartidorVoz(env, ctx) : undefined
  for (const g of filas.results) {
    try {
      await entregarPremio(env, g, repartidor)
    } catch (e) {
      console.error('Premio de la rifa', g.rifa, g.externo, e instanceof Error ? e.message : e)
    }
  }
}

/**
 * Como los créditos mensuales (`voz-mensual.ts`): se toma el premio, se prepara su cuenta (repetible) y se marca
 * `enviando` ANTES de pedir la suma, que no tiene idempotencia. Un corte ahí deja `revisar`, nunca una suma doble.
 */
export async function entregarPremio(env: Env, g: Ganador, repartidor: RepartidorVoz | undefined, ahora = new Date()): Promise<void> {
  if (g.estado === 'pendiente' || g.estado === 'preparando') {
    if (!repartidor) return
    const intento = ahora.toISOString()
    const donde = 'WHERE rifa = ? AND externo = ?'
    const tomada = await env.DB.prepare(`UPDATE rifa_ganadores SET estado = 'preparando', intento = ?, error = NULL ${donde} AND (estado = 'pendiente' OR (estado = 'preparando' AND intento < ?))`)
      .bind(intento, g.rifa, g.externo, new Date(ahora.getTime() - 5 * 60_000).toISOString())
      .run()
    if (!tomada.meta.changes) return
    let llave: string
    try {
      llave = await repartidor.preparar(g.externo)
    } catch (e) {
      await env.DB.prepare(`UPDATE rifa_ganadores SET estado = 'pendiente', error = ? ${donde} AND estado = 'preparando' AND intento = ?`).bind(mensaje(e), g.rifa, g.externo, intento).run()
      return
    }
    const enviando = await env.DB.prepare(`UPDATE rifa_ganadores SET estado = 'enviando' ${donde} AND estado = 'preparando' AND intento = ?`).bind(g.rifa, g.externo, intento).run()
    if (!enviando.meta.changes) return
    try {
      await repartidor.sumar(g.externo, llave, g.creditos)
    } catch (e) {
      await env.DB.prepare(`UPDATE rifa_ganadores SET estado = 'revisar', error = ? ${donde}`).bind(mensaje(e), g.rifa, g.externo).run()
      return
    }
    await env.DB.prepare(`UPDATE rifa_ganadores SET estado = 'entregado', entregado = ? ${donde}`).bind(intento, g.rifa, g.externo).run()
    g = { ...g, estado: 'entregado' }
  }
  if ((g.estado === 'entregado' || g.estado === 'a-mano') && !g.correo) await avisar(env, g)
}

const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 300)

/** El correo al ganador, en el tono de Vancci (`docs/agents/anuncios.md`), como el aviso de su Sloth (`GanasteRifa.tsx`). */
async function avisar(env: Env, g: Ganador): Promise<void> {
  const cuantos = g.creditos.toLocaleString('en-US')
  const enviada = await correo(
    env,
    g.email,
    `GANASTE LA RIFA DE SLOTH :))) · ${g.premio}`,
    [
      'Holaaaaa como estas, aqui Vancci.',
      `NETA FELICIDADES, ganaste la rifa de Sloth: ${g.premio}. Gracias por estar en la comunidad, esto es para ti :)))`,
      ...(g.creditos > 0
        ? [
            `Ya te deje ${cuantos} CREDITOS DE VOZ en tu cuenta de Sloth, completamente gratis. No tienes que hacer nada mas, ya estan ahi.`,
            'Para usarlos actualiza Sloth y entra a Opciones > Voz > Voces de Sloth, ahi los ves. Ya con eso escoges una voz o clonas LA TUYA con una grabacion, y el agente la usa solita para tus videos. Ojo, los creditos son SOLO para la voz, los agentes de IA siguen con su propia cuenta.'
          ]
        : ['Te escribo en estos dias para darte tu premio. Si quieres adelantarte respondeme este correo y lo vemos.']),
      'Si algo no jala o tienes dudas respondeme este correo, contesto ABSOLUTAMENTE TODO. Un abrazoooooo',
      'Vancci · Descarga o actualiza Sloth en https://sloth.vancci.org'
    ],
    `rifa/${g.rifa}/${g.externo}`
  )
  if (enviada) await env.DB.prepare('UPDATE rifa_ganadores SET correo = ? WHERE rifa = ? AND externo = ?').bind(new Date().toISOString(), g.rifa, g.externo).run()
}
