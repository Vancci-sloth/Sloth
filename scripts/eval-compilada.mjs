// La interfaz compilada, como la de la app instalada, para medir cuánto tarda una página nueva sin el modo de desarrollo
// de Vite (que pide cada módulo por separado). Arma `web/` en data/eval-compilada y la sirve en un puerto propio; lo de
// `/api` y `/ws` pasa a la copia del repo que corre. La usa `eval-modelos3d.mjs --compilada`.
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }

/** Arma la interfaz y la sirve; da su dirección y cómo apagarla. */
export async function servirCompilada(puertoApi) {
  // La copia solo atiende a su propia página (mira Host y Origin): para ella, todo viene de ella.
  const comoSuyo = (h) => ({ ...h, host: `localhost:${puertoApi}`, ...(h.origin ? { origin: `http://localhost:${puertoApi}` } : {}), ...(h.referer ? { referer: `http://localhost:${puertoApi}/` } : {}) })
  const salida = join(APP, 'data', 'eval-compilada')
  await build({ root: join(APP, 'web'), configFile: false, mode: 'production', logLevel: 'warn', plugins: [react()], build: { outDir: salida, emptyOutDir: true, chunkSizeWarningLimit: 4000 } })
  const servidor = createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const ida = request({ host: '127.0.0.1', port: puertoApi, path: req.url, method: req.method, headers: comoSuyo(req.headers) }, (vuelta) => {
        res.writeHead(vuelta.statusCode, vuelta.headers)
        vuelta.pipe(res)
      })
      ida.on('error', () => res.writeHead(502).end())
      return req.pipe(ida)
    }
    let archivo = normalize(join(salida, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
    if (!archivo.startsWith(salida + sep) || !existsSync(archivo) || !statSync(archivo).isFile()) archivo = join(salida, 'index.html')
    res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] ?? 'application/octet-stream', 'cache-control': archivo.includes(`${sep}assets${sep}`) ? 'max-age=31536000, immutable' : 'no-cache' })
    createReadStream(archivo).pipe(res)
  })
  // El WebSocket de la app, tal cual, a la copia que corre.
  servidor.on('upgrade', (req, socket, cabeza) => {
    const otro = connect(puertoApi, '127.0.0.1', () => {
      otro.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(comoSuyo(req.headers)).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`)
      otro.write(cabeza)
      socket.pipe(otro).pipe(socket)
    })
    otro.on('error', () => socket.destroy())
    socket.on('error', () => otro.destroy())
  })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  return { url: `http://localhost:${servidor.address().port}`, cerrar: () => servidor.close() }
}
