import { useState } from 'react'
import { Icono } from './Iconos'
import './AvisoMacViejo.css'

/** Ya se vio en esta ventana: una recarga (Ctrl+R) no lo vuelve a sacar; abrir Sloth otra vez, sí. */
const VISTO = 'aviso-mac-viejo'

const visto = () => {
  try {
    return !!sessionStorage.getItem(VISTO)
  } catch {
    return false
  }
}

/**
 * La de Mac con macOS 12 (`window.sloth.macViejo`, scripts/compilar.mjs) lleva Electron 43 y Node 22 para poder abrir,
 * pero el programa de Claude y otras piezas piden macOS 13. Cada vez que se abre Sloth lo dice a pantalla completa, para
 * que nadie se quede con la duda de por qué algo no anda.
 */
export function AvisoMacViejo() {
  const [abierto, setAbierto] = useState(() => !!window.sloth?.macViejo && !visto())
  if (!abierto) return null
  const cerrar = () => {
    try {
      sessionStorage.setItem(VISTO, '1')
    } catch {}
    setAbierto(false)
  }
  return (
    <div className="mac-viejo" role="alertdialog" aria-modal="true" aria-labelledby="mac-viejo-titulo">
      <div className="mac-viejo-caja">
        <Icono de="alerta" className="mac-viejo-ico" />
        <h1 id="mac-viejo-titulo">Esta es la Sloth para macOS 12</h1>
        <p className="mac-viejo-sub">
          Abre en tu Mac, pero <b>es probable que tu computadora no permita algunas funciones</b>.
        </p>
        <ul>
          <li>
            <b>Claude</b> casi seguro no arranca: su programa pide macOS 13 o más nuevo. Prueba con ChatGPT u OpenCode.
          </li>
          <li>Otras cosas (algunos agentes, el navegador de los hilos, hacer videos) pueden fallar o ir lentas.</li>
          <li>
            Si tu Mac se puede actualizar a <b>macOS 13 o más nuevo</b>, actualízala y baja la Sloth normal: ahí funciona
            todo.
          </li>
        </ul>
        <button className="primary" autoFocus onClick={cerrar}>
          Entendido, quiero usarla así
        </button>
      </div>
    </div>
  )
}
