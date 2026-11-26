import { useEffect, useRef } from 'react'

type Serie = { nombre: string; color: string; valores: number[] }
const compacta = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 })
const fechaCorta = new Intl.DateTimeFormat('es', { month: 'short', day: 'numeric' })
const MARGEN = { izq: 44, der: 12, arriba: 12, abajo: 28 }

export function TendenciaActividad({ series, dias, elegido, onElegir }: {
  series: Serie[]; dias: Date[]; elegido: number; onElegir(i: number): void
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = lienzo.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    function pintar() {
      if (!canvas || !ctx) return
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const escala = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * escala)
      canvas.height = Math.round(height * escala)
      ctx.setTransform(escala, 0, 0, escala, 0, 0)
      const estilos = getComputedStyle(canvas)
      const color = (nombre: string) => estilos.getPropertyValue(nombre).trim()
      const maximo = Math.max(1, ...series.flatMap(s => s.valores).filter(Number.isFinite))
      const unidad = 10 ** Math.floor(Math.log10(maximo))
      const techo = Math.ceil(maximo / unidad) * unidad
      const ancho = width - MARGEN.izq - MARGEN.der
      const alto = height - MARGEN.arriba - MARGEN.abajo
      const x = (i: number) => MARGEN.izq + ancho * i / (dias.length - 1)
      const y = (valor: number) => MARGEN.arriba + alto * (1 - valor / techo)
      ctx.font = '11px Inter, system-ui, sans-serif'
      ctx.fillStyle = color('--muted')
      ctx.strokeStyle = color('--line-hover')
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.setLineDash([2, 4])
      for (let i = 0; i <= 4; i++) {
        const valor = techo * i / 4
        ctx.beginPath(); ctx.moveTo(x(0), y(valor)); ctx.lineTo(x(dias.length - 1), y(valor)); ctx.stroke()
        ctx.fillText(compacta.format(valor), MARGEN.izq - 7, y(valor))
      }
      ctx.setLineDash([])
      const marcas = width < 380 ? 2 : 4
      for (let i = 0; i <= marcas; i++) {
        const dia = Math.round(i * (dias.length - 1) / marcas)
        ctx.textAlign = i === 0 ? 'left' : i === marcas ? 'right' : 'center'
        ctx.fillText(fechaCorta.format(dias[dia]), x(dia), height - 9)
      }
      ctx.beginPath(); ctx.moveTo(x(elegido), y(techo)); ctx.lineTo(x(elegido), y(0)); ctx.stroke()
      for (const s of series) {
        ctx.strokeStyle = ctx.fillStyle = color(s.color)
        ctx.lineWidth = 1.75
        ctx.beginPath()
        s.valores.forEach((v, i) => {
          if (!Number.isFinite(v)) return
          if (i && Number.isFinite(s.valores[i - 1])) ctx.lineTo(x(i), y(v))
          else ctx.moveTo(x(i), y(v))
        })
        ctx.stroke()
        const valor = s.valores[elegido]
        if (Number.isFinite(valor)) {
          ctx.beginPath(); ctx.arc(x(elegido), y(valor), 3.5, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
    const observar = new ResizeObserver(pintar)
    observar.observe(canvas)
    pintar()
    return () => observar.disconnect()
  }, [series, dias, elegido])

  return <div className="actividad-tendencia">
    <canvas ref={lienzo} aria-label="Tendencia diaria" onClick={e => {
      const r = e.currentTarget.getBoundingClientRect()
      const proporcion = (e.clientX - r.left - MARGEN.izq) / (r.width - MARGEN.izq - MARGEN.der)
      onElegir(Math.max(0, Math.min(dias.length - 1, Math.round(proporcion * (dias.length - 1)))))
    }} />
    <div className="actividad-tendencia-pie">
      {series.map(s => <span key={s.nombre}><i style={{ background: `var(${s.color})` }} />{s.nombre}</span>)}
      <input type="range" min={0} max={dias.length - 1} value={elegido} aria-label="Día de la gráfica"
        aria-valuetext={fechaCorta.format(dias[elegido])} onChange={e => onElegir(Number(e.target.value))} />
    </div>
  </div>
}
