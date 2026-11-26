/**
 * Las cuentas del recortador de la foto de perfil (`RecortarFoto.tsx`), aparte para poder probarlas: de qué tamaño va
 * la foto y dónde queda su centro, para un círculo de `lado` px.
 *
 * Lo usan el que dibuja y el que guarda, así que no pueden separarse: por eso lo que ves en el círculo es lo que se
 * guarda. La escala más chica es la que llena el círculo, y el movimiento se queda en lo que cabe, así que nunca asoma
 * un hueco. Un cuarto de giro intercambia el ancho y el alto.
 */
export function encuadre({ an, al, giro, zoom, lado, x, y }: { an: number; al: number; giro: number; zoom: number; lado: number; x: number; y: number }) {
  const tumbada = giro % 180 !== 0
  // Una foto que aún no carga no trae medidas: con un 1 las cuentas siguen saliendo (y nada se dibuja todavía).
  const lados = (d: number) => (d > 0 && Number.isFinite(d) ? d : 1)
  const ancho = lados(tumbada ? al : an)
  const alto = lados(tumbada ? an : al)
  const escala = Math.max(lado / ancho, lado / alto) * zoom
  const tope = (d: number) => Math.max(0, (d * escala - lado) / 2)
  const entre = (v: number, t: number) => Math.min(Math.max(v, -t), t)
  return { escala, x: entre(x, tope(ancho)), y: entre(y, tope(alto)) }
}
