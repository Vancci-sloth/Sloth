/**
 * Stripe, la otra forma de pagar Sloth (ver `index.ts`). Sin su SDK: su API se habla con `fetch` y formularios.
 *
 * Cada suscripción nace en una sesión de Stripe Checkout, en pesos y sin decir qué medios de pago: salen los que estén
 * activos en su panel (tarjetas de cualquier país, Apple Pay, Google Pay, Link). Con Adaptive Pricing, quien paga desde
 * fuera de México ve y paga el precio en su moneda, y así se le cobra cada mes.
 *
 * `npm run stripe` lo deja listo con la llave secreta: activa esos medios de pago, crea el webhook (a
 * `<ORIGEN>/webhook/stripe`) y guarda `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` en el Worker.
 */
import { Rechazo, iguales, type Env, type Estado, type Fila } from './index.ts'

const API = 'https://api.stripe.com'
/** Cuánto puede tardar en llegar un aviso firmado antes de rechazarlo por viejo (lo que recomienda Stripe). */
const TOLERANCIA = 5 * 60_000

/** Lo que el cobro guarda de una suscripción, venga de Mercado Pago o de Stripe. `hasta`: su próximo cobro, si se sabe. */
export interface Lectura {
  id: string
  estado: Estado
  hasta?: string
}

export interface SuscripcionStripe {
  id: string
  customer: string
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused'
  cancel_at_period_end?: boolean
  /** En las versiones de su API desde 2025-03-31, el fin del periodo va en cada concepto; antes, aquí. */
  current_period_end?: number
  items?: { data?: { current_period_end?: number }[] }
}

/**
 * Una suscripción de Stripe en los estados de Mercado Pago, que son los que entiende Sloth. `past_due` (Stripe reintenta
 * el cobro) sigue abierta, como `authorized` en Mercado Pago, pero no alarga lo pagado. Si se pidió cancelar al final del
 * periodo, ya cuenta como cancelada: no se avisa del cobro y abre hasta ese día.
 */
export function leerStripe(s: SuscripcionStripe): Lectura {
  const fin = s.items?.data?.[0]?.current_period_end ?? s.current_period_end
  const hasta = fin ? new Date(fin * 1000).toISOString() : undefined
  switch (s.status) {
    case 'active':
    case 'trialing':
      return { id: s.id, estado: s.cancel_at_period_end ? 'cancelled' : 'authorized', hasta }
    case 'past_due':
      return { id: s.id, estado: 'authorized' }
    case 'incomplete':
      return { id: s.id, estado: 'pending' }
    case 'unpaid':
    case 'paused':
      return { id: s.id, estado: 'paused' }
    default:
      return { id: s.id, estado: 'cancelled' }
  }
}

/** La sesión de pago de una fila nueva: su `url` es adonde va el cliente; al pagar, vuelve a `/gracias`. */
export function sesionStripe(env: Env, f: Fila): Promise<{ id: string; url: string }> {
  return stripe(env, 'POST', '/v1/checkout/sessions', {
    mode: 'subscription',
    customer_email: f.email,
    client_reference_id: f.id,
    'subscription_data[metadata][licencia]': f.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'mxn',
    'line_items[0][price_data][unit_amount]': String(f.monto * 100),
    'line_items[0][price_data][recurring][interval]': f.plan === 'anual' ? 'year' : 'month',
    'line_items[0][price_data][product_data][name]': f.plan === 'anual' ? 'Sloth · plan anual' : 'Sloth · plan mensual',
    // Con Stripe Tax, el precio ya trae el IVA (se desglosa en el recibo) y Sloth cuenta como software que se descarga.
    ...(env.STRIPE_IMPUESTOS === '1' && {
      'automatic_tax[enabled]': 'true',
      'line_items[0][price_data][tax_behavior]': 'inclusive',
      'line_items[0][price_data][product_data][tax_code]': 'txcd_10202000'
    }),
    // Quien paga desde fuera de México lo ve y lo paga en su moneda, sin depender de lo que diga el panel.
    'adaptive_pricing[enabled]': 'true',
    // Que se vea Sloth y no el nombre de la cuenta: su nombre, su logo y su paleta.
    'branding_settings[display_name]': 'Sloth',
    'branding_settings[icon][type]': 'url',
    'branding_settings[icon][url]': 'https://sloth.vancci.org/sloth/stripe-icono.png',
    'branding_settings[background_color]': '#0f0e0c',
    'branding_settings[button_color]': '#e8a33d',
    'branding_settings[border_style]': 'rounded',
    locale: 'es-419',
    success_url: `${env.ORIGEN}/gracias?s=${f.id}`,
    cancel_url: 'https://sloth.vancci.org'
  })
}

/** Una visita al portal del cliente; al salir, vuelve a la página de Sloth. */
export function portalStripe(env: Env, cliente: string): Promise<{ url: string }> {
  return stripe(env, 'POST', '/v1/billing_portal/sessions', {
    customer: cliente,
    return_url: 'https://sloth.vancci.org',
    locale: 'es-419',
    ...(env.STRIPE_PORTAL && { configuration: env.STRIPE_PORTAL })
  })
}

export function suscripcionStripe(env: Env, id: string): Promise<SuscripcionStripe> {
  return stripe(env, 'GET', `/v1/subscriptions/${encodeURIComponent(id)}`)
}

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
    console.error('Stripe', metodo, ruta.replace(/\/\w+_\w{8,}/, '/…'), r.status, datos.error?.message ?? '')
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
