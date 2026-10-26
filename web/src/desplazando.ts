import { type RefObject, useEffect } from 'react'

/**
 * Mientras se desplaza una rejilla, y hasta 200 ms después, lleva la clase `desplazando`, que le quita el ratón a lo de
 * dentro (`.desplazando > *` en styles.css): lo que pasa bajo el cursor no se levanta ni arranca su video, que era casi
 * todo el trabajo de cada cuadro del scroll. Va directo a la clase, sin estado: cambiarla no redibuja nada.
 */
export function useDesplazando(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let t = 0
    const alDesplazar = () => {
      if (!t) el.classList.add('desplazando')
      clearTimeout(t)
      t = window.setTimeout(() => {
        el.classList.remove('desplazando')
        t = 0
      }, 200)
    }
    el.addEventListener('scroll', alDesplazar, { passive: true })
    return () => {
      el.removeEventListener('scroll', alDesplazar)
      clearTimeout(t)
    }
  }, [ref])
}
