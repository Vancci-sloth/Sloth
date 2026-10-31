import { type CSSProperties, type FormEvent, type PointerEvent as EventoPuntero, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type EstadoNavegador, NAVEGADOR_REDES, type PantallaNavegador } from '../../shared/types'
import { Icono } from './Iconos'
import { arrastrarBorde, colocarPantalla, type Lugar, limitar, PANTALLAS } from './navegador-medidas'
import './Navegador.css'

/**
 * El navegador de cada hilo, como el de T3 Code: el globo del encabezado lo enseña o lo esconde, a la derecha del chat (en
 * el estudio, en el centro). La página la pone la ventana de Sloth (`electron/navegador.ts`) encima de la interfaz, en la
 * caja del panel; aquí van su barra y lo que se ve sin página. La usa también el agente: cuando empieza a usarla, el
 * panel de ese hilo se abre solo. Fuera de la ventana de Sloth (en Edge) no hay navegador, y el agente usa el suyo.
 *
 * El borde izquierdo del panel se arrastra. Cada pestaña puede tener su tamaño fijo (fila del móvil), con bordes que
 * también se arrastran. La primera pestaña es la del hilo, la del agente; las demás son tuyas, y la de las redes no
 * tiene: es una sola página, la que maneja Sloth al publicar.
 */

const puente = window.sloth?.navegador
export const hayNavegador = !!puente

const CLAVE = 'sloth-navegador'
const CLAVE_PANTALLAS = 'sloth-navegador-pantallas'
const CLAVE_ANCHO = 'sloth-navegador-ancho'
const CLAVE_PESTANAS = 'sloth-navegador-pestanas'
/** El panel no baja de esto, ni deja menos que esto al chat. */
const PANEL_MINIMO = 360
/** El aire alrededor de una página de tamaño fijo: ahí van sus bordes, que la página taparía. */
const RIEL = 14

interface Pestanas {
  ids: string[]
  activa: string
}

const estados = new Map<string, EstadoNavegador>()
/** Los hilos con el panel abierto: se recuerdan al recargar. */
const abiertos = new Set<string>(leerLista())
/** El tamaño fijo de cada pestaña que lo tiene. */
const pantallas = new Map<string, PantallaNavegador>(leerGuardado(localStorage, CLAVE_PANTALLAS))
/** Las pestañas de cada hilo. Duran lo que la ventana: sus páginas no sobreviven a cerrarla. */
const pestanas = new Map<string, Pestanas>(leerGuardado(sessionStorage, CLAVE_PESTANAS))
let anchoPanel = Number(localStorage.getItem(CLAVE_ANCHO)) || 0
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((o) => o())
const suscribir = (o: () => void) => (oyentes.add(o), () => void oyentes.delete(o))

function leerLista(): string[] {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE) ?? '[]')
    return Array.isArray(l) ? l.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function leerGuardado<T>(donde: Storage, clave: string): [string, T][] {
  try {
    const l = JSON.parse(donde.getItem(clave) ?? '[]')
    return Array.isArray(l) ? l : []
  } catch {
    return []
  }
}

/** Las pestañas de un hilo; al principio, la suya. */
function pestanasDe(hilo: string) {
  let p = pestanas.get(hilo)
  if (!p) pestanas.set(hilo, (p = { ids: [hilo], activa: hilo }))
  return p
}

function ponerPestanas(hilo: string, p: Pestanas) {
  pestanas.set(hilo, p)
  sessionStorage.setItem(CLAVE_PESTANAS, JSON.stringify([...pestanas].filter(([, v]) => v.ids.length > 1)))
  avisar()
}

/** Abre una pestaña, en blanco o en `url`. */
function nuevaPestana(hilo: string, url?: string) {
  const { ids } = pestanasDe(hilo)
  const n = Math.max(1, ...ids.map((i) => Number(i.split('~')[1]) || 0)) + 1
  const id = `${hilo}~${n}`
  ponerPestanas(hilo, { ids: [...ids, id], activa: id })
  if (url) puente?.ir(id, url)
}

function cerrarPestana(hilo: string, id: string) {
  puente?.hacer(id, 'cerrar')
  estados.delete(id)
  ponerPantalla(id, null)
  const { ids, activa } = pestanasDe(hilo)
  const quedan = ids.filter((i) => i !== id)
  ponerPestanas(hilo, { ids: quedan, activa: activa === id ? quedan[Math.max(0, ids.indexOf(id) - 1)] : activa })
}

function ponerPantalla(id: string, p: PantallaNavegador | null) {
  if (p) pantallas.set(id, p)
  else pantallas.delete(id)
  // Las últimas 50: las de hilos borrados se van solas.
  localStorage.setItem(CLAVE_PANTALLAS, JSON.stringify([...pantallas].slice(-50)))
  avisar()
}

/** Abre o cierra el panel de un hilo. */
export function abrirNavegador(hilo: string, si: boolean) {
  if (abiertos.has(hilo) === si) return
  if (si) abiertos.add(hilo)
  else abiertos.delete(hilo)
  // Los últimos 50: los de hilos borrados se van solos.
  localStorage.setItem(CLAVE, JSON.stringify([...abiertos].slice(-50)))
  avisar()
}

if (puente) {
  puente.oir((e) => {
    const antes = estados.get(e.hilo)
    estados.set(e.hilo, e)
    // El agente empieza a usarlo: se abre en su hilo, para verlo trabajar. Si lo cierras, sigue cerrado hasta la próxima.
    // El de las redes no: Sloth se conecta también para mirar la sesión, y lo abren Mis videos (al subir) y Opciones.
    if (e.agente && !antes?.agente && e.hilo !== NAVEGADOR_REDES) {
      abrirNavegador(e.hilo, true)
      ponerPestanas(e.hilo, { ...pestanasDe(e.hilo), activa: e.hilo })
    }
    avisar()
  })
  puente.oirPestana?.((id, url) => nuevaPestana(id.split('~')[0], url))
  // Al recargar la interfaz, cómo van las que ya estaban (sin abrir ninguna).
  void puente.estados().then((es) => {
    for (const e of es) estados.set(e.hilo, e)
    avisar()
  })
}

export const useNavegadorAbierto = (hilo: string) => useSyncExternalStore(suscribir, () => hayNavegador && abiertos.has(hilo))
const useEstado = (hilo: string) => useSyncExternalStore(suscribir, () => estados.get(hilo))
const usePestanas = (hilo: string) => useSyncExternalStore(suscribir, () => pestanasDe(hilo))
const usePantalla = (id: string) => useSyncExternalStore(suscribir, () => pantallas.get(id))

/**
 * El globo del encabezado del hilo. `trabajando`: el hilo trabaja. El agente sigue conectado a su página entre turnos,
 * así que solo cuenta como «usándola» mientras trabaja.
 */
export function BotonNavegador({ hilo, trabajando }: { hilo: string; trabajando: boolean }) {
  const abierto = useNavegadorAbierto(hilo)
  const estado = useEstado(hilo)
  const agente = trabajando && estado?.agente
  if (!hayNavegador) return null
  return (
    <button
      className={`boton-navegador${abierto ? ' on' : ''}${agente ? ' agente' : ''}`}
      title={abierto ? 'Esconder el navegador' : agente ? 'El agente está usando el navegador: míralo' : 'Ver el navegador del hilo'}
      aria-label="Navegador del hilo"
      aria-pressed={abierto}
      onClick={() => abrirNavegador(hilo, !abierto)}
    >
      <Icono de="globo" />
    </button>
  )
}

/** Lo que escribes en la barra: una dirección, con o sin `https://`, o lo que se busca en Google. */
export function direccion(texto: string): string | null {
  const t = texto.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(t)) return `http://${t}`
  if (!/\s/.test(t) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(t)) return `https://${t}`
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

/**
 * Si algo de la interfaz tapa la caja: la página va encima de todo y taparía los modales y los menús, así que entonces se
 * esconde. Un modal o una imagen ampliada ocupan su centro; un menú desplegable, solo un trozo.
 */
function tapado(caja: HTMLElement, r: DOMRect) {
  const centro = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  if (centro && !caja.contains(centro)) return true
  for (const m of document.querySelectorAll('.picker-menu')) {
    const b = m.getBoundingClientRect()
    if (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) return true
  }
  return false
}

/** El panel: sus pestañas, su barra y, debajo, la caja donde la ventana pone la página de la pestaña. */
export function PanelNavegador({ hilo, trabajando }: { hilo: string; trabajando: boolean }) {
  const { ids, activa } = usePestanas(hilo)
  const redes = hilo === NAVEGADOR_REDES
  const e = useEstado(activa)
  const guardada = usePantalla(activa)
  const caja = useRef<HTMLDivElement>(null)
  const marco = useRef<HTMLDivElement>(null)
  const direccionEl = useRef<HTMLInputElement>(null)
  const [escrito, setEscrito] = useState<string | null>(null)
  // Mientras se arrastra un borde: se guarda al soltar.
  const [arrastre, setArrastre] = useState<PantallaNavegador | null>(null)
  const [fila, setFila] = useState(false)
  const pantalla = arrastre ?? guardada ?? null
  const conFila = !redes && (fila || !!guardada)

  const actual = useRef({ pantalla, lugar: null as Lugar | null, medir: () => {} })
  actual.current.pantalla = pantalla

  // Le dice a la ventana dónde va la página cada vez que la caja se mueve o cambia de tamaño, o algo la tapa. Una vez
  // por cuadro como mucho, y solo si cambió.
  useLayoutEffect(() => {
    const el = caja.current
    if (!el || !puente) return
    let ultimo = ''
    let pedido = 0
    const medir = () => {
      pedido = 0
      const r = el.getBoundingClientRect()
      const p = actual.current.pantalla
      const lugar = p ? colocarPantalla(p, { ancho: r.width - 2 * RIEL, alto: r.height - 2 * RIEL }) : null
      actual.current.lugar = lugar
      const dentro = lugar ? { x: lugar.x + RIEL, y: lugar.y + RIEL, width: lugar.ancho, height: lugar.alto } : { x: 0, y: 0, width: r.width, height: r.height }
      if (marco.current) Object.assign(marco.current.style, { left: `${dentro.x}px`, top: `${dentro.y}px`, width: `${dentro.width}px`, height: `${dentro.height}px` })
      const oculta = tapado(el, r)
      const ahora = oculta ? '' : `${r.x},${r.y},${dentro.x},${dentro.y},${dentro.width},${dentro.height},${p?.ancho},${p?.alto}`
      if (ahora === ultimo) return
      ultimo = ahora
      puente.ver(oculta ? null : activa, { ...dentro, x: r.x + dentro.x, y: r.y + dentro.y }, p)
    }
    actual.current.medir = medir
    const pedir = () => void (pedido ||= requestAnimationFrame(medir))
    const ro = new ResizeObserver(pedir)
    ro.observe(el)
    const mo = new MutationObserver(pedir)
    mo.observe(document.body, { childList: true, subtree: true })
    addEventListener('resize', pedir)
    medir()
    return () => {
      ro.disconnect()
      mo.disconnect()
      removeEventListener('resize', pedir)
      cancelAnimationFrame(pedido)
      puente.ver(null)
    }
  }, [activa])

  // Otro tamaño, sin soltar la página: esconderla parpadearía en cada cuadro del arrastre.
  useLayoutEffect(() => actual.current.medir(), [pantalla?.ancho, pantalla?.alto])

  // Una pestaña nueva espera su dirección.
  useEffect(() => {
    if (activa !== hilo && !estados.get(activa)?.url) direccionEl.current?.focus()
  }, [activa, hilo])

  if (!puente) return null
  function ir(ev: FormEvent) {
    ev.preventDefault()
    const url = direccion(escrito ?? '')
    if (!url) return
    puente!.ir(activa, url)
    setEscrito(null)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  const hacer = (accion: Parameters<typeof puente.hacer>[1]) => puente!.hacer(activa, accion)

  /** Arrastra el borde izquierdo del panel. No pasa por React: el resto lo sigue por su ResizeObserver. */
  function tirarPanel(ev: EventoPuntero<HTMLDivElement>) {
    const tirador = ev.currentTarget
    const panel = tirador.parentElement!
    const desde = ev.clientX
    const inicio = panel.offsetWidth
    tirador.setPointerCapture(ev.pointerId)
    const mover = (m: PointerEvent) => {
      const espacio = panel.parentElement!.clientWidth
      anchoPanel = Math.round(Math.max(PANEL_MINIMO, Math.min(inicio + desde - m.clientX, espacio * 0.7, espacio - PANEL_MINIMO)))
      panel.style.setProperty('--navegador-ancho', `${anchoPanel}px`)
    }
    const soltar = () => {
      tirador.removeEventListener('pointermove', mover)
      tirador.removeEventListener('lostpointercapture', soltar)
      localStorage.setItem(CLAVE_ANCHO, String(anchoPanel))
    }
    tirador.addEventListener('pointermove', mover)
    tirador.addEventListener('lostpointercapture', soltar)
  }

  /** Arrastra un borde de la página: `este`/`oeste` la ensanchan, `sur` la alarga. */
  function tirarBorde(ev: EventoPuntero<HTMLDivElement>, lados: ('este' | 'oeste' | 'sur')[]) {
    const { pantalla: p, lugar } = actual.current
    const r = caja.current?.getBoundingClientRect()
    if (!p || !lugar || !r) return
    ev.preventDefault()
    const tirador = ev.currentTarget
    const { clientX: x0, clientY: y0 } = ev
    const { escala } = lugar
    tirador.setPointerCapture(ev.pointerId)
    let puesta = p
    const mover = (m: PointerEvent) => {
      const dx = lados.includes('este') ? m.clientX - x0 : lados.includes('oeste') ? x0 - m.clientX : null
      const dy = lados.includes('sur') ? m.clientY - y0 : null
      puesta = {
        ancho: dx === null ? p.ancho : limitar(arrastrarBorde(p.ancho * escala, r.width - 2 * RIEL, dx) / escala),
        alto: dy === null ? p.alto : limitar(arrastrarBorde(p.alto * escala, r.height - 2 * RIEL, dy) / escala)
      }
      setArrastre(puesta)
    }
    const soltar = () => {
      tirador.removeEventListener('pointermove', mover)
      tirador.removeEventListener('lostpointercapture', soltar)
      ponerPantalla(activa, puesta)
      setArrastre(null)
    }
    tirador.addEventListener('pointermove', mover)
    tirador.addEventListener('lostpointercapture', soltar)
  }

  /** Lo escrito en el ancho o el alto. Sin tamaño fijo aún, lo otro es lo que mide la caja. */
  function escribirTamano(campo: 'ancho' | 'alto', texto: string) {
    const n = Number(texto)
    if (!texto.trim() || !Number.isFinite(n)) return
    const r = caja.current!.getBoundingClientRect()
    ponerPantalla(activa, { ...(pantalla ?? { ancho: Math.round(r.width), alto: Math.round(r.height) }), [campo]: limitar(n) })
  }

  return (
    <section
      className={`navegador${e?.cargando ? ' cargando' : ''}`}
      aria-label="Navegador del hilo"
      style={anchoPanel ? ({ '--navegador-ancho': `${anchoPanel}px` } as CSSProperties) : undefined}
    >
      <div className="navegador-borde" title="Arrastra para cambiar el ancho" onPointerDown={tirarPanel} />
      {ids.length > 1 && (
        <div className="navegador-pestanas" role="tablist">
          {ids.map((id) => (
            <Pestana key={id} id={id} activa={id === activa} onElegir={() => ponerPestanas(hilo, { ids, activa: id })} onCerrar={id === hilo ? undefined : () => cerrarPestana(hilo, id)} />
          ))}
        </div>
      )}
      <div className="navegador-barra">
        <button className="navegador-boton" disabled={!e?.atras} title="Atrás" onClick={() => hacer('atras')}>
          <Icono de="izquierda" />
        </button>
        <button className="navegador-boton" disabled={!e?.adelante} title="Adelante" onClick={() => hacer('adelante')}>
          <Icono de="flecha" />
        </button>
        <button className="navegador-boton" disabled={!e?.url} title={e?.cargando ? 'Detener' : 'Recargar'} onClick={() => hacer(e?.cargando ? 'parar' : 'recargar')}>
          <Icono de={e?.cargando ? 'cerrar' : 'recargar'} />
        </button>
        <form className="navegador-direccion" onSubmit={ir}>
          <input
            ref={direccionEl}
            value={escrito ?? e?.url ?? ''}
            placeholder="Escribe una dirección o busca en Google"
            spellCheck={false}
            aria-label="Dirección"
            title={e?.titulo || undefined}
            onChange={(ev) => setEscrito(ev.target.value)}
            onFocus={(ev) => ev.target.select()}
            onBlur={() => setEscrito(null)}
            onKeyDown={(ev) => ev.key === 'Escape' && (setEscrito(null), ev.currentTarget.blur())}
          />
        </form>
        {e?.agente && trabajando && (
          <span className="navegador-agente" title="El agente está usando esta página. Puedes mirarla y usarla a la vez.">
            Agente
          </span>
        )}
        {!redes && (
          <>
            <button className="navegador-boton" title="Nueva pestaña" onClick={() => nuevaPestana(hilo)}>
              <Icono de="mas" />
            </button>
            <button
              className={`navegador-boton${conFila ? ' on' : ''}`}
              title={conFila ? 'Volver al tamaño del panel' : 'Tamaño de la página y zoom'}
              aria-pressed={conFila}
              onClick={() => (conFila ? (setFila(false), ponerPantalla(activa, null)) : setFila(true))}
            >
              <Icono de="movil" />
            </button>
          </>
        )}
        <button className="navegador-boton" disabled={!e?.url} title="Abrir en tu navegador" onClick={() => hacer('fuera')}>
          <Icono de="fuera" />
        </button>
        <button className="navegador-boton" disabled={!e?.url} title="Más" onClick={() => hacer('menu')}>
          <Icono de="puntos" />
        </button>
        <button className="navegador-boton" title="Esconder el navegador" onClick={() => abrirNavegador(hilo, false)}>
          <Icono de="cerrar" />
        </button>
      </div>
      {conFila && (
        <div className="navegador-fila">
          {PANTALLAS.map((o) => (
            <button
              key={o.nombre}
              className={`navegador-chip${o.pantalla?.ancho === pantalla?.ancho && o.pantalla?.alto === pantalla?.alto ? ' on' : ''}`}
              onClick={() => ponerPantalla(activa, o.pantalla)}
            >
              {o.nombre}
            </button>
          ))}
          <span className="navegador-medida">
            <CampoTamano nombre="Ancho" valor={pantalla?.ancho} onCambio={(t) => escribirTamano('ancho', t)} />
            <span className="muted">×</span>
            <CampoTamano nombre="Alto" valor={pantalla?.alto} onCambio={(t) => escribirTamano('alto', t)} />
            <button className="navegador-boton" disabled={!pantalla} title="Girar" onClick={() => pantalla && ponerPantalla(activa, { ancho: pantalla.alto, alto: pantalla.ancho })}>
              <Icono de="reabrir" />
            </button>
          </span>
          <span className="navegador-zoom">
            <button className="navegador-boton" disabled={!e?.url} title="Alejar" onClick={() => hacer('alejar')}>
              <Icono de="alejar" />
            </button>
            <button className="navegador-chip" disabled={!e?.url} title="Volver al 100 %" onClick={() => hacer('zoomNormal')}>
              {Math.round((e?.zoom ?? 1) * 100)} %
            </button>
            <button className="navegador-boton" disabled={!e?.url} title="Acercar" onClick={() => hacer('acercar')}>
              <Icono de="acercar" />
            </button>
          </span>
        </div>
      )}
      <div className="navegador-pagina" ref={caja}>
        <div className="navegador-marco" ref={marco}>
          {pantalla && (
            <>
              <div className="navegador-tirador este" onPointerDown={(ev) => tirarBorde(ev, ['este'])} />
              <div className="navegador-tirador oeste" onPointerDown={(ev) => tirarBorde(ev, ['oeste'])} />
              <div className="navegador-tirador sur" onPointerDown={(ev) => tirarBorde(ev, ['sur'])} />
              <div className="navegador-tirador sureste" onPointerDown={(ev) => tirarBorde(ev, ['este', 'sur'])} />
              <div className="navegador-tirador suroeste" onPointerDown={(ev) => tirarBorde(ev, ['oeste', 'sur'])} />
            </>
          )}
        </div>
        {arrastre && (
          <span className="navegador-burbuja">
            {arrastre.ancho} × {arrastre.alto}
          </span>
        )}
        {e?.error ? (
          <div className="navegador-vacio">
            <strong>No se pudo abrir la página</strong>
            <span className="muted small">{e.error}</span>
            <button className="navegador-chip" onClick={() => hacer('recargar')}>
              Reintentar
            </button>
          </div>
        ) : (
          !e?.url && (
            <div className="navegador-vacio">
              <Icono de="globo" />
              <strong>{activa === hilo ? 'El navegador del hilo' : 'Pestaña nueva'}</strong>
              <span className="muted small">
                {activa === hilo
                  ? 'Aquí se ve lo que abre el agente, mientras lo hace. También puedes escribir una dirección arriba: lo que inicies aquí, el agente lo tiene en todos los hilos.'
                  : 'Escribe una dirección arriba. El agente trabaja en la primera pestaña; esta es tuya.'}
              </span>
            </div>
          )
        )}
      </div>
    </section>
  )
}

/** Una pestaña: su icono y su título; la del hilo no se cierra. */
function Pestana({ id, activa, onElegir, onCerrar }: { id: string; activa: boolean; onElegir(): void; onCerrar?(): void }) {
  const e = useEstado(id)
  // Muchos sitios anuncian un icono que no existe.
  const [roto, setRoto] = useState<string>()
  return (
    <div className={`navegador-pestana${activa ? ' on' : ''}`} role="tab" aria-selected={activa}>
      <button className="navegador-pestana-titulo" title={e?.url || undefined} onClick={onElegir}>
        {e?.icono && e.icono !== roto ? <img src={e.icono} alt="" onError={() => setRoto(e.icono)} /> : <Icono de="globo" />}
        <span>{e?.titulo || 'Nueva pestaña'}</span>
      </button>
      {onCerrar && (
        <button className="navegador-pestana-cerrar" title="Cerrar pestaña" onClick={onCerrar}>
          <Icono de="cerrar" />
        </button>
      )}
    </div>
  )
}

/** El ancho o el alto: se aplica al salir del campo o con Enter. Lleva `key` para volver a leer lo que cambió el arrastre. */
function CampoTamano({ nombre, valor, onCambio }: { nombre: string; valor?: number; onCambio(texto: string): void }) {
  return (
    <input
      key={valor}
      defaultValue={valor}
      placeholder={nombre}
      aria-label={nombre}
      inputMode="numeric"
      onBlur={(ev) => onCambio(ev.target.value)}
      onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()}
    />
  )
}
