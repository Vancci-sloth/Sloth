import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EstadoVoz } from '../../shared/types'
import { api } from './api'
import { bienvenidaPendiente, BIENVENIDA_CERRADA } from './Bienvenida'
import { Icono } from './Iconos'
import { novedadesPendiente, NOVEDADES_CERRADAS } from './Novedades'
import './CreditosVoz.css'

/**
 * «Ya tienes 100,000 creditos de voz»: a toda la pantalla, una sola vez, SOLO a quien paga activamente $15 USD o más, en
 * cuanto el cobro dice que le tocan los créditos de cada mes (`vc.mensuales`, `daCreditos` en `licencias/src/voz-mensual.ts`).
 * A nadie más le sale: ni cuentas gratis, ni apoyos de menos, ni lugares gratis de Fundador. El monto es `PRECIO_MENSUAL`.
 * Espera a la bienvenida, a la guía de lo nuevo y al aviso de un estilo que cambió. «Elegir mi voz» lleva a Opciones → Voz → Voces de Sloth. Va escrito
 * en el tono de Vancci (`docs/agents/anuncios.md`), como el correo que llega con los créditos.
 * En el repo, «Ver aviso de créditos» de Opciones lo abre (`abrirCreditosVoz`).
 */
const VISTO = 'sloth-creditos-voz-visto'
const ABRIR = 'sloth-creditos-voz-abrir'
export const abrirCreditosVoz = () => dispatchEvent(new Event(ABRIR))

const visto = () => {
  try {
    return localStorage.getItem(VISTO) === '1'
  } catch {
    return true
  }
}

export function CreditosVoz() {
  const [mensuales, setMensuales] = useState<number>()
  const [abierto, setAbierto] = useState(false)
  const [espera, setEspera] = useState(() => bienvenidaPendiente() || novedadesPendiente())
  const principal = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (visto()) return
    let vivo = true
    // El servidor lee el cobro unos segundos después de arrancar.
    const t = setTimeout(() => void api<EstadoVoz>('/api/voz').then((e) => vivo && e.vc?.disponible && e.vc.mensuales && setMensuales(e.vc.mensuales), () => {}), 5000)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    const listo = () => setEspera(false)
    const abrir = () => (setMensuales((m) => m ?? 100_000), setEspera(false), setAbierto(true))
    addEventListener(BIENVENIDA_CERRADA, listo)
    addEventListener(NOVEDADES_CERRADAS, listo)
    addEventListener(ABRIR, abrir)
    return () => {
      removeEventListener(BIENVENIDA_CERRADA, listo)
      removeEventListener(NOVEDADES_CERRADAS, listo)
      removeEventListener(ABRIR, abrir)
    }
  }, [])

  useEffect(() => {
    if (!mensuales || espera || visto()) return
    // Si está el aviso de un estilo que cambió, sale cuando se cierre: uno a la vez.
    const otro = () => !!document.querySelector('.estilo-cambio')
    if (!otro()) return setAbierto(true)
    const mirar = new MutationObserver(() => !otro() && (mirar.disconnect(), setAbierto(true)))
    mirar.observe(document.body, { childList: true, subtree: true })
    return () => mirar.disconnect()
  }, [mensuales, espera])

  useEffect(() => {
    if (!abierto) return
    principal.current?.focus()
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    addEventListener('keydown', alPulsar)
    return () => removeEventListener('keydown', alPulsar)
  }, [abierto])

  function cerrar() {
    try {
      localStorage.setItem(VISTO, '1')
    } catch {
      // Sin almacenamiento: solo se ve esta vez.
    }
    setAbierto(false)
  }

  function elegir() {
    cerrar()
    location.hash = '#/opciones'
    setTimeout(() => document.getElementById('voces-de-sloth')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
  }

  if (!abierto || !mensuales) return null
  const cuantos = mensuales.toLocaleString('en-US')
  return createPortal(
    <div className="creditos-voz" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="cv-caja" role="dialog" aria-modal="true" aria-labelledby="cv-titulo">
        <button className="cv-cerrar" onClick={cerrar} aria-label="Cerrar" title="Cerrar">
          <Icono de="cerrar" />
        </button>
        <p className="cv-antetitulo">
          <Icono de="microfono" /> Por tu apoyo
        </p>
        <h2 id="cv-titulo">
          Siiiii, ya tienes <b>{cuantos}</b> creditos de voz :)))
        </h2>
        <p className="cv-texto">Neta muchisimas gracias por apoyar a Sloth, estoy bien emocionado con esto. Son para que el agente le ponga voz a tus videos, y se te refrescan CADA MES mientras sigas apoyando con $15 dolares o mas: cada mes vuelves a tener {cuantos}.</p>
        <ul className="cv-lista">
          <li>Escoge una de las voces de Sloth o clona LA TUYA con una grabacion</li>
          <li>El agente la usa solita cuando le genera la voz a tu video</li>
          <li>No se acumulan, asi que usalos sin miedo</li>
        </ul>
        <div className="cv-acciones">
          <button ref={principal} className="primary" onClick={elegir}>
            Elegir mi voz
          </button>
          <button className="ghost" onClick={cerrar}>
            Luego
          </button>
        </div>
        <p className="cv-firma">Si algo no jala o tienes dudas dime en la comunidad y lo arreglo. Un abrazoooooo, Vancci</p>
      </div>
    </div>,
    document.body
  )
}
