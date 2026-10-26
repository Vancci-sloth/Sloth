import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Investigacion } from '../shared/types.ts'
import type { ReferenciaYoutube } from '../shared/youtube.ts'
import { LARGO, MADURO, MIN_MUESTRA } from '../shared/ideas.ts'

/** Reutiliza Ideas y actualiza comparables con YouTube. Las vistas relativas siempre usan una muestra del propio canal. */
export type ApiPublicaYoutube = (recurso: string, params: Record<string, string>) => Promise<unknown>
const palabras = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z0-9]{3,}/g) ?? [])
const mediana = (xs: number[]) => { const ns = [...xs].sort((a, b) => a - b); return ns.length ? (ns[Math.floor((ns.length - 1) / 2)] + ns[Math.floor(ns.length / 2)]) / 2 : 0 }
const segundos = (iso: string) => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso); return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0 }
type VideoApi = { id: string; snippet: { title: string; channelTitle: string; channelId: string; publishedAt: string; description?: string; liveBroadcastContent?: string; thumbnails?: Record<string, { url: string }> }; statistics: { viewCount?: string }; contentDetails: { duration: string } }

export function referenciasGuardadas(app: string, tema: string): ReferenciaYoutube[] {
  const terminos = palabras(tema)
  const todas = new Map<string, ReferenciaYoutube & { puntos: number }>()
  try {
    for (const dir of readdirSync(join(app, 'trabajo', 'ideas'), { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('.')) continue
      let inv: Investigacion
      try { inv = JSON.parse(readFileSync(join(app, 'trabajo', 'ideas', dir.name, 'investigacion.json'), 'utf8')) } catch { continue }
      for (const v of inv.videos ?? []) {
        if (v.red || !/^[\w-]{11}$/.test(v.id) || (v.segundos ?? 0) < LARGO) continue
        const contenido = palabras(`${v.titulo} ${v.gancho ?? ''}`)
        const puntos = [...terminos].filter((p) => contenido.has(p)).length
        if (!puntos) continue
        const canal = inv.canales.find((c) => c.id === v.canalId)
        const x = canal && canal.videos >= MIN_MUESTRA && canal.mediana > 0 ? v.vistas / canal.mediana : undefined
        const antes = todas.get(v.id)
        let transcripcion: string | undefined
        try { transcripcion = (JSON.parse(readFileSync(join(app, 'trabajo', 'ideas', dir.name, 'transcripciones', `${v.id}.json`), 'utf8')) as { texto?: string }).texto?.slice(0, 6000) } catch {}
        if (!antes || (v.leido ?? v.visto) > antes.leido) todas.set(v.id, { id: v.id, titulo: v.titulo, canal: v.canal, canalId: v.canalId, vistas: v.vistas, fecha: v.fecha, x, muestra: canal?.videos, transcripcion,
          origen: 'Ideas', leido: v.leido ?? v.visto, url: `https://www.youtube.com/watch?v=${v.id}`, puntos })
      }
    }
  } catch { /* Todavía puede no haber investigación guardada. */ }
  return [...todas.values()].sort((a, b) => b.puntos - a.puntos || (b.x ?? 0) - (a.x ?? 0)).slice(0, 12).map(({ puntos, ...r }) => r)
}

export async function buscarReferenciasYoutube(app: string, consultas: string[], api: ApiPublicaYoutube): Promise<{ referencias: ReferenciaYoutube[]; limites: string[] }> {
  const guardadas = referenciasGuardadas(app, consultas.join(' '))
  const referencias = new Map(guardadas.map((v) => [v.id, v]))
  const ids = new Set<string>()
  const limites = ['Se comparan títulos, miniaturas, fechas y vistas. Las vistas no permiten atribuir el resultado al título o miniatura ni conocer su CTR.']
  for (const q of consultas.slice(0, 2)) {
    try {
      const resultado = await api('search', { part: 'snippet', type: 'video', q, maxResults: '12', relevanceLanguage: 'es', order: 'relevance' }) as { items?: { id?: { videoId?: string } }[] }
      for (const r of resultado.items ?? []) if (r.id?.videoId && /^[\w-]{11}$/.test(r.id.videoId)) ids.add(r.id.videoId)
    } catch { limites.push(`No se pudo actualizar la búsqueda «${q}». Se conserva la investigación disponible.`) }
  }
  let actuales: VideoApi[] = []
  if (ids.size) {
    try {
      const resultado = await api('videos', { part: 'snippet,statistics,contentDetails', id: [...ids].join(',') }) as { items?: VideoApi[] }
      actuales = (resultado.items ?? []).filter((v) => segundos(v.contentDetails.duration) >= LARGO && (!v.snippet.liveBroadcastContent || v.snippet.liveBroadcastContent === 'none'))
      for (const v of actuales) referencias.set(v.id, { id: v.id, titulo: v.snippet.title, canal: v.snippet.channelTitle, canalId: v.snippet.channelId, vistas: Number(v.statistics.viewCount) || 0,
        fecha: v.snippet.publishedAt.slice(0, 10), descripcion: v.snippet.description?.slice(0, 3000), transcripcion: referencias.get(v.id)?.transcripcion,
        miniaturaOrigen: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url, origen: 'YouTube', leido: Date.now(), url: `https://www.youtube.com/watch?v=${v.id}` })
    } catch { limites.push('No se pudieron actualizar las vistas de los resultados de búsqueda.') }
  }
  const canales = [...new Set(actuales.map((v) => v.snippet.channelId))].slice(0, 3)
  if (canales.length) {
    try {
      const canalesApi = await api('channels', { part: 'contentDetails', id: canales.join(',') }) as { items?: { id: string; contentDetails: { relatedPlaylists: { uploads: string } } }[] }
      for (const c of canalesApi.items ?? []) {
        try {
          const lista = await api('playlistItems', { part: 'contentDetails', playlistId: c.contentDetails.relatedPlaylists.uploads, maxResults: '40' }) as { items?: { contentDetails: { videoId: string } }[] }
          const idsCanal = (lista.items ?? []).map((v) => v.contentDetails.videoId)
          if (!idsCanal.length) continue
          const videos = await api('videos', { part: 'snippet,statistics,contentDetails', id: idsCanal.join(',') }) as { items?: VideoApi[] }
          const muestra = (videos.items ?? []).filter((v) => v.snippet.channelId === c.id && segundos(v.contentDetails.duration) >= LARGO && (!v.snippet.liveBroadcastContent || v.snippet.liveBroadcastContent === 'none') && Date.parse(v.snippet.publishedAt) < Date.now() - MADURO)
          for (const r of referencias.values()) if (r.canalId === c.id) {
            const otros = muestra.filter((v) => v.id !== r.id)
            const base = mediana(otros.map((v) => Number(v.statistics.viewCount) || 0))
            r.muestra = otros.length
            r.x = otros.length >= MIN_MUESTRA && base > 0 ? r.vistas / base : undefined
          }
        } catch { limites.push(`No se pudo medir una muestra del canal ${c.id}; no se presenta como outlier medido.`) }
      }
    } catch { limites.push('No se pudo obtener una muestra actual de los canales comparables.') }
  }
  if (!referencias.size) throw new Error('No se encontraron videos comparables con datos verificables. Investiga el tema en Ideas o ajusta el tema y reintenta.')
  const tema = palabras(consultas.join(' '))
  const relevancia = (r: ReferenciaYoutube) => [...palabras(r.titulo)].filter((p) => tema.has(p)).length + (r.origen === 'YouTube' ? 0.1 : 0)
  return { referencias: [...referencias.values()].sort((a, b) => relevancia(b) - relevancia(a)).slice(0, 12), limites: [...new Set(limites)] }
}
