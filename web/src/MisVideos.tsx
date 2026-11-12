import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
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
 * «Mis videos»: los videos terminados de todos los estilos, del más nuevo al más viejo. Se buscan por título, archivo o
 * estilo, y se filtran por estilo (el elegido va en el hash), por forma y por cómo van en redes. Llegan en una sola
 * petición (`GET /api/videos`), con sus marcas de redes, que se pide de antemano (`precargarVideos`, al arrancar y al
 * pasar por «Mis videos»): al entrar, la lista y las primeras portadas ya están. Las tarjetas son las de la galería de
 * cada estilo (`VideoDe`), por tandas al bajar.
 *
 * Con el teclado: `/` busca; ↓ entra a la rejilla; las flechas se mueven y el video elegido se mueve solo; Enter lo abre;
 * `x` o Espacio lo eligen (para hacer algo con varios; con Mayús, todos desde el último elegido); `d` los baja; Supr los
 * manda a la Papelera; Esc deja de elegir. Con el ratón, la casilla, Ctrl+clic o Mayús+clic.
 */

/** Cuántas tarjetas se dibujan de una vez. Al acercarse al final, otras tantas. */
const TANDA = 30

/** Lo último que llegó de `/api/videos`: al volver a «Mis videos» se dibuja ya, y se pide de nuevo detrás. */
let ultima: VideosDeTodos | null = null
let pidiendo: Promise<VideosDeTodos> | null = null
let pedidaEn = 0
/** Las portadas que ya se pidieron al navegador: no se piden dos veces. */
const portadasPedidas = new Set<string>()

/** Cómo parar al video que se mueve ahora: solo se mueve uno a la vez. */
let moviendose: (() => void) | null = null

/** La portada pequeña de un video (su primer cuadro, `server/miniaturas.ts`). */
const portadaDe = (v: Pick<VideoHecho, 'src'>) => `${v.src}&cuadro`

/**
 * Pide la lista y baja las portadas de la primera pantalla, ya decodificadas. La usa la barra lateral al arrancar y al
 * pasar por «Mis videos», y «Mis videos» al abrir.
 */
export function precargarVideos(o: { nueva?: boolean; reciente?: number; previas?: boolean } = {}): Promise<VideosDeTodos> {
  // Al pasar el ratón por «Mis videos», lo de hace menos de `reciente` ms sirve.
  if (o.reciente && ultima && Date.now() - pedidaEn < o.reciente) return Promise.resolve(ultima)
  // Tras un cambio (un video borrado), la que ya iba en camino puede traer la lista de antes: se pide otra detrás.
  if (o.nueva && pidiendo) return (pidiendo = pidiendo.catch(() => null).then(() => ((pidiendo = null), precargarVideos({ previas: o.previas }))))
  pedidaEn = Date.now()
  // Con `previas` (desde «Mis videos» abierta), el servidor hace también las vistas previas de la primera tanda.
  pidiendo ??= api<VideosDeTodos>(o.previas ? '/api/videos?previas' : '/api/videos')
    .then((r) => {
      ultima = r
      for (const v of r.videos.slice(0, TANDA)) {
        if (portadasPedidas.has(v.src)) continue
        portadasPedidas.add(v.src)
        const img = new Image()
        img.src = portadaDe(v)
        img.decode().catch(() => portadasPedidas.delete(v.src))
      }
      return r
    })
    .finally(() => (pidiendo = null))
  return pidiendo
}

/** Sin acentos ni mayúsculas, para buscar. */
const plano = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** `75.4` → `1:15`. */
export const duracion = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
/** Cuándo se terminó: «hoy, 13:05», «ayer, 9:40», «el martes», «4 nov» o «4 nov 2025». */
export function cuando(t: number, ahora = Date.now()): string {
  const d = new Date(t)
  const hoy = new Date(ahora)
  hoy.setHours(0, 0, 0, 0)
  // Redondeado: el día que cambia el horario de verano mide 23 o 25 horas.
  const dias = Math.round((hoy.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
  const hora = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (dias <= 0) return `hoy, ${hora}`
  if (dias === 1) return `ayer, ${hora}`
  if (dias < 7) return `el ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()]}`
  return `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() === hoy.getFullYear() ? '' : ` ${d.getFullYear()}`}`
}

type Forma = 'vertical' | 'horizontal'

export function MisVideos({ cards, sessions, estilo, onEstilo }: { cards: Card[]; sessions: SessionMeta[]; estilo?: string; onEstilo(id?: string): void }) {
  const [todos, setTodos] = useState<VideosDeTodos | null>(ultima)
  const [error, setError] = useState('')
  // Lo que falló al tocar una marca de redes (reintentar, descartar), al bajar o al borrar.
  const [fallo, setFallo] = useState('')
  // Lo que acaba de pasar: «2 videos en Descargas».
  const [aviso, setAviso] = useState<{ texto: string; ruta?: string } | null>(null)
  // El video de una carpeta de fuera, sin hilo que abrir, se ve en grande.
  const [viendo, setViendo] = useState<string | null>(null)
  const [eliminar, setEliminar] = useState(false) // redes
  // El panel de «Ritmo de publicación», abierto o no.
  const [ritmo, setRitmo] = useState(false)
  // redes: con un estado elegido en el resumen (los que faltan, los que fallaron…), solo esos.
  const [porEstado, setPorEstado] = useState<EstadoRedes | null>(null)
  const [busca, setBusca] = useState('')
  const [forma, setForma] = useState<Forma | null>(null)
  // Los elegidos para hacer algo con varios a la vez, por su ruta.
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [papelera, setPapelera] = useState<VideoHecho[] | null>(null)
  const buscador = useRef<HTMLInputElement>(null)
  const rejilla = useRef<HTMLDivElement>(null)

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
  const primera = useRef(true)
  useEffect(() => {
    let vivo = true
    // La primera vez, sin esperar; las siguientes (un turno que acaba, un cambio en redes), juntas en 300 ms.
    const t = setTimeout(() => precargarVideos({ nueva: !primera.current, previas: true }).then((r) => vivo && (setTodos(r), setError('')), (e) => vivo && setError(e.message)), primera.current ? 0 : 300)
    primera.current = false
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [clave, vuelta])

  // El primer video que se mueve en una página paga arrancar el decodificador (medido: 220–540 ms, contra ~100 los
  // siguientes). Se paga aquí, con uno fuera de la página y mudo, un instante después de abrir.
  const calentado = useRef(false)
  useEffect(() => {
    const src = todos?.videos[0]?.src
    if (!src || calentado.current) return
    const t = setTimeout(() => {
      calentado.current = true
      const v = document.createElement('video')
      v.muted = true
      v.src = `${src}&previa`
      v.play().then(() => v.pause(), () => {}).finally(() => (v.removeAttribute('src'), v.load()))
    }, 400)
    return () => clearTimeout(t)
  }, [todos])

  // `/` (o Ctrl+F) busca desde cualquier sitio de la página, si no escribes en otro campo.
  useEffect(() => {
    const tecla = (e: globalThis.KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.key === '/' && !escribiendo) || (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        buscador.current?.focus()
        buscador.current?.select()
      }
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [])

  const videos = todos?.videos ?? []
  const cuantos = new Map<string, number>()
  for (const v of videos) cuantos.set(v.cardId, (cuantos.get(v.cardId) ?? 0) + 1)
  const conVideos = cards.filter((c) => cuantos.has(c.id))
  const titulos = new Map(cards.map((c) => [c.id, c.title]))
  // Un estilo que ya no tiene videos es como «Todos».
  const filtro = estilo && cuantos.has(estilo) ? estilo : undefined
  const delEstilo = filtro ? videos.filter((v) => v.cardId === filtro) : videos
  const verticales = delEstilo.filter((v) => v.vertical === true).length
  const horizontales = delEstilo.filter((v) => v.vertical === false).length
  // Si el estilo elegido tiene una sola forma, sus pestañas no salen y el filtro de forma no cuenta.
  const formaVale = verticales > 0 && horizontales > 0 ? forma : null
  const deForma = formaVale ? delEstilo.filter((v) => v.vertical === (forma === 'vertical')) : delEstilo
  // Cada palabra tiene que estar en el título, el archivo o el estilo, sin importar acentos ni mayúsculas.
  const palabras = plano(busca).split(/\s+/).filter(Boolean)
  const vistos = palabras.length ? deForma.filter((v) => palabras.every((p) => plano(`${v.titulo} ${v.archivo} ${titulos.get(v.cardId) ?? ''}`).includes(p))) : deForma
  // Un estado que ya no tiene videos (los arreglaste) es como ninguno.
  const enEstado = porEstado && todos?.redes ? vistos.filter((v) => estadoEnRedes(todos.redes!, v.ruta) === porEstado) : []
  const enRejilla = enEstado.length ? enEstado : vistos
  // redes: los que se ven y ya están en todas las redes conectadas. Su archivo sobra en el disco.
  const programados = vistos.filter((v) => todos?.redes?.programados?.includes(v.ruta))
  // Los elegidos que se ven: con otro filtro o una búsqueda, los de antes no cuentan (ni se borran sin verlos), y uno que se
  // fue a la Papelera tampoco.
  const lista = enRejilla.filter((v) => elegidos.has(v.ruta))
  // Un filtro que se quedó sin pestaña (el estado que ya no tiene videos, la forma de un estilo que solo tiene una) se
  // quita: si no, volvería solo al borrar la búsqueda o al volver a «Todos».
  const estadoSobra = !!porEstado && !!todos && !enEstado.length
  const formaSobra = !!forma && !formaVale
  useEffect(() => {
    if (estadoSobra) setPorEstado(null)
    if (formaSobra) setForma(null)
  }, [estadoSobra, formaSobra])
  const claveVista = `${filtro ?? ''}|${formaVale ?? ''}|${busca}|${enEstado.length ? porEstado : ''}`
  useEffect(() => setElegidos(new Set()), [claveVista])
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

  // El último que se eligió o se quitó: con Mayús, se eligen todos los de entre él y el nuevo, como en el Explorador.
  const ancla = useRef<string | null>(null)
  const elegir = (v: VideoHecho, rango = false) => {
    const desde = rango && ancla.current ? enRejilla.findIndex((x) => x.ruta === ancla.current) : -1
    const hasta = enRejilla.findIndex((x) => x.ruta === v.ruta)
    ancla.current = v.ruta
    setElegidos((s) => {
      const n = new Set(s)
      if (desde >= 0 && hasta >= 0) for (const x of enRejilla.slice(Math.min(desde, hasta), Math.max(desde, hasta) + 1)) n.add(x.ruta)
      else if (!n.delete(v.ruta)) n.add(v.ruta)
      return n
    })
  }
  /** Copia los videos a Descargas y lo dice, con un enlace que los señala en su carpeta. */
  const bajando = useRef(false)
  async function bajar(vs: VideoHecho[]) {
    if (bajando.current) return
    bajando.current = true
    setFallo('')
    setAviso({ texto: vs.length === 1 ? 'Copiando a Descargas…' : `Copiando ${vs.length} videos a Descargas…` })
    try {
      const r = await api<{ carpeta: string; copias: string[] }>('/api/videos/descargar', { rutas: vs.map((v) => v.ruta) })
      const nombre = r.copias[0].split(/[\\/]/).pop()
      setAviso({ texto: r.copias.length === 1 ? `«${nombre}» está en Descargas.` : `${r.copias.length} videos están en Descargas.`, ruta: r.copias[0] })
    } catch (e) {
      setAviso(null)
      setFallo(e instanceof Error ? e.message : String(e))
    } finally {
      bajando.current = false
    }
  }
  // El aviso se va solo a los 8 s: no se queda tapando la última fila.
  useEffect(() => {
    if (!aviso?.ruta) return
    const t = setTimeout(() => setAviso(null), 8000)
    return () => clearTimeout(t)
  }, [aviso])
  // Al cerrar el diálogo de la Papelera (o dejar de elegir), el foco vuelve a la tarjeta donde estaba: las flechas siguen.
  const volverA = useRef<HTMLElement | null>(null)
  const devolverFoco = () => requestAnimationFrame(() => (volverA.current?.isConnected ? volverA.current : rejilla.current?.querySelector<HTMLElement>('.video-tile[tabindex="0"]') ?? buscador.current)?.focus())
  // Tras mandar a la Papelera: el lugar (en la rejilla) de la tarjeta que tenía el foco. Cuando llega la lista sin ella, el
  // foco va a la que quedó en su lugar, o a la anterior si era la última.
  const focoTrasBorrar = useRef<number | null>(null)
  useEffect(() => {
    const i = focoTrasBorrar.current
    if (i === null) return
    focoTrasBorrar.current = null
    requestAnimationFrame(() => {
      const tarjetas = rejilla.current?.querySelectorAll<HTMLElement>('[data-video] .video-tile') ?? []
      ;(tarjetas[Math.min(i, tarjetas.length - 1)] ?? buscador.current)?.focus()
    })
  }, [todos])
  /** Las teclas de la rejilla que son de «Mis videos»: elegir, bajar, a la Papelera, todos. */
  function tecla(e: KeyboardEvent, v: VideoHecho) {
    const conjunto = lista.length ? lista : [v]
    volverA.current = e.currentTarget as HTMLElement
    // Mantenerla apretada no repite: ni elige y quita, ni copia el mismo video tres veces.
    if (e.repeat && /^[xd ]$/.test(e.key)) return e.preventDefault(), true
    if ((e.key === 'x' || e.key === 'X' || e.key === ' ') && !e.ctrlKey) return e.preventDefault(), elegir(v, e.shiftKey), true
    if (e.key === 'd' && !e.ctrlKey && !e.metaKey) return e.preventDefault(), void bajar(conjunto), true
    // Supr, y en Mac Cmd+Borrar, como en el Finder.
    if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) return e.preventDefault(), setPapelera(conjunto), true
    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) return e.preventDefault(), setElegidos(new Set(enRejilla.map((x) => x.ruta))), true
    if (e.key === 'Escape') {
      e.preventDefault()
      if (lista.length) setElegidos(new Set())
      else buscador.current?.focus()
      return true
    }
    return false
  }

  const vacio = !videos.length ? 'Aún no hay videos terminados. Cada uno sale aquí en cuanto su estilo lo termina.' : 'Ninguno coincide.'

  return (
    <div className="mis-videos">
      <header className="mis-videos-head">
        <h1>
          Mis videos{todos && <span className="mis-total">{videos.length}</span>}
        </h1>
        <label className="mis-buscar">
          <Icono de="buscar" />
          <input
            ref={buscador}
            type="search"
            autoFocus
            role="combobox"
            aria-expanded={!!enRejilla.length}
            aria-controls="mis-rejilla"
            aria-label="Buscar en tus videos"
            placeholder="Buscar por título, archivo o estilo"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') e.preventDefault(), rejilla.current?.querySelector<HTMLElement>('[data-video] .video-tile')?.focus()
              else if (e.key === 'Enter' && busca.trim() && enRejilla[0]) abrirVideo(enRejilla[0], setViendo)
              else if (e.key === 'Escape' && busca) e.preventDefault(), setBusca('')
            }}
          />
          <kbd>/</kbd>
        </label>
        <div className="mis-videos-acciones">
          <button className={`mis-accion${ritmo ? ' on' : ''}`} aria-expanded={ritmo} title="Cuántos videos salen y cada cuántos días, en TikTok, Instagram y YouTube" onClick={() => setRitmo(!ritmo)}>
            <Icono de="calendario" /> Ritmo de publicación
          </button>
          {programados.length > 0 && (
            <button className="mis-accion peligro" title="Los quita de tu disco, no de las redes" onClick={() => setEliminar(true)}>
              <Icono de="basura" /> Quitar del disco los ya programados ({programados.length})
            </button>
          )}
          <BotonNavegador hilo={NAVEGADOR_REDES} trabajando={enNavegador} /> {/* redes */}
        </div>
      </header>
      {(conVideos.length > 1 || (verticales > 0 && horizontales > 0)) && (
        <nav className="mis-filtros" aria-label="Filtrar">
          {conVideos.length > 1 && (
            <div className="mis-pestanas">
              <button className={filtro ? '' : 'on'} aria-pressed={!filtro} onClick={() => onEstilo()}>
                Todos <span className="cuantos">{videos.length}</span>
              </button>
              {conVideos.map((c) => (
                <button key={c.id} className={filtro === c.id ? 'on' : ''} aria-pressed={filtro === c.id} onClick={() => onEstilo(c.id)}>
                  <Icon icon={c.icon ?? '✦'} /> {c.title} <span className="cuantos">{cuantos.get(c.id)}</span>
                </button>
              ))}
            </div>
          )}
          {verticales > 0 && horizontales > 0 && (
            <div className="mis-pestanas">
              {(
                [
                  ['vertical', 'Verticales', verticales],
                  ['horizontal', 'Horizontales', horizontales]
                ] as const
              ).map(([f, nombre, n]) => (
                <button key={f} className={formaVale === f ? 'on' : ''} aria-pressed={formaVale === f} onClick={() => setForma(formaVale === f ? null : f)}>
                  <span className={`mis-forma ${f}`} aria-hidden="true" /> {nombre} <span className="cuantos">{n}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
      )}
      <div className="mis-publicar">
        <ResumenRedes marcas={todos?.redes} videos={vistos} estado={enEstado.length ? porEstado : null} onEstado={setPorEstado} onCambio={otraVuelta} /> {/* redes */}
        {/* La app que se vende aún no publica: sin marcas de redes, lo de redes no se dibuja; lo de YouTube se quita aquí. */}
        <YoutubeLote videos={vistos} cardId={filtro} />
        <CalendarioRedes marcas={todos?.redes} /> {/* redes */}
        <CalendarioYoutube />
      </div>
      {ritmo && <Ritmos />}
      {error && <p className="bad small">{error}</p>}
      {fallo && <p className="bad small">{fallo}</p>}
      {!todos ? null : enRejilla.length ? (
        // Por estilo, forma, búsqueda y estado, una rejilla nueva: empieza arriba y con la primera tanda.
        <Rejilla key={claveVista} videos={enRejilla} refRejilla={rejilla} onArriba={() => buscador.current?.focus()} elegidos={lista.length > 0}>
          {(v, i) => (
            <VideoDe
              key={v.src}
              video={v}
              primera={i < TANDA}
              // En «Todos», cada uno dice de qué estilo es.
              estilo={filtro ? undefined : conVideos.find((c) => c.id === v.cardId)}
              onVer={() => setViendo(v.src)}
              elegido={elegidos.has(v.ruta)}
              // Con alguno elegido, un clic elige (como en una galería de fotos) en vez de abrir.
              onElegir={(rango) => elegir(v, rango)}
              eligiendo={lista.length > 0}
              onBajar={() => bajar([v])}
              onTecla={(e) => tecla(e, v)}
              insignia={<Marcas marcas={todos.redes} ruta={v.ruta} onCambio={otraVuelta} onError={setFallo} />}
            />
          )}
        </Rejilla>
      ) : (
        <p className="estilo-vacio">{vacio}</p>
      )}
      {(lista.length > 0 || aviso) && (
        <div className="mis-flotan">
          {aviso && (
            <div className="mis-aviso" role="status">
              <Icono de="descargar" /> {aviso.texto}
              {aviso.ruta && (
                <button className="link" onClick={() => api('/api/open', { path: aviso.ruta })}>
                  Mostrar
                </button>
              )}
              <button className="mis-aviso-fuera" aria-label="Cerrar" onClick={() => setAviso(null)}>
                <Icono de="cerrar" />
              </button>
            </div>
          )}
          {lista.length > 0 && (
            <div className="mis-eleccion" role="toolbar" aria-label="Lo elegido">
              <strong>{lista.length === 1 ? '1 elegido' : `${lista.length} elegidos`}</strong>
              <button onClick={() => bajar(lista)} title="Los copia a tu carpeta Descargas (tecla d)">
                <Icono de="descargar" /> Descargar
              </button>
              {lista.length < enRejilla.length && (
                <button onClick={() => setElegidos(new Set(enRejilla.map((v) => v.ruta)))} title="Ctrl+A">
                  <Icono de="palomita" /> Elegir los {enRejilla.length}
                </button>
              )}
              <button className="peligro" onClick={() => setPapelera(lista)} title="Tecla Supr">
                <Icono de="basura" /> A la Papelera
              </button>
              <button className="mis-eleccion-fuera" onClick={() => (setElegidos(new Set()), devolverFoco())} title="Esc">
                <Icono de="cerrar" /> Dejar de elegir
              </button>
            </div>
          )}
        </div>
      )}
      {viendo && (
        <div className="lightbox" onClick={() => setViendo(null)}>
          <video src={viendo} controls autoPlay onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      {papelera && (
        <Confirm
          title={papelera.length === 1 ? `¿Borrar «${papelera[0].titulo}»?` : `¿Borrar ${papelera.length} videos?`}
          action="A la Papelera"
          danger
          // Llega con una tecla (Supr): con el foco en Cancelar, un Enter de más no borra.
          enfocarCancelar
          onClose={() => (setPapelera(null), focoTrasBorrar.current === null && devolverFoco())}
          onConfirm={async () => {
            setFallo('')
            const malos: string[] = []
            for (const v of papelera) await api('/api/videos/borrar', { ruta: v.ruta }).catch((e) => malos.push(`«${v.titulo}»: ${e.message}`))
            // El foco no vuelve a una tarjeta que se va (movería un archivo que ya está en la Papelera): espera a la lista nueva.
            const tarjetas = [...(rejilla.current?.querySelectorAll<HTMLElement>('[data-video] .video-tile') ?? [])]
            focoTrasBorrar.current = Math.max(0, tarjetas.indexOf(volverA.current as HTMLElement))
            volverA.current = null
            setElegidos(new Set())
            if (malos.length) setFallo(malos.join(' '))
            dispatchEvent(new Event('sloth-videos'))
          }}
        >
          {papelera.length === 1 ? <code>{papelera[0].archivo.split('/').pop()}</code> : `Los ${papelera.length} archivos`} van a la Papelera de reciclaje, de donde puedes
          recuperarlos. Lo demás de su carpeta se queda, y lo que ya está programado o subido en tus redes sigue igual.
        </Confirm>
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

/** Abre el hilo del video con él en el monitor (un hilo puede tener varios), o lo enseña en grande si no tiene hilo. */
function abrirVideo(video: VideoHecho, ver: (src: string) => void) {
  if (video.sessionId) location.hash = `/s/${video.sessionId}/${encodeURIComponent(video.archivo)}`
  else ver(video.src)
}

/**
 * Las tarjetas, por tandas: la primera al abrir y otra cada vez que el final se acerca a la vista. Cada video que se
 * dibuja pide su primer cuadro en pequeño; los de más abajo no piden nada hasta que bajas. Mientras se desplaza, no
 * responden al ratón (`useDesplazando`): los que pasan bajo el cursor no empiezan a bajarse.
 *
 * Con el teclado es una sola parada de Tab (la tarjeta activa); las flechas van a la de al lado o a la de la fila de
 * arriba o de abajo según dónde están dibujadas, Inicio y Fin a la primera y la última. ↑ desde la primera fila, `onArriba`.
 */
export function Rejilla({ videos, children, refRejilla, onArriba, elegidos }: { videos: VideoHecho[]; children(v: VideoHecho, i: number): ReactNode; refRejilla?: RefObject<HTMLDivElement | null>; onArriba?(): void; elegidos?: boolean }) {
  const [hasta, setHasta] = useState(TANDA)
  const propia = useRef<HTMLDivElement>(null)
  const rejilla = refRejilla ?? propia
  const fin = useRef<HTMLDivElement>(null)
  const quedan = videos.length > hasta
  // Una sola parada de Tab: la tarjeta activa (la última con el foco) tiene tabIndex 0 y las demás -1.
  const activa = useRef(0)
  const marcar = () => {
    const tarjetas = rejilla.current?.querySelectorAll<HTMLElement>('[data-video] .video-tile') ?? []
    const i = Math.min(activa.current, tarjetas.length - 1)
    tarjetas.forEach((t, k) => {
      t.tabIndex = k === i ? 0 : -1
      // El botón de YouTube de un horizontal, solo el de la activa: si no, una parada de Tab por video.
      const yt = t.closest('[data-video]')?.querySelector<HTMLElement>('.youtube-boton')
      if (yt) yt.tabIndex = k === i ? 0 : -1
    })
  }
  useEffect(marcar)
  useDesplazando(rejilla)
  // Se vuelve a mirar tras cada tanda: si el final sigue cerca (una pantalla alta), entra otra.
  useEffect(() => {
    if (!quedan || !fin.current) return
    // Angosta, la rejilla no hace scroll (lo hace la página): entonces se mira la ventana, o entrarían todas las tandas.
    const propio = rejilla.current && getComputedStyle(rejilla.current).overflowY !== 'visible'
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setHasta((n) => n + TANDA), { root: propio ? rejilla.current : null, rootMargin: '0px 0px 600px' })
    io.observe(fin.current)
    return () => io.disconnect()
  }, [quedan, hasta])

  function mover(e: KeyboardEvent<HTMLDivElement>) {
    const flechas = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!flechas.includes(e.key) || !(e.target instanceof HTMLElement) || !e.target.classList.contains('video-tile')) return
    const tarjetas = [...(rejilla.current?.querySelectorAll<HTMLElement>('[data-video] .video-tile') ?? [])]
    const i = tarjetas.indexOf(e.target)
    if (i < 0) return
    e.preventDefault()
    let j = i
    if (e.key === 'ArrowLeft') j = i - 1
    else if (e.key === 'ArrowRight') j = i + 1
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = tarjetas.length - 1
    else {
      // La de la fila de arriba o de abajo más cercana en horizontal: las tarjetas verticales y horizontales no miden igual.
      const a = e.target.getBoundingClientRect()
      const centro = a.left + a.width / 2
      const abajo = e.key === 'ArrowDown'
      const otras = tarjetas.map((t, k) => ({ k, r: t.getBoundingClientRect() })).filter(({ r }) => (abajo ? r.top >= a.bottom - 2 : r.bottom <= a.top + 2))
      if (!otras.length) {
        if (!abajo) onArriba?.()
        return
      }
      const fila = abajo ? Math.min(...otras.map(({ r }) => r.top)) : Math.max(...otras.map(({ r }) => r.top))
      j = otras.filter(({ r }) => r.top === fila).sort((x, y) => Math.abs(x.r.left + x.r.width / 2 - centro) - Math.abs(y.r.left + y.r.width / 2 - centro))[0].k
    }
    tarjetas[Math.max(0, Math.min(tarjetas.length - 1, j))]?.focus()
  }

  return (
    <div
      className={`videos${elegidos ? ' eligiendo' : ''}`}
      id="mis-rejilla"
      ref={rejilla}
      onKeyDown={mover}
      onFocus={(e) => {
        const tarjetas = [...(rejilla.current?.querySelectorAll<HTMLElement>('[data-video] .video-tile') ?? [])]
        const i = tarjetas.indexOf(e.target as HTMLElement)
        if (i >= 0 && i !== activa.current) (activa.current = i), marcar()
      }}
    >
      {videos.slice(0, hasta).map((v, i) => children(v, i))}
      {quedan && <div className="mis-videos-fin" ref={fin} />}
    </div>
  )
}

/**
 * Un video terminado, en la galería de su estilo y en «Mis videos»: su portada (el primer cuadro, en pequeño) con lo
 * que dura, su título, de qué estilo es y cuándo se terminó. Se mueve al pasar por encima o al llegar con el teclado, y un
 * clic abre su hilo con él en el monitor o, si no tiene (es de una carpeta de fuera), lo enseña en grande (`onVer`).
 * Encima, al pasar: elegirlo (`onElegir`), bajarlo (`onBajar`), compartirlo en la comunidad y mandarlo a la Papelera.
 * `insignia`: sus marcas de redes. `onTecla`: las teclas de quien lo usa (devuelve si la atendió).
 */
export function VideoDe(props: {
  video: VideoHecho
  onVer(): void
  insignia?: ReactNode
  estilo?: Card
  primera?: boolean
  elegido?: boolean
  eligiendo?: boolean
  /** Elegirlo o quitarlo; con `rango` (Mayús), también los de entre el último elegido y él. */
  onElegir?(rango?: boolean): void
  onBajar?(): void
  onTecla?(e: KeyboardEvent): boolean
}) {
  const { video, onVer, insignia, estilo, elegido, eligiendo, onElegir, onBajar, onTecla } = props
  const [borrar, setBorrar] = useState(false)
  const tile = useRef<HTMLButtonElement>(null)
  // Se mueve mientras el ratón está encima o la tarjeta tiene el foco; `listo` cuando ya se mueve (hasta entonces, la portada).
  const [mirando, setMirando] = useState(false)
  const [listo, setListo] = useState(false)
  // Uno solo a la vez: el que empieza para al que se movía (el del foco, si el ratón pasa por otro).
  const parar = useRef(() => (setMirando(false), setListo(false)))
  useEffect(() => () => void (moviendose === parar.current && (moviendose = null)), [])
  const ver = (si: boolean) => {
    if (!si) return parar.current()
    if (moviendose && moviendose !== parar.current) moviendose()
    moviendose = parar.current
    setMirando(true)
  }
  const forma = video.vertical === undefined ? '' : video.vertical ? ' vertical' : ' horizontal'
  return (
    <div
      className={`video-con-subida${elegido ? ' elegido' : ''}`}
      data-video
      // En toda la tarjeta, también sus botones de encima: ir de la portada a «Descargar» no la para.
      onPointerEnter={() => ver(true)}
      // Al salir el ratón sigue moviéndose si tiene el foco del teclado.
      onPointerLeave={(e) => !e.currentTarget.querySelector('.video-tile:focus-visible') && ver(false)}
    >
      {borrar && (
        <Confirm
          title={`¿Borrar «${video.titulo}»?`}
          action="Borrar"
          danger
          enfocarCancelar
          onClose={() => (setBorrar(false), requestAnimationFrame(() => tile.current?.isConnected && tile.current.focus()))}
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
      <button
        className="video-tile"
        title={`${video.titulo}\n${video.archivo}`}
        aria-pressed={onElegir ? !!elegido : undefined}
        // Ctrl (Cmd) o Mayús con el clic eligen sin la casilla; con algo elegido, cualquier clic elige.
        onClick={(e) => (onElegir && (eligiendo || e.ctrlKey || e.metaKey || e.shiftKey) ? onElegir(e.shiftKey) : abrirVideo(video, onVer))}
        ref={tile}
        // Con el teclado se mueve al llegar; un clic de ratón deja el foco, pero manda el ratón.
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && ver(true)}
        onBlur={(e) => !e.currentTarget.parentElement?.matches(':hover') && ver(false)}
        onKeyDown={(e) => onTecla?.(e)}
      >
        <span className={`video-marco${forma}${listo ? ' moviendo' : ''}`}>
          <img src={portadaDe(video)} alt="" draggable={false} loading={props.primera === false ? 'lazy' : 'eager'} decoding="async" />
          {/* El video se baja solo al mirarlo: con cientos, abrir la galería no baja ninguno. */}
          {/* Su vista previa chica (`&previa`, 400 px y sin audio); si no está hecha, el servidor manda el original. */}
          {mirando && <video src={`${video.src}&previa`} muted loop playsInline autoPlay preload="auto" onPlaying={() => setListo(true)} />}
          {video.segundos !== undefined && <span className="video-dura">{duracion(video.segundos)}</span>}
        </span>
        <span className="video-titulo">{video.titulo}</span>
        <span className="video-meta">
          {estilo && (
            <span className="video-estilo" title={estilo.title}>
              <Icon icon={estilo.icon ?? '✦'} />
            </span>
          )}
          {cuando(video.t)}
        </span>
        {insignia}
      </button>
      <div className="video-acciones">
        {onElegir && (
          <button className="video-elegir" tabIndex={-1} aria-label={elegido ? 'Quitar de lo elegido' : 'Elegir'} title={elegido ? 'Quitar de lo elegido (x)' : 'Elegir, para hacer algo con varios (x; con Mayús, todos hasta aquí)'} onClick={(e) => onElegir(e.shiftKey)}>
            <Icono de="palomita" />
          </button>
        )}
        <span className="video-acciones-der">
          {onBajar && (
            <button tabIndex={-1} aria-label="Descargar" title="Copiarlo a Descargas (d)" onClick={onBajar}>
              <Icono de="descargar" />
            </button>
          )}
          {/* comunidad: lo publica en «Lo que hice», con su portada. */}
          <button tabIndex={-1} aria-label="Compartir en la comunidad" title="Compartir en la comunidad" onClick={() => compartirVideo(video)}>
            <Icono de="compartir" />
          </button>
          <button className="video-borrar" tabIndex={-1} aria-label="Borrar" title="Borrar este video (Supr)" onClick={() => setBorrar(true)}>
            <Icono de="basura" />
          </button>
        </span>
      </div>
      {/* YouTube solo programa horizontales: un vertical no lleva el botón. */}
      {!video.vertical && <YoutubeBoton video={{ cardId: video.cardId, ruta: video.ruta, titulo: video.titulo }} chico />}
    </div>
  )
}
