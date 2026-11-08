/**
 * El cobro de Sloth: el apoyo mensual o anual con PayPal, las cuentas gratis y la clave que revisa la app
 * (`server/licencia.ts`). Sloth es gratis: el apoyo es opcional y quita el recordatorio de la app. La página
 * (sloth.vancci.org) suscribe desde el navegador (`POST /suscribir`, que da el enlace de pago de PayPal) y,
 * pagada, `/gracias` enseña la clave y el instalador; la clave llega también por correo. La
 * app crea una cuenta gratis con su `equipo` (`plan: 'gratis'`, que da una de plan `cuenta`) para entrar a la comunidad;
 * su clave solo llega por correo (`unirse`).
 * Al abrir y cada pocas horas, Sloth pregunta cómo va su clave (`POST /licencia`). La respuesta va firmada con `FIRMA`
 * (Ed25519): Sloth la guarda y, sin internet, vale hasta su `hasta` sin que se pueda alargar a mano.
 *
 * PayPal manda: cada aviso (`POST /webhook/paypal`) y cada revisión vuelven a leer la suscripción o la orden de su API,
 * así que un aviso perdido o repetido solo cambia cuándo se entera Sloth. En D1, `licencias` (una por suscripción o
 * lugar gratis) y `equipos` (las computadoras de cada clave, `EQUIPOS` como mucho). El mensual es una suscripción
 * (`paypal`) a un plan de su monto, que se crea la primera vez (`paypal_ids`).
 *
 * El anual es una orden de PayPal (`orden`) que se cobra una vez: no se renueva sola (estado `pagado`). Cada cobro de la
 * fila suma un año, y el cron avisa antes de que se acabe con un enlace para pagar el siguiente (`/renovar`), con la
 * misma clave. Lo cobrado de cada orden se guarda en `paypal_pagos`, así que un aviso repetido no suma dos veces. La
 * orden aprobada hay que cobrarla (`capture`): lo hace quien se entere primero, `/gracias` o el aviso.
 *
 * También se paga con Mercado Pago (`pasarela: 'mercadopago'`), que solo cobra en pesos (`mxn` en `/precio`): el
 * mensual es una suscripción (`preapproval`) y el año o el apoyo de una vez, un pago de Checkout Pro (`preferencia`),
 * con OXXO, SPEI y meses sin intereses. Se leen, se cancelan y avisan (`POST /webhook`) en Mercado Pago. Del 29 de
 * octubre al 4 de noviembre de 2026 solo se pudo pagar con PayPal; un año de Mercado Pago que se renovó entonces con
 * PayPal sigue renovándose con PayPal.
 * Con tarjeta (`pasarela: 'tarjeta'`) cobra Stripe (`stripe.ts`), en `MONEDA` y con tarjetas de cualquier país: el
 * mensual es una suscripción y el año o el apoyo de una vez, un pago suelto de Stripe Checkout (`stripe`). Se leen, se
 * cancelan y avisan (`POST /webhook/stripe`) allá. Desde el 6 de noviembre de 2026: ese día se cobró la tarjeta unas
 * horas con Mercado Pago, que no le cobra cada mes a un correo con cuenta suya de otro país.
 * Y con cripto (`pasarela: 'cripto'`), en NOWPayments y en `MONEDA`: no hay cobro automático, así que el mes, el año y
 * el apoyo de una vez son cada uno una factura (`cripto`) que se paga con la moneda que se elija, desde Binance o
 * cualquier wallet. El mensual vale un mes por pago y, como el año, el cron avisa antes de que se acabe con el enlace
 * del siguiente. Cada aviso (`POST /webhook/cripto`) trae un pago, que se vuelve a leer de su API y se guarda en
 * `cripto_pagos`.
 *
 * El apoyo sugerido cuesta lo mismo para todos (`PRECIO_MENSUAL` o `PRECIO_ANUAL`). Desde el 4 de noviembre de 2026 el
 * mensual también va con el monto que elija cada quien (desde `APOYO_MINIMO`; con `APOYO_GRANDE` o más, la insignia
 * de apoyo grande), y hay un apoyo de una vez (`unico`): una orden como la del año, de cualquier monto, que vale un mes.
 * Ser Fundador (`fundador`) da más beneficios que a quien llega después. Lo es quien paga el precio de Fundador
 * (`PRECIO_MENSUAL`) o más, cada mes o una vez, mientras lo pagado no vence (`esFundador`): al vencer, el lugar se libera.
 * Por la página son `FUNDADORES` lugares como mucho (llenos, la página solo enseña el grande y «Lo que gustes»); con un enlace
 * de invitación del creador (`enlaces_fundador`, que da `npm run fundador`), que es de una sola persona y deja de servir
 * con su primer pago, la página ofrece el precio de Fundador aunque los lugares estén ocupados. Cada suscripción conserva el monto y la moneda con que se creó: las de antes
 * del 30 de octubre de 2026 siguen en pesos; las nuevas, en `MONEDA`.
 * Cuando Sloth se vendía, las primeras personas se unieron gratis de por vida (plan `gratis`, `GRATIS` como mucho): son
 * fundadoras como las primeras que apoyan (`esFundador`), con lo nuevo `ANTICIPO` antes y sin el recordatorio. Ya no se
 * dan.
 *
 * También da el instalador: `GET /descargar` es la última versión, libre; la de Mac (Intel), la de Mac con Apple Silicon,
 * la de Mac con macOS 12 y la de Linux, con `?so=mac`, `?so=mac-arm64`, `?so=mac12` y `?so=linux` (también en `/version`). Está en R2
 * (`DESCARGAS`) y lo sube `npm run publicar` por partes, con `PUBLICAR`: pesa más de lo que aceptan wrangler (300 MiB)
 * y una petición a un Worker (100 MB). `ultima.json` dice cuál es la última. Y las actualizaciones de la app instalada
 * (electron-updater): `GET /actualizaciones/latest.yml` dice cuál es la nueva (quien apoya la recibe `ANTICIPO` antes:
 * a los demás se les sigue dando la anterior, que se guarda en `anterior/` al publicar; el creador la da a todos antes,
 * en un live, con `liberar`, y la app lo ve en su vistazo a `GET /ultima`), y de su instalador baja solo los pedazos
 * que cambiaron, con el mapa de bloques de cada versión (`.blockmap`). Se quedan los mapas de todas, los últimos
 * instaladores y el de la anterior; si este falta, a todos se les da la última.
 *
 * Lo que pide la Ley Federal de Protección al Consumidor (art. 76 Bis VIII y IX) para un cobro recurrente: suscribirse
 * exige aceptar el cobro automático y los términos (se guarda cuándo y qué versión), cancelar da un folio, y el cron de
 * cada mañana avisa por correo (Resend) al menos 5 días antes de cada cobro. El año pagado de una vez no tiene cobro
 * automático: se aceptan sus términos y el pago único.
 *
 * Y la comunidad (`/comunidad/*`, en `comunidad.ts`), de quien tiene una licencia activa, y la voz de Voices Cloning
 * (`/voz/*`, en `voz.ts`), que guarda aquí la llave del socio.
 */
import type { VersionLiberable } from '../../shared/types.ts'
import { comunidad, creditos, olvidarSueltos } from './comunidad.ts'
import { cancelarStripe, firmaDeStripe, leerStripe, modoStripe, pagoDeSesion, sesion, sesionStripe, suscripcionStripe, type PagoStripe, type SesionStripe } from './stripe.ts'
import { olvidarRegistroVoz, renovarVoces, voz } from './voz.ts'
import { entregarRifas } from './rifa.ts'
import { APERTURA_VOZ } from './voz-mensual.ts'

export interface Env {
  DB: D1Database
  DESCARGAS: R2Bucket
  /** La llave de `npm run publicar`, que solo vive en GitHub (el secreto PUBLICAR): sube versiones y lo puede todo. */
  PUBLICAR?: string
  /**
   * La llave del creador en su computadora (%APPDATA%\sloth\licencias\admin.txt): la comunidad, las voces y los apoyos a
   * mano, pero no publicar. Ahí la leen sus agentes, y con ella no se reparte una versión a todos.
   */
  ADMIN?: string
  /** `prueba` cobra en el sandbox de PayPal; `produccion`, de verdad. Las llaves son las de la app de PayPal de ese modo. */
  PAYPAL_MODO: 'prueba' | 'produccion'
  PAYPAL_CLIENT_ID?: string
  PAYPAL_SECRET?: string
  /** El id del webhook de esa app: con él, PayPal confirma que un aviso es suyo. */
  PAYPAL_WEBHOOK_ID?: string
  /** Las suscripciones de Mercado Pago de antes: `prueba`, la vendedora de prueba (`MP_ACCESS_TOKEN`); `produccion`, la real. */
  MP_MODO: 'prueba' | 'produccion'
  MP_ACCESS_TOKEN: string
  MP_ACCESS_TOKEN_PRODUCCION?: string
  MP_WEBHOOK_SECRET?: string
  /** La llave secreta de Stripe, que cobra la tarjeta: con `sk_live_` de verdad; con `sk_test_`, en su modo de prueba. Sin ella (o sin la de sus avisos), no se ofrece. */
  STRIPE_SECRET_KEY?: string
  /** El secreto de firma (`whsec_…`) del webhook de Stripe. */
  STRIPE_WEBHOOK_SECRET?: string
  /** El cobro con cripto: `prueba`, el sandbox de NOWPayments; `produccion`, de verdad. Sin su llave, no se ofrece. */
  NOWPAYMENTS_MODO: 'prueba' | 'produccion'
  NOWPAYMENTS_API_KEY?: string
  /** La clave de sus avisos (IPN), con la que firman cada uno. */
  NOWPAYMENTS_IPN_SECRET?: string
  /** La llave privada Ed25519 en PKCS8 y base64. */
  FIRMA: string
  /** La dirección de este Worker, para la página a la que vuelve el cliente tras pagar. */
  ORIGEN: string
  PRECIO_MENSUAL: number
  PRECIO_ANUAL: number
  /** Lo menos que se apoya con el monto que elija cada quien, al mes o de una vez. */
  APOYO_MINIMO: number
  /** Desde cuánto al mes es un apoyo grande: su insignia en la comunidad. */
  APOYO_GRANDE: number
  /** La moneda de esos precios, con su código de PayPal. */
  MONEDA: string
  /** Los mismos, en pesos, para quien paga con Mercado Pago (solo cobra en MXN). */
  PRECIO_MENSUAL_MXN: number
  PRECIO_ANUAL_MXN: number
  APOYO_MINIMO_MXN: number
  APOYO_GRANDE_MXN: number
  /** Con cripto, lo menos que se apoya con el monto elegido: NOWPayments no acepta menos en las redes más usadas. */
  APOYO_MINIMO_CRIPTO: number
  /** Con `"1"`, no se abren apoyos nuevos con PayPal (la página lo esconde): mientras PayPal revisa la cuenta. Los de antes siguen. */
  SIN_PAYPAL?: string
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
  /**
   * Las llaves de socio de Voices Cloning (`pk_live_…`), cada una su cuenta y su saldo: `VOICES_PK_LIVE` y, si hay más,
   * `VOICES_PK_LIVE_2`, `_3`… Sin ninguna, la app no ofrece sus voces (`voz.ts`).
   */
  VOICES_PK_LIVE?: string
  [llave: `VOICES_PK_LIVE_${number}`]: string | undefined
  /** Los créditos de voz con que se da de alta a cada quien la primera vez que abre las voces de Voices Cloning. */
  VOZ_CREDITOS?: number
  /** Con `"1"`, las voces de Voices Cloning son solo del creador, aunque alguien más tenga créditos. */
  VOZ_SOLO_CREADOR?: string
}

/**
 * `unico`: un apoyo de una vez, que vale un mes; `gratis`: un lugar gratis de por vida, de cuando Sloth se vendía;
 * `cuenta`: una cuenta gratis, sin apoyo.
 */
type Plan = 'mensual' | 'anual' | 'unico' | 'gratis' | 'cuenta'
/**
 * Los de Mercado Pago, `gratis` para un lugar gratis de por vida o una cuenta (para quitárselos, `cancelled`) y
 * `pagado` para un año pagado de una vez, que vale hasta `pagado_hasta` sin renovarse.
 */
/** `vetada`: la bloqueó el creador, a mano; su correo ya no entra a la comunidad ni abre otra cuenta. */
export type Estado = 'pending' | 'authorized' | 'paused' | 'cancelled' | 'gratis' | 'pagado' | 'vetada'

export interface Fila {
  id: string
  clave: string
  email: string
  plan: Plan
  monto: number
  /** La moneda de `monto`, con su código de PayPal: la de `MONEDA` al crearse. */
  moneda: string
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
  /** Cuándo aceptó Resend el correo con la clave. Vacía con el pago ya confirmado: el cron lo reintenta (`reenviarClaves`). */
  clave_enviada?: string | null
  /** El `PAYPAL_MODO` (antes, el `MP_MODO`) con que se creó. */
  modo: string
  /** Un año pagado de una vez con Mercado Pago: el último pago de Checkout Pro que se abrió para ella. */
  preferencia: string | null
  /** La suscripción mensual de PayPal. */
  paypal: string | null
  /** Un año pagado de una vez con PayPal: la última orden que se abrió para ella. */
  orden: string | null
  /** Pagada con cripto (el mes, el año o de una vez): la última factura de NOWPayments que se abrió para ella. */
  cripto: string | null
  /** Pagada con tarjeta, en Stripe: su última sesión de Checkout (`cs_…`) y, pagado el mensual, su suscripción (`sub_…`). */
  stripe: string | null
  /** El enlace de Fundador con que se abrió (`enlaces_fundador`): al confirmarse el primer pago, ya no sirve a nadie más. */
  enlace_fundador?: string | null
}

/** Lo que el cobro guarda de una suscripción o de los pagos del año. `hasta`: su próximo cobro o su fin, si se sabe. */
export interface Lectura {
  estado: Estado
  hasta?: string
}

/** Un año (o un mes, el apoyo `unico` y el mensual con cripto) pagado de una vez, con Mercado Pago, PayPal, cripto o tarjeta: no se renueva solo. */
const deUnaVez = (f: Pick<Fila, 'preferencia' | 'orden' | 'cripto' | 'stripe' | 'plan'>) => !!(f.preferencia || f.orden || f.cripto || (f.stripe && f.plan !== 'mensual'))
/** Lo más que se apoya de una sola vez con el monto que elija cada quien, en cada moneda. */
const APOYO_MAXIMO: Record<string, number> = { USD: 1000, MXN: 20000 }
/** Quién cobra la suscripción de la fila, o quién cobró el primer año: para los correos y la página de gracias. */
const pasarela = (f: Pick<Fila, 'preapproval' | 'preferencia' | 'cripto' | 'stripe'>) => (f.stripe ? 'Stripe' : f.cripto ? 'NOWPayments' : f.preapproval || f.preferencia ? 'Mercado Pago' : 'PayPal')

/** Cuántos se han unido: los lugares gratis tomados y las suscripciones pagadas alguna vez (de ellas, las de fundador). */
export interface Cuenta {
  fundadores: number
  /** Las que apoyan hoy con el precio de Fundador o más, cada mes o una vez: pagadas y sin vencer, aunque ya cancelaran. */
  apoyan: number
}

type Tarifas = Pick<
  Env,
  | 'FUNDADORES'
  | 'FUNDADORES_HASTA'
  | 'PRECIO_MENSUAL'
  | 'PRECIO_ANUAL'
  | 'APOYO_MINIMO'
  | 'APOYO_GRANDE'
  | 'MONEDA'
  | 'PRECIO_MENSUAL_MXN'
  | 'PRECIO_ANUAL_MXN'
  | 'APOYO_MINIMO_MXN'
  | 'APOYO_GRANDE_MXN'
>
/** Lo que cuesta el apoyo en una moneda: el sugerido al mes y al año, y de cuánto a cuánto se elige. */
export interface Precios {
  mensual: number
  anual: number
  minimo: number
  grande: number
  maximo: number
  moneda: string
}
/** Con qué se paga: PayPal (en `MONEDA`), Mercado Pago (en pesos), tarjeta (Stripe, en `MONEDA`) o cripto (NOWPayments, en `MONEDA`). */
type Pasarela = 'paypal' | 'mercadopago' | 'tarjeta' | 'cripto'

interface Preapproval {
  id: string
  status: string
  init_point?: string
  next_payment_date?: string
  external_reference?: string
}

/** Una suscripción de PayPal, con lo que se lee de ella. `approve` (en `links`) es adonde va el cliente. */
interface SuscripcionPaypal {
  id: string
  status: string
  custom_id?: string
  billing_info?: { next_billing_time?: string }
  links?: { rel: string; href: string }[]
}

/** Una orden de PayPal: `payer-action` (en `links`) es adonde va el cliente; `custom_id`, su fila. */
interface OrdenPaypal {
  id: string
  status: string
  links?: { rel: string; href: string }[]
  purchase_units?: { custom_id?: string; payments?: { captures?: { status: string; amount: { value: string; currency_code: string }; create_time?: string }[] } }[]
}

/** Un aviso de PayPal: solo dice qué cambió. */
interface AvisoPaypal {
  event_type?: string
  resource?: {
    id?: string
    custom_id?: string
    billing_agreement_id?: string
    purchase_units?: { custom_id?: string }[]
    supplementary_data?: { related_ids?: { order_id?: string } }
  }
}

/** Un pago de Mercado Pago, con lo que se lee de él. */
export interface PagoMp {
  id: number
  status: string
  transaction_amount: number
  currency_id: string
  date_approved?: string | null
  external_reference?: string | null
}

/** Un pago de NOWPayments: el que hace el cliente con la moneda que eligió en la factura. `order_id` es su fila. */
interface PagoCripto {
  payment_id: number | string
  payment_status: string
  price_amount: number
  price_currency: string
  order_id?: string | null
  updated_at?: string
}

const MP = 'https://api.mercadopago.com'
const PAYPAL = { produccion: 'https://api-m.paypal.com', prueba: 'https://api-m.sandbox.paypal.com' }
const NOWPAYMENTS = { produccion: 'https://api.nowpayments.io', prueba: 'https://api-sandbox.nowpayments.io' }
/**
 * El estado de un pago de NOWPayments, con el nombre de Mercado Pago que entiende `leerPagos`. Vale desde que la red lo
 * confirmó (`confirmed`), aunque NOWPayments aún no lo mande a la wallet; el que pagó de menos (`partially_paid`) no
 * vale: se arregla con soporte.
 */
const COBRO_CRIPTO: Record<string, string> = {
  waiting: 'pending',
  confirming: 'pending',
  confirmed: 'approved',
  sending: 'approved',
  finished: 'approved',
  partially_paid: 'rejected',
  failed: 'rejected',
  expired: 'rejected',
  cancelled: 'rejected',
  refunded: 'refunded'
}
/** Los pagos que valen: aprobados, o en reclamo mientras no se resuelva en contra (entonces pasan a `charged_back`). */
const VALEN = new Set(['approved', 'in_mediation'])
/** El estado de un cobro de PayPal, con el nombre de Mercado Pago que entiende `leerPagos`. */
const COBRO_PAYPAL: Record<string, string> = {
  COMPLETED: 'approved',
  PARTIALLY_REFUNDED: 'approved',
  PENDING: 'pending',
  REFUNDED: 'refunded',
  REVERSED: 'charged_back',
  DECLINED: 'rejected',
  FAILED: 'rejected'
}
const DIA = 24 * 3600_000
/** Sin internet, Sloth sigue abierta hasta una semana desde la última respuesta. */
const SIN_CONEXION = 7 * DIA
/** Cada cuánto se vuelve a leer de PayPal (o de Mercado Pago) una suscripción al revisarla; pendiente, casi siempre (esperan el pago). */
const REVISAR = 6 * 3600_000
const REVISAR_PENDIENTE = 10_000
/** Las computadoras que pueden usar una clave a la vez: las que preguntaron en los últimos `VISTO`. */
const EQUIPOS = 2
const VISTO = 30 * DIA
/** Las cuentas gratis que se piden (o se vuelven a pedir) desde una misma conexión en un día. */
const CUENTAS_AL_DIA = 5
/** Los correos de cuenta que recibe una misma dirección en un día: pedirla otra vez no manda correos sin fin. */
const CORREOS_AL_DIA = 3
/** Los pagos que se abren desde una misma conexión en un día (un doble clic no cuenta: reusa el de la última hora). */
const PAGOS_AL_DIA = 20
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
const BINARIO = /^Sloth-(?:Setup-)?\d+\.\d+\.\d+(?<tipo>\.exe|-mac-(?:arm64|x64)\.(?:dmg|zip)|-mac12-x64\.(?:dmg|zip)|-linux-(?:arm64|x86_64)\.AppImage)$/
const AL_DIA = /^latest(-mac|-arm64-mac|-mac12-mac|-linux)?\.yml$/
const publicable = (archivo: string) => AL_DIA.test(archivo) || BINARIO.test(archivo.replace(/\.blockmap$/, ''))
/**
 * Cada sistema que se descarga (`?so=`) y dónde dice cuál es su última versión. Sin `so`, Windows. La de Mac con Apple
 * Silicon sale en su propia máquina y tiene su última aparte; `mac` es la de Intel, y `mac12`, la de Intel con Electron
 * 43 que abre en macOS 12 (scripts/compilar.mjs).
 */
const ULTIMAS = { windows: 'ultima.json', mac: 'ultima-mac.json', 'mac-arm64': 'ultima-mac-arm64.json', mac12: 'ultima-mac12.json', linux: 'ultima-linux.json' } as const
/** Lo que lee electron-updater de cada sistema. */
const YML = { windows: 'latest.yml', mac: 'latest-mac.yml', 'mac-arm64': 'latest-arm64-mac.yml', mac12: 'latest-mac12-mac.yml', linux: 'latest-linux.yml' } as const
const NOMBRES = { windows: 'Windows', mac: 'Mac con Intel', 'mac-arm64': 'Mac con Apple Silicon', mac12: 'Mac con macOS 12', linux: 'Linux' } as const
type Sistema = keyof typeof ULTIMAS
export const sistema = (so: string | null): Sistema => (so && so !== 'windows' && Object.hasOwn(ULTIMAS, so) ? (so as Sistema) : 'windows')
/** El sistema del que `archivo` es el instalador; `undefined` si no es uno (el .zip de Mac, un mapa, latest.yml). */
export function instaladorDe(archivo: string): Sistema | undefined {
  const tipo = BINARIO.exec(archivo)?.groups?.tipo
  if (tipo?.endsWith('.dmg')) return tipo.includes('arm64') ? 'mac-arm64' : tipo.includes('mac12') ? 'mac12' : 'mac'
  return tipo === '.exe' ? 'windows' : tipo?.endsWith('.AppImage') ? 'linux' : undefined
}
/** El sistema de un instalador, del .zip de Mac o de su mapa de bloques; `undefined` si no es uno. */
export function sistemaDelBinario(archivo: string): Sistema | undefined {
  const tipo = BINARIO.exec(archivo.replace(/\.blockmap$/, ''))?.groups?.tipo
  if (!tipo) return
  if (tipo === '.exe') return 'windows'
  if (tipo.endsWith('.AppImage')) return 'linux'
  return tipo.includes('arm64') ? 'mac-arm64' : tipo.includes('mac12') ? 'mac12' : 'mac'
}
/** La versión en el nombre de un archivo publicado (`0.3.4`). */
export const versionDe = (archivo: string) => /\d+\.\d+\.\d+/.exec(archivo)?.[0]
/** El sistema de un `latest*.yml`. */
export const sistemaDelYml = (archivo: string): Sistema => (Object.entries(YML).find(([, y]) => y === archivo)?.[0] as Sistema | undefined) ?? 'windows'
/** De cada tipo de archivo (el .exe, el .dmg y el .zip de Mac, el AppImage) se quedan el último y el de antes en R2, por si alguien lo está bajando al publicar. */
const INSTALADORES = 3

/**
 * De los instaladores de un tipo en R2, los que sobran: los que pasan de los `INSTALADORES` más nuevos, salvo los de
 * `guardar` (las versiones de `anterior/`, que aún se dan a quien no apoya, aunque detrás hayan salido varias).
 */
export function sobran(objetos: { key: string; uploaded: Date }[], guardar: string[]): string[] {
  return [...objetos]
    .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime())
    .slice(INSTALADORES)
    .map((o) => o.key)
    .filter((key) => !guardar.includes(/\d+\.\d+\.\d+/.exec(key)?.[0] ?? ''))
}
/** La versión de los términos que acepta el cliente: la fecha de su «Última actualización» (sloth.vancci.org/terminos). */
const TERMINOS = /^\d{4}-\d{2}-\d{2}$/
/** Cuánto antes que los demás recibe lo nuevo quien apoya. */
const ANTICIPO = 7 * DIA
/**
 * Si una fila de `licencias` hace fundadora a su correo: un apoyo de Fundador pagado y sin vencer (al acabarse lo pagado,
 * el lugar se libera; desde el 6 de noviembre de 2026, para todos), o un lugar gratis de por vida que sigue en pie. `t` es
 * el nombre de la tabla en la consulta.
 */
export function esFundador(t: string) {
  return `((${t}.fundador = 1 AND ${t}.autorizada IS NOT NULL AND julianday(${t}.pagado_hasta) > julianday('now')) OR (${t}.plan = 'gratis' AND ${t}.estado = 'gratis'))`
}

/** Un enlace de invitación de Fundador que sigue en pie (`enlaces_fundador`): sin revocar y sin que nadie haya pagado con él. */
async function enlaceFundador(env: Env, codigo: unknown): Promise<boolean> {
  if (typeof codigo !== 'string' || !/^[A-Za-z0-9]{8,32}$/.test(codigo)) return false
  return !!(await env.DB.prepare('SELECT 1 FROM enlaces_fundador WHERE codigo = ? AND revocado IS NULL AND usado IS NULL').bind(codigo).first())
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
  /** La de Mac, firmada con el certificado de Apple: se actualiza sola, y solo se le pone encima otra firmada. */
  firmada?: boolean
  /** Firmada, pero Apple no la había notarizado al publicarla (scripts/notarizar.mjs): aún pide «Abrir de todos modos». */
  sinTicket?: boolean
}

/** La de Mac que abre a la primera, sin «Abrir de todos modos». */
const abreALaPrimera = (u: Ultima) => !!u.firmada && !u.sinTicket

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

  /** Cada 10 minutos, las claves que no salieron, los créditos de voz y los premios de la rifa; cada mañana, el aviso de los cobros que vienen. */
  async scheduled(evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (evento.cron === '*/10 * * * *') {
      ctx.waitUntil(reenviarClaves(env).catch((e) => console.error('Claves sin mandar', e instanceof Error ? e.message : e)))
      ctx.waitUntil(renovarVoces(env, ctx).catch((e) => console.error('Créditos mensuales de voz', e instanceof Error ? e.message : e)))
      ctx.waitUntil(entregarRifas(env, ctx).catch((e) => console.error('Premios de la rifa', e instanceof Error ? e.message : e)))
      return
    }
    ctx.waitUntil(avisarCobros(env).catch((e) => console.error('Avisos de cobro', e instanceof Error ? e.message : e)))
    ctx.waitUntil(env.DB.prepare('DELETE FROM cupos WHERE creado < ?').bind(new Date(Date.now() - 2 * DIA).toISOString()).run())
    ctx.waitUntil(olvidarRegistroVoz(env).catch((e) => console.error('Registro de la voz', e instanceof Error ? e.message : e)))
    ctx.waitUntil(olvidarSueltos(env).catch((e) => console.error('Archivos sueltos de la comunidad', e instanceof Error ? e.message : e)))
  }
} satisfies ExportedHandler<Env>

async function atender(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  try {
    if (req.method === 'GET' && url.pathname === '/precio') return json(await precios(env, url.searchParams.get('fundador') ?? undefined))
    // Los Fundadores que pidieron salir en los créditos de la página.
    if (req.method === 'GET' && url.pathname === '/creditos') return json({ fundadores: await creditos(env) })
    if (req.method === 'GET' && url.pathname === '/version') return json(await ultimaPara(req, env, sistema(url.searchParams.get('so'))))
    if (req.method === 'GET' && url.pathname === '/ultima') return await ultimaLigera(req, env, ctx, sistema(url.searchParams.get('so')))
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/descargar') {
      const so = sistema(url.searchParams.get('so'))
      const u = await ultimaPara(req, env, so)
      // `?so=mac` (el enlace de la página y de los correos) deja elegir entre la de Apple Silicon, la de Intel y la de
      // macOS 12; la que aún no va firmada por Apple dice antes cómo se abre la primera vez.
      if ((so === 'mac' || so === 'mac-arm64' || so === 'mac12') && !url.searchParams.has('visto')) {
        const otra = (cual: Sistema) => (so === cual ? u : so === 'mac' ? ultimaPara(req, env, cual).catch(() => undefined) : undefined)
        const [intel, arm, viejo] = await Promise.all([so === 'mac' ? u : undefined, otra('mac-arm64'), otra('mac12')])
        if ([intel, arm, viejo].some((m) => m && !abreALaPrimera(m)) || (intel && (arm || viejo))) return avisoMac(intel, arm, viejo)
      }
      return servir(req, env, u.archivo, u.bytes, { 'content-disposition': `attachment; filename="${u.archivo}"` })
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/actualizaciones/')) return await actualizaciones(req, env, url)
    if (url.pathname.startsWith('/publicar/')) return await publicar(req, env, url)
    if (req.method === 'GET' && url.pathname === '/gracias') return await gracias(env, url)
    if (req.method === 'GET' && url.pathname === '/renovar') return await renovacion(env, url)
    if (req.method === 'POST' && url.pathname === '/webhook/paypal') return await webhookPaypal(req, env, ctx)
    if (req.method === 'POST' && url.pathname === '/webhook/cripto') return await webhookCripto(req, env, ctx)
    if (req.method === 'POST' && url.pathname === '/webhook/stripe') return await webhookStripe(req, env, ctx)
    if (req.method === 'POST' && url.pathname === '/webhook') return await webhook(req, env, ctx, url)
    if (req.method === 'POST' && url.pathname === '/suscribir') return await suscribir(env, await cuerpo(req), await conexion(req))
    if (req.method === 'POST' && url.pathname === '/licencia') return await licencia(env, await cuerpo(req))
    if (req.method === 'POST' && url.pathname === '/cancelar') return await cancelar(env, await cuerpo(req))
    if (req.method === 'POST' && url.pathname === '/pago') return await pago(env, await cuerpo(req))
    if (req.method === 'POST' && url.pathname === '/a-mano') return await aMano(req, env)
    if (url.pathname === '/comunidad' || url.pathname.startsWith('/comunidad/')) return await comunidad(req, env, url, ctx)
    if (url.pathname === '/voz' || url.pathname.startsWith('/voz/')) return await voz(req, env, ctx, url)
    return json({ error: 'No existe' }, 404)
  } catch (error) {
    if (error instanceof Rechazo) return json({ error: error.message }, error.status)
    console.error(url.pathname, error instanceof Error ? error.message : error)
    if ((url.pathname === '/comunidad' || url.pathname.startsWith('/comunidad/')) && esTopeDeD1(error)) return json({ error: comunidadCaida() }, 503)
    return json({ error: 'Algo falló en el cobro de Sloth. Intenta otra vez en un momento.' }, 500)
  }
}

/** D1 cortó por el tope del día del plan gratis (lecturas o escrituras). Vuelve a medianoche UTC. */
export const esTopeDeD1 = (e: unknown) => /exceeded D1's .*limit/i.test(e instanceof Error ? e.message : String(e))

/** Lo que ve la comunidad mientras D1 está en su tope, con la hora a la que vuelve (en la del centro de México). */
export function comunidadCaida(ahora = new Date()): string {
  const vuelve = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1))
  const hora = vuelve.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' })
  return `Los servidores de la comunidad se cayeron por tanto apoyo, jajaja. Vuelven a las ${hora} (hora del centro de México). Si quieren comentar algo mientras, únanse a la comunidad: ${WHATSAPP}`
}
const WHATSAPP = 'https://chat.whatsapp.com/KXzXmw8yPLYKlTJHGuVSXd'

async function ultima(env: Env, so: Sistema = 'windows'): Promise<Ultima> {
  const u = await env.DESCARGAS.get(ULTIMAS[so])
  if (!u) throw new Rechazo(404, so === 'windows' ? 'Todavía no hay una versión de Sloth para descargar.' : `Todavía no hay una versión de Sloth para ${NOMBRES[so]}.`)
  return u.json<Ultima>()
}

/** El instalador de la última versión de `so`, con `Range` para que el navegador pueda retomar una descarga cortada. */
/** Si `u` ya es de todos (`todos` pasó o no lo tiene). */
export const deTodos = (u: Pick<Ultima, 'todos'>, ahora = Date.now()) => !u.todos || ahora >= Date.parse(u.todos)

/** `u`, de todos desde `ahora` si aún era solo de quien apoya; si ya lo era, igual. */
export const liberada = <U extends Pick<Ultima, 'todos'>>(u: U, ahora: string): U => (deTodos(u, Date.parse(ahora)) ? u : { ...u, todos: ahora })

/**
 * Para el creador (`/comunidad/liberar`): la última versión de cada sistema y, si aún es solo de quien apoya, desde
 * cuándo será de todos. Con `liberar`, lo es ya: cuando el chat de un live cumple su meta. No hay que compilar nada; las
 * apps abiertas lo ven en su siguiente vistazo a `/ultima`.
 */
export async function liberar(env: Env, liberar: boolean): Promise<VersionLiberable[]> {
  const ahora = new Date().toISOString()
  const sistemas = await Promise.all(
    (Object.keys(ULTIMAS) as Sistema[]).map(async (so) => {
      const u = await (await env.DESCARGAS.get(ULTIMAS[so]))?.json<Ultima>()
      if (!u) return
      const nueva = liberar ? liberada(u, ahora) : u
      if (nueva !== u) await env.DESCARGAS.put(ULTIMAS[so], JSON.stringify(nueva), { httpMetadata: { contentType: 'application/json' } })
      return { so, version: nueva.version, ...(deTodos(nueva) ? {} : { todos: nueva.todos }) }
    })
  )
  return sistemas.filter((s) => s !== undefined)
}

/** Cuánto guarda la caché `/ultima`: la piden todas las apps abiertas cada pocos minutos. */
const ULTIMA_EN_CACHE = 30

/**
 * El vistazo de la app instalada (electron/main.ts): la última versión de `so` y desde cuándo es de todos. Si cambia
 * (salió una, o se liberó en un live), la app pregunta por ella de inmediato. Es igual para todos: va en caché.
 */
async function ultimaLigera(req: Request, env: Env, ctx: ExecutionContext, so: Sistema): Promise<Response> {
  const cache = typeof caches === 'undefined' ? undefined : caches.default
  const llave = new Request(new URL(`/ultima?so=${so}`, req.url))
  const guardada = await cache?.match(llave)
  if (guardada) return guardada
  const u = await (await env.DESCARGAS.get(ULTIMAS[so]))?.json<Ultima>()
  const r = json(u ? { version: u.version, ...(u.todos ? { todos: u.todos } : {}) } : {}, 200, { 'cache-control': `public, max-age=${ULTIMA_EN_CACHE}` })
  if (cache) ctx.waitUntil(cache.put(llave, r.clone()))
  return r
}

/**
 * Si quien pregunta apoya hoy: la app manda su clave y su computadora (`x-sloth-clave`, `x-sloth-equipo`), y la clave
 * es de un apoyo vigente (mensual, anual o de una vez), o de un lugar gratis de por vida, en esa computadora.
 */
async function apoya(req: Request, env: Env): Promise<boolean> {
  const clave = (req.headers.get('x-sloth-clave') ?? '').replace(/\s+/g, '').toUpperCase()
  const equipo = req.headers.get('x-sloth-equipo') ?? ''
  if (!CLAVE.test(clave) || !EQUIPO.test(equipo)) return false
  const f = await env.DB.prepare("SELECT l.estado, l.pagado_hasta FROM licencias l JOIN equipos e ON e.clave = l.clave WHERE l.clave = ? AND e.equipo = ? AND l.plan IN ('mensual', 'anual', 'unico', 'gratis')")
    .bind(clave, equipo)
    .first<Pick<Fila, 'estado' | 'pagado_hasta'>>()
  return !!f && vigencia(f, Date.now()).activa
}

/**
 * La versión que le toca a quien pregunta: la última, o la anterior si la última todavía es solo de quien apoya; entonces
 * `nueva` dice cuál es esa, para que sloth.vancci.org la enseñe. Con la llave de publicar, siempre la última: de ella
 * sale el número de la siguiente (scripts/version-venta.mjs).
 */
async function ultimaPara(req: Request, env: Env, so: Sistema): Promise<Ultima & { nueva?: string }> {
  const u = await ultima(env, so)
  if (deTodos(u) || delCreador(req, env) || (await apoya(req, env))) return u
  const anterior = await anteriorDe(env, so)
  if (anterior) return { ...anterior, nueva: u.version }
  // Sin el instalador de la anterior, la última ya se le da a todos: sin `todos`, que diría que aún no.
  const { todos: _, ...deTodas } = u
  return deTodas
}

/** La versión de antes de `so`, la que se da a quien no apoya, si su instalador sigue en R2; si no, a todos la última. */
async function anteriorDe(env: Env, so: Sistema): Promise<Ultima | undefined> {
  const a = await (await env.DESCARGAS.get(`anterior/${ULTIMAS[so]}`))?.json<Ultima>()
  return a && (await env.DESCARGAS.head(a.archivo)) ? a : undefined
}

/**
 * Lo que pide electron-updater: `latest.yml`, que nunca se guarda en caché, y los instaladores y sus mapas por pedazos.
 * Mientras la última sea solo de quien apoya, a los demás se les da el `latest.yml` de la anterior, y los archivos de la
 * última no: con el número de `/ultima`, que es público, cualquiera armaría su nombre.
 */
async function actualizaciones(req: Request, env: Env, url: URL): Promise<Response> {
  const archivo = decodeURIComponent(url.pathname.slice('/actualizaciones/'.length))
  if (!publicable(archivo)) throw new Rechazo(404, 'No existe')
  const yml = AL_DIA.test(archivo)
  let llave = archivo
  const so = yml ? sistemaDelYml(archivo) : sistemaDelBinario(archivo)
  const u = so && (await (await env.DESCARGAS.get(ULTIMAS[so]))?.json<Ultima>())
  const deQuienApoya = !!u && !deTodos(u) && (yml || versionDe(archivo) === u.version)
  if (so && deQuienApoya && !delCreador(req, env) && !(await apoya(req, env)) && (await anteriorDe(env, so))) {
    if (!yml) throw new Rechazo(404, 'No existe')
    if (await env.DESCARGAS.head(`anterior/${archivo}`)) llave = `anterior/${archivo}`
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
  if (!conLlave(req, env)) throw new Rechazo(401, 'No autorizado.')
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
    const { partes, version, paraTodos, firmada, sinTicket, vozMensual } = (await cuerpo(req)) as { partes: R2UploadedPart[]; version: string; paraTodos?: boolean; firmada?: boolean; sinTicket?: boolean; vozMensual?: boolean }
    // Una versión nueva: la que había pasa a `anterior/` (su ultima.json y su latest.yml, que aún no se reemplaza: va al
    // final), salvo que aún fuera solo de quien apoya; entonces la anterior sigue siendo la de antes. Si esa ya no tiene
    // instalador, a quien no apoya se le estaba dando la que había: pasa a ser la anterior, o la nueva le llegaría ya.
    const so = instaladorDe(archivo)
    const previa = so ? await (await env.DESCARGAS.get(ULTIMAS[so]))?.json<Ultima>() : undefined
    // macOS solo pone encima una versión firmada por el mismo equipo de Apple: una sin firma dejaría a todos sin actualizar.
    if (previa?.firmada && !firmada) throw new Rechazo(409, `La última de ${NOMBRES[so!]} va firmada por Apple: una sin firma no se podría poner encima. Faltan los secretos de Apple en GitHub.`)
    if (so && previa && previa.version !== String(version) && (deTodos(previa) || !(await anteriorDe(env, so)))) {
      const yml = YML[so]
      const actual = await env.DESCARGAS.get(yml)
      // Sin `todos`: la anterior ya es de todos, aunque su fecha no hubiera llegado.
      const { todos: _, ...anterior } = previa
      await env.DESCARGAS.put(`anterior/${ULTIMAS[so]}`, JSON.stringify(anterior), { httpMetadata: { contentType: 'application/json' } })
      if (actual) await env.DESCARGAS.put(`anterior/${yml}`, await actual.arrayBuffer(), { httpMetadata: { contentType: 'text/yaml; charset=utf-8' } })
    }
    const obj = await subida.complete(partes)
    const tipo = BINARIO.exec(archivo)?.groups?.tipo
    if (tipo) {
      const iguales = (await env.DESCARGAS.list({ prefix: 'Sloth-' })).objects.filter((o) => BINARIO.exec(o.key)?.groups?.tipo === tipo)
      const anteriores = await Promise.all(Object.values(ULTIMAS).map(async (n) => (await (await env.DESCARGAS.get(`anterior/${n}`))?.json<Ultima>())?.version))
      const viejos = sobran(iguales, anteriores.filter((v) => v !== undefined))
      if (viejos.length) await env.DESCARGAS.delete(viejos)
    }
    if (!so) {
      // El actualizador se sube al final: la app ya está disponible para quienes recibirán los créditos.
      if (vozMensual && Object.values(YML).some((nombre) => nombre === archivo) && !(await env.DESCARGAS.head(APERTURA_VOZ)))
        await env.DESCARGAS.put(APERTURA_VOZ, JSON.stringify({ version, desde: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } })
      return json({ archivo, bytes: obj.size })
    }
    // La misma versión otra vez (se volvió a publicar) conserva cuándo salió; una nueva es de quien apoya `ANTICIPO`.
    const misma = previa?.version === String(version)
    const publicado = misma ? previa.publicado : new Date().toISOString()
    const todos = paraTodos ? undefined : misma ? previa.todos : new Date(Date.parse(publicado) + ANTICIPO).toISOString()
    const u: Ultima = { archivo, version: String(version), bytes: obj.size, publicado, ...(todos ? { todos } : {}), ...(firmada ? { firmada: true, ...(sinTicket ? { sinTicket: true } : {}) } : {}) }
    await env.DESCARGAS.put(ULTIMAS[so], JSON.stringify(u), { httpMetadata: { contentType: 'application/json' } })
    return json(u)
  }
  throw new Rechazo(404, 'No existe')
}

/**
 * El precio de hoy. Las suscripciones de prueba y las cuentas gratis no cuentan: solo las pagadas de verdad y los lugares
 * gratis de por vida. `quedan`: los lugares públicos de Fundador libres. Con un enlace de Fundador en pie (`codigo`),
 * `fundador`: la página ofrece ese apoyo. `apoyan`: quienes tienen pagado y sin vencer el precio de Fundador o más, cada
 * mes o una vez.
 */
async function precios(env: Env, codigo?: unknown) {
  const c = await env.DB.prepare(
    `SELECT COUNT(CASE WHEN ${esFundador('licencias')} THEN 1 END) AS fundadores,
            COUNT(CASE WHEN julianday(pagado_hasta) > julianday('now') AND ((moneda = ? AND monto >= ?) OR (moneda = 'MXN' AND monto >= ?)) THEN 1 END) AS apoyan
     FROM licencias WHERE plan IN ('mensual', 'anual', 'unico') AND modo = 'produccion'`
  )
    .bind(env.MONEDA, Number(env.PRECIO_MENSUAL), Number(env.PRECIO_MENSUAL_MXN))
    .first<Cuenta>()
  // Mercado Pago solo se ofrece con su token del modo de hoy.
  const conMp = !!(env.MP_MODO === 'produccion' ? env.MP_ACCESS_TOKEN_PRODUCCION : env.MP_ACCESS_TOKEN)
  // Cripto, con la llave y la clave de los avisos de NOWPayments; cobra los mismos precios, en `MONEDA`, pero el monto
  // elegido va desde `APOYO_MINIMO_CRIPTO`.
  const conCripto = !!(env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET)
  const t = tarifa(c ?? { fundadores: 0, apoyan: 0 }, env, conMp)
  const cripto: Precios = { mensual: t.mensual, anual: t.anual, minimo: Number(env.APOYO_MINIMO_CRIPTO), grande: t.grande, maximo: t.maximo, moneda: t.moneda }
  const fundador = codigo !== undefined && (await enlaceFundador(env, codigo))
  // La tarjeta, con Stripe y la clave de sus avisos, a los mismos precios en `MONEDA`.
  const conTarjeta = !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET)
  return {
    ...t,
    ...(conCripto ? { cripto } : {}),
    ...(conTarjeta ? { tarjeta: true } : {}),
    ...(env.SIN_PAYPAL === '1' ? { sinPaypal: true } : {}),
    ...(fundador ? { fundador: true } : {})
  }
}

/**
 * El precio sugerido, el mismo para todos, y desde cuánto se apoya con el monto que elija cada quien (`minimo`) o es un
 * apoyo grande (`grande`), en `MONEDA` (con PayPal) y, con `conMp`, en pesos (`mxn`, con Mercado Pago). `quedan`: los
 * lugares de fundador que quedan; `apoyan`, para las metas del roadmap.
 */
export function tarifa(c: Cuenta, env: Tarifas, conMp = false, ahora = Date.now()) {
  const abierto = !env.FUNDADORES_HASTA || ahora < Date.parse(env.FUNDADORES_HASTA)
  const mxn: Precios = {
    mensual: Number(env.PRECIO_MENSUAL_MXN),
    anual: Number(env.PRECIO_ANUAL_MXN),
    minimo: Number(env.APOYO_MINIMO_MXN),
    grande: Number(env.APOYO_GRANDE_MXN),
    maximo: APOYO_MAXIMO.MXN,
    moneda: 'MXN'
  }
  return {
    quedan: abierto ? Math.max(0, Number(env.FUNDADORES) - c.fundadores) : 0,
    mensual: Number(env.PRECIO_MENSUAL),
    anual: Number(env.PRECIO_ANUAL),
    minimo: Number(env.APOYO_MINIMO),
    grande: Number(env.APOYO_GRANDE),
    maximo: APOYO_MAXIMO[env.MONEDA] ?? APOYO_MAXIMO.USD,
    moneda: env.MONEDA,
    ...(conMp && mxn.mensual ? { mxn } : {}),
    apoyan: c.apoyan
  }
}

/**
 * Cuánto se cobra: el anual, su precio; el mensual, el sugerido si no se elige otro; el de una vez, el que se elija.
 * El elegido va en enteros de su moneda, de `minimo` a `maximo`: cada monto mensual de PayPal es un plan.
 */
export function montoDe(plan: 'mensual' | 'anual' | 'unico', elegido: unknown, p: Pick<Precios, 'mensual' | 'anual' | 'minimo' | 'maximo' | 'moneda'>): number {
  if (plan === 'anual') return p.anual
  if (elegido === undefined && plan === 'mensual') return p.mensual
  const monto = Number(elegido)
  if (!Number.isInteger(monto) || monto < p.minimo || monto > p.maximo)
    throw new Rechazo(400, `Elige un monto entero de $${p.minimo.toLocaleString('es-MX')} a $${p.maximo.toLocaleString('es-MX')} ${p.moneda}.`)
  return monto
}

/**
 * Crea la suscripción mensual en PayPal, o la orden del año, pendiente de pago, y da el enlace donde el cliente paga, nada
 * más: la clave de un apoyo solo llega al correo, al confirmarse el pago. Cualquiera puede escribir el correo de otro, y
 * la comunidad junta las claves de un mismo correo: verla aquí o en `/gracias` sería entrar como esa persona. La app de
 * antes (con su `equipo`) esperaba la clave aquí: se le dice que apoye desde la página. Con `plan` `gratis`, una cuenta
 * gratis (solo desde la app), que también va por correo.
 */
async function suscribir(env: Env, c: Record<string, unknown>, desde: string): Promise<Response> {
  const email = String(c.email ?? '').trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 254) throw new Rechazo(400, 'Escribe un correo válido.')
  const plan: Plan = c.plan === 'gratis' ? 'gratis' : c.plan === 'anual' ? 'anual' : c.plan === 'unico' ? 'unico' : 'mensual'
  if (plan !== 'gratis' && c.equipo !== undefined)
    throw new Rechazo(409, 'Para apoyar, entra a sloth.vancci.org: tu clave te llega por correo al confirmarse el pago. Luego escríbela en Opciones de Sloth, en «Ya apoyo».')
  const equipo = plan === 'gratis' ? equipoDe(c) : undefined
  // Con Mercado Pago, en pesos; con PayPal o con cripto, en `MONEDA`. La app de antes no manda `pasarela`: PayPal.
  const pasa: Pasarela = c.pasarela === 'mercadopago' || c.pasarela === 'tarjeta' || c.pasarela === 'cripto' ? c.pasarela : 'paypal'
  // El consentimiento expreso de los términos y, si se paga cada mes, del cobro automático (LFPC art. 76 Bis VIII), con
  // la versión aceptada. Con cripto no hay cobro automático: cada mes es un pago.
  const terminos = String(c.terminos ?? '')
  if (c.acepto !== true || !TERMINOS.test(terminos))
    throw new Rechazo(
      400,
      plan === 'gratis' ? 'Para unirte, acepta los términos.' : plan === 'mensual' && pasa !== 'cripto' ? 'Para suscribirte, acepta el cobro automático y los términos.' : 'Para apoyar, acepta el pago y los términos.'
    )
  const acepto = new Date().toISOString()
  if (plan === 'gratis') return unirse(env, email, equipo!, acepto, terminos, desde, c.porCorreo === true)
  const t = await precios(env, c.fundador)
  if (pasa === 'paypal' && t.sinPaypal) throw new Rechazo(400, 'Por ahora no se puede pagar con PayPal: elige tarjeta, Mercado Pago o cripto.')
  if ((pasa === 'mercadopago' && !t.mxn) || (pasa === 'tarjeta' && !t.tarjeta) || (pasa === 'cripto' && !t.cripto)) throw new Rechazo(400, 'Por ahora no se puede pagar así: elige otra forma de pago.')
  // La página de la tarjeta de Mercado Pago (`/pagar`, hasta el 6 de noviembre de 2026) mandaba el monto en pesos y su
  // token: abierta desde antes, cobraría esos pesos como dólares.
  if (pasa === 'tarjeta' && c.tarjeta !== undefined) throw new Rechazo(400, 'La página de pago cambió: vuelve a sloth.vancci.org, elige tu apoyo y «Tarjeta» otra vez.')
  // En pesos con Mercado Pago; con cripto, su propio mínimo; con PayPal o tarjeta, los de `MONEDA`.
  const p: Precios = pasa === 'mercadopago' ? t.mxn! : pasa === 'cripto' ? t.cripto! : t
  const monto = montoDe(plan, c.monto, p)
  // Con una ya pagada, otra cobraría dos veces; con un lugar gratis de por vida, no hace falta. Con una cuenta, sí se apoya.
  await sinOtra(env, email, true)
  // Un doble clic, o volver a abrir el pago: la misma suscripción pendiente de la última hora, si sigue en el monto, la
  // moneda y la pasarela de hoy.
  const columnas = { mercadopago: '(preapproval IS NOT NULL OR preferencia IS NOT NULL)', paypal: '(paypal IS NOT NULL OR orden IS NOT NULL)', cripto: 'cripto IS NOT NULL', tarjeta: 'stripe IS NOT NULL' }
  const previa = await env.DB.prepare(
    `SELECT * FROM licencias WHERE email = ? AND plan = ? AND monto = ? AND moneda = ? AND estado = 'pending' AND enlace IS NOT NULL AND ${columnas[pasa]} AND coalesce(enlace_fundador, '') = ? AND creada > ? ORDER BY creada DESC LIMIT 1`
  )
    .bind(email, plan, monto, p.moneda, t.fundador ? String(c.fundador) : '', new Date(Date.now() - 3600_000).toISOString())
    .first<Fila>()
  if (previa) {
    await env.DB.prepare('UPDATE licencias SET acepto = ?, terminos = ? WHERE id = ?').bind(acepto, terminos, previa.id).run()
    return json({ enlace: previa.enlace })
  }
  // Cada intento abre un pago en la pasarela y una fila: pocos al día por conexión, que nadie llene D1 ni alarme a la pasarela.
  if (!(await cupo(env, desde, 'pago', PAGOS_AL_DIA))) throw new Rechazo(429, 'Desde esta conexión ya se abrieron muchos pagos hoy. Prueba mañana, o escríbenos.')

  // Fundador, cada mes o una vez, con el precio de Fundador de su moneda o más: con un enlace de Fundador que nadie ha
  // usado (aunque no queden lugares; el enlace queda usado con su pago), o en uno de los lugares públicos libres.
  const conEnlace = !!t.fundador && plan !== 'anual' && monto >= p.mensual
  const deFundador = conEnlace || (t.quedan > 0 && plan !== 'anual' && monto >= p.mensual)
  const fila: Fila = {
    id: crypto.randomUUID(),
    clave: nuevaClave(),
    email,
    plan,
    monto,
    moneda: p.moneda,
    fundador: deFundador ? 1 : 0,
    enlace_fundador: conEnlace ? String(c.fundador) : null,
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
    modo: { mercadopago: env.MP_MODO, tarjeta: modoStripe(env), paypal: env.PAYPAL_MODO, cripto: env.NOWPAYMENTS_MODO }[pasa],
    preferencia: null,
    paypal: null,
    orden: null,
    cripto: null,
    stripe: null
  }
  await env.DB.prepare('INSERT INTO licencias (id, clave, email, plan, monto, moneda, fundador, enlace_fundador, estado, creada, acepto, terminos, modo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(fila.id, fila.clave, email, plan, fila.monto, fila.moneda, fila.fundador, fila.enlace_fundador, fila.estado, fila.creada, acepto, terminos, fila.modo)
    .run()
  // Dónde se paga y en qué columna queda: la suscripción mensual, o el pago del año o del apoyo de una vez.
  let abierto: { columna: 'orden' | 'paypal' | 'preapproval' | 'preferencia' | 'cripto' | 'stripe'; id: string; enlace: string }
  try {
    if (pasa === 'cripto') abierto = { columna: 'cripto', ...(await facturaCripto(env, fila)) }
    else if (pasa === 'tarjeta') abierto = { columna: 'stripe', ...(await pagoStripe(env, fila)) }
    else if (pasa === 'mercadopago')
      abierto = plan === 'mensual' ? { columna: 'preapproval', ...(await suscripcionMp(env, fila)) } : { columna: 'preferencia', ...(await preferenciaMp(env, fila)) }
    else abierto = plan === 'mensual' ? { columna: 'paypal', ...(await suscripcionPaypal(env, fila)) } : { columna: 'orden', ...(await ordenPaypal(env, fila)) }
  } catch (error) {
    await env.DB.prepare('DELETE FROM licencias WHERE id = ?').bind(fila.id).run()
    await env.DB.prepare('DELETE FROM stripe_pagos WHERE licencia = ?').bind(fila.id).run()
    const quien = { mercadopago: 'Mercado Pago', tarjeta: 'Stripe', paypal: 'PayPal', cripto: 'NOWPayments' }[pasa]
    // La suscripción de Mercado Pago rechaza (400) ciertos correos: se dice por qué y qué hacer.
    if (error instanceof Rechazo && pasa === 'mercadopago' && plan === 'mensual' && error.status === 400) throw new Rechazo(400, mensualRechazado(error.message))
    throw error instanceof Rechazo ? new Rechazo(502, `${quien} no pudo abrir el pago. Revisa tu correo e intenta otra vez.`) : error
  }
  await env.DB.prepare(`UPDATE licencias SET ${abierto.columna} = ?, enlace = ?, revisada = ? WHERE id = ?`).bind(abierto.id, abierto.enlace, new Date().toISOString(), fila.id).run()
  return json({ enlace: abierto.enlace })
}

/** La página de PayPal en español, sin dirección de envío, y de vuelta a `/gracias` al pagar o al salir. */
function experiencia(env: Env, f: Fila, accion: 'PAY_NOW' | 'SUBSCRIBE_NOW') {
  const vuelta = `${env.ORIGEN}/gracias?s=${f.id}`
  return { brand_name: 'Sloth', locale: 'es-MX', shipping_preference: 'NO_SHIPPING', user_action: accion, return_url: vuelta, cancel_url: vuelta }
}

/** El enlace `rel` de lo que dio PayPal. */
function enlacePaypal(links: { rel: string; href: string }[] | undefined, rel: string): string {
  const href = links?.find((l) => l.rel === rel)?.href
  if (!href) throw new Rechazo(502, `PayPal no dio el enlace ${rel}`)
  return href
}

/** La suscripción mensual en PayPal, al plan de su monto. Lleva la fila en `custom_id`. */
async function suscripcionPaypal(env: Env, f: Fila): Promise<{ id: string; enlace: string }> {
  const s = await paypal<SuscripcionPaypal>(env, 'POST', '/v1/billing/subscriptions', {
    plan_id: await planPaypal(env, f.monto, f.moneda),
    custom_id: f.id,
    subscriber: { email_address: f.email },
    application_context: experiencia(env, f, 'SUBSCRIBE_NOW')
  })
  return { id: s.id, enlace: enlacePaypal(s.links, 'approve') }
}

/** Un año, o un apoyo de una vez: una orden de PayPal con la fila en `custom_id`, que se cobra cuando el cliente la aprueba. */
async function ordenPaypal(env: Env, f: Fila): Promise<{ id: string; enlace: string }> {
  const description = f.plan === 'unico' ? 'Sloth - apoyo de una vez' : 'Sloth - plan anual'
  const o = await paypal<OrdenPaypal>(env, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ custom_id: f.id, description, soft_descriptor: 'SLOTH', amount: { currency_code: f.moneda, value: f.monto.toFixed(2) } }],
    payment_source: { paypal: { experience_context: experiencia(env, f, 'PAY_NOW') } }
  })
  return { id: o.id, enlace: enlacePaypal(o.links, 'payer-action') }
}

/** La suscripción mensual en Mercado Pago, de su monto en pesos (con tarjeta). Lleva la fila en `external_reference`. */
async function suscripcionMp(env: Env, f: Fila): Promise<{ id: string; enlace: string }> {
  const p = await mp<Preapproval>(env, 'POST', '/preapproval', {
    // Sin acentos ni «·»: con ellos, Mercado Pago contesta «Parameters passed are invalid».
    reason: 'Sloth - plan mensual',
    external_reference: f.id,
    payer_email: f.email,
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: f.monto, currency_id: f.moneda },
    back_url: `${env.ORIGEN}/gracias?s=${f.id}`,
    status: 'pending'
  })
  if (!p.init_point) throw new Rechazo(502, 'Mercado Pago no dio el enlace de pago')
  return { id: p.id, enlace: p.init_point }
}

/**
 * Por qué Mercado Pago no abrió el cobro de cada mes (`/preapproval`, 400), dicho al cliente. El más común: el correo es
 * de una cuenta de Mercado Pago o Mercado Libre de otro país («Payer is associated with a different site»), y Mercado
 * Pago México no le cobra cada mes. Con tarjeta (Stripe), sí.
 */
export function mensualRechazado(mensaje: string): string {
  if (/different site/i.test(mensaje)) return 'Ese correo es de una cuenta de Mercado Pago de otro país, y Mercado Pago México no le cobra cada mes. Elige «Tarjeta», que acepta tarjetas de cualquier país, o apoya una sola vez.'
  if (/payer|email/i.test(mensaje)) return 'Mercado Pago no aceptó ese correo para el cobro de cada mes. Elige «Tarjeta», o apoya una sola vez.'
  return 'Mercado Pago no pudo abrir el cobro de cada mes. Elige «Tarjeta», o apoya una sola vez.'
}

/**
 * El pago con tarjeta en Stripe Checkout: la sesión y adónde va el cliente. El año y el apoyo de una vez quedan además
 * en `stripe_pagos`, por cobrar, para contarse cuando se paguen.
 */
async function pagoStripe(env: Env, f: Fila): Promise<{ id: string; enlace: string }> {
  const s = await sesionStripe(env, f)
  if (!s.url) throw new Rechazo(502, 'Stripe no dio el enlace de pago')
  if (f.plan !== 'mensual') await guardarPagoStripe(env, f, pagoDeSesion(s))
  return { id: s.id, enlace: s.url }
}

/**
 * Un año, o un apoyo de una vez, en Checkout Pro de Mercado Pago: con todos sus medios (tarjeta, OXXO, SPEI, meses sin
 * intereses en el año). Sus pagos se buscan por la fila (`external_reference`).
 */
async function preferenciaMp(env: Env, f: Fila): Promise<{ id: string; enlace: string }> {
  const vuelta = `${env.ORIGEN}/gracias?s=${f.id}`
  const unico = f.plan === 'unico'
  const p = await mp<{ id: string; init_point: string }>(env, 'POST', '/checkout/preferences', {
    items: [{ id: unico ? 'sloth-una-vez' : 'sloth-anual', title: unico ? 'Sloth - apoyo de una vez' : 'Sloth - plan anual', quantity: 1, unit_price: f.monto, currency_id: f.moneda }],
    payer: { email: f.email },
    external_reference: f.id,
    back_urls: { success: vuelta, pending: vuelta, failure: vuelta },
    auto_return: 'approved',
    // El año, hasta 12 meses; sin intereses, los que se ofrezcan en «Comisiones y MSI» del panel de Mercado Pago.
    payment_methods: { installments: unico ? 1 : 12 },
    statement_descriptor: 'SLOTH'
  })
  return { id: p.id, enlace: p.init_point }
}

/**
 * Un mes, un año o un apoyo de una vez, con cripto: una factura de NOWPayments en `MONEDA`, donde el cliente elige con
 * qué moneda paga. Lleva la fila en `order_id`, y sus pagos avisan a `/webhook/cripto`.
 */
async function facturaCripto(env: Env, f: Fila): Promise<{ id: string; enlace: string }> {
  const vuelta = `${env.ORIGEN}/gracias?s=${f.id}`
  const i = await nowpayments<{ id: number | string; invoice_url?: string }>(env, 'POST', '/v1/invoice', {
    price_amount: f.monto,
    price_currency: f.moneda.toLowerCase(),
    order_id: f.id,
    order_description: { mensual: 'Sloth - un mes de apoyo', anual: 'Sloth - plan anual', unico: 'Sloth - apoyo de una vez' }[f.plan as 'mensual' | 'anual' | 'unico'],
    ipn_callback_url: `${env.ORIGEN}/webhook/cripto`,
    success_url: vuelta,
    cancel_url: vuelta
  })
  if (!i.invoice_url) throw new Rechazo(502, 'NOWPayments no dio el enlace de pago')
  return { id: String(i.id), enlace: i.invoice_url }
}

/** El plan mensual de PayPal de `monto` en `moneda`, que se crea la primera vez (y el producto «Sloth», también una vez). */
async function planPaypal(env: Env, monto: number, moneda: string): Promise<string> {
  const llave = `${env.PAYPAL_MODO}:mensual:${moneda}:${monto}`
  const plan = await idPaypal(env, llave)
  if (plan) return plan
  const deProducto = `${env.PAYPAL_MODO}:producto`
  const producto =
    (await idPaypal(env, deProducto)) ??
    (await guardarIdPaypal(env, deProducto, (await paypal<{ id: string }>(env, 'POST', '/v1/catalogs/products', { name: 'Sloth', type: 'SERVICE', category: 'SOFTWARE' })).id))
  const nuevo = await paypal<{ id: string }>(env, 'POST', '/v1/billing/plans', {
    product_id: producto,
    name: 'Sloth - plan mensual',
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: monto.toFixed(2), currency_code: moneda } }
      }
    ],
    // Un cobro que falla se reintenta; tras tres, PayPal la suspende (`paused`) y vale hasta lo pagado.
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 }
  })
  return guardarIdPaypal(env, llave, nuevo.id)
}

async function idPaypal(env: Env, llave: string): Promise<string | undefined> {
  return (await env.DB.prepare('SELECT id FROM paypal_ids WHERE llave = ?').bind(llave).first<{ id: string }>())?.id
}

/** Guarda el id, o se queda con el que otra petición guardó antes. */
async function guardarIdPaypal(env: Env, llave: string, id: string): Promise<string> {
  await env.DB.prepare('INSERT OR IGNORE INTO paypal_ids (llave, id) VALUES (?, ?)').bind(llave, id).run()
  return (await idPaypal(env, llave)) ?? id
}

/**
 * Abre el pago del año siguiente de un año pagado de una vez (o de otro mes, el de una vez), con la misma pasarela: la
 * misma fila y la misma clave. Uno de Mercado Pago que ya se renovó con PayPal sigue con PayPal. Antes guarda lo
 * cobrado de la orden que deja de ser la última. Da adónde ir a pagar.
 */
async function renovar(env: Env, f: Fila): Promise<string> {
  // Con tarjeta, otra sesión de Stripe.
  if (f.stripe) {
    const s = await pagoStripe(env, f)
    await env.DB.prepare('UPDATE licencias SET stripe = ?, enlace = ? WHERE id = ?').bind(s.id, s.enlace, f.id).run()
    return s.enlace
  }
  // Con cripto, otra factura: el siguiente mes o año.
  if (f.cripto) {
    const i = await facturaCripto(env, f)
    await env.DB.prepare('UPDATE licencias SET cripto = ?, enlace = ? WHERE id = ?').bind(i.id, i.enlace, f.id).run()
    return i.enlace
  }
  // Pagado con Mercado Pago, y nunca renovado con PayPal: otra vez con Mercado Pago, en pesos.
  if (f.preferencia && !f.orden) {
    const p = await preferenciaMp(env, f)
    await env.DB.prepare('UPDATE licencias SET preferencia = ?, enlace = ? WHERE id = ?').bind(p.id, p.enlace, f.id).run()
    return p.enlace
  }
  if (f.orden) await cobrarOrden(env, f, f.orden)
  const o = await ordenPaypal(env, f)
  await env.DB.prepare('UPDATE licencias SET orden = ?, enlace = ? WHERE id = ?').bind(o.id, o.enlace, f.id).run()
  return o.enlace
}

/**
 * Una cuenta gratis, para la comunidad, activa desde ya. Su clave solo va al correo: así cada cuenta es de un correo
 * de verdad, y quien escribe uno ajeno no entra. Pedirla otra vez la vuelve a mandar, pocas veces al día. La misma
 * computadora con el mismo correo (reinstaló Sloth) recupera la suya, y también un lugar gratis de por vida que ya
 * tuviera: el `equipo` solo no basta, porque cualquier programa de esa computadora lo lee. `desde` (su conexión) pide
 * pocas al día. La app de antes no manda `porCorreo` y espera la clave: se le dice dónde escribirla.
 */
async function unirse(env: Env, email: string, equipo: string, acepto: string, terminos: string, desde: string, porCorreo: boolean): Promise<Response> {
  const suya = await env.DB.prepare("SELECT l.clave FROM licencias l JOIN equipos e ON e.clave = l.clave WHERE e.equipo = ? AND l.email = ? AND l.estado = 'gratis' LIMIT 1")
    .bind(equipo, email)
    .first<{ clave: string }>()
  if (suya) return json({ clave: suya.clave })
  if (await env.DB.prepare("SELECT 1 FROM licencias WHERE email = ? AND estado = 'vetada'").bind(email).first()) {
    await vigilar(env, email, 'pidió otra cuenta con su correo bloqueado', true)
    throw new Rechazo(403, BLOQUEADA)
  }
  if (!(await cupo(env, desde, 'cuenta', CUENTAS_AL_DIA))) throw new Rechazo(429, 'Desde esta conexión ya se pidieron muchas cuentas hoy. Prueba mañana.')
  if (!(await cupo(env, await resumen(`correo:${email}`), 'correo', CORREOS_AL_DIA)))
    throw new Rechazo(429, `Ya te mandamos tu clave a ${email} varias veces hoy. Búscala en ese correo (también en spam o promociones).`)
  let clave = (await env.DB.prepare("SELECT clave FROM licencias WHERE email = ? AND plan = 'cuenta' AND estado = 'gratis' LIMIT 1").bind(email).first<{ clave: string }>())?.clave
  if (!clave) {
    await sinOtra(env, email, false)
    clave = nuevaClave()
    await env.DB.prepare(
      `INSERT INTO licencias (id, clave, email, plan, monto, fundador, estado, autorizada, creada, acepto, terminos, modo)
       VALUES (?, ?, ?, 'cuenta', 0, 0, 'gratis', ?, ?, ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), clave, email, acepto, acepto, acepto, terminos, env.PAYPAL_MODO)
      .run()
  }
  const enviada = await correo(env, email, 'Tu cuenta de Sloth', [
    'Hola:',
    'Ya tienes tu cuenta de Sloth: con ella entras a la comunidad. Sloth es gratis y lo seguirá siendo.',
    `Tu clave es ${clave}. Escríbela en Sloth para entrar, y guárdala: con ella entras desde otra computadora (dos a la vez). También queda en Opciones de Sloth.`,
    'Sloth trabaja con la IA que ya tengas: Claude, ChatGPT, OpenCode (que tiene modelos gratis) y otros agentes. Con uno basta, y Sloth no te cobra aparte: lo conectas en Opciones, en Agentes. Si tienes dudas, responde a este correo.'
  ]).catch((e) => (console.error('Correo de la cuenta', e instanceof Error ? e.message : e), false))
  if (!enviada) throw new Rechazo(502, 'No pudimos mandarte el correo con tu clave. Prueba en un rato.')
  if (!porCorreo) throw new Rechazo(409, `Te mandamos tu clave a ${email}. Escríbela en Opciones de Sloth, en «Ya apoyo».`)
  return json({ enviada: true })
}

/**
 * Un correo con un apoyo activo (también un año pagado que no se acaba) o con un lugar gratis de por vida no se
 * suscribe ni se une otra vez. Con una cuenta gratis, sí apoya (`apoyar`), pero no abre otra cuenta.
 */
async function sinOtra(env: Env, email: string, apoyar: boolean) {
  const { results } = await env.DB.prepare(
    "SELECT plan, estado FROM licencias WHERE email = ? AND (estado IN ('authorized', 'gratis') OR (estado = 'pagado' AND julianday(pagado_hasta) > julianday('now')))"
  )
    .bind(email)
    .all<Pick<Fila, 'plan' | 'estado'>>()
  if (results.some((f) => f.plan === 'gratis'))
    throw new Rechazo(409, 'Ese correo ya tiene Sloth gratis de por vida. Usa su clave: está en Opciones de Sloth, en la computadora donde te uniste.')
  if (results.some((f) => f.estado === 'authorized' || f.estado === 'pagado'))
    throw new Rechazo(409, 'Ya hay un apoyo activo con ese correo. Usa su clave: te la mandamos por correo y está en Opciones de Sloth.')
  if (!apoyar && results.length) throw new Rechazo(409, 'Ese correo ya tiene una cuenta de Sloth. Su clave te llegó por correo, en «Tu cuenta de Sloth».')
}

/** Si la clave sigue activa en esta computadora, firmado. Lee la suscripción o los pagos de PayPal (o de Mercado Pago) si hace rato que no. */
async function licencia(env: Env, c: Record<string, unknown>): Promise<Response> {
  const equipo = equipoDe(c)
  let fila = await porClave(env, c.clave)
  const ahora = Date.now()
  const revisada = fila.revisada ? Date.parse(fila.revisada) : 0
  // Si PayPal o Mercado Pago no contestan, vale lo último que dijeron.
  if ((fila.paypal || fila.preapproval || fila.stripe || deUnaVez(fila)) && ahora - revisada > (fila.estado === 'pending' ? REVISAR_PENDIENTE : REVISAR))
    fila = await refrescar(env, fila).catch(() => fila)
  if (!(await recordarEquipo(env, fila.clave, equipo, ahora)))
    throw new Rechazo(409, `Esta clave ya se usa en ${EQUIPOS} computadoras. Si cambiaste de computadora, escríbenos y la liberamos.`)
  return firmada(env, fila, equipo, ahora)
}

/** Cancela la suscripción en PayPal, Mercado Pago o Stripe. Lo ya pagado sigue valiendo hasta su fecha. */
async function cancelar(env: Env, c: Record<string, unknown>): Promise<Response> {
  const equipo = equipoDe(c)
  let fila = await porClave(env, c.clave)
  if (fila.stripe?.startsWith('sub_') && fila.estado !== 'cancelled') {
    // Ya cancelada del todo, Stripe contesta 400 o 404: basta con volver a leerla.
    await cancelarStripe(env, fila.stripe).catch((e) => {
      if (!(e instanceof Rechazo) || (e.status !== 400 && e.status !== 404)) throw e
    })
    fila = await refrescar(env, fila)
    if (fila.estado !== 'cancelled') throw new Rechazo(502, 'Stripe no pudo cancelar la suscripción. Intenta otra vez en un momento.')
  } else if ((fila.paypal || fila.preapproval) && fila.estado !== 'cancelled') {
    // Un 422 de PayPal o un 400 de Mercado Pago es casi siempre que ya estaba cancelada (desde la cuenta del cliente, o
    // tras cobros rechazados): basta con volver a leerla.
    const yaEstaba = (e: unknown) => {
      if (!(e instanceof Rechazo) || e.status !== (fila.paypal ? 422 : 400)) throw e
    }
    if (fila.paypal) await paypal(env, 'POST', `/v1/billing/subscriptions/${encodeURIComponent(fila.paypal)}/cancel`, { reason: 'Cancelada desde Sloth' }).catch(yaEstaba)
    else await mp(env, 'PUT', `/preapproval/${encodeURIComponent(fila.preapproval!)}`, { status: 'cancelled' }).catch(yaEstaba)
    fila = await refrescar(env, fila)
    if (fila.estado !== 'cancelled') throw new Rechazo(502, `${pasarela(fila)} no pudo cancelar la suscripción. Intenta otra vez en un momento.`)
  }
  // El comprobante de la cancelación (Profeco pide dar un folio), una sola vez.
  if (fila.estado === 'cancelled' && !fila.folio) {
    fila = { ...fila, folio: `C-${letras(8)}`, cancelada: new Date().toISOString() }
    await env.DB.prepare('UPDATE licencias SET folio = ?, cancelada = ? WHERE id = ?').bind(fila.folio, fila.cancelada, fila.id).run()
    const hasta = fila.pagado_hasta && Date.parse(fila.pagado_hasta) > Date.now() ? ` Sloth sigue abierta hasta el ${fecha(fila.pagado_hasta)}, lo que ya pagaste.` : ''
    await correo(env, fila.email, `Cancelaste tu suscripción a Sloth · folio ${fila.folio}`, [
      'Hola:',
      `Cancelamos tu suscripción a Sloth. Tu folio de cancelación es ${fila.folio}. ${pasarela(fila)} ya no te hará más cobros.${hasta}`,
      'Si no fuiste tú, responde a este correo.'
    ]).catch((e) => console.error('Correo de cancelación', e instanceof Error ? e.message : e))
  }
  return firmada(env, fila, equipo, Date.now())
}

/**
 * Adónde se va a pagar desde Sloth: con un año pagado de una vez, el pago del año siguiente (con el de una vez, otro
 * mes). La tarjeta de la suscripción mensual se cambia en la cuenta de PayPal (o de Mercado Pago) del cliente.
 */
async function pago(env: Env, c: Record<string, unknown>): Promise<Response> {
  const equipo = equipoDe(c)
  const fila = await porClave(env, c.clave)
  if (!deUnaVez(fila) || fila.estado !== 'pagado')
    throw new Rechazo(
      400,
      fila.stripe
        ? 'Esta suscripción se paga con tarjeta, en Stripe: si un cobro no pasa, Stripe te manda un correo con el enlace para poner otra.'
        : `Esta suscripción se paga con ${pasarela(fila)}: cambia tu tarjeta desde tu cuenta de ${pasarela(fila)}.`
    )
  if (!(await recordarEquipo(env, fila.clave, equipo, Date.now())))
    throw new Rechazo(409, `Esta clave ya se usa en ${EQUIPOS} computadoras. Si cambiaste de computadora, escríbenos y la liberamos.`)
  return json({ enlace: await renovar(env, fila) })
}

/**
 * Un aviso de Mercado Pago. Se comprueba su firma, se contesta enseguida y luego se lee la suscripción de su API: el
 * cuerpo solo dice cuál cambió. Los cobros de cada mes llegan como `subscription_authorized_payment`, y los del año
 * pagado de una vez, como `payment`.
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
  if (tipo === 'payment') {
    const p = await mp<PagoMp>(env, 'GET', `/v1/payments/${encodeURIComponent(id)}`)
    const fila = p.external_reference ? await env.DB.prepare('SELECT * FROM licencias WHERE id = ?').bind(p.external_reference).first<Fila>() : null
    // Los cobros de las suscripciones también avisan aquí: esos los cuenta su suscripción.
    if (fila?.preferencia) await refrescar(env, fila, { mp: p })
    return
  }
  let preapproval: string | undefined
  if (tipo === 'subscription_preapproval') preapproval = id
  if (tipo === 'subscription_authorized_payment') preapproval = (await mp<{ preapproval_id?: string }>(env, 'GET', `/authorized_payments/${encodeURIComponent(id)}`)).preapproval_id
  if (!preapproval) return
  const fila = await env.DB.prepare('SELECT * FROM licencias WHERE preapproval = ?').bind(preapproval).first<Fila>()
  if (fila) await refrescar(env, fila)
}

/**
 * Un aviso de PayPal. Se comprueba con PayPal que es suyo, se contesta enseguida y luego se lee de su API lo que cambió:
 * la suscripción (sus cambios, y sus cobros con `billing_agreement_id`) o la orden del año (aprobada, que falta cobrar,
 * o su cobro, que trae la orden; uno sin ella, como un reembolso, vuelve a leer todas las de su fila).
 */
async function webhookPaypal(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const texto = await req.text()
  if (!(await firmaDePaypal(req.headers, texto, env).catch(() => false))) return new Response('Firma inválida', { status: 401 })
  const a = JSON.parse(texto) as AvisoPaypal
  ctx.waitUntil(avisoPaypal(env, a).catch((e) => console.error('Aviso de PayPal', a.event_type, e instanceof Error ? e.message : e)))
  return new Response('ok')
}

async function avisoPaypal(env: Env, a: AvisoPaypal) {
  const tipo = a.event_type ?? ''
  const r = a.resource ?? {}
  const suscripcion = tipo.startsWith('BILLING.SUBSCRIPTION.') ? r.id : r.billing_agreement_id
  if (suscripcion) {
    const fila = await env.DB.prepare('SELECT * FROM licencias WHERE paypal = ?').bind(suscripcion).first<Fila>()
    if (fila) await refrescar(env, fila)
    return
  }
  const referencia = r.custom_id ?? r.purchase_units?.[0]?.custom_id
  const fila = referencia ? await env.DB.prepare('SELECT * FROM licencias WHERE id = ?').bind(referencia).first<Fila>() : null
  if (!fila || !deUnaVez(fila)) return
  const orden = tipo.startsWith('CHECKOUT.ORDER.') ? r.id : r.supplementary_data?.related_ids?.order_id
  const ordenes = orden ? [orden] : (await env.DB.prepare('SELECT orden FROM paypal_pagos WHERE licencia = ?').bind(fila.id).all<{ orden: string }>()).results.map((p) => p.orden)
  await refrescar(env, fila, { ordenes })
}

/**
 * La firma de un aviso de PayPal la comprueba PayPal mismo, con el id del webhook. El aviso va tal cual llegó: vuelto a
 * escribir, cambiaría y no pasaría.
 */
async function firmaDePaypal(h: Headers, texto: string, env: Env): Promise<boolean> {
  if (!env.PAYPAL_WEBHOOK_ID) return false
  const datos = {
    auth_algo: h.get('paypal-auth-algo'),
    cert_url: h.get('paypal-cert-url'),
    transmission_id: h.get('paypal-transmission-id'),
    transmission_sig: h.get('paypal-transmission-sig'),
    transmission_time: h.get('paypal-transmission-time'),
    webhook_id: env.PAYPAL_WEBHOOK_ID
  }
  if (Object.values(datos).some((v) => !v)) return false
  const cuerpo = `${JSON.stringify(datos).slice(0, -1)},"webhook_event":${texto}}`
  return (await paypal<{ verification_status?: string }>(env, 'POST', '/v1/notifications/verify-webhook-signature', cuerpo)).verification_status === 'SUCCESS'
}

/**
 * Un aviso de NOWPayments: llega con cada cambio de un pago. Se comprueba su firma, se contesta enseguida y luego se
 * lee el pago de su API, que dice de qué fila es (`order_id`).
 */
async function webhookCripto(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const a = (await req.json().catch(() => null)) as { payment_id?: number | string } | null
  if (!a || !(await firmaDeNowpayments(a, req.headers.get('x-nowpayments-sig'), env.NOWPAYMENTS_IPN_SECRET))) return new Response('Firma inválida', { status: 401 })
  const id = String(a.payment_id ?? '')
  if (/^\d+$/.test(id)) ctx.waitUntil(avisoCripto(env, id).catch((e) => console.error('Aviso de NOWPayments', e instanceof Error ? e.message : e)))
  return new Response('ok')
}

async function avisoCripto(env: Env, id: string) {
  const p = await nowpayments<PagoCripto>(env, 'GET', `/v1/payment/${id}`)
  const fila = p.order_id ? await env.DB.prepare('SELECT * FROM licencias WHERE id = ?').bind(p.order_id).first<Fila>() : null
  if (fila?.cripto) await refrescar(env, fila, { cripto: [p] })
}

/**
 * Un aviso de Stripe. Se comprueba su firma, se contesta enseguida y luego se lee de su API lo que cambió: la sesión de
 * Checkout (pagada, vencida o, con un medio que tarda, cobrada o no), la suscripción del mensual (cada cobro, pausa o
 * cancelación) o, del año o del apoyo de una vez, un reembolso o un contracargo que se perdió.
 */
async function webhookStripe(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const texto = await req.text()
  if (!(await firmaDeStripe(req.headers.get('stripe-signature'), texto, env.STRIPE_WEBHOOK_SECRET, Date.now()))) return new Response('Firma inválida', { status: 401 })
  const e = JSON.parse(texto) as AvisoStripe
  ctx.waitUntil(avisoStripe(env, e).catch((error) => console.error('Aviso de Stripe', e.type, error instanceof Error ? error.message : error)))
  return new Response('ok')
}

interface AvisoStripe {
  type?: string
  data?: {
    object?: {
      id?: string
      client_reference_id?: string | null
      metadata?: Record<string, string>
      payment_intent?: string | null
      refunded?: boolean
      status?: string
    }
  }
}

async function avisoStripe(env: Env, e: AvisoStripe) {
  const tipo = e.type ?? ''
  const o = e.data?.object ?? {}
  const porId = (id: string | null | undefined) => (id ? env.DB.prepare('SELECT * FROM licencias WHERE id = ?').bind(id).first<Fila>() : null)
  if (tipo.startsWith('checkout.session.') && o.id) {
    const fila = await porId(o.client_reference_id)
    // Se vuelve a leer: el aviso podría ser viejo.
    if (fila?.stripe) await refrescar(env, fila, { sesiones: [await sesion(env, o.id)] })
    return
  }
  if (tipo.startsWith('customer.subscription.') && o.id) {
    const fila = await env.DB.prepare('SELECT * FROM licencias WHERE stripe = ?').bind(o.id).first<Fila>() ?? (await porId(o.metadata?.licencia))
    if (fila?.stripe) await refrescar(env, fila)
    return
  }
  // Un reembolso completo, o un contracargo cerrado: el pago deja de valer (o vuelve a valer, si se ganó).
  const estado = tipo === 'charge.refunded' && o.refunded ? 'refunded' : tipo === 'charge.dispute.closed' ? (o.status === 'lost' ? 'charged_back' : o.status === 'won' ? 'approved' : '') : ''
  if (!estado || !o.payment_intent) return
  const pago = await env.DB.prepare('SELECT licencia FROM stripe_pagos WHERE intento = ?').bind(o.payment_intent).first<{ licencia: string }>()
  if (!pago) return
  await env.DB.prepare('UPDATE stripe_pagos SET estado = ? WHERE intento = ?').bind(estado, o.payment_intent).run()
  const fila = await porId(pago.licencia)
  if (fila) await refrescar(env, fila)
}

/**
 * La firma de un aviso de NOWPayments (`x-nowpayments-sig`): el HMAC-SHA512 en hex, con la clave de los avisos, del
 * aviso en JSON con sus llaves en orden alfabético, también las de adentro.
 */
export async function firmaDeNowpayments(aviso: unknown, firma: string | null, secreto: string | undefined): Promise<boolean> {
  if (!firma || !secreto?.trim()) return false
  const ordenado = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(ordenado) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenado((v as Record<string, unknown>)[k])])) : v
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto.trim()), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const hex = [...new Uint8Array(await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(JSON.stringify(ordenado(aviso)))))].map((b) => b.toString(16).padStart(2, '0')).join('')
  return iguales(hex, firma.trim().toLowerCase())
}

/**
 * Vuelve a leer la suscripción (de PayPal o de Mercado Pago) o los pagos del año pagado de una vez, y la guarda. `otros`:
 * lo que trajo un aviso, por si la búsqueda aún no lo ve (el pago de Mercado Pago) o no es la última orden (las de PayPal).
 */
async function refrescar(env: Env, fila: Fila, otros: Otros = {}): Promise<Fila> {
  if (deUnaVez(fila)) return guardarEstado(env, fila, leerPagos(await pagosDelAño(env, fila, otros), fila))
  if (fila.stripe) return refrescarStripe(env, fila)
  if (fila.paypal) return guardarEstado(env, fila, leerPaypal(await paypal<SuscripcionPaypal>(env, 'GET', `/v1/billing/subscriptions/${encodeURIComponent(fila.paypal)}`)))
  if (fila.preapproval) return guardarEstado(env, fila, leerMp(await mp<Preapproval>(env, 'GET', `/preapproval/${encodeURIComponent(fila.preapproval)}`)))
  return fila
}

/** Lo que trajo un aviso, por si la búsqueda aún no lo ve: el pago de Mercado Pago, las órdenes de PayPal, los pagos de cripto o las sesiones de Stripe. */
type Otros = { mp?: PagoMp; ordenes?: string[]; cripto?: PagoCripto[]; sesiones?: SesionStripe[] }

/**
 * El mensual con tarjeta: mientras no se paga, su sesión de Checkout (`cs_…`); pagada, la suscripción que abrió, que
 * desde entonces queda en la fila (`sub_…`). Una sesión que venció sin pagarse (a las 24 horas) ya no se puede pagar.
 */
async function refrescarStripe(env: Env, fila: Fila): Promise<Fila> {
  if (fila.stripe!.startsWith('sub_')) return guardarEstado(env, fila, leerStripe(await suscripcionStripe(env, fila.stripe!)))
  const s = await sesion(env, fila.stripe!)
  if (!s.subscription) return guardarEstado(env, fila, { estado: s.status === 'expired' ? 'cancelled' : 'pending' })
  const sub = typeof s.subscription === 'string' ? await suscripcionStripe(env, s.subscription) : s.subscription
  await env.DB.prepare('UPDATE licencias SET stripe = ? WHERE id = ?').bind(sub.id, fila.id).run()
  return guardarEstado(env, { ...fila, stripe: sub.id }, leerStripe(sub))
}

/** Una suscripción de Mercado Pago, como la guarda el cobro. Cancelada, ya no dice hasta cuándo se pagó: vale la del último cobro que se vio. */
function leerMp(p: Preapproval): Lectura {
  return { estado: p.status as Estado, hasta: p.status === 'authorized' ? p.next_payment_date : undefined }
}

/** Una suscripción de PayPal, con los estados de Mercado Pago, que son los que entiende Sloth. Como allá, cancelada vale la fecha del último cobro que se vio. */
export function leerPaypal(s: Pick<SuscripcionPaypal, 'status' | 'billing_info'>): Lectura {
  const estado: Estado =
    s.status === 'ACTIVE' ? 'authorized' : s.status === 'SUSPENDED' ? 'paused' : s.status === 'CANCELLED' || s.status === 'EXPIRED' ? 'cancelled' : 'pending'
  return { estado, hasta: estado === 'authorized' ? s.billing_info?.next_billing_time : undefined }
}

/**
 * Los pagos de un año pagado de una vez: los de Mercado Pago, si empezó ahí, lo cobrado de sus órdenes de PayPal y lo
 * pagado con cripto. De cripto se vuelven a leer los que aún esperan; los demás cambian solo con su aviso.
 */
async function pagosDelAño(env: Env, f: Fila, otros: Otros): Promise<Pick<PagoMp, 'status' | 'transaction_amount' | 'currency_id' | 'date_approved'>[]> {
  const deMp = f.preferencia ? await pagosMp(env, f, otros.mp) : []
  for (const orden of new Set([f.orden, ...(otros.ordenes ?? [])])) if (orden) await cobrarOrden(env, f, orden)
  if (f.cripto) {
    const avisados = otros.cripto ?? []
    const { results: esperan } = await env.DB.prepare("SELECT pago FROM cripto_pagos WHERE licencia = ? AND estado = 'pending'").bind(f.id).all<{ pago: string }>()
    const leidos = await Promise.all(
      esperan.filter((e) => !avisados.some((p) => String(p.payment_id) === e.pago)).map((e) => nowpayments<PagoCripto>(env, 'GET', `/v1/payment/${encodeURIComponent(e.pago)}`))
    )
    for (const p of [...avisados, ...leidos]) await guardarPagoCripto(env, f, p)
  }
  // Con tarjeta, igual: las sesiones que aún esperan se vuelven a leer; las pagadas cambian solo con un reembolso o un contracargo.
  if (f.stripe) {
    const avisadas = otros.sesiones ?? []
    const { results: esperan } = await env.DB.prepare("SELECT pago FROM stripe_pagos WHERE licencia = ? AND estado = 'pending'").bind(f.id).all<{ pago: string }>()
    const leidas = await Promise.all(esperan.filter((e) => !avisadas.some((s) => s.id === e.pago)).map((e) => sesion(env, e.pago)))
    for (const s of [...avisadas, ...leidas]) if (s.client_reference_id === f.id) await guardarPagoStripe(env, f, pagoDeSesion(s))
  }
  const columnas = 'estado AS status, monto AS transaction_amount, moneda AS currency_id, aprobado AS date_approved'
  const { results } = await env.DB.prepare(
    `SELECT ${columnas} FROM paypal_pagos WHERE licencia = ?1 UNION ALL SELECT ${columnas} FROM cripto_pagos WHERE licencia = ?1 UNION ALL SELECT ${columnas} FROM stripe_pagos WHERE licencia = ?1`
  )
    .bind(f.id)
    .all<Pick<PagoMp, 'status' | 'transaction_amount' | 'currency_id' | 'date_approved'>>()
  return [...deMp, ...results]
}

/** Guarda cómo va un pago de cripto de la fila, con cuándo valió por primera vez. Uno de otra fila no se toca. */
async function guardarPagoCripto(env: Env, f: Fila, p: PagoCripto) {
  if (p.order_id !== f.id) return
  const estado = COBRO_CRIPTO[p.payment_status] ?? 'pending'
  await env.DB.prepare(
    'INSERT INTO cripto_pagos (pago, licencia, estado, monto, moneda, aprobado) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (pago) DO UPDATE SET estado = excluded.estado, aprobado = COALESCE(cripto_pagos.aprobado, excluded.aprobado)'
  )
    .bind(String(p.payment_id), f.id, estado, Number(p.price_amount), p.price_currency.toUpperCase(), VALEN.has(estado) ? (p.updated_at ?? new Date().toISOString()) : null)
    .run()
}

/**
 * Guarda cómo va una sesión de Stripe del año o del apoyo de una vez. Solo cambia la que aún esperaba: una ya pagada,
 * reembolsada o con contracargo la cambian sus avisos (`charge.*`), no la sesión, que sigue diciendo «pagada».
 */
async function guardarPagoStripe(env: Env, f: Pick<Fila, 'id'>, p: PagoStripe) {
  await env.DB.prepare(
    "INSERT INTO stripe_pagos (pago, licencia, intento, estado, monto, moneda, aprobado) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (pago) DO UPDATE SET intento = excluded.intento, estado = excluded.estado, monto = excluded.monto, moneda = excluded.moneda, aprobado = excluded.aprobado WHERE stripe_pagos.estado = 'pending'"
  )
    .bind(p.pago, f.id, p.intento, p.estado, p.monto, p.moneda, p.aprobado)
    .run()
}

/**
 * Lee una orden de PayPal de la fila, la cobra si el cliente ya la aprobó (sin eso, PayPal no cobra nada) y guarda
 * cómo va su cobro. Una orden de otra fila no se toca.
 */
async function cobrarOrden(env: Env, f: Fila, id: string) {
  const ruta = `/v2/checkout/orders/${encodeURIComponent(id)}`
  let o = await paypal<OrdenPaypal>(env, 'GET', ruta)
  if (o.purchase_units?.[0]?.custom_id !== f.id) return
  // Si `/gracias` y el aviso la cobran a la vez, la segunda recibe un 422: ya está cobrada, basta con leerla.
  if (o.status === 'APPROVED')
    o = await paypal<OrdenPaypal>(env, 'POST', `${ruta}/capture`, {}, { 'paypal-request-id': `cobro-${id}` }).catch((e) => {
      if (!(e instanceof Rechazo) || e.status !== 422) throw e
      return paypal<OrdenPaypal>(env, 'GET', ruta)
    })
  const c = o.purchase_units?.[0]?.payments?.captures?.[0]
  if (!c) return
  const estado = COBRO_PAYPAL[c.status] ?? c.status.toLowerCase()
  await env.DB.prepare(
    'INSERT INTO paypal_pagos (orden, licencia, estado, monto, moneda, aprobado) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (orden) DO UPDATE SET estado = excluded.estado, aprobado = excluded.aprobado'
  )
    .bind(id, f.id, estado, Number(c.amount.value), c.amount.currency_code, VALEN.has(estado) ? (c.create_time ?? new Date().toISOString()) : null)
    .run()
}

/** Los pagos de un año pagado de una vez: los de su fila. La búsqueda tarda en ver uno recién hecho: el del aviso va aparte. */
async function pagosMp(env: Env, f: Fila, avisado?: PagoMp): Promise<PagoMp[]> {
  const { results } = await mp<{ results: PagoMp[] }>(env, 'GET', `/v1/payments/search?external_reference=${encodeURIComponent(f.id)}&limit=50`)
  return avisado && !results.some((p) => p.id === avisado.id) ? [...results, avisado] : results
}

/**
 * Un año pagado de una vez, como lo guarda el cobro: cada pago que vale, en su moneda y de su monto, suma un año (un
 * mes, el apoyo de una vez y el mensual con cripto) desde que se aprobó, o desde que acaba lo ya pagado si se renovó antes. Sin ninguno que
 * valga: reembolsado o con contracargo, se acabó; si no, espera el pago.
 */
export function leerPagos(pagos: Pick<PagoMp, 'status' | 'transaction_amount' | 'currency_id' | 'date_approved'>[], f: Pick<Fila, 'monto' | 'moneda' | 'plan'>): Lectura {
  const aprobados = pagos
    .filter((p) => VALEN.has(p.status) && p.currency_id === f.moneda && p.transaction_amount >= f.monto && p.date_approved)
    .map((p) => Date.parse(p.date_approved!))
    .sort((a, b) => a - b)
  let fin = 0
  for (const aprobado of aprobados) {
    const d = new Date(Math.max(fin, aprobado))
    fin = f.plan === 'anual' ? d.setUTCFullYear(d.getUTCFullYear() + 1) : d.setUTCMonth(d.getUTCMonth() + 1)
  }
  if (fin) return { estado: 'pagado', hasta: new Date(fin).toISOString() }
  return { estado: pagos.some((p) => p.status === 'refunded' || p.status === 'charged_back') ? 'cancelled' : 'pending' }
}

async function guardarEstado(env: Env, fila: Fila, l: Lectura): Promise<Fila> {
  const estado = l.estado
  const ahora = new Date().toISOString()
  const nueva: Fila = {
    ...fila,
    estado,
    // Lo pagado de una vez sale entero de sus pagos: uno reembolsado deja de contar.
    pagado_hasta: deUnaVez(fila) ? (l.hasta ?? null) : (l.hasta ?? fila.pagado_hasta),
    autorizada: fila.autorizada ?? (estado === 'authorized' || estado === 'pagado' ? ahora : null),
    revisada: ahora
  }
  // El primer pago: la clave por correo, una sola vez aunque el aviso y `/gracias` lleguen a la vez.
  if (!fila.autorizada && nueva.autorizada) {
    const r = await env.DB.prepare('UPDATE licencias SET autorizada = ? WHERE id = ? AND autorizada IS NULL').bind(ahora, fila.id).run()
    if (r.meta.changes && fila.fundador && !(await sigueDeFundador(env, fila))) {
      await env.DB.prepare('UPDATE licencias SET fundador = 0 WHERE id = ?').bind(fila.id).run()
      nueva.fundador = 0
    }
    // Si no sale, `clave_enviada` queda vacía y el cron lo reintenta.
    if (r.meta.changes) await mandarClave(env, nueva)
  }
  await env.DB.prepare('UPDATE licencias SET estado = ?, pagado_hasta = ?, autorizada = COALESCE(autorizada, ?), revisada = ? WHERE id = ?')
    .bind(estado, nueva.pagado_hasta, nueva.autorizada, ahora, fila.id)
    .run()
  return nueva
}

/**
 * Al primer pago de un apoyo de Fundador, si lo sigue siendo: con su enlace, si nadie pagó antes con el mismo (lo deja
 * usado: es de una sola persona); si no, si aún queda un lugar público sin contar este. Varios pudieron abrir el pago a
 * la vez con el mismo enlace o con el último lugar: el apoyo de los demás sigue, pero ya no es de Fundador.
 */
async function sigueDeFundador(env: Env, f: Fila): Promise<boolean> {
  if (f.enlace_fundador && (await env.DB.prepare('UPDATE enlaces_fundador SET usado = ? WHERE codigo = ? AND usado IS NULL').bind(f.id, f.enlace_fundador).run()).meta.changes) return true
  if (f.modo !== 'produccion') return true
  const otros = await env.DB.prepare(`SELECT COUNT(*) AS n FROM licencias WHERE plan IN ('mensual', 'anual', 'unico') AND modo = 'produccion' AND id != ? AND ${esFundador('licencias')}`)
    .bind(f.id)
    .first<{ n: number }>()
  return (otros?.n ?? 0) < Number(env.FUNDADORES)
}

/** Manda la clave y, si Resend la aceptó, lo anota en `clave_enviada`. `false` si no salió: no lanza. */
async function mandarClave(env: Env, f: Fila): Promise<boolean> {
  const enviada = await bienvenida(env, f).catch((e) => (console.error('Correo con la clave', f.email, e instanceof Error ? e.message : e), false))
  if (enviada) await env.DB.prepare('UPDATE licencias SET clave_enviada = ? WHERE id = ?').bind(new Date().toISOString(), f.id).run()
  return enviada
}

/** Hasta cuándo se reintenta mandar una clave que no salió, desde que se confirmó el pago. */
const REINTENTAR_CLAVE = 3 * DIA
const MINUTO = 60_000
const HORA = 60 * MINUTO

/**
 * Cada 10 minutos: los apoyos ya confirmados cuya clave no salió (Resend falló o no respondió), otra vez, hasta
 * `REINTENTAR_CLAVE`. Si sigue sin salir pasada una hora, se avisa a soporte una vez para mandarla a mano.
 */
export async function reenviarClaves(env: Env, ahora = Date.now()) {
  // Las de los últimos 2 minutos no: su primer intento puede estar saliendo ahora mismo.
  const { results } = await env.DB.prepare("SELECT * FROM licencias WHERE clave_enviada IS NULL AND autorizada > ? AND autorizada < ? AND plan != 'cuenta'")
    .bind(new Date(ahora - REINTENTAR_CLAVE).toISOString(), new Date(ahora - 2 * MINUTO).toISOString())
    .all<Fila>()
  for (const f of results) {
    if (await mandarClave(env, f)) continue
    const hace = ahora - Date.parse(f.autorizada!)
    // Una sola vez: en la vuelta del cron que cae entre la hora y la hora y 10 minutos.
    if (hace >= HORA && hace < HORA + 10 * MINUTO)
      await correo(env, env.CORREO_RESPUESTA, `No salió la clave de ${f.email}`, [
        `Su pago se confirmó (${pasarela(f)}, ${f.monto} ${f.moneda}) y su correo con la clave lleva una hora sin salir. Se sigue intentando hasta 3 días.`,
        `Su clave: ${f.clave}. Mándasela a mano si te escribe.`
      ]).catch(() => false)
  }
}

/** La clave y cómo empezar, al confirmarse el primer pago. */
function bienvenida(env: Env, f: Fila) {
  return correo(env, f.email, `Tu clave de Sloth: ${f.clave}`, [
    'Hola:',
    deAMano(f)
      ? `Recibimos tu apoyo: gracias por apoyar a Sloth. Eres Fundador hasta el ${fecha(f.pagado_hasta!)}. Guarda este correo, es donde queda tu clave.`
      : `${pasarela(f)} confirmó tu pago: gracias por apoyar a Sloth. Guarda este correo, es donde queda tu clave.`,
    `Tu clave: ${f.clave}`,
    `Pégala en Sloth, en Opciones, y deja de salirte el recordatorio. Si aún no la tienes, descárgala en ${env.ORIGEN}/descargar (Mac: ${env.ORIGEN}/descargar?so=mac; Linux: ${env.ORIGEN}/descargar?so=linux). La clave sirve en dos computadoras a la vez.`,
    'Sloth trabaja con la IA que ya tengas: Claude, ChatGPT, OpenCode (que tiene modelos gratis) y otros agentes. Con uno basta, y Sloth no te cobra aparte: lo conectas en Opciones, en Agentes. Si tienes dudas, responde a este correo.'
  ])
}

/** Un apoyo de Fundador que el creador dio a mano (una transferencia): ninguna pasarela lo lee ni lo cancela. */
const deAMano = (f: Pick<Fila, 'plan' | 'paypal' | 'orden' | 'preapproval' | 'preferencia' | 'cripto' | 'stripe'>) =>
  f.plan === 'unico' && !(f.paypal || f.orden || f.preapproval || f.preferencia || f.cripto || f.stripe)

/** Hasta cuándo vale un apoyo a mano al sumarle `meses`: desde lo ya pagado, si aún no se acaba. */
export function hastaAMano(pagadoHasta: string | null, meses: number, ahora: number): string {
  const d = new Date(Math.max(ahora, pagadoHasta ? Date.parse(pagadoHasta) : 0))
  d.setUTCMonth(d.getUTCMonth() + meses)
  return d.toISOString()
}

/**
 * `POST /a-mano` (`npm run fundador -- dar`), solo del creador, con la llave de `PUBLICAR`: Fundador por `meses` a quien
 * apoyó sin pasarela (una transferencia). Si ese correo ya tiene uno a mano, se le suman a lo pagado y conserva su clave;
 * con `meses: 0`, solo se le vuelve a mandar. La clave le llega por correo.
 */
async function aMano(req: Request, env: Env): Promise<Response> {
  if (!delCreador(req, env)) throw new Rechazo(401, 'No autorizado.')
  const c = await cuerpo(req)
  const email = String(c.email ?? '').trim().toLowerCase()
  const meses = Number(c.meses ?? 1)
  if (!EMAIL.test(email)) throw new Rechazo(400, 'Escribe un correo válido.')
  if (!Number.isInteger(meses) || meses < 0 || meses > 24) throw new Rechazo(400, 'Los meses van de 0 a 24.')
  const ahora = new Date().toISOString()
  const { results } = await env.DB.prepare("SELECT * FROM licencias WHERE email = ? AND plan = 'unico' ORDER BY creada DESC").bind(email).all<Fila>()
  let fila = results.find(deAMano)
  if (!fila && !meses) throw new Rechazo(404, 'Ese correo no tiene un apoyo a mano.')
  if (fila) {
    fila = { ...fila, estado: 'pagado', pagado_hasta: hastaAMano(fila.pagado_hasta, meses, Date.now()) }
    await env.DB.prepare("UPDATE licencias SET estado = 'pagado', pagado_hasta = ?, revisada = ? WHERE id = ?").bind(fila.pagado_hasta, ahora, fila.id).run()
  } else {
    const nueva = { id: crypto.randomUUID(), clave: nuevaClave(), pagado_hasta: hastaAMano(null, meses, Date.now()) }
    await env.DB.prepare(
      "INSERT INTO licencias (id, clave, email, plan, monto, moneda, fundador, estado, pagado_hasta, autorizada, creada, revisada, acepto, modo) VALUES (?, ?, ?, 'unico', ?, ?, 1, 'pagado', ?, ?, ?, ?, ?, ?)"
    )
      .bind(nueva.id, nueva.clave, email, Number(env.PRECIO_MENSUAL), env.MONEDA, nueva.pagado_hasta, ahora, ahora, ahora, ahora, env.PAYPAL_MODO)
      .run()
    fila = (await env.DB.prepare('SELECT * FROM licencias WHERE id = ?').bind(nueva.id).first<Fila>())!
  }
  const enviado = await mandarClave(env, fila)
  return json({ clave: fila.clave, hasta: fila.pagado_hasta, enviado })
}

/**
 * Si abre Sloth y hasta cuándo, sin volver a preguntar. Autorizada, abre mientras PayPal o Mercado Pago la mantengan así
 * (reintentan los cobros que fallan y la cancela si no puede); cancelada, en pausa o pagada de una vez, hasta el fin de
 * lo pagado. Un lugar gratis abre siempre.
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
  // Fundador: un apoyo de su correo que entró entre los primeros y se llegó a pagar (`esFundador`), o su lugar gratis de por vida.
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

/**
 * Anota algo que `quien` hizo (`tipo`) si en el último día lleva menos de `max`: contar y anotar es un solo paso, así
 * que varias peticiones a la vez no se lo saltan, y borrar lo hecho no lo devuelve (migración 0012).
 */
export const CUPO = 'INSERT INTO cupos (quien, tipo, creado) SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM cupos WHERE quien = ?1 AND tipo = ?2 AND creado > ?4) < ?5'

export async function cupo(env: Env, quien: string, tipo: string, max: number): Promise<boolean> {
  const ahora = Date.now()
  const r = await env.DB.prepare(CUPO).bind(quien, tipo, new Date(ahora).toISOString(), new Date(ahora - DIA).toISOString(), max).run()
  return r.meta.changes > 0
}

/** Anota el aviso a `?1` de tipo `?2` si no se le dio en la última semana (`?5`); 0 cambios si ya se le dio. */
export const VIGILAR =
  'INSERT INTO vigilados (email, tipo, motivo, avisado) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (email, tipo) DO UPDATE SET motivo = excluded.motivo, avisado = excluded.avisado WHERE vigilados.avisado < ?5'
export const BLOQUEADA = 'Bloqueamos tu cuenta por actividad sospechosa.'

/**
 * Le avisa por correo a `email` que se vio actividad sospechosa en su cuenta (`motivo`) y que queda vigilada, o que se
 * bloqueó, con copia a soporte. Una vez por semana de cada cosa. Un correo que falla no detiene lo demás.
 */
export async function vigilar(env: Env, email: string, motivo: string, bloqueada = false): Promise<void> {
  const ahora = Date.now()
  const tipo = bloqueada ? 'bloqueada' : 'vigilada'
  const r = await env.DB.prepare(VIGILAR).bind(email, tipo, motivo, new Date(ahora).toISOString(), new Date(ahora - 7 * DIA).toISOString()).run()
  if (!r.meta.changes) return
  const suyo = bloqueada
    ? [`${BLOQUEADA} Ya no entra a la comunidad, y con este correo no se abre otra.`]
    : [`Detectamos actividad sospechosa en tu cuenta: ${motivo}.`, 'Desde ahora tu cuenta queda vigilada. Si sigue, la bloqueamos y ya no entras a la comunidad.']
  await Promise.all([
    correo(env, email, 'Actividad sospechosa en tu cuenta de Sloth', ['Hola:', ...suyo, 'Si crees que es un error, responde a este correo.']),
    correo(env, env.CORREO_RESPUESTA, `Cuenta ${tipo}: ${email}`, [`${email}: ${motivo}.`, bloqueada ? 'Ya estaba bloqueada; se le avisó.' : 'Se le avisó que queda vigilada.'])
  ]).catch((e) => console.error('Correo de vigilancia', e instanceof Error ? e.message : e))
}

/** La conexión de quien pide, resumida: para su cupo, sin guardar su IP. */
async function conexion(req: Request): Promise<string> {
  return `ip:${await resumen(`sloth:${redDe(req.headers.get('cf-connecting-ip') ?? '')}`)}`
}

/** `texto` resumido (SHA-256, sus primeros 12 bytes en hex): para contar sin guardar la IP ni el correo. */
async function resumen(texto: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * La red de una IP, para los cupos: una IPv4 entera; de una IPv6, su /64, porque una sola conexión casera tiene 2^64
 * direcciones y con cada una se saltaría el cupo.
 */
export function redDe(ip: string): string {
  if (!ip.includes(':')) return ip
  const [antes, despues] = ip.toLowerCase().split('::')
  const a = antes ? antes.split(':') : []
  const d = despues === undefined ? [] : despues ? despues.split(':') : []
  const grupos = despues === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - d.length)).fill('0'), ...d]
  return `${grupos
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

/** Si pide quien publica, con la llave `PUBLICAR`. */
const conLlave = (req: Request, env: Env) => !!env.PUBLICAR && iguales(req.headers.get('authorization') ?? '', `Bearer ${env.PUBLICAR}`)

/** Si pide el creador: con su llave `ADMIN`, o con la de publicar, que también lo es. */
export const delCreador = (req: Request, env: Env) => conLlave(req, env) || (!!env.ADMIN && iguales(req.headers.get('authorization') ?? '', `Bearer ${env.ADMIN}`))

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

async function mp<T>(env: Env, metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const r = await fetch(`${MP}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${tokenMp(env)}`, 'content-type': 'application/json', ...extra },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })
  const datos = (await r.json().catch(() => ({}))) as { message?: string }
  if (!r.ok) {
    // Solo el estado y el mensaje: nada del cliente.
    console.error('Mercado Pago', metodo, ruta.replace(/\?.*$/, '').replace(/\/[\w-]{12,}$/, '/…'), r.status, datos.message ?? '')
    throw new Rechazo(r.status, datos.message ?? `Mercado Pago respondió ${r.status}`)
  }
  return datos as T
}

/** El acceso a PayPal, que dura horas: se reusa mientras viva este Worker. */
let accesoPaypal: { token: string; vence: number; modo: string } | undefined

async function tokenPaypal(env: Env): Promise<string> {
  if (accesoPaypal?.modo === env.PAYPAL_MODO && Date.now() < accesoPaypal.vence) return accesoPaypal.token
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) throw new Error(`Faltan las llaves de PayPal del modo ${env.PAYPAL_MODO}.`)
  const r = await fetch(`${PAYPAL[env.PAYPAL_MODO]}/v1/oauth2/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
  if (!r.ok || !j.access_token) throw new Error(`PayPal no dio acceso: ${r.status}`)
  accesoPaypal = { token: j.access_token, vence: Date.now() + ((j.expires_in ?? 600) - 60) * 1000, modo: env.PAYPAL_MODO }
  return j.access_token
}

/** Una llamada a PayPal. `cuerpo` en texto va tal cual (el aviso que se comprueba); si no, en JSON. */
async function paypal<T>(env: Env, metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const r = await fetch(`${PAYPAL[env.PAYPAL_MODO]}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${await tokenPaypal(env)}`, 'content-type': 'application/json', ...extra },
    body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  })
  // Cancelar contesta 204, sin cuerpo.
  const datos = (await r.json().catch(() => ({}))) as { name?: string; message?: string; details?: { issue?: string }[] }
  if (!r.ok) {
    // Solo el estado y el error: nada del cliente.
    console.error('PayPal', metodo, ruta.replace(/\/[\w-]{12,}(?=\/|$)/g, '/…'), r.status, datos.name ?? '', datos.details?.[0]?.issue ?? '')
    throw new Rechazo(r.status, datos.message ?? `PayPal respondió ${r.status}`)
  }
  return datos as T
}

/** Una llamada a NOWPayments, con su llave del modo de hoy. */
async function nowpayments<T>(env: Env, metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  if (!env.NOWPAYMENTS_API_KEY) throw new Error(`Falta la llave de NOWPayments del modo ${env.NOWPAYMENTS_MODO}.`)
  const r = await fetch(`${NOWPAYMENTS[env.NOWPAYMENTS_MODO]}${ruta}`, {
    method: metodo,
    headers: { 'x-api-key': env.NOWPAYMENTS_API_KEY, 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  })
  const datos = (await r.json().catch(() => ({}))) as { message?: string }
  if (!r.ok) {
    // Solo el estado y el mensaje: nada del cliente.
    console.error('NOWPayments', metodo, ruta.replace(/\/\d+$/, '/…'), r.status, datos.message ?? '')
    throw new Rechazo(r.status, datos.message ?? `NOWPayments respondió ${r.status}`)
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
 * El aviso de cada cobro que viene (LFPC art. 76 Bis VIII: al menos 5 días naturales antes de cada renovación) y, de un
 * año pagado de una vez, de que se acaba, con el enlace para pagar el siguiente. Antes de avisar se vuelve a leer: si se
 * canceló, cambió la fecha o ya se renovó, no se avisa de algo que no va a pasar.
 */
export async function avisarCobros(env: Env, ahora = Date.now()) {
  // El apoyo de una vez no tiene cobro ni año que se acabe: no se avisa.
  const { results } = await env.DB.prepare(
    "SELECT * FROM licencias WHERE estado IN ('authorized', 'pagado') AND plan != 'unico' AND pagado_hasta IS NOT NULL AND (avisado_para IS NULL OR avisado_para != pagado_hasta)"
  ).all<Fila>()
  for (const vieja of results) {
    if (!faltaAvisar(vieja, ahora)) continue
    const f = await refrescar(env, vieja).catch(() => null)
    if (!f || !faltaAvisar(f, ahora)) continue
    const cada = f.plan === 'anual' ? 'anual' : 'mensual'
    // Pagado de una vez: el año, o el mes con cripto.
    const lapso = f.plan === 'anual' ? 'año' : 'mes'
    const con = f.stripe ? 'tarjeta, en Stripe' : f.cripto ? 'cripto, con NOWPayments' : f.preferencia && !f.orden ? 'Mercado Pago' : 'PayPal'
    const enviado = await (f.estado === 'pagado'
      ? correo(env, f.email, `Tu ${lapso} de Sloth se acaba el ${fecha(f.pagado_hasta!)}`, [
          'Hola:',
          `Tu ${lapso} de apoyo a Sloth se acaba el ${fecha(f.pagado_hasta!)}. No se renueva solo: no te vamos a cobrar nada.`,
          `Si quieres seguir apoyando, paga el ${lapso} siguiente (${f.monto.toLocaleString('es-MX')} ${f.moneda}, IVA incluido) con ${con}: ${env.ORIGEN}/renovar?s=${f.id}. Tu clave es la misma y el ${lapso} nuevo empieza cuando se acabe este.`,
          'También lo renuevas desde Sloth: Opciones, Apoyo, «Renovar». Si tienes dudas, responde a este correo.'
        ])
      : correo(env, f.email, `Tu próximo cobro de Sloth: ${fecha(f.pagado_hasta!)}`, [
          'Hola:',
          `El ${fecha(f.pagado_hasta!)} ${pasarela(f)} te cobrará ${f.monto.toLocaleString('es-MX')} ${f.moneda} (IVA incluido) por tu suscripción ${cada} a Sloth.`,
          'Si no quieres que se renueve, cancélala antes de esa fecha en Sloth: Opciones, Suscripción, «Cancelar suscripción». También puedes responder a este correo o escribirnos por WhatsApp. Lo ya pagado sigue valiendo hasta su fecha.'
        ])
    ).catch((e) => (console.error('Aviso de cobro', e instanceof Error ? e.message : e), false))
    if (enviado) await env.DB.prepare('UPDATE licencias SET avisado_para = ? WHERE id = ?').bind(f.pagado_hasta, f.id).run()
  }
}

/** Si el próximo cobro de esta suscripción (o el fin del año pagado de una vez) ya está a `AVISO` o menos y aún no se le avisó. */
export function faltaAvisar(f: Pick<Fila, 'estado' | 'pagado_hasta' | 'avisado_para'>, ahora: number): boolean {
  if ((f.estado !== 'authorized' && f.estado !== 'pagado') || !f.pagado_hasta || f.avisado_para === f.pagado_hasta) return false
  const cobro = Date.parse(f.pagado_hasta)
  return cobro > ahora && cobro - ahora <= AVISO
}

/** Manda un correo con Resend. `false` si no hay llave todavía: se anota y no se marca como enviado. */
export async function correo(env: Env, para: string, asunto: string, parrafos: string[], idempotencia?: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log('Correo sin mandar (falta RESEND_API_KEY):', asunto)
    return false
  }
  const pie = `${PROVEEDOR} · ${env.CORREO_RESPUESTA}`
  const html = `<div style="font:15px/1.6 system-ui,sans-serif;color:#1b1408;max-width:560px">${parrafos.map((p) => `<p>${escapar(p)}</p>`).join('')}<p style="color:#9a907f;font-size:12px">${escapar(pie)}</p></div>`
  const cuerpo = JSON.stringify({ from: env.CORREO_DE, to: [para], reply_to: env.CORREO_RESPUESTA, subject: asunto, text: [...parrafos, '', pie].join('\n\n'), html })
  const llave = idempotencia ?? crypto.randomUUID()
  // Con demasiados a la vez (429) o una falla suya (5xx), Resend pide volver a intentar: dos veces más, con pausa.
  for (let intento = 0; ; intento++) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      // Resend pide un User-Agent, y el fetch de un Worker no manda ninguno. La llave de idempotencia, la misma en cada
      // intento de este correo, evita mandarlo dos veces si un intento sí llegó pero su respuesta no.
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'user-agent': 'sloth-licencias', 'idempotency-key': llave },
      body: cuerpo
    })
    if (r.ok) return true
    if (intento < 2 && (r.status === 429 || r.status >= 500)) {
      await new Promise((listo) => setTimeout(listo, 1500 * (intento + 1)))
      continue
    }
    throw new Error(`Resend respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** «21 de noviembre de 2026», en la hora de la Ciudad de México. */
function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' })
}

/**
 * Adonde vuelve el cliente tras pagar en PayPal, o al salir sin pagar (`?s=` es su suscripción, que solo conocen él y PayPal).
 * Mientras no se confirme el pago, se recarga sola y vuelve a preguntar; confirmado, dice a qué correo llegó la clave y
 * da el instalador de cada sistema. La clave no se enseña: quien pagó con el correo de otro no se queda con su cuenta
 * (ver `suscribir`). Sin `s` viene de la app de antes, que espera abierta y se desbloquea sola.
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
      `${correoAviso(escapar(fila.email))}
<a class="boton" href="/descargar">Descargar Sloth para Windows</a>
<p class="otros">También para <a href="/descargar?so=mac">Mac</a> y <a href="/descargar?so=linux">Linux</a>.</p>
<ol><li>Instálala. Si Windows dice «Windows protegió tu PC», da clic en <b>Más información</b> y luego en <b>Ejecutar de todas formas</b>.</li>
<li>Ábrela y pega en Opciones la clave de tu correo: deja de salirte el recordatorio. Sirve en dos computadoras a la vez.</li>
<li>Conecta tu IA en Opciones, en Agentes (Claude, ChatGPT, OpenCode, que tiene modelos gratis, u otra), elige un estilo y escribe el tema.</li></ol>`
    )
  // Quien sale de PayPal sin pagar también vuelve aquí: puede volver al pago.
  if (fila.estado === 'pending')
    return pagina(
      'Esperando tu pago…',
      `<p>En cuanto ${pasarela(fila)} lo confirme, tu clave te llega por correo y aquí aparece el instalador. ${fila.cripto ? 'Con cripto tarda lo que la red en confirmar el pago: unos minutos.' : 'Suele tardar unos segundos.'}</p>${correoAviso(escapar(fila.email))}${fila.enlace ? `<p class="otros">¿Saliste sin pagar? <a href="${escapar(fila.enlace)}">Volver al pago</a></p>` : ''}`,
      5
    )
  return pagina(
    `${pasarela(fila)} no confirmó el pago`,
    '<p>Vuelve a <a href="https://sloth.vancci.org">sloth.vancci.org</a> e inténtalo otra vez, o escríbenos desde ahí.</p>'
  )
}

/**
 * El enlace del correo de que se acaba el año (`?s=` es la fila, como en `/gracias`): abre el pago del año siguiente,
 * con la misma clave.
 */
async function renovacion(env: Env, url: URL): Promise<Response> {
  const id = url.searchParams.get('s') ?? ''
  const fila = /^[\w-]{36}$/.test(id) ? await env.DB.prepare('SELECT * FROM licencias WHERE id = ?').bind(id).first<Fila>() : null
  if (!fila || !deUnaVez(fila) || fila.estado !== 'pagado')
    return pagina('Este enlace ya no sirve', '<p>Para apoyar a Sloth, entra a <a href="https://sloth.vancci.org">sloth.vancci.org</a>, o responde al correo y te ayudamos.</p>')
  return Response.redirect(await renovar(env, fila), 303)
}

/**
 * Lo que se lee antes de bajar la de Mac: cuál de las dos, si están la de Apple Silicon (`arm`) y la de Intel
 * (`intel`), y cómo se abre la primera vez la que aún no lleva la firma de Apple (docs/adr/0006-mac-y-linux.md): sin
 * ella, macOS no la deja abrir a la primera ni se actualiza sola.
 */
function avisoMac(intel: Ultima | undefined, arm: Ultima | undefined, viejo?: Ultima): Response {
  const boton = (u: Ultima, so: Sistema, cual: string, principal: boolean) =>
    `<a class="${principal ? 'boton' : 'boton otro'}" href="/descargar?so=${so}&amp;visto">Descargar Sloth ${u.version} para ${cual}</a>`
  const elegir = intel && arm
  const sinFirma = [intel, arm, viejo].some((u) => u && !abreALaPrimera(u))
  // Las que se enseñan y no van firmadas; si son todas, se dice de «Sloth para Mac».
  const macs: [string, Ultima | undefined][] = [['La de Apple Silicon', arm], ['La de Intel', intel], ['La de macOS 12', viejo]]
  const vistas = macs.filter(([, u]) => u)
  const sinFirmaDe = vistas.filter(([, u]) => u && !abreALaPrimera(u)).map(([n]) => n)
  const quien = sinFirmaDe.length === vistas.length ? 'Sloth para Mac' : sinFirmaDe.join(' y ').replace(' y La', ' y la')
  const deMac12 = viejo
    ? intel || arm
      ? '<p>¿Tu Mac se quedó en <b>macOS 12 (Monterey)</b> y no se puede actualizar? Baja la de macOS 12: abre, pero es probable que <b>Claude</b> y otras funciones no anden ahí.</p>'
      : '<p>Para Mac con <b>macOS 12 (Monterey)</b>. Abre, pero es probable que <b>Claude</b> y otras funciones no anden ahí: si tu Mac se puede actualizar a macOS 13 o más nuevo, mejor actualízala y baja la normal.</p>'
    : ''
  const pasos = sinFirma
    ? `<ol><li>Abre el archivo que se baja y arrastra <b>Sloth</b> a <b>Aplicaciones</b>.</li>
<li>Ábrela. macOS dirá que no puede comprobarla: cierra ese aviso, ve a <b>Configuración del Sistema → Privacidad y seguridad</b> y pulsa <b>«Abrir de todos modos»</b>. Solo la primera vez.</li>
<li>Cuando salga una versión nueva, Sloth te avisa y la bajas aquí otra vez, encima de la que tienes: tus videos y tus hilos se quedan.</li></ol>`
    : `<ol><li>Abre el archivo que se baja y arrastra <b>Sloth</b> a <b>Aplicaciones</b>.</li>
<li>Ábrela. Las versiones nuevas se ponen solas: Sloth te avisa y basta con «Actualizar».</li></ol>`
  return pagina(
    'Sloth para Mac',
    `${elegir ? '<p>Elige la de tu Mac: en el menú de Apple → <b>Acerca de esta Mac</b>, si dice <b>Chip Apple M1</b> o más nuevo, es Apple Silicon; si dice <b>Procesador Intel</b>, es Intel. Las dos piden macOS 13 o más nuevo.</p>' : intel || arm ? '<p>Pide macOS 13 o más nuevo.</p>' : ''}
${deMac12}
${sinFirma ? `<p>${quien} todavía no ${sinFirmaDe.length > 1 && quien !== 'Sloth para Mac' ? 'llevan' : 'lleva'} la firma de Apple: macOS pide un paso más la primera vez.</p>` : ''}
${arm ? boton(arm, 'mac-arm64', elegir ? 'Mac con Apple Silicon (M1 o más nuevo)' : 'Mac', true) : ''}
${intel ? boton(intel, 'mac', elegir ? 'Mac con Intel (i5, i7 o i9)' : 'Mac', !arm) : ''}
${viejo ? boton(viejo, 'mac12', 'Mac con macOS 12', !arm && !intel) : ''}
${pasos}
${!elegir && intel ? '<p class="otros">Para Mac con Intel. En un Mac con M1 o más nuevo también abre: la primera vez, macOS pide instalar Rosetta.</p>' : ''}`
  )
}

/** Que la clave llega también por correo, bien a la vista: es lo que queda si se cierra la página. */
function correoAviso(para: string): string {
  return `<div class="correo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><div><b>Tu clave te llega a ${para}</b>, con el enlace para descargar Sloth. Puedes cerrar esta página: la tienes ahí. Si no la ves en unos minutos, revisa spam o promociones.</div></div>`
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
.boton.otro{margin-top:10px;background:none;border:1px solid #e8a33d;color:#e8a33d}
.otros{margin:10px 0 0;font-size:14px;text-align:center}</style></head>
<body><main><h1>${titulo}</h1>${cuerpo}</main></body></html>`,
    // Con la clave a la vista: que no se guarde en ninguna caché.
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } }
  )
}
