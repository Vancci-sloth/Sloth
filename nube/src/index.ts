/**
 * La nube de Sloth para las redes: guarda en R2 los videos que van a Instagram y los publica a su hora con el cron (cada
 * minuto), aunque la computadora esté apagada. Sloth le habla con `SECRETO`; Instagram solo ve `/v/<ref>.mp4`, una ruta
 * al azar que nadie más conoce. Ver `docs/adr/0003-instagram-por-su-api.md`.
 *
 * En el bucket: `videos/<ref>.mp4` (hasta que sale), `cola/<ref>.json` (lo que falta, con `cuando` y `estado` en sus
 * metadatos para no abrirlo en cada minuto; también lo que ya salió y aún tiene su video), `hechas/<ref>.json` (lo que
 * ya salió) y `privado/token.json`.
 */

interface Env {
  VIDEOS: R2Bucket
  SECRETO: string
  /** La dirección de este Worker, para darle a Instagram la del video. */
  ORIGEN: string
}

/** `espera` hasta `ANTES` de su hora; `procesando` mientras Instagram lo baja y lo prepara; luego `publicado` o `error`. */
interface Item {
  ref: string
  caption: string
  /** Milisegundos (`Date.now()`). */
  cuando: number
  estado: 'espera' | 'procesando' | 'publicado' | 'error'
  contenedor?: string
  media?: string
  error?: string
  /** Fallos pasajeros seguidos (la red, un 500): con `INTENTOS` pasa a `error`. */
  intentos?: number
}

const API = 'https://graph.instagram.com/v25.0'
/** Instagram tarda unos minutos en bajar y procesar el video: se le da con este margen antes de su hora. */
const ANTES = 20 * 60000
const DIA = 24 * 3600000
const INTENTOS = 5
const REF = /^[0-9a-f-]{36}$/

class Pasajero extends Error {}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    const [, que, ref] = url.pathname.split('/')
    const json = (datos: unknown, status = 200) => Response.json(datos, { status })

    // Lo que baja Instagram: sin secreto, pero solo con la ruta exacta.
    if (que === 'v' && (req.method === 'GET' || req.method === 'HEAD')) return servir(env, ref, req)
    if (!(await esSloth(req, env))) return json({ error: 'No' }, 401)

    try {
      // Con cuándo caduca el token (si Instagram lo dijo al renovarlo) y por qué falló la última renovación: Sloth avisa.
      if (que === 'cuenta' && req.method === 'GET') {
        const t = await vigente(env)
        return json({ cuenta: t ? `@${(await yo(t.token)).username}` : null, caduca: t?.caduca, renovacion: t?.error })
      }
      if (que === 'token' && req.method === 'PUT') {
        const { token } = await req.json<{ token: string }>()
        const cuenta = await yo(token).catch((e) => {
          throw new Error(`Instagram no aceptó ese token (${mensaje(e)}). Cópialo entero, sin espacios.`)
        })
        // Pedir el límite de publicaciones necesita el mismo permiso que publicar: así se sabe antes de la primera.
        await ig(`/${cuenta.user_id}/content_publishing_limit`, token).catch(() => {
          throw new Error('Ese token no tiene permiso para publicar. Genéralo con instagram_business_content_publish marcado.')
        })
        await env.VIDEOS.put('privado/token.json', JSON.stringify({ token, renovado: Date.now() } satisfies Token))
        return json({ cuenta: `@${cuenta.username}` })
      }
      if (que === 'token' && req.method === 'DELETE') {
        await env.VIDEOS.delete('privado/token.json')
        return json({ cuenta: null })
      }

      // El video se sube por partes: un Worker no recibe más de 100 MB de una vez.
      if (que === 'videos' && REF.test(ref)) {
        const key = `videos/${ref}.mp4`
        const subida = url.searchParams.get('subida')
        if (req.method === 'HEAD') return new Response(null, { status: (await env.VIDEOS.head(key)) ? 200 : 404 })
        if (req.method === 'POST' && !subida) return json({ subida: (await env.VIDEOS.createMultipartUpload(key, { httpMetadata: { contentType: 'video/mp4' } })).uploadId })
        if (req.method === 'PUT' && subida && req.body) {
          const parte = await env.VIDEOS.resumeMultipartUpload(key, subida).uploadPart(Number(url.searchParams.get('parte')), req.body)
          return json(parte)
        }
        if (req.method === 'POST' && subida) {
          const { partes } = await req.json<{ partes: R2UploadedPart[] }>()
          await env.VIDEOS.resumeMultipartUpload(key, subida).complete(partes)
          return json({ ok: true })
        }
      }

      // Dejar (o volver a dejar, si falló) un video con su texto y su hora. Lo que ya salió no se toca: vuelto a `espera`,
      // sin su `media`, el cron lo publicaría otra vez.
      if (que === 'publicaciones' && REF.test(ref) && req.method === 'PUT') {
        const { caption, cuando } = await req.json<{ caption: string; cuando: number }>()
        const previo = await (await env.VIDEOS.get(`cola/${ref}.json`))?.json<Item>()
        if (previo?.media || previo?.estado === 'publicado' || (await env.VIDEOS.head(`hechas/${ref}.json`))) return json({ publicado: true })
        if (!(await env.VIDEOS.head(`videos/${ref}.mp4`))) return json({ error: 'Ese video no está en la nube.' }, 409)
        await guardar(env, { ref, caption, cuando, estado: 'espera' })
        return json({ ok: true })
      }
      // Quitar uno que aún no sale: su video se borra con él.
      if (que === 'publicaciones' && REF.test(ref) && req.method === 'DELETE') {
        await env.VIDEOS.delete([`cola/${ref}.json`, `videos/${ref}.mp4`])
        return json({ ok: true })
      }
      if (que === 'publicaciones' && !ref && req.method === 'GET') {
        const items: Item[] = []
        for (const prefijo of ['cola/', 'hechas/'])
          for (const o of (await env.VIDEOS.list({ prefix: prefijo })).objects) {
            const item = await (await env.VIDEOS.get(o.key))?.json<Item>()
            if (item) items.push({ ...item, caption: item.caption.slice(0, 80) })
          }
        return json(items)
      }
    } catch (e) {
      return json({ error: mensaje(e) }, 400)
    }
    return json({ error: 'No existe' }, 404)
  },

  async scheduled(_evento, env): Promise<void> {
    const t = (await vigente(env))?.token
    const ahora = Date.now()
    for (const o of (await env.VIDEOS.list({ prefix: 'cola/', include: ['customMetadata'] })).objects) {
      const m = o.customMetadata ?? {}
      const cuando = Number(m.cuando)
      // Sin abrirlo: lo que ya falló, lo que aún no toca, y lo que Instagram procesa pero aún no es su hora.
      if (m.estado === 'error' || (m.estado === 'espera' && cuando - ANTES > ahora) || (m.estado === 'procesando' && cuando > ahora)) continue
      const item = await (await env.VIDEOS.get(o.key))?.json<Item>()
      if (!item) continue
      // Lo `publicado` que sigue en la cola ya salió y falta borrar su video: eso lo hace `guardar`, sin tocar Instagram.
      if (item.estado !== 'publicado')
        try {
          if (!t) throw new Error('Falta el token de Instagram: pégalo en Sloth, en ⚙ Opciones → Redes.')
          await avanzar(env, t, item)
          delete item.intentos
        } catch (e) {
          item.intentos = (item.intentos ?? 0) + 1
          if (!(e instanceof Pasajero) || item.intentos >= INTENTOS) Object.assign(item, { estado: 'error', error: mensaje(e) })
        }
      await guardar(env, item)
    }
  }
} satisfies ExportedHandler<Env>

/** Un paso: darle el video a Instagram; cuando lo tiene listo y llegó la hora, publicarlo. El video lo borra `guardar`. */
async function avanzar(env: Env, t: string, item: Item) {
  const cuenta = await yo(t)
  if (item.estado === 'espera') {
    const { id } = await ig<{ id: string }>(`/${cuenta.user_id}/media`, t, {
      media_type: 'REELS',
      video_url: `${env.ORIGEN}/v/${item.ref}.mp4`,
      caption: item.caption,
      share_to_feed: 'true'
    })
    Object.assign(item, { estado: 'procesando', contenedor: id })
    return
  }
  if (item.estado !== 'procesando' || item.cuando > Date.now()) return
  const c = await ig<{ status_code: string; status?: string }>(`/${item.contenedor}?fields=status_code,status`, t)
  if (c.status_code === 'IN_PROGRESS') return
  if (c.status_code === 'ERROR' || c.status_code === 'EXPIRED') throw new Error(`Instagram no pudo procesar el video: ${c.status ?? c.status_code}`)
  // Si ya salió (un minuto anterior publicó y no alcanzó a guardarlo), no se publica otra vez.
  if (c.status_code !== 'PUBLISHED') item.media = (await ig<{ id: string }>(`/${cuenta.user_id}/media_publish`, t, { creation_id: item.contenedor! })).id
  item.estado = 'publicado'
}

/**
 * Guarda el item donde va según su estado, con `cuando` y `estado` a la vista en los metadatos. Lo que salió pasa a
 * `hechas/` con su video ya borrado. Si borrarlo falla, lo publicado no se deshace: sigue en la cola como `publicado`, y el
 * minuto siguiente lo vuelve a intentar.
 */
async function guardar(env: Env, item: Item) {
  const hecho = item.estado === 'publicado' && (await env.VIDEOS.delete(`videos/${item.ref}.mp4`).then(() => true, () => false))
  await env.VIDEOS.put(`${hecho ? 'hechas' : 'cola'}/${item.ref}.json`, JSON.stringify(item), {
    customMetadata: { cuando: String(item.cuando), estado: item.estado }
  })
  if (hecho) await env.VIDEOS.delete(`cola/${item.ref}.json`)
}

/** El video para Instagram, con rangos (lo baja por partes). */
async function servir(env: Env, archivo: string | undefined, req: Request): Promise<Response> {
  const ref = archivo?.replace(/\.mp4$/, '')
  if (!ref || !REF.test(ref)) return new Response('No existe', { status: 404 })
  const o = await env.VIDEOS.get(`videos/${ref}.mp4`, { range: req.headers })
  if (!o) return new Response('No existe', { status: 404 })
  const headers = new Headers({ 'content-type': 'video/mp4', 'accept-ranges': 'bytes', etag: o.httpEtag })
  const r = o.range as { offset?: number; length?: number; suffix?: number } | undefined
  let status = 200
  if (req.headers.has('range') && r) {
    const desde = r.suffix !== undefined ? o.size - r.suffix : (r.offset ?? 0)
    const largo = r.suffix ?? r.length ?? o.size - desde
    headers.set('content-range', `bytes ${desde}-${desde + largo - 1}/${o.size}`)
    headers.set('content-length', String(largo))
    status = 206
  } else headers.set('content-length', String(o.size))
  return new Response(req.method === 'HEAD' ? null : o.body, { status, headers })
}

/**
 * El token de Instagram en `privado/token.json`. `renovado` es la última renovación buena; `caduca`, cuándo vence, si
 * Instagram lo dijo. Tras una renovación fallida: cuántas van seguidas (`fallos`), por qué (`error`) y cuándo se vuelve a
 * intentar (`reintento`).
 */
interface Token {
  token: string
  renovado: number
  caduca?: number
  fallos?: number
  error?: string
  reintento?: number
}

/**
 * El token, renovado una vez al día: cada renovación le da otros 60 días, así que no caduca mientras el cron corra. Solo
 * cuenta como renovado si Instagram dio un token nuevo. Si falla, el de antes sigue sirviendo hasta que caduque, y se
 * vuelve a intentar en 5 minutos, luego 10, 20… hasta cada 6 horas: ni un día perdido ni una llamada cada minuto.
 */
async function vigente(env: Env): Promise<Token | null> {
  const guardado = await (await env.VIDEOS.get('privado/token.json'))?.json<Token>()
  const ahora = Date.now()
  if (!guardado || ahora - guardado.renovado < DIA || (guardado.reintento ?? 0) > ahora) return guardado ?? null
  type Respuesta = { access_token?: string; expires_in?: number; error?: { message?: string } }
  const r: Respuesta = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(guardado.token)}`).then(
    (x) => x.json<Respuesta>().catch(() => ({ error: { message: `respondió ${x.status}` } })),
    (e) => ({ error: { message: `no llegué (${mensaje(e)})` } })
  )
  let nuevo: Token
  if (typeof r.access_token === 'string' && r.access_token) {
    nuevo = { token: r.access_token, renovado: ahora, ...(r.expires_in ? { caduca: ahora + r.expires_in * 1000 } : {}) }
  } else {
    const fallos = (guardado.fallos ?? 0) + 1
    const espera = Math.min(6 * 3600000, 5 * 60000 * 2 ** (fallos - 1))
    nuevo = { ...guardado, fallos, error: `Instagram no renovó el token: ${r.error?.message ?? 'respondió sin token'}`, reintento: ahora + espera }
  }
  await env.VIDEOS.put('privado/token.json', JSON.stringify(nuevo))
  return nuevo
}

const yo = (t: string) => ig<{ user_id: string; username: string }>('/me?fields=user_id,username', t)

async function ig<T = unknown>(ruta: string, token: string, datos?: Record<string, string>): Promise<T> {
  const headers = { authorization: `Bearer ${token}` }
  const res = await fetch(`${API}${ruta}`, datos ? { method: 'POST', headers, body: new URLSearchParams(datos) } : { headers }).catch((e) => {
    throw new Pasajero(`No llegué a Instagram: ${mensaje(e)}`)
  })
  const json = await res.json<{ error?: { message?: string; error_user_msg?: string; is_transient?: boolean } }>().catch(() => ({ error: undefined }))
  if (res.ok && !json.error) return json as T
  const texto = `Instagram: ${json.error?.error_user_msg ?? json.error?.message ?? `respondió ${res.status}`}`
  throw res.status >= 500 || json.error?.is_transient ? new Pasajero(texto) : new Error(texto)
}

async function esSloth(req: Request, env: Env) {
  // Sin el secreto puesto, nadie pasa: si no, `Bearer undefined` abriría la puerta.
  if (!env.SECRETO) return false
  const dado = new TextEncoder().encode(req.headers.get('authorization') ?? '')
  const esperado = new TextEncoder().encode(`Bearer ${env.SECRETO}`)
  return dado.byteLength === esperado.byteLength && crypto.subtle.timingSafeEqual(dado, esperado)
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))
