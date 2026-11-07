import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Card, Comparacion, EstiloAnterior } from '../../shared/types'
import { api } from './api'
import { bienvenidaPendiente, BIENVENIDA_CERRADA } from './Bienvenida'
import { abrirBorrador } from './Estilos'
import { Icono } from './Iconos'
import { novedadesPendiente, NOVEDADES_CERRADAS } from './Novedades'
import './EstiloCambio.css'

type Aviso = EstiloAnterior & { card: Card }
type Hecho = { titulo: string; id: string; adaptar: string[] }

/**
 * Al abrir Sloth, a todos, si esta versión cambió a fondo un estilo de Sloth (`Card.cambio`) y aún no leyeron el aviso
 * (`server/anteriores.ts`): ocupa toda la pantalla, con lo de atrás borroso, y cabe en ella sin bajar. A la izquierda, el
 * mismo video con el de antes y con el nuevo (`cambio.comparacion`); a la derecha, qué cambió y «Leí toda la
 * especificación». Quien tenía el de antes (se guardó al actualizar) elige después: «Guardar también el de antes» lo pasa
 * a sus estilos tal cual y «Usar solo el nuevo» borra la copia. El de Sloth ya es el nuevo pase lo que pase.
 * Se puede cerrar (la X, Escape o un clic fuera) para seguir con la app; hasta acabar sus pasos, vuelve a salir al entrar
 * otra vez a ese estilo (`activa`, la card abierta) o al abrir Sloth. A quien abre Sloth por primera vez, después de la
 * bienvenida. Si cambiaron varios, uno tras otro.
 */
export function EstiloCambio({ cards, activa }: { cards: Card[]; activa?: string }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  /** Los que se cerraron sin acabar: vuelven al entrar a su estilo. */
  const [cerrados, setCerrados] = useState<string[]>([])
  /** Espera a que se cierre lo que sale antes al abrir Sloth: la bienvenida o la guía de lo nuevo. */
  const [bienvenida, setBienvenida] = useState(() => bienvenidaPendiente() || novedadesPendiente())
  const [leido, setLeido] = useState(false)
  const [olvidar, setOlvidar] = useState(false)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [fallo, setFallo] = useState('')
  const principal = useRef<HTMLButtonElement>(null)
  const cambiados = cards.filter((c) => c.cambio && c.skill && !c.tuya)
  const clave = cambiados.map((c) => `${c.id}:${c.cambio?.fecha}`).join()

  useEffect(() => {
    if (!clave) return
    let vivo = true
    Promise.all(cambiados.map((card) => api<EstiloAnterior | null>(`/api/cards/${card.id}/anterior`).then((a) => (a ? { ...a, card } : null), () => null))).then(
      (todos) => vivo && setAvisos(todos.filter((a): a is Aviso => a !== null))
    )
    return () => {
      vivo = false
    }
  }, [clave])

  useEffect(() => {
    const alCerrar = () => setBienvenida(false)
    addEventListener(BIENVENIDA_CERRADA, alCerrar)
    addEventListener(NOVEDADES_CERRADAS, alCerrar)
    return () => {
      removeEventListener(BIENVENIDA_CERRADA, alCerrar)
      removeEventListener(NOVEDADES_CERRADAS, alCerrar)
    }
  }, [])

  useEffect(() => {
    if (activa) setCerrados((c) => (c.includes(activa) ? c.filter((id) => id !== activa) : c))
  }, [activa])

  const aviso = bienvenida ? undefined : avisos.find((a) => !cerrados.includes(a.card.id))
  useEffect(() => {
    if (!aviso) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
    }
    addEventListener('keydown', alPulsar)
    return () => removeEventListener('keydown', alPulsar)
  }, [aviso, hecho])
  // El foco va al botón que toca, sin mover la vista: con `autoFocus`, en una pantalla baja el título quedaba arriba, fuera.
  useEffect(() => principal.current?.focus({ preventScroll: true }), [aviso?.card.id, leido, olvidar, hecho])
  if (!aviso) return null
  const { card } = aviso
  const comparacion = card.cambio?.comparacion

  /** Ya contestado: no vuelve a salir. */
  function siguiente() {
    setAvisos((todos) => todos.filter((a) => a.card.id !== card.id))
    empezar()
  }

  /** Cerrado a medias: vuelve a salir, desde el principio, al entrar a su estilo. Contestado ya, es como acabar. */
  function cerrar() {
    if (hecho) return siguiente()
    setCerrados((c) => [...c, card.id])
    empezar()
  }

  function empezar() {
    setLeido(false)
    setOlvidar(false)
    setHecho(null)
    setFallo('')
  }

  async function hacer(accion: 'conservar' | 'olvidar') {
    if (ocupado) return
    setOcupado(true)
    setFallo('')
    try {
      const r = await api<Hecho | null>(`/api/cards/${card.id}/anterior`, { accion })
      if (accion === 'conservar' && r) setHecho(r)
      else siguiente()
    } catch (e) {
      setFallo(`No se pudo: ${e instanceof Error ? e.message : e}`)
    } finally {
      setOcupado(false)
    }
  }

  const antes = typeof card.cambio?.antes?.version === 'string' ? card.cambio.antes.version : undefined
  const pasos = hecho ? (
    <>
      <p className="ec-texto">Quedó tal como era y no cambia aunque Sloth se actualice. El «{card.title}» de Sloth ya es el nuevo.</p>
      {hecho.adaptar.length > 0 && (
        <p className="ec-texto">
          Usa cosas de la base de videos que cambiaron desde entonces ({hecho.adaptar.join(', ')}). Si algo le falla,
          «Adaptarlo» le pide a «Nuevo estilo» que lo ponga al día.
        </p>
      )}
      <div className="ec-acciones">
        <button ref={principal} className="primary ec-boton" onClick={siguiente}>
          Listo
        </button>
        {hecho.adaptar.length > 0 && (
          <button
            className="ec-boton ec-boton-suave"
            onClick={() => {
              abrirBorrador(
                'nuevo-estilo',
                `Adapta mi estilo «${hecho.titulo}» (la skill ${hecho.id}) a esta versión de Sloth. Es el ${card.title} de antes, y desde entonces cambiaron en video-base: ${hecho.adaptar.join(', ')}.\n\nSigue «Adaptar un estilo instalado» de tu skill.`
              )
              siguiente()
            }}
          >
            Adaptarlo
          </button>
        )}
      </div>
    </>
  ) : !leido ? (
    <div className="ec-acciones">
      <button ref={principal} className="ec-boton ec-leido" disabled={ocupado} onClick={() => (aviso.guardado ? setLeido(true) : hacer('olvidar'))}>
        Leí toda la especificación
      </button>
    </div>
  ) : olvidar ? (
    <>
      <p className="ec-texto bad">Se borra la copia del de antes y ya no podrás volver a él. Tus videos ya hechos no cambian.</p>
      <div className="ec-acciones">
        <button ref={principal} className="ec-boton ec-borrar" disabled={ocupado} onClick={() => hacer('olvidar')}>
          Borrar el de antes
        </button>
        <button className="ec-boton ec-boton-suave" onClick={() => setOlvidar(false)}>
          Volver
        </button>
      </div>
    </>
  ) : (
    <>
      <p className="ec-texto">
        ¿Preferías cómo salían antes? Guárdalo también: queda entre tus estilos como <b>«{aviso.titulo}»</b>, tal cual y sin
        que Sloth lo cambie.
      </p>
      <div className="ec-acciones">
        <button ref={principal} className="primary ec-boton" disabled={ocupado} onClick={() => hacer('conservar')}>
          Guardar también el de antes
        </button>
        <button className="ec-boton ec-boton-suave" onClick={() => setOlvidar(true)}>
          Usar solo el nuevo
        </button>
      </div>
    </>
  )

  return createPortal(
    <div className="estilo-cambio" role="dialog" aria-modal aria-label={`El estilo «${card.title}» cambió`} onClick={cerrar}>
      <div className={`ec-caja${comparacion && !hecho ? ' ancha' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="ec-cerrar" onClick={cerrar} title={hecho ? 'Cerrar' : `Cerrar (vuelve a salir al entrar a «${card.title}», hasta que lo contestes)`} aria-label="Cerrar">
          <Icono de="cerrar" className="icon-trazo" />
        </button>
        {comparacion && !hecho && <LadoALado c={comparacion} antes={antes} ahora={card.version} />}
        <section className="ec-info">
          <p className="ec-antetitulo">
            <Icono de="megafono" className="icon-trazo" /> {card.title}
            {card.version && (
              <span>
                {antes ? `v${antes} → ` : ''}v{card.version}
              </span>
            )}
          </p>
          <h2>{hecho ? `«${hecho.titulo}» ya está entre tus estilos` : (card.cambio?.titulo ?? (card.version ? `Pasó a la versión ${card.version}` : 'Este estilo cambió'))}</h2>
          {!hecho && comparacion?.resumen && (
            <ul className="ec-resumen">
              {comparacion.resumen.map((r) => (
                <li key={r.texto}>
                  <b>{r.valor}</b>
                  <span>{r.texto}</span>
                </li>
              ))}
            </ul>
          )}
          {!hecho && <p className="ec-texto">{aviso.texto}</p>}
          {!hecho && aviso.compara && (
            <a className="ec-enlace" href={aviso.compara} target="_blank" rel="noreferrer">
              <Icono de="video" className="icon-trazo" /> Ver el de antes y el nuevo lado a lado
            </a>
          )}
          <div className="ec-pasos">{pasos}</div>
          {fallo && <p className="bad small">{fallo}</p>}
        </section>
      </div>
    </div>,
    document.body
  )
}

/**
 * Los dos videos de un cambio, a la misma altura, con lo que se midió debajo de cada uno. El botón grande del centro los
 * arranca juntos desde el principio; se oye uno solo, el que elijas. Un clic en un video los pausa o los sigue a los dos.
 */
function LadoALado({ c, antes, ahora }: { c: Comparacion; antes?: string; ahora?: string }) {
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const [sonido, setSonido] = useState<0 | 1>(1)
  const [estado, setEstado] = useState<'quieto' | 'andando' | 'pausa'>('quieto')
  useEffect(() => {
    videos.current.forEach((v, i) => v && (v.muted = i !== sonido))
  }, [sonido])
  const todos = () => videos.current.filter((v): v is HTMLVideoElement => !!v)
  function desdeElPrincipio() {
    for (const v of todos()) v.currentTime = 0
    for (const v of todos()) void v.play().catch(() => {})
    setEstado('andando')
  }
  function alternar() {
    if (estado === 'quieto') return desdeElPrincipio()
    const pausar = estado === 'andando'
    for (const v of todos()) void (pausar ? v.pause() : v.play().catch(() => {}))
    setEstado(pausar ? 'pausa' : 'andando')
  }
  const lados = [
    { nombre: 'Antes', version: antes, ...c.antes },
    { nombre: 'Ahora', version: ahora, ...c.ahora }
  ]
  return (
    <section className="ec-videos" aria-label="El mismo video, antes y ahora">
      <div className="ec-duo">
        {lados.map((l, i) => (
          <figure key={l.nombre} className={i ? 'ahora' : 'antes'}>
            <figcaption className="ec-lado">
              <b>{l.nombre}</b>
              {l.version && <span>v{l.version}</span>}
              {l.detalle && <span className="ec-detalle">{l.detalle}</span>}
            </figcaption>
            <video
              ref={(v) => {
                videos.current[i] = v
              }}
              src={l.video}
              poster={l.portada}
              muted={i !== sonido}
              playsInline
              preload="metadata"
              onClick={alternar}
              onEnded={() => setEstado('quieto')}
            />
            <dl className="ec-cifras">
              {l.cifras.map((x) => (
                <div key={x.nombre}>
                  <dt>{x.nombre}</dt>
                  <dd>{x.valor}</dd>
                </div>
              ))}
            </dl>
          </figure>
        ))}
        {estado !== 'andando' && (
          <button className="ec-play" onClick={estado === 'pausa' ? alternar : desdeElPrincipio} aria-label={estado === 'pausa' ? 'Seguir los dos' : 'Ver los dos a la vez'}>
            <Icono de="video" className="icon-trazo" />
          </button>
        )}
      </div>
      <div className="ec-mandos">
        <button className="ec-boton ec-juntos" onClick={desdeElPrincipio}>
          <Icono de={estado === 'quieto' ? 'video' : 'reabrir'} className="icon-trazo" /> {estado === 'quieto' ? 'Ver los dos a la vez' : 'Desde el principio'}
        </button>
        <div className="ec-sonido" role="group" aria-label="De cuál se oye el sonido">
          <Icono de="sonido" className="icon-trazo" />
          {lados.map((l, i) => (
            <button key={l.nombre} aria-pressed={sonido === i} onClick={() => setSonido(i as 0 | 1)}>
              {l.nombre}
            </button>
          ))}
        </div>
      </div>
      <p className="ec-nota">{c.nota}</p>
    </section>
  )
}
