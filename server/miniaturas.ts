import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

/**
 * Las miniaturas de las imágenes que el panel de etapas enseña en rejilla. Una captura de página entera mide 1200×40 000
 * px: sesenta de ellas son más de un giga al decodificarlas, y el navegador se traba al dibujarlas en cuadritos de 120 px.
 * FFmpeg saca de cada una, una sola vez, el mismo recorte 4:3 del centro que dibujaba la rejilla, en WebP (que guarda la
 * transparencia de un recorte), y queda en `data/miniaturas`. Si FFmpeg falla, se sirve la imagen entera.
 */

const execFileP = promisify(execFile)

/** Nítida en la columna más ancha de la rejilla (unos 350 px en el estudio) con la pantalla escalada hasta el 175 %. */
const ANCHO = 640
const ALTO = 480
/** Al arrancar se borran las de hace más de un mes, y lo que quedó a medias. La que se vuelva a pedir se rehace. */
const VIDA = 30 * 24 * 3600 * 1000
/** Cuántos FFmpeg a la vez: la primera vez llegan decenas, y un render puede estar ocupando la máquina. */
const A_LA_VEZ = 3

export function miniaturas(dir: string) {
  try {
    for (const f of readdirSync(dir)) if (f.startsWith('_') || Date.now() - statSync(join(dir, f)).mtimeMs > VIDA) rmSync(join(dir, f), { force: true })
  } catch {}

  // Dos peticiones de la misma esperan al mismo FFmpeg.
  const enCurso = new Map<string, Promise<string>>()
  let libres = A_LA_VEZ
  const turnos: (() => void)[] = []

  async function hacer(origen: string, destino: string, filtro: string) {
    if (!libres) await new Promise<void>((r) => turnos.push(r))
    else libres--
    try {
      mkdirSync(dir, { recursive: true })
      // Con otro nombre mientras se escribe: si el servidor se cae a medias, no queda una miniatura rota.
      const tmp = join(dir, `_${Math.random().toString(36).slice(2)}.webp`)
      // Un hilo cada uno: para un solo cuadro, repartirlo entre todos los núcleos tarda más (106 ms frente a 84 en un 1080p) y
      // le quita la máquina a la interfaz mientras se hacen las de una galería entera.
      await execFileP('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-threads', '1', '-filter_threads', '1', '-i', origen, '-vf', filtro, '-frames:v', '1', '-c:v', 'libwebp', '-threads', '1', '-quality', '80', tmp], { timeout: 30_000 })
      renameSync(tmp, destino)
    } finally {
      const siguiente = turnos.shift()
      if (siguiente) siguiente()
      else libres++
    }
  }

  /**
   * La ruta de lo hecho de `file` con `filtro`, hecho si aún no lo estaba. Su nombre cambia si cambia el archivo o lo que
   * se hace (`clave`).
   */
  async function hecho(file: string, filtro: string, clave: string): Promise<string> {
    const st = statSync(file)
    const destino = join(dir, `${createHash('sha1').update(`${file}|${st.mtimeMs}|${st.size}|${clave}`).digest('hex').slice(0, 16)}.webp`)
    if (existsSync(destino)) return destino
    let hecha = enCurso.get(destino)
    if (!hecha) {
      hecha = hacer(file, destino, filtro).then(() => destino)
      enCurso.set(destino, hecha)
      hecha.finally(() => enCurso.delete(destino)).catch(() => {})
    }
    return hecha
  }

  return {
    /** La miniatura de una imagen: su recorte 4:3 del centro. */
    miniatura: (file: string) => hecho(file, `scale=${ANCHO}:${ALTO}:force_original_aspect_ratio=increase,crop=${ANCHO}:${ALTO}`, `${ANCHO}x${ALTO}`),
    /**
     * El primer cuadro de un video (la portada de un vertical), de `ALTO_CUADRO` px de alto: lo que enseña su tarjeta en las
     * galerías hasta que pasas el ratón. Antes cada tarjeta era un video que bajaba y decodificaba su primer cuadro en
     * 1080p: abrir «Mis videos» costaba segundos de CPU.
     */
    cuadro: (video: string) => hecho(video, `scale=-2:${ALTO_CUADRO}`, `cuadro ${ALTO_CUADRO}`)
  }
}

/** Las tarjetas de video miden 200 px de alto: nítido con la pantalla escalada al 200 %. */
const ALTO_CUADRO = 400
