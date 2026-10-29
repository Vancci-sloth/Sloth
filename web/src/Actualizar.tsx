import { useEffect, useState } from 'react'
import type { ActualizacionSloth } from '../../shared/types'
import { Confirm } from './Confirm'

/**
 * Mientras baja, cada cuánto se pregunta cómo va; si no, cada cuánto se mira si la ventana ya sabe de una versión nueva
 * (pregunta solo a electron/main.ts, que la busca en el cobro: una liberada en un live se ve en minutos).
 */
const BAJANDO = 1000
const CADA = 60_000

/**
 * Abajo de la barra lateral de la app que se vende: si hay una versión nueva de Sloth, el botón que la pone. Lo sabe la
 * ventana de Sloth (electron/main.ts): al confirmar baja solo lo que cambió, cierra Sloth y la vuelve a abrir actualizada.
 */
export function ActualizarSloth() {
  const sloth = window.sloth
  const [a, setA] = useState<ActualizacionSloth>()
  const [preguntar, setPreguntar] = useState(false)
  const bajando = a?.avance !== undefined

  useEffect(() => {
    if (!sloth) return
    const mirar = () => void sloth.actualizacion().then(setA, () => {})
    mirar()
    const t = setInterval(mirar, bajando ? BAJANDO : CADA)
    return () => clearInterval(t)
  }, [sloth, bajando])

  if (!sloth || !a?.nueva) return null
  if (bajando)
    return (
      <span className="muted small pie-nota">
        {a.avance === 1 ? 'Poniendo la versión nueva…' : a.sinRed ? `Sin internet: Sloth ${a.nueva} sigue bajando cuando vuelva` : `Bajando Sloth ${a.nueva}… ${Math.round(a.avance! * 100)} %`}
      </span>
    )
  return (
    <>
      <button className="aviso-sloth" title={a.novedad ?? `Actualizar a Sloth ${a.nueva}`} onClick={() => setPreguntar(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
        Actualizar a Sloth {a.nueva}
      </button>
      {a.error && <span className="bad small">{a.error}</span>}
      {preguntar && (
        <Confirm title={`¿Actualizar a Sloth ${a.nueva}?`} action={a.aMano ? 'Descargar' : 'Actualizar'} onConfirm={() => sloth.actualizar().then(setA)} onClose={() => setPreguntar(false)}>
          {a.aMano
            ? 'Se baja en tu navegador. Cierra Sloth y arrastra la nueva a Aplicaciones, encima de esta: tus videos y tus hilos se quedan.'
            : 'Se baja solo lo que cambió desde tu versión. Después Sloth se cierra y se vuelve a abrir ya actualizada: se detiene lo que esté haciendo, y tus videos y tus hilos se quedan.'}
        </Confirm>
      )}
    </>
  )
}
