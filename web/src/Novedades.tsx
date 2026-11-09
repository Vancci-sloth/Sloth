import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { bienvenidaPendiente } from './Bienvenida'
import { Icono } from './Iconos'
import './Novedades.css'

/**
 * La guía de lo nuevo de una versión (`web/public/novedades/<VERSION>.html`, una página animada con «Siguiente»): sale
 * una sola vez, a toda la pantalla, al abrir la app instalada (`window.sloth`) después de actualizar. Quien instala de
 * cero tiene la bienvenida y no la ve. La guía avisa que terminó con `postMessage`; también se cierra con la X, Escape o
 * un clic fuera. Lo que sale al abrir Sloth después (`EstiloCambio.tsx`) espera a `NOVEDADES_CERRADAS`.
 * «Ver novedades» en Opciones la abre de nuevo, también en el navegador de desarrollo.
 * Para la guía de otra versión: su página en `web/public/novedades/` y su número aquí.
 */
const VERSION = '0.4.2'
const VISTA = 'sloth-novedades-vistas'
const ABRIR = 'sloth-novedades-abrir'
export const NOVEDADES_CERRADAS = 'sloth-novedades-cerradas'
export const abrirNovedades = () => dispatchEvent(new Event(ABRIR))

const vista = () => {
  try {
    return localStorage.getItem(VISTA) === VERSION
  } catch {
    return true
  }
}
const marcar = () => {
  try {
    localStorage.setItem(VISTA, VERSION)
  } catch {
    // Sin almacenamiento: solo se ve esta vez.
  }
}

/** Si la guía va a salir al abrir Sloth. */
export const novedadesPendiente = () => !!window.sloth && !vista() && !bienvenidaPendiente()

export function Novedades() {
  const [abierta, setAbierta] = useState(() => {
    if (!window.sloth || vista()) return false
    // Instaló de cero: lo nuevo para ella es todo, y eso lo cuenta la bienvenida.
    if (bienvenidaPendiente()) return (marcar(), false)
    return true
  })
  const marco = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const abrir = () => setAbierta(true)
    addEventListener(ABRIR, abrir)
    return () => removeEventListener(ABRIR, abrir)
  }, [])

  useEffect(() => {
    if (!abierta) return
    const alMensaje = (e: MessageEvent) => {
      if (e.source === marco.current?.contentWindow && e.data === 'sloth-novedades-cerrar') cerrar()
    }
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
    }
    addEventListener('message', alMensaje)
    addEventListener('keydown', alPulsar)
    return () => {
      removeEventListener('message', alMensaje)
      removeEventListener('keydown', alPulsar)
    }
  }, [abierta])

  function cerrar() {
    marcar()
    setAbierta(false)
    dispatchEvent(new Event(NOVEDADES_CERRADAS))
  }

  if (!abierta) return null
  return createPortal(
    <div className="novedades" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <iframe ref={marco} className="nov-marco" src={`/novedades/${VERSION}.html`} title={`Lo nuevo de la ${VERSION}`} allow="autoplay; encrypted-media" onLoad={() => marco.current?.focus()} />
      <button className="nov-cerrar" onClick={cerrar} aria-label="Cerrar" title="Cerrar">
        <Icono de="cerrar" />
      </button>
    </div>,
    document.body
  )
}
