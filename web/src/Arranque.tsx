import { useEffect, useState } from 'react'

/**
 * Lo que lleva arrancando un agente que tarda (Antigravity). El programa no dice cómo va: se estima contra lo que tardó la
 * última vez en esta computadora, y para en 95 % hasta que acabe de verdad.
 */
export const porcentaje = (desde: number, dura: number, ahora: number) => Math.min(95, Math.max(1, Math.floor(((ahora - desde) / dura) * 100)))

export function Arranque({ texto, desde, dura }: { texto: string; desde: number; dura: number }) {
  const [ahora, setAhora] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const hecho = porcentaje(desde, dura, ahora)
  return (
    <div className="arranque" role="progressbar" aria-label={texto} aria-valuenow={hecho} aria-valuemin={0} aria-valuemax={100}>
      <span className="arranque-texto">
        {texto}
        <b>{hecho} %</b>
      </span>
      <span className="arranque-barra">
        <span style={{ width: `${hecho}%` }} />
      </span>
    </div>
  )
}
