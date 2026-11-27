import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { faltaEnGuia, guiaDe } from '../../shared/guia'
import type { AdjuntoComunidad, Card, FeedComunidad, GuiaEstilo, PruebaEstilo, PublicacionComunidad, VideoHecho } from '../../shared/types'
import { api, ErrorApi } from './api'
import { abrirPublicacion } from './Comunidad'
import { GuiaCampos, pruebaEnLinea } from './Guia'
import { Icono } from './Iconos'
import './Estilos.css'
import { abrirRuta } from './web'

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

/** Abre ese hilo, desde cualquier parte de la app (lo atiende `App`). */
export function abrirHilo(id: string) {
  dispatchEvent(new CustomEvent('sloth-hilo', { detail: id }))
}

const INCOMPLETOS = 'estilos-incompletos'

/**
 * Cuántos estilos tuyos de la comunidad no salen en la tienda porque les falta algo de lo que lleva todo estilo
 * (`PublicacionComunidad.incompleto`). Lo dice la tienda al cargar, o el aviso que te llega a la campana; se recuerda
 * para pintar «Comunidad» en rojo en la barra (`App`) hasta que los completes.
 */
export function marcarIncompletos(n: number) {
  try {
    if (n) localStorage.setItem(INCOMPLETOS, String(n))
    else localStorage.removeItem(INCOMPLETOS)
  } catch {
    // Sin almacenamiento: dura lo que la ventana.
  }
  dispatchEvent(new CustomEvent('sloth-estilos-incompletos', { detail: n }))
}

export function incompletosGuardados(): number {
  try {
    return Number(localStorage.getItem(INCOMPLETOS)) || 0
  } catch {
    return 0
  }
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

/**
 * Cómo va el paquete del estilo: se arma y se sube al abrir «Compartir», para saber antes de publicar si se puede. Con
 * él llega lo que conviene arreglar antes de mandarlo (`avisos`, de `avisosDe` en `server/estilos.ts`).
 */
type Paquete = { listo: AdjuntoComunidad & { avisos?: string[] } } | { error: string; arreglable: boolean } | { sinCuenta: true } | null

/** En «Un video hecho con él», al poner al día uno ya compartido: se queda el que ya lleva su publicación. */
const EL_MISMO = ':el-mismo'

/**
 * «Compartir» de un estilo tuyo, en una sola pantalla y sin salir de donde estás (como «Publish to Community» de Figma):
 * ya trae su título, lo que hace, su último video (que sube entero) y su guía de uso si «Nuevo estilo» la dejó en su card; tú solo revisas y
 * publicas. La guía es la plantilla de `shared/guia.ts`, la misma para todos: sin ella completa no se publica. Al abrir se empaqueta y se sube, así lo
 * que impide compartirlo sale antes de escribir nada, con un botón para que «Nuevo estilo» lo arregle. Si aún no te
 * pusiste nombre en la comunidad, se pide aquí. Abajo, guardarlo como archivo para pasarlo a mano.
 *
 * Lo que su autor ve de la revisión, que nadie tenga que explicarle:
 * - Antes de publicar, lo que no cumple de lo que necesita todo estilo y Sloth comprueba solo (`avisos`,
 *   `skills/video-base/ESTILO.md`): se arregla ahí mismo con «Nuevo estilo», o se manda igual y se lo piden.
 * - Uno que ya compartiste desde aquí no hace otra publicación: se pone al día la misma (`anterior`), con lo que ya
 *   decía, y se vuelve a revisar. Así se arregla lo que le faltaba sin perder sus comentarios ni sus números.
 * - Su evidencia es el hilo completo de ese video, que lee el creador: sube al publicar, y solo si marca que lo comparte.
 * - Al terminar, los pasos que siguen: Sloth lo lee solo (`server/estilos-revision.ts`); si le falta algo se lo dice en
 *   su publicación y su Sloth le avisa con la lista (`EstiloRevisado.tsx`), y si cumple todo se aprueba.
 * - Al creador que manda el estilo de otro (lo instaló con «Pre-aprobar», ADR 0024) le pone al día esa publicación y la
 *   deja «Pre-aprobado por Sloth» (`server/comunidad.ts`). Dice qué le cambió (`cambios`), y eso le llega a su autor en
 *   un comentario.
 */
export function CompartirEstilo({ card, onCerrar }: { card: Card; onCerrar(): void }) {
  const [paquete, setPaquete] = useState<Paquete>(null)
  const [intento, setIntento] = useState(0)
  // Tu nombre en la comunidad: `undefined` mientras se pregunta; sin cuenta, `null`.
  const [nombreActual, setNombreActual] = useState<string | null>()
  const [nombre, setNombre] = useState('')
  const [titulo, setTitulo] = useState(card.title)
  const [texto, setTexto] = useState(card.description ?? '')
  const [guia, setGuia] = useState<Partial<GuiaEstilo>>(card.guia ?? {})
  const [videos, setVideos] = useState<VideoHecho[] | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)
  const [error, setError] = useState('')
  const [hecha, setHecha] = useState<PublicacionComunidad | null>(null)
  const [archivo, setArchivo] = useState<{ ruta?: string; guardando?: boolean; error?: string }>({})
  // La publicación donde ya lo compartiste desde aquí, si sigue en la comunidad: se pone al día esa.
  const [anterior, setAnterior] = useState<PublicacionComunidad | null>(null)
  const videoAnterior = anterior?.adjuntos.find((a) => a.tipo === 'video')
  const pruebaAnterior = anterior?.adjuntos.find((a) => a.tipo === 'estilo')?.prueba
  // La prueba del video elegido, que sale de su hilo: `undefined` mientras se mide; `null`, su hilo ya no está.
  const [prueba, setPrueba] = useState<PruebaEstilo | null>()
  // Su evidencia es el hilo completo de ese video: va solo si su autor marca que lo comparte.
  const [acepto, setAcepto] = useState(false)
  // Quién eres en la comunidad: el creador que pone al día el estilo de otro lo pre-aprueba, y le dice qué le cambió.
  const [yo, setYo] = useState<FeedComunidad['yo'] | null>(null)
  const preaprueba = !!anterior && !!yo?.creador && !anterior.autor.creador
  const [cambios, setCambios] = useState('')

  useEffect(() => {
    api<{ publicacion?: PublicacionComunidad }>(`/api/comunidad/estilo/compartido?cardId=${encodeURIComponent(card.id)}&titulo=${encodeURIComponent(card.title)}`).then(
      ({ publicacion: p }) => {
        if (!p) return
        // Lo que ya decía allá es lo último que revisaste: va eso, no lo de la card.
        setAnterior(p)
        setTitulo(p.titulo)
        setTexto(p.texto)
        const g = p.adjuntos.find((a) => a.tipo === 'estilo')?.guia
        if (g) setGuia(g)
        // Su video se queda si ya lleva su prueba; si no (uno de antes), hay que elegir uno con su hilo.
        if (p.adjuntos.some((a) => a.tipo === 'video') && p.adjuntos.some((a) => a.prueba)) setVideo(EL_MISMO)
      },
      () => {}
    )
  }, [card.id])

  useEffect(() => {
    setPaquete(null)
    api<AdjuntoComunidad & { avisos?: string[] }>('/api/comunidad/estilo', { cardId: card.id }).then(
      (a) => setPaquete({ listo: a }),
      (e: unknown) =>
        setPaquete(e instanceof ErrorApi && e.status === 401 ? { sinCuenta: true } : { error: e instanceof Error ? e.message : String(e), arreglable: e instanceof ErrorApi && e.status === 400 })
    )
  }, [card.id, intento])
  useEffect(() => {
    api<FeedComunidad>('/api/comunidad?categoria=estilos').then(
      (f) => (setNombreActual(f.yo.nombre), setYo(f.yo)),
      () => setNombreActual(null)
    )
    // Sus videos, del más nuevo al más viejo: el primero ya va elegido, salvo que su publicación ya lleve uno.
    api<VideoHecho[]>(`/api/cards/${card.id}/videos`).then(
      (l) => (setVideos(l.slice(0, 4)), setVideo((v) => v ?? l[0]?.ruta ?? null)),
      () => setVideos([])
    )
  }, [card.id])

  useEffect(() => {
    if (!video) return setPrueba(null)
    if (video === EL_MISMO) return setPrueba(pruebaAnterior ?? null)
    let vivo = true
    setPrueba(undefined)
    api<PruebaEstilo>('/api/comunidad/estilo/prueba', { ruta: video }).then(
      (medida) => {
        if (!vivo) return
        setPrueba(medida)
        // Lo que se ve en su hilo ya va marcado; su autor añade lo que no deja rastro (su voz grabada) y quita lo que no.
        setGuia((g) => ({ ...g, herramientas: g.herramientas?.length ? g.herramientas : medida.hilo?.usa, agentes: g.agentes?.length ? g.agentes : [medida.agente] }))
      },
      () => vivo && setPrueba(null)
    )
    return () => void (vivo = false)
  }, [video, pruebaAnterior])

  const sinCuenta = !!paquete && 'sinCuenta' in paquete
  const avisos = (paquete && 'listo' in paquete && paquete.listo.avisos) || []
  const sinGuia = faltaEnGuia(guia)
  const falta = !titulo.trim()
    ? 'Ponle un título.'
    : nombreActual === '' && !nombre.trim()
      ? 'Escribe tu nombre: así te ven los demás.'
      : !texto.trim()
        ? 'Di qué hace tu estilo.'
        : sinGuia
          ? `Falta «${sinGuia}»: es lo que lee quien lo instala.`
          : !video
            ? 'Elige un video hecho con este estilo: todo estilo se enseña con uno entero.'
            : prueba === undefined
              ? 'Midiendo lo que costó hacer ese video…'
              : !prueba
                ? 'De ese video ya no está el hilo donde se hizo, y de ahí sale su prueba. Elige otro.'
                : !acepto
                  ? 'Marca que compartes el hilo de ese video: es la evidencia de su prueba.'
                  : preaprueba && !cambios.trim()
                    ? 'Di qué le cambiaste: se lo contamos a su autor.'
                    : ''
  const puede = !!paquete && 'listo' in paquete && !falta && !!prueba && !publicando && nombreActual !== undefined

  async function publicar() {
    if (!paquete || !('listo' in paquete) || !puede) return
    setPublicando(true)
    setError('')
    try {
      if (nombreActual === '') {
        await api('/api/comunidad/perfil', { nombre: nombre.trim() })
        setNombreActual(nombre.trim())
      }
      const { avisos: _, ...estilo } = paquete.listo
      // El video sube al publicar, entero: en la tienda se ve completo. Comprimirlo y subirlo tarda un poco. Al poner al
      // día uno ya compartido se quedan su video, si no eliges otro, y sus imágenes.
      const suVideo = video === EL_MISMO ? videoAnterior : video ? await api<AdjuntoComunidad>('/api/comunidad/video', { ruta: video, entero: true }) : undefined
      // Su evidencia, el hilo completo de ese video: sube ahora, que ya aceptó compartirlo. El del video que se queda ya está allá.
      const evidencia = video && video !== EL_MISMO ? (await api<{ llave: string }>('/api/comunidad/estilo/evidencia', { ruta: video })).llave : prueba?.evidencia
      const adjuntos = [{ ...estilo, guia: guiaDe(guia), prueba: { ...prueba, evidencia } }, ...(suVideo ? [suVideo] : []), ...(anterior?.adjuntos.filter((a) => a.tipo === 'imagen') ?? [])]
      const p = await api<PublicacionComunidad>('/api/comunidad/estilo/publicar', { cardId: card.id, titulo: titulo.trim(), texto: texto.trim(), adjuntos })
      // A su autor le llega qué le cambió Sloth, en su publicación. Si no llega, el estilo ya quedó: se lo puedes decir tú.
      if (preaprueba)
        await api(`/api/comunidad/p/${p.id}/comentar`, {
          texto: `Sloth pre-aprobó tu estilo: le hizo la prueba, y para que a quien lo instale le salga a la primera le cambió esto:\n\n${cambios.trim()}\n\nYa lo ve toda la comunidad. Si te gusta así, pulsa «Así está bien» en esta publicación. Si no, cámbialo y pulsa «Compartir» en su card: mientras se revisa tu versión, la comunidad sigue viendo esta.`
        }).catch(() => {})
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
        titulo={
          hecha.preaprobada
            ? 'Listo: pre-aprobado por Sloth'
            : hecha.porAprobar
              ? anterior
                ? 'Listo: tu versión nueva está en revisión'
                : 'Listo: tu estilo está en revisión'
              : 'Listo: tu estilo ya está en la comunidad'
        }
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
              <Icono de="palomita" className="icon-trazo" />
              <span>
                <strong>{anterior ? 'Mandaste la versión nueva' : 'Publicado'}.</strong>{' '}
                {hecha.publicaAun ? `Mientras se revisa, la comunidad sigue viendo la versión de antes de «${hecha.titulo}».` : `Por ahora «${hecha.titulo}» solo lo ven tú y el creador de Sloth.`}
              </span>
            </li>
            <li>
              <Icono de="escudo" className="icon-trazo" />
              <span>
                <strong>Sloth lo lee solo,</strong> contra lo que necesita todo estilo. No es al instante: puede tardar unas horas.
              </span>
            </li>
            <li>
              <Icono de="claqueta" className="icon-trazo" />
              <span>
                <strong>Si le falta algo, Sloth te avisa</strong> y te lleva a tu estilo, con la lista de lo que hay que arreglar. Lo arreglas y pulsas «Compartir» otra vez en su card: se pone al día esta misma
                publicación.
              </span>
            </li>
            <li>
              <Icono de="campana" className="icon-trazo" />
              <span>
                <strong>Si cumple todo, se aprueba</strong> y sale en la tienda para todos. Lo que añadas para conectarse a internet o lanzar otros programas lo aprueba el creador a mano. Todo te llega a la campana de Comunidad.
              </span>
            </li>
            <li>
              <Icono de="personas" className="icon-trazo" />
              <span>
                <strong>Para cobrar tu parte del fondo, pon tu Binance ID:</strong> en Comunidad, arriba, abre «Fondo», pulsa «¿Quieres participar?» y escríbelo en «Pon tu Binance ID y cobra». Es el número de tu
                cuenta de Binance, el de tu perfil. Sin él tu estilo sale igual, pero no se lleva nada.
              </span>
            </li>
          </ol>
        ) : hecha.preaprobada ? (
          <p>Ya todos lo ven en Estilos como «Pre-aprobado por Sloth». A {hecha.autor.nombre || 'su autor'} le llegó un aviso con lo que le cambiaste: lo deja así o manda su versión.</p>
        ) : (
          <p>Ya todos lo ven en Estilos y lo pueden instalar con un clic.</p>
        )}
      </Modal>
    )

  return (
    <Modal
      titulo={anterior ? `Poner al día «${card.title}» en la comunidad` : `Compartir «${card.title}»`}
      ancho
      onCerrar={onCerrar}
      acciones={
        <>
          {archivo.ruta ? (
            <button className="ghost compartir-archivo" onClick={() => void abrirRuta(archivo.ruta!).catch(() => {})} title={archivo.ruta}>
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
              {publicando ? (video && video !== EL_MISMO ? 'Subiendo el video entero…' : 'Publicando…') : !paquete ? 'Preparando…' : preaprueba ? 'Pre-aprobar y publicar' : anterior ? 'Mandar la versión nueva' : 'Publicar en la comunidad'}
            </button>
          )}
        </>
      }
    >
      {anterior && (
        <div className="compartir-anterior">
          {preaprueba ? (
            <span>
              Es el estilo de {anterior.autor.nombre || 'alguien de la comunidad'}. Se pone al día su misma publicación, con sus comentarios, y queda «Pre-aprobado por Sloth»: ya lo ve toda la
              comunidad. Sigue siendo suyo, y le llega un aviso con lo que le cambiaste.
            </span>
          ) : (
            <span>
              Ya lo compartiste: {anterior.porAprobar ? 'está en revisión' : 'está en la tienda'}. No se hace otra publicación: se pone al día esa misma, con sus comentarios, y se vuelve a revisar
              {anterior.porAprobar ? '.' : '; mientras tanto la comunidad sigue viendo la versión de ahora.'}
            </span>
          )}
          <button className="ghost small" onClick={() => (abrirPublicacion(anterior.id), onCerrar())}>
            Ver la publicación
          </button>
        </div>
      )}
      <div className={`compartir-paquete${paquete && 'error' in paquete ? ' mal' : avisos.length ? ' ojo' : paquete && 'listo' in paquete ? ' bien' : ''}`}>
        {!paquete ? (
          <>
            <span className="spinner" /> Revisando que tu estilo se pueda compartir…
          </>
        ) : avisos.length ? (
          <div>
            <strong>Se puede mandar, pero así no se aprueba. Le falta esto:</strong>
            <ul className="compartir-avisos">
              {avisos.map((a) => (
                <li key={a}>{conCodigo(a)}</li>
              ))}
            </ul>
            <div className="compartir-arreglar">
              <button className="primary" onClick={() => (abrirBorrador('nuevo-estilo', mejorar(card, avisos)), onCerrar())}>
                Que «Nuevo estilo» lo arregle
              </button>
              <span>Es lo que Sloth comprueba solo de lo que necesita todo estilo. Si lo mandas así, te lo va a pedir.</span>
            </div>
          </div>
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
            <span>Qué hace</span>
            <textarea value={texto} rows={2} maxLength={2000} placeholder="Por ejemplo: videos de datos curiosos con imágenes de Flow, narrados con tu voz." onChange={(e) => setTexto(e.target.value)} />
          </label>
          {/* La plantilla de uso: la misma para todos los estilos, para que quien lo instala sepa cómo usarlo. */}
          <div className="compartir-guia">
            <strong>Cómo se usa</strong>
            <span>Lo lee quien lo instala, en la comunidad y bajo el nombre del estilo. Es igual para todos los estilos y va completa.</span>
          </div>
          <GuiaCampos valor={guia} onCambio={setGuia} />
          {preaprueba && (
            <label>
              <span>Qué le cambiaste · se lo contamos a su autor</span>
              <textarea
                value={cambios}
                rows={3}
                maxLength={3000}
                placeholder="Por ejemplo: le puse su guía de uso, corregí el paso de las imágenes que fallaba en Mac y le hice su video de prueba."
                onChange={(e) => setCambios(e.target.value)}
              />
            </label>
          )}
          <div className="compartir-video">
            <span>Un video entero hecho con él · es lo que ven en la tienda, y de su hilo sale su prueba</span>
            {videos === null ? (
              <p className="small">Buscando tus videos…</p>
            ) : videos.length || (videoAnterior && pruebaAnterior) ? (
              <div className="compartir-videos">
                {/* El que ya lleva su publicación, si ya tiene su prueba: el de un estilo de antes no la tiene, y hay que elegir otro. */}
                {videoAnterior && pruebaAnterior && (
                  <button className={video === EL_MISMO ? 'on' : ''} title="El que ya lleva tu publicación" onClick={() => setVideo(EL_MISMO)}>
                    {videoAnterior.posterUrl ? <img src={videoAnterior.posterUrl} alt="" /> : 'El de ahora'}
                    {video === EL_MISMO && <Icono de="palomita" className="icon-trazo" />}
                  </button>
                )}
                {videos.map((v) => (
                  <button key={v.ruta} className={video === v.ruta ? 'on' : ''} title={v.titulo} onClick={() => setVideo(v.ruta)}>
                    <img src={`${v.src}&cuadro`} alt="" />
                    {video === v.ruta && <Icono de="palomita" className="icon-trazo" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="small">Aún no terminas un video con este estilo. Haz uno y vuelve: todo estilo de la comunidad se enseña con un video entero y con lo que costó hacerlo.</p>
            )}
            {prueba && (
              <div className="compartir-prueba">
                <strong>{pruebaEnLinea(prueba)}</strong>
                <span>Sale del hilo donde se hizo, no lo escribes tú.</span>
                <label className="compartir-acepto">
                  <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
                  <span>
                    <strong>Comparto ese hilo completo como evidencia:</strong> lo que le escribí al agente, lo que contestó y lo que hizo en cada turno. Lo ven el creador de Sloth y yo, nadie más.
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
      {(error || archivo.error) && <p className="bad compartir-error">{error || archivo.error}</p>}
      {!error && !archivo.error && falta && paquete && 'listo' in paquete && <p className="compartir-falta">{falta}</p>}
    </Modal>
  )
}

/** Lo que se le pide a «Nuevo estilo» cuando un estilo no se puede compartir. */
const arreglar = (card: Card, error: string) =>
  [
    `Mi estilo «${card.title}» (la skill ${card.skill ?? card.id}) no se puede compartir en la comunidad. Sloth dice: ${error}`,
    'Arréglalo para que se pueda compartir sin cambiar lo que hace. Sigue «Compartir un estilo» de tu skill.'
  ].join('\n\n')

/** Un aviso, con lo que va entre acentos graves (un archivo, un campo) como código. */
const conCodigo = (texto: string) => texto.split('`').map((t, i) => (i % 2 ? <code key={i}>{t}</code> : t))

/** Lo que se le pide a «Nuevo estilo» con lo que Sloth avisó antes de compartirlo. */
const mejorar = (card: Card, avisos: string[]) =>
  [
    `Antes de compartir mi estilo «${card.title}» (la skill ${card.skill ?? card.id}) en la comunidad, Sloth me avisó esto:`,
    avisos.map((a) => `- ${a}`).join('\n'),
    'Arréglalo sin cambiar lo que hace. Sigue «Compartir un estilo» de tu skill.'
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
