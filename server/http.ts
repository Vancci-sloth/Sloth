/** Leer y contestar JSON en las rutas de `/api`. */
import type { IncomingMessage, ServerResponse } from 'node:http'

export async function bytes(req: IncomingMessage): Promise<Buffer> {
  const trozos: Buffer[] = []
  for await (const t of req) trozos.push(t as Buffer)
  return Buffer.concat(trozos)
}

/** Une los bytes antes de leerlos: una letra con acento puede quedar partida entre dos trozos. */
export async function cuerpo<T>(req: IncomingMessage): Promise<T> {
  const texto = (await bytes(req)).toString('utf8')
  return (texto ? JSON.parse(texto) : {}) as T
}

export function json(res: ServerResponse, status: number, datos: unknown): true {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(datos))
  return true
}
