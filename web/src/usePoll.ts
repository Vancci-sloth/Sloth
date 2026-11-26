import { useEffect, useRef } from 'react'

/**
 * Llama a `leer` cada `cada` milisegundos mientras `activo`. Con la ventana oculta no pregunta nada: al volver a verla
 * pregunta una vez, para que no se vea lo de antes. Sin esto, cada pestaña que espera algo (una clave, una instalación)
 * seguía pidiendo al servidor aunque VyMotion estuviera minimizada.
 */
export function usePoll(leer: () => unknown, cada: number, activo: boolean) {
  const ultimo = useRef(leer)
  ultimo.current = leer
  useEffect(() => {
    if (!activo) return
    const id = setInterval(() => { if (!document.hidden) void ultimo.current() }, cada)
    const alVolver = () => { if (!document.hidden) void ultimo.current() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [activo, cada])
}
