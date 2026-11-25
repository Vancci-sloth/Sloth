/**
 * El dictado en vivo (`/api/dictado/vivo`): el navegador manda trozos de audio de 250 ms y este servidor los pasa por
 * WebSocket al cobro de Sloth (`licencias/src/dictado.ts`), que los pasa a Deepgram con sus llaves. Vuelven los
 * resultados provisionales y finales de Deepgram, y al navegador solo le llega el texto (`{tipo:'texto', final}`).
 * Uno a la vez, 12 MB y 80 s como mucho.
 */
import { WebSocket } from 'ws'
import type { Credencial } from './comunidad.ts'
import { cabecerasDe, NUBE, type CredencialDictado } from './dictado.ts'

const SIN_CUENTA = 'El dictado es para quien apoya a Sloth. Apóyalo en Opciones → Apoyo.'
let activo = false

const conectarA = (c: Credencial) => new WebSocket(`${NUBE.replace(/^http/, 'ws')}/dictado/vivo`, { headers: cabecerasDe(c), handshakeTimeout: 10_000 })

export async function dictadoVivo(cliente: WebSocket, credencial: CredencialDictado, conectar: (c: Credencial) => WebSocket = conectarA) {
  const enviar = (dato: unknown) => { if (cliente.readyState === WebSocket.OPEN) cliente.send(JSON.stringify(dato)) }
  if (activo) { enviar({ error: 'Ya hay un dictado en curso.' }); cliente.close(); return }
  activo = true
  const c = await Promise.resolve(credencial()).catch(() => undefined)
  if (!c || cliente.readyState !== WebSocket.OPEN) {
    activo = false
    if (!c) enviar({ error: SIN_CUENTA })
    cliente.close()
    return
  }
  const remoto = conectar(c)
  let bytes = 0
  let terminado = false
  const reloj = setTimeout(() => fallar('Se agotó el tiempo del dictado.'), 80_000)
  function limpiar() {
    if (terminado) return
    terminado = true
    activo = false
    clearTimeout(reloj)
    remoto.terminate()
    cliente.close()
  }
  function fallar(error: string) { if (!terminado) enviar({ error }); limpiar() }
  remoto.on('open', () => enviar({ tipo: 'listo' }))
  // El cobro dice antes de abrir por qué no deja dictar (sin apoyo, el tope del día…).
  remoto.on('unexpected-response', (_req, res) => {
    let cuerpo = ''
    res.on('data', (d: Buffer) => { cuerpo += d })
    res.on('end', () => {
      let error: unknown
      try { error = JSON.parse(cuerpo).error } catch { /* No era JSON. */ }
      fallar(typeof error === 'string' && error ? error : `No se pudo abrir el dictado (${res.statusCode ?? 0}).`)
    })
  })
  remoto.on('message', (dato) => {
    try {
      const mensaje = JSON.parse(dato.toString())
      if (typeof mensaje.error === 'string') return fallar(mensaje.error)
      if (mensaje.type === 'Results') {
        const texto = mensaje.channel?.alternatives?.[0]?.transcript
        if (typeof texto === 'string') enviar({ tipo: 'texto', texto, final: !!mensaje.is_final })
      }
      if (mensaje.type === 'Error') fallar('Deepgram no pudo procesar el dictado.')
    } catch { fallar('Deepgram contestó algo que no se entiende.') }
  })
  remoto.on('close', () => { if (!terminado) enviar({ tipo: 'fin' }); limpiar() })
  remoto.on('error', () => fallar('No se pudo conectar con el dictado de Sloth. Revisa tu internet.'))
  cliente.on('message', (dato, binario) => {
    if (remoto.readyState !== WebSocket.OPEN) return
    if (binario) {
      bytes += Array.isArray(dato) ? dato.reduce((n, parte) => n + parte.byteLength, 0) : dato.byteLength
      if (bytes > 12 * 1024 * 1024 || remoto.bufferedAmount > 2 * 1024 * 1024) return fallar('La conexión va muy lenta. Intenta un dictado más corto.')
      remoto.send(dato)
    } else if (dato.toString() === 'fin') remoto.send('fin')
  })
  cliente.on('close', limpiar)
  cliente.on('error', limpiar)
}
