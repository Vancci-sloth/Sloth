import { execFileSync, spawn } from 'node:child_process'
import { rutaPythonSloth } from '../requisitos.ts'

/** Leer YouTube: yt-dlp para buscar y listar canales (sin llave ni cuota), y la API solo si hay llave. */

/** YouTube pidió ir más despacio (429). */
export class Pausa extends Error {}
/** El usuario detuvo la investigación. */
export class Detenido extends Error {}

type Lanzador = { exe: string; args: string[] }
let lanzador: Lanzador | null = null

/**
 * Cómo se lanza yt-dlp: con el Python de Sloth y sus banderas (sin `-B` reescribiría sus `.pyc` y la app de YouTube
 * volvería a bajar 4 GB), o con un Python del sistema que lo tenga instalado. `null` si no hay ninguno; se vuelve a
 * mirar cada vez, por si se instaló mientras tanto.
 */
export function ytdlp(): Lanzador | null {
  if (lanzador) return lanzador
  const sloth = rutaPythonSloth()
  if (sloth) return (lanzador = { exe: sloth, args: ['-E', '-s', '-B', '-X', 'utf8'] })
  try {
    execFileSync('python', ['-c', 'import yt_dlp'], { stdio: 'ignore', timeout: 20000, windowsHide: true })
    return (lanzador = { exe: 'python', args: ['-X', 'utf8'] })
  } catch {
    return null
  }
}

/** Una llamada a yt-dlp que devuelve su JSON (`-J`). Los títulos en su idioma: sin `lang=es`, YouTube los traduce. */
export function correr(args: string[], signal: AbortSignal): Promise<any> {
  const l = ytdlp()
  if (!l) return Promise.reject(new Error('Falta yt-dlp: instala el Python de Sloth, o corre «python -m pip install yt-dlp».'))
  return new Promise((ok, mal) => {
    const p = spawn(l.exe, [...l.args, '-m', 'yt_dlp', '-J', '--no-warnings', '--extractor-args', 'youtube:lang=es', ...args], { windowsHide: true })
    let out = ''
    let err = ''
    p.stdout.setEncoding('utf8').on('data', (d) => (out += d))
    p.stderr.setEncoding('utf8').on('data', (d) => (err += d))
    const matar = () => p.kill()
    signal.addEventListener('abort', matar, { once: true })
    const reloj = setTimeout(matar, 180_000)
    const fin = () => (clearTimeout(reloj), signal.removeEventListener('abort', matar))
    p.on('error', (e) => (fin(), mal(e)))
    p.on('close', (code) => {
      fin()
      if (signal.aborted) return mal(new Detenido('Detenida'))
      if (code !== 0) {
        const linea = err.split('\n').filter((l) => /ERROR/.test(l)).at(-1) ?? err.trim().split('\n').at(-1) ?? `yt-dlp salió con ${code}`
        return mal(/429|Too Many Requests/i.test(err) ? new Pausa(linea) : new Error(linea.replace(/^ERROR:\s*/, '')))
      }
      try {
        ok(JSON.parse(out))
      } catch {
        mal(new Error('yt-dlp no devolvió lo esperado'))
      }
    })
  })
}

/** De `@handle`, un enlace o un id `UC…`, la página de videos largos del canal. */
export function urlDeCanal(ref: string): string | null {
  const r = ref.trim()
  if (!r) return null
  if (/^https?:\/\//.test(r)) return `${r.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/(videos|shorts|streams|featured|about)$/, '')}/videos`
  if (/^UC[\w-]{22}$/.test(r)) return `https://www.youtube.com/channel/${r}/videos`
  return `https://www.youtube.com/@${r.replace(/^@/, '')}/videos`
}

export interface DatosVideo {
  fecha?: string
  likes?: number
  comentarios?: number
  vistas?: number
}

/** Con la llave: fecha, likes, comentarios y vistas exactas de muchos videos, de 50 en 50 (1 unidad cada 50). */
export async function datosPorApi(ids: string[], llave: string, signal: AbortSignal): Promise<Map<string, DatosVideo>> {
  const datos = new Map<string, DatosVideo>()
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&maxResults=50&id=${ids.slice(i, i + 50).join(',')}&key=${encodeURIComponent(llave)}`, { signal })
    const json = (await res.json().catch(() => null)) as { items?: any[]; error?: { message?: string } } | null
    if (!res.ok) throw new Error(`La API de YouTube respondió ${res.status}${json?.error?.message ? `: ${json.error.message}` : ''}`)
    for (const it of json?.items ?? []) {
      const n = (s?: string) => (s === undefined ? undefined : Number(s))
      datos.set(it.id, { fecha: it.snippet?.publishedAt?.slice(0, 10), likes: n(it.statistics?.likeCount), comentarios: n(it.statistics?.commentCount), vistas: n(it.statistics?.viewCount) })
    }
  }
  return datos
}

/** Con la llave: los suscriptores de muchos canales, de 50 en 50 (1 unidad cada 50). Los que los ocultan no salen. */
export async function subsPorApi(ids: string[], llave: string, signal: AbortSignal): Promise<Map<string, number>> {
  const subs = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&maxResults=50&id=${ids.slice(i, i + 50).join(',')}&key=${encodeURIComponent(llave)}`, { signal })
    const json = (await res.json().catch(() => null)) as { items?: any[]; error?: { message?: string } } | null
    if (!res.ok) throw new Error(`La API de YouTube respondió ${res.status}${json?.error?.message ? `: ${json.error.message}` : ''}`)
    for (const it of json?.items ?? []) if (!it.statistics?.hiddenSubscriberCount && it.statistics?.subscriberCount) subs.set(it.id, Number(it.statistics.subscriberCount))
  }
  return subs
}

/** Sin llave: lo mismo de un solo video, leyendo su página. Más lento, y YouTube lo frena antes. */
export async function datosPorPagina(id: string, signal: AbortSignal): Promise<DatosVideo> {
  const d = await correr(['--skip-download', '--no-playlist', `https://www.youtube.com/watch?v=${id}`], signal)
  const f: string | undefined = d.upload_date
  return {
    fecha: f && f.length === 8 ? `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6)}` : undefined,
    likes: d.like_count ?? undefined,
    comentarios: d.comment_count ?? undefined,
    vistas: d.view_count ?? undefined
  }
}
