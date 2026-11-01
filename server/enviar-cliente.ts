import { WebSocket } from 'ws'

/** Una ventana detenida no puede retener indefinidamente el streaming de los demás hilos. */
export const TOPE_CLIENTE = 8 * 1024 * 1024

export function enviarCliente(ws: Pick<WebSocket, 'readyState' | 'bufferedAmount' | 'send' | 'terminate'>, texto: string): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false
  // Se permite un mensaje grande con la cola vacía. El límite es de pendientes, no del tamaño de una herramienta.
  if (ws.bufferedAmount > TOPE_CLIENTE) {
    // La interfaz reconecta y relee estado + historial persistido: no se saltan eventos silenciosamente.
    ws.terminate()
    return false
  }
  ws.send(texto)
  return true
}
