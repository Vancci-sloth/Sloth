import { type FormEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type EstadoNavegador, NAVEGADOR_REDES } from '../../shared/types'
import { Icono } from './Iconos'
import './Navegador.css'

/**
 * El navegador de cada hilo, como el de T3 Code: el globo del encabezado lo enseña o lo esconde, a la derecha del chat (en
 * el estudio, en el centro). La página la pone la ventana de Sloth (`electron/navegador.ts`) encima de la interfaz, en la
 * caja del panel; aquí van su barra y lo que se ve sin página. La usa también el agente: cuando empieza a usarla, el
 * panel de ese hilo se abre solo. Fuera de la ventana de Sloth (en Edge) no hay navegador, y el agente usa el suyo.
 */

const puente = window.sloth?.navegador
export const hayNavegador = !!puente

const CLAVE = 'sloth-navegador'
const estados = new Map<string, EstadoNavegador>()
/** Los hilos con el panel abierto: se recuerdan al recargar. */
const abiertos = new Set<string>(leerAbiertos())
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((o) => o())
const suscribir = (o: () => void) => (oyentes.add(o), () => void oyentes.delete(o))

function leerAbiertos(): string[] {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE) ?? '[]')
    return Array.isArray(l) ? l.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
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
    if (e.agente && !antes?.agente && e.hilo !== NAVEGADOR_REDES) abrirNavegador(e.hilo, true)
    avisar()
  })
  // Al recargar la interfaz, cómo van las que ya estaban (sin abrir ninguna).
  void puente.estados().then((es) => {
    for (const e of es) estados.set(e.hilo, e)
    avisar()
  })
}

export const useNavegadorAbierto = (hilo: string) => useSyncExternalStore(suscribir, () => hayNavegador && abiertos.has(hilo))
const useEstado = (hilo: string) => useSyncExternalStore(suscribir, () => estados.get(hilo))

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

/** El panel: su barra y, debajo, la caja donde la ventana pone la página del hilo. */
export function PanelNavegador({ hilo, trabajando }: { hilo: string; trabajando: boolean }) {
  const e = useEstado(hilo)
  const caja = useRef<HTMLDivElement>(null)
  const [escrito, setEscrito] = useState<string | null>(null)

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
      const oculta = tapado(el, r)
      const ahora = oculta ? '' : `${r.x},${r.y},${r.width},${r.height}`
      if (ahora === ultimo) return
      ultimo = ahora
      puente.ver(oculta ? null : hilo, { x: r.x, y: r.y, width: r.width, height: r.height })
    }
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
  }, [hilo])

  if (!puente) return null
  function ir(ev: FormEvent) {
    ev.preventDefault()
    const url = direccion(escrito ?? '')
    if (!url) return
    puente!.ir(hilo, url)
    setEscrito(null)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  const hacer = (accion: Parameters<typeof puente.hacer>[1]) => puente!.hacer(hilo, accion)
  return (
    <section className={`navegador${e?.cargando ? ' cargando' : ''}`} aria-label="Navegador del hilo">
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
        <button className="navegador-boton" disabled={!e?.url} title="Abrir en tu navegador" onClick={() => hacer('fuera')}>
          <Icono de="fuera" />
        </button>
        <button className="navegador-boton" title="Esconder el navegador" onClick={() => abrirNavegador(hilo, false)}>
          <Icono de="cerrar" />
        </button>
      </div>
      <div className="navegador-pagina" ref={caja}>
        {e?.error ? (
          <div className="navegador-vacio">
            <strong>No se pudo abrir la página</strong>
            <span className="muted small">{e.error}</span>
          </div>
        ) : (
          !e?.url && (
            <div className="navegador-vacio">
              <Icono de="globo" />
              <strong>El navegador del hilo</strong>
              <span className="muted small">Aquí se ve lo que abre el agente, mientras lo hace. También puedes escribir una dirección arriba: lo que inicies aquí, el agente lo tiene en todos los hilos.</span>
            </div>
          )
        )}
      </div>
    </section>
  )
}
