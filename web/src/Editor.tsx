import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Pasos } from './Etapas'
import { Icono } from './Iconos'
import { type Clip, LineaDeTiempo, type Pista } from './LineaDeTiempo'
import { type Elemento, Monitor, type PiezaMotor, type PropsDeVideo, reloj, type Reloj, useMonitor } from './Monitor'
import { ponerReferencia, useReferencia } from './Referencia'
import './Editor.css'

/**
 * La fase Video del estudio, la misma para todos los estilos: el monitor en vivo (`Monitor.tsx`) y la línea de tiempo
 * (`LineaDeTiempo.tsx`), que se ve también en las demás fases. Las escenas salen del motor en vivo (las secuencias de
 * Remotion) o, si la card trae `editor` (El Diff), de su guion, con la miniatura de cada una; las piezas (cada texto,
 * imagen o 3D y cuándo se ve), del sondeo del motor, que vale también para un video de una sola toma. Lo que el usuario elige —un
 * elemento del cuadro, una escena o un tramo— va al chat como referencia (`Referencia.tsx`): basta con decir qué cambiar.
 */

type Beat = { id: string; say: string; v: Record<string, any> }
type Palabra = { t: string; s: number; e: number }
type Linea = { duracion?: number; parrafos?: { inicio: number }[]; beats?: { id: string; inicio: number; fin: number; palabras?: Palabra[] }[] }
/** `formato: "vertical"`: un short de 1080x1920. */
type Guion = { formato?: string; parrafos?: { id: string; beats: Beat[] }[] }
/** Una escena del guion puesta en el tiempo. */
type Toma = Beat & { parrafo: string; inicio: number; fin: number }

/** Mientras no hay línea de tiempo, la duración de cada escena sale de contar sus palabras. */
const PALABRAS_POR_SEGUNDO = 2.6

export function Editor(props: PropsDeVideo) {
  const { sessionId, card, avance, p } = props
  const archivo = useCallback((ruta: string, t = 0) => `/api/sessions/${sessionId}/archivo?ruta=${encodeURIComponent(ruta)}&t=${Math.round(t)}`, [sessionId])
  const pub = useCallback((ruta: string) => archivo(`public/${ruta}`), [archivo])
  const files = avance.editor ?? { cuadros: {} }
  const guion = useJson<Guion>(files.guion && archivo(files.guion.ruta, files.guion.t))
  const linea = useJson<Linea>(files.linea && archivo(files.linea.ruta, files.linea.t))
  const tomas = useMemo(() => ponerEnLinea(guion, linea), [guion, linea])

  const ref = useReferencia(sessionId)
  const al = useRef({ elegido: (_e: Elemento | null) => {}, tecla: (_c: string, _s: boolean) => {} })
  const m = useMonitor(props, { elegido: (e) => al.current.elegido(e), tecla: (c, s) => al.current.tecla(c, s) })

  // Las escenas: las del guion si el estilo lo tiene (con su miniatura), y si no, las que dice el motor.
  const clips: Clip[] = useMemo(
    () =>
      tomas.length
        ? tomas.map((b) => {
            const cuadro = files.cuadros[b.id]
            return {
              id: b.id,
              marca: b.id,
              nombre: b.v?.tipo ?? '',
              desde: b.inicio,
              hasta: b.fin,
              title: `${b.id} · ${b.v?.tipo ?? ''}\n${b.say}\n\nClic: elegirla para pedir un cambio`,
              cuadro: cuadro ? <img src={archivo(cuadro.ruta, cuadro.t)} alt="" loading="lazy" /> : <Cuadro v={b.v} pub={pub} />
            }
          })
        : m.escenas.map((e, i) => ({ id: `${i}:${e.desde}`, marca: String(i + 1), nombre: e.nombre || `Escena ${i + 1}`, desde: e.desde, hasta: e.hasta })),
    [tomas, m.escenas, files.cuadros, archivo, pub]
  )
  const clipsRef = useRef(clips)
  clipsRef.current = clips

  // Las piezas, con su nombre: su texto, o el componente que las dibuja. Una capa que dura casi todo el video (el mundo,
  // los subtítulos) se llama por su componente: su texto cambia a cada rato.
  const piezas: (Clip & PiezaMotor)[] = useMemo(
    () =>
      m.piezas.map((x) => {
        const capa = !!m.duracion && x.hasta - x.desde >= m.duracion * 0.9
        const nombre = (capa ? x.componentes[0] : x.texto || x.componentes[0]) || NOMBRES[x.tipo] || 'Pieza'
        return {
          ...x,
          id: `${x.clave}@${x.desde}`,
          marca: '',
          nombre,
          title: `${nombre}\n${x.componentes.join(' › ')}\n${reloj(x.desde, true)} – ${reloj(x.hasta, true)}\n\nClic: elegirla para pedir un cambio`
        }
      }),
    [m.piezas, m.duracion]
  )
  const piezasRef = useRef(piezas)
  piezasRef.current = piezas
  const duracion = m.duracion || linea?.duracion || clips.at(-1)?.hasta || 0

  // Lo que suena, como archivo de la carpeta: la onda de la línea de tiempo y el sonido al recorrerla.
  const base = `/api/sessions/${sessionId}/vivo/`
  const pistas: Pista[] = useMemo(
    () => m.audios.filter((a) => a.src.startsWith(base)).map(({ src, ...a }) => ({ ...a, ruta: decodeURIComponent(src.slice(base.length)) })),
    [m.audios, base]
  )
  const sonar = useSonido(sessionId, pistas, m.silencio)

  // Recorrer arrastrando: el cabezal va con el ratón y el video, a cada cuadro de pantalla, al último segundo pedido.
  const pendiente = useRef<number | null>(null)
  function irA(t: number, o: { recorriendo: boolean; fin?: boolean }) {
    if (!m.visible) props.onVer()
    if (o.recorriendo && !o.fin) {
      if (m.playing) m.pausa()
      sonar(t)
    }
    m.reloj.set(t)
    if (pendiente.current === null)
      requestAnimationFrame(() => {
        if (pendiente.current !== null) m.ir(pendiente.current)
        pendiente.current = null
      })
    pendiente.current = t
  }

  // Lo elegido: una escena, un elemento del cuadro o un tramo. Elegir uno quita los otros.
  const [elegida, setElegida] = useState<string>()
  const [pieza, setPieza] = useState<string>()
  useEffect(() => {
    if (ref?.tipo !== 'escena') setElegida(undefined)
    if (ref?.tipo !== 'elemento') {
      m.soltar()
      setPieza(undefined)
    }
    if (ref?.tipo !== 'tramo') m.setRango(undefined)
  }, [ref])

  function elegirEscena(c: Clip) {
    setElegida(c.id)
    ponerReferencia(sessionId, { tipo: 'escena', nombre: `Escena ${c.marca} · ${c.nombre}`, texto: `Sobre el video: la escena ${c.marca} «${c.nombre}», de ${reloj(c.desde, true)} a ${reloj(c.hasta, true)}.` })
  }

  function elegirPieza(x: Clip & PiezaMotor) {
    const c = clips.findLast((y) => y.desde <= x.desde + 0.001)
    const escena = c ? `, en la escena ${c.marca} «${c.nombre}»` : ''
    const componentes = x.componentes.length ? ` Sale del componente ${x.componentes.join(', dentro de ')}.` : ''
    setPieza(x.id)
    ponerReferencia(sessionId, {
      tipo: 'elemento',
      nombre: `${x.nombre} · ${reloj(x.desde)} – ${reloj(x.hasta)}`,
      texto: `Sobre el video: ${TIPOS[x.tipo] ?? 'la pieza'}${x.texto ? ` ${citar(x.texto)}` : ''}, que se ve de ${reloj(x.desde, true)} a ${reloj(x.hasta, true)}${escena}.${componentes}`
    })
  }

  al.current.elegido = (e) => {
    if (!e) return void (ref?.tipo === 'elemento' && ponerReferencia(sessionId))
    // Su pieza en la línea de tiempo: la que lo contiene o va dentro de él (los componentes de uno acaban en los del
    // otro) y se ve en ese segundo, o la más cercana.
    const dentro = (a: string, b: string) => a === b || a.endsWith(` › ${b}`)
    const suyas = e.clave ? piezasRef.current.filter((x) => dentro(e.clave!, x.clave) || dentro(x.clave, e.clave!)) : []
    const cerca = (x: Clip) => (e.t < x.desde ? x.desde - e.t : e.t > x.hasta ? e.t - x.hasta : 0)
    const suya = suyas.sort((a, b) => cerca(a) - cerca(b))[0]
    const c = clipsRef.current.findLast((x) => x.desde <= e.t + 0.001)
    const tipo = TIPOS[e.tipo] ?? 'el elemento'
    const escena = c ? `, escena ${c.marca} «${c.nombre}» (de ${reloj(c.desde, true)} a ${reloj(c.hasta, true)})` : ''
    const componentes = e.componentes.length ? ` Sale del componente ${e.componentes.join(', dentro de ')}.` : ''
    const tramo = suya && cerca(suya) < 1 ? ` Se ve de ${reloj(suya.desde, true)} a ${reloj(suya.hasta, true)}.` : ''
    ponerReferencia(sessionId, {
      tipo: 'elemento',
      nombre: `${[e.componentes[0], e.texto || tipo].filter(Boolean).join(' · ')} · ${reloj(e.t, true)}`,
      texto: `Sobre el video, en ${reloj(e.t, true)}${escena}: ${tipo}${e.texto ? ` ${citar(e.texto)}` : ''}, ${lugar(e.caja)}.${tramo}${componentes}`
    })
    setPieza(suya && cerca(suya) < 1 ? suya.id : undefined)
  }

  function rango(r: [number, number] | undefined, fin?: boolean) {
    m.setRango(r)
    if (!r) return void (ref?.tipo === 'tramo' && ponerReferencia(sessionId))
    if (!fin) return
    const dentro = clips.filter((c) => c.hasta > r[0] && c.desde < r[1])
    const escenas = dentro.length ? ` (escena${dentro.length > 1 ? `s ${dentro[0].marca} a ${dentro.at(-1)!.marca}` : ` ${dentro[0].marca}`})` : ''
    ponerReferencia(sessionId, { tipo: 'tramo', nombre: `Tramo ${reloj(r[0], true)} – ${reloj(r[1], true)}`, texto: `Sobre el video: el tramo de ${reloj(r[0], true)} a ${reloj(r[1], true)}${escenas}.` })
  }

  // Saltar de escena: a la anterior (o al principio de la que suena) y a la siguiente.
  const antes = clips.length ? () => m.ir(clips.findLast((c) => c.desde < m.reloj.get() - 0.25)?.desde ?? 0) : undefined
  const despues = clips.length ? () => (({ desde }) => m.ir(desde))(clips.find((c) => c.desde > m.reloj.get() + 0.01) ?? { desde: m.reloj.get() }) : undefined

  // Las teclas, aquí y con el foco en el video: espacio, un cuadro con las flechas (un segundo con Shift), y Escape suelta.
  al.current.tecla = (code, shift) => {
    const paso = shift ? 1 : 1 / (m.info?.fps || 30)
    if (code === 'Space') m.toggle()
    else if (code === 'ArrowLeft') m.ir(m.reloj.get() - paso)
    else if (code === 'ArrowRight') m.ir(m.reloj.get() + paso)
    else if (code === 'Escape') ponerReferencia(sessionId)
  }
  useEffect(() => {
    if (!m.visible) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (!['Space', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.code) || t.isContentEditable || t.closest('input, textarea, select')) return
      if (e.code === 'Space' && t.closest('button')) return
      if (e.code === 'Escape' && !ref) return
      e.preventDefault()
      al.current.tecla(e.code, e.shiftKey)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [m.visible, !!ref])

  // Donde trabaja el agente (El Diff): se marca su escena, sin mover el cabezal.
  const foco = useFoco(guion, tomas, p.items)
  const sinEscenas = m.motor?.armando && !m.info ? 'Preparando el video en vivo…' : m.info && m.modo === 'vivo' ? 'Este video no marca escenas: recórrelo por su audio.' : 'Las escenas aparecen aquí en cuanto el agente las arme.'

  return (
    <>
      <Monitor m={m} escena={<EscenaEnCurso reloj={m.reloj} clips={clips} />} antes={antes} despues={despues} vertical={guion?.formato === 'vertical'} label={`El video de ${card.title}`} />
      <LineaDeTiempo
        sessionId={sessionId}
        duracion={duracion}
        reloj={m.reloj}
        playing={m.playing}
        escenas={clips}
        piezas={piezas}
        pistas={pistas}
        rango={m.rango}
        elegida={elegida}
        pieza={pieza}
        agente={p.working ? foco : undefined}
        sinEscenas={sinEscenas}
        onIr={irA}
        onRango={rango}
        onEscena={elegirEscena}
        onPieza={(c) => elegirPieza(c as Clip & PiezaMotor)}
      />
    </>
  )
}

const TIPOS: Record<string, string> = { texto: 'el texto', imagen: 'la imagen', video: 'el video', '3d': 'el 3D', dibujo: 'el dibujo', forma: 'la forma' }
const NOMBRES: Record<string, string> = { texto: 'Texto', imagen: 'Imagen', video: 'Video', '3d': 'El 3D', dibujo: 'Dibujo', forma: 'Forma' }

/** Un texto entre comillas, si no las trae ya. */
const citar = (t: string) => (/^[«"“]/.test(t) ? t : `«${t}»`)

/** Dónde está una caja dentro del cuadro, dicho en palabras. */
function lugar({ x, y, w, h }: Elemento['caja']) {
  if (w > 0.85 && h > 0.85) return 'ocupa todo el cuadro'
  const cx = x + w / 2
  const cy = y + h / 2
  const v = cy < 0.33 ? 'arriba' : cy > 0.66 ? 'abajo' : ''
  const l = cx < 0.33 ? 'a la izquierda' : cx > 0.66 ? 'a la derecha' : ''
  return v && l ? `${v} ${l}` : v || l || 'al centro'
}

/** La escena que suena, junto al reloj: solo se vuelve a pintar cuando cambia de escena. */
function EscenaEnCurso({ reloj: r, clips }: { reloj: Reloj; clips: Clip[] }) {
  const i = useSyncExternalStore(r.oir, () => clips.findLastIndex((c) => c.desde <= r.get() + 0.001))
  const c = clips[i]
  return c ? (
    <>
      Escena {c.marca} · <span className="muted">{c.nombre}</span>
    </>
  ) : null
}

/**
 * El sonido al recorrer la línea de tiempo: un pedacito de la voz (o de lo que suene) en cada sitio por el que pasa el
 * ratón, como al arrastrar en un editor. Sin sonido (el botón del transporte), nada.
 */
function useSonido(sessionId: string, pistas: Pista[], silencio: boolean) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const ultimo = useRef(0)
  const parar = useRef<ReturnType<typeof setTimeout>>(undefined)
  const datos = useRef({ pistas, silencio })
  datos.current = { pistas, silencio }
  // La voz primero: es lo que se busca al recorrer.
  return useCallback(
    (t: number) => {
      const { pistas, silencio } = datos.current
      const p = [...pistas].sort((a, b) => Number(/voz|narr|voice/i.test(b.ruta)) - Number(/voz|narr|voice/i.test(a.ruta))).find((x) => t >= x.desde && t < x.hasta)
      const ahora = performance.now()
      if (!p || silencio || ahora - ultimo.current < 70) return
      ultimo.current = ahora
      const a = (audio.current ??= new Audio())
      if (a.dataset.ruta !== p.ruta) {
        a.src = `/api/sessions/${sessionId}/vivo/${p.ruta.split('/').map(encodeURIComponent).join('/')}`
        a.dataset.ruta = p.ruta
      }
      a.currentTime = t - p.desde + p.recorte
      a.play().catch(() => {})
      clearTimeout(parar.current)
      parar.current = setTimeout(() => a.pause(), 120)
    },
    [sessionId]
  )
}

/**
 * La escena en la que trabaja el agente: la que acaba de cambiar en el guion (al volver a correrlo, una tanda nueva o un
 * arreglo), o la que nombra su última herramienta (`b21`, su cuadro de revisión, o una imagen que solo usa ella). Gana
 * la que pasó después.
 */
function useFoco(guion: Guion | undefined, clips: Toma[], items: Pasos['items']): string | undefined {
  const [foco, setFoco] = useState<string>()
  const antes = useRef<Map<string, string> | undefined>(undefined)
  useEffect(() => {
    if (!guion) return
    const ahora = new Map((guion.parrafos ?? []).flatMap((p) => p.beats ?? []).map((b) => [b.id, JSON.stringify([b.say, b.v])]))
    const cambio = antes.current && [...ahora].find(([id, s]) => antes.current!.get(id) !== s)?.[0]
    if (cambio) setFoco(cambio)
    antes.current = ahora
  }, [guion])

  const ultima = items.findLast((i) => i.kind === 'tool')
  const textos = useMemo(() => clips.map((c) => [c.id, JSON.stringify(c.v)] as const), [clips])
  useEffect(() => {
    if (ultima?.kind !== 'tool') return
    const dicho = JSON.stringify(ultima.input ?? '')
    const ids = new Set(textos.map(([id]) => id))
    const nombrado = [...dicho.matchAll(/\b(b\d{2,3})\b/g)].map((m) => m[1]).find((id) => ids.has(id))
    // Una imagen de public/ que solo usa una escena: la está preparando.
    const imagen = /[\w.-]+\.(png|jpe?g|webp|mp4)/i.exec(String(ultima.input?.file_path ?? ''))?.[0]
    const usan = imagen ? textos.filter(([, v]) => v.includes(imagen)) : []
    const id = nombrado ?? (usan.length === 1 ? usan[0][0] : undefined)
    if (id) setFoco(id)
  }, [ultima?.key])
  return foco
}

/**
 * La miniatura de una escena que aún no tiene su cuadro renderizado: su primer cuadro, dibujado aquí en 16:9 para los
 * tipos más comunes. Un clip es solo una marca: en la línea caben decenas de escenas, y cada video abre su conexión.
 */
function Cuadro({ v, pub }: { v: Record<string, any>; pub: (ruta: string) => string }) {
  const clip = (
    <span className="cuadro-clip">
      <Icono de="video" />
    </span>
  )
  let body: ReactNode
  if (v?.tipo === 'captura' && v.clip) body = clip
  else if (v?.tipo === 'captura' && v.img) body = <Recorte v={v} pub={pub} />
  else if (v?.tipo === 'titular')
    body = (
      <div className={`cuadro-titular ${v.color ?? ''}`}>
        {v.emoji && <img src={pub(v.emoji)} alt="" />}
        <span>{v.texto}</span>
      </div>
    )
  else if (v?.tipo === 'meme' && v.img)
    body = (
      <div className="cuadro-meme">
        <img src={pub(v.img)} alt="" loading="lazy" />
        {(v.etiquetas ?? []).map((e: any, i: number) => (
          <span key={i} style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%` }}>{e.texto}</span>
        ))}
      </div>
    )
  else if (v?.tipo === 'tarjetas')
    body = (
      <div className="cuadro-tarjetas">
        <span>{v.titulo}</span>
        <div>
          {(v.items ?? []).map((it: any, i: number) => (
            <div key={i}>{it.img && it.w ? <Recorte v={{ img: it.img, w: it.w, h: it.h, vista: it.recorte }} pub={pub} /> : it.clip || it.video ? clip : null}</div>
          ))}
        </div>
      </div>
    )
  else if (v?.tipo === 'logo') body = <div className="cuadro-titular crema"><span>{v.final ? 'Cierre' : `El Diff\n${v.fecha ?? ''}`}</span></div>
  else body = <div className="cuadro-titular"><span className="muted">{v?.tipo ?? '?'}</span></div>
  return <div className="cuadro">{body}</div>
}

type Rect = [number, number, number, number]

/**
 * Una captura recortada a su `vista`, con sus marcas. La vista cabe en el 16:9 sin deformarse: lo que sobra queda en
 * negro, como en el video.
 */
function Recorte({ v, pub }: { v: Record<string, any>; pub: (ruta: string) => string }) {
  const W: number = v.w || 1920
  const H: number = v.h || 1080
  const [x, y, w, h]: Rect = v.vista ?? [0, 0, W, H]
  const ratio = w / h
  const box = ratio >= 16 / 9 ? { width: '100%', height: `${((16 / 9) / ratio) * 100}%` } : { height: '100%', width: `${(ratio / (16 / 9)) * 100}%` }
  const at = (r: Rect) => ({ left: `${(r[0] / W) * 100}%`, top: `${(r[1] / H) * 100}%`, width: `${(r[2] / W) * 100}%`, height: `${(r[3] / H) * 100}%` })
  return (
    <div className="recorte" style={box}>
      <div className="recorte-imagen" style={{ left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%`, width: `${(W / w) * 100}%`, height: `${(H / h) * 100}%` }}>
        <img src={pub(v.img)} alt="" loading="lazy" />
        {(v.marcas ?? []).map((m: any, i: number) => m.r && <span key={i} className={m.tipo === 'marcador' ? 'marca' : 'caja'} style={at(m.r)} />)}
      </div>
    </div>
  )
}

/** Las escenas del guion con sus tiempos. Si a alguna le falta su tiempo (aún no hay línea, o es de un guion anterior), se estiman todas. */
function ponerEnLinea(guion?: Guion, linea?: Linea): Toma[] {
  const beats = (guion?.parrafos ?? []).flatMap((p) => (p.beats ?? []).map((b) => ({ ...b, parrafo: p.id })))
  const tiempos = new Map((linea?.beats ?? []).map((b) => [b.id, b]))
  const reales = beats.length > 0 && beats.every((b) => tiempos.has(b.id))
  let t = 0
  return beats.map((b) => {
    const real = reales ? tiempos.get(b.id)! : undefined
    const inicio = real?.inicio ?? t
    const fin = real?.fin ?? inicio + Math.max(1.5, String(b.say ?? '').split(/\s+/).length / PALABRAS_POR_SEGUNDO)
    t = fin
    return { ...b, inicio, fin }
  })
}

/** Un JSON de la carpeta de la sesión. La URL lleva la hora del archivo: si cambia, se vuelve a leer, y mientras llega se queda el anterior. */
function useJson<T>(url?: string): T | undefined {
  const [data, setData] = useState<T>()
  useEffect(() => {
    if (!url) return setData(undefined)
    let alive = true
    fetch(url)
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [url])
  return data
}
