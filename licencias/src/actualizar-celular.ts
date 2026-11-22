/**
 * Las actualizaciones de la app del celular sin bajar otra app (`expo-updates`, protocolo Expo Updates v1:
 * https://docs.expo.dev/technical-specs/expo-updates-1/). GitHub las arma y las firma con la llave de Sloth
 * (`movil/scripts/publicar-actualizacion.mjs`) y las sube con la llave de publicar; aquí solo se guardan y se sirven tal
 * cual, así que este Worker nunca tiene la llave que firma. La app no acepta nada que no venga firmado con ella.
 * - `GET /celular/actualizacion`: la última para la plataforma (`expo-platform`) y la versión nativa del celular
 *   (`expo-runtime-version`, la `version` de `movil/app.json`). Sin ninguna, o si ya es la que tiene, 204.
 * - `GET /celular/archivo/<llave>`: un archivo de una actualización (el código o una imagen). Nunca cambia.
 * - `PUT /celular/archivo/<llave>` y `PUT /celular/actualizacion/<plataforma>/<version>`: publicar (`PUBLICAR`).
 * En R2 (`DESCARGAS`): `celular/archivos/<llave>` y `celular/actualizaciones/<plataforma>/<version>.json`.
 */
import { conLlave, json, Rechazo, type Env } from './index.ts'

const PLATAFORMA = /^(android|ios)$/
const VERSION = /^[\w.-]{1,64}$/
/** La llave de cada archivo es el MD5 de su contenido, como la pone Metro. */
const LLAVE = /^[0-9a-f]{32}$/

interface Publicada {
  /** El manifiesto en texto, tal cual se firmó. */
  manifiesto: string
  /** `expo-signature`: `sig="…", keyid="main"`. */
  firma: string
}

const COMUNES = { 'expo-protocol-version': '1', 'expo-sfv-version': '0', 'cache-control': 'private, max-age=0' }
const ruta = (plataforma: string, version: string) => `celular/actualizaciones/${plataforma}/${version}.json`

export async function actualizarCelular(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.method === 'GET' && url.pathname === '/celular/actualizacion') return await ultima(req, env)
  const archivo = /^\/celular\/archivo\/([^/]+)$/.exec(url.pathname)?.[1]
  if (archivo !== undefined) {
    if (!LLAVE.test(archivo)) throw new Rechazo(404, 'No existe ese archivo.')
    if (req.method === 'GET') return await servir(env, archivo)
    if (req.method === 'PUT') return await subirArchivo(req, env, archivo)
  }
  const destino = /^\/celular\/actualizacion\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  if (req.method === 'PUT' && destino) return await publicar(req, env, destino[1], destino[2])
  throw new Rechazo(404, 'No existe.')
}

async function ultima(req: Request, env: Env): Promise<Response> {
  const plataforma = req.headers.get('expo-platform') ?? ''
  const version = req.headers.get('expo-runtime-version') ?? ''
  if (!PLATAFORMA.test(plataforma) || !VERSION.test(version)) return new Response('Falta la plataforma o la versión.', { status: 400, headers: COMUNES })
  const guardada = await env.DESCARGAS.get(ruta(plataforma, version))
  if (!guardada) return new Response(null, { status: 204, headers: COMUNES })
  const { manifiesto, firma } = await guardada.json<Publicada>()
  if (req.headers.get('expo-current-update-id') === (JSON.parse(manifiesto) as { id: string }).id) return new Response(null, { status: 204, headers: COMUNES })
  const limite = `sloth-${crypto.randomUUID()}`
  const cuerpo = [`--${limite}`, 'content-disposition: form-data; name="manifest"', 'content-type: application/json; charset=utf-8', `expo-signature: ${firma}`, '', manifiesto, `--${limite}--`, ''].join('\r\n')
  return new Response(cuerpo, { headers: { ...COMUNES, 'content-type': `multipart/mixed; boundary=${limite}` } })
}

async function servir(env: Env, llave: string): Promise<Response> {
  const obj = await env.DESCARGAS.get(`celular/archivos/${llave}`)
  if (!obj) throw new Rechazo(404, 'No existe ese archivo.')
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' }
  })
}

/** Un archivo ya subido no se toca: los celulares pueden estar bajándolo. */
async function subirArchivo(req: Request, env: Env, llave: string): Promise<Response> {
  if (!conLlave(req, env)) throw new Rechazo(401, 'No autorizado.')
  const nombre = `celular/archivos/${llave}`
  if (await env.DESCARGAS.head(nombre)) return json({ llave, nuevo: false })
  if (!req.body) throw new Rechazo(400, 'Falta el archivo.')
  await env.DESCARGAS.put(nombre, req.body, { httpMetadata: { contentType: req.headers.get('content-type') ?? 'application/octet-stream' } })
  return json({ llave, nuevo: true })
}

async function publicar(req: Request, env: Env, plataforma: string, version: string): Promise<Response> {
  if (!conLlave(req, env)) throw new Rechazo(401, 'No autorizado.')
  if (!PLATAFORMA.test(plataforma) || !VERSION.test(version)) throw new Rechazo(400, 'Plataforma o versión inválida.')
  const { manifiesto, firma } = (await req.json()) as Partial<Publicada>
  if (typeof manifiesto !== 'string' || typeof firma !== 'string' || !firma.startsWith('sig=')) throw new Rechazo(400, 'Falta el manifiesto o su firma.')
  const m = JSON.parse(manifiesto) as { id?: string; runtimeVersion?: string; launchAsset?: { key?: string } }
  if (!m.id || m.runtimeVersion !== version) throw new Rechazo(400, `El manifiesto es de la versión ${m.runtimeVersion}, no de la ${version}.`)
  // El código ya tiene que estar arriba: si no, los celulares bajarían una actualización a medias.
  if (!m.launchAsset?.key || !(await env.DESCARGAS.head(`celular/archivos/${m.launchAsset.key}`))) throw new Rechazo(409, 'Sube primero los archivos de la actualización.')
  await env.DESCARGAS.put(ruta(plataforma, version), JSON.stringify({ manifiesto, firma }), { httpMetadata: { contentType: 'application/json' } })
  return json({ id: m.id, plataforma, version })
}
