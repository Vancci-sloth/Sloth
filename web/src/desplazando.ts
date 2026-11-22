import { type RefObject, useEffect } from 'react'

/**
 * Mientras se desplaza una rejilla, y hasta 200 ms después, lleva la clase `desplazando`, que le quita el ratón a lo de
 * dentro (`.desplazando > *` en styles.css): lo que pasa bajo el cursor no se levanta ni arranca su video, que era casi
 * todo el trabajo de cada cuadro del scroll. Va directo a la clase, sin estado: cambiarla no redibuja nada.
 */
export function useDesplazando(ref: RefObject<HTMLElement | null>, refDesplazamiento = ref) {
  useEffect(() => {
    const el = ref.current
    const desplazamiento = refDesplazamiento.current
    if (!el || !desplazamiento) return
    let t = 0
    const alDesplazar = () => {
      if (!t) el.classList.add('desplazando')
      clearTimeout(t)
      t = window.setTimeout(() => {
        el.classList.remove('desplazando')
        t = 0
      }, 200)
    }
    desplazamiento.addEventListener('scroll', alDesplazar, { passive: true })
    return () => {
      desplazamiento.removeEventListener('scroll', alDesplazar)
      clearTimeout(t)
      el.classList.remove('desplazando')
    }
  }, [ref, refDesplazamiento])
}
