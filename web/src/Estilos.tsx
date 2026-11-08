import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AdjuntoComunidad, Card, FeedComunidad, PublicacionComunidad, VideoHecho } from '../../shared/types'
import { api, ErrorApi } from './api'
import { abrirPublicacion } from './Comunidad'
import { Icono } from './Iconos'
import './Estilos.css'

/**
 * Compartir tus estilos y usar los de otros (`server/estilos.ts`). «Compartir» de un estilo tuyo (en su card, junto a su
 * nombre al elegirlo, o en la sección Estilos de la comunidad) lo publica ahí mismo, en un solo paso, donde nadie más lo
 * ve hasta que el creador lo aprueba; o lo guarda como archivo `.sloth-estilo` en Descargas. «Importar», arriba de los
 * estilos, instala uno de esos archivos. Tras instalar, si video-base cambió desde la Sloth donde se hizo, se ofrece
 * adaptarlo con «Nuevo estilo» (`abrirBorrador`).
 */

/** Lo que devuelve instalar un estilo (`Instalado` en `server/estilos.ts`). */
export interface Instalado {
  id: string
  titulo: string
  actualizado: boolean
  adaptar: string[]
  sloth: string
}

/** Abre un borrador de esa card con el texto ya escrito, para revisarlo antes de mandarlo (lo atiende `App`). */
export function abrirBorrador(cardId: string, texto: string) {
  dispatchEvent(new CustomEvent('sloth-borrador', { detail: { cardId, texto } }))
}

/** Lo que se le pide a «Nuevo estilo» para que un estilo instalado use lo de esta versión de video-base. */
const adaptar = (r: Instalado) =>
  [
    `Adapta mi estilo «${r.titulo}» (la skill ${r.id}) a esta versión de Sloth. Se hizo con Sloth ${r.sloth} y desde entonces cambiaron en video-base: ${r.adaptar.join(', ')}.`,
    'Sigue «Adaptar un estilo instalado» de tu skill.'
  ].join('\n\n')

function Modal(props: { titulo: string; children: ReactNode; acciones: ReactNode; ancho?: boolean; onCerrar(): void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && props.onCerrar()
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })
  return createPortal(
    <div className="modal-backdrop" onClick={props.onCerrar}>
      <div className={`modal${props.ancho ? ' modal-ancho' : ''}`} role="dialog" aria-modal aria-label={props.titulo} onClick={(e) => e.stopPropagation()}>
        <h2>{props.titulo}</h2>
        <div className="modal-body">{props.children}</div>
        <div className="modal-actions">{props.acciones}</div>
      </div>
    </div>,
    document.body
  )
}

/** Un estilo ya instalado: listo para usarse y, si conviene, adaptarlo a esta versión. */
export function TrasInstalar({ r, onCerrar }: { r: Instalado; onCerrar(): void }) {
  return (
    <Modal
      titulo={r.actualizado ? `«${r.titulo}» está al día` : `«${r.titulo}» ya está en tus estilos`}
      onCerrar={onCerrar}
      acciones={
        r.adaptar.length ? (
          <>
            <button className="ghost" onClick={onCerrar}>
              Así está bien
            </button>
            <button className="primary" autoFocus onClick={() => (abrirBorrador('nuevo-estilo', adaptar(r)), onCerrar())}>
              Adaptar a tu versión
            </button>
          </>
        ) : (
          <button className="primary" autoFocus onClick={() => (location.hash = `/new/${r.id}`, onCerrar())}>
            Usarlo
          </button>
        )
      }
    >
      {r.adaptar.length ? (
        <p>
          Se hizo con Sloth {r.sloth} y desde entonces cambió lo que usa de video-base ({r.adaptar.join(', ')}). Puede funcionar igual, pero lo mejor es que
          «Nuevo estilo» lo adapte a tu versión antes del primer video.
        </p>
      ) : (
        <p>Su card ya sale entre tus estilos. Lo de antes, si ya lo tenías, se guardó en una copia.</p>
      )}
    </Modal>
  )
}

/** Cómo va el paquete del estilo: se arma y se sube al abrir «Compartir», para saber antes de publicar si se puede. */
type Paquete = { listo: AdjuntoComunidad } | { error: string; arreglable: boolean } | { sinCuenta: true } | null

/**
 * «Compartir» de un estilo tuyo, en una sola pantalla y sin salir de donde estás (como «Publish to Community» de Figma):
 * ya trae su título, lo que hace y su último video; tú solo revisas y publicas. Al abrir se empaqueta y se sube, así lo
 * que impide compartirlo sale antes de escribir nada, con un botón para que «Nuevo estilo» lo arregle. Si aún no te
 * pusiste nombre en la comunidad, se pide aquí. Al terminar dice que está en revisión y que te llega un aviso cuando el
 * creador lo apruebe. Abajo, guardarlo como archivo para pasarlo a mano.
 */
export function CompartirEstilo({ card, onCerrar }: { card: Card; onCerrar(): void }) {
  const [paquete, setPaquete] = useState<Paquete>(null)
  const [intento, setIntento] = useState(0)
  // Tu nombre en la comunidad: `undefined` mientras se pregunta; sin cuenta, `null`.
  const [nombreActual, setNombreActual] = useState<string | null>()
  const [nombre, setNombre] = useState('')
  const [titulo, setTitulo] = useState(card.title)
  const [texto, setTexto] = useState(card.description ?? '')
  const [videos, setVideos] = useState<VideoHecho[] | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)
  const [error, setError] = useState('')
  const [hecha, setHecha] = useState<PublicacionComunidad | null>(null)
  const [archivo, setArchivo] = useState<{ ruta?: string; guardando?: boolean; error?: string }>({})

  useEffect(() => {
    setPaquete(null)
    api<AdjuntoComunidad>('/api/comunidad/estilo', { cardId: card.id }).then(
      (a) => setPaquete({ listo: a }),
      (e: unknown) =>
        setPaquete(e instanceof ErrorApi && e.status === 401 ? { sinCuenta: true } : { error: e instanceof Error ? e.message : String(e), arreglable: e instanceof ErrorApi && e.status === 400 })
    )
  }, [card.id, intento])
  useEffect(() => {
    api<FeedComunidad>('/api/comunidad?categoria=estilos').then(
      (f) => setNombreActual(f.yo.nombre),
      () => setNombreActual(null)
    )
    // Sus videos, del más nuevo al más viejo: el primero ya va elegido.
    api<VideoHecho[]>(`/api/cards/${card.id}/videos`).then(
      (l) => (setVideos(l.slice(0, 4)), setVideo(l[0]?.ruta ?? null)),
      () => setVideos([])
    )
  }, [card.id])

  const sinCuenta = !!paquete && 'sinCuenta' in paquete
  const falta = !titulo.trim() ? 'Ponle un título.' : nombreActual === '' && !nombre.trim() ? 'Escribe tu nombre: así te ven los demás.' : ''
  const puede = !!paquete && 'listo' in paquete && !falta && !publicando && nombreActual !== undefined

  async function publicar() {
    if (!paquete || !('listo' in paquete) || !puede) return
    setPublicando(true)
    setError('')
    try {
      if (nombreActual === '') {
        await api('/api/comunidad/perfil', { nombre: nombre.trim() })
        setNombreActual(nombre.trim())
      }
      // El video sube al publicar: solo sus primeros segundos, como en «Lo que hice».
      const adjuntos = [paquete.listo, ...(video ? [await api<AdjuntoComunidad>('/api/comunidad/video', { ruta: video })] : [])]
      const p = await api<PublicacionComunidad>('/api/comunidad/publicar', { categoria: 'estilos', titulo: titulo.trim(), texto: texto.trim(), adjuntos })
      dispatchEvent(new Event('sloth-comunidad'))
      setHecha(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPublicando(false)
    }
  }

  async function guardarArchivo() {
    setArchivo({ guardando: true })
    try {
      setArchivo({ ruta: (await api<{ ruta: string }>(`/api/estilos/${card.id}/archivo`, {})).ruta })
    } catch (e) {
      setArchivo({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  if (hecha)
    return (
      <Modal
        titulo={hecha.porAprobar ? 'Listo: tu estilo está en revisión' : 'Listo: tu estilo ya está en la comunidad'}
        onCerrar={onCerrar}
        acciones={
          <>
            <button className="ghost" onClick={() => (abrirPublicacion(hecha.id), onCerrar())}>
              Ver la publicación
            </button>
            <button className="primary" autoFocus onClick={onCerrar}>
              Listo
            </button>
          </>
        }
      >
        {hecha.porAprobar ? (
          <ol className="compartir-pasos">
            <li className="hecho">
              <Icono de="palomita" className="icon-trazo" /> Publicaste «{hecha.titulo}». Por ahora solo lo ven tú y el creador de Sloth.
            </li>
            <li>
              <Icono de="campana" className="icon-trazo" /> Cuando lo apruebe, te llega un aviso a la campana de Comunidad y todos lo pueden instalar. No hace falta que lo vuelvas a mandar.
            </li>
          </ol>
        ) : (
          <p>Ya todos lo ven en Estilos y lo pueden instalar con un clic.</p>
        )}
      </Modal>
    )

  return (
    <Modal
      titulo={`Compartir «${card.title}»`}
      ancho
      onCerrar={onCerrar}
      acciones={
        <>
          {archivo.ruta ? (
            <button className="ghost compartir-archivo" onClick={() => void api('/api/open', { path: archivo.ruta })} title={archivo.ruta}>
              Guardado en Descargas · Ver
            </button>
          ) : (
            <button className="ghost compartir-archivo" disabled={archivo.guardando} title="Un archivo .sloth-estilo, para pasarlo a mano: se instala con «Importar»" onClick={() => void guardarArchivo()}>
              {archivo.guardando ? 'Guardando…' : 'O guárdalo como archivo'}
            </button>
          )}
          {sinCuenta ? (
            <button className="primary" autoFocus onClick={() => ((location.hash = '/comunidad'), onCerrar())}>
              Crear mi cuenta gratis
            </button>
          ) : (
            <button className="primary" disabled={!puede} title={falta || undefined} onClick={() => void publicar()}>
              {publicando ? 'Publicando…' : !paquete ? 'Preparando…' : 'Publicar en la comunidad'}
            </button>
          )}
        </>
      }
    >
      <div className={`compartir-paquete${paquete && 'error' in paquete ? ' mal' : paquete && 'listo' in paquete ? ' bien' : ''}`}>
        {!paquete ? (
          <>
            <span className="spinner" /> Revisando que tu estilo se pueda compartir…
          </>
        ) : 'listo' in paquete ? (
          <>
            <Icono de="palomita" className="icon-trazo" /> Se puede compartir. Viajan su skill y su card; tus huellas, tu banco y tus poses se quedan aquí.
          </>
        ) : 'sinCuenta' in paquete ? (
          <>Para publicar en la comunidad necesitas tu cuenta gratis de Sloth. Se hace en un minuto, con tu correo.</>
        ) : (
          <div>
            <strong>Aún no se puede compartir.</strong> {paquete.error}
            <div className="compartir-arreglar">
              {paquete.arreglable ? (
                <button className="primary" onClick={() => (abrirBorrador('nuevo-estilo', arreglar(card, paquete.error)), onCerrar())}>
                  Que «Nuevo estilo» lo arregle
                </button>
              ) : (
                <button className="primary" onClick={() => setIntento((n) => n + 1)}>
                  Intentar otra vez
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!sinCuenta && (
        <div className="compartir-campos">
          {nombreActual === '' && (
            <label>
              <span>Tu nombre en la comunidad</span>
              <input value={nombre} maxLength={40} placeholder="Así te ven los demás" autoFocus onChange={(e) => setNombre(e.target.value)} />
            </label>
          )}
          <label>
            <span>Título</span>
            <input value={titulo} maxLength={140} onChange={(e) => setTitulo(e.target.value)} />
          </label>
          <label>
            <span>Qué hace y qué te pide cada vez</span>
            <textarea value={texto} rows={3} maxLength={2000} placeholder="Por ejemplo: videos de datos curiosos con imágenes de Flow; solo le das el tema." onChange={(e) => setTexto(e.target.value)} />
          </label>
          <div className="compartir-video">
            <span>Un video hecho con él</span>
            {videos === null ? (
              <p className="small">Buscando tus videos…</p>
            ) : videos.length ? (
              <div className="compartir-videos">
                {videos.map((v) => (
                  <button key={v.ruta} className={video === v.ruta ? 'on' : ''} title={v.titulo} onClick={() => setVideo(v.ruta)}>
                    <img src={`${v.src}&cuadro`} alt="" />
                    {video === v.ruta && <Icono de="palomita" className="icon-trazo" />}
                  </button>
                ))}
                <button className={`sin${video === null ? ' on' : ''}`} onClick={() => setVideo(null)}>
                  Sin video
                </button>
              </div>
            ) : (
              <p className="small">Aún no terminas un video con este estilo. Puedes publicarlo igual; con un video, más gente lo instala.</p>
            )}
          </div>
        </div>
      )}
      {(error || archivo.error) && <p className="bad compartir-error">{error || archivo.error}</p>}
    </Modal>
  )
}

/** Lo que se le pide a «Nuevo estilo» cuando un estilo no se puede compartir. */
const arreglar = (card: Card, error: string) =>
  [
    `Mi estilo «${card.title}» (la skill ${card.skill ?? card.id}) no se puede compartir en la comunidad. Sloth dice: ${error}`,
    'Arréglalo para que se pueda compartir sin cambiar lo que hace. Sigue «Compartir un estilo» de tu skill.'
  ].join('\n\n')

/**
 * «Compartir un estilo tuyo» de la sección Estilos de la comunidad: con uno, lo abre; con varios, primero eliges cuál; sin
 * ninguno, lleva a «Nuevo estilo».
 */
export function CompartirTuyo({ onCerrar }: { onCerrar(): void }) {
  const [tuyos, setTuyos] = useState<Card[] | null>(null)
  const [elegido, setElegido] = useState<Card | null>(null)
  useEffect(() => {
    api<Card[]>('/api/estilos').then(
      (l) => (setTuyos(l), l.length === 1 && setElegido(l[0])),
      () => setTuyos([])
    )
  }, [])
  if (elegido) return <CompartirEstilo card={elegido} onCerrar={onCerrar} />
  if (!tuyos) return null
  return (
    <Modal
      titulo={tuyos.length ? '¿Cuál de tus estilos compartes?' : 'Aún no tienes estilos tuyos'}
      onCerrar={onCerrar}
      acciones={
        tuyos.length ? (
          <button className="ghost" onClick={onCerrar}>
            Cancelar
          </button>
        ) : (
          <>
            <button className="ghost" onClick={onCerrar}>
              Ahora no
            </button>
            <button className="primary" autoFocus onClick={() => ((location.hash = '/new/nuevo-estilo'), onCerrar())}>
              Hacer mi estilo
            </button>
          </>
        )
      }
    >
      {tuyos.length ? (
        <div className="compartir-lista">
          {tuyos.map((t) => (
            <button key={t.id} onClick={() => setElegido(t)}>
              <strong>{t.title}</strong>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <p>Con «Nuevo estilo» le cuentas a Sloth el video que quieres, o le pasas ejemplos, y arma tu propio estilo. Luego lo compartes desde aquí.</p>
      )}
    </Modal>
  )
}

/** «Importar»: instala un `.sloth-estilo` que te pasaron. */
export function ImportarEstilo() {
  const elegir = useRef<HTMLInputElement>(null)
  const [instalado, setInstalado] = useState<Instalado | null>(null)
  const [error, setError] = useState('')
  async function importar(f: File) {
    setError('')
    try {
      const r = await fetch('/api/estilos/importar', { method: 'POST', body: f })
      const j = (await r.json().catch(() => ({}))) as Instalado & { error?: string }
      if (!r.ok) throw new Error(j.error ?? `No se pudo instalar ${f.name}.`)
      setInstalado(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <>
      {error && <span className="bad small importar-error">{error}</span>}
      <button className="estilo-importar" title="Instala un estilo que te pasaron (un archivo .sloth-estilo)" onClick={() => elegir.current?.click()}>
        <Icono de="descargar" className="icon-trazo" /> Importar
      </button>
      <input
        ref={elegir}
        type="file"
        accept=".sloth-estilo"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importar(f)
          e.target.value = ''
        }}
      />
      {instalado && <TrasInstalar r={instalado} onCerrar={() => setInstalado(null)} />}
    </>
  )
}
