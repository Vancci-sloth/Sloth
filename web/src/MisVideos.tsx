import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type Card, NAVEGADOR_REDES, type SessionMeta, type VideoHecho, type VideosDeTodos } from '../../shared/types'
import { api } from './api'
import { Icon } from './Composer'
import { compartirVideo } from './Comunidad'
import { Confirm } from './Confirm'
import { Icono } from './Iconos'
import { Ritmos } from './Ritmos'
import { abrirNavegador, BotonNavegador } from './Navegador'
import { useDesplazando } from './desplazando'
import { YoutubeBoton } from './Youtube'
import { YoutubeLote } from './YoutubeProgramar'
import { CalendarioYoutube } from './YoutubeCalendario'
import { CalendarioRedes, type EstadoRedes, estadoEnRedes, Marcas, ResumenRedes } from './Redes' // redes
import './MisVideos.css'

/**
 * «Mis videos»: los videos terminados de todos los estilos, del más nuevo al más viejo, con un filtro por estilo (el
 * elegido va en el hash). Llegan en una sola petición (`GET /api/videos`), con sus marcas de redes. Las tarjetas son las
 * de la galería de cada estilo (`VideoDe`), y se dibujan por tandas al bajar: con cientos de videos, solo se cargan los
 * que se ven.
 */

/** Cuántas tarjetas se dibujan de una vez. Al acercarse al final, otras tantas. */
const TANDA = 30

export function MisVideos({ cards, sessions, estilo, onEstilo }: { cards: Card[]; sessions: SessionMeta[]; estilo?: string; onEstilo(id?: string): void }) {
  const [todos, setTodos] = useState<VideosDeTodos | null>(null)
  const [error, setError] = useState('')
  // Lo que falló al tocar una marca de redes (reintentar, descartar).
  const [fallo, setFallo] = useState('')
  // El video de una carpeta de fuera, sin hilo que abrir, se ve en grande.
  const [viendo, setViendo] = useState<string | null>(null)
  const [eliminar, setEliminar] = useState(false) // redes
  // El panel de «Ritmo de publicación», abierto o no.
  const [ritmo, setRitmo] = useState(false)
  // redes: con un estado elegido en el resumen (los que faltan, los que fallaron…), solo esos.
  const [porEstado, setPorEstado] = useState<EstadoRedes | null>(null)

  // Se vuelve a pedir cuando un hilo de un estilo empieza o acaba un turno (puede haber un video nuevo) y cuando cambia algo
  // en redes. Lo que llega junto (una acción de redes y su aviso por el WebSocket) se pide una sola vez.
  const [vuelta, setVuelta] = useState(0)
  const otraVuelta = () => setVuelta((n) => n + 1)
  useEffect(() => {
    addEventListener('sloth-redes', otraVuelta)
    addEventListener('sloth-videos', otraVuelta)
    return () => { removeEventListener('sloth-redes', otraVuelta); removeEventListener('sloth-videos', otraVuelta) }
  }, [])
  const estilos = cards.filter((c) => c.etapas?.length).map((c) => c.id)
  const clave = estilos.join() + '|' + sessions.flatMap((s) => (estilos.includes(s.cardId) ? [s.id + s.updatedAt] : [])).join()
  useEffect(() => {
    let vivo = true
    const t = setTimeout(
      () => api<VideosDeTodos>('/api/videos').then((r) => vivo && (setTodos(r), setError('')), (e) => vivo && setError(e.message)),
      todos ? 300 : 0
    )
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [clave, vuelta])

  const videos = todos?.videos ?? []
  const cuantos = new Map<string, number>()
  for (const v of videos) cuantos.set(v.cardId, (cuantos.get(v.cardId) ?? 0) + 1)
  const conVideos = cards.filter((c) => cuantos.has(c.id))
  // Un estilo que ya no tiene videos es como «Todos».
  const filtro = estilo && cuantos.has(estilo) ? estilo : undefined
  const vistos = filtro ? videos.filter((v) => v.cardId === filtro) : videos
  // Un estado que ya no tiene videos (los arreglaste) es como ninguno.
  const enEstado = porEstado && todos?.redes ? vistos.filter((v) => estadoEnRedes(todos.redes!, v.ruta) === porEstado) : []
  const enRejilla = enEstado.length ? enEstado : vistos
  // redes: los que se ven y ya están en todas las redes conectadas. Su archivo sobra en el disco.
  const programados = vistos.filter((v) => todos?.redes?.programados?.includes(v.ruta))
  // redes: mientras Sloth sube a TikTok, su navegador se ve a la derecha (`ConNavegadorRedes`); al acabar la cola, se
  // esconde. Entre un video y el siguiente no se cierra. Si lo escondes tú, sigue escondido.
  const enNavegador = !!todos?.redes?.enNavegador
  const abrio = useRef(false)
  useEffect(() => {
    if (enNavegador) {
      abrio.current = true
      return void abrirNavegador(NAVEGADOR_REDES, true)
    }
    if (!abrio.current) return
    const t = setTimeout(() => ((abrio.current = false), abrirNavegador(NAVEGADOR_REDES, false)), 5000)
    return () => clearTimeout(t)
  }, [enNavegador])

  return (
    <div className="mis-videos">
      <header className="mis-videos-head">
        <div>
          <h1>Mis videos</h1>
          <p className="muted">
            {todos
              ? `${videos.length === 1 ? '1 video terminado' : `${videos.length} videos terminados`} de todos tus estilos, del más nuevo al más viejo.`
              : !error && 'Buscando los videos terminados…'}
          </p>
        </div>
        <div className="mis-videos-acciones">
          <button className={`mis-ritmo${ritmo ? ' on' : ''}`} aria-expanded={ritmo} title="Cuántos videos salen y cada cuántos días, en TikTok, Instagram y YouTube" onClick={() => setRitmo(!ritmo)}>
            <Icono de="calendario" /> Ritmo de publicación
          </button>
          {programados.length > 0 && (
            <button className="mis-eliminar" title="Los quita de tu disco, no de las redes" onClick={() => setEliminar(true)}>
              Eliminar los que ya se programaron ({programados.length})
            </button>
          )}
          <BotonNavegador hilo={NAVEGADOR_REDES} trabajando={enNavegador} /> {/* redes */}
        </div>
      </header>
      {conVideos.length > 1 && (
        <div className="mis-filtros">
          <button className={filtro ? '' : 'on'} onClick={() => onEstilo()}>
            Todos <span className="cuantos">{videos.length}</span>
          </button>
          {conVideos.map((c) => (
            <button key={c.id} className={filtro === c.id ? 'on' : ''} onClick={() => onEstilo(c.id)}>
              <Icon icon={c.icon ?? '✦'} /> {c.title} <span className="cuantos">{cuantos.get(c.id)}</span>
            </button>
          ))}
        </div>
      )}
      <ResumenRedes marcas={todos?.redes} videos={vistos} estado={enEstado.length ? porEstado : null} onEstado={setPorEstado} onCambio={otraVuelta} /> {/* redes */}
      {/* La app que se vende aún no publica: sin marcas de redes, lo de redes no se dibuja; lo de YouTube se quita aquí. */}
      {ritmo && <Ritmos />}
      <YoutubeLote videos={vistos} cardId={filtro} />
      <CalendarioRedes marcas={todos?.redes} /> {/* redes */}
      <CalendarioYoutube />
      {error && <p className="bad small">{error}</p>}
      {fallo && <p className="bad small">{fallo}</p>}
      {!todos ? null : vistos.length ? (
        // Por estilo y por estado, una rejilla nueva: empieza arriba y con la primera tanda.
        <Rejilla key={`${filtro ?? ''}|${enEstado.length ? porEstado : ''}`} videos={enRejilla}>
          {(v) => (
            <VideoDe
              key={v.src}
              video={v}
              // En «Todos», cada uno dice de qué estilo es.
              estilo={filtro ? undefined : conVideos.find((c) => c.id === v.cardId)}
              onVer={() => setViendo(v.src)}
              insignia={<Marcas marcas={todos.redes} ruta={v.ruta} onCambio={otraVuelta} onError={setFallo} />}
            />
          )}
        </Rejilla>
      ) : (
        <p className="estilo-vacio">Aún no hay videos terminados. Cada uno sale aquí en cuanto su estilo lo termina.</p>
      )}
      {viendo && (
        <div className="lightbox" onClick={() => setViendo(null)}>
          <video src={viendo} controls autoPlay onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      {eliminar && (
        <Confirm
          title={`¿Eliminar ${programados.length === 1 ? '1 video' : `${programados.length} videos`} de tu disco?`}
          action="Eliminar del disco"
          danger
          onClose={() => setEliminar(false)}
          onConfirm={async () => {
            setFallo('')
            const r = await api<{ borrados: number; quedan: number }>('/api/redes/eliminar', { rutas: programados.map((v) => v.ruta) })
            if (r.quedan) setFallo(`${r.quedan === 1 ? 'Uno no se borró' : `${r.quedan} no se borraron`}: un agente trabaja en su carpeta, o Windows no lo dejó mover.`)
            otraVuelta()
          }}
        >
          Van a la Papelera de reciclaje{filtro ? ` los de ${cards.find((c) => c.id === filtro)?.title}` : ''} que ya están programados o publicados en todas tus
          redes. En las redes no cambia nada: siguen saliendo a su hora. Los que están en cola o fallaron se quedan.
        </Confirm>
      )}
    </div>
  )
}

/**
 * Las tarjetas, por tandas: la primera al abrir y otra cada vez que el final se acerca a la vista. Cada video que se
 * dibuja pide su primer cuadro en pequeño; los de más abajo no piden nada hasta que bajas. Mientras se desplaza, no
 * responden al ratón (`useDesplazando`): los que pasan bajo el cursor no empiezan a bajarse.
 */
export function Rejilla({ videos, children }: { videos: VideoHecho[]; children(v: VideoHecho): ReactNode }) {
  const [hasta, setHasta] = useState(TANDA)
  const rejilla = useRef<HTMLDivElement>(null)
  const fin = useRef<HTMLDivElement>(null)
  const quedan = videos.length > hasta
  useDesplazando(rejilla)
  // Se vuelve a mirar tras cada tanda: si el final sigue cerca (una pantalla alta), entra otra.
  useEffect(() => {
    if (!quedan || !fin.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setHasta((n) => n + TANDA), { root: rejilla.current, rootMargin: '0px 0px 600px' })
    io.observe(fin.current)
    return () => io.disconnect()
  }, [quedan, hasta])
  return (
    <div className="videos" ref={rejilla}>
      {videos.slice(0, hasta).map(children)}
      {quedan && <div className="mis-videos-fin" ref={fin} />}
    </div>
  )
}

/**
 * Un video terminado, en la galería de su estilo y en «Mis videos», con su forma (vertical u horizontal) dibujada y
 * escrita encima: se reproduce al pasar por encima, y un clic abre su hilo con él en el monitor o, si no tiene (es de una
 * carpeta de fuera), lo enseña en grande (`onVer`).
 * Con `estilo`, su icono va delante del título. `insignia`: sus marcas de redes. Su ✕, tras confirmar, lo manda a la
 * Papelera.
 */
export function VideoDe({ video, onVer, insignia, estilo }: { video: VideoHecho; onVer(): void; insignia?: ReactNode; estilo?: Card }) {
  const { sessionId } = video
  const [borrar, setBorrar] = useState(false)
  return (
    <div className="video-con-subida">
      <button className="video-borrar" title="Borrar este video" onClick={() => setBorrar(true)}>
        ✕
      </button>
      {/* comunidad: lo publica en «Lo que hice», con su portada. */}
      <button className="video-compartir" title="Compartir en la comunidad" onClick={() => compartirVideo(video)}>
        <Icono de="compartir" className="video-compartir-ico" />
      </button>
      {borrar && (
        <Confirm
          title={`¿Borrar «${video.titulo}»?`}
          action="Borrar"
          danger
          onClose={() => setBorrar(false)}
          onConfirm={async () => {
            await api('/api/videos/borrar', { ruta: video.ruta })
            dispatchEvent(new Event('sloth-videos'))
          }}
        >
          <code>{video.archivo.split('/').pop()}</code> va a la Papelera de reciclaje, de donde puedes recuperarlo. Lo demás de su carpeta se queda, y lo
          que ya está programado o subido en tus redes sigue igual.
        </Confirm>
      )}
      {/* El hilo se abre con este video en el monitor: un hilo puede tener varios (el episodio en las dos formas, los cortes). */}
      <button className="video-tile" title={sessionId ? 'Abrir su hilo' : 'Verlo'} onClick={() => (sessionId ? void (location.hash = `/s/${sessionId}/${encodeURIComponent(video.archivo)}`) : onVer())}>
        <span className={`video-marco${video.vertical === undefined ? '' : video.vertical ? ' vertical' : ' horizontal'}`}>
          {/* Su primer cuadro en pequeño (`&cuadro`) hasta que pasas el ratón: solo entonces se baja el video. */}
          <video src={video.src} poster={`${video.src}&cuadro`} muted loop playsInline preload="none" onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />
          {video.vertical !== undefined && <span className="video-forma">{video.vertical ? 'Vertical' : 'Horizontal'}</span>}
        </span>
        <span className="video-titulo">
          {estilo && (
            <span className="video-estilo" title={estilo.title}>
              <Icon icon={estilo.icon ?? '✦'} />
            </span>
          )}
          {video.titulo}
        </span>
        <span className="video-archivo">{video.archivo.split('/').pop()}</span>
        {insignia}
      </button>
      {/* YouTube solo programa horizontales: un vertical no lleva el botón. */}
      {!video.vertical && <YoutubeBoton video={{ cardId: video.cardId, ruta: video.ruta, titulo: video.titulo }} chico />}
    </div>
  )
}
