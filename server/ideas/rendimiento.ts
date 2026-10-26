import type { Rendimiento, VideoPropio } from '../../shared/types.ts'
import { LARGO } from '../../shared/ideas.ts'

/**
 * Cómo le fue a tus videos largos, con la cuenta de YouTube que Sloth ya conectó para subir: vistas y likes de la API de
 * datos; retención, de dónde llegaron y qué buscaron, de YouTube Analytics (alcanza el permiso `youtube.readonly`). Las
 * impresiones y el % de clics no salen en ninguna API: los lee Claude en Studio y los deja en `studio.json`.
 */

/** Cuántos videos se miden, los más nuevos, y hasta cuánto atrás. */
const CUANTOS = 15
const DIAS = 90

type Fila = (string | number)[]
type Tabla = { rows?: Fila[]; error?: { message: string } }

const segundosDe = (d: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d) ?? []
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}
const dia = (t: number) => new Date(t).toISOString().slice(0, 10)
const redondo = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

export async function medirRendimiento(token: string): Promise<Rendimiento> {
  const headers = { authorization: `Bearer ${token}` }
  async function pedir<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
    const j = (await res.json()) as T & { error?: { message: string } }
    if (!res.ok) throw new Error(`YouTube: ${j.error?.message ?? res.status}`)
    return j
  }
  const datos = <T>(recurso: string, p: Record<string, string>) => pedir<T>(`https://www.googleapis.com/youtube/v3/${recurso}?${new URLSearchParams(p)}`)
  // Un reporte que YouTube no puede dar (un video sin datos todavía) no tumba los demás.
  const reporte = (p: Record<string, string>) =>
    pedir<Tabla>(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ids: 'channel==MINE', endDate: dia(Date.now()), ...p })}`).catch(() => ({ rows: [] }) as Tabla)

  const canal = (await datos<{ items?: { id: string; snippet: { title: string }; statistics: { subscriberCount?: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>('channels', { part: 'snippet,statistics,contentDetails', mine: 'true' })).items?.[0]
  if (!canal) throw new Error('La cuenta conectada no tiene canal de YouTube.')

  // Las subidas vienen de la más nueva a la más vieja: se lee hasta pasar los 90 días.
  const desde = Date.now() - DIAS * 864e5
  const ids: string[] = []
  let pagina: string | undefined
  do {
    const l = await datos<{ items: { contentDetails: { videoId: string; videoPublishedAt?: string } }[]; nextPageToken?: string }>('playlistItems', {
      part: 'contentDetails',
      playlistId: canal.contentDetails.relatedPlaylists.uploads,
      maxResults: '50',
      ...(pagina ? { pageToken: pagina } : {})
    })
    const nuevos = l.items.filter((i) => !i.contentDetails.videoPublishedAt || Date.parse(i.contentDetails.videoPublishedAt) >= desde)
    ids.push(...nuevos.map((i) => i.contentDetails.videoId))
    pagina = nuevos.length === l.items.length ? l.nextPageToken : undefined
  } while (pagina && ids.length < 150)

  type VideoApi = { id: string; snippet: { title: string; publishedAt: string }; statistics: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails: { duration: string }; status: { privacyStatus: string } }
  const crudos: VideoApi[] = []
  for (let i = 0; i < ids.length; i += 50) crudos.push(...((await datos<{ items?: VideoApi[] }>('videos', { part: 'snippet,statistics,contentDetails,status', id: ids.slice(i, i + 50).join(',') })).items ?? []))
  // Los largos que alguien vio: uno privado sin vistas es un borrador, no un video publicado.
  const videos: VideoPropio[] = crudos
    .map((v) => ({
      id: v.id,
      titulo: v.snippet.title.trim(),
      fecha: v.snippet.publishedAt,
      segundos: segundosDe(v.contentDetails.duration),
      ...(v.status.privacyStatus !== 'public' ? { privado: true } : {}),
      vistas: Number(v.statistics.viewCount ?? 0),
      likes: Number(v.statistics.likeCount ?? 0),
      comentarios: Number(v.statistics.commentCount ?? 0)
    }))
    .filter((v) => v.segundos >= LARGO && (!v.privado || v.vistas > 0))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, CUANTOS)
  if (!videos.length) return { medido: Date.now(), canal: { id: canal.id, nombre: canal.snippet.title, suscriptores: Number(canal.statistics.subscriberCount ?? 0) }, videos }

  const inicio = dia(Math.min(...videos.map((v) => Date.parse(v.fecha))))
  const general = await reporte({
    startDate: inicio,
    metrics: 'estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained',
    dimensions: 'video',
    filters: `video==${videos.map((v) => v.id).join(',')}`,
    maxResults: '50'
  })
  const porVideo = new Map(general.rows?.map((r) => [String(r[0]), r.slice(1).map(Number)]))
  await Promise.all(
    videos.map(async (v) => {
      const g = porVideo.get(v.id)
      if (!g) return
      Object.assign(v, { minutos: Math.round(g[0]), duracionMedia: Math.round(g[1]), visto: redondo(g[2]), suscriptores: g[3] })
      const filtro = `video==${v.id}`
      const [fuentes, retencion, busquedas] = await Promise.all([
        reporte({ startDate: inicio, metrics: 'views', dimensions: 'insightTrafficSourceType', filters: filtro, sort: '-views' }),
        reporte({ startDate: inicio, metrics: 'audienceWatchRatio', dimensions: 'elapsedVideoTimeRatio', filters: filtro }),
        reporte({ startDate: inicio, metrics: 'views', dimensions: 'insightTrafficSourceDetail', filters: `${filtro};insightTrafficSourceType==YT_SEARCH`, sort: '-views', maxResults: '5' })
      ])
      v.fuentes = (fuentes.rows ?? []).filter((r) => Number(r[1]) > 0).map((r) => [String(r[0]), Number(r[1])])
      v.busquedas = (busquedas.rows ?? []).map((r) => [String(r[0]), Number(r[1])])
      // La curva viene en 100 puntos (cada 1 % del video): el que cae más cerca de los 30 s y del minuto. Al principio
      // pasa del 100 % con quien regresa a verlo otra vez.
      const curva = (retencion.rows ?? []).map((r) => [Number(r[0]) * v.segundos, Number(r[1])] as const)
      const en = (s: number) => {
        if (!curva.length || s > v.segundos) return undefined
        const [, ratio] = curva.reduce((a, b) => (Math.abs(b[0] - s) < Math.abs(a[0] - s) ? b : a))
        return Math.round(Math.min(1, ratio) * 100)
      }
      v.a30 = en(30)
      v.a60 = en(60)
    })
  )

  // Quién te ve, en los últimos 28 días del canal.
  const hace28 = dia(Date.now() - 28 * 864e5)
  const [suscritos, paises, edades, dispositivos] = await Promise.all([
    reporte({ startDate: hace28, metrics: 'views', dimensions: 'subscribedStatus' }),
    reporte({ startDate: hace28, metrics: 'views', dimensions: 'country', sort: '-views' }),
    reporte({ startDate: hace28, metrics: 'viewerPercentage', dimensions: 'ageGroup,gender' }),
    reporte({ startDate: hace28, metrics: 'views', dimensions: 'deviceType', sort: '-views' })
  ])
  const total = (t: Tabla) => (t.rows ?? []).reduce((s, r) => s + Number(r.at(-1)), 0)
  const enPorcentaje = (t: Tabla) => (t.rows ?? []).map((r) => [String(r[0]), redondo((Number(r[1]) / Math.max(1, total(t))) * 100)] as [string, number])
  const subs = suscritos.rows?.find((r) => r[0] === 'SUBSCRIBED')
  return {
    medido: Date.now(),
    canal: { id: canal.id, nombre: canal.snippet.title, suscriptores: Number(canal.statistics.subscriberCount ?? 0) },
    videos,
    audiencia: {
      ...(subs ? { deSuscriptores: redondo((Number(subs[1]) / Math.max(1, total(suscritos))) * 100) } : {}),
      paises: enPorcentaje(paises).slice(0, 5),
      edades: (edades.rows ?? []).map((r) => [`${r[1] === 'male' ? 'Hombres' : r[1] === 'female' ? 'Mujeres' : 'Otros'} ${String(r[0]).replace('age', '')}`, redondo(Number(r[2]))]),
      dispositivos: enPorcentaje(dispositivos)
    }
  }
}
