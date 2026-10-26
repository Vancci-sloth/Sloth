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
 */
export function estaticos(raiz: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const ruta = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    let archivo = normalize(join(raiz, ruta))
    if (!archivo.startsWith(raiz + sep) || !existsSync(archivo) || !statSync(archivo).isFile()) archivo = join(raiz, 'index.html')
    res.writeHead(200, {
      'content-type': TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': archivo.includes(`${sep}assets${sep}`) ? 'max-age=31536000, immutable' : 'no-cache'
    })
    createReadStream(archivo).pipe(res)
  }
}
