import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EstadoRespaldo, RespaldoNube, Traido } from '../../shared/respaldo'
import { api } from './api'
import { Icono } from './Iconos'
import './Respaldo.css'

/**
 * Tu Sloth en otra computadora (`server/respaldo.ts`, ADR 0020). Con tu clave, cada Sloth guarda sola una copia de tus
 * estilos, tus chats, «Sobre ti» y tus marcas. `TraerSloth` la ofrece a toda la pantalla al escribir la clave en otra
 * computadora (`claveEscrita`) o al abrir una que ya la tenía y a la que le faltan estilos de la otra; «Ahora no» no
 * vuelve a preguntar sola. `RespaldoOpciones` dice cómo va la copia de esta computadora, la apaga y deja traer la de las
 * otras cuando quieras.
 */

const CLAVE = 'sloth-clave'
const OFRECER = 'sloth-traer'

/** Se acaba de escribir una clave: es el momento de ofrecer lo de la otra computadora. */
export const claveEscrita = () => void dispatchEvent(new Event(CLAVE))

function hace(iso: string) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 2) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  if (min < 48 * 60) return `hace ${Math.floor(min / 60)} h`
  return `hace ${Math.floor(min / 60 / 24)} días`
}

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
/** Qué trae una copia, en una línea. */
const trae = (r: RespaldoNube) => [r.estilos.length ? cuantos(r.estilos.length, 'estilo', 'estilos') : '', r.chats ? cuantos(r.chats, 'chat', 'chats') : ''].filter(Boolean).join(' y ')
/** Los nombres de sus estilos, los primeros. */
function nombres(r: RespaldoNube) {
  const primeros = r.estilos.slice(0, 4).map((e) => e.titulo)
  return `${primeros.join(', ')}${r.estilos.length > primeros.length ? ` y ${r.estilos.length - primeros.length} más` : ''}`
}

/** Otro aviso a toda la pantalla (la bienvenida, lo nuevo, un estilo que cambió): la oferta espera a que se cierre. */
const hayOtroAviso = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"], .novedades')].some((d) => !d.closest('.traer-fondo') && d.getClientRects().length > 0)

export function TraerSloth() {
  const [oferta, setOferta] = useState<RespaldoNube | null>(null)
  // Al abrir Sloth la oferta espera su turno; con la clave recién escrita o pedida en Opciones, sale ya.
  const [espera, setEspera] = useState(false)
  const [trayendo, setTrayendo] = useState(false)
  const [traido, setTraido] = useState<Traido | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const preguntar = (reciente: boolean) =>
      api<EstadoRespaldo>(`/api/respaldo${reciente ? '?clave' : ''}`).then(
        (e) => e.preguntar && (setEspera(!reciente), setOferta(e.preguntar)),
        () => {}
      )
    void preguntar(false)
    const clave = () => void preguntar(true)
    const ofrecer = (e: Event) => (setEspera(false), setTraido(null), setError(''), setOferta((e as CustomEvent<RespaldoNube>).detail))
    addEventListener(CLAVE, clave)
    addEventListener(OFRECER, ofrecer)
    return () => (removeEventListener(CLAVE, clave), removeEventListener(OFRECER, ofrecer))
  }, [])

  useEffect(() => {
    if (!espera) return
    const mirar = () => !hayOtroAviso() && setEspera(false)
    const t = setInterval(mirar, 1500)
    mirar()
    return () => clearInterval(t)
  }, [espera])

  if (!oferta || espera) return null
  const cerrar = () => !trayendo && (setOferta(null), setTraido(null), setError(''))
  const ahoraNo = () => (void api('/api/respaldo/luego', { equipo: oferta.equipo }).catch(() => {}), cerrar())

  async function traer() {
    if (!oferta) return
    setTrayendo(true)
    setError('')
    try {
      setTraido(await api<Traido>('/api/respaldo/traer', { equipo: oferta.equipo }))
      dispatchEvent(new Event('sloth-traido'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTrayendo(false)
    }
  }

  const nombre = oferta.nombre || 'tu otra computadora'
  const entro = traido ? [traido.estilos.length ? cuantos(traido.estilos.length, 'estilo', 'estilos') : '', traido.chats ? cuantos(traido.chats, 'chat', 'chats') : '', traido.sobreTi ? '«Sobre ti»' : '', traido.marcas ? cuantos(traido.marcas, 'marca', 'marcas') : ''].filter(Boolean) : []
  return createPortal(
    <div className="modal-backdrop traer-fondo" onClick={traido ? cerrar : undefined}>
      <div className="modal modal-ancho" role="dialog" aria-modal aria-label="Traer tu Sloth de otra computadora" onClick={(e) => e.stopPropagation()}>
        {traido ? (
          <>
            <h2>{entro.length ? 'Listo: tu Sloth ya está aquí' : 'Ya lo tenías todo aquí'}</h2>
            <div className="modal-body">
              {entro.length ? (
                <p>
                  Entraron {entro.join(', ')}. Tus estilos ya salen en el inicio y tus chats, en la barra de la izquierda. Al escribir en un chat que llegó, sigue desde un resumen de lo hablado.
                </p>
              ) : (
                <p>Todo lo de la copia de «{nombre}» ya estaba en esta computadora. No se cambió nada.</p>
              )}
            </div>
            <div className="modal-actions">
              <button className="primary" autoFocus onClick={cerrar}>
                Listo
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>¿Traer tu Sloth de «{nombre}»?</h2>
            <div className="modal-body">
              <p>Con tu clave, Sloth guardó una copia de lo que tienes en esa computadora ({hace(oferta.guardado)}). Trae:</p>
              <ul className="traer-lista">
                {oferta.estilos.length > 0 && (
                  <li>
                    <Icono de="claqueta" className="icon-trazo" />
                    <span>
                      <strong>{cuantos(oferta.estilos.length, 'estilo tuyo', 'estilos tuyos')}</strong>: {nombres(oferta)}
                    </span>
                  </li>
                )}
                {oferta.chats > 0 && (
                  <li>
                    <Icono de="hilo" className="icon-trazo" />
                    <span>
                      <strong>{cuantos(oferta.chats, 'chat', 'chats')}</strong>, con todo lo hablado
                    </span>
                  </li>
                )}
                <li>
                  <Icono de="personas" className="icon-trazo" />
                  <span>Lo que contaste en «Sobre ti» y las marcas de tus canales</span>
                </li>
              </ul>
              <p className="small">Lo que ya tienes aquí no se toca. Los videos se quedan en la otra computadora, y tus cuentas (agentes, Google, redes) se conectan aquí otra vez.</p>
              {error && <p className="bad small">{error}</p>}
            </div>
            <div className="modal-actions">
              <button className="ghost" disabled={trayendo} onClick={ahoraNo}>
                Ahora no
              </button>
              <button className="primary" autoFocus disabled={trayendo} onClick={() => void traer()}>
                {trayendo ? 'Trayendo…' : 'Traer todo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

/** En Opciones: la copia de esta computadora (cómo va, apagarla) y las de tus otras computadoras, para traerlas. */
export function RespaldoOpciones() {
  const [e, setE] = useState<EstadoRespaldo>()
  const [error, setError] = useState('')
  const leer = () => api<EstadoRespaldo>('/api/respaldo').then(setE, (x: Error) => setError(x.message))

  useEffect(() => {
    void leer()
    // Tras traer una copia, lo de aquí cambió.
    addEventListener('sloth-traido', leer)
    return () => removeEventListener('sloth-traido', leer)
  }, [])

  if (!e) return <div className="fila"><span className="muted small">{error || 'Mirando…'}</span></div>
  const cambiar = (guardar: boolean) => {
    setE({ ...e, guardar })
    api('/api/respaldo/guardar', { guardar }).then(leer, (x: Error) => (setError(x.message), void leer()))
  }
  const como = !e.cuenta
    ? 'Crea tu cuenta gratis en Comunidad, o escribe tu clave: con ella se guarda sola'
    : !e.guardar
      ? 'Apagada: lo de esta computadora no está en la nube'
      : e.error || error
        ? e.error || error
        : e.subido
          ? `Guardada ${hace(e.subido)}`
          : 'Se guarda sola a los pocos minutos de abrir Sloth'
  return (
    <>
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>La copia de esta computadora</strong>
            <span className={e.cuenta && e.guardar && (e.error || error) ? 'falta' : undefined}>{como}</span>
          </div>
          {e.cuenta && (
            <label className="con-interruptor">
              Guardarla
              <button role="switch" aria-checked={e.guardar} className={`interruptor${e.guardar ? ' on' : ''}`} onClick={() => cambiar(!e.guardar)}>
                <span />
              </button>
            </label>
          )}
        </div>
      </div>
      {e.otros.map((r) => (
        <div className="item" key={r.equipo}>
          <div className="fila">
            <div className="fila-nombre">
              <strong>{r.nombre || 'Otra computadora'}</strong>
              <span>
                Su copia es de {hace(r.guardado)} · {trae(r)}
              </span>
            </div>
            <button className="ghost small" onClick={() => void dispatchEvent(new CustomEvent(OFRECER, { detail: r }))}>
              Traer
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
