/** Dictado del compositor: el audio pasa por el backend y no se conserva en disco. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { json } from './http.ts'

let ocupado = false
export async function dictado(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST para transcribir.' })
  if (ocupado) return json(res, 429, { error: 'Hay otra transcripción en curso. Intenta en unos segundos.' })
  const tipo = req.headers['content-type'] ?? ''
  if (!/^audio\/(webm|mp4|ogg|wav)(;|$)/i.test(tipo)) return json(res, 415, { error: 'Formato de audio no compatible.' })
  let clave = process.env.DEEPGRAM_API_KEY
  if (!clave) {
    try { clave = readFileSync('data/deepgram.key', 'utf8').trim() } catch { /* Se configura solo en el servidor. */ }
  }
  if (!clave) return json(res, 503, { error: 'Falta configurar Deepgram en el servidor.' })
  ocupado = true
  try {
    const trozos: Buffer[] = []
    let total = 0
    for await (const parte of req) {
      total += parte.length
      if (total > 12 * 1024 * 1024) return json(res, 413, { error: 'Audio demasiado grande. Graba hasta un minuto.' })
      trozos.push(Buffer.from(parte))
    }
    if (!total) return json(res, 400, { error: 'No llegó audio para transcribir.' })
    const respuesta = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=multi&language_hint=es&smart_format=true', {
      method: 'POST', headers: { Authorization: `Token ${clave}`, 'Content-Type': tipo },
      body: new Uint8Array(Buffer.concat(trozos)), signal: AbortSignal.timeout(60_000)
    })
    if (!respuesta.ok) return json(res, 502, { error: respuesta.status === 401 || respuesta.status === 403 ? 'Deepgram rechazó la clave o sus permisos.' : respuesta.status === 429 ? 'Deepgram alcanzó su límite. Intenta más tarde.' : `Deepgram no pudo transcribir (${respuesta.status}).` })
    const resultado = await respuesta.json() as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } }
    const texto = resultado.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
    return texto ? json(res, 200, { texto }) : json(res, 422, { error: 'No se detectó voz. Acércate al micrófono e intenta otra vez.' })
  } catch {
    return json(res, 502, { error: 'No se pudo completar la transcripción. Revisa la conexión e intenta otra vez.' })
  } finally { ocupado = false }
}
