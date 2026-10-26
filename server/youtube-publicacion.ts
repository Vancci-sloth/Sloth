import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { errorYoutube, snippetYoutube, type SubidaYoutube } from './youtube-subida.ts'

/**
 * Completa una publicación: primero pone la miniatura revisada, luego programa el video privado. Conserva el id y cada
 * paso confirmado: un fallo de miniatura o de fecha nunca vuelve a insertar el video. La fecha vencida deja el video
 * privado. En un reintento consulta a Google por si sí programó y solo se perdió la respuesta.
 */
export async function programarYoutube(subida: SubidaYoutube, token: () => Promise<string>, guardar: () => void) {
  if (!subida.id || !subida.datos.cuando || !subida.datos.miniatura) throw new Error('Faltan el video, la fecha o la miniatura de la publicación.')
  const pedir = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw await errorYoutube(res)
    return res
  }
  const id = encodeURIComponent(subida.id)
  const respuesta = await pedir(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${id}`)
  const actual = (await respuesta.json() as { items?: { status: { privacyStatus: string; publishAt?: string } }[] }).items?.[0]?.status
  if (!actual) throw new Error('El video subido ya no aparece en YouTube. Revísalo en Studio antes de reintentar.')
  if (subida.miniaturaPuesta && actual.publishAt && Date.parse(actual.publishAt) === Date.parse(subida.datos.cuando)) {
    subida.estado = 'programado'
    delete subida.error
    guardar()
    return
  }
  if (actual.privacyStatus !== 'private') throw new Error('El video ya es público o no listado. Revisa su publicación en YouTube Studio; Sloth no cambió su privacidad.')
  if (Date.parse(subida.datos.cuando) < Date.now() + 120_000) throw new Error('La fecha de publicación ya pasó o está demasiado cerca. El video sigue privado: elige otra fecha y reintenta.')
  if (!subida.miniaturaPuesta) {
    const imagen = await readFile(subida.datos.miniatura)
    if (createHash('sha256').update(imagen).digest('hex') !== subida.datos.huellaMiniatura) throw new Error('La miniatura cambió desde la revisión. Revísala otra vez antes de programar.')
    const mime = imagen[0] === 0x89 ? 'image/png' : 'image/jpeg'
    await pedir(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${id}&uploadType=media`, { method: 'POST', headers: { 'content-type': mime }, body: new Uint8Array(imagen) })
    subida.miniaturaPuesta = true
    guardar()
  }
  const d = subida.datos
  if (Date.parse(d.cuando!) < Date.now() + 120_000) throw new Error('La fecha quedó demasiado cerca durante la preparación. El video sigue privado: elige otra fecha.')
  const res = await pedir('https://www.googleapis.com/youtube/v3/videos?part=snippet,status', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: subida.id,
    snippet: snippetYoutube(d),
    status: { privacyStatus: 'private', publishAt: d.cuando, selfDeclaredMadeForKids: d.infantil, containsSyntheticMedia: d.sintetico }
  }) })
  const confirmado = await res.json() as { status?: { privacyStatus?: string; publishAt?: string } }
  if (confirmado.status?.privacyStatus !== 'private' || Date.parse(confirmado.status?.publishAt ?? '') !== Date.parse(d.cuando!))
    throw new Error('YouTube no confirmó la fecha de publicación. Reintenta para comprobar el resultado.')
  subida.estado = 'programado'
  delete subida.error
  guardar()
}
