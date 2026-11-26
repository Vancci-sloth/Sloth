import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { encuadre } from './encuadre'
import { Icono } from './Iconos'
import './RecortarFoto.css'

/**
 * El recortador de la foto de perfil: la foto que elegiste, dentro del círculo con el que sale en la comunidad. Se
 * arrastra para moverla, se acerca con la rueda o con la barra, y se gira de cuarto en cuarto. Sale un cuadro de 512 px
 * en WebP, que es con lo que se queda la comunidad (ahí se ve de 26 a 64 px).
 *
 * Las cuentas son las mismas al dibujar y al guardar: mover, girar y agrandar desde el centro del círculo, en ese
 * orden, así que lo que ves dentro del círculo es exactamente lo que se guarda.
 */
const SALIDA = 512

export function RecortarFoto({ archivo, onListo, onCancelar }: { archivo: File; onListo(foto: Blob): void; onCancelar(): void }) {
  const [url, setUrl] = useState('')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState('')
  const [giro, setGiro] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [lado, setLado] = useState(260)
  const marco = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const u = URL.createObjectURL(archivo)
    setUrl(u)
    const i = new Image()
    i.onload = () => setImg(i)
    i.onerror = () => setError('No se pudo abrir esa imagen.')
    i.src = u
    return () => URL.revokeObjectURL(u)
  }, [archivo])

  // El círculo crece con la caja: las cuentas necesitan su lado en px, no en porcentaje.
  useLayoutEffect(() => {
    const el = marco.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLado(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const medidas = { an: img?.naturalWidth || 1, al: img?.naturalHeight || 1, giro, zoom, lado }
  const dentro = (p: { x: number; y: number }) => {
    const { x, y } = encuadre({ ...medidas, ...p })
    return { x, y }
  }
  const { escala, ...sitio } = encuadre({ ...medidas, ...pos })

  // Al acercar o girar, la foto se queda donde cabe, sin huecos.
  useEffect(() => setPos(dentro), [zoom, giro, lado, img])

  // La rueda acerca sin mover lo de atrás (por eso va a mano: React la pone «passive»).
  useEffect(() => {
    const el = marco.current
    if (!el) return
    const rueda = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))))
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [])

  function guardar() {
    if (!img) return
    const lienzo = document.createElement('canvas')
    lienzo.width = lienzo.height = SALIDA
    const ctx = lienzo.getContext('2d')
    if (!ctx) return setError('Tu navegador no pudo recortar la foto.')
    const k = SALIDA / lado
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(SALIDA / 2 + sitio.x * k, SALIDA / 2 + sitio.y * k)
    ctx.rotate((giro * Math.PI) / 180)
    ctx.scale(escala * k, escala * k)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2, img.naturalWidth, img.naturalHeight)
    lienzo.toBlob((b) => (b ? onListo(b) : setError('No se pudo recortar la foto.')), 'image/webp', 0.9)
  }

  return (
    <div className="recortar">
      <div
        ref={marco}
        className="recortar-marco"
        onPointerDown={(e) => {
          if (arrastre.current) return
          arrastre.current = { id: e.pointerId, x: e.clientX - sitio.x, y: e.clientY - sitio.y }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const a = arrastre.current
          if (a?.id !== e.pointerId) return
          setPos(dentro({ x: e.clientX - a.x, y: e.clientY - a.y }))
        }}
        onPointerUp={() => (arrastre.current = null)}
        onPointerCancel={() => (arrastre.current = null)}
      >
        {url && (
          <img
            className="recortar-foto"
            src={url}
            alt=""
            draggable={false}
            style={{
              width: img ? `${img.naturalWidth}px` : undefined,
              height: img ? `${img.naturalHeight}px` : undefined,
              transform: img
                ? `translate(${sitio.x}px, ${sitio.y}px) rotate(${giro}deg) scale(${escala}) translate(${-img.naturalWidth / 2}px, ${-img.naturalHeight / 2}px)`
                : undefined,
              visibility: img ? undefined : 'hidden'
            }}
          />
        )}
        <div className="recortar-mascara" aria-hidden />
        <div className="recortar-aro" aria-hidden />
      </div>

      <p className="recortar-ayuda">Arrastra la foto y acércala hasta que se vea como quieres.</p>

      <div className="recortar-mandos">
        <button className="com-boton" title="Alejar" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(1, z / 1.2))}>
          <Icono de="alejar" />
        </button>
        <input
          type="range"
          className="recortar-barra"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          aria-label="Qué tan cerca"
          onChange={(e) => setZoom(Number(e.target.value))}
        />
        <button className="com-boton" title="Acercar" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(4, z * 1.2))}>
          <Icono de="acercar" />
        </button>
        <button className="com-boton" title="Girar un cuarto" aria-label="Girar un cuarto" onClick={() => setGiro((g) => (g + 90) % 360)}>
          <Icono de="girar" />
        </button>
      </div>

      {error && <p className="bad small">{error}</p>}

      <div className="com-caja-pie">
        <button className="esc-cancelar" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="esc-listo" disabled={!img} onClick={guardar}>
          Usar esta foto
        </button>
      </div>
    </div>
  )
}
