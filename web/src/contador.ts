import { useEffect, useState } from 'react'

/**
 * El número que sube de 0 a `valor` en un momento, con la curva que frena al final: para las cifras que se quieren
 * mirar (el fondo de la comunidad, tus números en Mi perfil). A quien pide menos movimiento le sale de golpe.
 */
export function useContador(valor: number, ms = 1300) {
  const [actual, setActual] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setActual(valor)
    let raf = 0
    const inicio = performance.now()
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / ms)
      setActual(valor * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [valor, ms])
  return actual
}
