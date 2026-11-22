/**
 * El dictado del compositor (`web/src/Dictado.tsx`): el micrófono graba hasta un minuto y Deepgram (Nova-3, en español)
 * lo pasa a texto, que entra al campo para revisarlo antes de mandarlo. El audio va del navegador a este servidor y de
 * aquí a Deepgram; no se guarda en disco. En vivo va por el WebSocket de `dictado-vivo.ts`; `POST /api/dictado`
 * transcribe un audio entero.
 *
 * La llave es de quien usa Sloth: `DEEPGRAM_API_KEY` o el archivo `data/deepgram.key` (fuera del repo). Nunca sale de
 * este servidor: ni al navegador, ni a los registros, ni en los errores. Sin ella, el botón no sale (`GET /api/dictado`).
 * Lo que falta para un servicio de Sloth en el cobro, en `docs/DEEPGRAM-SERVICIO.md`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { json } from './http.ts'

/** La llave de Deepgram de esta computadora, o nada. Se lee en cada pedido: ponerla no pide reiniciar. */
export function llaveDeepgram(app: string): string | undefined {
  const env = process.env.DEEPGRAM_API_KEY?.trim()
  if (env) return env
  try {
    return readFileSync(join(app, 'data', 'deepgram.key'), 'utf8').replace(/^﻿/, '').trim() || undefined
  } catch {
    return undefined
  }
}

const LISTEN = 'https://api.deepgram.com/v1/listen?model=nova-3&language=multi&language_hint=es&smart_format=true'
let ocupado = false

export async function dictado(app: string, req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') return json(res, 200, { disponible: !!llaveDeepgram(app) })
  if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST para transcribir.' })
  if (ocupado) return json(res, 429, { error: 'Hay otra transcripción en curso. Intenta en unos segundos.' })
  const tipo = req.headers['content-type'] ?? ''
  if (!/^audio\/(webm|mp4|ogg|wav)(;|$)/i.test(tipo)) return json(res, 415, { error: 'Formato de audio no compatible.' })
  const clave = llaveDeepgram(app)
  if (!clave) return json(res, 503, { error: 'Para dictar falta la llave de Deepgram: ponla en DEEPGRAM_API_KEY o en data/deepgram.key.' })
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
    const respuesta = await fetch(LISTEN, {
      method: 'POST', headers: { Authorization: `Token ${clave}`, 'Content-Type': tipo },
      body: new Uint8Array(Buffer.concat(trozos)), signal: AbortSignal.timeout(60_000)
    })
    // Lo que contesta Deepgram no se reenvía: podría traer datos de la cuenta.
    if (!respuesta.ok) return json(res, 502, { error: respuesta.status === 401 || respuesta.status === 403 ? 'Deepgram rechazó la llave o sus permisos.' : respuesta.status === 429 ? 'Deepgram alcanzó su límite. Intenta más tarde.' : `Deepgram no pudo transcribir (${respuesta.status}).` })
    const resultado = await respuesta.json() as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } }
    const texto = resultado.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
    return texto ? json(res, 200, { texto }) : json(res, 422, { error: 'No se oyó voz. Acércate al micrófono e intenta otra vez.' })
  } catch {
    return json(res, 502, { error: 'No se pudo completar la transcripción. Revisa la conexión e intenta otra vez.' })
  } finally {
    ocupado = false
  }
}
