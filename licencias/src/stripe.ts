/**
 * La tarjeta (`pasarela: 'tarjeta'`, ver `index.ts`): la cobra Stripe, en `MONEDA`, con tarjetas de cualquier país (y
 * Apple Pay, Google Pay y Link, según su panel). Sin su SDK: su API se habla con `fetch` y formularios.
 *
 * Cada pago nace en una sesión de Stripe Checkout (`stripe` en la fila: `cs_…`). El mensual es una suscripción: pagada,
 * la fila guarda la suscripción (`sub_…`) y se lee de ahí. El año y el apoyo de una vez son un pago suelto: cada sesión
 * (la primera y cada renovación) queda en `stripe_pagos` y cuenta como los pagos de PayPal o de cripto. Con Adaptive
 * Pricing, quien paga desde otro país lo ve y lo paga en su moneda; lo que se guarda es lo cobrado en `MONEDA`.
 *
 * `npm run stripe` lo deja listo con la llave secreta: activa los medios de pago, crea el webhook (a
 * `<ORIGEN>/webhook/stripe`) y guarda `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` en el Worker.
 */
import { Rechazo, iguales, type Env, type Estado, type Fila, type Lectura } from './index.ts'

const API = 'https://api.stripe.com'
/** Cuánto puede tardar en llegar un aviso firmado antes de rechazarlo por viejo (lo que recomienda Stripe). */
const TOLERANCIA = 5 * 60_000

export interface SuscripcionStripe {
  id: string
  customer: string
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused'
  cancel_at_period_end?: boolean
  /** En las versiones de su API desde 2025-03-31, el periodo va en cada concepto; antes, aquí. */
  current_period_start?: number
  current_period_end?: number
  items?: { data?: { current_period_start?: number; current_period_end?: number }[] }
}

/** Cuánto sigue abierta una suscripción con el cobro sin pasar (`past_due`) desde que empezó el periodo que no se pagó. */
export const GRACIA_STRIPE = 21 * 24 * 3600_000

/** Una sesión de Checkout, con lo que se lee de ella. */
export interface SesionStripe {
  id: string
  url?: string | null
  status: 'open' | 'complete' | 'expired'
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  client_reference_id?: string | null
  amount_total?: number | null
  currency?: string | null
  /** Con Adaptive Pricing, lo cobrado en la moneda del precio (la de la fila); `amount_total` va en la del cliente. */
  currency_conversion?: { amount_total: number; source_currency: string } | null
  payment_intent?: string | { id: string } | null
  subscription?: string | SuscripcionStripe | null
  created: number
}

/** Un pago suelto de Stripe, como se guarda en `stripe_pagos`, con los estados de Mercado Pago que entiende `leerPagos`. */
export interface PagoStripe {
  pago: string
  intento: string | null
  estado: string
  monto: number
  moneda: string
  aprobado: string | null
}

/**
 * Una suscripción de Stripe en los estados de Mercado Pago, que son los que entiende Sloth. `past_due` (Stripe reintenta
 * el cobro) sigue abierta, como `authorized` en Mercado Pago, pero no alarga lo pagado, y solo `GRACIA_STRIPE` desde que
 * empezó el periodo sin pagar: si el panel de Stripe la deja en `past_due` al acabar los reintentos, se pausa. Si se
 * pidió cancelar al final del periodo, ya cuenta como cancelada: no se avisa del cobro y abre hasta ese día.
 */
export function leerStripe(s: Pick<SuscripcionStripe, 'status' | 'cancel_at_period_end' | 'current_period_start' | 'current_period_end' | 'items'>, ahora = Date.now()): Lectura {
  const fin = s.items?.data?.[0]?.current_period_end ?? s.current_period_end
  const inicio = s.items?.data?.[0]?.current_period_start ?? s.current_period_start
  const hasta = fin ? new Date(fin * 1000).toISOString() : undefined
  const estado: Estado =
    s.status === 'active' || s.status === 'trialing'
      ? s.cancel_at_period_end
        ? 'cancelled'
        : 'authorized'
      : s.status === 'past_due'
        ? inicio && ahora - inicio * 1000 > GRACIA_STRIPE
          ? 'paused'
          : 'authorized'
        : s.status === 'incomplete'
          ? 'pending'
          : s.status === 'unpaid' || s.status === 'paused'
            ? 'paused'
            : 'cancelled'
  return { estado, hasta: estado === 'authorized' && s.status !== 'past_due' ? hasta : estado === 'cancelled' && s.cancel_at_period_end ? hasta : undefined }
}

/**
 * El pago suelto de una sesión: pagada, vale desde que se creó la sesión (Stripe no da la hora del cobro en ella, y es
 * de minutos antes); vencida o sin pagar, no vale. Lo cobrado va en la moneda del precio, aunque el cliente pagara en
 * la suya.
 */
export function pagoDeSesion(s: SesionStripe): PagoStripe {
  const intento = typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null)
  const estado = s.payment_status === 'paid' ? 'approved' : s.status === 'expired' ? 'rejected' : 'pending'
  const cobrado = s.currency_conversion ? { monto: s.currency_conversion.amount_total, moneda: s.currency_conversion.source_currency } : { monto: s.amount_total ?? 0, moneda: s.currency ?? '' }
  return { pago: s.id, intento, estado, monto: cobrado.monto / 100, moneda: cobrado.moneda.toUpperCase(), aprobado: estado === 'approved' ? new Date(s.created * 1000).toISOString() : null }
}

/**
 * La sesión de pago de una fila: el mensual, una suscripción; el año o el apoyo de una vez, un pago suelto. Su `url` es
 * adonde va el cliente; al pagar, vuelve a `/gracias`, y si sale, a la página de Sloth.
 */
export function sesionStripe(env: Env, f: Pick<Fila, 'id' | 'email' | 'plan' | 'monto' | 'moneda'>): Promise<SesionStripe> {
  const mensual = f.plan === 'mensual'
  const nombre = { mensual: 'Sloth - apoyo mensual', anual: 'Sloth - plan anual', unico: 'Sloth - apoyo de una vez' }[f.plan as 'mensual' | 'anual' | 'unico']
  return stripe(env, 'POST', '/v1/checkout/sessions', {
    mode: mensual ? 'subscription' : 'payment',
    customer_email: f.email,
    client_reference_id: f.id,
    ...(mensual ? { 'subscription_data[metadata][licencia]': f.id } : { 'payment_intent_data[metadata][licencia]': f.id, 'payment_intent_data[statement_descriptor_suffix]': 'SLOTH' }),
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': f.moneda.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(Math.round(f.monto * 100)),
    ...(mensual ? { 'line_items[0][price_data][recurring][interval]': 'month' } : {}),
    'line_items[0][price_data][product_data][name]': nombre,
    // El precio ya trae el IVA, como dice la página: con Stripe Tax (encendido en la cuenta) se desglosa, no se suma.
    'line_items[0][price_data][tax_behavior]': 'inclusive',
    // Quien paga desde otro país lo ve y lo paga en su moneda.
    'adaptive_pricing[enabled]': 'true',
    // Que se vea Sloth y no el nombre de la cuenta: su nombre y su paleta.
    'branding_settings[display_name]': 'Sloth',
    'branding_settings[background_color]': '#0f0e0c',
    'branding_settings[button_color]': '#e8a33d',
    'branding_settings[border_style]': 'rounded',
    locale: 'es-419',
    success_url: `${env.ORIGEN}/gracias?s=${f.id}`,
    cancel_url: 'https://sloth.vancci.org/#apoyar'
  })
}

export function sesion(env: Env, id: string): Promise<SesionStripe> {
  return stripe(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(id)}?expand[]=subscription`)
}

export function suscripcionStripe(env: Env, id: string): Promise<SuscripcionStripe> {
  return stripe(env, 'GET', `/v1/subscriptions/${encodeURIComponent(id)}`)
}

/** Que no se cobre el mes siguiente: la suscripción sigue hasta el fin de lo pagado y ahí se acaba. */
export function cancelarStripe(env: Env, id: string): Promise<SuscripcionStripe> {
  return stripe(env, 'POST', `/v1/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: 'true' })
}

/** El modo de la llave: con `sk_live_` (o `rk_live_`) cobra de verdad. */
export const modoStripe = (env: Pick<Env, 'STRIPE_SECRET_KEY'>) => (/^[sr]k_live_/.test(env.STRIPE_SECRET_KEY ?? '') ? 'produccion' : 'prueba')

export async function stripe<T>(env: Env, metodo: string, ruta: string, formulario?: Record<string, string>): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Falta STRIPE_SECRET_KEY.')
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: formulario && new URLSearchParams(formulario)
  })
  const datos = (await r.json().catch(() => ({}))) as { error?: { message?: string } }
  if (!r.ok) {
    // Solo el estado y el mensaje: nada del cliente.
    console.error('Stripe', metodo, ruta.replace(/\?.*$/, '').replace(/\/\w+_\w{8,}/, '/…'), r.status, datos.error?.message ?? '')
    throw new Rechazo(r.status, datos.error?.message ?? `Stripe respondió ${r.status}`)
  }
  return datos as T
}

/**
 * La firma de un aviso: `stripe-signature` trae `t` y uno o más `v1`, el HMAC-SHA256 en hex de `<t>.<cuerpo>` con el
 * secreto del webhook. Uno de hace más de `TOLERANCIA` se rechaza: podría ser repetido.
 */
export async function firmaDeStripe(cabecera: string | null, cuerpo: string, secreto: string | undefined, ahora: number): Promise<boolean> {
  if (!cabecera || !secreto) return false
  const partes = cabecera.split(',').map((p) => p.trim().split('='))
  const t = partes.find(([k]) => k === 't')?.[1]
  const firmas = partes.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !firmas.length || Math.abs(ahora - Number(t) * 1000) > TOLERANCIA) return false
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const firma = [...new Uint8Array(await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(`${t}.${cuerpo}`)))].map((b) => b.toString(16).padStart(2, '0')).join('')
  return firmas.some((v) => iguales(firma, v))
}
