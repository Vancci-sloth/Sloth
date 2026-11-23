import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Licencia } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'
import './Licencia.css'

/** Donde PayPal enseña los pagos automáticos de cada quien, con el botón para cancelar cada uno. */
const PAGOS_DE_PAYPAL = 'https://www.paypal.com/myaccount/autopay/'
const YA = 'sloth:paypal-cancelada'
const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/**
 * El aviso de emergencia para quien apoyó con una suscripción de PayPal (`cancelarPaypal`, lo dice el cobro): Sloth ya
 * no acepta pagos por ahí, y le pide que la cancele en su PayPal. Sale al abrir, encima de todo, hasta que dice que ya
 * la canceló; «Más tarde» lo cierra solo en esta ventana. La primera vez tras actualizar, lo guardado aún no lo dice:
 * se vuelve a mirar cuando el servidor ya preguntó al cobro.
 */
export function AvisoPaypal() {
  const [hasta, setHasta] = useState<string>()
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(YA)) return
    } catch {}
    let listo = false
    const mirar = () =>
      api<Licencia>('/api/licencia').then((l) => {
        if (listo || !l.cancelarPaypal) return
        listo = true
        setHasta(l.cancelarPaypal.hasta ?? l.pagadaHasta)
        setAbierto(true)
      }, () => {})
    mirar()
    const otraVez = setTimeout(mirar, 30_000)
    return () => clearTimeout(otraVez)
  }, [])

  function yaLaCancele() {
    try {
      localStorage.setItem(YA, new Date().toISOString())
    } catch {}
    setAbierto(false)
  }

  if (!abierto) return null
  const vigente = !!hasta && Date.parse(hasta) > Date.now()
  return createPortal(
    <div className="modal-backdrop aviso-paypal-fondo">
      <div className="modal aviso-paypal" role="alertdialog" aria-modal aria-labelledby="aviso-paypal-titulo">
        <div className="aviso-paypal-banda">
          <Icono de="alerta" className="icon-trazo" />
          Aviso importante
        </div>
        <h1 id="aviso-paypal-titulo">Cancela tu suscripción de Sloth en PayPal</h1>
        <p className="aviso-paypal-grande">Sloth ya no acepta pagos por PayPal. Entra a tu PayPal y cancela tu suscripción a Sloth.</p>
        <ol>
          <li>Abre tu cuenta de PayPal.</li>
          <li>
            Ve a <b>Configuración</b> (el engrane), <b>Pagos</b> y <b>Administrar pagos automáticos</b>.
          </li>
          <li>
            Elige <b>Sloth</b> y toca <b>Cancelar</b>.
          </li>
        </ol>
        <p>
          {vigente ? (
            <>
              Tu apoyo no se pierde: tienes todo lo de Sloth hasta el <b>{fecha(hasta)}</b>.
            </>
          ) : (
            'Gracias por haber apoyado a Sloth.'
          )}{' '}
          Si quieres seguir apoyando, hazlo con tarjeta o Mercado Pago en sloth.vancci.org.
        </p>
        <div className="licencia-pie">
          <button className="primary" autoFocus onClick={() => window.open(PAGOS_DE_PAYPAL, '_blank')}>
            Abrir PayPal
          </button>
          <button className="ghost" onClick={yaLaCancele}>
            Ya la cancelé
          </button>
          <button className="ghost" onClick={() => setAbierto(false)}>
            Más tarde
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
