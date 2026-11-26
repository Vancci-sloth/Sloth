import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { gsap } from 'gsap'

const PREFERENCIA = '(prefers-reduced-motion: reduce)'
const CONTROLES = 'button:is(.barra-nuevo,.new-chat,.primary,.boton,.ghost,.send,.picker-trigger,.notificaciones-boton,.plegar,.opciones-volver,.card,.mis-accion,.m3d-accion), .pie > button, .opciones-secciones a, .opciones-apartados-nav a, .actividad-vistas button, .opciones-agentes-lateral button'
const NAVEGACION = '.youtube-apartados, .youtube-paginacion nav, .centro-redes-nav, .opciones-secciones, .opciones-apartados-nav, .opciones-agentes-lateral'

/** El contenido entra después del cambio de React, sin bloquear clics ni desplazar el layout. */
export function useTransicionApartado(ref: RefObject<HTMLElement | null>, clave: string) {
  useLayoutEffect(() => {
    if (!ref.current || matchMedia(PREFERENCIA).matches) return
    const animacion = ref.current.animate([
      { opacity: .35, transform: 'translateY(7px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' })
    return () => animacion.cancel()
  }, [ref, clave])
}

/** Una sola escucha para los controles, incluso los de los menús que se montan después. */
export function Movimiento() {
  useEffect(() => {
    const reducir = matchMedia(PREFERENCIA)
    const pulsos = new Map<HTMLElement, gsap.core.Timeline>()
    const selecciones = new Set<HTMLElement>()
    const limpiar = () => {
      for (const pulso of pulsos.values()) pulso.revert()
      pulsos.clear()
      for (const capa of selecciones) capa.remove()
      selecciones.clear()
    }
    const pulsar = (e: MouseEvent) => {
      if (reducir.matches || !(e.target instanceof Element)) return
      const control = e.target.closest('button, a, [role="button"]')
      if (control instanceof HTMLElement) {
        const nav = control.closest(NAVEGACION)
        const previo = nav?.querySelector('[aria-current="page"], [aria-selected="true"], .active')
        if (previo instanceof HTMLElement && previo !== control && !control.matches(':disabled')) {
          limpiar()
          const desde = previo.getBoundingClientRect(), hasta = control.getBoundingClientRect()
          const capa = document.createElement('div')
          capa.className = 'movimiento-seleccion'
          Object.assign(capa.style, { left: `${hasta.left}px`, top: `${hasta.top}px`, width: `${hasta.width}px`, height: `${hasta.height}px`, borderRadius: getComputedStyle(control).borderRadius })
          document.body.append(capa)
          selecciones.add(capa)
          const animacion = capa.animate([
            { transform: `translate(${desde.left-hasta.left}px,${desde.top-hasta.top}px) scale(${desde.width/hasta.width},${desde.height/hasta.height})`, opacity: .7 },
            { transform: 'translate(0,0) scale(1)', opacity: .45, offset: .8 },
            { transform: 'translate(0,0) scale(1)', opacity: 0 },
          ], {duration: 340, easing: 'cubic-bezier(.22,1,.36,1)'})
          animacion.onfinish = () => { capa.remove(); selecciones.delete(capa) }
        }
      }
      if (!(control instanceof HTMLElement) || !control.matches(CONTROLES) || control.matches(':disabled,[aria-disabled="true"]')) return
      pulsos.get(control)?.revert()
      const pulso = gsap.timeline({ onComplete: () => {
        control.style.removeProperty('--pulso-control')
        pulsos.delete(control)
      } })
      pulsos.set(control, pulso)
      pulso.to(control, { '--pulso-control': .96, duration: .09, ease: 'power2.out' })
        .to(control, { '--pulso-control': 1, duration: .24, ease: 'power3.out' })
    }
    document.addEventListener('click', pulsar, true)
    reducir.addEventListener('change', limpiar)
    return () => {
      document.removeEventListener('click', pulsar, true)
      reducir.removeEventListener('change', limpiar)
      limpiar()
    }
  }, [])
  return null
}

/** Entrada corta para el contenido del estilo seleccionado. */
export function useEntradaEstilo(ref: RefObject<HTMLDivElement | null>, estilo: string) {
  useEffect(() => {
    const reducir = matchMedia(PREFERENCIA)
    if (reducir.matches || !ref.current) return
    const entrada = gsap.fromTo(ref.current.querySelectorAll(':scope > .new-head-fila h1, :scope > p'),
      { y: 5, opacity: .76 }, { y: 0, opacity: 1, duration: .26, ease: 'power3.out', clearProps: 'transform,opacity' })
    const limpiar = () => { entrada.revert() }
    reducir.addEventListener('change', limpiar)
    return () => {
      reducir.removeEventListener('change', limpiar)
      limpiar()
    }
  }, [ref, estilo])
}
