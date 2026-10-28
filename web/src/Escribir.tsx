import { type CSSProperties, type MutableRefObject, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NOMBRE_AGENTE } from '../../shared/providers'
import type { AdjuntoComunidad, AyudaMejora, OrigenMejora, VideoHecho, VideosDeTodos } from '../../shared/types'
import { api } from './api'
import { Icono as IconoBase, type NombreIcono } from './Iconos'
import { MarcaAgente } from './Logos'
import './Escribir.css'

/**
 * Donde se escribe en la comunidad: una publicación nueva, una que se edita o una mejora pedida desde un hilo
 * (`PedirMejora.tsx`). Crece con el texto; Enter lo manda y Mayús+Enter es otra línea (en el título, Enter baja al texto).
 * Las capturas se pegan, se sueltan o se eligen, y suben a la comunidad en cuanto llegan (`/api/comunidad/archivo`); un
 * video se elige de «Mis videos» y suben sus primeros 5 segundos con su portada (`/api/comunidad/video`): el entero se
 * enlaza en el texto. «Ayúdame a decirlo» (el símbolo del agente) le pide al agente del hilo (sin hilo, Claude) que
 * entienda lo escrito y proponga cómo decirlo; desde un hilo, con lo que pasaba en él.
 */

export interface Escrito {
  titulo: string
  texto: string
  adjuntos: AdjuntoComunidad[]
}

/** Lo que aún sube: una imagen sin nada que enseñar, o un video con su portada de aquí mientras tanto. */
interface Subiendo {
  id: number
  poster?: string
}

const Icono = ({ de }: { de: NombreIcono }) => <IconoBase de={de} className="esc-ico" />
let siguiente = 0

/** Sube una imagen a la comunidad: de una publicación o de un comentario. */
export async function subirImagen(f: File): Promise<AdjuntoComunidad> {
  const r = await fetch(`/api/comunidad/archivo?tipo=${encodeURIComponent(f.type)}`, { method: 'POST', body: f })
  const j = (await r.json().catch(() => ({}))) as { llave?: string; url?: string; error?: string }
  if (!r.ok || !j.llave || !j.url) throw new Error(j.error ?? `No se pudo subir ${f.name || 'la captura'}.`)
  return { tipo: 'imagen', llave: j.llave, url: j.url }
}

export function Escribir(props: {
  inicial?: Partial<Escrito>
  /** Al editar: no se vacía al guardar. */
  editando?: boolean
  conTitulo?: boolean
  placeholder: string
  accion: string
  autoFocus?: boolean
  /** El campo, para que «/» lo enfoque. */
  campo?: MutableRefObject<HTMLTextAreaElement | null>
  /** Lo que se suelta en la sección llega aquí. */
  subir?: MutableRefObject<((archivos: File[]) => void) | null>
  soltando?: boolean
  /** Con el símbolo de su agente: «Ayúdame a decirlo». */
  ayuda?: boolean
  /** Quién ayuda: el agente del hilo de donde sale (sin hilo, Claude). */
  agente?: 'claude' | 'codex'
  /** De qué hilo sale, para que su agente lea lo que pasaba. */
  origen?: OrigenMejora
  /** Deja elegir uno de «Mis videos». */
  conVideo?: boolean
  /** Uno de «Mis videos» que ya está subiendo (lo compartiste desde ahí), con su portada de aquí. */
  videoCompartido?: { subida: Promise<AdjuntoComunidad>; poster?: string }
  /** A la izquierda del botón: dónde se publica. */
  extra?: ReactNode
  /** Dentro de una tarjeta o de una caja: sin resplandor ni avatar. */
  compacto?: boolean
  onListo(e: Escrito): Promise<unknown>
  onCancelar?(): void
}) {
  const [titulo, setTitulo] = useState(props.inicial?.titulo ?? '')
  const [texto, setTexto] = useState(props.inicial?.texto ?? '')
  const [adjuntos, setAdjuntos] = useState<AdjuntoComunidad[]>(props.inicial?.adjuntos ?? [])
  const [subiendo, setSubiendo] = useState<Subiendo[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [encima, setEncima] = useState(false)
  const [eligiendo, setEligiendo] = useState(false)
  // Lo que propuso el agente y el texto que tenías entonces: si lo cambias (contestaste una pregunta), la propuesta ya no
  // lo incluye y no se ofrece para reemplazarlo.
  const [propuesta, setPropuesta] = useState<(AyudaMejora & { base: string }) | null>(null)
  const [pensando, setPensando] = useState(false)
  const agente = props.agente ?? 'claude'
  const nombre = NOMBRE_AGENTE[agente]
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const elegir = useRef<HTMLInputElement>(null)

  // Crece con lo escrito, hasta que el CSS lo topa.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [texto])
  useEffect(() => {
    if (!props.autoFocus || !ref.current) return
    ref.current.focus()
    ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length)
  }, [props.autoFocus])

  /** Algo que sube: entra a la lista cuando llega, en el orden en que lo elegiste. */
  async function conSubida(poster: string | undefined, subida: Promise<AdjuntoComunidad>) {
    const id = ++siguiente
    setSubiendo((l) => [...l, { id, poster }])
    try {
      const a = await subida
      // Un solo video: el nuevo reemplaza al de antes.
      setAdjuntos((l) => [...(a.tipo === 'video' ? l.filter((x) => x.tipo !== 'video') : l), a])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubiendo((l) => l.filter((s) => s.id !== id))
    }
  }

  async function subirImagenes(archivos: File[]) {
    const fotos = archivos.filter((f) => f.type.startsWith('image/'))
    if (!fotos.length) return setError(archivos.length ? 'Aquí solo se sueltan imágenes; un video, elígelo de «Mis videos».' : '')
    setError('')
    await Promise.all(fotos.map((f) => conSubida(undefined, subirImagen(f))))
  }
  useEffect(() => {
    if (!props.subir) return
    props.subir.current = (archivos) => void subirImagenes(archivos)
    return () => {
      if (props.subir) props.subir.current = null
    }
  })
  // El video que llega compartido de «Mis videos».
  useEffect(() => {
    if (props.videoCompartido) void conSubida(props.videoCompartido.poster, props.videoCompartido.subida)
  }, [props.videoCompartido])

  function elegirVideo(v: VideoHecho) {
    setEligiendo(false)
    setError('')
    void conSubida(`${v.src}&cuadro`, api<AdjuntoComunidad>('/api/comunidad/video', { ruta: v.ruta }))
  }

  const vacio = !titulo.trim() && !texto.trim() && !adjuntos.length
  const vigente = !!propuesta?.mejora && texto.trim() === propuesta.base

  /** El agente lee lo escrito (y el hilo, si lo hay) y propone el texto; se usa con un clic. */
  async function pedirAyuda() {
    if (pensando || (!texto.trim() && !titulo.trim() && !props.origen)) return
    setPensando(true)
    setError('')
    try {
      const base = texto.trim()
      setPropuesta({ ...(await api<AyudaMejora>('/api/comunidad/redactar', { texto: [titulo.trim(), base].filter(Boolean).join('\n\n'), origen: props.origen })), base })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPensando(false)
    }
  }
  /** Una pregunta del agente va al final de lo escrito, para contestarla ahí mismo. */
  function contestar(pregunta: string) {
    setTexto((t) => `${t.trimEnd()}${t.trim() ? '\n\n' : ''}${pregunta} `)
    setPropuesta((p) => p && { ...p, preguntas: p.preguntas.filter((q) => q !== pregunta) })
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  async function listo() {
    if (vacio || subiendo.length || ocupado) return
    setOcupado(true)
    setError('')
    try {
      await props.onListo({ titulo: titulo.trim(), texto: texto.trim(), adjuntos })
      if (!props.editando) {
        setTitulo('')
        setTexto('')
        setAdjuntos([])
        setPropuesta(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const soltando = props.soltando || encima
  return (
    <div
      className={`esc${props.compacto ? ' compacto' : ''}${soltando ? ' soltando' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setEncima(false)}
      onDrop={(e) => {
        setEncima(false)
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        e.stopPropagation()
        void subirImagenes([...e.dataTransfer.files])
      }}
    >
      {props.conTitulo && (
        <input
          className="esc-titulo"
          value={titulo}
          maxLength={140}
          placeholder="Título"
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.preventDefault(), ref.current?.focus())
            if (e.key === 'Escape' && props.onCancelar) props.onCancelar()
          }}
        />
      )}
      <textarea
        ref={(el) => {
          ref.current = el
          if (props.campo) props.campo.current = el
        }}
        rows={1}
        value={texto}
        placeholder={props.placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void listo()
          }
          if (e.key === 'Escape' && props.onCancelar) props.onCancelar()
        }}
        onPaste={(e) => {
          const archivos = [...e.clipboardData.files]
          if (!archivos.some((f) => f.type.startsWith('image/'))) return
          e.preventDefault()
          void subirImagenes(archivos)
        }}
      />
      {(adjuntos.length > 0 || subiendo.length > 0) && (
        <div className="esc-fotos">
          {adjuntos.map((a) => (
            <div key={a.llave} className={`esc-miniatura${a.tipo === 'video' ? ' video' : ''}`}>
              {a.tipo === 'imagen' ? <img src={a.url} alt="" /> : a.posterUrl ? <img src={a.posterUrl} alt="" /> : <video src={a.url} muted preload="metadata" />}
              {a.tipo === 'video' && (
                <span className="esc-play">
                  <Icono de="video" />
                </span>
              )}
              <button title="Quitar" onClick={() => setAdjuntos((l) => l.filter((x) => x !== a))}>
                ×
              </button>
            </div>
          ))}
          {subiendo.map((s) => (
            <div key={s.id} className={`esc-miniatura subiendo${s.poster ? ' video' : ''}`} title={s.poster ? 'Subiendo sus primeros 5 segundos…' : 'Subiendo…'}>
              {s.poster && <img src={s.poster} alt="" />}
            </div>
          ))}
        </div>
      )}
      {propuesta && (vigente || propuesta.preguntas.length > 0) && (
        <div className="esc-claude">
          <div className="esc-claude-cabeza">
            <MarcaAgente de={agente} /> Lo que entendí
            <button className="esc-claude-cerrar" title="Descartar" onClick={() => setPropuesta(null)}>
              <Icono de="cerrar" />
            </button>
          </div>
          {propuesta.entendi && <p className="esc-claude-entendi">{propuesta.entendi}</p>}
          {vigente && (
            <div className="esc-claude-propuesta">
              <p>{propuesta.mejora}</p>
              <button
                className="esc-usar"
                onClick={() => {
                  setTexto(propuesta.mejora)
                  ref.current?.focus()
                }}
              >
                Usar este texto
              </button>
            </div>
          )}
          {propuesta.preguntas.length > 0 && (
            <div className="esc-claude-preguntas">
              <span>Para afinarlo, toca una pregunta, contéstala en tu texto y vuelve a pedir ayuda:</span>
              {propuesta.preguntas.map((q) => (
                <button key={q} onClick={() => contestar(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="esc-pie">
        <button className="esc-adjuntar" title="Agregar capturas (también puedes pegarlas o soltarlas)" onClick={() => elegir.current?.click()}>
          <Icono de="imagen" />
          <span>{soltando ? 'Suéltala aquí' : 'Captura'}</span>
        </button>
        <input
          ref={elegir}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void subirImagenes([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        {props.conVideo && (
          <span className="esc-video">
            <button className={`esc-adjuntar${eligiendo ? ' on' : ''}`} title="Los primeros 5 segundos de un video que hiciste con Sloth" onClick={() => setEligiendo(!eligiendo)}>
              <Icono de="video" />
              <span>Video</span>
            </button>
            {eligiendo && <MisVideosParaElegir onElegir={elegirVideo} onCerrar={() => setEligiendo(false)} />}
          </span>
        )}
        {props.ayuda && (
          <button
            className={`esc-ayuda${pensando ? ' pensando' : ''}`}
            disabled={pensando || (!texto.trim() && !titulo.trim() && !props.origen)}
            title={props.origen ? `${nombre} lee lo que pasaba en el hilo y lo que escribiste, y te propone cómo decirlo` : `Escribe aunque sea a medias: ${nombre} te propone cómo decirlo`}
            onClick={() => void pedirAyuda()}
          >
            <MarcaAgente de={agente} />
            {pensando ? `${nombre} está pensando…` : 'Ayúdame a decirlo'}
          </button>
        )}
        {error ? <span className="esc-error">{error}</span> : <span className="esc-pista">Enter para {props.accion.toLowerCase()} · Mayús+Enter, otra línea</span>}
        {props.extra}
        {props.onCancelar && (
          <button className="esc-cancelar" onClick={props.onCancelar}>
            Cancelar
          </button>
        )}
        <button className="esc-listo" disabled={vacio || subiendo.length > 0 || ocupado} title={subiendo.length ? 'Espera a que termine de subir' : undefined} onClick={() => void listo()}>
          {props.accion}
        </button>
      </div>
    </div>
  )
}

/** Los videos terminados, del más nuevo al más viejo, para elegir uno. */
function MisVideosParaElegir({ onElegir, onCerrar }: { onElegir(v: VideoHecho): void; onCerrar(): void }) {
  const [videos, setVideos] = useState<VideoHecho[] | null>(null)
  const [error, setError] = useState('')
  const caja = useRef<HTMLDivElement>(null)
  // Donde está el botón «Video»: la caja se dibuja en `body`, encima de todo, y se coloca junto a él.
  const marca = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    api<VideosDeTodos>('/api/videos').then(
      (r) => setVideos(r.videos.slice(0, 60)),
      (e: Error) => setError(e.message)
    )
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!caja.current?.contains(t) && !marca.current?.parentElement?.contains(t)) onCerrar()
    }
    addEventListener('mousedown', fuera)
    return () => removeEventListener('mousedown', fuera)
  }, [])
  // Encima del botón si cabe; si no (el compositor de Comunidad está al principio de la página), debajo. Sigue al botón
  // al desplazar la página.
  const [lugar, setLugar] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const colocar = () => {
      const ancla = marca.current?.parentElement
      const c = caja.current
      if (!ancla || !c) return
      const r = ancla.getBoundingClientRect()
      const alto = c.offsetHeight
      const left = Math.max(8, Math.min(r.left, innerWidth - c.offsetWidth - 8))
      const top = r.top - alto - 8 >= 8 ? r.top - alto - 8 : Math.max(8, Math.min(r.bottom + 8, innerHeight - alto - 8))
      setLugar({ left, top })
    }
    colocar()
    addEventListener('scroll', colocar, true)
    addEventListener('resize', colocar)
    return () => {
      removeEventListener('scroll', colocar, true)
      removeEventListener('resize', colocar)
    }
  }, [videos, error])
  return (
    <span ref={marca} hidden>
      {createPortal(
        <div ref={caja} className="esc-elegir" style={lugar} role="dialog" aria-label="Elige un video">
          <div className="esc-elegir-titulo">Tus videos</div>
          <p className="esc-elegir-nota">Se suben sus primeros 5 segundos. Para enseñarlo entero, pega su enlace en el texto.</p>
          {error && <p className="esc-elegir-nada">{error}</p>}
          {videos === null && !error && <p className="esc-elegir-nada">Cargando…</p>}
          {videos?.length === 0 && <p className="esc-elegir-nada">Aún no terminas ningún video con Sloth.</p>}
          {!!videos?.length && (
            <div className="esc-elegir-lista">
              {videos.map((v) => (
                <button key={v.ruta} className={v.vertical ? 'vertical' : ''} title={v.titulo} onClick={() => onElegir(v)}>
                  <img src={`${v.src}&cuadro`} alt="" loading="lazy" />
                  <span>{v.titulo}</span>
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </span>
  )
}
