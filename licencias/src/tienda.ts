/**
 * La tienda de estilos: la sección Estilos de la comunidad con lo que cada estilo lleva hecho, a la vista de todos, y
 * cuánto se lleva este mes del fondo de la comunidad (`fondo.ts`, ADR 0019). La ve `web/src/Tienda.tsx`.
 *
 * Qué se mide (migración 0028, `estilo_usos`), lo manda la app de quien usa el estilo (`server/estilos-usos.ts`):
 * - Una **descarga** por computadora: al instalarlo desde la comunidad.
 * - Un **video** por computadora y archivo terminado (su huella), con su portada de **prueba**, subida por la misma
 *   cuenta: lo que sale de la etapa «Video» de un estilo que vino de aquí. El mismo video copiado no cuenta dos veces.
 * - Las **variantes**: estilos de otras personas que salieron de este (su paquete dice `de`, ver `server/comunidad.ts`)
 *   y que el creador aprobó.
 *
 * Para que sea justo con todos:
 * - No cuenta lo del autor, ni desde las computadoras de las cuentas de su correo.
 * - Una **persona** son las computadoras y las conexiones que se tocan (`personasDe`): diez computadoras en la misma
 *   conexión son una, y la misma computadora en otra red sigue siendo una. La conexión se guarda cifrada (`redDe`).
 * - Una cuenta de menos de `ANTIGUEDAD` no suma videos: así no sirve abrir cuentas para inflar un estilo.
 * - El creador ve las pruebas de cada estilo y descarta lo que no es de verdad (`/pruebas`, `/descartar`) antes de pagar.
 * - Solo cuentan los estilos aprobados, y los del creador de Sloth no se llevan del fondo. Tampoco los de quien no
 *   quiso participar (sin Binance ID, `reparto.ts`): sus puntos se ven, pero el fondo se reparte entre los demás.
 * - La tienda la ve cualquiera, pero instalar un estilo y sumarle videos es de quien apoya (`apoya` en
 *   `comunidad.ts`): así cada persona falsa cuesta un apoyo de verdad. A quien no apoya la tienda se lo dice
 *   (`sinApoyo`, con cuántos estilos hay), para que la app le enseñe la invitación a apoyar al querer instalar uno.
 *
 * Los puntos del periodo (`puntosDelMes`; un mes, y el primero junta dos: `periodoFondo`) son públicos: `PUNTOS.persona` por persona que terminó un video con él,
 * `PUNTOS.video` por video (hasta `PUNTOS.tope` por persona al mes) y `PUNTOS.variante` por variante aprobada ese mes.
 * Cada estilo se lleva del fondo la parte de sus puntos.
 *
 * - `GET /comunidad/estilos?q=&orden=favoritos|usados|descargas|ganando|nuevos`: los estilos con sus números.
 * - `POST /comunidad/estilos/uso` `{usos: [{publicacion, tipo: 'descarga' | 'video', huella?, prueba?}]}`: lo que se hizo
 *   en esta computadora. Lo repetido, lo del autor, sin prueba o de un estilo que no está aprobado se ignora sin error.
 * - Solo el creador: `GET /comunidad/estilos/pruebas?publicacion=&periodo=` y `POST /comunidad/estilos/descartar`
 *   `{publicacion, periodo?, videos?: [{equipo, huella}], miembro?, descartado}`.
 */
import type { Autor, EstiloTienda, FondoComunidad, OrdenTienda, PruebasEstilo, TiendaEstilos } from '../../shared/types.ts'
import { aLaVista, apoya, armar, conCupo, esCreador, esDe, type Guardada, type Miembro, miembros, OCULTAR, palabrasDe, sinAcentos, urlDe } from './comunidad.ts'
import { esPeriodo, fondo, periodoFondo } from './fondo.ts'
import { guardado, olvidar } from './guardado.ts'
import { cuerpo, type Env, Rechazo } from './index.ts'

export const PUNTOS = { persona: 3, video: 1, tope: 10, variante: 10 }
export const ORDENES_TIENDA: OrdenTienda[] = ['favoritos', 'usados', 'descargas', 'ganando', 'nuevos']
/** Lo que tiene que llevar una cuenta (desde su primera licencia con ese correo) para que sus videos sumen. */
export const ANTIGUEDAD = 7 * 24 * 3600_000
/** Lo que más se manda de una vez. */
const POR_ENVIO = 50
const HUELLA = /^[0-9a-f]{16,64}$/
const ID = /^[a-z0-9]+$/
const PRUEBA = /^[a-z0-9]{20}\.(png|jpg|webp)$/
/** Cada cuánto se recuentan los números de la tienda, para todas las copias del Worker. */
const NUMEROS = 60_000

export interface VideosDeEquipo {
  publicacion: string
  equipo: string
  red: string
  videos: number
}

export interface Variante {
  /** El estilo del que salió. */
  de: string
  autor: string
  /** El mes en que se publicó. */
  periodo: string
}

export interface PuntosEstilo {
  personas: number
  videos: number
  variantes: number
  puntos: number
}

/**
 * Las personas de los videos de un estilo: las computadoras y las conexiones que se tocan son una sola (una computadora
 * en dos redes, o diez computadoras en una red). Da cuántos videos hizo cada una.
 */
export function personasDe(filas: Pick<VideosDeEquipo, 'equipo' | 'red' | 'videos'>[]): number[] {
  const persona = agrupar(filas)
  const videos = new Map<string, number>()
  for (const f of filas) videos.set(persona(f.equipo), (videos.get(persona(f.equipo)) ?? 0) + f.videos)
  return [...videos.values()].filter((v) => v > 0)
}

/** A qué persona va cada computadora: une las que comparten red. Sin red conocida (la app de desarrollo), va sola. */
function agrupar(filas: Pick<VideosDeEquipo, 'equipo' | 'red'>[]): (equipo: string) => string {
  const padre = new Map<string, string>()
  const raiz = (x: string): string => {
    if (!padre.has(x)) padre.set(x, x)
    let r = x
    while (padre.get(r) !== r) r = padre.get(r)!
    padre.set(x, r)
    return r
  }
  for (const f of filas) if (f.red) padre.set(raiz(`e:${f.equipo}`), raiz(`r:${f.red}`))
  return (equipo) => raiz(`e:${equipo}`)
}

/**
 * Los puntos de cada estilo en un mes: personas, videos (con su tope por persona) y variantes de otros. `autores`: de
 * quién es cada estilo del reparto, para no contar la variante de uno mismo.
 */
export function puntosDelMes(videos: VideosDeEquipo[], variantes: Variante[], autores: Map<string, string>, periodo: string): Map<string, PuntosEstilo> {
  const por = new Map<string, PuntosEstilo>()
  const de = (id: string) => por.get(id) ?? (por.set(id, { personas: 0, videos: 0, variantes: 0, puntos: 0 }), por.get(id)!)
  const porEstilo = new Map<string, VideosDeEquipo[]>()
  for (const v of videos) if (autores.has(v.publicacion)) porEstilo.set(v.publicacion, [...(porEstilo.get(v.publicacion) ?? []), v])
  for (const [id, filas] of porEstilo) {
    const p = de(id)
    for (const n of personasDe(filas)) (p.personas++, (p.videos += Math.min(n, PUNTOS.tope)))
  }
  for (const v of variantes) {
    const autor = autores.get(v.de)
    if (!autor || autor === v.autor || v.periodo !== periodo) continue
    de(v.de).variantes++
  }
  for (const p of por.values()) p.puntos = p.personas * PUNTOS.persona + p.videos * PUNTOS.video + p.variantes * PUNTOS.variante
  return por
}

/** Lo que se lleva un estilo del fondo: la parte de sus puntos, en cada moneda, en centavos cerrados hacia abajo. */
export function estimado(f: FondoComunidad, puntos: number, total: number): FondoComunidad['montos'] {
  if (!puntos || !total) return []
  return f.montos.map((m) => ({ moneda: m.moneda, monto: Math.floor((m.monto * 100 * puntos) / total + 1e-6) / 100 })).filter((m) => m.monto > 0)
}

/** El prefijo de la conexión: los tres primeros números de una IPv4 (/24) o los tres primeros grupos de una IPv6 (/48). */
export function prefijoDe(ip: string): string {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split('.').slice(0, 3).join('.')
  if (ip.includes(':')) {
    // `::` se expande para que dos formas de la misma red den lo mismo.
    const [izq, der = ''] = ip.toLowerCase().split('::')
    const a = izq ? izq.split(':') : []
    const b = der ? der.split(':') : []
    const grupos = ip.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a
    return grupos.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, '')).join(':')
  }
  return ''
}

/** La red de una petición, cifrada con la firma del Worker: se compara, pero no se puede leer la IP. Sin IP, ''. */
export async function redDe(req: Request, env: Env): Promise<string> {
  const prefijo = prefijoDe(req.headers.get('cf-connecting-ip') ?? '')
  if (!prefijo) return ''
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(`red:${env.FIRMA}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(prefijo)))
  return [...firma.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Un estilo aprobado, con de quién es y si se lleva del fondo: ni los del creador de Sloth ni los de quien no participa. */
export interface EstiloDelFondo {
  id: string
  titulo: string
  autor: string
  participa: boolean
}

export interface Numeros {
  periodo: string
  estilos: Map<string, EstiloDelFondo>
  /** De siempre, por estilo. */
  siempre: Map<string, { descargas: number; videos: number; personas: number; variantes: number }>
  /** Los puntos de cada estilo en el periodo, participe o no. */
  mes: Map<string, PuntosEstilo>
  /** Los puntos de los que se llevan del fondo: entre ellos se reparte. */
  total: number
  /** De qué estilo salió cada uno. */
  origen: Map<string, string>
}
/** Los números como van en la tabla `guardado`: cada `Map`, como su lista. */
type NumerosGuardados = { [K in keyof Numeros]: Numeros[K] extends Map<infer L, infer V> ? [L, V][] : Numeros[K] }

/**
 * Los números del periodo en curso, guardados para todas las copias del Worker (`guardado.ts`): recorren `estilo_usos`
 * entera, y en la memoria de cada copia se recorrían una vez por copia.
 */
export async function numerosActuales(env: Env): Promise<Numeros> {
  const periodo = periodoFondo(new Date())
  const g = await guardado<NumerosGuardados>(env, `numeros:${periodo}`, async () => {
    const n = await numerosDe(env, periodo)
    return { ...n, estilos: [...n.estilos], siempre: [...n.siempre], mes: [...n.mes], origen: [...n.origen] }
  }, false, NUMEROS)
  return { ...g, estilos: new Map(g.estilos), siempre: new Map(g.siempre), mes: new Map(g.mes), origen: new Map(g.origen) }
}

/**
 * Los números de todos los estilos que ve la comunidad (aprobados, pre-aprobados o con una versión a la vista mientras se
 * revisa otra: `aLaVista`), con los puntos de un periodo (el reparto los pide del que cerró).
 */
export async function numerosDe(env: Env, periodo: string): Promise<Numeros> {
  const [estilos, descargas, videos, variantes] = await env.DB.batch([
    // Los que están a la vista, con su autor. Del fondo se llevan los de quien participa (dio su Binance ID) y no es el creador.
    env.DB.prepare(
      `SELECT p.id, p.titulo, p.autor, (m.clave != 'admin' AND m.binance IS NOT NULL) AS participa FROM publicaciones p LEFT JOIN miembros m ON m.id = p.autor WHERE p.categoria = 'estilos' AND ${aLaVista('p.')}`
    ),
    env.DB.prepare("SELECT publicacion, COUNT(*) AS n FROM estilo_usos WHERE tipo = 'descarga' GROUP BY publicacion"),
    env.DB.prepare("SELECT publicacion, equipo, red, periodo, COUNT(*) AS videos FROM estilo_usos WHERE tipo = 'video' AND descartado = 0 GROUP BY publicacion, equipo, red, periodo"),
    env.DB.prepare(
      `SELECT p.id, json_extract(j.value, '$.de') AS de, p.autor, p.creada FROM publicaciones p, json_each(p.adjuntos) j WHERE p.categoria = 'estilos' AND ${aLaVista('p.')} AND json_extract(j.value, '$.tipo') = 'estilo' AND json_extract(j.value, '$.de') IS NOT NULL`
    )
  ])
  const filas = (estilos.results as { id: string; titulo: string; autor: string; participa: number | null }[]).map((f) => ({ ...f, participa: !!f.participa }))
  const autores = new Map(filas.map((f) => [f.id, f.autor]))
  const vs = (variantes.results as { id: string; de: string; autor: string; creada: string }[]).filter((v) => v.de !== v.id)
  const lista: Variante[] = vs.map((v) => ({ de: v.de, autor: v.autor, periodo: periodoFondo(new Date(v.creada)) }))
  const todos = videos.results as unknown as (VideosDeEquipo & { periodo: string })[]

  const siempre = new Map<string, { descargas: number; videos: number; personas: number; variantes: number }>()
  const de = (id: string) => siempre.get(id) ?? (siempre.set(id, { descargas: 0, videos: 0, personas: 0, variantes: 0 }), siempre.get(id)!)
  for (const d of descargas.results as { publicacion: string; n: number }[]) de(d.publicacion).descargas = d.n
  const porEstilo = new Map<string, VideosDeEquipo[]>()
  for (const v of todos) porEstilo.set(v.publicacion, [...(porEstilo.get(v.publicacion) ?? []), v])
  for (const [id, fs] of porEstilo) {
    const p = personasDe(fs)
    Object.assign(de(id), { personas: p.length, videos: p.reduce((s, n) => s + n, 0) })
  }
  for (const v of lista) if (autores.has(v.de) && autores.get(v.de) !== v.autor) de(v.de).variantes++

  const mes = puntosDelMes(
    todos.filter((v) => v.periodo === periodo),
    lista,
    autores,
    periodo
  )
  return {
    periodo,
    estilos: new Map(filas.map((f) => [f.id, f])),
    siempre,
    mes,
    total: filas.reduce((s, f) => s + (f.participa ? (mes.get(f.id)?.puntos ?? 0) : 0), 0),
    origen: new Map(vs.map((v) => [v.id, v.de]))
  }
}

/** Que los números se vuelvan a leer: cambió quién participa o qué cuenta. */
export const olvidarNumeros = (env: Pick<Env, 'DB'>) => olvidar(env, 'numeros:')

/**
 * `GET /comunidad/estilos`: los que `yo` puede ver (lo suyo por aprobar también), con sus números, buscados y ordenados.
 * A quien no apoya, los mismos, y que no los puede instalar (`sinApoyo`).
 */
export async function tienda(env: Env, yo: Miembro, url: URL): Promise<TiendaEstilos> {
  const orden = (url.searchParams.get('orden') || 'favoritos') as OrdenTienda
  if (!ORDENES_TIENDA.includes(orden)) throw new Rechazo(400, 'Ese orden no existe.')
  const donde = ["categoria = 'estilos'"]
  const valores: (string | number)[] = []
  if (!esCreador(yo)) donde.push(`((reportes < ? AND ${aLaVista()}) OR autor = ?)`), valores.push(OCULTAR, yo.id)
  // Las palabras solo llevan letras y números (`palabrasDe`): ni `%` ni `_` llegan al LIKE.
  for (const p of palabrasDe(url.searchParams.get('q') ?? '')) {
    donde.push(`(${sinAcentos('titulo')} LIKE ? OR ${sinAcentos('texto')} LIKE ? OR ${sinAcentos('adjuntos')} LIKE ?)`)
    valores.push(`%${p}%`, `%${p}%`, `%${p}%`)
  }
  const [filas, n, f] = await Promise.all([
    env.DB.prepare(`SELECT * FROM publicaciones WHERE ${donde.join(' AND ')} ORDER BY creada DESC LIMIT 300`)
      .bind(...valores)
      .all<Guardada>(),
    numerosActuales(env),
    fondo(env).catch(() => null)
  ])
  const pubs = await armar(env, yo, filas.results)
  const titulos = new Map<string, string>()
  const faltan = [...new Set(pubs.map((p) => n.origen.get(p.id)).filter((d): d is string => !!d))]
  // D1 acepta hasta 100 valores por consulta.
  for (let i = 0; i < faltan.length; i += 90) {
    const parte = faltan.slice(i, i + 90)
    for (const r of (await env.DB.prepare(`SELECT id, titulo FROM publicaciones WHERE ${aLaVista()} AND id IN (${parte.map(() => '?').join(', ')})`).bind(...parte).all<{ id: string; titulo: string }>()).results)
      titulos.set(r.id, r.titulo)
  }
  const estilos: EstiloTienda[] = pubs.map((p) => {
    const s = n.siempre.get(p.id) ?? { descargas: 0, videos: 0, personas: 0, variantes: 0 }
    const mes = n.mes.get(p.id) ?? { personas: 0, videos: 0, variantes: 0, puntos: 0 }
    const de = n.origen.get(p.id)
    return {
      publicacion: p,
      ...s,
      mes,
      participa: !!n.estilos.get(p.id)?.participa,
      estimado: f && n.estilos.get(p.id)?.participa ? estimado(f, mes.puntos, n.total) : [],
      ...(de && titulos.has(de) ? { basadoEn: { id: de, titulo: titulos.get(de)! } } : {})
    }
  })
  const por: Record<OrdenTienda, (e: EstiloTienda) => number | string> = {
    favoritos: (e) => e.publicacion.likes,
    usados: (e) => e.videos,
    descargas: (e) => e.descargas,
    ganando: (e) => e.mes.puntos,
    nuevos: (e) => e.publicacion.creada
  }
  const clave = por[orden]
  estilos.sort((a, b) => {
    const x = clave(a)
    const y = clave(b)
    return x === y ? b.publicacion.creada.localeCompare(a.publicacion.creada) : x < y ? 1 : -1
  })
  return { estilos, fondo: f, puntos: n.total, reglas: { ...PUNTOS, dias: ANTIGUEDAD / 86_400_000 }, ...(apoya(yo) ? {} : { sinApoyo: { estilos: n.estilos.size } }) }
}

/** `POST /comunidad/estilos/uso`: lo que se hizo con estilos de la comunidad en la computadora de `yo`. */
export async function usos(req: Request, env: Env, yo: Miembro): Promise<{ ok: true; contados: number }> {
  // El creador entra con su llave, sin computadora: lo suyo no cuenta.
  const equipo = req.headers.get('x-sloth-equipo') ?? ''
  if (esCreador(yo) || !equipo) return { ok: true, contados: 0 }
  const c = await cuerpo(req)
  const ahora = new Date()
  // Una cuenta nueva no suma videos todavía, ni la de quien no apoya (los estilos son de quien apoya); sus descargas sí se ven.
  const desde = (await env.DB.prepare('SELECT MIN(creada) AS desde FROM licencias WHERE email = (SELECT email FROM licencias WHERE clave = ?)').bind(yo.clave).first<{ desde: string | null }>())?.desde
  const conVideos = apoya(yo) && !!desde && ahora.getTime() - Date.parse(desde) >= ANTIGUEDAD
  const lista: { publicacion: string; tipo: 'descarga' | 'video'; huella: string; prueba: string | null }[] = []
  for (const u of (Array.isArray(c.usos) ? c.usos : []).slice(0, POR_ENVIO)) {
    const { publicacion, tipo, huella, prueba } = (u ?? {}) as Record<string, unknown>
    if (typeof publicacion !== 'string' || !ID.test(publicacion)) continue
    if (tipo === 'descarga') lista.push({ publicacion, tipo, huella: '', prueba: null })
    // Un video lleva su portada, subida por esta misma cuenta.
    else if (tipo === 'video' && conVideos && typeof huella === 'string' && HUELLA.test(huella) && typeof prueba === 'string' && PRUEBA.test(prueba)) {
      const cabeza = await env.DESCARGAS.head(`comunidad/${prueba}`)
      if (cabeza && esDe(cabeza.customMetadata, yo.id)) lista.push({ publicacion, tipo, huella, prueba })
    }
  }
  if (!lista.length) return { ok: true, contados: 0 }
  if (!(await conCupo(env, yo, 'usos'))) throw new Rechazo(429, 'Ya se mandó mucho hoy desde esta computadora. Mañana sigue.')
  const periodo = periodoFondo(ahora)
  const red = await redDe(req, env)
  // Solo de un estilo a la vista y de alguien más: ni el autor, ni una computadora de las cuentas de su correo.
  const resultado = await env.DB.batch(
    lista.map((u) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO estilo_usos (publicacion, tipo, equipo, huella, miembro, red, prueba, periodo, creado)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 FROM publicaciones p
        WHERE p.id = ?1 AND p.categoria = 'estilos' AND ${aLaVista('p.')} AND p.autor != ?5
          AND NOT EXISTS (
            SELECT 1 FROM equipos e JOIN licencias l ON l.clave = e.clave
            WHERE e.equipo = ?3 AND l.email IN (SELECT la.email FROM miembros ma JOIN licencias la ON la.clave = ma.clave WHERE ma.id = p.autor)
          )`
      ).bind(u.publicacion, u.tipo, equipo, u.huella, yo.id, red, u.prueba, periodo, ahora.toISOString())
    )
  )
  const contados = resultado.reduce((s, r) => s + (r.meta.changes ?? 0), 0)
  // Lo contado sale en la tienda al recontar (`NUMEROS`): olvidarlo en cada uso haría recontar a todas las copias sin parar.
  return { ok: true, contados }
}

/** Solo el creador: las pruebas de los videos de un estilo en un mes, con quién y de qué persona es cada una. */
export async function pruebas(env: Env, yo: Miembro, url: URL): Promise<PruebasEstilo> {
  if (!esCreador(yo)) throw new Rechazo(403, 'Eso solo lo ve el creador de Sloth.')
  const publicacion = url.searchParams.get('publicacion') ?? ''
  const periodo = url.searchParams.get('periodo') || periodoFondo()
  if (!ID.test(publicacion) || !esPeriodo(periodo)) throw new Rechazo(400, 'Falta el estilo o el mes.')
  const { results } = await env.DB.prepare(
    "SELECT equipo, huella, miembro, red, prueba, descartado, creado FROM estilo_usos WHERE publicacion = ? AND periodo = ? AND tipo = 'video' ORDER BY creado"
  )
    .bind(publicacion, periodo)
    .all<{ equipo: string; huella: string; miembro: string; red: string; prueba: string | null; descartado: number; creado: string }>()
  // Cada video con el número de su persona (como `personasDe`, contando también los descartados).
  const persona = agrupar(results)
  const grupos = new Map<string, number>()
  const autores: Map<string, Autor> = await miembros(env, results.map((r) => r.miembro))
  return {
    periodo,
    videos: results.map((r) => {
      const g = persona(r.equipo)
      if (!grupos.has(g)) grupos.set(g, grupos.size + 1)
      return {
        equipo: r.equipo,
        huella: r.huella,
        persona: grupos.get(g)!,
        autor: autores.get(r.miembro) ?? { id: r.miembro, nombre: '' },
        ...(r.prueba ? { prueba: urlDe(env, r.prueba) } : {}),
        descartado: !!r.descartado,
        creado: r.creado
      }
    })
  }
}

/** Solo el creador: que unos videos (o todos los de un miembro en ese mes) cuenten o no. */
export async function descartar(req: Request, env: Env, yo: Miembro): Promise<{ ok: true; cambiados: number }> {
  if (!esCreador(yo)) throw new Rechazo(403, 'Eso solo lo hace el creador de Sloth.')
  const c = await cuerpo(req)
  const publicacion = String(c.publicacion ?? '')
  const periodo = String(c.periodo || periodoFondo())
  if (!ID.test(publicacion) || !esPeriodo(periodo)) throw new Rechazo(400, 'Falta el estilo o el mes.')
  const valor = c.descartado ? 1 : 0
  const consultas: D1PreparedStatement[] = []
  if (typeof c.miembro === 'string' && ID.test(c.miembro))
    consultas.push(env.DB.prepare("UPDATE estilo_usos SET descartado = ? WHERE publicacion = ? AND periodo = ? AND tipo = 'video' AND miembro = ?").bind(valor, publicacion, periodo, c.miembro))
  for (const v of (Array.isArray(c.videos) ? c.videos : []).slice(0, 200)) {
    const { equipo, huella } = (v ?? {}) as Record<string, unknown>
    if (typeof equipo === 'string' && typeof huella === 'string')
      consultas.push(env.DB.prepare("UPDATE estilo_usos SET descartado = ? WHERE publicacion = ? AND tipo = 'video' AND equipo = ? AND huella = ?").bind(valor, publicacion, equipo, huella))
  }
  if (!consultas.length) return { ok: true, cambiados: 0 }
  const r = await env.DB.batch(consultas)
  await olvidarNumeros(env)
  return { ok: true, cambiados: r.reduce((s, x) => s + (x.meta.changes ?? 0), 0) }
}
