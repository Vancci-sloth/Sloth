import { memo, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icono } from './Iconos'
import { type AudioMotor, reloj, type Reloj, useTiempo } from './Monitor'
import './LineaDeTiempo.css'

/**
 * La línea de tiempo del estudio, la misma para todos los estilos y en todas las fases: la regla, las escenas, las piezas
 * (cada texto, imagen o 3D en el tramo en que se ve, en carriles) y la onda de lo que suena, con el cabezal. Se maneja como la de un editor de video: clic para ir a un segundo, arrastrar para
 * recorrer el video oyéndolo, Shift+arrastrar para marcar un tramo y Ctrl+rueda (o los botones) para acercar. Un clic en
 * una escena o una pieza la elige para pedir un cambio. El cabezal solo se mueve con el video o con el usuario.
 */

/** Una escena en la línea de tiempo, en segundos. `marca`: su número o su id (`b06`); `cuadro`: su miniatura, si la tiene. */
export type Clip = { id: string; marca: string; nombre: string; desde: number; hasta: number; cuadro?: ReactNode; title?: string }

/** Lo que suena, ya como archivo de la carpeta del hilo. */
export type Pista = Omit<AudioMotor, 'src'> & { ruta: string }

const MAX_POR_SEGUNDO = 240
/** Los carriles de piezas, como mucho: lo que no cabe se pone encima del que acaba antes. */
const MAX_CARRILES = 5
const ALTO_CARRIL = 15
const PASOS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

export function LineaDeTiempo(props: {
  sessionId: string
  duracion: number
  reloj: Reloj
  playing: boolean
  escenas: Clip[]
  piezas: Clip[]
  pistas: Pista[]
  rango?: [number, number]
  /** La escena elegida para pedir un cambio, y en la que trabaja el agente. */
  elegida?: string
  agente?: string
  /** La pieza elegida (un clic en ella o en el cuadro). */
  pieza?: string
  /** Lo que dice la pista de escenas mientras no hay ninguna. */
  sinEscenas: string
  /** Ir a un segundo (clic) o recorrer el video arrastrando (`fin` al soltar). */
  onIr(t: number, o: { recorriendo: boolean; fin?: boolean }): void
  /** Un tramo marcado con Shift+arrastrar (`fin` al soltar), o ninguno. */
  onRango(r: [number, number] | undefined, fin?: boolean): void
  onEscena(c: Clip): void
  onPieza(c: Clip): void
}) {
  const { duracion } = props
  const scroller = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  const [izq, setIzq] = useState(0)
  // Ajustada, el video entero cabe a lo ancho; acercar la suelta. Lo que se acercó se recuerda entre hilos.
  const [zoom, setZoom] = useState<number | null>(() => Number(localStorage.getItem('linea-zoom')) || null)
  const ajustado = duracion > 0 && ancho > 0 ? ancho / duracion : 20
  const porSeg = Math.max(ajustado, Math.min(MAX_POR_SEGUNDO, zoom ?? 0))
  const total = Math.max(ancho, Math.ceil(duracion * porSeg))

  useLayoutEffect(() => {
    const el = scroller.current!
    const medir = () => setAncho(el.clientWidth)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Acerca o aleja dejando quieto el segundo bajo `x` (en píxeles desde el borde de la vista). */
  function acercar(factor: number, x = ancho / 2) {
    const el = scroller.current!
    const t = (el.scrollLeft + x) / porSeg
    const nuevo = Math.max(ajustado, Math.min(MAX_POR_SEGUNDO, porSeg * factor))
    const libre = nuevo > ajustado * 1.001 ? nuevo : null
    setZoom(libre)
    if (libre) localStorage.setItem('linea-zoom', String(libre))
    else localStorage.removeItem('linea-zoom')
    requestAnimationFrame(() => (el.scrollLeft = t * nuevo - x))
  }

  // Ctrl+rueda acerca; la rueda sola desplaza a lo largo (no hay nada que subir ni bajar).
  useEffect(() => {
    const el = scroller.current!
    const rueda = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        acercarRef.current(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - el.getBoundingClientRect().left)
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [])
  const acercarRef = useRef(acercar)
  acercarRef.current = acercar

  // Arrastrar: recorrer (o marcar un tramo con Shift). Un clic sin moverse sobre una escena la elige.
  const arrastre = useRef<{ modo: 'recorrer' | 'tramo'; desde: number; x: number; movido: boolean; clip?: Clip; pieza?: Clip } | null>(null)
  const [fantasma, setFantasma] = useState<number | null>(null)
  const tiempoEn = (clientX: number) => {
    const el = scroller.current!
    return Math.max(0, Math.min(duracion, (clientX - el.getBoundingClientRect().left + el.scrollLeft) / porSeg))
  }
  const clipEn = (el: EventTarget) => {
    const id = (el as HTMLElement).closest<HTMLElement>('.clip')?.dataset.id
    return id ? props.escenas.find((c) => c.id === id) : undefined
  }
  const piezaEn = (el: EventTarget) => {
    const id = (el as HTMLElement).closest<HTMLElement>('.pieza')?.dataset.id
    return id ? props.piezas.find((c) => c.id === id) : undefined
  }

  function abajo(e: React.PointerEvent) {
    if (e.button !== 0 || !duracion || (e.target as HTMLElement).closest('.linea-barra')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const t = tiempoEn(e.clientX)
    arrastre.current = { modo: e.shiftKey ? 'tramo' : 'recorrer', desde: t, x: e.clientX, movido: false, clip: clipEn(e.target), pieza: piezaEn(e.target) }
    if (e.shiftKey) props.onRango([t, t])
    else props.onIr(t, { recorriendo: true })
  }
  function mover(e: React.PointerEvent) {
    if (!duracion) return
    const t = tiempoEn(e.clientX)
    setFantasma(t)
    const a = arrastre.current
    if (!a) return
    if (Math.abs(e.clientX - a.x) > 3) a.movido = true
    if (a.modo === 'tramo') props.onRango([Math.min(a.desde, t), Math.max(a.desde, t)])
    else props.onIr(t, { recorriendo: true })
    // Arrastrando junto al borde, la vista se desplaza sola.
    const el = scroller.current!
    const box = el.getBoundingClientRect()
    if (e.clientX > box.right - 24) el.scrollLeft += 12
    else if (e.clientX < box.left + 24) el.scrollLeft -= 12
  }
  function arriba(e: React.PointerEvent) {
    const a = arrastre.current
    arrastre.current = null
    if (!a) return
    const t = tiempoEn(e.clientX)
    if (a.modo === 'tramo') {
      const [x, y] = [Math.min(a.desde, t), Math.max(a.desde, t)]
      return props.onRango(y - x >= 0.2 ? [x, y] : undefined, true)
    }
    props.onIr(t, { recorriendo: true, fin: true })
    if (!a.movido && a.clip) props.onEscena(a.clip)
    if (!a.movido && a.pieza) props.onPieza(a.pieza)
  }

  const paso = PASOS.find((s) => s * porSeg >= 72) ?? 1200
  const primera = Math.floor(izq / porSeg / paso) * paso
  const marcas: number[] = []
  for (let t = primera; t <= Math.min(duracion, (izq + ancho) / porSeg + paso); t += paso) marcas.push(Math.round(t * 100) / 100)

  // Las pistas que hay: las escenas si las marca el video (o mientras no hay nada), las piezas en cuanto se conocen.
  const carriles = useMemo(() => enCarriles(props.piezas), [props.piezas])
  const nCarriles = carriles.length ? Math.max(...carriles) + 1 : 0
  const conEscenas = props.escenas.length > 0 || !nCarriles
  const filas = { gridTemplateRows: ['22px', conEscenas && '54px', nCarriles && `${nCarriles * ALTO_CARRIL + 8}px`, '46px'].filter(Boolean).join(' ') }

  return (
    <div className="linea">
      <div className="linea-barra">
        <span className="linea-titulo">Línea de tiempo</span>
        <span className="linea-ayuda muted">Clic: ir · Arrastra: recorrerlo con sonido · Shift+arrastra: un tramo · Ctrl+rueda: acercar · Clic en una escena o una pieza: pedir un cambio</span>
        <span className="spacer" />
        <button title="Alejar" disabled={porSeg <= ajustado * 1.001} onClick={() => acercar(0.66)}>
          <Icono de="alejar" />
        </button>
        <button title="Acercar (Ctrl+rueda)" disabled={porSeg >= MAX_POR_SEGUNDO || !duracion} onClick={() => acercar(1.5)}>
          <Icono de="acercar" />
        </button>
        <button title="Ver el video entero" disabled={!zoom} onClick={() => acercar(0)}>
          <Icono de="ajustar" />
        </button>
      </div>
      <div className="linea-nombres" style={filas}>
        <span />
        {conEscenas && <span>Escenas</span>}
        {nCarriles > 0 && <span>Piezas</span>}
        <span>Audio</span>
      </div>
      <div
        className="linea-scroll"
        ref={scroller}
        onScroll={(e) => setIzq(e.currentTarget.scrollLeft)}
        onPointerDown={abajo}
        onPointerMove={mover}
        onPointerUp={arriba}
        onPointerCancel={() => (arrastre.current = null)}
        onPointerLeave={() => setFantasma(null)}
      >
        <div className="linea-pistas" style={{ width: total, ...filas }}>
          <div className="regla">
            {marcas.map((t) => (
              <span key={t} style={{ left: t * porSeg }}>
                {paso < 1 ? reloj(t, true).replace(/0$/, '') : reloj(t)}
              </span>
            ))}
          </div>
          {conEscenas && <Escenas escenas={props.escenas} porSeg={porSeg} elegida={props.elegida} agente={props.agente} sin={props.sinEscenas} />}
          {nCarriles > 0 && <Piezas piezas={props.piezas} carriles={carriles} porSeg={porSeg} elegida={props.pieza} />}
          <Ondas sessionId={props.sessionId} pistas={props.pistas} porSeg={porSeg} izq={izq} ancho={ancho} />
          {props.rango && <div className="linea-rango" style={{ left: props.rango[0] * porSeg, width: (props.rango[1] - props.rango[0]) * porSeg }} />}
          {fantasma !== null && (
            <div className="linea-fantasma" style={{ left: fantasma * porSeg }}>
              <span className="mono">{reloj(fantasma, true)}</span>
            </div>
          )}
          {duracion > 0 && <Cabezal reloj={props.reloj} porSeg={porSeg} playing={props.playing} scroller={scroller} />}
        </div>
      </div>
    </div>
  )
}

/** El cabezal: se pinta solo con el segundo que suena y, mientras suena, no se sale de la vista. */
function Cabezal({ reloj: r, porSeg, playing, scroller }: { reloj: Reloj; porSeg: number; playing: boolean; scroller: React.RefObject<HTMLDivElement | null> }) {
  const x = useTiempo(r) * porSeg
  useEffect(() => {
    const el = scroller.current
    if (!el || !playing) return
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 80
  }, [x, playing])
  return <div className="cabezal" style={{ transform: `translateX(${x}px)` }} />
}

/** Las escenas, una tras otra, con su número y su nombre (o su miniatura). No se vuelven a pintar mientras suena. */
const Escenas = memo(function Escenas({ escenas, porSeg, elegida, agente, sin }: { escenas: Clip[]; porSeg: number; elegida?: string; agente?: string; sin: string }) {
  return (
    <div className="pista pista-escenas">
      {!escenas.length && <span className="pista-vacia muted small">{sin}</span>}
      {escenas.map((c) => {
        const ancho = (c.hasta - c.desde) * porSeg
        return (
          <div
            key={c.id}
            data-id={c.id}
            className={`clip ${c.id === elegida ? 'elegida' : ''} ${c.id === agente ? 'agente' : ''}`}
            style={{ left: c.desde * porSeg, width: Math.max(3, ancho - 2) }}
            title={c.title ?? `${c.marca} · ${c.nombre}
${reloj(c.desde, true)} – ${reloj(c.hasta, true)}

Clic: elegirla para pedir un cambio`}
          >
            {/* Con poco sitio, la escena es solo su bloque: la miniatura y el texto salen al acercar. */}
            {ancho >= 64 && c.cuadro}
            {ancho >= 26 && (
              <span className="clip-texto">
                <b>{c.marca}</b> {c.nombre}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
})

/** El carril de cada pieza (ya en orden): el primero libre; si no hay, el que acaba antes. */
function enCarriles(piezas: Clip[]): number[] {
  const fin: number[] = []
  return piezas.map((c) => {
    let k = fin.findIndex((f) => f <= c.desde + 0.01)
    if (k < 0) k = fin.length < MAX_CARRILES ? fin.length : fin.indexOf(Math.min(...fin))
    fin[k] = c.hasta
    return k
  })
}

/** Las piezas, cada una en su carril y en el tramo en que se ve. No se vuelven a pintar mientras suena. */
const Piezas = memo(function Piezas({ piezas, carriles, porSeg, elegida }: { piezas: Clip[]; carriles: number[]; porSeg: number; elegida?: string }) {
  return (
    <div className="pista pista-piezas">
      {piezas.map((c, i) => {
        const ancho = (c.hasta - c.desde) * porSeg
        return (
          <div
            key={c.id}
            data-id={c.id}
            className={`pieza ${c.id === elegida ? 'elegida' : ''}`}
            style={{ left: c.desde * porSeg, width: Math.max(3, ancho - 1), top: 4 + carriles[i] * ALTO_CARRIL }}
            title={c.title}
          >
            {ancho >= 30 && c.nombre}
          </div>
        )
      })}
    </div>
  )
})

type Onda = { porSegundo: number; picos: number[] }
const ondas = new Map<string, Promise<Onda>>()

/**
 * La onda de cada audio que suena, en su tramo: la voz arriba y el resto debajo. Se dibuja en un lienzo del ancho de la
 * vista, que se repinta al desplazar o acercar: así sirve igual para un short que para un video de media hora.
 */
function Ondas({ sessionId, pistas, porSeg, izq, ancho }: { sessionId: string; pistas: Pista[]; porSeg: number; izq: number; ancho: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [datos, setDatos] = useState<Record<string, Onda>>({})
  const orden = [...pistas].sort((a, b) => Number(/voz|narr|voice/i.test(b.ruta)) - Number(/voz|narr|voice/i.test(a.ruta)))
  const clave = orden.map((p) => p.ruta).join('|')

  useEffect(() => {
    let vivo = true
    for (const p of orden) {
      const url = `/api/sessions/${sessionId}/onda?ruta=${encodeURIComponent(p.ruta)}`
      if (!ondas.has(url)) ondas.set(url, fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))))
      ondas
        .get(url)!
        .then((o) => vivo && setDatos((d) => ({ ...d, [p.ruta]: o })))
        .catch(() => ondas.delete(url))
    }
    return () => {
      vivo = false
    }
  }, [sessionId, clave])

  useLayoutEffect(() => {
    const c = lienzo.current
    if (!c || !ancho) return
    const dpr = devicePixelRatio || 1
    const alto = c.clientHeight
    c.width = Math.round(ancho * dpr)
    c.height = Math.round(alto * dpr)
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.clearRect(0, 0, ancho, alto)
    const color = getComputedStyle(c).color
    const carriles = Math.max(1, orden.length)
    orden.forEach((p, k) => {
      const o = datos[p.ruta]
      if (!o) return
      // La voz lleva más alto y más fuerza que lo demás.
      const alto1 = k === 0 && carriles > 1 ? alto * 0.62 : carriles > 1 ? (alto * 0.38) / (carriles - 1) : alto
      const y0 = k === 0 ? 0 : alto * 0.62 + (k - 1) * alto1
      const medio = y0 + alto1 / 2
      g.fillStyle = color
      g.globalAlpha = k === 0 ? 0.75 : 0.35
      for (let x = 0; x < ancho; x += 2) {
        const t = (izq + x) / porSeg
        if (t < p.desde || t > p.hasta) continue
        const i0 = Math.floor((t - p.desde + p.recorte) * o.porSegundo)
        const i1 = Math.max(i0 + 1, Math.floor((t + 2 / porSeg - p.desde + p.recorte) * o.porSegundo))
        let v = 0
        for (let i = i0; i < i1 && i < o.picos.length; i++) v = Math.max(v, o.picos[i])
        const h = Math.max(1, (v / 255) * (alto1 - 4))
        g.fillRect(x, medio - h / 2, 1.4, h)
      }
    })
  }, [datos, porSeg, izq, ancho, clave])

  return (
    <div className="pista pista-audio">
      <canvas ref={lienzo} style={{ left: izq, width: ancho }} />
    </div>
  )
}
