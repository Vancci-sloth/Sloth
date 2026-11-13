import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { guardar } from '../disco.ts'
import { cuerpo } from '../http.ts'

/**
 * Las muestras con que el menú «Voz» deja oír una voz antes de elegirla: las públicas de AI Studio (gstatic), Fish
 * Audio y ElevenLabs, bajadas una vez a `data/voz/muestras` y servidas desde aquí. Así suenan al instante (medido el
 * 6 de noviembre de 2026: 590 ms bajar una de gstatic, ~10 ms servida de aquí) y las de Fish Audio, que no dejan que
 * otra página las lea, también se pueden preparar. Solo de esos sitios, y se quedan las últimas `GUARDADAS`.
 */

const SITIOS =
  /^https:\/\/((www\.gstatic\.com\/aistudio\/voices\/samples\/|platform\.r2\.fish\.audio\/task\/|storage\.googleapis\.com\/eleven-public-prod\/)[\w./%-]+|api(\.us|\.eu)?\.elevenlabs\.io\/v1\/voices\/\w+\/previews\/audio\?payload=[\w%=-]+|www\.voicescloning\.art\/api\/media\/[\w-]+(\.mp3)?)$/
// Las dos últimas: la muestra de una voz de ElevenLabs de tu cuenta (`preview_url`) y la de una de Voices Cloning, las
// dos públicas, sin llave (vistas el 6-nov-2026).
/** Si se puede bajar esta muestra: solo de esos sitios, sin subir de carpeta (`..`). */
export function muestraPermitida(url: string): boolean {
  // `%2e%2e` pasaría la expresión y `fetch` lo volvería `..`: sin puntos, barras ni barras invertidas escritos así, y
  // la dirección tiene que ser la misma que da el analizador de URL (que es la que se pide).
  if (/%2e|%2f|%5c/i.test(url) || url.includes('..') || url.includes('\\')) return false
  try {
    return new URL(url).href === url && SITIOS.test(url)
  } catch {
    return false
  }
}
const GUARDADAS = 300
/** Lo más que pesa una: una muestra dura segundos. */
const MAXIMO = 8e6

/**
 * Manda un audio como lo pide el reproductor del navegador (`Range: bytes=0-`): con su tamaño y, si pide un rango, solo
 * ese trozo (206), para que pueda saltar dentro de él sin bajarlo entero.
 */
export function enviarAudio(req: IncomingMessage, res: ServerResponse, datos: Uint8Array, tipo: string, cache: number) {
  const base = { 'content-type': tipo, 'accept-ranges': 'bytes', 'cache-control': `max-age=${cache}` }
  const rango = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
  if (rango && (rango[1] || rango[2])) {
    const desde = rango[1] ? Number(rango[1]) : Math.max(0, datos.length - Number(rango[2]))
    const hasta = rango[1] && rango[2] ? Math.min(Number(rango[2]), datos.length - 1) : datos.length - 1
    if (desde >= datos.length || desde > hasta) return res.writeHead(416, { 'content-range': `bytes */${datos.length}` }).end()
    res.writeHead(206, { ...base, 'content-range': `bytes ${desde}-${hasta}/${datos.length}`, 'content-length': hasta - desde + 1 })
    return res.end(datos.subarray(desde, hasta + 1))
  }
  res.writeHead(200, { ...base, 'content-length': datos.length })
  res.end(datos)
}

export function muestras(carpeta: string) {
  const dir = join(carpeta, 'muestras')
  const bajando = new Map<string, Promise<string>>()
  const archivo = (url: string) => join(dir, createHash('sha1').update(url).digest('hex').slice(0, 20) + (/\.mp3(\?|$)|\/previews\/audio\?|voicescloning\.art\/api\/media\//.test(url) ? '.mp3' : /\.wav(\?|$)/.test(url) ? '.wav' : '.audio'))

  /** La ruta de la muestra en disco: la baja si aún no está. Varias peticiones de la misma esperan a la misma bajada. */
  function bajar(url: string): Promise<string> {
    const ruta = archivo(url)
    if (existsSync(ruta)) return Promise.resolve(ruta)
    let b = bajando.get(url)
    if (!b) {
      b = (async () => {
        // Sin seguir redirecciones (no sale de esos sitios) y sin bajar más de `MAXIMO`, lo diga o no la cabecera.
        const r = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' })
        if (!r.ok || !r.body) throw new Error(`La muestra respondió ${r.status}`)
        if (Number(r.headers.get('content-length')) > MAXIMO) throw new Error('La muestra pesa demasiado.')
        const trozos: Uint8Array[] = []
        let total = 0
        for await (const t of r.body as AsyncIterable<Uint8Array>) {
          total += t.length
          if (total > MAXIMO) throw new Error('La muestra pesa demasiado.')
          trozos.push(t)
        }
        const datos = new Uint8Array(total)
        let o = 0
        for (const t of trozos) datos.set(t, o), (o += t.length)
        mkdirSync(dir, { recursive: true })
        guardar(ruta, datos)
        limpiar()
        return ruta
      })().finally(() => bajando.delete(url))
      bajando.set(url, b)
    }
    return b
  }

  function limpiar() {
    try {
      const viejas = readdirSync(dir)
        .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(GUARDADAS)
      for (const { f } of viejas) rmSync(join(dir, f), { force: true })
    } catch {
      // Aún no hay ninguna.
    }
  }

  return {
    async api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
      // Una muestra: `GET /api/voz/muestra?u=<su dirección>`.
      if (path === '/api/voz/muestra' && req.method === 'GET') {
        const url = new URL(req.url ?? '', 'http://x').searchParams.get('u') ?? ''
        if (!muestraPermitida(url)) return res.writeHead(400).end(), true
        try {
          const ruta = await bajar(url)
          const tipo = ruta.endsWith('.mp3') ? 'audio/mpeg' : ruta.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream'
          enviarAudio(req, res, readFileSync(ruta), tipo, 604800)
        } catch {
          res.writeHead(502).end()
        }
        return true
      }
      // Las que el menú va a necesitar (las que tiene a la vista): se bajan de fondo, de tres en tres.
      if (path === '/api/voz/muestras' && req.method === 'POST') {
        const { urls = [] } = await cuerpo<{ urls?: string[] }>(req)
        const cola = urls.filter((u) => typeof u === 'string' && muestraPermitida(u) && !existsSync(archivo(u))).slice(0, 120)
        const uno = async (): Promise<void> => {
          const u = cola.shift()
          if (!u) return
          await bajar(u).catch(() => {})
          return uno()
        }
        void Promise.all([uno(), uno(), uno()])
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ pendientes: cola.length }))
        return true
      }
      return false
    }
  }
}
