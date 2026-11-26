/** Puente de audio en vivo: la clave nunca viaja al navegador. */
import { WebSocket } from 'ws'
import { readFileSync } from 'node:fs'

let activo = false
export function dictadoVivo(cliente: WebSocket, conectar = (clave: string) => new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&language_hint=es&smart_format=true&interim_results=true&endpointing=300', { headers: { Authorization: `Token ${clave}` }, handshakeTimeout: 10_000 })) {
  const enviar = (dato: unknown) => { if (cliente.readyState === WebSocket.OPEN) cliente.send(JSON.stringify(dato)) }
  if (activo) { enviar({ error: 'Ya hay un dictado en curso.' }); cliente.close(); return }
  let clave = process.env.DEEPGRAM_API_KEY
  if (!clave) { try { clave = readFileSync('data/deepgram.key', 'utf8').trim() } catch {} }
  if (!clave) { enviar({ error: 'Falta configurar Deepgram en el servidor.' }); cliente.close(); return }
  activo = true
  const remoto = conectar(clave)
  let bytes = 0, terminado = false
  const timer = setTimeout(() => fallar('Se agotó el tiempo del dictado.'), 80_000)
  function limpiar() {
    if (terminado) return
    terminado = true
    activo = false
    clearTimeout(timer)
    remoto.terminate()
    cliente.close()
  }
  function fallar(error: string) { enviar({ error }); limpiar() }
  remoto.on('open', () => enviar({ tipo: 'listo' }))
  remoto.on('message', dato => {
    try {
      const mensaje = JSON.parse(dato.toString())
      if (mensaje.type === 'Results') {
        const texto = mensaje.channel?.alternatives?.[0]?.transcript
        if (typeof texto === 'string') enviar({ tipo: 'texto', texto, final: !!mensaje.is_final })
      }
      if (mensaje.type === 'Error') fallar('Deepgram no pudo procesar el dictado.')
    } catch { fallar('Respuesta de dictado no válida.') }
  })
  remoto.on('close', () => { enviar({ tipo: 'fin' }); limpiar() })
  remoto.on('error', () => fallar('No se pudo conectar con Deepgram. Revisa la clave y la conexión.'))
  cliente.on('message', (dato, binario) => {
    if (remoto.readyState !== WebSocket.OPEN) return
    if (binario) {
      bytes += Array.isArray(dato) ? dato.reduce((n, parte) => n + parte.byteLength, 0) : dato.byteLength
      if (bytes > 12 * 1024 * 1024 || remoto.bufferedAmount > 2 * 1024 * 1024) return fallar('La conexión es demasiado lenta. Intenta un dictado más corto.')
      remoto.send(dato)
    } else if (dato.toString() === 'fin') remoto.send(JSON.stringify({ type: 'CloseStream' }))
  })
  cliente.on('close', limpiar)
  cliente.on('error', limpiar)
}
