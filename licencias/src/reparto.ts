/**
 * El reparto del fondo de la comunidad (`fondo.ts`, ADR 0019): quién participa, cuánto le toca a cada quien y cómo se
 * cierra y se paga cada periodo. Lo ven `web/src/Fondo.tsx` (cada quien, lo suyo) y `web/src/FondoAdmin.tsx` (el creador).
 *
 * Participar es de quien quiera: pone su Binance ID y, desde entonces, sus estilos se llevan del fondo la parte de sus
 * puntos (`tienda.ts`); sin él, sus puntos se ven pero el fondo se reparte entre los demás. Lo que gana cada quien
 * depende de cuánta gente usa sus estilos. El pago lo manda el creador a mano desde Binance, al Binance ID de cada parte.
 *
 * Para que nadie se aproveche:
 * - Un Binance ID va en una sola cuenta de Sloth (Binance pide identificación: una persona, un ID), y nadie más lo ve:
 *   su dueño, tapado; entero, solo el creador al pagar.
 * - Cada cambio queda anotado con su conexión cifrada (`binance_cambios`), avisa por correo al dueño de la cuenta (si
 *   alguien entró a ella para desviar el pago, se entera) y tiene su tope al día.
 * - El creador cierra el periodo cuando ya terminó: queda una foto (`repartos`, `reparto_partes`) con el fondo, los
 *   puntos y el Binance ID de ese momento. Lo que cambie después no mueve lo que se paga.
 * - Antes de pagar, cada parte trae sus avisos: el Binance ID cambiado hace poco, la cuenta vigilada, o que casi todas
 *   las cuentas que usaron sus estilos se abrieron en el periodo. Las pruebas de cada video se revisan en la tienda.
 * - Los videos solo suman desde cuentas que apoyan y con más de 7 días, una persona por conexión (`tienda.ts`).
 *
 * - `GET /comunidad/fondo/mio`: si participas, tu Binance ID tapado, tus puntos y lo que llevas, y tus partes de antes.
 * - `POST /comunidad/fondo/participar` `{binance}` y `POST /comunidad/fondo/salir`.
 * - Solo el creador: `GET /comunidad/fondo/reparto?periodo=` (en vivo, o la foto si ya cerró), `POST
 *   /comunidad/fondo/cerrar` `{periodo}` y `POST /comunidad/fondo/pagado` `{periodo, miembro, pagado, referencia?}`.
 */
import type { Autor, FondoComunidad, MiFondo, ParteReparto, RepartoFondo } from '../../shared/types.ts'
import { conCupo, esCreador, type Miembro, miembros } from './comunidad.ts'
import { esPeriodo, fondoDe, nombreDe, periodoFondo, periodosHasta, tramoDe } from './fondo.ts'
import { correo, type Env, Rechazo } from './index.ts'
import { estimado, numerosActuales, numerosDe, olvidarNumeros, redDe } from './tienda.ts'

/** El Binance ID: el número de la cuenta (en Binance, Perfil; también se llama Pay ID o UID). */
const BINANCE = /^\d{6,12}$/
const ID = /^[a-z0-9]+$/
const DIA = 24 * 3600_000
/** Un cambio de Binance ID se avisa al pagar durante estos días. */
const RECIENTE = 7 * DIA

interface ConBinance {
  binance: string | null
  binance_desde: string | null
}

const tapado = (binance: string) => `••••${binance.slice(-4)}`
const dinero = (montos: FondoComunidad['montos']) => montos.map((m) => `${m.monto.toFixed(2)} ${m.moneda}`).join(' + ')
const correoDe = async (env: Env, yo: Miembro) => (await env.DB.prepare('SELECT email FROM licencias WHERE clave = ?').bind(yo.clave).first<{ email: string }>())?.email

/** Lo que le toca a cada autor de un periodo: los puntos de sus estilos, y quién se lleva del fondo. */
export function partesDe(
  estilos: Iterable<{ id: string; titulo: string; autor: string; participa: boolean }>,
  puntos: Map<string, { puntos: number; personas: number }>
): { dentro: Map<string, { puntos: number; estilos: ParteReparto['estilos'] }>; fuera: Map<string, number> } {
  const dentro = new Map<string, { puntos: number; estilos: ParteReparto['estilos'] }>()
  const fuera = new Map<string, number>()
  for (const e of estilos) {
    const p = puntos.get(e.id)
    if (!p?.puntos) continue
    if (!e.participa) {
      fuera.set(e.autor, (fuera.get(e.autor) ?? 0) + p.puntos)
      continue
    }
    const suya = dentro.get(e.autor) ?? { puntos: 0, estilos: [] }
    suya.puntos += p.puntos
    suya.estilos.push({ id: e.id, titulo: e.titulo, puntos: p.puntos, personas: p.personas })
    dentro.set(e.autor, suya)
  }
  for (const d of dentro.values()) d.estilos.sort((a, b) => b.puntos - a.puntos)
  return { dentro, fuera }
}

/** `GET /comunidad/fondo/mio`: lo de `yo` en el fondo. */
export async function mio(env: Env, yo: Miembro): Promise<MiFondo> {
  const [m, n, f, partes] = await Promise.all([
    env.DB.prepare('SELECT binance, binance_desde FROM miembros WHERE id = ?').bind(yo.id).first<ConBinance>(),
    numerosActuales(env),
    fondoDe(env, periodoFondo()).catch(() => null),
    env.DB.prepare('SELECT periodo, montos, pagado FROM reparto_partes WHERE miembro = ? ORDER BY periodo DESC LIMIT 12').bind(yo.id).all<{ periodo: string; montos: string; pagado: string | null }>()
  ])
  const puntos = [...n.estilos.values()].reduce((s, e) => s + (e.autor === yo.id ? (n.mes.get(e.id)?.puntos ?? 0) : 0), 0)
  const participa = !!m?.binance && !esCreador(yo)
  return {
    participa,
    ...(m?.binance ? { binance: tapado(m.binance) } : {}),
    puntos,
    // Si aún no participa, lo que se llevaría si entrara hoy.
    estimado: f ? estimado(f, puntos, participa ? n.total : n.total + puntos) : [],
    partes: partes.results.map((p) => ({ periodo: p.periodo, mes: nombreDe(p.periodo), montos: JSON.parse(p.montos) as FondoComunidad['montos'], ...(p.pagado ? { pagado: p.pagado } : {}) }))
  }
}

/** `POST /comunidad/fondo/participar` `{binance}`: `yo` participa, o cambia adónde se le paga. */
export async function participar(req: Request, env: Env, yo: Miembro, c: Record<string, unknown>): Promise<MiFondo> {
  if (esCreador(yo)) throw new Rechazo(400, 'Lo del creador de Sloth no se lleva del fondo.')
  if (!yo.nombre) throw new Rechazo(400, 'Antes, dinos cómo te llamas: así te ven los demás.')
  const binance = String(c.binance ?? '').replace(/[\s-]/g, '')
  if (!BINANCE.test(binance)) throw new Rechazo(400, 'Ese no parece un Binance ID: es el número de tu cuenta (en Binance, tu perfil), solo dígitos.')
  const antes = (await env.DB.prepare('SELECT binance FROM miembros WHERE id = ?').bind(yo.id).first<ConBinance>())?.binance ?? null
  if (antes === binance) return mio(env, yo)
  const deOtro = 'Ese Binance ID ya está en otra cuenta de Sloth: cada persona participa con una sola.'
  if (await env.DB.prepare('SELECT 1 FROM miembros WHERE binance = ? AND id != ?').bind(binance, yo.id).first()) throw new Rechazo(409, deOtro)
  if (!(await conCupo(env, yo, 'binance'))) throw new Rechazo(429, 'Ya cambiaste tu Binance ID varias veces hoy. Mañana sigues.')
  const ahora = new Date().toISOString()
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE miembros SET binance = ?, binance_desde = ? WHERE id = ?').bind(binance, ahora, yo.id),
      env.DB.prepare('INSERT INTO binance_cambios (miembro, binance, red, cuando) VALUES (?, ?, ?, ?)').bind(yo.id, binance, await redDe(req, env), ahora)
    ])
  } catch (e) {
    // Dos a la vez con el mismo: el índice deja pasar a uno.
    if (e instanceof Error && /UNIQUE/i.test(e.message)) throw new Rechazo(409, deOtro)
    throw e
  }
  await olvidarNumeros(env)
  await avisarCambio(env, yo, antes ? `Se cambió el Binance ID de tu cuenta de Sloth: ahora termina en ${binance.slice(-4)}.` : `Ya participas en el fondo de la comunidad de Sloth. Tu parte se manda al Binance ID que termina en ${binance.slice(-4)}.`)
  return mio(env, yo)
}

/** `POST /comunidad/fondo/salir`: `yo` deja de participar. Lo ya cerrado se le paga igual. */
export async function salir(req: Request, env: Env, yo: Miembro): Promise<MiFondo> {
  const antes = (await env.DB.prepare('SELECT binance FROM miembros WHERE id = ?').bind(yo.id).first<ConBinance>())?.binance
  if (!antes) return mio(env, yo)
  const ahora = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare('UPDATE miembros SET binance = NULL, binance_desde = ? WHERE id = ?').bind(ahora, yo.id),
    env.DB.prepare("INSERT INTO binance_cambios (miembro, binance, red, cuando) VALUES (?, '', ?, ?)").bind(yo.id, await redDe(req, env), ahora)
  ])
  await olvidarNumeros(env)
  await avisarCambio(env, yo, 'Se quitó el Binance ID de tu cuenta de Sloth: tus estilos ya no se llevan del fondo de la comunidad.')
  return mio(env, yo)
}

/** Al dueño de la cuenta, por correo: si no fue él, que lo sepa antes del pago. Un correo que falla no detiene el cambio. */
async function avisarCambio(env: Env, yo: Miembro, que: string) {
  const email = await correoDe(env, yo)
  if (!email) return
  await correo(env, email, 'Cambió adónde se te paga el fondo de Sloth', ['Hola:', que, 'Si no fuiste tú, responde a este correo antes del siguiente reparto y cambia la clave de tu cuenta.']).catch((e) =>
    console.error('Correo del Binance ID', e instanceof Error ? e.message : e)
  )
}

/** Lo que conviene mirar de cada parte antes de pagarla. */
async function avisosDe(env: Env, periodo: string, partes: Map<string, { estilos: ParteReparto['estilos'] }>, correos: Map<string, string>, ahora: number): Promise<Map<string, string[]>> {
  const avisos = new Map<string, string[]>([...partes.keys()].map((id) => [id, []]))
  if (!partes.size) return avisos
  const ids = [...partes.keys()]
  const signos = ids.map(() => '?').join(', ')
  const emails = [...new Set(correos.values())]
  const [cambios, vigilados, cuentas] = await env.DB.batch([
    env.DB.prepare(`SELECT miembro, COUNT(*) AS n, MAX(cuando) AS ultimo FROM binance_cambios WHERE miembro IN (${signos}) GROUP BY miembro`).bind(...ids),
    emails.length ? env.DB.prepare(`SELECT DISTINCT email FROM vigilados WHERE email IN (${emails.map(() => '?').join(', ')})`).bind(...emails) : env.DB.prepare('SELECT NULL AS email WHERE 0'),
    // De las cuentas que sumaron videos a cada estilo, cuántas se abrieron (su primera clave) ya en el periodo.
    env.DB.prepare(
      `SELECT u.publicacion, COUNT(DISTINCT u.miembro) AS cuentas,
        COUNT(DISTINCT CASE WHEN (SELECT MIN(l2.creada) FROM licencias l2 WHERE l2.email = (SELECT l.email FROM licencias l JOIN miembros m ON m.clave = l.clave WHERE m.id = u.miembro)) >= ? THEN u.miembro END) AS nuevas
      FROM estilo_usos u WHERE u.periodo = ? AND u.tipo = 'video' AND u.descartado = 0 GROUP BY u.publicacion`
    ).bind(new Date(tramoDe(periodo).desde * 1000).toISOString(), periodo)
  ])
  for (const c of cambios.results as { miembro: string; n: number; ultimo: string }[]) {
    const hace = ahora - Date.parse(c.ultimo)
    if (c.n > 1 && hace < RECIENTE) avisos.get(c.miembro)?.push(`Cambió su Binance ID hace ${Math.max(1, Math.round(hace / DIA))} ${Math.round(hace / DIA) > 1 ? 'días' : 'día'}: confirma con la persona antes de pagar.`)
  }
  const mirados = new Set((vigilados.results as { email: string }[]).map((v) => v.email))
  for (const [id, email] of correos) if (mirados.has(email)) avisos.get(id)?.push('Su cuenta está vigilada por actividad sospechosa.')
  const porEstilo = new Map((cuentas.results as { publicacion: string; cuentas: number; nuevas: number }[]).map((c) => [c.publicacion, c]))
  for (const [id, p] of partes) {
    const suyas = p.estilos.flatMap((e) => porEstilo.get(e.id) ?? [])
    const todas = suyas.reduce((s, c) => s + c.cuentas, 0)
    const nuevas = suyas.reduce((s, c) => s + c.nuevas, 0)
    if (nuevas >= 2 && nuevas * 2 >= todas) avisos.get(id)?.push(`${nuevas} de las ${todas} cuentas que hicieron videos con sus estilos se abrieron en este periodo: revisa sus pruebas en la tienda.`)
  }
  return avisos
}

/** El correo y el Binance ID de unos miembros. */
async function datosDe(env: Env, ids: string[]): Promise<Map<string, { email: string; binance: string | null }>> {
  if (!ids.length) return new Map()
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.binance, COALESCE((SELECT l.email FROM licencias l WHERE l.clave = m.clave), '') AS email FROM miembros m WHERE m.id IN (${ids.map(() => '?').join(', ')})`
  )
    .bind(...ids)
    .all<{ id: string; binance: string | null; email: string }>()
  return new Map(results.map((r) => [r.id, { email: r.email, binance: r.binance }]))
}

const sinNombre = (id: string): Autor => ({ id, nombre: '' })

/** El reparto de un periodo abierto, como quedaría si cerrara ahora. Sin el fondo (Stripe no contestó), sin montos. */
async function enVivo(env: Env, periodo: string, f: FondoComunidad | null, ahora: number): Promise<Pick<RepartoFondo, 'puntos' | 'partes' | 'fuera'>> {
  const n = await numerosDe(env, periodo)
  const { dentro, fuera } = partesDe(n.estilos.values(), n.mes)
  const ids = [...dentro.keys(), ...fuera.keys()]
  const [autores, datos] = await Promise.all([miembros(env, ids), datosDe(env, ids)])
  const avisos = await avisosDe(env, periodo, dentro, new Map([...dentro.keys()].map((id) => [id, datos.get(id)?.email ?? ''])), ahora)
  return {
    puntos: n.total,
    partes: [...dentro]
      .map(([id, p]) => ({
        miembro: autores.get(id) ?? sinNombre(id),
        correo: datos.get(id)?.email ?? '',
        binance: datos.get(id)?.binance ?? '',
        puntos: p.puntos,
        montos: f ? estimado(f, p.puntos, n.total) : [],
        estilos: p.estilos,
        avisos: avisos.get(id) ?? []
      }))
      .sort((a, b) => b.puntos - a.puntos),
    fuera: [...fuera].map(([id, puntos]) => ({ miembro: autores.get(id) ?? sinNombre(id), puntos })).sort((a, b) => b.puntos - a.puntos)
  }
}

/** `GET /comunidad/fondo/reparto?periodo=`: solo el creador. Un periodo abierto, en vivo; uno cerrado, su foto. */
export async function reparto(env: Env, yo: Miembro, url: URL, ahora = Date.now()): Promise<RepartoFondo> {
  if (!esCreador(yo)) throw new Rechazo(403, 'Eso solo lo ve el creador de Sloth.')
  const periodos = periodosHasta(new Date(ahora))
  const periodo = url.searchParams.get('periodo') || periodos.at(-1)!
  if (!esPeriodo(periodo) || !periodos.includes(periodo)) throw new Rechazo(400, 'Ese periodo no existe.')
  const base = { periodo, mes: nombreDe(periodo), periodos: periodos.map((id) => ({ id, mes: nombreDe(id) })), termino: tramoDe(periodo).hasta * 1000 <= ahora }
  const cerrado = await env.DB.prepare('SELECT cerrado, fondo, puntos FROM repartos WHERE periodo = ?').bind(periodo).first<{ cerrado: string; fondo: string; puntos: number }>()
  if (!cerrado) {
    const f = await fondoDe(env, periodo, new Date(ahora)).catch(() => null)
    return { ...base, fondo: f, ...(await enVivo(env, periodo, f, ahora)) }
  }
  const { results } = await env.DB.prepare('SELECT * FROM reparto_partes WHERE periodo = ? ORDER BY puntos DESC')
    .bind(periodo)
    .all<{ miembro: string; binance: string; puntos: number; montos: string; estilos: string; avisos: string; pagado: string | null; referencia: string | null }>()
  const ids = results.map((r) => r.miembro)
  const [autores, datos] = await Promise.all([miembros(env, ids), datosDe(env, ids)])
  return {
    ...base,
    cerrado: cerrado.cerrado,
    fondo: JSON.parse(cerrado.fondo) as FondoComunidad,
    puntos: cerrado.puntos,
    partes: results.map((r) => ({
      miembro: autores.get(r.miembro) ?? sinNombre(r.miembro),
      correo: datos.get(r.miembro)?.email ?? '',
      binance: r.binance,
      puntos: r.puntos,
      montos: JSON.parse(r.montos) as FondoComunidad['montos'],
      estilos: JSON.parse(r.estilos) as ParteReparto['estilos'],
      avisos: JSON.parse(r.avisos) as string[],
      ...(r.pagado ? { pagado: r.pagado } : {}),
      ...(r.referencia ? { referencia: r.referencia } : {})
    })),
    fuera: []
  }
}

/** `POST /comunidad/fondo/cerrar` `{periodo}`: solo el creador, cuando el periodo ya terminó. Guarda su foto, una vez. */
export async function cerrar(env: Env, yo: Miembro, c: Record<string, unknown>, ahora = Date.now()): Promise<RepartoFondo> {
  if (!esCreador(yo)) throw new Rechazo(403, 'Eso solo lo hace el creador de Sloth.')
  const periodo = String(c.periodo ?? '')
  if (!esPeriodo(periodo)) throw new Rechazo(400, 'Ese periodo no existe.')
  if (tramoDe(periodo).hasta * 1000 > ahora) throw new Rechazo(400, `${nombreDe(periodo)} aún no termina: se cierra a partir del día 1.`)
  const url = new URL(`https://x/?periodo=${periodo}`)
  if (await env.DB.prepare('SELECT 1 FROM repartos WHERE periodo = ?').bind(periodo).first()) return reparto(env, yo, url, ahora)
  // Sin leer el fondo no se cierra: se repartiría nada.
  let f: FondoComunidad
  try {
    f = await fondoDe(env, periodo, new Date(ahora))
  } catch {
    throw new Rechazo(502, 'Stripe no contestó: sin las cuentas del fondo no se puede cerrar. Intenta en un momento.')
  }
  const vivo = await enVivo(env, periodo, f, ahora)
  const cuando = new Date(ahora).toISOString()
  await env.DB.batch([
    // Si dos cierran a la vez, queda la primera foto y sus partes.
    env.DB.prepare('INSERT OR IGNORE INTO repartos (periodo, cerrado, fondo, puntos) VALUES (?, ?, ?, ?)').bind(periodo, cuando, JSON.stringify(f), vivo.puntos),
    ...vivo.partes.map((p) =>
      env.DB.prepare('INSERT OR IGNORE INTO reparto_partes (periodo, miembro, binance, puntos, montos, estilos, avisos) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
        periodo,
        p.miembro.id,
        p.binance,
        p.puntos,
        JSON.stringify(p.montos),
        JSON.stringify(p.estilos),
        JSON.stringify(p.avisos)
      )
    )
  ])
  return reparto(env, yo, url, ahora)
}

/** `POST /comunidad/fondo/pagado` `{periodo, miembro, pagado, referencia?}`: solo el creador. Al marcarla, le avisa por correo. */
export async function pagado(env: Env, yo: Miembro, c: Record<string, unknown>): Promise<{ ok: true }> {
  if (!esCreador(yo)) throw new Rechazo(403, 'Eso solo lo hace el creador de Sloth.')
  const periodo = String(c.periodo ?? '')
  const miembro = String(c.miembro ?? '')
  if (!esPeriodo(periodo) || !ID.test(miembro)) throw new Rechazo(400, 'Falta el periodo o la persona.')
  const parte = await env.DB.prepare('SELECT montos, binance, pagado FROM reparto_partes WHERE periodo = ? AND miembro = ?').bind(periodo, miembro).first<{ montos: string; binance: string; pagado: string | null }>()
  if (!parte) throw new Rechazo(404, 'Esa parte no está en el reparto: cierra antes el periodo.')
  if (!c.pagado) {
    await env.DB.prepare('UPDATE reparto_partes SET pagado = NULL, referencia = NULL WHERE periodo = ? AND miembro = ?').bind(periodo, miembro).run()
    return { ok: true }
  }
  const referencia = String(c.referencia ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  // Solo la primera vez que se marca: la referencia se puede corregir sin mandar otro correo.
  const r = await env.DB.prepare('UPDATE reparto_partes SET pagado = COALESCE(pagado, ?), referencia = ? WHERE periodo = ? AND miembro = ?').bind(new Date().toISOString(), referencia || null, periodo, miembro).run()
  if (r.meta.changes && !parte.pagado) {
    const email = (await datosDe(env, [miembro])).get(miembro)?.email
    const montos = JSON.parse(parte.montos) as FondoComunidad['montos']
    if (email)
      await correo(
        env,
        email,
        'Ya te mandamos tu parte del fondo de Sloth',
        ['Hola:', `Te mandamos ${dinero(montos)} del fondo de la comunidad de ${nombreDe(periodo)}, por lo que la gente hizo con tus estilos.`, `Llegó al Binance ID que termina en ${parte.binance.slice(-4)}.${referencia ? ` Referencia: ${referencia}.` : ''}`, 'Gracias por compartir tus estilos.'],
        `fondo-${periodo}-${miembro}`
      ).catch((e) => console.error('Correo del pago del fondo', e instanceof Error ? e.message : e))
  }
  return { ok: true }
}
