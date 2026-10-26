import { useEffect, useState } from 'react'
import type { Card, SessionMeta, VideoFinal } from '../../shared/types'
import { api } from './api'
import { YoutubeBoton } from './Youtube'
import './Final.css'

/**
 * Lo que se hace con un video terminado, arriba de la fase Entrega del estudio: bajarlo, verlo en su carpeta, copiarlo a
 * otra («Guardar en…», `server/destino.ts`) y pedirle un cambio de un clic. Los cambios le llegan al agente como si los
 * escribieras, y no se pueden pedir mientras trabaja.
 */

/** Lo que pide cada cambio de un clic. `conVoz`: vale también cuando la voz es una grabación del usuario (El Diff). */
const CAMBIOS: { texto: string; pide: string; conVoz?: boolean }[] = [
  { texto: 'Hazlo más corto', pide: 'Hazlo más corto: quita lo que sobra y deja lo esencial, sin perder el gancho ni el cierre.' },
  { texto: 'Dale más ritmo', pide: 'Dale más ritmo: cortes más rápidos, menos pausas y más movimiento, con la música y los efectos a tono.', conVoz: true },
  { texto: 'Cambia la música', pide: 'Cambia la música por otra distinta que le vaya al video, y ajusta los efectos de sonido a ella.', conVoz: true },
  { texto: 'Cambia el final', pide: 'Cambia el final: haz otro cierre, que remate mejor el video.' }
]
/** No pisa la actual: el servidor pasa el hilo a una carpeta nueva y se lo dice al agente (`otraVersion` en etapas.ts). */
const VERSION = 'Haz otra versión'

/** El nombre de un video en su botón: `video-vertical.mp4` es «vertical». */
const etiqueta = (f: VideoFinal) => (f.ruta.split('/').pop() ?? f.ruta).replace(/\.mp4$/i, '').replace(/^video-/, '')

export function Final({ session, card, carpeta, finales }: { session: SessionMeta; card: Card; carpeta: string; finales: VideoFinal[] }) {
  const [pedido, setPedido] = useState('')
  const [error, setError] = useState('')
  const trabaja = session.running || !!session.background?.length || !!session.pendiente
  // El pedido se queda marcado hasta que el agente se pone a trabajar en él.
  useEffect(() => {
    if (trabaja) setPedido('')
  }, [trabaja])
  // En El Diff la voz la graba el usuario: lo que cambiaría lo que se dice pediría grabarla otra vez.
  const narrado = !!card.editor
  const cambios = CAMBIOS.filter((c) => !narrado || c.conVoz)

  async function pedir(texto: string, hacer: () => Promise<unknown>) {
    setPedido(texto)
    setError('')
    try {
      await hacer()
    } catch (e) {
      setPedido('')
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const mandar = (c: (typeof CAMBIOS)[number]) =>
    pedir(c.texto, () => api(`/api/sessions/${session.id}/send`, { text: `${c.pide}${narrado ? ' La voz no se toca.' : ''} Cuando acabes, vuelve a renderizar el video final.` }))
  const src = (f: VideoFinal) => `/api/sessions/${session.id}/archivo?ruta=${encodeURIComponent(f.ruta)}&t=${Math.round(f.t)}&descarga=${encodeURIComponent(f.nombre)}`
  const abrir = (ruta: string) => api('/api/open', { path: ruta }).catch((e) => setError(e.message))

  return (
    <section className="final">
      <div className="final-titulo">{finales.length ? (finales.length > 1 ? 'Videos terminados' : 'Video terminado') : 'Guardar los videos'}</div>
      {finales.length > 0 && (
        <div className="final-fila">
          {finales.map((f, k) => (
            <a key={f.ruta} className={`final-boton ${k ? '' : 'principal'}`} href={src(f)} download={f.nombre} title={`Bajarlo como «${f.nombre}»`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />
              </svg>
              Descargar{finales.length > 1 ? ` ${etiqueta(f)}` : ''}
            </a>
          ))}
          {finales.map((f) => <YoutubeBoton key={`youtube:${f.ruta}`} nombre={finales.length > 1 ? etiqueta(f) : undefined} disabled={trabaja} video={{ cardId: card.id, ruta: `${carpeta}\\${f.ruta.replaceAll('/', '\\')}`, titulo: session.title }} />)}
          <button className="final-boton" title={carpeta} onClick={() => abrir(`${carpeta}\\${finales[0].ruta.replaceAll('/', '\\')}`)}>
            <CarpetaIcono />
            Ver en la carpeta
          </button>
        </div>
      )}
      <div className="final-fila">
        <GuardarEn destino={session.destino} onCambio={(destino) => api(`/api/sessions/${session.id}/destino`, { destino: destino ?? null })} />
        {session.destino && <EstadoCopia session={session} terminado={finales.length > 0} abrir={abrir} />}
      </div>
      {finales.length > 0 && (
        <div className="final-cambios">
          <span className="muted small">¿Algún cambio?</span>
          {cambios.map((c) => (
            <button key={c.texto} className={pedido === c.texto ? 'on' : ''} disabled={trabaja || !!pedido} onClick={() => mandar(c)}>
              {c.texto}
            </button>
          ))}
          {!narrado && (
            <button
              className={pedido === VERSION ? 'on' : ''}
              disabled={trabaja || !!pedido}
              title="La hace en una carpeta nueva junto a esta: la versión de ahora se queda como está"
              onClick={() => pedir(VERSION, () => api(`/api/sessions/${session.id}/version`, {}))}
            >
              {VERSION}
            </button>
          )}
          {trabaja && <span className="muted small">El agente está trabajando: cuando termine, puedes pedir otro.</span>}
        </div>
      )}
      {error && <span className="bad small">{error}</span>}
    </section>
  )
}

/** Cómo va la copia a la carpeta de «Guardar en…»: lo copiado, para verlo, o por qué falló. */
function EstadoCopia({ session, terminado, abrir }: { session: SessionMeta; terminado: boolean; abrir(ruta: string): void }) {
  const { copia, destino } = session
  if (copia?.error) return <span className="bad small">No se pudo copiar: {copia.error}</span>
  const n = copia?.archivos.length ?? 0
  if (!n) return <span className="muted small">{terminado ? 'Se copia al acabar el turno.' : 'Se copia en cuanto esté terminado.'}</span>
  return (
    <button className="final-copiado small" title={destino} onClick={() => abrir(`${destino}\\${copia!.archivos[0]}`)}>
      {n === 1 ? 'Copiado' : `${n} videos copiados`} · Ver
    </button>
  )
}

const ULTIMA = 'destino-ultimo'

/** La carpeta de «Guardar en…» de los hilos nuevos: la última que elegiste, para todos los estilos, hasta que la quitas. */
export function useDestino(): [string | undefined, (destino: string | undefined) => void] {
  const [destino, setDestino] = useState(() => localStorage.getItem('destino') ?? undefined)
  return [destino, (d) => (d ? localStorage.setItem('destino', d) : localStorage.removeItem('destino'), setDestino(d))]
}

/** El último trozo de una ruta de Windows: `D:\Videos\Sloth` es «Sloth»; `D:\`, «D:». */
const ultimoTrozo = (ruta: string) => ruta.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ruta

/**
 * «Guardar en…»: abre el diálogo de carpetas (empieza en la última que elegiste) y la pone como destino de los
 * videos terminados. Con una puesta, ✕ la quita. Lo usan el compositor de un hilo nuevo y la fase Entrega.
 */
export function GuardarEn({ destino, onCambio }: { destino?: string; onCambio(destino: string | undefined): Promise<unknown> | void }) {
  const [ocupado, setOcupado] = useState<'' | 'eligiendo' | 'copiando'>('')
  const [error, setError] = useState('')

  /** Elige otra carpeta en el diálogo (si se cancela, nada cambia), o quita la que hay. */
  async function cambiar(elegir: boolean) {
    setError('')
    try {
      let ruta: string | undefined
      if (elegir) {
        setOcupado('eligiendo')
        const desde = destino ?? localStorage.getItem(ULTIMA) ?? undefined
        // En la ventana de Sloth, el diálogo del sistema; en un navegador, el que abre el servidor (solo en Windows).
        ruta = (window.sloth?.elegirCarpeta ? await window.sloth.elegirCarpeta(desde) : (await api<{ ruta: string | null }>('/api/elegir-carpeta', { desde })).ruta) ?? undefined
        if (!ruta) return
        localStorage.setItem(ULTIMA, ruta)
        // En un hilo que ya existe, elegirla copia ya lo que esté terminado.
        setOcupado('copiando')
      }
      await onCambio(ruta)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado('')
    }
  }

  return (
    <span className={`guardar-en ${destino ? 'on' : ''}`}>
      <button
        className="guardar-en-boton"
        disabled={!!ocupado}
        title={destino ? `Los videos terminados se copian a ${destino}. Clic para elegir otra carpeta.` : 'Elige una carpeta donde copiar los videos terminados'}
        onClick={() => cambiar(true)}
      >
        <CarpetaIcono />
        {ocupado === 'eligiendo' ? 'Eligiendo carpeta…' : ocupado === 'copiando' ? 'Copiando…' : destino ? `Guardar en ${ultimoTrozo(destino)}` : 'Guardar en…'}
      </button>
      {destino && !ocupado && (
        <button className="guardar-en-quitar" title="Dejar de copiar los videos ahí" onClick={() => cambiar(false)}>
          ✕
        </button>
      )}
      {error && <span className="bad small">{error}</span>}
    </span>
  )
}

const CarpetaIcono = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)
