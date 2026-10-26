import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Card, Previa } from '../shared/types.ts'
import { servir, ultimoVideo } from './etapas.ts'

/**
 * La previa de cada card de estilo: un clip mudo de 6 s, sacado a trozos de su video terminado más nuevo, y su primer
 * cuadro. FFmpeg la hace una sola vez por video (menos de un segundo) y queda en `data/previas`. La card enseña el cuadro
 * quieto y reproduce el clip solo al pasar el ratón, así que mientras nadie la mira no gasta nada. Quitarlo es borrar este
 * archivo, sus líneas en `server/index.ts` y las marcadas «previas» en `web/src`.
 */

const execFileP = promisify(execFile)

/** Cuatro tramos de 1,5 s repartidos por el video: enseñan el estilo, no solo cómo arranca. */
const TRAMOS = [0.15, 0.35, 0.55, 0.75]
const TRAMO = 1.5
/** El lado corto del clip, en píxeles: de sobra para una card de 144 px en una pantalla de doble densidad. */
const LADO = 320
const FPS = 24

export function previas(dir: string, cards: () => Card[]) {
  // Las que se están haciendo, para que dos peticiones a la vez esperen al mismo FFmpeg. Al acabar, bien o mal, salen: una
  // que falló (FFmpeg que faltaba, un render que ahogó la máquina) se vuelve a intentar en la siguiente petición.
  const enCurso = new Map<string, Promise<string | undefined>>()
  // De una en una, para no quitarle la máquina a un render.
  let cola: Promise<unknown> = Promise.resolve()

  async function hacer(origen: string, nombre: string): Promise<string> {
    if (existsSync(join(dir, `${nombre}.mp4`)) && existsSync(join(dir, `${nombre}.jpg`))) return nombre
    const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', origen])
    const dura = Number(stdout.trim())
    // Un video corto entra entero.
    const inicios = dura >= 8 ? TRAMOS.map((f) => f * dura) : [0]
    const largo = dura >= 8 ? TRAMO : Math.min(dura, TRAMOS.length * TRAMO)
    const escala = `scale=${LADO}:${LADO}:force_original_aspect_ratio=increase:force_divisible_by=2,fps=${FPS},setsar=1`
    const tramos = inicios.map((_, i) => `[${i}:v]${escala}[v${i}]`).join(';')
    // El cuadro quieto es el más representativo del clip, no el primero, que a veces cae en una transición.
    const cuadros = Math.ceil(inicios.length * largo * FPS)
    const juntos = `${inicios.map((_, i) => `[v${i}]`).join('')}concat=n=${inicios.length}:v=1:a=0,split[clip][todo];[todo]thumbnail=n=${cuadros}[cuadro]`
    mkdirSync(dir, { recursive: true })
    // Con otro nombre mientras se escribe: si el servidor se cae a medias, no queda una previa rota.
    const tmp = join(dir, `_${nombre}`)
    await execFileP('ffmpeg', [
      '-nostdin', '-v', 'error', '-y',
      ...inicios.flatMap((s) => ['-ss', s.toFixed(2), '-t', String(largo), '-i', origen]),
      '-filter_complex', `${tramos};${juntos}`,
      '-map', '[clip]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${tmp}.mp4`,
      '-map', '[cuadro]', '-frames:v', '1', '-q:v', '4', `${tmp}.jpg`
    ], { timeout: 120_000 })
    renameSync(`${tmp}.mp4`, join(dir, `${nombre}.mp4`))
    renameSync(`${tmp}.jpg`, join(dir, `${nombre}.jpg`))
    return nombre
  }

  /** El nombre de la previa del video más nuevo de un estilo, cuando está hecha. El nombre cambia con el video. */
  function previa(card: Card): Promise<string | undefined> {
    const ultimo = ultimoVideo(card)
    if (!ultimo) return Promise.resolve(undefined)
    const nombre = createHash('sha1').update(`${ultimo.ruta}|${ultimo.t}`).digest('hex').slice(0, 12)
    let hecha = enCurso.get(nombre)
    if (!hecha) {
      hecha = cola
        .then(() => hacer(ultimo.ruta, nombre))
        .catch((e) => (console.error(`La previa de «${card.title}» falló: ${e instanceof Error ? e.message : e}`), undefined))
      cola = hecha
      enCurso.set(nombre, hecha)
      hecha.then(() => enCurso.delete(nombre))
    }
    return hecha
  }

  /** `GET /api/previas`: la de cada card de estilo que tenga un video terminado. `GET /api/previas/<archivo>` sirve una. */
  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') return false
    const archivo = /^\/api\/previas\/(\w+\.(?:mp4|jpg))$/.exec(url.pathname)
    if (archivo) return servir(req, res, join(dir, archivo[1]))
    if (url.pathname !== '/api/previas') return false

    const todas: Record<string, Previa> = {}
    const nombres = await Promise.all(cards().map(async (c) => [c.id, c.etapas ? await previa(c) : undefined] as const))
    for (const [id, n] of nombres) if (n) todas[id] = { video: `/api/previas/${n}.mp4`, cuadro: `/api/previas/${n}.jpg` }
    // Las de videos que ya no son los últimos sobran.
    const usadas = new Set(nombres.map(([, n]) => n))
    try {
      for (const f of readdirSync(dir)) if (!f.startsWith('_') && !usadas.has(f.split('.')[0])) rmSync(join(dir, f), { force: true })
    } catch {}
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(todas))
    return true
  }

  return { api }
}
