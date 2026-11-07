import { mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, extname } from 'node:path'
import { guardar } from '../disco.ts'

/**
 * HeyGen por su API oficial v3 (https://developers.heygen.com), con la llave del usuario en `X-Api-Key`. Lo que gasta
 * cada llamada son créditos del plan de API de HeyGen (precios en platform.heygen.com/pricing): listar avatares y voces,
 * y sondear un video, no cuestan; crear un video, sí. Por eso `generar` solo se llama cuando alguien lo pide (el agente o
 * el botón), nunca para probar. Para Avatar IV el video dura lo que dure el audio (hasta 30 minutos).
 */
const API = 'https://api.heygen.com'

type F = typeof fetch

export interface AvatarHeygen {
  /** El `avatar_id` que se pasa a crear el video: el de un look. */
  id: string
  nombre: string
  grupo?: string
  propio: boolean
  vista?: string
}

export interface VozHeygen {
  id: string
  nombre: string
  idioma: string
  tipo: string
}

export interface EstadoVideoHeygen {
  id: string
  estado: 'espera' | 'procesando' | 'lista' | 'error'
  url?: string
  duracion?: number
  error?: string
}

async function pedir<T = any>(f: F, llave: string, ruta: string, init: RequestInit = {}): Promise<T> {
  const r = await f(`${API}${ruta}`, { ...init, headers: { 'X-Api-Key': llave, ...(init.headers ?? {}) } })
  const json = (await r.json().catch(() => null)) as { data?: unknown; error?: { message?: string; code?: string } | string; message?: string } | null
  if (r.ok) return (json?.data ?? json) as T
  const motivo = typeof json?.error === 'string' ? json.error : (json?.error?.message ?? json?.message)
  if (r.status === 401 || r.status === 403) throw new Error(`HeyGen no aceptó esa llave${motivo ? `: ${motivo}` : '.'} Genérala en platform.heygen.com/api-keys.`)
  if (r.status === 402 || /credit/i.test(motivo ?? '')) throw new Error(`A tu cuenta de HeyGen le faltan créditos${motivo ? ` (${motivo})` : ''}. Sloth no compra nada: recárgalos tú o usa otro motor.`)
  if (r.status === 429) throw new Error('HeyGen pide esperar (límite de pedidos). Vuelve a intentarlo en un minuto.')
  throw new Error(`HeyGen respondió ${r.status}${motivo ? `: ${motivo}` : ''}.`)
}

/** Prueba la llave con `GET /v3/users/me` (gratis) y dice a nombre de quién está. */
export async function probar(llave: string, f: F = fetch): Promise<{ usuario: string; plan?: string }> {
  const d = await pedir<{ email?: string; username?: string; first_name?: string; plan?: string; tier?: string }>(f, llave, '/v3/users/me')
  return { usuario: d.email ?? d.username ?? d.first_name ?? 'cuenta de HeyGen', plan: d.plan ?? d.tier }
}

/** Todas las páginas de una lista de HeyGen (cursor `next_token`), hasta `tope` elementos. */
async function paginar<T>(f: F, llave: string, ruta: string, tope = 200): Promise<T[]> {
  const todo: T[] = []
  let token = ''
  do {
    const sep = ruta.includes('?') ? '&' : '?'
    const r = await f(`${API}${ruta}${sep}limit=50${token ? `&token=${encodeURIComponent(token)}` : ''}`, { headers: { 'X-Api-Key': llave } })
    const json = (await r.json().catch(() => null)) as { data?: T[]; has_more?: boolean; next_token?: string | null; error?: { message?: string } | string } | null
    if (!r.ok) {
      const m = typeof json?.error === 'string' ? json.error : json?.error?.message
      if (r.status === 401 || r.status === 403) throw new Error('HeyGen no aceptó esa llave.')
      throw new Error(`HeyGen respondió ${r.status}${m ? `: ${m}` : ''}.`)
    }
    todo.push(...(json?.data ?? []))
    token = json?.has_more && json.next_token ? json.next_token : ''
  } while (token && todo.length < tope)
  return todo.slice(0, tope)
}

/** Los avatares (looks) de la cuenta: primero los propios (gemelos digitales, fotos) y luego los públicos. */
export async function listarAvatares(llave: string, f: F = fetch, publicos = true): Promise<AvatarHeygen[]> {
  type Look = { id?: string; avatar_id?: string; name?: string; avatar_name?: string; group_name?: string; preview_image_url?: string | null; ownership?: string }
  const propios = await paginar<Look>(f, llave, '/v3/avatars/looks?ownership=private')
  const abiertos = publicos ? await paginar<Look>(f, llave, '/v3/avatars/looks?ownership=public', 60).catch(() => []) : []
  const de = (l: Look, propio: boolean): AvatarHeygen => ({ id: (l.id ?? l.avatar_id) as string, nombre: l.name ?? l.avatar_name ?? (l.id ?? l.avatar_id) as string, grupo: l.group_name, propio, vista: l.preview_image_url ?? undefined })
  return [...propios.map((l) => de(l, true)), ...abiertos.map((l) => de(l, false))].filter((a) => a.id)
}

/** Las voces. `idioma`, como lo escribe HeyGen («Spanish»). `propias`: solo tus clones. */
export async function listarVoces(llave: string, f: F = fetch, opts: { idioma?: string; propias?: boolean } = {}): Promise<VozHeygen[]> {
  type V = { voice_id: string; name: string; language?: string; type?: string }
  const q = new URLSearchParams({ type: opts.propias ? 'private' : 'public', ...(opts.idioma ? { language: opts.idioma } : {}) })
  return (await paginar<V>(f, llave, `/v3/voices?${q}`, 150)).map((v) => ({ id: v.voice_id, nombre: v.name, idioma: v.language ?? '', tipo: v.type ?? 'public' }))
}

const TIPOS: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4' }

/** Sube un archivo (hasta 32 MB) a HeyGen y devuelve su `asset_id`. */
export async function subirAsset(llave: string, ruta: string, f: F = fetch): Promise<string> {
  const tipo = TIPOS[extname(ruta).toLowerCase()]
  if (!tipo) throw new Error(`HeyGen solo acepta mp3, wav, png, jpg o mp4; ${basename(ruta)} no.`)
  const bytes = readFileSync(ruta)
  if (bytes.length > 32 * 1024 * 1024) throw new Error('HeyGen acepta hasta 32 MB por este camino; recorta o comprime el archivo.')
  const forma = new FormData()
  forma.append('file', new Blob([bytes], { type: tipo }), basename(ruta))
  const d = await pedir<{ asset_id: string }>(f, llave, '/v3/assets', { method: 'POST', body: forma })
  if (!d.asset_id) throw new Error('HeyGen no dio el id del archivo subido.')
  return d.asset_id
}

export interface PedidoVideo {
  avatar: string
  /** Un audio propio (mp3 o wav): el avatar lo dice con sus labios. */
  audio?: string
  /** O el guion con una voz de HeyGen (`voz`). */
  guion?: string
  voz?: string
  titulo?: string
  /** `9:16` para vertical, `16:9` para horizontal. */
  formato?: '9:16' | '16:9'
}

/** Pide el video. GASTA CRÉDITOS de HeyGen. Devuelve el id para sondearlo. */
export async function crearVideo(llave: string, p: PedidoVideo, f: F = fetch): Promise<string> {
  if (!p.audio && !(p.guion && p.voz)) throw new Error('Pasa un audio, o un guion con la voz de HeyGen que lo dice.')
  const audio = p.audio ? { audio_asset_id: await subirAsset(llave, p.audio, f) } : { script: p.guion, voice_id: p.voz }
  const d = await pedir<{ video_id: string }>(f, llave, '/v3/videos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'avatar', avatar_id: p.avatar, ...audio, title: p.titulo ?? 'Sloth', aspect_ratio: p.formato ?? '9:16', resolution: '1080p' })
  })
  if (!d.video_id) throw new Error('HeyGen no dio el id del video.')
  return d.video_id
}

const ESTADOS: Record<string, EstadoVideoHeygen['estado']> = { waiting: 'espera', pending: 'espera', processing: 'procesando', generating: 'procesando', completed: 'lista', failed: 'error' }

/** El estado de un video (gratis). */
export async function estadoVideo(llave: string, id: string, f: F = fetch): Promise<EstadoVideoHeygen> {
  const d = await pedir<{ id?: string; status?: string; video_url?: string | null; duration?: number; failure_message?: string; error?: { message?: string } | string }>(f, llave, `/v3/videos/${encodeURIComponent(id)}`)
  const estado = ESTADOS[d.status ?? ''] ?? 'procesando'
  const error = typeof d.error === 'string' ? d.error : (d.error?.message ?? d.failure_message)
  return { id, estado, url: d.video_url ?? undefined, duracion: d.duration, ...(estado === 'error' ? { error: error ?? 'HeyGen no pudo hacer el video.' } : {}) }
}

/** Baja el MP4 terminado a `salida`. */
export async function bajarVideo(url: string, salida: string, f: F = fetch): Promise<string> {
  const r = await f(url)
  if (!r.ok) throw new Error(`No se pudo bajar el video de HeyGen (${r.status}).`)
  mkdirSync(dirname(salida), { recursive: true })
  guardar(salida, Buffer.from(await r.arrayBuffer()))
  return salida
}
