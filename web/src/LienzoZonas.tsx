import { useRef, type PointerEvent, type ReactNode } from 'react'
import { areaDeContorno, LIMITE_PUNTOS_MARCA, type PuntoImagen } from '../../shared/estilos-imagen'

export const puntosSvg = (puntos: PuntoImagen[]) => puntos.map(({ x, y }) => `${x},${y}`).join(' ')

/** La línea abierta sigue al puntero. Solo al soltarlo se entrega un contorno al editor. */
export function LienzoZonas({ className, etiqueta, herramienta, habilitado, libre, onZona, onPunto, children }: {
  className: string; etiqueta: string; herramienta?: string; habilitado: boolean; children?: ReactNode
  libre?: boolean; onZona(puntos: PuntoImagen[]): void; onPunto?(punto: PuntoImagen): void
}) {
  const linea = useRef<SVGPolylineElement>(null)
  const dibujo = useRef<{ id: number; marco: DOMRect; puntos: PuntoImagen[]; arrastre: boolean } | null>(null)
  function punto(e: { clientX: number; clientY: number }, marco: DOMRect) {
    const limitar = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10
    return { x: limitar((e.clientX - marco.left) * 100 / marco.width), y: limitar((e.clientY - marco.top) * 100 / marco.height) }
  }
  function avanzar(e: PointerEvent<SVGSVGElement>) {
    const actual = dibujo.current
    if (!actual || actual.id !== e.pointerId) return
    for (const evento of [...(e.nativeEvent.getCoalescedEvents?.() ?? []), e]) {
      const nuevo = punto(evento, actual.marco)
      const anterior = actual.puntos[actual.puntos.length - 1]
      const distanciaPx = (p: PuntoImagen) => Math.hypot((nuevo.x - p.x) * actual.marco.width / 100, (nuevo.y - p.y) * actual.marco.height / 100)
      if (distanciaPx(actual.puntos[0]) >= 3) actual.arrastre = true
      if (libre ? distanciaPx(anterior) < 1 : Math.hypot(nuevo.x - anterior.x, nuevo.y - anterior.y) < .35) continue
      if (actual.puntos.length >= 1024) actual.puntos = actual.puntos.filter((_, i) => i % 2 === 0)
      actual.puntos.push(nuevo)
    }
    linea.current?.setAttribute('points', puntosSvg(actual.puntos))
    return actual
  }
  function cancelar(e: PointerEvent<SVGSVGElement>) {
    if (dibujo.current?.id !== e.pointerId) return
    dibujo.current = null
    linea.current?.setAttribute('visibility', 'hidden')
  }
  return <svg className={className} aria-label={etiqueta} viewBox="0 0 100 100" preserveAspectRatio="none"
    onPointerDown={e => {
      if (!habilitado || !e.isPrimary || e.button !== 0 || dibujo.current) return
      const marco = e.currentTarget.getBoundingClientRect()
      if (!marco.width || !marco.height) return
      const primero = punto(e, marco)
      e.currentTarget.setPointerCapture(e.pointerId)
      dibujo.current = { id: e.pointerId, marco, puntos: [primero], arrastre: false }
      linea.current?.setAttribute('points', puntosSvg([primero]))
      linea.current?.setAttribute('visibility', 'visible')
    }}
    onPointerMove={avanzar}
    onPointerUp={e => {
      const gesto = avanzar(e)
      cancelar(e)
      if (!habilitado || !gesto) return
      const { puntos, arrastre } = gesto
      if (!arrastre) { onPunto?.(puntos[0]); return }
      // El visor 3D guarda el cierre como un punto más del mismo contorno.
      const limite = libre ? LIMITE_PUNTOS_MARCA - 1 : LIMITE_PUNTOS_MARCA
      const zona = puntos.length <= limite ? puntos : Array.from({ length: limite }, (_, i) =>
        puntos[Math.round(i * (puntos.length - 1) / (limite - 1))])
      if (zona.length >= 3 && areaDeContorno(zona) >= .5) {
        const primero = zona[0], ultimo = zona[zona.length - 1]
        const cerrar = libre && (primero.x !== ultimo.x || primero.y !== ultimo.y)
        onZona(cerrar ? [...zona, primero] : zona)
      } else if (libre) onZona(zona)
    }}
    onPointerCancel={cancelar} onLostPointerCapture={cancelar}>
    {children}
    <polyline ref={linea} data-herramienta={herramienta} visibility="hidden" vectorEffect="non-scaling-stroke" />
  </svg>
}
