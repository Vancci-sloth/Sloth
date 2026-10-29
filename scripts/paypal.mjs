// Deja listo el cobro con PayPal (`licencias/src/index.ts`) con dos cosas: el Client ID y el Secret de la app de PayPal
// (developer.paypal.com → Apps & Credentials), que se pegan aquí sin que se vean. Crea el webhook del cobro (o reusa el
// que ya tenga esa dirección) y guarda todo en el Worker (PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID). Con las
// llaves de Sandbox, el Worker debe tener `PAYPAL_MODO: "prueba"` (licencias/wrangler.jsonc); con las de Live, `produccion`.
// Uso: `npm run paypal`.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const WEBHOOK = 'https://api.sloth.vancci.org/webhook/paypal'
const API = { produccion: 'https://api-m.paypal.com', prueba: 'https://api-m.sandbox.paypal.com' }

/** Lo que se escribe no se ve en la consola. */
function preguntarOculto(pregunta) {
  return new Promise((listo) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    process.stdout.write(pregunta)
    rl._writeToOutput = () => {}
    rl.question('', (r) => (rl.close(), process.stdout.write('\n'), listo(r.trim())))
  })
}

/** El acceso con esas llaves en `modo`; `undefined` si no son de ese modo. */
async function acceso(modo, id, secreto) {
  const r = await fetch(`${API[modo]}/v1/oauth2/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${id}:${secreto}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  })
  return r.ok ? (await r.json()).access_token : undefined
}

async function paypal(modo, token, metodo, ruta, cuerpo) {
  const r = await fetch(`${API[modo]}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: cuerpo && JSON.stringify(cuerpo)
  })
  const datos = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`PayPal (${metodo} ${ruta}): ${datos.message ?? r.status}`)
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

const id = process.env.PAYPAL_CLIENT_ID || (await preguntarOculto('Pega el Client ID de tu app de PayPal y pulsa Enter: '))
const secreto = process.env.PAYPAL_SECRET || (await preguntarOculto('Pega su Secret y pulsa Enter: '))
let modo = 'produccion'
let token = await acceso(modo, id, secreto)
if (!token) token = await acceso((modo = 'prueba'), id, secreto)
if (!token) throw new Error('PayPal no aceptó esas llaves. Cópialas otra vez de developer.paypal.com → Apps & Credentials.')
console.log(modo === 'produccion' ? 'Llaves de Live: cobros de verdad.' : 'Llaves de Sandbox: modo de prueba.')

// Un webhook por dirección: si ya existe, se reusa (sus eventos se ponen en todos).
const { webhooks = [] } = await paypal(modo, token, 'GET', '/v1/notifications/webhooks')
let webhook = webhooks.find((w) => w.url === WEBHOOK)
if (webhook) await paypal(modo, token, 'PATCH', `/v1/notifications/webhooks/${webhook.id}`, [{ op: 'replace', path: '/event_types', value: [{ name: '*' }] }])
else webhook = await paypal(modo, token, 'POST', '/v1/notifications/webhooks', { url: WEBHOOK, event_types: [{ name: '*' }] })
console.log(`Webhook listo: ${WEBHOOK}`)

await guardarSecreto('PAYPAL_CLIENT_ID', id)
await guardarSecreto('PAYPAL_SECRET', secreto)
await guardarSecreto('PAYPAL_WEBHOOK_ID', webhook.id)

const config = readFileSync(join(import.meta.dirname, '..', 'licencias', 'wrangler.jsonc'), 'utf8')
const configurado = /"PAYPAL_MODO":\s*"(\w+)"/.exec(config)?.[1]
if (configurado !== modo) console.warn(`\nOjo: licencias/wrangler.jsonc dice PAYPAL_MODO "${configurado}" y estas llaves son de "${modo}". Cámbialo y despliega.`)
console.log('\nListo: las llaves de PayPal ya están en el Worker.')
