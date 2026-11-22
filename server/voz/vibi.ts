import { setTimeout as esperar } from 'node:timers/promises'
import type { VozApi } from '../../shared/types.ts'
import { pcmDeMp3 } from './voices-cloning.ts'

export const VIBI = 'https://api.vibi.pro'
type Pedir = (ruta: string, datos?: { json?: unknown }) => Promise<Response>
const catalogos = [
  ['elevenlabs', '/v1/default-voices?page_size=100'],
  ['minimax', '/v1/minimax/system-voices?page=1&page_size=100&language=Spanish'],
  ['capcut', '/v1/capcut/system-voices?page=1&page_size=100&language=es']
] as const

export async function vocesVibi(pedir: Pedir): Promise<VozApi[]> {
  const resultados = await Promise.allSettled(catalogos.map(async ([motor, ruta]) => {
    const datos = await (await pedir(ruta)).json() as {
      voices?: EntradaVibi[]
      voice_list?: EntradaVibi[]
    }
    const lista = datos.voices ?? datos.voice_list
    if (!Array.isArray(lista)) throw new Error('Vibi devolvió un catálogo inválido.')
    return lista.flatMap((v): VozApi[] => {
      const nombre = v.name ?? v.voice_name
      if (typeof nombre !== 'string' || typeof v.voice_id !== 'string') return []
      return [{
        id: `${motor}:${v.voice_id}`, nombre, propia: false, de: motor,
        descripcion: [v.gender, v.description].filter(Boolean).join(' · '),
        ...(v.preview_url?.startsWith('https://storage.googleapis.com/eleven-public-prod/') ? { muestra: v.preview_url } : {})
      }]
    })
  }))
  const voces = resultados.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
  if (!voces.length) {
    const fallo = resultados.find((r) => r.status === 'rejected')
    throw fallo?.reason ?? new Error('Vibi no devolvió voces para esta cuenta.')
  }
  return voces
}

interface EntradaVibi {
  voice_id?: string
  name?: string
  voice_name?: string
  gender?: string
  description?: string
  preview_url?: string
}

export async function hablarVibi(pedir: Pedir, id: string, texto: string) {
  const [provider, voz] = id.split(':')
  if (!voz || !catalogos.some(([motor]) => motor === provider))
    throw new Error('Elige una voz del catálogo de Vibi.')
  const tarea = await (await pedir(`/v1/text-to-speech/${encodeURIComponent(voz)}`, {
    json: { text: texto, provider, language_code: provider === 'minimax' ? 'Spanish' : 'es' }
  })).json() as { id?: string }
  if (!tarea.id) throw new Error('Vibi no devolvió el identificador de la tarea.')
  for (let intento = 0; intento < 60; intento++) {
    await esperar(2000)
    const estado = await (await pedir(`/v1/history/${encodeURIComponent(tarea.id)}`)).json() as {
      status: string; result?: { audio_url?: string }
    }
    if (estado?.status === 'failed' || estado?.status === 'cancelled')
      throw new Error('Vibi no pudo generar la voz. Revisa el historial y el saldo de tu cuenta.')
    if (estado?.status !== 'completed') continue
    const url = new URL(estado.result?.audio_url ?? '', VIBI)
    if (url.origin !== VIBI || !url.pathname.startsWith('/audio/'))
      throw new Error('Vibi no devolvió una dirección de audio válida.')
    const audio = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
    if (!audio.ok) throw new Error(`No se pudo descargar el audio de Vibi (HTTP ${audio.status}).`)
    return { pcm: await pcmDeMp3(new Uint8Array(await audio.arrayBuffer())), frecuencia: 44_100, canales: 1 }
  }
  throw new Error('Vibi tardó demasiado en generar la voz. Revisa la tarea en su historial.')
}
