import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, globSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { VideoHecho } from '../shared/types.ts'
import type { MiniaturaYoutube } from '../shared/youtube.ts'
import { leerEntrega } from './youtube-entrega.ts'

/**
 * Lee las propuestas que ya entregó cada video (publicacion.md, youtube.md, informe.md), sin inventar títulos desde
 * el nombre del archivo. Solo ofrece imágenes de portadas/miniaturas o archivos llamados así; las capturas del material
 * no se confunden con una miniatura. FFprobe y las huellas se guardan en memoria por versión del archivo.
 */
const execFileP = promisify(execFile)
const formas = new Map<string, Promise<{ formato: 'horizontal' | 'vertical' | 'desconocido'; duracion: number }>>()
const imagenes = new Map<string, { huella: string }>()
export const LIMITE_MINIATURA = 50 * 1024 * 1024

export function formaYoutube(v: VideoHecho) {
  const clave = `${v.ruta}|${v.t}|${statSync(v.ruta).size}`
  if (!formas.has(clave)) formas.set(clave, execFileP('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', v.ruta], { timeout: 15_000, windowsHide: true })
    .then(({ stdout }) => {
      const j = JSON.parse(stdout) as { streams?: { width: number; height: number }[]; format?: { duration?: string } }
      const stream = j.streams?.[0]
      return { formato: !stream?.width || !stream.height ? 'desconocido' as const : stream.height >= stream.width ? 'vertical' as const : 'horizontal' as const, duracion: Number(j.format?.duration) || 0 }
    }, () => ({ formato: 'desconocido' as const, duracion: 0 })))
  return formas.get(clave)!
}

/** Archivo es relativo a la carpeta del video: cada componente deshace uno de los de su ruta completa. */
export function carpetaYoutube(v: VideoHecho) { return resolve(v.ruta, ...v.archivo.split(/[\\/]/).filter(Boolean).map(() => '..')) }
const carpeta = carpetaYoutube

function candidatas(v: VideoHecho) {
  return globSync('{miniatura*,thumbnail*,portada*,out/miniatura*,out/thumbnail*,miniaturas/*,portadas/*,out/portadas/*}.{png,jpg,jpeg}', { cwd: carpeta(v) })
    .map((p) => resolve(carpeta(v), p))
}

export function validarMiniatura(app: string, v: VideoHecho, ruta: string): { ruta: string; huella: string } {
  const file = resolve(ruta)
  const adjuntos = join(app, 'data', 'attachments')
  const esAdjunto = existsSync(adjuntos) && dirname(realpathSync(file)).toLowerCase() === realpathSync(adjuntos).toLowerCase()
  const esCandidata = candidatas(v).some((p) => p.toLowerCase() === file.toLowerCase() && realpathSync(p).toLowerCase() === file.toLowerCase())
  if (!esAdjunto && !esCandidata) throw new Error('Elige una miniatura de este video o importa una imagen desde la revisión.')
  const st = statSync(file)
  if (!st.isFile() || !st.size || st.size > LIMITE_MINIATURA) throw new Error('La miniatura debe ser una imagen PNG o JPEG de hasta 50 MB.')
  const clave = `${file}|${st.size}|${st.mtimeMs}`
  let vista = imagenes.get(clave)
  if (!vista) {
    const bytes = readFileSync(file)
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    if ((!png && !jpeg) || !/\.(png|jpe?g)$/i.test(file)) throw new Error('YouTube necesita una miniatura PNG o JPEG válida.')
    vista = { huella: createHash('sha256').update(bytes).digest('hex') }
    imagenes.set(clave, vista)
  }
  return { ruta: file, huella: vista.huella }
}

export function miniaturasYoutube(app: string, v: VideoHecho, elegida?: string): MiniaturaYoutube[] {
  const todas = new Set([...candidatas(v), ...(elegida ? [elegida] : [])])
  return [...todas].flatMap((file) => {
    try {
      const m = validarMiniatura(app, v, file)
      return [{ ...m, nombre: basename(m.ruta), src: `/api/youtube/miniatura?${new URLSearchParams({ cardId: v.cardId, ruta: v.ruta, imagen: m.ruta, t: m.huella })}` }]
    } catch { return [] }
  })
}

export function propuestaYoutube(v: VideoHecho, mensajes: string[] = []): { titulo: string; tituloPropuesto?: string; descripcion: string; alternativas: string[]; propuesta?: string; miniaturaPropuesta?: string; propuestaFuente?: string } {
  const fuentes = [...mensajes].reverse().map((texto) => ({ nombre: 'Recomendación del hilo del video', texto }))
  for (const nombre of ['publicacion.md', 'youtube.md', 'entrega.md', 'informe.md']) {
    const file = join(carpeta(v), nombre)
    if (!existsSync(file) || statSync(file).size > 100_000) continue
    fuentes.push({ nombre, texto: readFileSync(file, 'utf8') })
  }
  const leidas = fuentes.map((f) => ({ ...f, ...leerEntrega(f.texto) }))
  const titulo = leidas.find((f) => f.titulo)
  const miniatura = leidas.find((f) => f.miniatura)
  const descripcion = leidas.find((f) => f.descripcion)
  return { titulo: titulo?.titulo ?? v.titulo, tituloPropuesto: titulo?.titulo, descripcion: descripcion?.descripcion ?? '', alternativas: titulo?.alternativas ?? [],
    propuesta: [titulo, miniatura].filter((f, n, fs) => f && fs.indexOf(f) === n).map((f) => `Fuente: ${f!.nombre}\n\n${f!.texto}`).join('\n\n') || undefined,
    miniaturaPropuesta: miniatura?.miniatura, propuestaFuente: titulo?.nombre ?? miniatura?.nombre }
}
