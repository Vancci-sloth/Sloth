/**
 * El cobro de Sloth: el apoyo mensual o anual con Mercado Pago o con Stripe, las cuentas gratis y la clave que revisa la app
 * (`server/licencia.ts`). Sloth es gratis: el apoyo es opcional y quita el recordatorio de la app. La página
 * (sloth.vancci.org) suscribe desde el navegador (`POST /suscribir`, que da el enlace de pago de Mercado Pago, o de Stripe
 * con `pasarela: 'stripe'`) y, pagada, `/gracias` enseña la clave y el instalador; la clave llega también por correo. La
 * app crea una cuenta gratis con su `equipo` (`plan: 'gratis'`, que da una de plan `cuenta`) para entrar a la comunidad.
 * Al abrir y cada pocas horas, Sloth pregunta cómo va su clave (`POST /licencia`). La respuesta va firmada con `FIRMA`
 * (Ed25519): Sloth la guarda y, sin internet, vale hasta su `hasta` sin que se pueda alargar a mano.
 *
 * Mercado Pago manda: cada aviso (`POST /webhook`) y cada revisión vuelven a leer la suscripción de su API, así que un
 * aviso perdido o repetido solo cambia cuándo se entera Sloth. En D1, `licencias` (una por suscripción o lugar gratis) y
 * `equipos` (las computadoras de cada clave, `EQUIPOS` como mucho). Suscripciones sin plan, con pago pendiente: Mercado
 * Pago cobra solo cada mes (o cada año) con lo que eligió el cliente en su página.
 *
 * Stripe (`stripe.ts`) es la otra forma de pagar: tarjetas de cualquier país, Apple Pay, Google Pay y Link, según lo que
 * se active en su panel. El precio va en pesos y, con Adaptive Pricing (también en su panel), quien paga desde fuera de
 * México lo ve y lo paga en su moneda. Igual que con Mercado Pago, cada aviso (`POST /webhook/stripe`) y cada revisión
 * vuelven a leer la suscripción de su API.
 *
 * El apoyo cuesta lo mismo para todos (`PRECIO_MENSUAL` o `PRECIO_ANUAL`). Las `FUNDADORES` primeras personas que apoyan
 * son fundadoras (`fundador`) para siempre: más beneficios que quien llega después. Cada suscripción conserva el monto
 * con que se creó.
 * Cuando Sloth se vendía, las primeras personas se unieron gratis de por vida (plan `gratis`, `GRATIS` como mucho): son
 * fundadoras como las primeras que apoyan (`esFundador`), con lo nuevo `ANTICIPO` antes y sin el recordatorio. Ya no se
 * dan.
 *
 * También da el instalador: `GET /descargar` es la última versión, libre; la de Mac y la de
 * Linux, con `?so=mac` y `?so=linux` (también en `/version`). Está en R2
 * (`DESCARGAS`) y lo sube `npm run publicar` por partes, con `PUBLICAR`: pesa más de lo que aceptan wrangler (300 MiB)
 * y una petición a un Worker (100 MB). `ultima.json` dice cuál es la última. Y las actualizaciones de la app instalada
 * (electron-updater): `GET /actualizaciones/latest.yml` dice cuál es la nueva (quien apoya la recibe `ANTICIPO` antes:
 * a los demás se les sigue dando la anterior, que se guarda en `anterior/` al publicar), y de su instalador baja solo los pedazos
 * que cambiaron, con el mapa de bloques de cada versión (`.blockmap`). Se quedan los mapas de todas y los dos últimos
 * instaladores.
 *
 * Lo que pide la Ley Federal de Protección al Consumidor (art. 76 Bis VIII y IX) para un cobro recurrente: suscribirse
 * exige aceptar el cobro automático y los términos (se guarda cuándo y qué versión), cancelar da un folio, y el cron de
 * cada mañana avisa por correo (Resend) al menos 5 días antes de cada cobro.
 *
 * Y la comunidad (`/comunidad/*`, en `comunidad.ts`), de quien tiene una licencia activa.
 */
import { comunidad, creditos } from './comunidad.ts'
import { firmaDeStripe, leerStripe, portalStripe, sesionStripe, stripe, suscripcionStripe, type Lectura, type SuscripcionStripe } from './stripe.ts'

export interface Env {
  DB: D1Database
  DESCARGAS: R2Bucket
  /** La llave de `npm run publicar`. */
  PUBLICAR?: string
  /** `prueba` cobra con la vendedora de prueba (`MP_ACCESS_TOKEN`); `produccion`, de verdad (`MP_ACCESS_TOKEN_PRODUCCION`). */
  MP_MODO: 'prueba' | 'produccion'
  MP_ACCESS_TOKEN: string
  MP_ACCESS_TOKEN_PRODUCCION?: string
  MP_WEBHOOK_SECRET?: string
  /** La llave secreta de Stripe: con `sk_live_` o `rk_live_` cobra de verdad; con `sk_test_`, en su modo de prueba. Sin ella, solo Mercado Pago. */
  STRIPE_SECRET_KEY?: string
  /** El secreto de firma (`whsec_…`) del webhook de Stripe. */
  STRIPE_WEBHOOK_SECRET?: string
  /** La configuración del portal del cliente de Stripe (`bpc_…`), donde cambia su tarjeta y ve sus recibos. */
  STRIPE_PORTAL?: string
  /** `1` cuando Stripe Tax está activo en la cuenta: el precio lleva el IVA desglosado, sin cambiar lo que se paga. */
  STRIPE_IMPUESTOS?: string
  /** La llave privada Ed25519 en PKCS8 y base64. */
  FIRMA: string
  /** La dirección de este Worker, para la página a la que vuelve el cliente tras pagar. */
  ORIGEN: string
  PRECIO_MENSUAL: number
  PRECIO_ANUAL: number
  /** Los lugares gratis de por vida que se dieron cuando Sloth se vendía: ya no se dan. */
  GRATIS: number
  /** Las primeras personas que apoyan, fundadoras (hasta `FUNDADORES_HASTA` si se pone, una fecha ISO). */
  FUNDADORES: number
  FUNDADORES_HASTA?: string
  /** Para los correos (avisos de cobro y folios). Sin ella, no se mandan: se anotan en el registro. */
  RESEND_API_KEY?: string
  /** De quién salen (`Sloth <avisos@vancci.org>`, dominio verificado en Resend) y adónde se responden. */
  CORREO_DE: string
  CORREO_RESPUESTA: string
}

/** `gratis`: un lugar gratis de por vida, de cuando Sloth se vendía; `cuenta`: una cuenta gratis, sin apoyo. */
type Plan = 'mensual' | 'anual' | 'gratis' | 'cuenta'
/** Los de Mercado Pago, y `gratis` para un lugar gratis de por vida o una cuenta (para quitárselos, `cancelled`). */
export type Estado = 'pending' | 'authorized' | 'paused' | 'cancelled' | 'gratis'

export interface Fila {
  id: string
  clave: string
  email: string
  plan: Plan
  monto: number
  fundador: number
  preapproval: string | null
  enlace: string | null
  estado: Estado
  pagado_hasta: string | null
  autorizada: string | null
  creada: string
  revisada: string | null
  acepto: string | null
  terminos: string | null
  folio: string | null
  cancelada: string | null
  avisado_para: string | null
  /** El `MP_MODO` con que se creó (con Stripe, el de su llave). */
  modo: string
  /** Con Stripe: su sesión de pago (`cs_…`) y, pagada, su suscripción (`sub_…`). */
  stripe: string | null
}

/** Cuántos se han unido: los lugares gratis tomados y las suscripciones pagadas alguna vez (de ellas, las de fundador). */
export interface Cuenta {
  fundadores: number
  /** Las que apoyan hoy: pagadas y sin vencer, aunque ya cancelaran. */
  apoyan: number
}

type Tarifas = Pick<Env, 'FUNDADORES' | 'FUNDADORES_HASTA' | 'PRECIO_MENSUAL' | 'PRECIO_ANUAL'>

interface Preapproval {
  id: string
  status: string
  init_point?: string
  next_payment_date?: string
  external_reference?: string
}

const MP = 'https://api.mercadopago.com'
const DIA = 24 * 3600_000
/** Sin internet, Sloth sigue abierta hasta una semana desde la última respuesta. */
const SIN_CONEXION = 7 * DIA
/** Cada cuánto se vuelve a leer de Mercado Pago una suscripción al revisarla; pendiente, casi siempre (esperan el pago). */
const REVISAR = 6 * 3600_000
const REVISAR_PENDIENTE = 10_000
/** Las computadoras que pueden usar una clave a la vez: las que preguntaron en los últimos `VISTO`. */
const EQUIPOS = 2
const VISTO = 30 * DIA
/** 32 letras y números sin los que se confunden (0, 1, I, O). */
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const CLAVE = /^SLOTH(-[2-9A-HJ-NP-Z]{4}){4}$/
export const EQUIPO = /^[\w-]{8,64}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/**
 * Lo que sube `npm run publicar` de cada sistema: el instalador (el .exe de Windows, el .dmg de Mac, el AppImage de Linux),
 * el .zip con que se actualiza la de Mac, sus mapas de bloques y `latest.yml` (`latest-mac.yml`, `latest-linux.yml`), el
 * que lee electron-updater. `tipo` es lo que va tras la versión: el de cada archivo que se poda.
 */
const BINARIO = /^Sloth-(?:Setup-)?\d+\.\d+\.\d+(?<tipo>\.exe|-mac-(?:arm64|x64)\.(?:dmg|zip)|-linux-(?:arm64|x86_64)\.AppImage)$/
const AL_DIA = /^latest(-mac|-linux)?\.yml$/
const publicable = (archivo: string) => AL_DIA.test(archivo) || BINARIO.test(archivo.replace(/\.blockmap$/, ''))
/** Cada sistema que se descarga (`?so=`) y dónde dice cuál es su última versión. Sin `so`, Windows. */
const ULTIMAS = { windows: 'ultima.json', mac: 'ultima-mac.json', linux: 'ultima-linux.json' } as const
type Sistema = keyof typeof ULTIMAS
const sistema = (so: string | null): Sistema => (so === 'mac' || so === 'linux' ? so : 'windows')
/** El sistema del que `archivo` es el instalador; `undefined` si no es uno (el .zip de Mac, un mapa, latest.yml). */
export function instaladorDe(archivo: string): Sistema | undefined {
  const tipo = BINARIO.exec(archivo)?.groups?.tipo
  return tipo === '.exe' ? 'windows' : tipo?.endsWith('.dmg') ? 'mac' : tipo?.endsWith('.AppImage') ? 'linux' : undefined
}
/** De cada tipo de archivo (el .exe, el .dmg y el .zip de Mac, el AppImage) se quedan el último y el de antes en R2, por si alguien lo está bajando al publicar. */
const INSTALADORES = 3
/** La versión de los términos que acepta el cliente: la fecha de su «Última actualización» (sloth.vancci.org/terminos). */
const TERMINOS = /^\d{4}-\d{2}-\d{2}$/
/** Cuánto antes que los demás recibe lo nuevo quien apoya. */
const ANTICIPO = 7 * DIA
/**
 * Si una fila de `licencias` hace fundadora a su correo, para siempre: un apoyo de los primeros que se llegó a pagar, o
 * un lugar gratis de por vida que sigue en pie. `t` es el nombre de la tabla en la consulta.
 */
export function esFundador(t: string) {
  return `((${t}.fundador = 1 AND ${t}.autorizada IS NOT NULL) OR (${t}.plan = 'gratis' AND ${t}.estado = 'gratis'))`
}
/** Se avisa del cobro cuando faltan esto o menos días: el cron corre cada mañana, así que el aviso llega con 6 o 7. */
const AVISO = 7 * DIA
/** Lo que la página de Sloth llama desde el navegador. */
const PUBLICAS = new Set(['/precio', '/version', '/suscribir', '/creditos'])
/** Quién vende, al pie de cada correo (art. 76 Bis III de la LFPC): su nombre, domicilio y contacto están en los términos de la página, no aquí. */
const PROVEEDOR = 'Sloth, de Vancci · Quién vende, su domicilio y su contacto: https://sloth.vancci.org/terminos'

/** `ultima.json` en `DESCARGAS`. */
interface Ultima {
  archivo: string
  version: string
  bytes: number
  publicado: string
  /** Desde cuándo la recibe todo el mundo; antes, solo quien apoya. Sin él (las de antes), ya es de todos. */
  todos?: string
}

export class Rechazo extends Error {
  status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    if (!PUBLICAS.has(url.pathname)) return atender(req, env, ctx, url)
    // La página de Sloth (sloth.vancci.org) enseña el precio y la versión, y suscribe: también sus errores se leen.
    const r =
      req.method === 'OPTIONS'
        ? new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } })
        : await atender(req, env, ctx, url)
    r.headers.set('access-control-allow-origin', '*')
    return r
  },

  /** Cada mañana: el aviso de los cobros que vienen. */
  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(avisarCobros(env).catch((e) => console.error('Avisos de cobro', e instanceof Error ? e.message : e)))
  }
} satisfies ExportedHandler<Env>

async function atender(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  try {
    if (req.method === 'GET' && url.pathname === '/precio') return json(await precios(env))
    // Los Fundadores que pidieron salir en los créditos de la página.
    if (req.method === 'GET' && url.pathname === '/creditos') return json({ fundadores: await creditos(env) })
    if (req.method === 'GET' && url.pathname === '/version') return json(await ultimaPara(req, env, sistema(url.searchParams.get('so'))))
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/descargar') {
      const so = sistema(url.searchParams.get('so'))
      const u = await ultimaPara(req, env, so)
      // La de Mac aún no va firmada por Apple: antes de bajarla, cómo se abre la primera vez.
      if (so === 'mac' && !url.searchParams.has('visto')) return avisoMac(u)
      return servir(req, env, u.archivo, u.bytes, { 'content-disposition': `attachment; filename="${u.archivo}"` })
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/actualizaciones/')) return await actualizaciones(req, env, url)
    if (url.pathname.startsWith('/publicar/')) return await publicar(req, env, url)
    if (req.method === 'GET' && url.pathname === '/gracias') return await gracias(env, url)
    if (req.method === 'POST' && url.pathname === '/webhook') return await webhook(req, env, ctx, url)
    if (req.method === 'POST' && url.pathname === '/webhook/stripe') return await webhookStripe(req, env, ctx)
    if (req.method === 'POST' && url.pathname === '/suscribir') return await suscribir(env, await cuerpo(req))
    if (req.method === 'POST' && url.pathname === '/licencia') return await licencia(env, await cuerpo(req))
    if (req.method === 'POST' && url.pathname === '/cancelar') return await cancelar(env, await cuerpo(req))
    if (req.method === 'POST' && url.pathname === '/pago') return await pago(env, await cuerpo(req))
    if (url.pathname === '/comunidad' || url.pathname.startsWith('/comunidad/')) return await comunidad(req, env, url)
    return json({ error: 'No existe' }, 404)
  } catch (error) {
    if (error instanceof Rechazo) return json({ error: error.message }, error.status)
    console.error(url.pathname, error instanceof Error ? error.message : error)
    return json({ error: 'Algo falló en el cobro de Sloth. Intenta otra vez en un momento.' }, 500)
  }
}

async function ultima(env: Env, so: Sistema = 'windows'): Promise<Ultima> {
  const u = await env.DESCARGAS.get(ULTIMAS[so])
  if (!u) throw new Rechazo(404, so === 'windows' ? 'Todavía no hay una versión de Sloth para descargar.' : `Todavía no hay una versión de Sloth para ${so === 'mac' ? 'Mac' : 'Linux'}.`)
  return u.json<Ultima>()
}

/** El instalador de la última versión de `so`, con `Range` para que el navegador pueda retomar una descarga cortada. */
/** Si `u` ya es de todos (`todos` pasó o no lo tiene). */
export const deTodos = (u: Pick<Ultima, 'todos'>, ahora = Date.now()) => !u.todos || ahora >= Date.parse(u.todos)

/**
 * Si quien pregunta apoya hoy: la app manda su clave y su computadora (`x-sloth-clave`, `x-sloth-equipo`), y la clave
 * es de un apoyo mensual o anual vigente, o de un lugar gratis de por vida, en esa computadora.
 */
async function apoya(req: Request, env: Env): Promise<boolean> {
  const clave = (req.headers.get('x-sloth-clave') ?? '').replace(/\s+/g, '').toUpperCase()
  const equipo = req.headers.get('x-sloth-equipo') ?? ''
  if (!CLAVE.test(clave) || !EQUIPO.test(equipo)) return false
  const f = await env.DB.prepare("SELECT l.estado, l.pagado_hasta FROM licencias l JOIN equipos e ON e.clave = l.clave WHERE l.clave = ? AND e.equipo = ? AND l.plan IN ('mensual', 'anual', 'gratis')")
    .bind(clave, equipo)
    .first<Pick<Fila, 'estado' | 'pagado_hasta'>>()
  return !!f && vigencia(f, Date.now()).activa
}

/**
 * La versión que le toca a quien pregunta: la última, o la anterior si la última todavía es solo de quien apoya. Con la
 * llave de publicar, siempre la última: de ella sale el número de la siguiente (scripts/version-venta.mjs).
 */
async function ultimaPara(req: Request, env: Env, so: Sistema): Promise<Ultima> {
  const u = await ultima(env, so)
  const publica = !!env.PUBLICAR && iguales(req.headers.get('authorization') ?? '', `Bearer ${env.PUBLICAR}`)
  if (deTodos(u) || publica || (await apoya(req, env))) return u
  return (await env.DESCARGAS.get(`anterior/${ULTIMAS[so]}`))?.json<Ultima>() ?? u
}

/** Lo que pide electron-updater: `latest.yml`, que nunca se guarda en caché, y los instaladores y sus mapas por pedazos. */
async function actualizaciones(req: Request, env: Env, url: URL): Promise<Response> {
  const archivo = decodeURIComponent(url.pathname.slice('/actualizaciones/'.length))
  if (!publicable(archivo)) throw new Rechazo(404, 'No existe')
  const yml = AL_DIA.test(archivo)
  let llave = archivo
  // latest.yml: a quien no apoya, el de la anterior mientras la última sea solo de quien apoya.
  if (yml) {
    const so: Sistema = archivo.includes('-mac') ? 'mac' : archivo.includes('-linux') ? 'linux' : 'windows'
    const u = await env.DESCARGAS.get(ULTIMAS[so])
    if (u && !deTodos(await u.json<Ultima>()) && !(await apoya(req, env)) && (await env.DESCARGAS.head(`anterior/${archivo}`))) llave = `anterior/${archivo}`
  }
  const cabeza = await env.DESCARGAS.head(llave)
  if (!cabeza) throw new Rechazo(404, 'No existe')
  return servir(req, env, llave, cabeza.size, yml ? { 'content-type': 'text/yaml; charset=utf-8', 'cache-control': 'no-store' } : {})
}

/** Un archivo de `DESCARGAS`, entero o el pedazo que pide `Range`. */
export async function servir(req: Request, env: Env, archivo: string, bytes: number, extra: Record<string, string>): Promise<Response> {
  const rango = rangoDe(req.headers.get('range'), bytes)
  const cabeceras = new Headers({
    'content-type': 'application/octet-stream',
    'accept-ranges': 'bytes',
    'content-length': String(rango ? rango.length : bytes),
    ...extra
  })
  if (rango) cabeceras.set('content-range', `bytes ${rango.offset}-${rango.offset + rango.length - 1}/${bytes}`)
  const status = rango ? 206 : 200
  if (req.method === 'HEAD') return new Response(null, { status, headers: cabeceras })
  const obj = await env.DESCARGAS.get(archivo, rango ? { range: rango } : undefined)
  if (!obj) throw new Rechazo(404, 'No se encontró el archivo.')
  cabeceras.set('etag', obj.httpEtag)
  return new Response(obj.body, { status, headers: cabeceras })
}

/** `bytes=100-199`, `bytes=100-` o `bytes=-50`, dentro del archivo. Uno que no se entiende se ignora: va entero. */
export function rangoDe(cabecera: string | null, bytes: number): { offset: number; length: number } | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecera?.trim() ?? '')
  if (!m || (!m[1] && !m[2])) return
  const desde = m[1] ? Number(m[1]) : Math.max(0, bytes - Number(m[2]))
  const hasta = m[1] && m[2] ? Math.min(Number(m[2]), bytes - 1) : bytes - 1
  if (desde > hasta) return
  return { offset: desde, length: hasta - desde + 1 }
}

/**
 * La subida por partes de `scripts/publicar.mjs`: `inicio` la abre, cada `parte` (`?n=1`, `2`…) lleva un pedazo y
 * `fin` la cierra. Un instalador, al cerrarse, pasa a ser el último de su sistema (`ULTIMAS`), y de cada tipo de archivo
 * quedan solo `INSTALADORES` en R2.
 * Las subidas que no terminan, R2 las borra solas a la semana.
 */
async function publicar(req: Request, env: Env, url: URL): Promise<Response> {
  if (!env.PUBLICAR || !iguales(req.headers.get('authorization') ?? '', `Bearer ${env.PUBLICAR}`)) throw new Rechazo(401, 'No autorizado.')
  const archivo = url.searchParams.get('archivo') ?? ''
  if (!publicable(archivo)) throw new Rechazo(400, 'El archivo debe ser un instalador de Sloth (.exe, .dmg, .zip de Mac o .AppImage), su .blockmap o latest.yml.')
  if (req.method === 'POST' && url.pathname === '/publicar/inicio')
    return json({ upload: (await env.DESCARGAS.createMultipartUpload(archivo, { httpMetadata: { contentType: 'application/octet-stream' } })).uploadId })
  const subida = env.DESCARGAS.resumeMultipartUpload(archivo, url.searchParams.get('upload') ?? '')
  if (req.method === 'PUT' && url.pathname === '/publicar/parte') {
    const n = Number(url.searchParams.get('n'))
    if (!Number.isInteger(n) || n < 1 || !req.body) throw new Rechazo(400, 'Parte inválida.')
    return json(await subida.uploadPart(n, req.body))
  }
  if (req.method === 'POST' && url.pathname === '/publicar/fin') {
    const { partes, version, paraTodos } = (await cuerpo(req)) as { partes: R2UploadedPart[]; version: string; paraTodos?: boolean }
    // Una versión nueva: la que había pasa a `anterior/` (su ultima.json y su latest.yml, que aún no se reemplaza: va al
    // final), salvo que aún fuera solo de quien apoya; entonces la anterior sigue siendo la de antes.
    const so = instaladorDe(archivo)
    const previa = so ? await (await env.DESCARGAS.get(ULTIMAS[so]))?.json<Ultima>() : undefined
    if (so && previa && previa.version !== String(version) && deTodos(previa)) {
      const yml = { windows: 'latest.yml', mac: 'latest-mac.yml', linux: 'latest-linux.yml' }[so]
      const actual = await env.DESCARGAS.get(yml)
      await env.DESCARGAS.put(`anterior/${ULTIMAS[so]}`, JSON.stringify(previa), { httpMetadata: { contentType: 'application/json' } })
      if (actual) await env.DESCARGAS.put(`anterior/${yml}`, await actual.arrayBuffer(), { httpMetadata: { contentType: 'text/yaml; charset=utf-8' } })
    }
    const obj = await subida.complete(partes)
    const tipo = BINARIO.exec(archivo)?.groups?.tipo
    if (tipo) {
      const iguales = (await env.DESCARGAS.list({ prefix: 'Sloth-' })).objects.filter((o) => BINARIO.exec(o.key)?.groups?.tipo === tipo)
      const viejos = iguales.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime()).slice(INSTALADORES)
      if (viejos.length) await env.DESCARGAS.delete(viejos.map((o) => o.key))
    }
    if (!so) return json({ archivo, bytes: obj.size })
    // La misma versión otra vez (se volvió a publicar) conserva cuándo salió; una nueva es de quien apoya `ANTICIPO`.
    const misma = previa?.version === String(version)
    const publicado = misma ? previa.publicado : new Date().toISOString()
    const todos = paraTodos ? undefined : misma ? previa.todos : new Date(Date.parse(publicado) + ANTICIPO).toISOString()
    const u: Ultima = { archivo, version: String(version), bytes: obj.size, publicado, ...(todos ? { todos } : {}) }
    await env.DESCARGAS.put(ULTIMAS[so], JSON.stringify(u), { httpMetadata: { contentType: 'application/json' } })
    return json(u)
  }
  throw new Rechazo(404, 'No existe')
}

/** El precio de hoy. Las suscripciones de prueba y las cuentas gratis no cuentan: solo las pagadas de verdad y los lugares gratis de por vida. */
async function precios(env: Env) {
  const c = await env.DB.prepare(
    `SELECT COUNT(CASE WHEN autorizada IS NOT NULL AND fundador = 1 THEN 1 END) AS fundadores,
            COUNT(CASE WHEN julianday(pagado_hasta) > julianday('now') THEN 1 END) AS apoyan
     FROM licencias WHERE plan IN ('mensual', 'anual') AND modo = 'produccion'`
  ).first<Cuenta>()
  // `stripe`: si la página puede ofrecerlo (ya tiene sus llaves).
  return { ...tarifa(c ?? { fundadores: 0, apoyan: 0 }, env), stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) }
}

/** El precio, el mismo para todos. `quedan`: los lugares de fundador que quedan; `apoyan`, para las metas del roadmap. */
export function tarifa(c: Cuenta, env: Tarifas, ahora = Date.now()) {
  const abierto = !env.FUNDADORES_HASTA || ahora < Date.parse(env.FUNDADORES_HASTA)
  return {
    quedan: abierto ? Math.max(0, Number(env.FUNDADORES) - c.fundadores) : 0,
    mensual: Number(env.PRECIO_MENSUAL),
    anual: Number(env.PRECIO_ANUAL),
    apoyan: c.apoyan
  }
}

/**
 * Crea la suscripción en Mercado Pago (o, con `pasarela: 'stripe'`, la sesión de pago de Stripe), pendiente de pago, y
 * da el enlace donde el cliente paga. Desde la página, sin
 * `equipo`, nada más: la clave se ve en `/gracias` cuando se confirma el pago, nunca antes, porque cualquiera puede
 * escribir el correo de otro. Desde la app de antes, con su `equipo`, también la clave, que espera el pago. Con `plan`
 * `gratis`, una cuenta gratis (solo desde la app): la clave, ya activa.
 */
async function suscribir(env: Env, c: Record<string, unknown>): Promise<Response> {
  const email = String(c.email ?? '').trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 254) throw new Rechazo(400, 'Escribe un correo válido.')
  const plan: Plan = c.plan === 'gratis' ? 'gratis' : c.plan === 'anual' ? 'anual' : 'mensual'
  const equipo = c.equipo === undefined && plan !== 'gratis' ? undefined : equipoDe(c)
  // El consentimiento expreso de los términos y, si se paga, del cobro automático (LFPC art. 76 Bis VIII), con la versión aceptada.
  const terminos = String(c.terminos ?? '')
  if (c.acepto !== true || !TERMINOS.test(terminos))
    throw new Rechazo(400, plan === 'gratis' ? 'Para unirte, acepta los términos.' : 'Para suscribirte, acepta el cobro automático y los términos.')
  const acepto = new Date().toISOString()
  if (plan === 'gratis') return unirse(env, email, equipo!, acepto, terminos)
  const conStripe = c.pasarela === 'stripe'
  if (conStripe && !env.STRIPE_SECRET_KEY) throw new Rechazo(503, 'El pago con Stripe todavía no está listo. Paga con Mercado Pago o intenta más tarde.')
  // Con una ya pagada, otra cobraría dos veces; con un lugar gratis de por vida, no hace falta. Con una cuenta, sí se apoya.
  await sinOtra(env, email, true)
  const p = await precios(env)
  // Un doble clic, o volver a abrir el pago: la misma suscripción pendiente de la última hora.
  const previa = await env.DB.prepare(
    "SELECT * FROM licencias WHERE email = ? AND plan = ? AND estado = 'pending' AND enlace IS NOT NULL AND creada > ? AND (stripe IS NOT NULL) = ? ORDER BY creada DESC LIMIT 1"
  )
    .bind(email, plan, new Date(Date.now() - 3600_000).toISOString(), conStripe ? 1 : 0)
    .first<Fila>()
  if (previa) {
    await env.DB.prepare('UPDATE licencias SET acepto = ?, terminos = ? WHERE id = ?').bind(acepto, terminos, previa.id).run()
    return json(equipo ? { clave: previa.clave, enlace: previa.enlace } : { enlace: previa.enlace })
  }

  const fila: Fila = {
    id: crypto.randomUUID(),
    clave: nuevaClave(),
    email,
    plan,
    monto: plan === 'anual' ? p.anual : p.mensual,
    fundador: p.quedan > 0 ? 1 : 0,
    preapproval: null,
    enlace: null,
    estado: 'pending',
    pagado_hasta: null,
    autorizada: null,
    creada: acepto,
    revisada: null,
    acepto,
    terminos,
    folio: null,
    cancelada: null,
    avisado_para: null,
    modo: conStripe ? (/^[sr]k_live_/.test(env.STRIPE_SECRET_KEY!) ? 'produccion' : 'prueba') : env.MP_MODO,
    stripe: null
  }
  await env.DB.prepare('INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, creada, acepto, terminos, modo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(fila.id, fila.clave, email, plan, fila.monto, fila.fundador, fila.estado, fila.creada, acepto, terminos, fila.modo)
    .run()
  if (conStripe) {
    let sesion: { id: string; url: string }
    try {
      sesion = await sesionStripe(env, fila)
    } catch (error) {
      await env.DB.prepare('DELETE FROM licencias WHERE id = ?').bind(fila.id).run()
      throw error instanceof Rechazo ? new Rechazo(502, 'Stripe no pudo abrir el pago. Revisa tu correo e intenta otra vez.') : error
    }
    await env.DB.prepare('UPDATE licencias SET stripe = ?, enlace = ?, revisada = ? WHERE id = ?').bind(sesion.id, sesion.url, new Date().toISOString(), fila.id).run()
    if (!equipo) return json({ enlace: sesion.url })
    await recordarEquipo(env, fila.clave, equipo, Date.now())
    return json({ clave: fila.clave, enlace: sesion.url })
  }
  let pre: Preapproval
  try {
    pre = await mp<Preapproval>(env, 'POST', '/preapproval', {
      // Sin acentos ni «·»: con ellos, Mercado Pago contesta «Parameters passed are invalid».
      reason: plan === 'anual' ? 'Sloth - plan anual' : 'Sloth - plan mensual',
      external_reference: fila.id,
      payer_email: email,
      auto_recurring: { frequency: plan === 'anual' ? 12 : 1, frequency_type: 'months', transaction_amount: fila.monto, currency_id: 'MXN' },
      back_url: `${env.ORIGEN}/gracias?s=${fila.id}`,
      status: 'pending'
    })
  } catch (error) {
    await env.DB.prepare('DELETE FROM licencias WHERE id = ?').bind(fila.id).run()
    throw error instanceof Rechazo ? new Rechazo(502, 'Mercado Pago no pudo crear la suscripción. Revisa tu correo e intenta otra vez.') : error
  }
  await env.DB.prepare('UPDATE licencias SET preapproval = ?, enlace = ?, revisada = ? WHERE id = ?').bind(pre.id, pre.init_point ?? null, new Date().toISOString(), fila.id).run()
  if (!equipo) return json({ enlace: pre.init_point })
  await recordarEquipo(env, fila.clave, equipo, Date.now())
  return json({ clave: fila.clave, enlace: pre.init_point })
}

/**
 * Una cuenta gratis, para la comunidad: sin pago, activa desde ya. Una por computadora y por correo; la misma
 * computadora (reinstaló Sloth) recupera la suya, y también un lugar gratis de por vida que ya tuviera.
 */
async function unirse(env: Env, email: string, equipo: string, acepto: string, terminos: string): Promise<Response> {
  const suya = await env.DB.prepare("SELECT l.clave FROM licencias l JOIN equipos e ON e.clave = l.clave WHERE e.equipo = ? AND l.estado = 'gratis' LIMIT 1")
    .bind(equipo)
    .first<{ clave: string }>()
  if (suya) return json({ clave: suya.clave })
  await sinOtra(env, email, false)
  const clave = nuevaClave()
  await env.DB.prepare(
    `INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, autorizada, creada, acepto, terminos, modo)
     VALUES (?, ?, ?, 'cuenta', 0, 0, 'gratis', ?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), clave, email, acepto, acepto, acepto, terminos, env.MP_MODO)
    .run()
  await recordarEquipo(env, clave, equipo, Date.now())
  await correo(env, email, 'Tu cuenta de Sloth', [
    'Hola:',
    'Ya tienes tu cuenta de Sloth: con ella entras a la comunidad. Sloth es gratis y lo seguirá siendo.',
    `Tu clave es ${clave}. Guárdala: con ella entras desde otra computadora (dos a la vez). También está en Opciones de Sloth.`,
    'Sloth trabaja con tu propia cuenta de Claude Pro o Max, que pagas aparte a Anthropic. Si tienes dudas, responde a este correo.'
  ]).catch((e) => console.error('Correo de bienvenida', e instanceof Error ? e.message : e))
  return json({ clave })
}

/**
 * Un correo con un apoyo activo o con un lugar gratis de por vida no se suscribe ni se une otra vez. Con una cuenta
 * gratis, sí apoya (`apoyar`), pero no abre otra cuenta.
 */
async function sinOtra(env: Env, email: string, apoyar: boolean) {
  const { results } = await env.DB.prepare("SELECT plan, estado FROM licencias WHERE email = ? AND estado IN ('authorized', 'gratis')").bind(email).all<Pick<Fila, 'plan' | 'estado'>>()
  if (results.some((f) => f.plan === 'gratis'))
    throw new Rechazo(409, 'Ese correo ya tiene Sloth gratis de por vida. Usa su clave: está en Opciones de Sloth, en la computadora donde te uniste.')
  if (results.some((f) => f.estado === 'authorized')) throw new Rechazo(409, 'Ya hay un apoyo activo con ese correo. Usa su clave: te la mandamos por correo y está en Opciones de Sloth.')
  if (!apoyar && results.length) throw new Rechazo(409, 'Ese correo ya tiene una cuenta de Sloth. Su clave te llegó por correo, en «Tu cuenta de Sloth».')
}

/** Si la clave sigue activa en esta computadora, firmado. Lee la suscripción de Mercado Pago o de Stripe si hace rato que no. */
async function licencia(env: Env, c: Record<string, unknown>): Promise<Response> {
  const equipo = equipoDe(c)
  let fila = await porClave(env, c.clave)
  const ahora = Date.now()
  const revisada = fila.revisada ? Date.parse(fila.revisada) : 0
  // Si Mercado Pago (o Stripe) no contesta, vale lo último que dijo.
  if ((fila.preapproval || fila.stripe) && ahora - revisada > (fila.estado === 'pending' ? REVISAR_PENDIENTE : REVISAR)) fila = await refrescar(env, fila).catch(() => fila)
  if (!(await recordarEquipo(env, fila.clave, equipo, ahora)))
    throw new Rechazo(409, `Esta clave ya se usa en ${EQUIPOS} computadoras. Si cambiaste de computadora, escríbenos y la liberamos.`)
  return firmada(env, fila, equipo, ahora)
}

/** Cancela la suscripción en Mercado Pago o en Stripe. Lo ya pagado sigue valiendo hasta su fecha. */
async function cancelar(env: Env, c: Record<string, unknown>): Promise<Response> {
  const equipo = equipoDe(c)
  let fila = await porClave(env, c.clave)
  if (fila.stripe?.startsWith('sub_') && fila.estado !== 'cancelled') {
    // Ya cancelada, Stripe contesta 400 o 404: basta con volver a leerla.
    await stripe(env, 'DELETE', `/v1/subscriptions/${encodeURIComponent(fila.stripe)}`).catch((e) => {
      if (!(e instanceof Rechazo) || (e.status !== 400 && e.status !== 404)) throw e
    })
    fila = await refrescar(env, fila)
    if (fila.estado !== 'cancelled') throw new Rechazo(502, 'Stripe no pudo cancelar la suscripción. Intenta otra vez en un momento.')
  }
  if (fila.preapproval && fila.estado !== 'cancelled') {
    // Un 400 es casi siempre que ya estaba cancelada (desde la cuenta del cliente, o por Mercado Pago tras un cobro
    // rechazado): basta con volver a leerla.
    await mp(env, 'PUT', `/preapproval/${encodeURIComponent(fila.preapproval)}`, { status: 'cancelled' }).catch((e) => {
      if (!(e instanceof Rechazo) || e.status !== 400) throw e
    })
    fila = await refrescar(env, fila)
    if (fila.estado !== 'cancelled') throw new Rechazo(502, 'Mercado Pago no pudo cancelar la suscripción. Intenta otra vez en un momento.')
  }
  // El comprobante de la cancelación (Profeco pide dar un folio), una sola vez.
  if (fila.estado === 'cancelled' && !fila.folio) {
    fila = { ...fila, folio: `C-${letras(8)}`, cancelada: new Date().toISOString() }
    await env.DB.prepare('UPDATE licencias SET folio = ?, cancelada = ? WHERE id = ?').bind(fila.folio, fila.cancelada, fila.id).run()
    const hasta = fila.pagado_hasta && Date.parse(fila.pagado_hasta) > Date.now() ? ` Sloth sigue abierta hasta el ${fecha(fila.pagado_hasta)}, lo que ya pagaste.` : ''
    await correo(env, fila.email, `Cancelaste tu suscripción a Sloth · folio ${fila.folio}`, [
      'Hola:',
      `Cancelamos tu suscripción a Sloth. Tu folio de cancelación es ${fila.folio}. ${quien(fila)} ya no te hará más cobros.${hasta}`,
      'Si no fuiste tú, responde a este correo.'
    ]).catch((e) => console.error('Correo de cancelación', e instanceof Error ? e.message : e))
  }
  return firmada(env, fila, equipo, Date.now())
}

/**
 * El portal de Stripe de una suscripción pagada con Stripe: ahí el cliente cambia su tarjeta y ve sus recibos. Cancelar
 * no está ahí: se cancela desde Sloth, que da el folio. Con Mercado Pago, la tarjeta se cambia en su propia cuenta.
 */
async function pago(env: Env, c: Record<string, unknown>): Promise<Response> {
  const equipo = equipoDe(c)
  const fila = await porClave(env, c.clave)
  if (!fila.stripe?.startsWith('sub_')) throw new Rechazo(400, 'Esta suscripción se paga con Mercado Pago: cambia tu tarjeta desde tu cuenta de Mercado Pago.')
  if (!(await recordarEquipo(env, fila.clave, equipo, Date.now())))
    throw new Rechazo(409, `Esta clave ya se usa en ${EQUIPOS} computadoras. Si cambiaste de computadora, escríbenos y la liberamos.`)
  const s = await suscripcionStripe(env, fila.stripe)
  return json({ enlace: (await portalStripe(env, s.customer)).url })
}

/**
 * Un aviso de Mercado Pago. Se comprueba su firma, se contesta enseguida y luego se lee la suscripción de su API: el
 * cuerpo solo dice cuál cambió. Los cobros de cada mes llegan como `subscription_authorized_payment`.
 */
async function webhook(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const c = (await req.json().catch(() => ({}))) as { type?: string; data?: { id?: string | number } }
  const id = url.searchParams.get('data.id') ?? (c.data?.id === undefined ? '' : String(c.data.id))
  const tipo = url.searchParams.get('type') ?? c.type ?? ''
  if (!id || !(await firmaDeMercadoPago(req.headers.get('x-signature'), req.headers.get('x-request-id'), id, env.MP_WEBHOOK_SECRET)))
    return new Response('Firma inválida', { status: 401 })
  ctx.waitUntil(aviso(env, tipo, id).catch((e) => console.error('Aviso', tipo, id, e instanceof Error ? e.message : e)))
  return new Response('ok')
}

async function aviso(env: Env, tipo: string, id: string) {
  let preapproval: string | undefined
  if (tipo === 'subscription_preapproval') preapproval = id
  if (tipo === 'subscription_authorized_payment') preapproval = (await mp<{ preapproval_id?: string }>(env, 'GET', `/authorized_payments/${encodeURIComponent(id)}`)).preapproval_id
  if (!preapproval) return
  const p = await mp<Preapproval>(env, 'GET', `/preapproval/${encodeURIComponent(preapproval)}`)
  // El aviso de una recién creada puede llegar antes de guardar su id: se busca también por la referencia.
  const fila = await env.DB.prepare('SELECT * FROM licencias WHERE preapproval = ? OR id = ?').bind(p.id, p.external_reference ?? '').first<Fila>()
  if (fila) await guardarEstado(env, fila, leerMp(p))
}

/**
 * Un aviso de Stripe. Como con Mercado Pago: se comprueba su firma, se contesta enseguida y la suscripción se lee de su
 * API. Sirven `checkout.session.completed` (el primer pago) y `customer.subscription.*` (cada cobro, pausa o cancelación).
 */
async function webhookStripe(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const texto = await req.text()
  if (!(await firmaDeStripe(req.headers.get('stripe-signature'), texto, env.STRIPE_WEBHOOK_SECRET, Date.now()))) return new Response('Firma inválida', { status: 401 })
  const e = JSON.parse(texto) as { type?: string; data?: { object?: { id?: string; subscription?: string | null; client_reference_id?: string | null; metadata?: Record<string, string> } } }
  const o = e.data?.object ?? {}
  const pago = e.type === 'checkout.session.completed'
  const suscripcion = pago ? o.subscription : e.type?.startsWith('customer.subscription.') ? o.id : undefined
  const licencia = (pago ? o.client_reference_id : o.metadata?.licencia) ?? ''
  if (suscripcion)
    ctx.waitUntil(
      (async () => {
        const fila = await env.DB.prepare('SELECT * FROM licencias WHERE stripe = ? OR id = ?').bind(suscripcion, licencia).first<Fila>()
        if (fila) await guardarEstado(env, fila, leerStripe(await suscripcionStripe(env, suscripcion)))
      })().catch((error) => console.error('Aviso de Stripe', e.type, error instanceof Error ? error.message : error))
    )
  return new Response('ok')
}

/** Vuelve a leer la suscripción de Mercado Pago o de Stripe y la guarda. */
async function refrescar(env: Env, fila: Fila): Promise<Fila> {
  if (fila.stripe) return guardarEstado(env, fila, await stripeDe(env, fila.stripe))
  if (!fila.preapproval) return fila
  return guardarEstado(env, fila, leerMp(await mp<Preapproval>(env, 'GET', `/preapproval/${encodeURIComponent(fila.preapproval)}`)))
}

/** Lo que dice Stripe de una fila: su suscripción o, mientras no se paga, su sesión de pago. */
async function stripeDe(env: Env, id: string): Promise<Lectura> {
  if (id.startsWith('sub_')) return leerStripe(await suscripcionStripe(env, id))
  const s = await stripe<{ status: string; subscription: SuscripcionStripe | null }>(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(id)}?expand[]=subscription`)
  if (s.subscription) return leerStripe(s.subscription)
  // Una sesión que venció sin pagarse (a las 24 horas) ya no se puede pagar.
  return { id, estado: s.status === 'expired' ? 'cancelled' : 'pending' }
}

/** Una suscripción de Mercado Pago, como la guarda el cobro. Cancelada, ya no dice hasta cuándo se pagó: vale la del último cobro que se vio. */
function leerMp(p: Preapproval): Lectura {
  return { id: p.id, estado: p.status as Estado, hasta: p.status === 'authorized' ? p.next_payment_date : undefined }
}

async function guardarEstado(env: Env, fila: Fila, l: Lectura): Promise<Fila> {
  const estado = l.estado
  const ahora = new Date().toISOString()
  const nueva: Fila = {
    ...fila,
    preapproval: fila.stripe ? fila.preapproval : l.id,
    stripe: fila.stripe ? l.id : null,
    estado,
    pagado_hasta: l.hasta ?? fila.pagado_hasta,
    autorizada: fila.autorizada ?? (estado === 'authorized' ? ahora : null),
    revisada: ahora
  }
  // El primer pago: la clave por correo, una sola vez aunque el aviso y `/gracias` lleguen a la vez.
  if (!fila.autorizada && nueva.autorizada) {
    const r = await env.DB.prepare('UPDATE licencias SET autorizada = ? WHERE id = ? AND autorizada IS NULL').bind(ahora, fila.id).run()
    if (r.meta.changes) await bienvenida(env, nueva).catch((e) => console.error('Correo con la clave', e instanceof Error ? e.message : e))
  }
  await env.DB.prepare('UPDATE licencias SET preapproval = ?, stripe = ?, estado = ?, pagado_hasta = ?, autorizada = COALESCE(autorizada, ?), revisada = ? WHERE id = ?')
    .bind(nueva.preapproval, nueva.stripe, estado, nueva.pagado_hasta, nueva.autorizada, ahora, fila.id)
    .run()
  return nueva
}

/** La clave y cómo empezar, al confirmarse el primer pago. */
function bienvenida(env: Env, f: Fila) {
  return correo(env, f.email, `Tu clave de Sloth: ${f.clave}`, [
    'Hola:',
    `${quien(f)} confirmó tu pago: gracias por apoyar a Sloth. Guarda este correo, es donde queda tu clave.`,
    `Tu clave: ${f.clave}`,
    `Pégala en Sloth, en Opciones, y deja de salirte el recordatorio. Si aún no la tienes, descárgala en ${env.ORIGEN}/descargar (Mac: ${env.ORIGEN}/descargar?so=mac; Linux: ${env.ORIGEN}/descargar?so=linux). La clave sirve en dos computadoras a la vez.`,
    'Sloth trabaja con tu propia cuenta de Claude Pro o Max, que pagas aparte a Anthropic. Si tienes dudas, responde a este correo.'
  ])
}

/** Quién cobra esta suscripción, para los correos y las páginas. */
export function quien(f: Pick<Fila, 'stripe'>): string {
  return f.stripe ? 'Stripe' : 'Mercado Pago'
}

/**
 * Si abre Sloth y hasta cuándo, sin volver a preguntar. Autorizada, abre mientras Mercado Pago la mantenga así (él
 * reintenta los cobros que fallan y la cancela si no puede); cancelada o en pausa, hasta el fin de lo pagado. Un lugar
 * gratis abre siempre.
 */
export function vigencia(f: Pick<Fila, 'estado' | 'pagado_hasta'>, ahora: number): { activa: boolean; hasta: number } {
  const pagado = f.pagado_hasta ? Date.parse(f.pagado_hasta) : 0
  if (f.estado === 'authorized' || f.estado === 'gratis') return { activa: true, hasta: ahora + SIN_CONEXION }
  if (pagado > ahora) return { activa: true, hasta: Math.min(pagado, ahora + SIN_CONEXION) }
  return { activa: false, hasta: ahora }
}

/** Lo que guarda Sloth: `datos` tal cual se firmó (un JSON en texto) y su firma. */
async function firmada(env: Env, f: Fila, equipo: string, ahora: number): Promise<Response> {
  const { activa, hasta } = vigencia(f, ahora)
  // Fundador para siempre: un apoyo de su correo que entró entre los primeros y se llegó a pagar, o su lugar gratis de por vida.
  const fundador = !!(await env.DB.prepare(`SELECT 1 FROM licencias l WHERE l.email = ? AND ${esFundador('l')} LIMIT 1`).bind(f.email).first())
  const datos = JSON.stringify({
    clave: f.clave,
    equipo,
    email: f.email,
    plan: f.plan,
    monto: f.monto,
    estado: f.estado,
    activa,
    pagadaHasta: f.pagado_hasta ?? undefined,
    hasta: new Date(hasta).toISOString(),
    emitido: new Date(ahora).toISOString(),
    enlace: f.estado === 'pending' ? (f.enlace ?? undefined) : undefined,
    folio: f.folio ?? undefined,
    pasarela: f.stripe ? 'stripe' : undefined,
    fundador: fundador || undefined
  })
  const llave = await crypto.subtle.importKey('pkcs8', base64(env.FIRMA), { name: 'Ed25519' }, false, ['sign'])
  const firma = await crypto.subtle.sign({ name: 'Ed25519' }, llave, new TextEncoder().encode(datos))
  return json({ datos, firma: btoa(String.fromCharCode(...new Uint8Array(firma))) })
}

/** Guarda que esta computadora usa la clave. `false` si ya la usan `EQUIPOS` otras. */
async function recordarEquipo(env: Env, clave: string, equipo: string, ahora: number): Promise<boolean> {
  const otros = await env.DB.prepare('SELECT COUNT(*) AS n FROM equipos WHERE clave = ? AND equipo != ? AND visto > ?')
    .bind(clave, equipo, new Date(ahora - VISTO).toISOString())
    .first<{ n: number }>()
  if ((otros?.n ?? 0) >= EQUIPOS) return false
  await env.DB.prepare('INSERT INTO equipos (clave, equipo, visto) VALUES (?, ?, ?) ON CONFLICT (clave, equipo) DO UPDATE SET visto = excluded.visto')
    .bind(clave, equipo, new Date(ahora).toISOString())
    .run()
  return true
}

async function porClave(env: Env, valor: unknown): Promise<Fila> {
  const clave = String(valor ?? '').replace(/\s+/g, '').toUpperCase()
  const fila = CLAVE.test(clave) ? await env.DB.prepare('SELECT * FROM licencias WHERE clave = ?').bind(clave).first<Fila>() : null
  if (!fila) throw new Rechazo(404, 'No encontramos esa clave. Revisa que esté bien escrita.')
  return fila
}

function equipoDe(c: Record<string, unknown>): string {
  const equipo = String(c.equipo ?? '')
  if (!EQUIPO.test(equipo)) throw new Rechazo(400, 'Falta el identificador de esta computadora.')
  return equipo
}

/** `SLOTH-XXXX-XXXX-XXXX-XXXX`: 80 bits al azar. */
function nuevaClave(): string {
  return `SLOTH-${letras(16).match(/.{4}/g)!.join('-')}`
}

/** `n` letras y números al azar de `ALFABETO` (5 bits cada uno). */
export function letras(n: number): string {
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALFABETO[b % 32]).join('')
}

/**
 * La firma de un aviso: `x-signature` trae `ts` y `v1`, el HMAC-SHA256 en hex de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * con la clave secreta de los webhooks. El `data.id` alfanumérico va en minúsculas.
 */
export async function firmaDeMercadoPago(cabecera: string | null, solicitud: string | null, id: string, secreto: string | undefined): Promise<boolean> {
  if (!cabecera || !solicitud || !secreto) return false
  const partes = Object.fromEntries(cabecera.split(',').map((p) => p.split('=').map((s) => s.trim())))
  if (!partes.ts || !partes.v1) return false
  const manifiesto = `id:${/^[a-z0-9]+$/i.test(id) ? id.toLowerCase() : id};request-id:${solicitud};ts:${partes.ts};`
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const firma = [...new Uint8Array(await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(manifiesto)))].map((b) => b.toString(16).padStart(2, '0')).join('')
  return iguales(firma, partes.v1)
}

/** Compara sin cortar en la primera diferencia: el tiempo no dice cuánto se acertó. */
export function iguales(a: string, b: string): boolean {
  let distinta = a.length ^ b.length
  for (let i = 0; i < a.length; i++) distinta |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0)
  return distinta === 0
}

function tokenMp(env: Env): string {
  const token = env.MP_MODO === 'produccion' ? env.MP_ACCESS_TOKEN_PRODUCCION : env.MP_ACCESS_TOKEN
  if (!token) throw new Error(`Falta el token de Mercado Pago del modo ${env.MP_MODO}.`)
  return token
}

async function mp<T>(env: Env, metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`${MP}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${tokenMp(env)}`, 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })
  const datos = (await r.json().catch(() => ({}))) as { message?: string }
  if (!r.ok) {
    // Solo el estado y el mensaje: nada del cliente.
    console.error('Mercado Pago', metodo, ruta.replace(/\/[\w-]{12,}$/, '/…'), r.status, datos.message ?? '')
    throw new Rechazo(r.status, datos.message ?? `Mercado Pago respondió ${r.status}`)
  }
  return datos as T
}

export async function cuerpo(req: Request): Promise<Record<string, unknown>> {
  const c = await req.json().catch(() => null)
  if (!c || typeof c !== 'object') throw new Rechazo(400, 'Petición inválida.')
  return c as Record<string, unknown>
}

function base64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))
}

export function json(datos: unknown, status = 200, cabeceras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(datos), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cabeceras } })
}

/**
 * El aviso de cada cobro que viene (LFPC art. 76 Bis VIII: al menos 5 días naturales antes de cada renovación). Antes de
 * avisar se vuelve a leer la suscripción: si se canceló o cambió la fecha, no se avisa de un cobro que no va a pasar.
 */
export async function avisarCobros(env: Env, ahora = Date.now()) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM licencias WHERE estado = 'authorized' AND pagado_hasta IS NOT NULL AND (avisado_para IS NULL OR avisado_para != pagado_hasta)"
  ).all<Fila>()
  for (const vieja of results) {
    if (!faltaAvisar(vieja, ahora)) continue
    const f = await refrescar(env, vieja).catch(() => null)
    if (!f || !faltaAvisar(f, ahora)) continue
    const cada = f.plan === 'anual' ? 'anual' : 'mensual'
    const enviado = await correo(env, f.email, `Tu próximo cobro de Sloth: ${fecha(f.pagado_hasta!)}`, [
      'Hola:',
      `El ${fecha(f.pagado_hasta!)} ${quien(f)} te cobrará ${f.monto.toLocaleString('es-MX')} MXN (IVA incluido)${f.stripe ? ', o lo mismo en tu moneda si pagas desde fuera de México,' : ''} por tu suscripción ${cada} a Sloth.`,
      'Si no quieres que se renueve, cancélala antes de esa fecha en Sloth: Opciones, Suscripción, «Cancelar suscripción». También puedes responder a este correo o escribirnos por WhatsApp. Lo ya pagado sigue valiendo hasta su fecha.',
      ...(f.stripe ? ['¿Cambiaste de tarjeta? Ponla en Sloth: Opciones, Suscripción, «Cambiar tarjeta».'] : [])
    ]).catch((e) => (console.error('Aviso de cobro', e instanceof Error ? e.message : e), false))
    if (enviado) await env.DB.prepare('UPDATE licencias SET avisado_para = ? WHERE id = ?').bind(f.pagado_hasta, f.id).run()
  }
}

/** Si el próximo cobro de esta suscripción ya está a `AVISO` o menos y aún no se le avisó. */
export function faltaAvisar(f: Pick<Fila, 'estado' | 'pagado_hasta' | 'avisado_para'>, ahora: number): boolean {
  if (f.estado !== 'authorized' || !f.pagado_hasta || f.avisado_para === f.pagado_hasta) return false
  const cobro = Date.parse(f.pagado_hasta)
  return cobro > ahora && cobro - ahora <= AVISO
}

/** Manda un correo con Resend. `false` si no hay llave todavía: se anota y no se marca como enviado. */
async function correo(env: Env, para: string, asunto: string, parrafos: string[]): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log('Correo sin mandar (falta RESEND_API_KEY):', asunto)
    return false
  }
  const pie = `${PROVEEDOR} · ${env.CORREO_RESPUESTA}`
  const html = `<div style="font:15px/1.6 system-ui,sans-serif;color:#1b1408;max-width:560px">${parrafos.map((p) => `<p>${escapar(p)}</p>`).join('')}<p style="color:#9a907f;font-size:12px">${escapar(pie)}</p></div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    // Resend pide un User-Agent, y el fetch de un Worker no manda ninguno.
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'user-agent': 'sloth-licencias' },
    body: JSON.stringify({ from: env.CORREO_DE, to: [para], reply_to: env.CORREO_RESPUESTA, subject: asunto, text: [...parrafos, '', pie].join('\n\n'), html })
  })
  if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return true
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** «21 de noviembre de 2026», en la hora de la Ciudad de México. */
function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' })
}

/**
 * Adonde vuelve el cliente tras pagar en Mercado Pago o en Stripe (`?s=` es su suscripción, que solo conocen él y quien
 * cobra).
 * Mientras no se confirme el pago, se recarga sola y vuelve a preguntar; confirmado, enseña la clave y el instalador de
 * cada sistema. Sin `s` viene de la app de antes, que espera abierta y se desbloquea sola.
 */
async function gracias(env: Env, url: URL): Promise<Response> {
  const id = url.searchParams.get('s') ?? ''
  let fila = /^[\w-]{36}$/.test(id) ? await env.DB.prepare('SELECT * FROM licencias WHERE id = ?').bind(id).first<Fila>() : null
  if (fila?.estado === 'pending' && !(Date.now() - Date.parse(fila.revisada ?? '') < REVISAR_PENDIENTE)) {
    const vieja = fila
    fila = await refrescar(env, vieja).catch(() => vieja)
  }
  if (!fila)
    return pagina(
      '¡Listo!',
      `${correoAviso('tu correo')}<p>Tu clave te llega por correo en cuanto se confirme tu pago: pégala en Sloth, en Opciones.</p>`
    )
  if (vigencia(fila, Date.now()).activa)
    return pagina(
      '¡Gracias por apoyar a Sloth!',
      `<p>Esta es tu clave:</p>
<div class="clave"><code>${fila.clave}</code><button type="button" onclick="navigator.clipboard.writeText('${fila.clave}').then(()=>this.textContent='Copiada')">Copiar</button></div>
${correoAviso(escapar(fila.email))}
<a class="boton" href="/descargar">Descargar Sloth para Windows</a>
<p class="otros">También para <a href="/descargar?so=mac">Mac</a> y <a href="/descargar?so=linux">Linux</a>.</p>
<ol><li>Instálala. Si Windows dice «Windows protegió tu PC», da clic en <b>Más información</b> y luego en <b>Ejecutar de todas formas</b>.</li>
<li>Ábrela y pega tu clave en Opciones: deja de salirte el recordatorio. Sirve en dos computadoras a la vez.</li>
<li>Conecta tu cuenta de Claude, elige un estilo y escribe el tema.</li></ol>`
    )
  if (fila.estado === 'pending')
    return pagina(
      'Esperando tu pago…',
      `<p>En cuanto ${quien(fila)} lo confirme, aquí aparecen tu clave y el instalador. Suele tardar unos segundos.</p>${correoAviso(escapar(fila.email))}`,
      5
    )
  return pagina(
    `${quien(fila)} no confirmó el pago`,
    '<p>Vuelve a <a href="https://sloth.vancci.org">sloth.vancci.org</a> e inténtalo otra vez, o escríbenos desde ahí.</p>'
  )
}

/**
 * Lo que se lee antes de bajar la de Mac: sin la firma de Apple (docs/adr/0006-mac-y-linux.md), macOS no la deja abrir a
 * la primera ni se actualiza sola. Cuando vaya firmada, esta página sobra.
 */
function avisoMac(u: Ultima): Response {
  return pagina(
    'Sloth para Mac',
    `<p>Sloth para Mac todavía no lleva la firma de Apple: ya estamos trabajando en eso. Mientras, macOS pide un paso más la primera vez.</p>
<a class="boton" href="/descargar?so=mac&amp;visto">Descargar Sloth ${u.version} para Mac</a>
<ol><li>Abre el archivo que se baja y arrastra <b>Sloth</b> a <b>Aplicaciones</b>.</li>
<li>Ábrela. macOS dirá que no puede comprobarla: cierra ese aviso, ve a <b>Configuración del Sistema → Privacidad y seguridad</b> y pulsa <b>«Abrir de todos modos»</b>. Solo la primera vez.</li>
<li>Cuando salga una versión nueva, Sloth te avisa y la bajas aquí otra vez, encima de la que tienes: tus videos y tus hilos se quedan.</li></ol>
<p class="otros">Para Mac con Intel. En un Mac con M1 o más nuevo también abre: la primera vez, macOS pide instalar Rosetta.</p>`
  )
}

/** Que la clave llega también por correo, bien a la vista: es lo que queda si se cierra la página. */
function correoAviso(para: string): string {
  return `<div class="correo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><div><b>Tu clave también te llega a ${para}</b>, con el enlace para descargar Sloth. Puedes cerrar esta página: la tienes ahí. Si no la ves en unos minutos, revisa spam o promociones.</div></div>`
}

/** Una página suelta con los colores de Sloth. Con `recargar`, se recarga sola cada tantos segundos. */
function pagina(titulo: string, cuerpo: string, recargar?: number): Response {
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${recargar ? `<meta http-equiv="refresh" content="${recargar}">` : ''}<title>${titulo} · Sloth</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f0e0c;color:#ede6d6;font:16px/1.55 system-ui,sans-serif}
main{max-width:460px;padding:32px}h1{font-size:22px;margin:0 0 10px}p,li{color:#9a907f}p{margin:0 0 16px}b{color:#ede6d6}a{color:#e8a33d}ol{margin:20px 0 0;padding-left:20px}li{margin:6px 0}
.clave{display:flex;gap:10px;align-items:center;margin:0 0 16px;padding:12px 14px;border:1px solid #2e2a24;border-radius:10px;background:#171512}
.clave code{flex:1;font:600 17px/1.3 ui-monospace,Consolas,monospace;letter-spacing:.04em}
.clave button{padding:6px 12px;border:1px solid #2e2a24;border-radius:8px;background:#221f1b;color:#ede6d6;font:inherit;font-size:14px;cursor:pointer}
.correo{display:flex;gap:12px;align-items:flex-start;margin:0 0 16px;padding:14px 16px;border:1px solid #e8a33d;border-radius:10px;background:rgba(232,163,61,.13);color:#ede6d6;font-size:15px}
.correo svg{flex:none;width:22px;height:22px;margin-top:1px;color:#e8a33d}.correo b{color:#e8a33d}
.boton{display:block;padding:14px;border-radius:10px;background:#e8a33d;color:#1b1408;font-weight:800;text-align:center;text-decoration:none}
.otros{margin:10px 0 0;font-size:14px;text-align:center}</style></head>
<body><main><h1>${titulo}</h1>${cuerpo}</main></body></html>`,
    // Con la clave a la vista: que no se guarde en ninguna caché.
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } }
  )
}
