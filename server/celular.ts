/**
 * Sloth en el celular (ADR 0025, la app de `movil/`): el celular no hace los videos, los pide a esta computadora. Sloth
 * solo atiende a su propia ventana (`server/origen.ts`), así que el celular entra por otra puerta: un segundo puerto
 * (el de Sloth más uno, 4849 en la app instalada) que escucha en la red de la casa, solo con la llave que enseña el QR
 * de Opciones → Tu celular, y que reenvía a Sloth lo de `/api` y `/ws` como si viniera de esta computadora.
 *
 * Apagado hasta que se enciende en Opciones. Cambiar la llave desconecta los celulares que tenían la de antes. Fuera
 * de casa funciona con una red privada como Tailscale: su dirección sale junto a las de la casa.
 *
 * `GET /api/celular`, `POST /api/celular {activo}` y `POST /api/celular/llave` son de la ventana de Sloth: el celular
 * no se puede apagar ni cambiar la llave a sí mismo. `GET /api/celular/hola`, en el puerto del celular, le dice que
 * llegó a Sloth y a qué computadora.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect, type Socket } from 'node:net'
import { hostname, networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import type { Celular, DireccionCelular } from '../shared/types.ts'
import { guardar } from './disco.ts'
import { cuerpo, json } from './http.ts'

type Conf = { activo: boolean; llave: string }

/** El esquema de la app del celular: el QR es un enlace `slothmovil://conectar?…`, que la cámara del celular abre en ella. */
export const ESQUEMA = 'slothmovil'

/** Lo que no pasa a Sloth: lo que diría que viene de otro sitio, la llave y lo que es solo de esta conexión. */
const FUERA = new Set(['host', 'origin', 'referer', 'authorization', 'cookie', 'keep-alive', 'proxy-connection', 'transfer-encoding'])

/** Las cabeceras para Sloth, como las de un script de esta computadora. Con `subir`, las del WebSocket se quedan. */
export function cabecerasParaSloth(headers: IncomingHttpHeaders, puerto: number, subir = false): Record<string, string> {
  const fuera: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || FUERA.has(k) || k.startsWith('sec-fetch-')) continue
    if (!subir && (k === 'connection' || k === 'upgrade')) continue
    fuera[k] = Array.isArray(v) ? v.join(', ') : v
  }
  fuera.host = `127.0.0.1:${puerto}`
  return fuera
}

/** La llave del pedido: en `Authorization: Bearer`, o en `?llave=` para lo que no deja poner cabeceras (un video, una imagen). */
export function llaveDe(req: Pick<IncomingMessage, 'headers'>, url: URL): string {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
  return bearer ?? url.searchParams.get('llave') ?? ''
}

/** Compara sin decir por el tiempo cuántas letras acertó. */
export function mismaLlave(a: string, b: string): boolean {
  if (!a || !b) return false
  const h = (x: string) => createHash('sha256').update(x).digest()
  return timingSafeEqual(h(a), h(b))
}

/** Las direcciones de esta computadora que puede ver un celular: las de la casa primero, luego Tailscale y las demás. */
export function direcciones(redes = networkInterfaces()): Omit<DireccionCelular, 'url'>[] {
  const todas: Omit<DireccionCelular, 'url'>[] = []
  for (const [nombre, lista] of Object.entries(redes)) {
    for (const d of lista ?? []) {
      if (d.family !== 'IPv4' || d.internal || d.address.startsWith('169.254.')) continue
      const [a, b] = d.address.split('.').map(Number)
      const tipo: DireccionCelular['tipo'] =
        a === 100 && b >= 64 && b <= 127 ? 'tailscale' : a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ? 'casa' : 'otra'
      todas.push({ ip: d.address, red: nombre, tipo })
    }
  }
  const orden = { casa: 0, tailscale: 1, otra: 2 }
  // Las de máquinas virtuales (WSL, Hyper-V, Docker) son privadas pero ningún celular llega a ellas: al final de las de casa.
  const virtual = (r: string) => /vethernet|wsl|hyper-v|docker|virtualbox|vmware/i.test(r)
  return todas.sort((x, y) => orden[x.tipo] - orden[y.tipo] || Number(virtual(x.red)) - Number(virtual(y.red)))
}

/** El enlace del QR: todas las direcciones, la app prueba una por una. */
export function enlaceDe(ips: string[], puerto: number, llave: string): string {
  const d = ips.map((ip) => `${ip}:${puerto}`).join(',')
  return `${ESQUEMA}://conectar?d=${encodeURIComponent(d)}&llave=${encodeURIComponent(llave)}`
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, range',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': 'content-length, content-range, accept-ranges'
}

/** Más de esto en 10 minutos desde una dirección, con la llave mal, y se le deja de contestar un rato. */
const INTENTOS = 30

export function celular({ app, puerto, version }: { app: string; puerto: number; version: string }) {
  const archivo = join(app, 'data', 'celular.json')
  const suyo = puerto + 1
  let conf: Conf = { activo: false, llave: '' }
  try {
    if (existsSync(archivo)) conf = { ...conf, ...JSON.parse(readFileSync(archivo, 'utf8')) }
  } catch { /* Un archivo dañado es como no tenerlo: apagado. */ }
  let error = ''
  const fallos = new Map<string, { n: number; desde: number }>()
  const tuneles = new Set<Socket>()

  const nuevaLlave = () => randomBytes(24).toString('base64url')
  const escribir = () => (mkdirSync(dirname(archivo), { recursive: true }), guardar(archivo, JSON.stringify(conf, null, 2)))

  function autorizado(req: IncomingMessage, url: URL): boolean | 'espera' {
    const ip = req.socket.remoteAddress ?? ''
    const f = fallos.get(ip)
    if (f && Date.now() - f.desde > 600_000) fallos.delete(ip)
    if ((fallos.get(ip)?.n ?? 0) >= INTENTOS) return 'espera'
    if (mismaLlave(llaveDe(req, url), conf.llave)) return true
    const g = fallos.get(ip) ?? { n: 0, desde: Date.now() }
    g.n++
    fallos.set(ip, g)
    return false
  }

  const servidor = createServer((req, res) => {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v)
    if (req.method === 'OPTIONS') return void res.writeHead(204).end()
    const url = new URL(req.url ?? '/', 'http://celular')
    const ok = autorizado(req, url)
    if (ok === 'espera') return void json(res, 429, { error: 'Demasiados intentos con la llave equivocada. Espera unos minutos.' })
    if (!ok) return void json(res, 401, { error: 'La llave no es la de esta Sloth: vuelve a escanear el QR de Opciones → Tu celular.' })
    if (url.pathname === '/api/celular/hola') return void json(res, 200, { sloth: true, equipo: hostname(), version })
    if (!url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/celular')) return void json(res, 404, { error: 'No existe' })
    url.searchParams.delete('llave')
    reenviar(req, res, url.pathname + url.search)
  })

  function reenviar(req: IncomingMessage, res: ServerResponse, ruta: string) {
    const ida = request({ host: '127.0.0.1', port: puerto, method: req.method, path: ruta, headers: cabecerasParaSloth(req.headers, puerto) }, (vuelta) => {
      res.writeHead(vuelta.statusCode ?? 502, vuelta.headers)
      vuelta.pipe(res)
    })
    ida.on('error', () => {
      if (!res.headersSent) json(res, 502, { error: 'Sloth se está reiniciando en tu computadora. Intenta en unos segundos.' })
      else res.destroy()
    })
    // Si el celular se va a medias (cerró el video), se deja de pedir.
    res.on('close', () => { if (!res.writableFinished) ida.destroy() })
    req.pipe(ida)
  }

  // El WebSocket: se abre el de Sloth como lo abriría esta computadora y se unen los dos.
  servidor.on('upgrade', (req, socket: Socket, head) => {
    const url = new URL(req.url ?? '/', 'http://celular')
    const ok = url.pathname === '/ws' && autorizado(req, url) === true
    if (!ok) return void socket.end('HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n')
    const sloth = connect(puerto, '127.0.0.1', () => {
      const cabeceras = Object.entries(cabecerasParaSloth(req.headers, puerto, true)).map(([k, v]) => `${k}: ${v}`)
      sloth.write(`GET /ws HTTP/1.1\r\n${cabeceras.join('\r\n')}\r\n\r\n`)
      if (head.length) sloth.write(head)
      socket.pipe(sloth).pipe(socket)
    })
    const cerrar = () => (socket.destroy(), sloth.destroy(), tuneles.delete(socket))
    tuneles.add(socket)
    sloth.on('error', cerrar).on('close', cerrar)
    socket.on('error', cerrar).on('close', cerrar)
  })

  servidor.on('error', (e: NodeJS.ErrnoException) => {
    error = e.code === 'EADDRINUSE' ? `El puerto ${suyo} ya lo usa otro programa.` : e.message
    console.error(`Tu celular: ${error}`)
  })

  function encender() {
    error = ''
    if (!servidor.listening) servidor.listen(suyo, '0.0.0.0', () => console.log(`Tu celular entra por el puerto ${suyo}`))
  }

  function apagar() {
    if (servidor.listening) servidor.close()
    soltarTodos()
  }

  function soltarTodos() {
    servidor.closeAllConnections()
    for (const s of tuneles) s.destroy()
    tuneles.clear()
  }

  function estado(): Celular {
    const lista = direcciones()
    return {
      activo: conf.activo,
      escuchando: servidor.listening,
      puerto: suyo,
      llave: conf.llave,
      direcciones: lista.map((d) => ({ ...d, url: `http://${d.ip}:${suyo}` })),
      enlace: conf.llave ? enlaceDe(lista.map((d) => d.ip), suyo, conf.llave) : '',
      error: error || undefined
    }
  }

  if (conf.activo && conf.llave) encender()

  return {
    async api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
      if (path === '/api/celular' && req.method === 'GET') return json(res, 200, estado())
      if (path === '/api/celular' && req.method === 'POST') {
        const { activo } = await cuerpo<{ activo?: boolean }>(req)
        conf = { activo: !!activo, llave: conf.llave || nuevaLlave() }
        escribir()
        if (conf.activo) encender()
        else apagar()
        // `listen` avisa del puerto ocupado un momento después.
        await new Promise((ok) => setTimeout(ok, 150))
        return json(res, 200, estado())
      }
      if (path === '/api/celular/llave' && req.method === 'POST') {
        conf = { ...conf, llave: nuevaLlave() }
        escribir()
        soltarTodos()
        return json(res, 200, estado())
      }
      return false
    }
  }
}
