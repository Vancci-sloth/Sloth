import { open, stat } from 'node:fs/promises'
import type { DatosYoutube, EstadoSubidaYoutube } from '../shared/youtube.ts'

/**
 * Subida reanudable de YouTube: lee solo 8 MiB cada vez y guarda la sesión antes de mandar el archivo. Al reintentar,
 * pregunta cuántos bytes recibió Google (o si ya terminó), para no repetir videos cuando se pierde la última respuesta.
 * La URL de la sesión se queda en el servidor; la interfaz recibe solo el avance y el enlace del video terminado.
 */
export interface SubidaYoutube extends EstadoSubidaYoutube {
  url?: string
  datos: DatosYoutube
  ruta?: string
  cardId?: string
  huella?: string
  miniaturaPuesta?: boolean
}

const BLOQUE = 8 * 1024 * 1024

/**
 * Título, descripción e idioma. Los videos de Sloth van en español: sin decirlo, YouTube marcó su audio en inglés. Al
 * actualizar, lo que no se manda se borra, así que subir y programar usan esta misma forma.
 */
export const snippetYoutube = (d: DatosYoutube) => ({ title: d.titulo, description: d.descripcion, categoryId: '28', defaultLanguage: 'es', defaultAudioLanguage: 'es' })

export async function subirYoutube(ruta: string, subida: SubidaYoutube, token: () => Promise<string>, guardar: () => void) {
  const original = await stat(ruta)
  if (original.size !== subida.total) throw new Error('El tamaño del video cambió. Termina el render antes de subirlo.')
  if (subida.url && !sesionGoogle(subida.url)) throw new Error('La sesión de subida guardada no es válida.')
  const pedir = async (url: string, init: RequestInit) => fetch(url, {
    ...init, headers: { ...init.headers, authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(120_000)
  })
  const terminar = async (res: Response) => {
    const json = await res.json() as { id?: string }
    if (!json.id) throw new Error('YouTube no devolvió el enlace del video. Reintenta para comprobar la subida.')
    subida.id = json.id
    subida.enviados = subida.total
    subida.estado = 'terminado'
    delete subida.error
    delete subida.url
    guardar()
  }
  const avance = (res: Response) => {
    const rango = res.headers.get('range')
    if (rango && !/^bytes=0-\d+$/.test(rango)) throw new Error('YouTube devolvió un avance que no se pudo leer.')
    const enviados = rango ? Number(rango.split('-')[1]) + 1 : 0
    if (enviados > subida.total) throw new Error('YouTube devolvió un tamaño distinto al del archivo.')
    subida.enviados = enviados
    guardar()
  }
  const comprobar = async () => {
    const res = await pedir(subida.url!, { method: 'PUT', headers: { 'content-length': '0', 'content-range': `bytes */${subida.total}` } })
    if (res.ok) await terminar(res)
    else if (res.status === 308) avance(res)
    else if (res.status === 404 || res.status === 410) {
      delete subida.url
      subida.enviados = 0
      guardar()
      throw new Error('La sesión de subida venció. Pulsa «Reintentar» para iniciar otra.')
    } else throw await errorYoutube(res)
  }

  if (subida.url) {
    await comprobar()
    if (subida.estado === 'terminado') return
  } else {
    const d = subida.datos
    const res = await pedir('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(subida.total), 'x-upload-content-type': 'video/mp4' },
      body: JSON.stringify({ snippet: snippetYoutube(d), status: {
        privacyStatus: d.cuando ? 'private' : d.privacidad, selfDeclaredMadeForKids: d.infantil, containsSyntheticMedia: d.sintetico
      } })
    })
    if (!res.ok) throw await errorYoutube(res)
    const url = res.headers.get('location')
    // La sesión lleva la autorización: nunca se envía a otro dominio ni se expone en un error.
    if (!url || !sesionGoogle(url)) throw new Error('YouTube no devolvió una sesión de subida válida.')
    subida.url = url
    subida.enviados = 0
    guardar()
  }
  if (!sesionGoogle(subida.url!)) throw new Error('La sesión de subida guardada no es válida.')
  const archivo = await open(ruta, 'r')
  try {
    let fallos = 0
    while (subida.enviados < subida.total) {
      const actual = await archivo.stat()
      if (actual.size !== original.size || actual.mtimeMs !== original.mtimeMs) throw new Error('El video cambió mientras se subía. Termina el render antes de subirlo.')
      const desde = subida.enviados
      const bytes = Buffer.alloc(Math.min(BLOQUE, subida.total - desde))
      const { bytesRead } = await archivo.read(bytes, 0, bytes.length, desde)
      if (bytesRead !== bytes.length) throw new Error('El video cambió mientras se subía. Termina el render antes de subirlo.')
      let res: Response
      try {
        res = await pedir(subida.url!, { method: 'PUT', headers: {
          'content-type': 'video/mp4', 'content-length': String(bytes.length), 'content-range': `bytes ${desde}-${desde + bytes.length - 1}/${subida.total}`
        }, body: new Uint8Array(bytes) })
      } catch {
        if (++fallos > 3) throw new Error('Se cortó la conexión con YouTube. Puedes reintentar la subida desde donde quedó.')
        await comprobar()
        if (subida.estado === 'terminado') return
        continue
      }
      if (res.ok) return await terminar(res)
      if (res.status === 308) {
        avance(res)
        if (subida.enviados <= desde) throw new Error('YouTube no confirmó el último bloque. Reintenta la subida.')
        fallos = 0
      } else if (res.status === 429 || res.status >= 500) {
        if (++fallos > 3) throw await errorYoutube(res)
        await new Promise((r) => setTimeout(r, fallos * 1000))
        await comprobar()
        if (subida.estado === 'terminado') return
      } else throw await errorYoutube(res)
    }
    await comprobar()
    if (subida.estado !== 'terminado') throw new Error('YouTube todavía no confirmó el video. Reintenta para comprobarlo.')
  } finally {
    await archivo.close()
  }
}

function sesionGoogle(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'www.googleapis.com' && u.pathname === '/upload/youtube/v3/videos' && !u.username && !u.password
  } catch { return false }
}

/** Traduce fallos sin incluir URLs de sesión ni credenciales. */
export async function errorYoutube(res: Response): Promise<Error> {
  const json = await res.json().catch(() => null) as { error?: { errors?: { reason?: string }[] } } | null
  const motivo = json?.error?.errors?.[0]?.reason
  if (res.status === 401) return new Error('La autorización de YouTube caducó. Vuelve a conectar el canal en Opciones.')
  if (motivo === 'quotaExceeded' || motivo === 'uploadLimitExceeded') return new Error('YouTube alcanzó su límite de subidas. Reintenta más tarde.')
  if (motivo === 'youtubeSignupRequired') return new Error('Esta cuenta de Google todavía no tiene un canal de YouTube.')
  if (res.status === 403) return new Error('YouTube no permitió la subida. Revisa los permisos del canal y que YouTube Data API v3 esté activada en Google Cloud.')
  return new Error(`YouTube respondió ${res.status}${motivo && /^[a-zA-Z]+$/.test(motivo) ? ` (${motivo})` : ''}.`)
}
