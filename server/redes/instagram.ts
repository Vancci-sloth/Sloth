import { execFile } from 'node:child_process'
import { closeSync, fstatSync, openAsBlob, openSync, readSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { huella } from '../disco.ts'
import { leer } from '../opciones.ts'
import type { ModuloRed } from './index.ts'

/**
 * Instagram: el video sube a la nube de Sloth (`nube/`, un Worker de Cloudflare con un bucket R2) con su texto y su hora,
 * y de ahí sale como Reel aunque esta computadora esté apagada. La API de Instagram no programa ni acepta el archivo, así
 * que el Worker se lo sirve y lo publica a su hora (ver `docs/adr/0003-instagram-por-su-api.md`). El token de Instagram
 * también vive en el Worker, que lo renueva solo.
 */

/**
 * Dónde está el Worker y el secreto que comparte con él, en las variables del usuario de Windows como las llaves. Los
 * escribes tú (la nube del dueño) o los deja `montarNube` al montarla en tu cuenta de Cloudflare.
 */
export const NUBE = 'SLOTH_NUBE'
export const SECRETO = 'SLOTH_NUBE_SECRETO'
/** ¿Ya hay una nube donde esperan los videos? Sin ella, Instagram no se puede conectar. */
export const hayNube = () => !!leer(NUBE)
/** El Worker no recibe más de 100 MB de una vez: el video va en partes de este tamaño. */
const PARTE = 50 * 1024 * 1024

const execFileP = promisify(execFile)
const enFecha = (s: string) => new Date(s.replace(' ', 'T')).getTime()

export const instagram: ModuloRed = {
  id: 'instagram',
  nombre: 'Instagram',
  enLaNube: true,

  // `caduca` y `renovacion` llegan solo desde la versión de la nube que los da (ver nube/src/index.ts).
  async cuenta() {
    return await nube<{ cuenta: string | null; caduca?: number; renovacion?: string }>('/cuenta')
  },

  async token(nuevo) {
    const r = nuevo ? await nube<{ cuenta: string }>('/token', { method: 'PUT', body: JSON.stringify({ token: nuevo }) }) : await nube<{ cuenta: null }>('/token', { method: 'DELETE' })
    return r.cuenta
  },

  // La `ref` es el nombre del video y de su publicación en la nube.
  async programar(_nav, p) {
    // Un reintento puede ser de algo que ya llegó (se perdió la respuesta, o Sloth se cerró a la mitad). Si la nube lo
    // tiene y no falló, está programado o ya salió: subirlo y dejarlo otra vez lo publicaría dos veces. Con `media` ya
    // salió, aunque diga que falló (lo de después de publicar).
    if (p.reintento) {
      const ya = (await nube<{ ref: string; estado: string; media?: string }[]>('/publicaciones')).find((i) => i.ref === p.ref)
      if (ya && (ya.estado !== 'error' || ya.media)) return
    }
    // En un reintento el video puede estar ya arriba: no se sube otra vez. Si no, se sube el del disco, que tiene que ser
    // el mismo que se puso en la cola: el texto es de ese.
    const arriba = p.reintento && (await nube(`/videos/${p.ref}`, { method: 'HEAD' }).then(() => true, () => false))
    if (!arriba && huella(p.ruta) !== p.huella) throw new Error('La nube no tiene el video, y en el disco ya no está (o cambió): no se puede reintentar.')
    if (!arriba) await subir(p.ref, p.ruta)
    const caption = [p.texto, p.tags.map((x) => `#${x}`).join(' ')].filter(Boolean).join('\n\n')
    await nube(`/publicaciones/${p.ref}`, { method: 'PUT', body: JSON.stringify({ caption, cuando: enFecha(p.cuando) }) })
  },

  // Se borra de la nube con su video: si aún no salió, ya no sale.
  async quitar(ref) {
    await nube(`/publicaciones/${ref}`, { method: 'DELETE' })
  },

  async estados() {
    const items = await nube<{ ref: string; estado: string; error?: string; media?: string }[]>('/publicaciones')
    const estados: Awaited<ReturnType<NonNullable<ModuloRed['estados']>>> = {}
    // Con `media` ya salió: una nube de antes lo dejaba en `error` si después no podía borrar el video.
    for (const i of items)
      if (i.estado === 'publicado' || i.media) estados[i.ref] = { estado: 'publicado' }
      else if (i.estado === 'error') estados[i.ref] = { estado: 'error', error: i.error ?? 'Falló en la nube' }
    return estados
  }
}

async function nube<T = unknown>(ruta: string, init: RequestInit = {}): Promise<T> {
  const url = leer(NUBE)
  if (!url) throw new Error('Falta tu nube: móntala en Opciones → Redes → Instagram.')
  const res = await fetch(`${url}${ruta}`, { ...init, headers: { authorization: `Bearer ${leer(SECRETO)}` } }).catch((e) => {
    throw new Error(`No llegué a la nube de Sloth: ${e instanceof Error ? e.message : e}`)
  })
  if (init.method === 'HEAD') {
    if (!res.ok) throw new Error(`La nube de Sloth respondió ${res.status}`)
    return null as T
  }
  const json = await res.json().catch(() => ({}))
  // Recién montada, Cloudflare responde su página de «aún no hay nada» hasta que estrena la dirección.
  if (res.status === 404 && !json.error) throw new Error('Tu nube aún se está estrenando: Cloudflare tarda unos minutos la primera vez. Prueba otra vez en un momento.')
  if (!res.ok) throw new Error(json.error ?? `La nube de Sloth respondió ${res.status}`)
  return json as T
}

/** Sube el video a la nube por partes, con el `moov` al principio como lo pide Instagram. */
async function subir(ref: string, ruta: string) {
  const archivo = await moovAlPrincipio(ruta)
  try {
    const video = await openAsBlob(archivo)
    const { subida } = await nube<{ subida: string }>(`/videos/${ref}`, { method: 'POST' })
    const partes: unknown[] = []
    for (let n = 1, desde = 0; desde < video.size; n++, desde += PARTE)
      partes.push(await nube(`/videos/${ref}?subida=${encodeURIComponent(subida)}&parte=${n}`, { method: 'PUT', body: video.slice(desde, desde + PARTE) }))
    await nube(`/videos/${ref}?subida=${encodeURIComponent(subida)}`, { method: 'POST', body: JSON.stringify({ partes }) })
  } finally {
    if (archivo !== ruta) rmSync(archivo, { force: true })
  }
}

/** Instagram pide el índice del MP4 (`moov`) antes de los datos. Si va al final, se sube una copia que lo mueve, sin recodificar. */
async function moovAlPrincipio(ruta: string) {
  const c = cajas(ruta)
  if (!c.includes('moov') || c.indexOf('moov') < c.indexOf('mdat')) return ruta
  const copia = join(tmpdir(), `sloth-instagram-${Date.now()}.mp4`)
  await execFileP('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', ruta, '-c', 'copy', '-movflags', '+faststart', copia])
  return copia
}

/** Las cajas de primer nivel del MP4, en orden: `ftyp`, `moov`, `mdat`… */
function cajas(ruta: string) {
  const fd = openSync(ruta, 'r')
  const total = fstatSync(fd).size
  const b = Buffer.alloc(16)
  const tipos: string[] = []
  try {
    for (let pos = 0; pos + 8 <= total && tipos.length < 20; ) {
      readSync(fd, b, 0, 16, pos)
      let n = b.readUInt32BE(0)
      if (n === 1) n = Number(b.readBigUInt64BE(8))
      if (n === 0) n = total - pos
      if (n < 8) break
      tipos.push(b.toString('latin1', 4, 8))
      pos += n
    }
  } finally {
    closeSync(fd)
  }
  return tipos
}
