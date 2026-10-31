/**
 * Las cuentas del navegador de cada hilo, como las de T3 Code: dónde cabe una página de tamaño fijo dentro de su panel
 * (más chica si no cabe, nunca más grande, y centrada), y cuánto crece al arrastrar uno de sus bordes.
 */
import type { PantallaNavegador } from '../../shared/types'

export const PANTALLAS: { nombre: string; pantalla: PantallaNavegador | null }[] = [
  { nombre: 'Ajustar', pantalla: null },
  { nombre: 'Escritorio', pantalla: { ancho: 1440, alto: 900 } },
  { nombre: 'Tablet', pantalla: { ancho: 820, alto: 1180 } },
  { nombre: 'Móvil', pantalla: { ancho: 390, alto: 844 } }
]

const MINIMO = 240
const MAXIMO = 3840

export const limitar = (n: number) => Math.min(MAXIMO, Math.max(MINIMO, Math.round(n) || MINIMO))

export interface Lugar {
  x: number
  y: number
  ancho: number
  alto: number
  /** Lo que se encoge para caber; 1 si cabe. */
  escala: number
}

/** Dónde va una pantalla dentro de un espacio. */
export function colocarPantalla(p: PantallaNavegador, espacio: { ancho: number; alto: number }): Lugar {
  const escala = Math.min(1, espacio.ancho / p.ancho, espacio.alto / p.alto)
  const ancho = Math.round(p.ancho * escala)
  const alto = Math.round(p.alto * escala)
  return { x: Math.max(0, Math.round((espacio.ancho - ancho) / 2)), y: Math.max(0, Math.round((espacio.alto - alto) / 2)), ancho, alto, escala }
}

/**
 * El nuevo tamaño al arrastrar un borde `delta` píxeles hacia fuera. Como va centrada, mientras cabe crece por los dos
 * lados: el doble de lo arrastrado, para que el borde siga al puntero; pasado el espacio, uno a uno.
 */
export function arrastrarBorde(inicio: number, espacio: number, delta: number) {
  const borde = inicio < espacio ? (espacio + inicio) / 2 : inicio
  const meta = borde + delta
  return meta <= espacio ? meta * 2 - espacio : meta
}
