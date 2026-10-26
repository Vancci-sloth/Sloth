import { createHash, randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { escribir, leer } from '../opciones.ts'
import { NUBE, SECRETO } from './instagram.ts'

/**
 * La nube de quien usa Sloth, en su propia cuenta de Cloudflare: con un token suyo, Sloth monta ahí el Worker de `nube/`
 * (su bucket R2, el cron de cada minuto y su dirección en workers.dev) sin wrangler, y lo vuelve a subir cuando la app
 * trae otra versión (`nubeAlDia`). Así cada quien publica en Instagram con sus credenciales y su nube, sin pasar por la
 * del dueño. La del dueño se despliega con `npm run nube -- deploy` y no deja token aquí: esto no la toca.
 */

/** El token de Cloudflare con que se montó, y la versión del Worker que quedó arriba. */
const TOKEN = 'SLOTH_CLOUDFLARE_TOKEN'
const VERSION = 'SLOTH_NUBE_VERSION'
/** El Worker y su bucket, en la cuenta de quien la monta. */
const NOMBRE = 'sloth-redes'
const API = 'https://api.cloudflare.com/client/v4'

/** El Worker de `nube/` en un solo módulo: el compilador lo deja en `__NUBE__`; aquí, en el repo, se arma al pedirlo. */
declare const __NUBE__: string | undefined
const codigo = (): Promise<string> => (typeof __NUBE__ !== 'undefined' ? Promise.resolve(__NUBE__) : armar())
async function armar() {
  const { build } = await import('esbuild')
  const r = await build({ entryPoints: [join(import.meta.dirname, '..', '..', 'nube', 'src', 'index.ts')], bundle: true, format: 'esm', target: 'es2022', write: false, logLevel: 'silent' })
  return r.outputFiles[0].text
}
const version = (js: string) => createHash('sha256').update(js).digest('hex').slice(0, 12)

class Cloudflare extends Error {
  constructor(
    mensaje: string,
    readonly codigos: number[]
  ) {
    super(mensaje)
  }
}

async function cf<T>(token: string, metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, ...(cuerpo !== undefined && !(cuerpo instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
    body: cuerpo instanceof FormData ? cuerpo : cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
  }).catch((e) => {
    throw new Error(`No llegué a Cloudflare: ${e instanceof Error ? e.message : e}`)
  })
  const j = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { code: number; message: string }[] }
  if (!res.ok || j.success === false) {
    const errores = j.errors ?? []
    throw new Cloudflare(errores.map((e) => e.message).join(' · ') || `Cloudflare respondió ${res.status}`, errores.map((e) => e.code))
  }
  return j.result as T
}

/**
 * Monta (o pone al día) la nube en la cuenta del token y deja en las variables del usuario su dirección, el secreto que
 * comparte con Sloth y el token, para subirla otra vez con cada versión. Devuelve la dirección.
 */
export async function montarNube(token: string): Promise<string> {
  token = token.trim()
  // El mismo secreto si ya la habías montado: si no, Sloth y la nube dejarían de entenderse a mitad de una cola.
  const secreto = (leer(TOKEN) && leer(SECRETO)) || randomBytes(32).toString('base64url')
  const { url, js } = await desplegar(token, NOMBRE, secreto)
  escribir(TOKEN, token)
  escribir(SECRETO, secreto)
  escribir(NUBE, url)
  escribir(VERSION, version(js))
  // Cloudflare tarda en estrenar la dirección (unos 8 s; en una cuenta nueva, a veces minutos): hasta que responde,
  // Instagram no se puede conectar. Si tarda más, se sigue igual y el paso de Instagram lo dice.
  for (let hasta = Date.now() + 90_000; Date.now() < hasta; await new Promise((f) => setTimeout(f, 3000)))
    if ((await fetch(`${url}/cuenta`, { headers: { authorization: `Bearer ${secreto}` } }).catch(() => null))?.ok) break
  return url
}

/** Sube el Worker `nombre`, con su bucket del mismo nombre, a la cuenta del token. No guarda nada en esta computadora. */
export async function desplegar(token: string, nombre: string, secreto: string): Promise<{ url: string; js: string }> {
  const cuentas = await cf<{ id: string }[]>(token, 'GET', '/accounts').catch((e) => {
    throw new Error(e instanceof Cloudflare ? 'Cloudflare no aceptó ese token. Créalo con el enlace de Sloth y cópialo entero.' : e.message)
  })
  if (!cuentas.length) throw new Error('Ese token no tiene permiso sobre ninguna cuenta. Créalo otra vez con el enlace de Sloth.')
  const cuenta = `/accounts/${cuentas[0].id}`

  // El bucket: si ya existe (la montaste antes), sirve el mismo. Sin R2 activado, Cloudflare no deja crearlo.
  await cf(token, 'POST', `${cuenta}/r2/buckets`, { name: nombre }).catch((e) => {
    if (e instanceof Cloudflare && e.codigos.includes(10004)) return
    if (e instanceof Cloudflare && (e.codigos.includes(10042) || /enable r2/i.test(e.message)))
      throw new Error('Falta activar R2 en tu cuenta de Cloudflare (el paso 2). Actívalo y vuelve a pulsar «Montar».')
    throw new Error(`No pude crear el bucket R2: ${e.message}`)
  })

  // La dirección de la cuenta en workers.dev. Una cuenta nueva no la tiene: se le pone una al azar.
  let sub = await cf<{ subdomain?: string }>(token, 'GET', `${cuenta}/workers/subdomain`).then((r) => r.subdomain, () => undefined)
  if (!sub) sub = (await cf<{ subdomain: string }>(token, 'PUT', `${cuenta}/workers/subdomain`, { subdomain: `sloth-${randomBytes(4).toString('hex')}` })).subdomain
  const url = `https://${nombre}.${sub}.workers.dev`

  const js = await codigo()
  const forma = new FormData()
  forma.append(
    'metadata',
    new Blob(
      [
        JSON.stringify({
          main_module: 'index.js',
          compatibility_date: '2026-10-01',
          bindings: [
            { type: 'r2_bucket', name: 'VIDEOS', bucket_name: nombre },
            { type: 'secret_text', name: 'SECRETO', text: secreto },
            { type: 'plain_text', name: 'ORIGEN', text: url }
          ]
        })
      ],
      { type: 'application/json' }
    )
  )
  forma.append('index.js', new Blob([js], { type: 'application/javascript+module' }), 'index.js')
  await cf(token, 'PUT', `${cuenta}/workers/scripts/${nombre}`, forma)
  // Cada minuto, como en nube/wrangler.jsonc: así cada Reel sale en el minuto de su hora.
  await cf(token, 'PUT', `${cuenta}/workers/scripts/${nombre}/schedules`, [{ cron: '* * * * *' }])
  await cf(token, 'POST', `${cuenta}/workers/scripts/${nombre}/subdomain`, { enabled: true, previews_enabled: false })

  return { url, js }
}

/**
 * Al arrancar: si la nube es de las que monta Sloth y la app trae otro Worker, se sube el nuevo. La del dueño (sin token)
 * no se toca. Si falla, sigue la de antes, y se intenta en el siguiente arranque.
 */
export async function nubeAlDia() {
  const token = leer(TOKEN)
  if (!token || !leer(NUBE)) return
  if (leer(VERSION) === version(await codigo())) return
  await montarNube(token).catch((e) => console.error('redes: no pude poner al día tu nube de Cloudflare:', e instanceof Error ? e.message : e))
}

