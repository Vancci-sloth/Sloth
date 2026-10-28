import { type CSSProperties, type DragEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AdjuntoComunidad, Autor, AvisoComunidad, CategoriaComunidad, ComentarioComunidad, FeedComunidad, PublicacionComunidad, RoadmapComunidad } from '../../shared/types'
import { api, ErrorApi } from './api'
import { Confirm } from './Confirm'
import { Escribir, type Escrito, subirImagen } from './Escribir'
import { LINK } from './etiquetas'
import { Unirse } from './Licencia'
import { Icono as IconoBase, type NombreIcono } from './Iconos'
import './Comunidad.css'

/**
 * «Comunidad»: lo que la gente hace con Sloth y cómo lo hace, como la comunidad de Skool y en la paleta de Sloth. Arriba
 * se escribe; luego, las secciones y el feed: lo fijado y después lo que tuvo actividad más reciente (un comentario la
 * sube). Cada publicación se abre en grande, con sus comentarios. A la derecha, la comunidad con sus números y tu perfil.
 * Vive en el Worker del cobro (`licencias/src/comunidad.ts`), por `server/comunidad.ts`, y se vuelve a pedir cada minuto
 * mientras se ve. Quién comentó algo que aún no abres lo recuerda esta computadora (`comunidad:vistas`).
 *
 * Mejoras es lo que la gente quiere que Sloth haga mejor: el creador dice cómo va cada una, y todos lo ven.
 * «Compartir» de un video de «Mis videos» abre el compositor en Lo que hice con ese video (`compartirVideo`).
 *
 * Los comentarios llevan imágenes, como el chat (se pegan, se sueltan o se eligen), se responden (un nivel) y se les da
 * me gusta. Lo de los demás se reporta, y lo reportado por 3 deja de
 * verse hasta que el creador lo revise. La campana junta tus avisos: te comentaron, te respondieron, te dieron me gusta,
 * cambió tu mejora o hay un anuncio; los que no has leído salen también junto a «Comunidad», en la barra lateral.
 */

export const SECCIONES: { id: CategoriaComunidad; nombre: string; icono: NombreIcono; escribe: string }[] = [
  { id: 'general', nombre: 'General', icono: 'hilo', escribe: 'Preséntate, platica o comparte lo que quieras.' },
  { id: 'hice', nombre: 'Lo que hice', icono: 'video', escribe: 'Cuenta cómo lo hiciste: el estilo, lo que le pediste a Sloth, lo que aprendiste.' },
  { id: 'ayuda', nombre: 'Ayuda', icono: 'pregunta', escribe: '¿Qué no te sale? Cuéntalo y, si puedes, pega una captura.' },
  { id: 'mejoras', nombre: 'Mejoras', icono: 'flechaArriba', escribe: '¿Qué le falta a Sloth o qué debería hacer mejor?' },
  { id: 'anuncios', nombre: 'Anuncios', icono: 'megafono', escribe: '¿Qué hay de nuevo en Sloth?' },
]
const seccionDe = (id: CategoriaComunidad) => SECCIONES.find((s) => s.id === id) ?? SECCIONES[0]

type Yo = FeedComunidad['yo']

const COMPARTIR = 'comunidad:compartir'
const ABRIR = 'comunidad:abrir'
const VISTAS = 'comunidad:vistas'

/** Lleva a la comunidad con uno de «Mis videos» listo para publicarlo en Lo que hice. */
export function compartirVideo(v: { ruta: string; titulo: string; src: string }) {
  sessionStorage.setItem(COMPARTIR, JSON.stringify(v))
  location.hash = '/comunidad'
  dispatchEvent(new Event(COMPARTIR))
}
/** Lleva a la comunidad con una publicación abierta. */
export function abrirPublicacion(id: string) {
  sessionStorage.setItem(ABRIR, id)
  location.hash = '/comunidad'
  dispatchEvent(new Event(ABRIR))
}

const Icono = ({ de }: { de: NombreIcono }) => <IconoBase de={de} className="com-ico" />

/** «hace 5 min», «hace 3 h», «hace 2 d» y luego la fecha. */
function hace(iso: string) {
  const ms = Date.parse(iso)
  const min = Math.floor((Date.now() - ms) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`
  if (min < 7 * 24 * 60) return `hace ${Math.floor(min / 60 / 24)} d`
  const d = new Date(ms)
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}
const fechaLarga = (iso: string) => new Date(iso).toLocaleString('es', { dateStyle: 'full', timeStyle: 'short' })

function leerVistas(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VISTAS) ?? '{}')
  } catch {
    return {}
  }
}

export function Comunidad() {
  const [seccion, setSeccion] = useState<CategoriaComunidad | ''>(() => {
    const guardada = localStorage.getItem('comunidad:seccion')
    return SECCIONES.some((s) => s.id === guardada) ? (guardada as CategoriaComunidad) : ''
  })
  const [feed, setFeed] = useState<FeedComunidad | null>(null)
  const [lista, setLista] = useState<PublicacionComunidad[] | null>(null)
  const [mas, setMas] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState('')
  // La app que se vende sin cuenta gratis todavía (401): la crea aquí.
  const [sinCuenta, setSinCuenta] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
  // El compositor abierto: en qué sección y, si llega de «Mis videos», con qué. `clave` lo vuelve a armar.
  const [escribiendo, setEscribiendo] = useState<{ seccion: CategoriaComunidad; titulo?: string; video?: { subida: Promise<AdjuntoComunidad>; poster?: string }; clave: number } | null>(null)
  // Tu perfil: al tocarlo o, sin nombre, antes de publicar, comentar o dar me gusta (`luego`).
  const [perfil, setPerfil] = useState<{ luego?: () => void } | null>(null)
  const [nueva, setNueva] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [vistas, setVistas] = useState(leerVistas)
  const [, setReloj] = useState(0)
  const subirAlCompositor = useRef<((archivos: File[]) => void) | null>(null)
  // La respuesta de una sección vieja que llega tarde no pisa la nueva.
  const pedido = useRef(0)
  const ahora = useRef({ lista, mas })
  ahora.current = { lista, mas }

  const yo = feed?.yo

  async function cargar(s: CategoriaComunidad | '' = seccion) {
    const n = ++pedido.current
    try {
      const f = await api<FeedComunidad>(`/api/comunidad${s ? `?categoria=${s}` : ''}`)
      if (n !== pedido.current) return
      setFeed(f)
      setError('')
      setSinCuenta(false)
      // Al volver a pedir, lo de las páginas siguientes se queda, si aún va después de la primera.
      const l = ahora.current.lista
      const ids = new Set(f.publicaciones.map((p) => p.id))
      const ultima = f.publicaciones.filter((p) => !p.fijada).at(-1)?.actividad
      const resto = l && f.mas && ultima ? l.filter((p) => !ids.has(p.id) && !p.fijada && p.actividad < ultima) : []
      setLista([...f.publicaciones, ...resto])
      setMas(resto.length ? ahora.current.mas : f.mas)
    } catch (e) {
      if (n !== pedido.current) return
      setSinCuenta(e instanceof ErrorApi && e.status === 401)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function verMas() {
    const ultima = lista?.filter((p) => !p.fijada).at(-1)?.actividad
    if (!ultima || cargandoMas) return
    setCargandoMas(true)
    try {
      const f = await api<FeedComunidad>(`/api/comunidad?${new URLSearchParams({ ...(seccion ? { categoria: seccion } : {}), antes: ultima })}`)
      setLista((l) => [...(l ?? []), ...f.publicaciones.filter((p) => !l?.some((x) => x.id === p.id))])
      setMas(f.mas)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargandoMas(false)
    }
  }

  // Al abrir, al cambiar de sección y cada minuto mientras se ve; también cuando algo se publica desde un hilo.
  useEffect(() => {
    void cargar()
    localStorage.setItem('comunidad:seccion', seccion)
  }, [seccion])
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && void cargar(), 60_000)
    const reloj = setInterval(() => setReloj((n) => n + 1), 60_000)
    const oir = () => void cargar()
    addEventListener('sloth-comunidad', oir)
    return () => (clearInterval(t), clearInterval(reloj), removeEventListener('sloth-comunidad', oir))
  }, [seccion])

  // Lo que llega de fuera: un video para compartir o una publicación para abrir.
  useEffect(() => {
    const compartido = () => {
      const v = sessionStorage.getItem(COMPARTIR)
      if (!v) return
      sessionStorage.removeItem(COMPARTIR)
      const { ruta, titulo, src } = JSON.parse(v) as { ruta: string; titulo: string; src: string }
      setEscribiendo({ seccion: 'hice', titulo, video: { subida: api<AdjuntoComunidad>('/api/comunidad/video', { ruta }), poster: `${src}&cuadro` }, clave: Date.now() })
    }
    const abrir = () => {
      const id = sessionStorage.getItem(ABRIR)
      if (!id) return
      sessionStorage.removeItem(ABRIR)
      setAbierta(id)
    }
    compartido()
    abrir()
    addEventListener(COMPARTIR, compartido)
    addEventListener(ABRIR, abrir)
    return () => (removeEventListener(COMPARTIR, compartido), removeEventListener(ABRIR, abrir))
  }, [])

  /** Sin nombre no se publica ni se comenta: primero se pide. */
  function conNombre(accion: () => void) {
    if (yo && !yo.nombre) setPerfil({ luego: accion })
    else accion()
  }

  function abrirCompositor(s: CategoriaComunidad = seccion && seccion !== 'anuncios' ? seccion : 'general', titulo?: string) {
    conNombre(() => setEscribiendo({ seccion: s, titulo, clave: Date.now() }))
  }

  async function publicar(e: Escrito, s: CategoriaComunidad) {
    const p = await api<PublicacionComunidad>('/api/comunidad/publicar', { categoria: s, ...e })
    setEscribiendo(null)
    setFeed((f) => f && { ...f, yo: { ...f.yo, publicaciones: f.yo.publicaciones + 1 } })
    // Entra después de lo fijado, si es de la sección que ves; si no, cambia a la suya.
    if (seccion && seccion !== s) return setSeccion(s), setLista(null), setNueva(p.id)
    setLista((l) => {
      const fijadas = (l ?? []).filter((x) => x.fijada)
      return [...fijadas, p, ...(l ?? []).filter((x) => !x.fijada)]
    })
    setNueva(p.id)
  }

  const actualizar = (p: PublicacionComunidad) => setLista((l) => l?.map((x) => (x.id === p.id ? p : x)) ?? l)

  async function megusta(p: PublicacionComunidad): Promise<PublicacionComunidad> {
    const antes = p
    const optimista = { ...p, megusta: !p.megusta, likes: p.likes + (p.megusta ? -1 : 1) }
    actualizar(optimista)
    try {
      const r = await api<{ likes: number; megusta: boolean }>(`/api/comunidad/p/${p.id}/megusta`, {})
      const listo = { ...optimista, ...r }
      actualizar(listo)
      return listo
    } catch (e) {
      actualizar(antes)
      setError(e instanceof Error ? e.message : String(e))
      return antes
    }
  }

  function visto(id: string) {
    setVistas((v) => {
      const nuevas = Object.fromEntries([...Object.entries({ ...v, [id]: new Date().toISOString() })].sort((a, b) => b[1].localeCompare(a[1])).slice(0, 400))
      localStorage.setItem(VISTAS, JSON.stringify(nuevas))
      return nuevas
    })
  }

  // Soltar una captura en cualquier parte la lleva al compositor (y lo abre).
  const sirve = (e: DragEvent) => e.dataTransfer.types.includes('Files') && !abierta && !perfil
  const soltar = {
    onDragOver: (e: DragEvent) => {
      if (!sirve(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setArrastrando(true)
      if (!escribiendo && yo?.nombre) abrirCompositor()
    },
    onDragLeave: (e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setArrastrando(false),
    onDrop: (e: DragEvent) => {
      setArrastrando(false)
      if (e.isDefaultPrevented() || !sirve(e)) return
      e.preventDefault()
      subirAlCompositor.current?.([...e.dataTransfer.files])
    },
  }

  const caras = [...new Map((lista ?? []).flatMap((p) => [p.autor, ...p.comentaron]).filter((a) => a.nombre).map((a) => [a.id, a])).values()].slice(0, 8)
  const escribe = escribiendo && seccionDe(escribiendo.seccion)

  return (
    <div className="com" {...soltar}>
      <div className="com-rejilla">
        <main className="com-centro">
          <header className="com-cabeza">
            <div>
              <div className="com-antetitulo">Sloth</div>
              <h1>Comunidad</h1>
            </div>
            {feed && <Avisos sinLeer={feed.avisos} onAbrir={setAbierta} onLeidos={() => setFeed((f) => f && { ...f, avisos: 0 })} />}
          </header>

          {escribiendo && escribe ? (
            <div className="com-nueva">
              <div className="com-nueva-cabeza">
                <Cara autor={yo} />
                <span>
                  <strong>{yo?.nombre || 'Tú'}</strong> publica en <span className="com-nueva-seccion">{escribe.nombre}</span>
                </span>
              </div>
              <Escribir
                key={escribiendo.clave}
                conTitulo
                conVideo
                ayuda={escribiendo.seccion === 'mejoras' || escribiendo.seccion === 'ayuda'}
                inicial={{ titulo: escribiendo.titulo }}
                videoCompartido={escribiendo.video}
                placeholder={escribe.escribe}
                accion="Publicar"
                autoFocus
                subir={subirAlCompositor}
                soltando={arrastrando}
                extra={<ElegirSeccion valor={escribiendo.seccion} creador={!!yo?.creador} onCambio={(s) => setEscribiendo((x) => x && { ...x, seccion: s })} />}
                onListo={(e) => publicar(e, escribiendo.seccion)}
                onCancelar={() => setEscribiendo(null)}
              />
            </div>
          ) : (
            <button className="com-escribe" disabled={!feed} onClick={() => abrirCompositor()}>
              <Cara autor={yo} />
              <span>Escribe algo</span>
            </button>
          )}

          <nav className="com-secciones" aria-label="Secciones">
            <button className={seccion === '' ? 'on' : ''} onClick={() => seccion !== '' && (setLista(null), setSeccion(''))}>
              Todo
            </button>
            {SECCIONES.map((s) => (
              <button key={s.id} className={seccion === s.id ? 'on' : ''} onClick={() => seccion !== s.id && (setLista(null), setSeccion(s.id))}>
                <Icono de={s.icono} />
                {s.nombre}
              </button>
            ))}
          </nav>

          {yo && (
            <Bienvenida
              yo={yo}
              onNombre={() => setPerfil({})}
              onPresentarse={() => abrirCompositor('general', '¡Hola! Soy…')}
              onComentar={() => (setLista(null), setSeccion('hice'))}
            />
          )}

          {sinCuenta && <Unirse onListo={() => void cargar()} />}
          {error && !sinCuenta && (
            <div className="com-error">
              {error}
              <button onClick={() => void cargar()}>Reintentar</button>
            </div>
          )}
          {lista === null && !error && <div className="com-cargando">Cargando…</div>}
          {lista?.length === 0 && (
            <div className="com-vacio">
              <div className="com-vacio-logo">
                <img src="/icon.svg" alt="" />
              </div>
              <strong>{seccion ? `Aún no hay nada en ${seccionDe(seccion).nombre}` : 'Aún no hay nada aquí'}</strong>
              <p>{seccion === 'anuncios' ? 'Lo nuevo de Sloth saldrá aquí.' : 'Sé el primero: preséntate o comparte un video que hiciste con Sloth.'}</p>
            </div>
          )}

          {!!lista?.length && (
            <div className="com-feed">
              {lista.map((p) => (
                <Tarjeta
                  key={p.id}
                  p={p}
                  yo={yo}
                  nueva={nueva === p.id}
                  visto={vistas[p.id]}
                  onAbrir={() => setAbierta(p.id)}
                  onMegusta={() => conNombre(() => void megusta(p))}
                />
              ))}
              {mas && (
                <button className="com-mas" disabled={cargandoMas} onClick={() => void verMas()}>
                  {cargandoMas ? 'Cargando…' : 'Ver más'}
                </button>
              )}
            </div>
          )}
        </main>

        <aside className="com-lado">
          <div className="com-comunidad">
            <div className="com-comunidad-portada">
              <img src="/icon.svg" alt="" />
            </div>
            <div className="com-comunidad-cuerpo">
              <h2>Comunidad Sloth</h2>
              <p>Lo que la gente hace con Sloth y cómo lo hace. Comparte tus videos, pregunta lo que no te sale y pide lo que le falta.</p>
              <div className="com-numeros">
                <div>
                  <strong>{feed ? feed.miembros.toLocaleString('es-MX') : '–'}</strong>
                  <span>Miembros</span>
                </div>
                <div>
                  <strong>{feed ? feed.activos.toLocaleString('es-MX') : '–'}</strong>
                  <span>Activos hoy</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>Creador</span>
                </div>
              </div>
              {caras.length > 0 && (
                <div className="com-caras">
                  {caras.map((a) => (
                    <Cara key={a.id} autor={a} tam="chica" />
                  ))}
                </div>
              )}
              <button className="com-perfil" disabled={!yo} onClick={() => setPerfil({})}>
                <Cara autor={yo} tam="chica" />
                {yo?.nombre ? 'Tu perfil' : 'Ponte tu nombre'}
              </button>
            </div>
          </div>
          {feed && <Votar roadmap={feed.roadmap} fundador={feed.yo.insignia === 'fundador'} onVoto={(roadmap) => setFeed((f) => f && { ...f, roadmap })} />}
        </aside>
      </div>

      {abierta && yo && (
        <Abierta
          id={abierta}
          previa={lista?.find((p) => p.id === abierta)}
          yo={yo}
          onCambio={actualizar}
          onMegusta={megusta}
          onComento={() => setFeed((f) => f && { ...f, yo: { ...f.yo, comentarios: f.yo.comentarios + 1 } })}
          onBorrada={() => (setLista((l) => l?.filter((x) => x.id !== abierta) ?? l), setAbierta(null))}
          conNombre={conNombre}
          onCerrar={() => (visto(abierta), setAbierta(null))}
        />
      )}
      {perfil && yo && (
        <Perfil
          yo={yo}
          onListo={(a) => {
            setFeed((f) => f && { ...f, yo: { ...f.yo, ...a } })
            // Tu nombre y tu foto también en lo que ya está a la vista.
            setLista((l) => l?.map((p) => ({ ...p, autor: p.autor.id === a.id ? a : p.autor, comentaron: p.comentaron.map((c) => (c.id === a.id ? a : c)) })) ?? l)
            const luego = perfil.luego
            setPerfil(null)
            luego?.()
          }}
          onCerrar={() => setPerfil(null)}
        />
      )}
    </div>
  )
}

/** La cara de alguien: su foto, el logo de Sloth si es el creador sin foto, o su inicial. */
function Cara({ autor, tam = '' }: { autor?: Autor; tam?: '' | 'chica' | 'grande' }) {
  if (autor?.foto) return <img className={`com-cara ${tam}`} src={autor.foto} alt="" />
  if (autor?.creador)
    return (
      <span className={`com-cara sloth ${tam}`}>
        <img src="/icon.svg" alt="" />
      </span>
    )
  return <span className={`com-cara ${tam}`}>{(autor?.nombre.trim() || '·').charAt(0).toUpperCase()}</span>
}

function Nombre({ autor }: { autor: Autor }) {
  return (
    <span className="com-nombre">
      {autor.nombre || 'Sin nombre'}
      {autor.creador && <span className="com-creador">Creador</span>}
      {autor.insignia && <span className="com-creador">{autor.insignia === 'fundador' ? 'Fundador' : 'Apoya'}</span>}
    </span>
  )
}

/** La sección donde va una publicación: Anuncios, solo para el creador. */
function ElegirSeccion({ valor, creador, onCambio }: { valor: CategoriaComunidad; creador: boolean; onCambio(s: CategoriaComunidad): void }) {
  return (
    <label className="com-elegir" title="La sección donde se publica">
      <Icono de={seccionDe(valor).icono} />
      <select value={valor} onChange={(e) => onCambio(e.target.value as CategoriaComunidad)}>
        {SECCIONES.filter((s) => creador || s.id !== 'anuncios').map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Cómo va una mejora: lo que dijo el creador. */
function EstadoMejora({ p }: { p: PublicacionComunidad }) {
  if (p.categoria !== 'mejoras') return null
  if (p.estado === 'hecha')
    return (
      <span className="com-estado hecha">
        <Icono de="palomita" /> Hecha
      </span>
    )
  if (p.estado === 'haciendo') return <span className="com-estado haciendo">Se está haciendo</span>
  return <span className="com-estado">Idea</span>
}

/** «Comienza aquí»: lo primero que se hace en la comunidad, hasta hacerlo todo. */
function Bienvenida({ yo, onNombre, onPresentarse, onComentar }: { yo: Yo; onNombre(): void; onPresentarse(): void; onComentar(): void }) {
  const [oculta, setOculta] = useState(() => localStorage.getItem('comunidad:bienvenida') === 'no')
  const pasos = [
    { hecho: !!yo.nombre, texto: 'Ponte tu nombre y tu foto', accion: onNombre },
    { hecho: yo.publicaciones > 0, texto: 'Preséntate: quién eres y qué quieres hacer con Sloth', accion: onPresentarse },
    { hecho: yo.comentarios > 0, texto: 'Comenta un video que hizo alguien', accion: onComentar },
  ]
  const hechos = pasos.filter((p) => p.hecho).length
  if (oculta || hechos === pasos.length) return null
  const r = 9
  const vuelta = 2 * Math.PI * r
  return (
    <section className="com-bienvenida">
      <header>
        <svg viewBox="0 0 24 24" className="com-avance" aria-label={`${hechos} de ${pasos.length}`}>
          <circle cx="12" cy="12" r={r} />
          <circle cx="12" cy="12" r={r} className="hecho" strokeDasharray={`${(vuelta * hechos) / pasos.length} ${vuelta}`} />
        </svg>
        <strong>¡Bienvenido! Comienza aquí</strong>
        <button className="com-icono" title="Ocultar" onClick={() => (localStorage.setItem('comunidad:bienvenida', 'no'), setOculta(true))}>
          <Icono de="cerrar" />
        </button>
      </header>
      {pasos.map((p) => (
        <button key={p.texto} className={`com-paso${p.hecho ? ' hecho' : ''}`} disabled={p.hecho} onClick={p.accion}>
          <span className="com-paso-marca">{p.hecho && <Icono de="palomita" />}</span>
          {p.texto}
        </button>
      ))}
    </section>
  )
}

/** Una publicación en el feed: quién, cuándo y dónde; su título y el principio del texto; su portada; y lo que generó. */
function Tarjeta({ p, yo, nueva, visto, onAbrir, onMegusta }: { p: PublicacionComunidad; yo?: Yo; nueva: boolean; visto?: string; onAbrir(): void; onMegusta(): void }) {
  const portada = p.adjuntos.find((a) => a.tipo === 'video') ?? p.adjuntos[0]
  const imagen = portada && (portada.tipo === 'imagen' ? portada.url : portada.posterUrl)
  // Nuevo: llegó después de la última vez que la abriste, y no lo escribiste tú.
  const nuevoComentario = !!p.ultimoComentario && (!visto || p.ultimoComentario > visto) && p.comentaron[0]?.id !== yo?.id
  return (
    <article
      className={`com-post${p.fijada ? ' fijada' : ''}${nueva ? ' nueva' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onAbrir())}
    >
      <header className="com-post-cabeza">
        <Cara autor={p.autor} />
        <div className="com-post-quien">
          <Nombre autor={p.autor} />
          <span className="com-meta">
            <time dateTime={p.creada} title={fechaLarga(p.creada)}>
              {hace(p.creada)}
            </time>
            <span>·</span>
            <span>{seccionDe(p.categoria).nombre}</span>
          </span>
        </div>
        <EstadoMejora p={p} />
        {!!p.reportes && <span className="com-reportada">Reportada · {p.reportes}</span>}
        {p.fijada && (
          <span className="com-fijada">
            <Icono de="pin" /> Fijada
          </span>
        )}
      </header>
      <div className="com-post-cuerpo">
        <div className="com-post-textos">
          {p.titulo && <h3>{p.titulo}</h3>}
          {p.texto && <p className={p.titulo ? '' : 'solo'}>{p.texto}</p>}
        </div>
        {portada && (
          <div className={`com-post-portada${portada.tipo === 'video' && portada.vertical ? ' vertical' : ''}`}>
            {imagen ? <img src={imagen} alt="" loading="lazy" /> : <video src={portada.url} muted preload="metadata" />}
            {portada.tipo === 'video' && (
              <span className="com-play">
                <Icono de="video" />
              </span>
            )}
            {p.adjuntos.length > 1 && <span className="com-mas-fotos">+{p.adjuntos.length - 1}</span>}
          </div>
        )}
      </div>
      <footer className="com-post-pie">
        <button className={`com-gusta${p.megusta ? ' on' : ''}`} title={p.megusta ? 'Ya no me gusta' : 'Me gusta'} onClick={(e) => (e.stopPropagation(), onMegusta())}>
          <Icono de="pulgar" /> {p.likes}
        </button>
        <span className="com-cuenta" title="Comentarios">
          <Icono de="hilo" /> {p.comentarios}
        </span>
        {p.comentaron.length > 0 && (
          <span className="com-caras-pie">
            {p.comentaron.map((a) => (
              <Cara key={a.id} autor={a} tam="chica" />
            ))}
          </span>
        )}
        {p.ultimoComentario && (
          <span className={`com-ultimo${nuevoComentario ? ' nuevo' : ''}`} title={fechaLarga(p.ultimoComentario)}>
            {nuevoComentario ? 'Nuevo comentario' : 'Último comentario'} {hace(p.ultimoComentario)}
          </span>
        )}
      </footer>
    </article>
  )
}

/** El texto de una publicación o un comentario, con sus enlaces. */
function Texto({ texto, className }: { texto: string; className: string }) {
  const partes = texto.split(new RegExp(`(${LINK.source})`, 'g'))
  return (
    <p className={className}>
      {partes.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          p
        )
      )}
    </p>
  )
}

/**
 * Una publicación abierta, sobre un velo: entera, con su video y sus imágenes, sus comentarios y donde se comenta. Quien
 * la escribió la edita o la borra; el creador, además, la fija y dice cómo va una mejora.
 */
function Abierta(props: {
  id: string
  previa?: PublicacionComunidad
  yo: Yo
  onCambio(p: PublicacionComunidad): void
  onMegusta(p: PublicacionComunidad): Promise<PublicacionComunidad>
  onComento(): void
  onBorrada(): void
  conNombre(accion: () => void): void
  onCerrar(): void
}) {
  const { yo } = props
  const [p, setP] = useState(props.previa)
  const [comentarios, setComentarios] = useState<ComentarioComunidad[] | null>(null)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(false)
  const [seccion, setSeccion] = useState<CategoriaComunidad>(props.previa?.categoria ?? 'general')
  const [borrando, setBorrando] = useState(false)
  const [ampliada, setAmpliada] = useState<string | null>(null)
  // El comentario de primer nivel al que respondes, y lo que reportas.
  const [respondiendo, setRespondiendo] = useState<string | null>(null)
  const [reportando, setReportando] = useState<{ que: 'publicación' | 'comentario'; id: string } | null>(null)
  const [reportada, setReportada] = useState(false)

  useEffect(() => {
    api<{ publicacion: PublicacionComunidad; comentarios: ComentarioComunidad[] }>(`/api/comunidad/p/${props.id}`).then(
      (r) => {
        setP(r.publicacion)
        setSeccion(r.publicacion.categoria)
        setComentarios(r.comentarios)
        props.onCambio(r.publicacion)
      },
      (e: Error) => setError(e.message)
    )
  }, [props.id])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || borrando || reportando) return
      if (ampliada) setAmpliada(null)
      else if (!editando) props.onCerrar()
    }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })

  const cambiar = (nueva: PublicacionComunidad) => (setP(nueva), props.onCambio(nueva))
  /** Lo que solo hace el creador (fijar, cómo va una mejora). */
  async function delCreador(c: { fijada?: boolean; estado?: 'haciendo' | 'hecha' | null }) {
    if (!p) return
    setError('')
    try {
      cambiar(await api<PublicacionComunidad>(`/api/comunidad/p/${p.id}`, c))
      if (c.fijada !== undefined) dispatchEvent(new Event('sloth-comunidad'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Un comentario, o la respuesta a uno de primer nivel, con sus imágenes. */
  async function comentar(texto: string, adjuntos: AdjuntoComunidad[], responde?: string) {
    if (!p) return
    const c = await api<ComentarioComunidad>(`/api/comunidad/p/${p.id}/comentar`, { texto, adjuntos, ...(responde ? { responde } : {}) })
    setComentarios((l) => [...(l ?? []), c])
    props.onComento()
    const comentaron = [c.autor, ...p.comentaron.filter((a) => a.id !== c.autor.id)].slice(0, 5)
    cambiar({ ...p, comentarios: p.comentarios + 1, ultimoComentario: c.creada, actividad: c.creada, comentaron })
  }

  const suya = !!p && p.autor.id === yo.id
  const video = p?.adjuntos.find((a) => a.tipo === 'video')
  const imagenes = p?.adjuntos.filter((a) => a.tipo === 'imagen') ?? []

  return (
    <div className="com-velo" onMouseDown={(e) => e.target === e.currentTarget && !editando && props.onCerrar()}>
      <div className="com-abierta" role="dialog" aria-modal="true" aria-label={p?.titulo || 'Publicación'}>
        <button className="com-icono com-cerrar" title="Cerrar (Esc)" onClick={props.onCerrar}>
          <Icono de="cerrar" />
        </button>
        {!p && !error && <div className="com-cargando">Cargando…</div>}
        {!p && error && <div className="com-error">{error}</div>}
        {p && (
          <>
            <header className="com-post-cabeza">
              <Cara autor={p.autor} tam="grande" />
              <div className="com-post-quien">
                <Nombre autor={p.autor} />
                <span className="com-meta">
                  <time dateTime={p.creada} title={fechaLarga(p.creada)}>
                    {hace(p.creada)}
                  </time>
                  <span>·</span>
                  <span>{seccionDe(p.categoria).nombre}</span>
                  {p.editada && <span title={fechaLarga(p.editada)}>· editada</span>}
                </span>
              </div>
              <EstadoMejora p={p} />
              {!!p.reportes && <span className="com-reportada">Reportada · {p.reportes}</span>}
              {!editando && (
                <div className="com-acciones">
                  {!suya && !yo.creador && (
                    <button
                      className="com-icono"
                      disabled={reportada}
                      title={reportada ? 'Ya la reportaste' : 'Reportar la publicación'}
                      onClick={() => setReportando({ que: 'publicación', id: p.id })}
                    >
                      <Icono de="bandera" />
                    </button>
                  )}
                  {yo.creador && (
                    <button className={`com-icono${p.fijada ? ' on' : ''}`} title={p.fijada ? 'Desfijar' : 'Fijar arriba, para todos'} onClick={() => void delCreador({ fijada: !p.fijada })}>
                      <Icono de="pin" />
                    </button>
                  )}
                  {(suya || yo.creador) && (
                    <>
                      <button className="com-icono" title="Editar" onClick={() => setEditando(true)}>
                        <Icono de="lapiz" />
                      </button>
                      <button className="com-icono peligro" title="Borrar" onClick={() => setBorrando(true)}>
                        <Icono de="basura" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </header>

            {editando ? (
              <Escribir
                editando
                compacto
                conTitulo
                conVideo
                inicial={p}
                placeholder={seccionDe(seccion).escribe}
                accion="Guardar"
                autoFocus
                extra={<ElegirSeccion valor={seccion} creador={!!yo.creador} onCambio={setSeccion} />}
                onListo={async (e) => {
                  cambiar(await api<PublicacionComunidad>(`/api/comunidad/p/${p.id}`, { ...e, categoria: seccion }))
                  setEditando(false)
                }}
                onCancelar={() => (setEditando(false), setSeccion(p.categoria))}
              />
            ) : (
              <>
                {p.titulo && <h2 className="com-abierta-titulo">{p.titulo}</h2>}
                {p.texto && <Texto texto={p.texto} className="com-abierta-texto" />}
                {video && (
                  <video className={`com-video${video.vertical ? ' vertical' : ''}`} src={video.url} poster={video.posterUrl} controls loop playsInline preload="metadata" />
                )}
                {imagenes.length > 0 && (
                  <div className={`com-fotos n${Math.min(imagenes.length, 3)}`}>
                    {imagenes.map((a) => (
                      <button key={a.llave} title="Ampliar" onClick={() => setAmpliada(a.url)}>
                        <img src={a.url} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Del creador, en Mejoras: cómo va. */}
            {yo.creador && (p.categoria === 'mejoras' || !!p.reportes) && !editando && (
              <div className="com-creador-barra">
                {!!p.reportes && (
                  <button
                    className="com-boton ok"
                    title="La revisaste y se queda: se le quitan los reportes y todos la vuelven a ver"
                    onClick={() => void api(`/api/comunidad/p/${p.id}/revisada`, {}).then(() => cambiar({ ...p, reportes: undefined }), (e: Error) => setError(e.message))}
                  >
                    <Icono de="palomita" /> Está bien, se queda
                  </button>
                )}
                {p.categoria === 'mejoras' && !p.estado && (
                  <button className="com-boton" title="Todos ven que ya se está haciendo" onClick={() => void delCreador({ estado: 'haciendo' })}>
                    Se está haciendo
                  </button>
                )}
                {p.categoria === 'mejoras' &&
                  (p.estado !== 'hecha' ? (
                    <button className="com-boton ok" onClick={() => void delCreador({ estado: 'hecha' })}>
                      <Icono de="palomita" /> Marcar hecha
                    </button>
                  ) : (
                    <button className="com-boton" title="Vuelve a ser una idea" onClick={() => void delCreador({ estado: null })}>
                      <Icono de="reabrir" /> Reabrir
                    </button>
                  ))}
              </div>
            )}

            {error && p && <div className="com-error">{error}</div>}

            <div className="com-abierta-pie">
              <button className={`com-gusta grande${p.megusta ? ' on' : ''}`} onClick={() => props.conNombre(() => void props.onMegusta(p).then(setP))}>
                <Icono de="pulgar" /> {p.likes ? `${p.likes} me gusta` : 'Me gusta'}
              </button>
              <span className="com-cuenta">
                <Icono de="hilo" /> {p.comentarios} {p.comentarios === 1 ? 'comentario' : 'comentarios'}
              </span>
            </div>

            <div className="com-comentarios">
              {comentarios === null && !error && <div className="com-cargando chico">Cargando comentarios…</div>}
              {comentarios
                ?.filter((c) => !c.responde)
                .map((c) => {
                  const respuestas = comentarios.filter((r) => r.responde === c.id)
                  const fila = (x: ComentarioComunidad) => (
                    <Comentario
                      key={x.id}
                      c={x}
                      yo={yo}
                      conNombre={props.conNombre}
                      onResponder={() => setRespondiendo(c.id)}
                      onAmpliar={setAmpliada}
                      onCambio={(nuevo) => setComentarios((l) => l?.map((y) => (y.id === nuevo.id ? nuevo : y)) ?? l)}
                      onBorrar={async () => {
                        await api(`/api/comunidad/c/${x.id}/borrar`, {})
                        // Uno de primer nivel se lleva sus respuestas.
                        const idos = new Set([x.id, ...(x.responde ? [] : respuestas.map((r) => r.id))])
                        setComentarios((l) => l?.filter((y) => !idos.has(y.id)) ?? l)
                        cambiar({ ...p, comentarios: Math.max(0, p.comentarios - idos.size) })
                      }}
                      onReportar={() => setReportando({ que: 'comentario', id: x.id })}
                    />
                  )
                  return (
                    <div key={c.id} className="com-conversacion">
                      {fila(c)}
                      {(respuestas.length > 0 || respondiendo === c.id) && (
                        <div className="com-respuestas">
                          {respuestas.map(fila)}
                          {respondiendo === c.id && (
                            <Comentar
                              yo={yo}
                              placeholder={`Responde a ${c.autor.nombre || 'este comentario'}`}
                              autoFocus
                              conNombre={props.conNombre}
                              onListo={(texto, adjuntos) => comentar(texto, adjuntos, c.id)}
                              onCancelar={() => setRespondiendo(null)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              <Comentar yo={yo} placeholder="Escribe un comentario" conNombre={props.conNombre} onListo={(texto, adjuntos) => comentar(texto, adjuntos)} />
            </div>
          </>
        )}
      </div>

      {ampliada && (
        <div className="lightbox" onClick={() => setAmpliada(null)}>
          <img src={ampliada} alt="" />
        </div>
      )}
      {reportando && p && (
        <Reportar
          que={reportando.que}
          onListo={async (motivo) => {
            await api(`/api/comunidad/${reportando.que === 'publicación' ? 'p' : 'c'}/${reportando.id}/reportar`, { motivo })
            if (reportando.que === 'publicación') setReportada(true)
          }}
          onCerrar={() => setReportando(null)}
        />
      )}
      {borrando && p && (
        <Confirm
          title="¿Borrar esta publicación?"
          action="Borrar"
          danger
          onConfirm={async () => {
            await api(`/api/comunidad/p/${p.id}/borrar`, {})
            props.onBorrada()
          }}
          onClose={() => setBorrando(false)}
        >
          <p className="com-confirmar">«{(p.titulo || p.texto || 'Una imagen').slice(0, 140)}»</p>
          <p className="muted small">Se borran también sus comentarios, sus imágenes y su video. {suya ? '' : 'No es tuya: la escribió ' + (p.autor.nombre || 'alguien') + '.'}</p>
        </Confirm>
      )}
    </div>
  )
}

/**
 * Un comentario o una respuesta: quién y cuándo, el texto y sus imágenes en su globo y abajo me gusta y «Responder». Quien
 * lo escribió (o el creador) lo borra; los demás lo reportan. El creador ve cuántos lo reportaron y, si se queda, «Está
 * bien».
 */
function Comentario(props: {
  c: ComentarioComunidad
  yo: Yo
  conNombre(accion: () => void): void
  onResponder(): void
  onAmpliar(url: string): void
  onCambio(c: ComentarioComunidad): void
  onBorrar(): Promise<void>
  onReportar(): void
}) {
  const { c, yo } = props
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState('')
  const suyo = c.autor.id === yo.id

  async function megusta() {
    const antes = c
    props.onCambio({ ...c, megusta: !c.megusta, likes: c.likes + (c.megusta ? -1 : 1) })
    try {
      props.onCambio({ ...c, ...(await api<{ likes: number; megusta: boolean }>(`/api/comunidad/c/${c.id}/megusta`, {})) })
    } catch (e) {
      props.onCambio(antes)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className={`com-comentario${c.responde ? ' respuesta' : ''}`}>
      <Cara autor={c.autor} />
      <div className="com-comentario-columna">
        <div className="com-comentario-cuerpo">
          <div className="com-comentario-cabeza">
            <Nombre autor={c.autor} />
            <time dateTime={c.creada} title={fechaLarga(c.creada)}>
              {hace(c.creada)}
            </time>
            {!!c.reportes && <span className="com-reportada">Reportado · {c.reportes}</span>}
            <span className="com-comentario-iconos">
              {!suyo && !yo.creador && (
                <button className="com-icono" title="Reportar el comentario" onClick={props.onReportar}>
                  <Icono de="bandera" />
                </button>
              )}
              {(suyo || yo.creador) && (
                <button className="com-icono peligro" title="Borrar el comentario" onClick={() => setBorrando(true)}>
                  <Icono de="basura" />
                </button>
              )}
            </span>
          </div>
          {c.texto && <Texto texto={c.texto} className="com-comentario-texto" />}
          {!!c.adjuntos?.length && (
            <div className={`com-comentario-fotos n${c.adjuntos.length}`}>
              {c.adjuntos.map((a) => (
                <button key={a.llave} title="Ampliar" onClick={() => props.onAmpliar(a.url)}>
                  <img src={a.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="com-comentario-pie">
          <button className={`com-gusta chico${c.megusta ? ' on' : ''}`} title={c.megusta ? 'Ya no me gusta' : 'Me gusta'} onClick={() => props.conNombre(() => void megusta())}>
            <Icono de="pulgar" /> {c.likes || ''}
          </button>
          <button className="com-responder" onClick={() => props.conNombre(props.onResponder)}>
            <Icono de="responder" /> Responder
          </button>
          {!!c.reportes && (
            <button
              className="com-responder"
              title="Lo revisaste y se queda: se le quitan los reportes"
              onClick={() => void api(`/api/comunidad/c/${c.id}/revisada`, {}).then(() => props.onCambio({ ...c, reportes: undefined }), (e: Error) => setError(e.message))}
            >
              <Icono de="palomita" /> Está bien
            </button>
          )}
          {error && <span className="com-comentar-error">{error}</span>}
        </div>
      </div>
      {borrando && (
        <Confirm title="¿Borrar este comentario?" action="Borrar" danger onConfirm={props.onBorrar} onClose={() => setBorrando(false)}>
          <p className="com-confirmar">{c.texto ? `«${c.texto.slice(0, 140)}${c.texto.length > 140 ? '…' : ''}»` : c.adjuntos?.length === 1 ? 'Una imagen' : 'Unas imágenes'}</p>
          {!c.responde && <p className="muted small">Se borran también sus respuestas.</p>}
        </Confirm>
      )}
    </div>
  )
}

/** Las imágenes que lleva un comentario, como en el Worker (`FOTOS_COMENTARIO`). */
const FOTOS_COMENTARIO = 4

/**
 * Donde se comenta o se responde: crece con el texto; Enter lo manda y Escape cancela una respuesta. Las imágenes se
 * pegan, se sueltan encima o se eligen con su botón, como en el chat, y suben en cuanto llegan.
 */
function Comentar(props: {
  yo: Yo
  placeholder: string
  autoFocus?: boolean
  conNombre(accion: () => void): void
  onListo(texto: string, adjuntos: AdjuntoComunidad[]): Promise<void>
  onCancelar?(): void
}) {
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<AdjuntoComunidad[]>([])
  const [subiendo, setSubiendo] = useState(0)
  const [encima, setEncima] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const elegir = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [texto])
  useEffect(() => {
    if (props.autoFocus) ref.current?.focus()
  }, [])

  async function subir(archivos: File[]) {
    const imagenes = archivos.filter((f) => f.type.startsWith('image/'))
    if (!imagenes.length) return setError(archivos.length ? 'En un comentario solo van imágenes.' : '')
    const caben = FOTOS_COMENTARIO - fotos.length - subiendo
    setError(imagenes.length > caben ? `Un comentario lleva hasta ${FOTOS_COMENTARIO} imágenes.` : '')
    const van = imagenes.slice(0, Math.max(0, caben))
    setSubiendo((n) => n + van.length)
    await Promise.all(
      van.map((f) =>
        subirImagen(f)
          .then((a) => setFotos((l) => [...l, a]))
          .catch((e: Error) => setError(e.message))
          .finally(() => setSubiendo((n) => n - 1))
      )
    )
  }

  const vacio = !texto.trim() && !fotos.length
  const mandar = () =>
    props.conNombre(async () => {
      if (vacio || subiendo || ocupado) return
      setOcupado(true)
      setError('')
      try {
        await props.onListo(texto.trim(), fotos)
        setTexto('')
        setFotos([])
        props.onCancelar?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setOcupado(false)
      }
    })

  return (
    <div className="com-comentar">
      <Cara autor={props.yo} />
      <div
        className={`com-comentar-caja${encima ? ' soltando' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.stopPropagation()
          setEncima(true)
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setEncima(false)}
        onDrop={(e) => {
          setEncima(false)
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          e.stopPropagation()
          void subir([...e.dataTransfer.files])
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={texto}
          placeholder={props.placeholder}
          maxLength={5000}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) (e.preventDefault(), mandar())
            if (e.key === 'Escape' && props.onCancelar) (e.stopPropagation(), props.onCancelar())
          }}
          onPaste={(e) => {
            const archivos = [...e.clipboardData.files]
            if (!archivos.some((f) => f.type.startsWith('image/'))) return
            e.preventDefault()
            void subir(archivos)
          }}
        />
        <button
          className="com-adjuntar"
          title={`Agregar imágenes (también puedes pegarlas o soltarlas), hasta ${FOTOS_COMENTARIO}`}
          disabled={fotos.length + subiendo >= FOTOS_COMENTARIO}
          onClick={() => elegir.current?.click()}
        >
          <Icono de="imagen" />
        </button>
        <input
          ref={elegir}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void subir([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <button className="com-enviar" disabled={vacio || subiendo > 0 || ocupado} title={subiendo ? 'Espera a que termine de subir' : 'Comentar (Enter)'} onClick={mandar}>
          <Icono de="flechaArriba" />
        </button>
      </div>
      {(fotos.length > 0 || subiendo > 0) && (
        <div className="esc-fotos com-comentar-fotos">
          {fotos.map((a) => (
            <div key={a.llave} className="esc-miniatura">
              <img src={a.url} alt="" />
              <button title="Quitar" onClick={() => setFotos((l) => l.filter((x) => x !== a))}>
                ×
              </button>
            </div>
          ))}
          {Array.from({ length: subiendo }, (_, i) => (
            <div key={`subiendo-${i}`} className="esc-miniatura subiendo" title="Subiendo…" />
          ))}
        </div>
      )}
      {error && <div className="com-comentar-error">{error}</div>}
    </div>
  )
}

const MOTIVOS = ['Es spam o publicidad', 'Es ofensivo o agresivo', 'No tiene que ver con Sloth', 'Otro']

/** Reportar una publicación o un comentario: por qué, y le llega al creador. Con 3 reportes deja de verse hasta que lo revise. */
function Reportar({ que, onListo, onCerrar }: { que: 'publicación' | 'comentario'; onListo(motivo: string): Promise<void>; onCerrar(): void }) {
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopImmediatePropagation(), onCerrar())
    addEventListener('keydown', tecla, true)
    return () => removeEventListener('keydown', tecla, true)
  })
  const falta = !motivo || (motivo === 'Otro' && !detalle.trim())

  async function mandar() {
    if (falta || ocupado) return
    setOcupado(true)
    setError('')
    try {
      await onListo(motivo === 'Otro' ? detalle.trim() : `${motivo}${detalle.trim() ? `: ${detalle.trim()}` : ''}`)
      setListo(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="com-velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="com-caja" role="dialog" aria-modal="true" aria-labelledby="com-reportar-titulo">
        {listo ? (
          <>
            <h2 id="com-reportar-titulo">Gracias</h2>
            <p>El creador de Sloth lo va a revisar. Si más personas lo reportan, deja de verse mientras tanto.</p>
            <div className="com-caja-pie">
              <button className="esc-listo" autoFocus onClick={onCerrar}>
                Listo
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="com-reportar-titulo">Reportar {que === 'publicación' ? 'esta publicación' : 'este comentario'}</h2>
            <p>¿Qué tiene? Solo lo ve el creador de Sloth.</p>
            <div className="com-motivos" role="radiogroup">
              {MOTIVOS.map((m) => (
                <button key={m} role="radio" aria-checked={motivo === m} className={motivo === m ? 'on' : ''} onClick={() => setMotivo(m)}>
                  <span className="com-motivo-marca" />
                  {m}
                </button>
              ))}
            </div>
            <textarea
              className="com-perfil-nombre com-detalle"
              rows={2}
              maxLength={250}
              value={detalle}
              placeholder={motivo === 'Otro' ? 'Cuéntanos qué pasa' : 'Algo más (si quieres)'}
              onChange={(e) => setDetalle(e.target.value)}
            />
            {error && <p className="bad small">{error}</p>}
            <div className="com-caja-pie">
              <button className="esc-cancelar" onClick={onCerrar}>
                Cancelar
              </button>
              <button className="esc-listo" disabled={falta || ocupado} onClick={() => void mandar()}>
                Reportar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** La campana: tus avisos, del más nuevo al más viejo. Al abrirla se marcan leídos; tocar uno abre su publicación. */
function Avisos({ sinLeer, onAbrir, onLeidos }: { sinLeer: number; onAbrir(id: string): void; onLeidos(): void }) {
  const [abierta, setAbierta] = useState(false)
  const [lista, setLista] = useState<AvisoComunidad[] | null>(null)
  const [error, setError] = useState('')
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierta) return
    let vivo = true
    api<{ avisos: AvisoComunidad[]; sinLeer: number }>('/api/comunidad/avisos').then(
      (r) => {
        if (!vivo) return
        setLista(r.avisos)
        if (r.sinLeer) void api('/api/comunidad/avisos/leidos', {}).then(() => (onLeidos(), dispatchEvent(new Event('sloth-comunidad-avisos'))), () => {})
      },
      (e: Error) => vivo && setError(e.message)
    )
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierta(false)
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false)
    addEventListener('mousedown', fuera)
    addEventListener('keydown', tecla)
    return () => {
      vivo = false
      removeEventListener('mousedown', fuera)
      removeEventListener('keydown', tecla)
    }
  }, [abierta])

  return (
    <div className="com-avisos" ref={caja}>
      <button className={`com-campana${abierta ? ' on' : ''}`} title="Avisos" onClick={() => setAbierta(!abierta)}>
        <Icono de="campana" />
        {sinLeer > 0 && <span className="com-campana-cuenta">{sinLeer > 99 ? '99+' : sinLeer}</span>}
      </button>
      {abierta && (
        <div className="com-avisos-panel" role="dialog" aria-label="Avisos">
          <div className="com-avisos-titulo">Avisos</div>
          {error && <p className="com-avisos-nada">{error}</p>}
          {lista === null && !error && <p className="com-avisos-nada">Cargando…</p>}
          {lista?.length === 0 && <p className="com-avisos-nada">Aún no tienes avisos. Te avisamos aquí cuando alguien comente, responda o le guste lo tuyo.</p>}
          {!!lista?.length && (
            <div className="com-avisos-lista">
              {lista.map((a) => (
                <button key={a.id} className={a.leido ? '' : 'nuevo'} onClick={() => (setAbierta(false), onAbrir(a.publicacion))}>
                  <Cara autor={a.de} />
                  <span className="com-aviso-texto">
                    <span>{fraseDe(a)}</span>
                    <time dateTime={a.creado} title={fechaLarga(a.creado)}>
                      {hace(a.creado)}
                    </time>
                  </span>
                  {!a.leido && <span className="com-aviso-punto" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Lo que dice cada aviso. */
function fraseDe(a: AvisoComunidad) {
  const quien = <strong>{a.de.nombre || 'Alguien'}</strong>
  const sobre = <em>«{a.sobre}»</em>
  if (a.tipo === 'comento') return <>{quien} comentó en {sobre}</>
  if (a.tipo === 'respondio') return <>{quien} respondió a tu comentario en {sobre}</>
  if (a.tipo === 'gusta') return <>A {quien} le gustó {sobre}</>
  if (a.tipo === 'gustaComentario') return <>A {quien} le gustó tu comentario en {sobre}</>
  if (a.tipo === 'estado') return a.texto === 'hecha' ? <>{quien} marcó hecha tu mejora {sobre}</> : <>{quien} está haciendo tu mejora {sobre}</>
  if (a.tipo === 'reporte') return <>{quien} reportó {a.comentario ? 'un comentario en ' : ''}{sobre}: {a.texto}</>
  return <>{quien} publicó un anuncio: {sobre}</>
}

/** Tu nombre y tu foto: así te ven en la comunidad. */
/** Qué sigue en el roadmap de sloth.vancci.org: un voto por persona, que se puede cambiar; el de un Fundador vale dos. */
function Votar({ roadmap, fundador, onVoto }: { roadmap: RoadmapComunidad; fundador: boolean; onVoto(r: RoadmapComunidad): void }) {
  const [enviando, setEnviando] = useState('')
  const [error, setError] = useState('')
  const mas = Math.max(1, ...roadmap.metas.map((m) => m.votos))

  async function votar(meta: string) {
    if (enviando || meta === roadmap.mio) return
    setEnviando(meta)
    setError('')
    try {
      onVoto(await api<RoadmapComunidad>('/api/comunidad/roadmap', { meta }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando('')
    }
  }

  return (
    <div className="com-votar">
      <h3>Vota qué sigue</h3>
      <p>{fundador ? 'Eres Fundador: tu voto vale dos.' : 'Un voto por persona; el de un Fundador vale dos.'} Puedes cambiarlo cuando quieras.</p>
      <ul>
        {roadmap.metas.map((m) => (
          <li key={m.id}>
            <button className={m.id === roadmap.mio ? 'on' : ''} disabled={!!enviando} aria-pressed={m.id === roadmap.mio} onClick={() => void votar(m.id)}>
              <span className="com-votar-fila">
                <span>{m.titulo}</span>
                <b>{m.votos}</b>
              </span>
              <span className="com-votar-barra" style={{ '--parte': `${(m.votos / mas) * 100}%` } as CSSProperties} />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="bad small">{error}</p>}
    </div>
  )
}

function Perfil({ yo, onListo, onCerrar }: { yo: Yo; onListo(a: Autor): void; onCerrar(): void }) {
  const [nombre, setNombre] = useState(yo.nombre)
  const [creditos, setCreditos] = useState(!!yo.creditos)
  // `undefined`: la foto que ya tenías; `null`: sin foto; o la nueva.
  const [foto, setFoto] = useState<{ llave: string; url: string } | null | undefined>(undefined)
  const [subiendo, setSubiendo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const elegir = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })

  async function subir(f?: File) {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Tu foto debe ser una imagen.')
    setSubiendo(true)
    setError('')
    try {
      const r = await fetch(`/api/comunidad/archivo?tipo=${encodeURIComponent(f.type)}`, { method: 'POST', body: f })
      const j = (await r.json().catch(() => ({}))) as { llave?: string; url?: string; error?: string }
      if (!r.ok || !j.llave || !j.url) throw new Error(j.error ?? 'No se pudo subir tu foto.')
      setFoto({ llave: j.llave, url: j.url })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubiendo(false)
    }
  }

  async function guardar() {
    if (!nombre.trim() || subiendo || ocupado) return
    setOcupado(true)
    setError('')
    try {
      onListo(
        await api<Autor>('/api/comunidad/perfil', {
          nombre: nombre.trim(),
          ...(foto !== undefined ? { foto: foto?.llave ?? null } : {}),
          ...(yo.insignia === 'fundador' ? { creditos } : {})
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  const vista: Autor = { ...yo, nombre: nombre || yo.nombre, foto: foto === undefined ? yo.foto : foto?.url }
  return (
    <div className="com-velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="com-caja" role="dialog" aria-modal="true" aria-labelledby="com-perfil-titulo">
        <h2 id="com-perfil-titulo">{yo.nombre ? 'Tu perfil' : '¿Cómo te llamas?'}</h2>
        <p>Así te ven en la comunidad: tu nombre y, si quieres, tu foto.</p>
        <div className="com-perfil-foto">
          <button className={subiendo ? 'subiendo' : ''} title="Elegir una foto" onClick={() => elegir.current?.click()}>
            <Cara autor={vista} tam="grande" />
          </button>
          <div>
            <button className="com-boton" disabled={subiendo} onClick={() => elegir.current?.click()}>
              <Icono de="imagen" /> {subiendo ? 'Subiendo…' : vista.foto ? 'Cambiar la foto' : 'Poner una foto'}
            </button>
            {vista.foto && (
              <button className="com-boton" onClick={() => setFoto(null)}>
                Quitarla
              </button>
            )}
          </div>
          <input ref={elegir} type="file" accept="image/*" hidden onChange={(e) => (void subir(e.target.files?.[0]), (e.target.value = ''))} />
        </div>
        <input
          className="com-perfil-nombre"
          value={nombre}
          maxLength={40}
          placeholder="Tu nombre"
          autoFocus
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void guardar()}
        />
        {yo.insignia === 'fundador' && (
          <label className="com-creditos">
            <input type="checkbox" checked={creditos} onChange={(e) => setCreditos(e.target.checked)} />
            <span>Salir con este nombre en los créditos de los Fundadores, en sloth.vancci.org</span>
          </label>
        )}
        {error && <p className="bad small">{error}</p>}
        <div className="com-caja-pie">
          <button className="esc-cancelar" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="esc-listo" disabled={!nombre.trim() || subiendo || ocupado} onClick={() => void guardar()}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
