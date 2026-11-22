/**
 * El dictado en vivo (`/api/dictado/vivo`): el navegador manda trozos de audio de 250 ms y este servidor los pasa a
 * Deepgram por su WebSocket, con resultados provisionales. Al navegador solo le llega el texto (`{tipo:'texto', final}`):
 * la llave nunca viaja (`llaveDeepgram`). Uno a la vez, 12 MB y 80 s como mucho.
 */
import { WebSocket } from 'ws'
import { llaveDeepgram } from './dictado.ts'

const VIVO = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&language_hint=es&smart_format=true&interim_results=true&endpointing=300'
let activo = false

export function dictadoVivo(app: string, cliente: WebSocket, conectar = (clave: string) => new WebSocket(VIVO, { headers: { Authorization: `Token ${clave}` }, handshakeTimeout: 10_000 })) {
  const enviar = (dato: unknown) => { if (cliente.readyState === WebSocket.OPEN) cliente.send(JSON.stringify(dato)) }
  if (activo) { enviar({ error: 'Ya hay un dictado en curso.' }); cliente.close(); return }
  const clave = llaveDeepgram(app)
  if (!clave) { enviar({ error: 'Para dictar falta la llave de Deepgram: ponla en DEEPGRAM_API_KEY o en data/deepgram.key.' }); cliente.close(); return }
  activo = true
  const remoto = conectar(clave)
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
  function fallar(error: string) { enviar({ error }); limpiar() }
  remoto.on('open', () => enviar({ tipo: 'listo' }))
  remoto.on('message', (dato) => {
    try {
      const mensaje = JSON.parse(dato.toString())
      if (mensaje.type === 'Results') {
        const texto = mensaje.channel?.alternatives?.[0]?.transcript
        if (typeof texto === 'string') enviar({ tipo: 'texto', texto, final: !!mensaje.is_final })
      }
      if (mensaje.type === 'Error') fallar('Deepgram no pudo procesar el dictado.')
    } catch { fallar('Deepgram contestó algo que no se entiende.') }
  })
  remoto.on('close', () => { enviar({ tipo: 'fin' }); limpiar() })
  remoto.on('error', () => fallar('No se pudo conectar con Deepgram. Revisa la llave y la conexión.'))
  cliente.on('message', (dato, binario) => {
    if (remoto.readyState !== WebSocket.OPEN) return
    if (binario) {
      bytes += Array.isArray(dato) ? dato.reduce((n, parte) => n + parte.byteLength, 0) : dato.byteLength
      if (bytes > 12 * 1024 * 1024 || remoto.bufferedAmount > 2 * 1024 * 1024) return fallar('La conexión va muy lenta. Intenta un dictado más corto.')
      remoto.send(dato)
    } else if (dato.toString() === 'fin') remoto.send(JSON.stringify({ type: 'CloseStream' }))
  })
  cliente.on('close', limpiar)
  cliente.on('error', limpiar)
}
