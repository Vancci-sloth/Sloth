import { type RefObject, useLayoutEffect } from 'react'

/**
 * Los carteles del inicio caben enteros en el espacio que queda sobre el compositor, sea cual sea la ventana: antes, a
 * 1280×800 la segunda fila salía cortada y a 1024×700 o en un celular no se veía ninguno entero. Se prueban los repartos
 * en filas parejas (6 = 6, 3+3, 2+2+2…) y se queda el de cartel más grande. Verticales, entre 3:4 y 9:16 (la forma de
 * sus previas, que son videos verticales); si así salen muy angostos, apaisados (4:3), que en poco alto se leen mejor.
 */
export function encajar(ancho: number, alto: number, n: number, hueco: number): { columnas: number; ancho: number; alto: number } {
  const repartos = (minimo: number, maximo: number) => {
    let mejor = { columnas: 1, ancho: 0, alto: 0 }
    for (let filas = 1; filas <= Math.max(1, n); filas++) {
      const c = Math.ceil(n / filas)
      if (Math.ceil(n / c) !== filas) continue
      const columna = (ancho - hueco * (c - 1)) / c
      const fila = (alto - hueco * (filas - 1)) / filas
      // Tan ancho como deja la columna, sin pasar de lo que cabe en su fila con la forma más baja.
      const w = Math.min(columna, fila / minimo)
      const h = Math.min(fila, w * maximo)
      if (w > 0 && w * h > mejor.ancho * mejor.alto) mejor = { columnas: c, ancho: Math.floor(w), alto: Math.floor(h) }
    }
    return mejor
  }
  const vertical = repartos(4 / 3, 16 / 9)
  if (vertical.ancho >= 120) return vertical
  // Angostos en vertical: el de más área de los que se leen (un vertical más angosto que MINIMO no vale aunque tenga
  // más área: a 390 de ancho salía de 92 px y todo volvía a la rejilla con scroll).
  const apaisado = repartos(3 / 4, 3 / 4)
  const leibles = [vertical, apaisado].filter((x) => x.ancho >= MINIMO)
  if (!leibles.length) return vertical
  return leibles.reduce((a, x) => (x.ancho * x.alto > a.ancho * a.alto ? x : a))
}

/** Más chicos que esto no se leen: entonces van en su rejilla de siempre, con scroll. */
export const MINIMO = 104

/**
 * Pone en la rejilla `--columnas`, `--cartel-ancho` y `--cartel-alto` según el alto que le deja su estante (lo que
 * sobra bajo su encabezado), antes de pintar y cada vez que cambia (la ventana, la barra lateral, el compositor que
 * crece). Directo al estilo, sin estado: no redibuja nada. Así el encabezado va pegado a los carteles.
 */
export function useEncajar(ref: RefObject<HTMLElement | null>, n: number) {
  useLayoutEffect(() => {
    const el = ref.current
    const estante = el?.parentElement
    if (!el || !estante) return
    const medir = () => {
      // Se mide ya encajada (sin scroll): con la barra de desplazamiento tenía 10 px menos y, al quitarla, los carteles
      // crecían un poco después de pintarse.
      el.classList.add('encajadas')
      const px = (v: string) => parseFloat(v) || 0
      const s = getComputedStyle(el)
      const e = getComputedStyle(estante)
      const encima = [...estante.children].filter((x) => x !== el).reduce((t, x) => t + (x as HTMLElement).offsetHeight + px(e.rowGap), 0)
      // El espacio de dentro, sin el relleno de la rejilla ni su margen negativo.
      const ancho = el.clientWidth - px(s.paddingLeft) - px(s.paddingRight)
      const alto = estante.clientHeight - encima - px(s.paddingTop) - px(s.paddingBottom)
      const r = encajar(ancho, alto, n, px(s.rowGap))
      const cabe = r.ancho >= MINIMO
      el.classList.toggle('encajadas', cabe)
      el.classList.toggle('apaisadas', cabe && r.ancho > r.alto)
      if (!cabe) return
      el.style.setProperty('--columnas', String(r.columnas))
      el.style.setProperty('--cartel-ancho', `${r.ancho}px`)
      el.style.setProperty('--cartel-alto', `${r.alto}px`)
    }
    medir()
    const o = new ResizeObserver(medir)
    o.observe(estante)
    return () => o.disconnect()
  }, [ref, n])
}
