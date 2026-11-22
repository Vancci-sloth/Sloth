/**
 * El navegador de cada hilo desde la web (ADR 0025): la página vive en la ventana de Sloth de esta computadora
 * (`electron/navegador.ts`), que la da por HTTP en su relevo (`remoto`). Aquí solo se pasa, con su secreto, lo que pide
 * la web: `/api/navegador/estados`, `/api/navegador/<hilo>/captura` y `POST /api/navegador/<hilo>/{ir,hacer,entrada}`.
 * Sin la ventana abierta (Sloth sin Electron), no hay navegador que enseñar: 404 con `sinVentana`.
 *
 * También lo que solo sabe la ventana y en la nube (ADR 0026) nadie ve: `GET /api/ventana/actualizacion` (si hay versión
 * nueva de Sloth y cómo va su descarga) y `POST /api/ventana/actualizar`, el botón «Actualizar» de la web.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { bytes, json } from './http.ts'
import { integrado } from './navegador-agente.ts'

export async function navegadorRemoto(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const v = /^\/api\/ventana\/(actualizacion|actualizar)$/.exec(url.pathname)
  const m = v ? null : /^\/api\/navegador\/(estados|[\w~-]+\/(captura|ir|hacer|entrada))$/.exec(url.pathname)
  if (!v && !m) return false
  const ventana = integrado()
  if (v) {
    if (!ventana) return json(res, 404, { error: 'La ventana de Sloth no está abierta.', sinVentana: true })
    return pasar(req, res, `http://127.0.0.1:${ventana.puerto}/${ventana.secreto}/ventana/${v[1]}`)
  }
  if (!m) return false
  // Sin la ventana no hay páginas: la lista va vacía (la web la pregunta seguido) y lo demás dice por qué no.
  if (!ventana && m[1] === 'estados') return json(res, 200, [])
  if (!ventana) return json(res, 404, { error: 'La ventana de Sloth está cerrada en tu computadora: ahí vive el navegador.', sinVentana: true })
  return pasar(req, res, `http://127.0.0.1:${ventana.puerto}/${ventana.secreto}/remoto/${m[1]}${url.search}`)
}

/** Lo pedido, tal cual, al relevo de la ventana; y su respuesta, de vuelta. */
async function pasar(req: IncomingMessage, res: ServerResponse, destino: string): Promise<boolean> {
  const post = req.method === 'POST'
  let r: Response
  try {
    r = await fetch(destino, {
      method: post ? 'POST' : 'GET',
      body: post ? new Uint8Array(await bytes(req)) : undefined,
      headers: post ? { 'content-type': 'application/json' } : undefined,
      signal: AbortSignal.timeout(20_000)
    })
  } catch {
    return json(res, 502, { error: 'El navegador de la ventana de Sloth no contesta.' })
  }
  const cabeceras: Record<string, string> = { 'cache-control': 'no-store' }
  for (const k of ['content-type', 'x-ancho', 'x-alto']) {
    const v = r.headers.get(k)
    if (v) cabeceras[k] = v
  }
  res.writeHead(r.status, cabeceras)
  res.end(Buffer.from(await r.arrayBuffer()))
  return true
}
