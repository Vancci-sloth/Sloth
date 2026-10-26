import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Avance, Card } from '../../shared/types'
import type { Pasos } from './Etapas'
import { Icono } from './Iconos'
import { Segmento } from './Segmento'

/**
 * El monitor del estudio, uno solo para todos los estilos en la fase Video (`useMonitor` y `Monitor`). Enseña el video
 * en vivo, sin renderizar: lo arma el motor de Sloth (`server/motor.ts`) para cualquier proyecto de Remotion, y cada vez
 * que el agente cambia algo llega una versión nueva, que se carga detrás de la que se ve y la reemplaza en el mismo
 * segundo, sin parpadeo. Si no hay motor, la vista en vivo de la skill o el render. Con el video en pausa, un clic en el
 * cuadro elige lo que hay debajo para pedir un cambio. Debajo, la barra de transporte; la línea de tiempo va en
 * `LineaDeTiempo.tsx`, y quien junta las dos es `Editor.tsx`.
 */

/** Lo que el estudio le da a su parte de video. */
export type PropsDeVideo = {
  sessionId: string
  card: Card
  avance: Avance
  p: Pasos
  /** Las etapas de la fase Video, por su índice en `p.etapas`. */
  deVideo: number[]
  /** Si se ve la fase Video. Fuera de ella el monitor se esconde, pero la línea de tiempo sigue abajo. */
  visible: boolean
  /** Lleva el estudio a la fase Video: tocar la línea de tiempo desde otra fase es querer verlo. */
  onVer(): void
}

/**
 * El segundo que suena, fuera del estado de React: cambia 30 veces por segundo y solo lo leen quienes lo pintan (el
 * reloj, el cabezal, la escena en curso), cada uno por su cuenta (`useTiempo`).
 */
export type Reloj = { get(): number; set(t: number): void; oir(f: () => void): () => void }
function crearReloj(): Reloj {
  let t = 0
  const oyentes = new Set<() => void>()
  return {
    get: () => t,
    set(v) {
      if (v === t) return
      t = v
      oyentes.forEach((f) => f())
    },
    oir: (f) => (oyentes.add(f), () => void oyentes.delete(f))
  }
}
export const useTiempo = (r: Reloj) => useSyncExternalStore(r.oir, r.get)

/** El video que dice el motor: cuánto dura, a cuántos cuadros por segundo y su tamaño. */
export type Info = { duracion: number; fps: number; ancho: number; alto: number }
/** Una escena del video según el motor (sus secuencias de Remotion), en segundos. */
export type EscenaMotor = { nombre: string; desde: number; hasta: number }
/** Un audio que suena en el video: de dónde sale y en qué tramo. `recorte`: desde qué segundo del archivo. */
export type AudioMotor = { src: string; desde: number; hasta: number; recorte: number }
/**
 * Una pieza del video (un texto, una imagen, el 3D…) y el tramo en que se ve, según el sondeo del motor. `clave`: los
 * componentes de los que sale, la misma que trae lo elegido en el cuadro.
 */
export type PiezaMotor = { clave: string; componentes: string[]; tipo: string; texto: string; desde: number; hasta: number }
/** Lo elegido con un clic en el cuadro. `caja`, en fracciones del cuadro; `t`, el segundo en que se eligió. */
export type Elemento = { tipo: string; texto: string; componentes: string[]; caja: { x: number; y: number; w: number; h: number }; t: number; clave?: string }

type Marco = { url: string; n: number }

/**
 * La vista en vivo va en la otra dirección de esta computadora (`127.0.0.1` si Sloth es `localhost`, y al revés): para el
 * navegador es otro sitio y la carga en su propio proceso. Armar su primer cuadro (el video, Three.js, sus texturas) tarda
 * segundos, y en el mismo proceso congelaba la interfaz entera cada vez que el agente cambiaba algo. Se habla con ella por
 * `postMessage`, que no necesita el mismo sitio (`server/origen.ts` la deja abrir así).
 */
const aparte = (ruta: string) => `${location.protocol}//${location.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'}:${location.port}${ruta}`

/**
 * Todo lo que suena en el monitor, sea el motor en vivo, la vista en vivo de la skill o el render: qué se ve, el segundo,
 * si suena, y cómo moverlo. Lo que pide el usuario (velocidad, silencio, bucle) vale también para la versión que llega.
 */
export function useMonitor({ sessionId, avance, p, visible, onVer }: PropsDeVideo, al: { elegido(e: Elemento | null): void; tecla(code: string, shift: boolean): void }) {
  const { motor, vivo, renders } = avance.monitor ?? { renders: [] }
  // El motor, en cuanto tiene su primera versión; mientras, la vista en vivo de la skill si la trae.
  const url = motor && motor.v > 0 ? aparte(`${motor.url}?v=${motor.v}`) : vivo ? aparte(`${vivo.url}?t=${Math.round(vivo.t)}`) : undefined
  // El render que tocaste en la galería va en el hash (`#/s/<id>/<archivo>`): se ve ese.
  const [cual, setCual] = useState(() => decodeURIComponent(location.hash.split('/')[3] ?? ''))
  const render = renders.find((v) => v.ruta === cual) ?? renders[0]
  const [pide, setPide] = useState<'vivo' | 'render'>(() => (renders.some((v) => v.ruta === cual) ? 'render' : 'vivo'))
  const modo = pide === 'render' && render ? 'render' : url ? 'vivo' : render ? 'render' : 'nada'

  const reloj = useRef<Reloj>(null as never)
  reloj.current ??= crearReloj()
  const [playing, setPlaying] = useState(false)
  const [info, setInfo] = useState<Info>()
  const [escenas, setEscenas] = useState<EscenaMotor[]>([])
  const [audios, setAudios] = useState<AudioMotor[]>([])
  const [piezas, setPiezas] = useState<PiezaMotor[]>([])
  const [error, setError] = useState('')
  const [velocidad, setVelocidad] = useState(1)
  const [silencio, setSilencio] = useState(false)
  const [bucle, setBucle] = useState(false)
  const [rango, setRango] = useState<[number, number]>()
  const ajustes = useRef({ velocidad, silencio, bucle, rango, playing })
  ajustes.current = { velocidad, silencio, bucle, rango, playing }
  const alRef = useRef(al)
  alRef.current = al

  // La vista en vivo se carga la primera vez que se ve la fase Video, y luego solo se esconde.
  const [montado, setMontado] = useState(visible)
  if (visible && !montado) setMontado(true)

  // Dos marcos: el que se ve y el nuevo, que carga detrás. Cuando el nuevo dice `listo`, se pone en el segundo del que se
  // ve (y suena si sonaba) y lo reemplaza.
  const [marcos, setMarcos] = useState<{ actual?: Marco; nuevo?: Marco }>({})
  const marcosRef = useRef(marcos)
  marcosRef.current = marcos
  const contador = useRef(0)
  const elems = useRef(new Map<number, HTMLIFrameElement>())
  useEffect(() => {
    if (!url || !montado) return
    setMarcos((m) => {
      if (m.nuevo?.url === url || (!m.nuevo && m.actual?.url === url)) return m
      const nuevo = { url, n: ++contador.current }
      return m.actual ? { actual: m.actual, nuevo } : { actual: nuevo }
    })
  }, [url, montado])
  const ventana = (m?: Marco) => (m ? elems.current.get(m.n)?.contentWindow : undefined)
  const mandarA = (m: Marco | undefined, msg: object) => ventana(m)?.postMessage(msg, '*')
  const mandar = (msg: object) => mandarA(marcosRef.current.actual, msg)

  /** Lo que el usuario pidió, para un marco que acaba de cargar. */
  function ajustar(m: Marco) {
    const a = ajustes.current
    mandarA(m, { vivo: 'velocidad', x: a.velocidad })
    mandarA(m, { vivo: 'silencio', si: a.silencio })
    mandarA(m, { vivo: 'bucle', si: a.bucle, desde: a.rango?.[0], hasta: a.rango?.[1] })
    mandarA(m, { vivo: 'ir', t: reloj.current.get() })
  }

  // El nuevo tiene medio minuto para cargar; si no, se queda el que se ve.
  useEffect(() => {
    if (!marcos.nuevo) return
    const n = marcos.nuevo.n
    const timer = setTimeout(() => {
      if (marcosRef.current.nuevo?.n !== n) return
      setError('La versión nueva no cargó: se ve la anterior.')
      setMarcos((m) => ({ actual: m.actual }))
    }, 30000)
    return () => clearTimeout(timer)
  }, [marcos.nuevo?.n])

  useEffect(() => {
    if (modo !== 'vivo') return
    const oir = (e: MessageEvent) => {
      const d = e.data
      if (!d?.vivo) return
      const { actual, nuevo } = marcosRef.current
      const deNuevo = !!nuevo && e.source === ventana(nuevo)
      if (!deNuevo && !(actual && e.source === ventana(actual))) return
      if (d.vivo === 'escenas') {
        setEscenas(d.escenas ?? [])
        setAudios(d.audios ?? [])
      } else if (d.vivo === 'piezas') setPiezas(d.piezas ?? [])
      else if (d.vivo === 'error') {
        setError(deNuevo ? `El último cambio falló al verse: ${d.mensaje} · se ve la versión anterior.` : `El video falló: ${d.mensaje}`)
        if (deNuevo) setMarcos((m) => ({ actual: m.actual }))
      } else if (d.vivo === 'listo') {
        if (d.fps) setInfo({ duracion: d.duracion, fps: d.fps, ancho: d.ancho, alto: d.alto })
        // La vista en vivo de una skill solo dice cuánto dura.
        else if (d.duracion) setInfo((i) => ({ fps: 30, ancho: 0, alto: 0, ...i, duracion: d.duracion }))
        const m = deNuevo ? nuevo! : actual!
        ajustar(m)
        if (!deNuevo) return
        if (ajustes.current.playing) mandarA(m, { vivo: 'play' })
        // Un respiro para que pinte su primer cuadro, y entonces reemplaza al que se ve. Si sonaba, el que se ve siguió
        // avanzando mientras tanto: el nuevo salta a donde va.
        setTimeout(() => {
          if (marcosRef.current.nuevo?.n !== m.n) return
          if (ajustes.current.playing) mandarA(m, { vivo: 'ir', t: reloj.current.get() })
          setError('')
          setMarcos({ actual: m })
        }, 150)
      } else if (deNuevo) return
      else if (d.vivo === 'tiempo') {
        reloj.current.set(d.t)
        setPlaying(!!d.playing)
      } else if (d.vivo === 'elegido') alRef.current.elegido(d.elemento ?? null)
      else if (d.vivo === 'tecla') alRef.current.tecla(d.code, !!d.shift)
    }
    addEventListener('message', oir)
    return () => {
      removeEventListener('message', oir)
      setPlaying(false)
    }
  }, [modo])

  // El render: un `<video>`, con su segundo leído a cada cuadro mientras suena.
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!playing || modo !== 'render') return
    let raf = 0
    const paso = () => {
      const v = video.current
      if (v) {
        const [a, b] = ajustes.current.rango ?? []
        if (ajustes.current.bucle && b !== undefined && v.currentTime >= b) v.currentTime = a!
        reloj.current.set(v.currentTime)
      }
      raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [playing, modo])
  const eventos = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onLoadedMetadata: (e: { currentTarget: HTMLVideoElement }) => {
      const v = e.currentTarget
      v.currentTime = reloj.current.get()
      v.playbackRate = ajustes.current.velocidad
      setInfo({ duracion: v.duration, fps: 30, ancho: v.videoWidth, alto: v.videoHeight })
    }
  }

  const infoRef = useRef(info)
  infoRef.current = info
  const modoRef = useRef(modo)
  modoRef.current = modo
  const ir = useCallback((t: number) => {
    const d = infoRef.current?.duracion
    t = Math.max(0, d ? Math.min(t, d) : t)
    reloj.current.set(t)
    if (modoRef.current === 'vivo') return mandar({ vivo: 'ir', t })
    if (video.current) video.current.currentTime = t
  }, [])

  function play() {
    if (modo === 'vivo') return mandar({ vivo: 'play' })
    const v = video.current
    if (v) {
      v.currentTime = reloj.current.get()
      v.play().catch(() => {})
    }
  }
  function pausa() {
    if (modo === 'vivo') return mandar({ vivo: 'pausa' })
    video.current?.pause()
  }
  const toggle = () => (playing ? pausa() : play())

  // Lo que se pide se aplica al instante en el marco que se ve (o en el `<video>`).
  useEffect(() => {
    mandar({ vivo: 'velocidad', x: velocidad })
    if (video.current) video.current.playbackRate = velocidad
  }, [velocidad])
  useEffect(() => {
    mandar({ vivo: 'silencio', si: silencio })
    if (video.current) video.current.muted = silencio
  }, [silencio])
  useEffect(() => {
    mandar({ vivo: 'bucle', si: bucle, desde: rango?.[0], hasta: rango?.[1] })
    if (video.current) video.current.loop = bucle && !rango
  }, [bucle, rango])

  // Fuera de la fase Video no suena nada.
  useEffect(() => {
    if (!visible) pausa()
  }, [visible])

  /** Cambia entre en vivo y el render, parando lo que suene. */
  function elegirModo(v: 'vivo' | 'render') {
    pausa()
    setPide(v)
  }
  /** Cambia de render (el episodio en la otra forma, un corte), desde el principio. */
  function elegirRender(ruta: string) {
    pausa()
    ir(0)
    setCual(ruta)
    setPide('render')
  }

  return {
    sessionId,
    visible,
    onVer,
    modo,
    motor,
    url,
    render,
    renders,
    montado,
    marcos,
    elems,
    video,
    eventos,
    reloj: reloj.current,
    playing,
    info,
    duracion: info?.duracion ?? 0,
    escenas,
    audios,
    piezas,
    // Mientras el agente trabaja, un cambio a medias (un archivo que ya importa lo que el otro aún no tiene) no es un error:
    // se sigue viendo la versión anterior y la siguiente lo arregla. Solo se dice si sigue al acabar.
    error: p.working ? '' : error || (motor?.error ? `El último cambio no se pudo ver: ${motor.error} · se ve la versión anterior.` : ''),
    velocidad,
    setVelocidad,
    silencio,
    setSilencio,
    bucle,
    setBucle,
    rango,
    setRango,
    ir,
    play,
    pausa,
    toggle,
    /** Quita lo elegido en el cuadro (su contorno). */
    soltar: () => mandar({ vivo: 'soltar' }),
    elegirModo,
    elegirRender
  }
}

export type MonitorDeVideo = ReturnType<typeof useMonitor>

/**
 * El monitor de la fase Video: el escenario con el video (en vivo o el render) y la barra de transporte. `escena`, lo que
 * dice de la escena en curso; `antes` y `despues` saltan de escena; `vertical`, la forma si el motor aún no la dijo. Lo de
 * cada estilo (`children`) va en el transporte.
 */
export function Monitor({ m, escena, antes, despues, vertical, label, children }: { m: MonitorDeVideo; escena?: ReactNode; antes?(): void; despues?(): void; vertical?: boolean; label?: string; children?: ReactNode }) {
  const { modo, info, render } = m
  // La forma del video: la que dice el motor o el render; si aún no la dijo, la del estilo o la del render guardado.
  const ratio = info?.ancho && info.alto ? info.ancho / info.alto : (vertical ?? render?.vertical) ? 9 / 16 : 16 / 9
  const armando = modo === 'vivo' && (!!m.marcos.nuevo || !!m.motor?.armando)
  const errorMotor = m.motor?.error
  return (
    <section className="estudio-centro estudio-video" style={m.visible ? undefined : { display: 'none' }} aria-label={label}>
      <div className="escenario">
        <div className="monitor-caja">
          <div className="monitor" style={{ '--ratio': ratio } as React.CSSProperties} onClick={modo === 'render' ? m.toggle : undefined}>
            {render && <video ref={m.video} src={`/api/sessions/${m.sessionId}/archivo?ruta=${encodeURIComponent(render.ruta)}&t=${Math.round(render.t)}`} preload="metadata" hidden={modo !== 'render'} {...m.eventos} />}
            {/* El marco que se ve y, detrás, el nuevo que carga. Atienden ellos sus clics: elegir o pausar. */}
            {m.montado &&
              modo === 'vivo' &&
              [m.marcos.actual, m.marcos.nuevo].map(
                (f) =>
                  f && (
                    <iframe
                      key={f.n}
                      ref={(el) => void (el ? m.elems.current.set(f.n, el) : m.elems.current.delete(f.n))}
                      src={f.url}
                      allow="autoplay"
                      title="Video en vivo"
                      className={f === m.marcos.actual ? undefined : 'monitor-nuevo'}
                    />
                  )
              )}
            {modo === 'nada' && <div className="monitor-vacio muted">{m.motor?.armando ? 'Preparando el video en vivo…' : errorMotor && m.error ? `No se pudo armar el video en vivo: ${errorMotor}` : 'El video aparece aquí en cuanto el agente lo arme…'}</div>}
            {modo === 'render' && !m.playing && (
              <span className="monitor-play">
                <Icono de="video" />
              </span>
            )}
            {armando && (
              <span className="monitor-aviso">
                <span className="spinner" /> Actualizando
              </span>
            )}
          </div>
        </div>
      </div>
      {modo === 'vivo' && m.error && (
        <div className="monitor-error small" title={m.error}>
          {m.error}
        </div>
      )}
      <div className="transporte">
        <button className="transporte-boton" disabled={!antes} title="Escena anterior" onClick={antes}>
          <Icono de="atras" />
        </button>
        <button className="transporte-play" disabled={modo === 'nada'} title="Reproducir o pausar (espacio)" onClick={m.toggle}>
          <Icono de={m.playing ? 'pausa' : 'video'} />
        </button>
        <button className="transporte-boton" disabled={!despues} title="Escena siguiente" onClick={despues}>
          <Icono de="adelante" />
        </button>
        <Reloj m={m} />
        <span className="transporte-escena small">{escena}</span>
        {children}
        {/* El render solo se elige si lo hay: lo normal es verlo en vivo. */}
        {render && m.url && (
          <Segmento
            label="Qué se ve"
            valor={modo === 'render' ? 'render' : 'vivo'}
            opciones={[
              { id: 'vivo', texto: 'En vivo', title: 'El video tal cual saldrá, sin renderizar, al día con lo último del agente' },
              { id: 'render', texto: 'Render', title: `El video renderizado: ${render.ruta}` }
            ]}
            onCambio={m.elegirModo}
          />
        )}
        {modo === 'render' && m.renders.length > 1 && (
          <select className="monitor-cual" aria-label="Qué video se ve" value={render?.ruta} onChange={(e) => m.elegirRender(e.target.value)}>
            {m.renders.map((v) => (
              <option key={v.ruta} value={v.ruta}>
                {v.ruta.split('/').pop()!.replace(/\.\w+$/, '')}
                {v.vertical === undefined ? '' : v.vertical ? ' · vertical' : ' · horizontal'}
              </option>
            ))}
          </select>
        )}
        {modo === 'render' && render?.viejo && <span className="small render-viejo">Desactualizado: cambió {render.viejo.ruta}</span>}
        <button className={`transporte-boton ${m.silencio ? 'on' : ''}`} title={m.silencio ? 'Con sonido' : 'Sin sonido'} onClick={() => m.setSilencio(!m.silencio)}>
          <Icono de={m.silencio ? 'silencio' : 'sonido'} />
        </button>
        <button className={`transporte-boton ${m.bucle ? 'on' : ''}`} title={m.rango ? 'Repetir el tramo elegido' : 'Repetir el video'} onClick={() => m.setBucle(!m.bucle)}>
          <Icono de="bucle" />
        </button>
        <div className="transporte-velocidad" role="radiogroup" aria-label="Velocidad">
          {[0.5, 1, 1.5, 2].map((x) => (
            <button key={x} role="radio" aria-checked={m.velocidad === x} className={m.velocidad === x ? 'on' : ''} onClick={() => m.setVelocidad(x)}>
              {x}×
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/** El segundo que suena y lo que dura, con centésimas: se pinta solo a cada cuadro. */
function Reloj({ m }: { m: MonitorDeVideo }) {
  const t = useTiempo(m.reloj)
  return (
    <span className="mono small transporte-reloj">
      {reloj(t, true)} <span className="muted">/ {reloj(m.duracion, true)}</span>
    </span>
  )
}

/** `1:05` o, con `fino`, `1:05.32`. */
export function reloj(s: number, fino = false) {
  s = Math.max(0, s || 0)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return fino ? `${m}:${r.toFixed(2).padStart(5, '0')}` : `${m}:${String(Math.floor(r)).padStart(2, '0')}`
}
