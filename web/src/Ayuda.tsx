import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icono } from './Iconos'

export function VistaAyuda({ id, ancla, menu = ancla, children, mantener, ocultar }: {
  id: string; ancla: HTMLElement; menu?: HTMLElement; children: ReactNode; mantener(): void; ocultar(): void
}) {
  const vista = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const panel = vista.current
    if (!panel) return
    if (!panel.matches(':popover-open')) panel.showPopover()
    const margen = 12
    const distancia = 8
    const lista = menu.getBoundingClientRect()
    const icono = ancla.getBoundingClientRect()
    const derecha = innerWidth - lista.right - distancia - margen
    const izquierda = lista.left - distancia - margen
    const cabeAlLado = Math.max(derecha, izquierda) >= 240
    const ladoDerecho = derecha >= 300 || derecha >= izquierda
    const ancho = Math.min(300, cabeAlLado ? Math.max(derecha, izquierda) : innerWidth - 2 * margen)
    panel.style.width = ancho + 'px'
    const alto = panel.offsetHeight
    const x = cabeAlLado ? (ladoDerecho ? lista.right + distancia : lista.left - ancho - distancia) : icono.right - ancho
    const y = cabeAlLado ? icono.top + (icono.height - alto) / 2
      : icono.bottom + distancia + alto <= innerHeight - margen ? icono.bottom + distancia : icono.top - alto - distancia
    panel.style.left = Math.max(margen, Math.min(x, innerWidth - ancho - margen)) + 'px'
    panel.style.top = Math.max(margen, Math.min(y, innerHeight - alto - margen)) + 'px'
  }, [ancla, menu, children])

  return <div id={id} ref={vista} className="picker-vista-ayuda" role="tooltip" popover="manual"
    onPointerEnter={mantener} onPointerLeave={ocultar}>{children}</div>
}

/** La misma vista previa de los selectores, junto a un control que no abre un menú. */
export function BotonAyuda({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const id = useId()
  const mantener = () => clearTimeout(espera.current)
  const mostrar = () => { mantener(); setVisible(true) }
  const ocultar = () => { mantener(); espera.current = setTimeout(() => setVisible(false), 180) }

  useEffect(() => () => clearTimeout(espera.current), [])
  useEffect(() => {
    if (!visible) return
    const cerrar = () => setVisible(false)
    const fuera = (e: PointerEvent) => {
      if (e.target instanceof Node && (boton.current?.contains(e.target) || document.getElementById(id)?.contains(e.target))) return
      cerrar()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) cerrar()
    }
    const desplazar = (e: Event) => {
      if (!(e.target instanceof Node) || !document.getElementById(id)?.contains(e.target)) cerrar()
    }
    addEventListener('pointerdown', fuera)
    addEventListener('keydown', escape)
    addEventListener('scroll', desplazar, true)
    addEventListener('resize', cerrar)
    return () => {
      removeEventListener('pointerdown', fuera)
      removeEventListener('keydown', escape)
      removeEventListener('scroll', desplazar, true)
      removeEventListener('resize', cerrar)
    }
  }, [visible, id])

  return <>
    <button ref={boton} type="button" className="boton-ayuda" aria-label={etiqueta} aria-describedby={visible ? id : undefined}
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') mostrar() }} onPointerLeave={ocultar}
      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) mostrar() }} onBlur={ocultar}
      onClick={mostrar}><Icono de="informacion" /></button>
    {visible && boton.current && <VistaAyuda id={id} ancla={boton.current} mantener={mantener} ocultar={ocultar}>{children}</VistaAyuda>}
  </>
}
