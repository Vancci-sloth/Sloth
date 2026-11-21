import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { enLaNube, entrada } from './web'

/**
 * Desde la web (ADR 0025): si la conexión con la computadora se pierde y no vuelve sola en unos segundos, lo dice. Pasa
 * al apagarse la computadora o cerrarse Sloth, al reiniciarse (el túnel cambia de dirección y la sesión de esta se
 * pierde) o al quitar este dispositivo en Opciones. «Volver a entrar» va a la entrada del cobro, que busca la dirección
 * de ahora y regresa a esta misma vista. En cuanto vuelve, se va solo. En la nube (ADR 0026) la dirección es siempre la
 * misma: se recarga, y si el Codespace se detuvo, se enciende en GitHub.
 */
const ESPERA = 8000

export function ConexionWeb() {
  const [caida, setCaida] = useState<'no' | 'caida' | 'quitado'>('no')
  useEffect(() => {
    let reloj: ReturnType<typeof setTimeout> | undefined
    const oir = (e: Event) => {
      const d = (e as CustomEvent<boolean | 'quitado'>).detail
      if (d === true) return (clearTimeout(reloj), (reloj = undefined), setCaida('no'))
      if (d === 'quitado') return setCaida('quitado')
      // Cada reintento vuelve a avisar que no hay conexión: la espera cuenta desde la primera caída.
      reloj ??= setTimeout(() => setCaida((c) => (c === 'quitado' ? c : 'caida')), ESPERA)
    }
    addEventListener('sloth-conexion', oir)
    return () => (clearTimeout(reloj), removeEventListener('sloth-conexion', oir))
  }, [])
  if (caida === 'no') return null
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal aria-label="Sin conexión con tu Sloth">
        {caida === 'quitado' ? (
          <>
            <h2>Este dispositivo ya no está conectado</h2>
            <div className="modal-body">
              <p>Se quitó en Opciones de Sloth. Para volver a usarlo, conéctalo otra vez desde tu computadora.</p>
            </div>
          </>
        ) : enLaNube ? (
          <>
            <h2>Se perdió la conexión con tu Sloth</h2>
            <div className="modal-body">
              <p>Puede que se esté actualizando o reiniciando, o que tu Codespace se haya detenido tras un rato sin uso. Tus chats y tus videos siguen ahí.</p>
              <p className="small muted">
                Si no vuelve, enciéndelo en{' '}
                <a href="https://github.com/codespaces" target="_blank" rel="noreferrer">
                  github.com/codespaces
                </a>{' '}
                y vuelve a esta página.
              </p>
            </div>
          </>
        ) : (
          <>
            <h2>Se perdió la conexión con tu Sloth</h2>
            <div className="modal-body">
              <p>Puede que tu computadora se haya apagado, que Sloth se haya cerrado o que se esté reiniciando. Lo que hacían tus agentes sigue allá.</p>
              <p className="small muted">Si Sloth se reinició, su dirección cambió: vuelve a entrar y te lleva a donde estabas.</p>
            </div>
          </>
        )}
        <div className="modal-actions">
          <button className="primary" autoFocus onClick={() => (enLaNube ? location.reload() : (location.href = entrada()))}>
            {enLaNube ? 'Volver a intentar' : 'Volver a entrar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
