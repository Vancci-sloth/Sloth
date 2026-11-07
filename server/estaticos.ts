import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
}

/**
 * La interfaz ya armada (`scripts/compilar.mjs`), en la app que se vende: sirve los archivos de `raiz` y, a cualquier
 * otra ruta, `index.html`, que la interfaz enruta con el hash. Lo de `assets/` lleva su huella en el nombre: no cambia.
 * Responde a un trozo (`Range`), que un video necesita para volver al principio (los del aviso de un estilo que cambió).
 */
export function estaticos(raiz: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const ruta = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    let archivo = normalize(join(raiz, ruta))
    if (!archivo.startsWith(raiz + sep) || !existsSync(archivo) || !statSync(archivo).isFile()) archivo = join(raiz, 'index.html')
    const cabeza = {
      'content-type': TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': archivo.includes(`${sep}assets${sep}`) ? 'max-age=31536000, immutable' : 'no-cache',
      'accept-ranges': 'bytes'
    }
    const largo = statSync(archivo).size
    const trozo = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (trozo && (trozo[1] || trozo[2])) {
      const inicio = trozo[1] ? Number(trozo[1]) : Math.max(0, largo - Number(trozo[2]))
      const fin = trozo[1] && trozo[2] ? Math.min(Number(trozo[2]), largo - 1) : largo - 1
      if (inicio > fin || inicio >= largo) return res.writeHead(416, { 'content-range': `bytes */${largo}` }).end()
      res.writeHead(206, { ...cabeza, 'content-range': `bytes ${inicio}-${fin}/${largo}`, 'content-length': fin - inicio + 1 })
      return createReadStream(archivo, { start: inicio, end: fin }).pipe(res)
    }
    res.writeHead(200, { ...cabeza, 'content-length': largo })
    createReadStream(archivo).pipe(res)
  }
}
