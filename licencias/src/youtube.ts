/**
 * La app de Google de Sloth para subir a YouTube, solo para quien apoya (`server/youtube.ts`, «Conectar canal» en
 * Opciones → YouTube). Su id (`YOUTUBE_CLIENT_ID`) no es secreto; su secreto (`YOUTUBE_CLIENT_SECRET`) vive solo aquí:
 * el repo es público, y las políticas de la API de YouTube piden no ponerlo en un proyecto abierto. La app arma la
 * autorización con el id, y le pide al cobro que canjee el código y, cada hora, que renueve el permiso. Antes de hablar
 * con Google se mira que quien pide apoye hoy (`apoya`, lo mismo que da la versión nueva antes) o sea el creador.
 * El cobro no guarda ningún token: pasa por aquí y vuelve a la app. Quien deja de apoyar ya no renueva el permiso; lo
 * que ya programó en YouTube sale igual, y puede seguir subiendo con su propia app de Google.
 *
 * La cuota de subidas (100 al día, de inicio) es del proyecto de Google entero: la comparten todos los que apoyan.
 */
import { apoya, cuerpo, delCreador, json, Rechazo, type Env } from './index.ts'

const TOKEN = 'https://oauth2.googleapis.com/token'
/** A dónde vuelve Google: el servidor de Sloth de la computadora que se conecta. */
const RETORNO = /^http:\/\/127\.0\.0\.1:\d{2,5}\/api\/youtube\/oauth$/
/** `randomBytes(32).toString('base64url')` en la app; RFC 7636 deja de 43 a 128. */
const VERIFICADOR = /^[\w-]{43,128}$/

export const SIN_APOYO_YOUTUBE = 'Conectar YouTube con la app de Sloth es para quienes apoyan a Sloth. Vuelve a apoyar, o conecta tu propia app de Google en Opciones → YouTube.'

export async function youtube(req: Request, env: Env, url: URL): Promise<Response> {
  const cliente = env.YOUTUBE_CLIENT_ID
  const secreto = env.YOUTUBE_CLIENT_SECRET
  const puede = async () => delCreador(req, env) || (await apoya(req, env))
  // Si la app ya está lista (sin sus dos secretos, Sloth sigue solo con la propia de cada quien), y si quien pregunta la puede usar.
  if (req.method === 'GET' && url.pathname === '/youtube') return json(cliente && secreto ? { cliente, apoya: await puede() } : {})
  if (req.method === 'POST' && url.pathname === '/youtube/token') {
    if (!cliente || !secreto) throw new Rechazo(503, 'La app de YouTube de Sloth todavía no está lista.')
    if (!(await puede())) throw new Rechazo(402, SIN_APOYO_YOUTUBE)
    const r = await fetch(TOKEN, { method: 'POST', body: paraGoogle(await cuerpo(req), cliente, secreto), signal: AbortSignal.timeout(20_000) })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    // Solo lo que la app usa. Un permiso que Google ya no da (`invalid_grant`) vuelve como error de Google, tal cual.
    const respuesta = Object.fromEntries(['access_token', 'expires_in', 'refresh_token', 'scope', 'error'].filter((k) => j[k] !== undefined).map((k) => [k, j[k]]))
    return json(respuesta, r.ok ? 200 : r.status < 500 ? 400 : 502, { 'cache-control': 'no-store' })
  }
  return json({ error: 'No existe' }, 404)
}

/** Lo que se manda a Google: canjear el código de la autorización (con su PKCE) o renovar el permiso. Nada más. */
export function paraGoogle(c: Record<string, unknown>, cliente: string, secreto: string): URLSearchParams {
  const texto = (v: unknown) => (typeof v === 'string' && v && v.length <= 2048 ? v : undefined)
  const refresh = texto(c.refresh)
  if (refresh) return new URLSearchParams({ client_id: cliente, client_secret: secreto, refresh_token: refresh, grant_type: 'refresh_token' })
  const code = texto(c.code)
  const verifier = texto(c.verifier)
  const retorno = texto(c.retorno)
  if (code && verifier && VERIFICADOR.test(verifier) && retorno && RETORNO.test(retorno))
    return new URLSearchParams({ client_id: cliente, client_secret: secreto, code, code_verifier: verifier, redirect_uri: retorno, grant_type: 'authorization_code' })
  throw new Rechazo(400, 'Petición inválida.')
}
