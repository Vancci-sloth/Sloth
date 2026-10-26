// Deja listo el cobro con Stripe (`licencias/src/stripe.ts`) con una sola cosa: la llave secreta de la cuenta, que se
// pega aquí sin que se vea. Activa las tarjetas, Apple Pay, Google Pay y Link; crea el webhook del cobro (y borra uno
// anterior con la misma dirección, porque su secreto ya no se puede leer) y el portal del cliente (cambiar la tarjeta y
// ver recibos); enciende Stripe Tax si ya está activo en la cuenta, y guarda todo en el Worker (STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET, STRIPE_PORTAL, STRIPE_IMPUESTOS). Lo que solo se ajusta en el panel lo dice al final. Con una llave `sk_test_` queda en modo de prueba; se vuelve a correr con la `sk_live_`.
// Uso: `npm run stripe`.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const ORIGEN = 'https://api.sloth.vancci.org'
const WEBHOOK = `${ORIGEN}/webhook/stripe`
/** Así se reconoce el webhook del cobro, también uno de otra dirección (la de workers.dev de antes): un solo webhook basta. */
const DESCRIPCION = 'Cobro de Sloth (licencias)'
const EVENTOS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']
const MEDIOS = ['card', 'apple_pay', 'google_pay', 'link']

/** Lo que se escribe no se ve en la consola. */
function preguntarOculto(pregunta) {
  return new Promise((listo) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    process.stdout.write(pregunta)
    rl._writeToOutput = () => {}
    rl.question('', (r) => (rl.close(), process.stdout.write('\n'), listo(r.trim())))
  })
}

async function stripe(llave, metodo, ruta, formulario) {
  const r = await fetch(`https://api.stripe.com${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${llave}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: formulario && new URLSearchParams(formulario)
  })
  const datos = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Stripe (${metodo} ${ruta}): ${datos.error?.message ?? r.status}`)
  return datos
}

/** `npm run licencias -- secret put NOMBRE`, con el valor por la entrada: así no queda en ningún comando. */
function guardarSecreto(nombre, valor) {
  return new Promise((listo, falla) => {
    const p = spawn(process.execPath, [join(import.meta.dirname, 'nube.mjs'), '--licencias', 'secret', 'put', nombre], { stdio: ['pipe', 'inherit', 'inherit'] })
    p.stdin.end(valor)
    p.on('exit', (code) => (code === 0 ? listo() : falla(new Error(`No se pudo guardar ${nombre} en el Worker.`))))
  })
}

// Un error se dice en una línea y sale con código 1, sin la traza.
process.on('uncaughtException', (e) => (console.error(`\n${e.message}`), (process.exitCode = 1)))

const llave = process.env.STRIPE_SECRET_KEY || (await preguntarOculto('Pega la clave secreta de Stripe (sk_live_… o sk_test_…) y pulsa Enter: '))
if (!/^[sr]k_(live|test)_\w+$/.test(llave)) throw new Error('Eso no parece una clave secreta de Stripe: empieza con sk_live_ o sk_test_.')
const prueba = llave.includes('_test_')

const cuenta = await stripe(llave, 'GET', '/v1/account')
console.log(`Cuenta: ${cuenta.settings?.dashboard?.display_name ?? cuenta.business_profile?.name ?? ''} (${cuenta.id}), ${prueba ? 'modo de prueba' : 'cobros de verdad'}.`)
if (!prueba && !cuenta.charges_enabled) console.warn('Ojo: Stripe todavía no deja cobrar con esta cuenta (falta verificarla en su panel).')

// Los medios de pago de la configuración por defecto, la que usa Checkout cuando no se le dice cuáles.
const { data: configuraciones } = await stripe(llave, 'GET', '/v1/payment_method_configurations?limit=100')
const base = configuraciones.find((c) => c.is_default && !c.parent) ?? configuraciones.find((c) => c.is_default)
// Uno que la cuenta no puede activar (Stripe dice por qué) no detiene lo demás.
for (const m of base ? MEDIOS : []) {
  await stripe(llave, 'POST', `/v1/payment_method_configurations/${base.id}`, { [`${m}[display_preference][preference]`]: 'on' })
    .then(() => console.log(`Activo: ${m}`))
    .catch((e) => console.warn(`No se activó ${m}: ${e.message}`))
}
if (!base) console.warn('No encontré la configuración de medios de pago: se quedan los que ya tenga la cuenta.')

const { data: webhooks } = await stripe(llave, 'GET', '/v1/webhook_endpoints?limit=100')
for (const w of webhooks.filter((w) => w.url === WEBHOOK || w.description === DESCRIPCION)) await stripe(llave, 'DELETE', `/v1/webhook_endpoints/${w.id}`)
const webhook = await stripe(llave, 'POST', '/v1/webhook_endpoints', {
  url: WEBHOOK,
  description: DESCRIPCION,
  ...Object.fromEntries(EVENTOS.map((e, i) => [`enabled_events[${i}]`, e]))
})
console.log(`Webhook creado: ${WEBHOOK}`)

// El portal del cliente: cambiar la tarjeta y ver sus recibos. Cancelar va desde Sloth, que da el folio.
const portal = {
  'business_profile[headline]': 'Sloth: tu suscripción',
  'business_profile[privacy_policy_url]': 'https://sloth.vancci.org/privacidad',
  'business_profile[terms_of_service_url]': 'https://sloth.vancci.org/terminos',
  default_return_url: 'https://sloth.vancci.org',
  'features[payment_method_update][enabled]': 'true',
  'features[invoice_history][enabled]': 'true',
  'features[customer_update][enabled]': 'false',
  'features[subscription_cancel][enabled]': 'false',
  'features[subscription_update][enabled]': 'false',
  'metadata[sloth]': '1'
}
const { data: portales } = await stripe(llave, 'GET', '/v1/billing_portal/configurations?limit=100')
const previo = portales.find((p) => p.metadata?.sloth === '1')
const { id: portalId } = await stripe(llave, 'POST', `/v1/billing_portal/configurations${previo ? `/${previo.id}` : ''}`, portal)
console.log('Portal del cliente listo: cambiar la tarjeta y ver recibos.')

// Stripe Tax: con la cuenta activa (domicilio fiscal y registro en México, desde su panel), el IVA se desglosa en el recibo.
const impuestos = await stripe(llave, 'GET', '/v1/tax/settings').catch(() => ({}))
const conImpuestos = impuestos.status === 'active'
if (conImpuestos) {
  const { data: registros } = await stripe(llave, 'GET', '/v1/tax/registrations?status=active&limit=100')
  console.log('Stripe Tax: activo.')
  if (!registros.some((r) => r.country === 'MX')) console.warn('Ojo: falta el registro de México en Stripe Tax (Tax → Registros): sin él, no desglosa el IVA.')
} else console.log('Stripe Tax: todavía no está activo en la cuenta. Se cobra igual, sin desglosar el IVA.')

await guardarSecreto('STRIPE_SECRET_KEY', llave)
await guardarSecreto('STRIPE_WEBHOOK_SECRET', webhook.secret)
await guardarSecreto('STRIPE_PORTAL', portalId)
await guardarSecreto('STRIPE_IMPUESTOS', conImpuestos ? '1' : '0')

// Los secretos tardan unos segundos en llegar al Worker.
let listo = false
for (let i = 0; i < 10 && !listo; i++) {
  listo = (await fetch(`${ORIGEN}/precio`).then((r) => r.json()).catch(() => ({}))).stripe === true
  if (!listo) await new Promise((r) => setTimeout(r, 3000))
}
if (listo) console.log(`\nListo: sloth.vancci.org ya ofrece pagar con Stripe${prueba ? ' (en modo de prueba: paga con la tarjeta 4242 4242 4242 4242)' : ''}.`)
else console.warn('\nLos secretos se guardaron, pero el cobro todavía no dice que tenga Stripe. Revisa en un minuto.')

// Lo que la API de Stripe no deja cambiar.
const panel = `https://dashboard.stripe.com${prueba ? '/test' : ''}`
console.log(`
Falta en el panel de Stripe (una vez):
  - Reintentos de cobros fallidos y su correo con el enlace para cambiar la tarjeta: ${panel}/revenue_recovery/retries
  - Recibos por correo de cada pago: ${panel}/settings/emails${conImpuestos ? '' : `
  - Stripe Tax (opcional, para desglosar el IVA): ${panel}/tax; luego vuelve a correr npm run stripe`}`)
