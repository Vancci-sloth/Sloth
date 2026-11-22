import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { useDelTema } from './temas'

/**
 * El movimiento de los temas que lo piden (`temas.ts`, Cristal), con la Web Animations API: cada animación dura menos de
 * medio segundo y acaba sola; ninguna se repite sin fin. Con «reducir movimiento» del sistema, nada se mueve. En el tema
 * Sloth no hace nada.
 *
 * - `Movimiento`: un pulso corto al pulsar un botón, y en la barra lateral y los menús de cada vista la marca de lo elegido
 *   viaja de lo de antes a lo nuevo. Una sola escucha para toda la app, también para los menús que se montan después.
 * - `useTransicionApartado`: lo de una vista entra suave al cambiar de vista.
 * - `useEntradaEstilo`: el nombre y la descripción del estilo elegido entran al cambiar de estilo.
 */

const REDUCIDO = '(prefers-reduced-motion: reduce)'
const quieto = () => matchMedia(REDUCIDO).matches
const CONTROLES = 'button:is(.new-chat,.primary,.boton,.ghost,.send,.picker-trigger,.plegar,.card,.mis-accion,.m3d-accion,.dictado-boton,.estilo-importar), .pie > button'
/** Donde la marca de lo elegido viaja de un sitio a otro. */
const NAVEGACION = '.sidebar, .youtube-apartados, .youtube-paginacion nav, .centro-redes-nav, .opciones-secciones, .opciones-apartados-nav, .opciones-agentes-lateral'

export function Movimiento() {
  const { movimiento } = useDelTema()
  useEffect(() => {
    if (!movimiento) return
    const capas = new Set<HTMLElement>()
    const pulsar = (e: MouseEvent) => {
      if (quieto() || !(e.target instanceof Element)) return
      const control = e.target.closest('button, a, [role="button"]')
      if (!(control instanceof HTMLElement) || control.matches(':disabled,[aria-disabled="true"]')) return
      const nav = control.closest(NAVEGACION)
      const previo = nav?.querySelector('.new-chat.active, .session-row.active, [aria-current="page"], [aria-selected="true"]')
      // En la barra lateral, solo sus destinos y sus hilos; en los menús de cada vista, cualquiera de sus botones.
      const destino = nav?.matches('.sidebar') ? control.matches('.new-chat, .session-row') : true
      if (previo instanceof HTMLElement && previo !== control && destino) {
        const desde = previo.getBoundingClientRect()
        const hasta = control.getBoundingClientRect()
        const capa = document.createElement('div')
        capa.className = 'movimiento-seleccion'
        Object.assign(capa.style, { left: `${hasta.left}px`, top: `${hasta.top}px`, width: `${hasta.width}px`, height: `${hasta.height}px`, borderRadius: getComputedStyle(control).borderRadius })
        document.body.append(capa)
        capas.add(capa)
        capa.animate(
          [
            { transform: `translate(${desde.left - hasta.left}px,${desde.top - hasta.top}px) scale(${desde.width / hasta.width},${desde.height / hasta.height})`, opacity: 0.7 },
            { transform: 'translate(0,0) scale(1)', opacity: 0.45, offset: 0.8 },
            { transform: 'translate(0,0) scale(1)', opacity: 0 }
          ],
          { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' }
        ).onfinish = () => (capa.remove(), capas.delete(capa))
      }
      if (control.matches(CONTROLES)) control.animate([{ scale: '1' }, { scale: '0.96', offset: 0.27 }, { scale: '1' }], { duration: 330, easing: 'ease-out' })
    }
    document.addEventListener('click', pulsar, true)
    return () => {
      document.removeEventListener('click', pulsar, true)
      for (const capa of capas) capa.remove()
    }
  }, [movimiento])
  return null
}

/** Lo de una vista entra suave cuando cambia `clave`, sin tapar los clics ni mover nada de sitio. */
export function useTransicionApartado(ref: RefObject<HTMLElement | null>, clave: string) {
  const { movimiento } = useDelTema()
  useLayoutEffect(() => {
    if (!movimiento || !ref.current || quieto()) return
    const animacion = ref.current.animate([{ opacity: 0.35, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' })
    return () => animacion.cancel()
  }, [ref, clave, movimiento])
}

/** El nombre y la descripción del estilo elegido entran al cambiar de estilo. */
export function useEntradaEstilo(ref: RefObject<HTMLElement | null>, estilo: string) {
  const { movimiento } = useDelTema()
  useEffect(() => {
    if (!movimiento || !ref.current || quieto()) return
    const animaciones = Array.from(ref.current.querySelectorAll<HTMLElement>(':scope > h1, :scope > p'), (el, i) =>
      el.animate([{ transform: 'translateY(5px)', opacity: 0.55 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 270, delay: i * 35, easing: 'ease-out', fill: 'backwards' })
    )
    return () => animaciones.forEach((a) => a.cancel())
  }, [ref, estilo, movimiento])
}
