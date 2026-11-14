import { useEffect, useRef, useState } from 'react'
import { OPCIONES_SUBTITULOS, type OpcionesSubtitulos, type TrabajoSubtitulos } from '../../shared/subtitulos'
import type { VideoFinal } from '../../shared/types'
import { api } from './api'
import { Picker } from './Composer'
import { Icono } from './Iconos'
import './Subtitulos.css'

/**
 * Los subtítulos de un video terminado, en la Entrega (dentro de `Final.tsx`): gratis, sin agente
 * (`server/subtitulos.ts`). Se ponen con un clic; luego se corrige el texto o se cambia el estilo, y solo se vuelve a
 * grabar. Se bajan el video con subtítulos y el .srt; el video de siempre no se toca.
 */

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))
const reloj = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const nombreDe = <K extends keyof OpcionesSubtitulos>(k: K, v: OpcionesSubtitulos[K]) => OPCIONES_SUBTITULOS[k].find((o) => o.value === v)?.label ?? v
const textoDe = (r: { palabras: { text: string }[] }) => r.palabras.map((p) => p.text).join(' ')
const trabajando = (s?: TrabajoSubtitulos | null) => s?.estado === 'transcribiendo' || s?.estado === 'grabando'

function Opciones({ valor, onCambio }: { valor: OpcionesSubtitulos; onCambio(o: OpcionesSubtitulos): void }) {
  const elegir = <K extends keyof OpcionesSubtitulos>(k: K, titulo: string) => (
    <Picker
      label={k === 'estilo' ? nombreDe(k, valor[k]) : `${titulo}: ${nombreDe(k, valor[k]).toLowerCase()}`}
      value={valor[k]}
      groups={[{ label: titulo, options: OPCIONES_SUBTITULOS[k].map((o) => ({ value: o.value, label: o.label, detalle: 'detalle' in o ? o.detalle : undefined })) }]}
      onChange={(v) => onCambio({ ...valor, [k]: v })}
    />
  )
  return (
    <>
      {elegir('estilo', 'Estilo')}
      {elegir('tamano', 'Tamaño')}
      {elegir('posicion', 'Posición')}
    </>
  )
}

export function SubtitulosEntrega({ sessionId, finales }: { sessionId: string; finales: VideoFinal[] }) {
  const [elegido, setElegido] = useState(finales[0].ruta)
  const final = finales.find((f) => f.ruta === elegido) ?? finales[0]
  const [estado, setEstado] = useState<TrabajoSubtitulos | null>(null)
  const [opciones, setOpciones] = useState<OpcionesSubtitulos | null>(null)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [textos, setTextos] = useState<string[]>([])
  const [error, setError] = useState('')
  const reproductor = useRef<HTMLVideoElement>(null)
  const url = `/api/sessions/${sessionId}/subtitulos?ruta=${encodeURIComponent(final.ruta)}`

  // Cómo van los de este video; mientras trabaja, cada segundo. Con el video rehecho (`final.t`), se vuelve a mirar.
  useEffect(() => {
    let vivo = true
    let reloj = 0
    const mirar = () =>
      api<TrabajoSubtitulos>(url)
        .then((s) => {
          if (!vivo) return
          setEstado(s)
          if (trabajando(s)) reloj = window.setTimeout(mirar, 1000)
        })
        .catch((e) => vivo && setError(mensaje(e)))
    void mirar()
    return () => ((vivo = false), clearTimeout(reloj))
  }, [url, final.t, estado?.estado === 'transcribiendo' || estado?.estado === 'grabando'])

  // Al terminar, las opciones y el texto son los que quedaron.
  useEffect(() => {
    if (!estado || trabajando(estado)) return
    setOpciones(estado.opciones)
    setTextos((estado.renglones ?? []).map(textoDe))
  }, [estado?.estado, estado?.t, url])

  if (!estado || !opciones) return null
  const ocupado = trabajando(estado)
  const otrasOpciones = (Object.keys(opciones) as (keyof OpcionesSubtitulos)[]).some((k) => opciones[k] !== estado.opciones[k])
  const textoCambiado = corrigiendo && textos.some((t, i) => estado.renglones?.[i] && t !== textoDe(estado.renglones[i]))
  const listo = estado.estado === 'listo'

  async function poner(conTexto: boolean) {
    setError('')
    try {
      setEstado(await api<TrabajoSubtitulos>(`/api/sessions/${sessionId}/subtitulos`, { ruta: final.ruta, opciones, ...(conTexto ? { textos } : {}) }))
      setCorrigiendo(false)
    } catch (e) {
      setError(mensaje(e))
    }
  }

  const base = final.nombre.replace(/\.mp4$/i, '')
  const archivo = (ruta: string, descarga: string) =>
    `/api/sessions/${sessionId}/archivo?ruta=${encodeURIComponent(ruta)}&t=${estado.t}&descarga=${encodeURIComponent(descarga)}`

  return (
    <div className="sub">
      <div className="sub-fila">
        <span className="sub-titulo">
          <Icono de="subtitulos" /> Subtítulos
        </span>
        {finales.length > 1 && (
          <Picker
            label={final.ruta.split('/').pop()}
            value={final.ruta}
            groups={[{ label: 'De qué video', options: finales.map((f) => ({ value: f.ruta, label: f.ruta.split('/').pop() ?? f.ruta })) }]}
            onChange={(r) => (setElegido(r), setCorrigiendo(false))}
          />
        )}
        {!ocupado && <Opciones valor={opciones} onCambio={setOpciones} />}
      </div>

      {!ocupado && (!listo || estado.desactualizado) && (
        <div className="sub-pie">
          {estado.estado === 'error' ? (
            <span className="bad small">{estado.aviso}</span>
          ) : estado.desactualizado ? (
            <span className="muted small">El video cambió después de ponerle subtítulos: los de abajo son del de antes.</span>
          ) : (
            estado.estado === 'nada' && <span className="muted small">Gratis: Sloth oye la voz en tu computadora, sin agente ni créditos. Por ahora, en español.</span>
          )}
          {(!listo || estado.desactualizado) && (
            <button className="final-boton principal" onClick={() => void poner(false)}>
              {estado.estado === 'error' ? 'Intentar otra vez' : listo ? 'Ponérselos de nuevo' : 'Ponerle subtítulos'}
            </button>
          )}
        </div>
      )}

      {ocupado && (
        <div className="sub-trabajando">
          <div className="working">
            <span className="spinner" /> {estado.aviso}
          </div>
          {estado.avance !== undefined && (
            <span className="arranque-barra">
              <span style={{ width: `${Math.round(estado.avance * 100)}%` }} />
            </span>
          )}
        </div>
      )}

      {listo && estado.video && estado.srt && (
        <div className="sub-listo">
          <video ref={reproductor} key={estado.t} src={archivo(estado.video, `${base} - subtítulos.mp4`)} controls playsInline preload="metadata" />
          <div className="sub-acciones">
            <a className="final-boton" href={archivo(estado.video, `${base} - subtítulos.mp4`)} download>
              <Icono de="descargar" /> Descargar con subtítulos
            </a>
            <a className="final-boton" href={archivo(estado.srt, `${base}.srt`)} download>
              <Icono de="descargar" /> Descargar el .srt
            </a>
            <button className={`final-boton${corrigiendo ? ' activa' : ''}`} onClick={() => setCorrigiendo(!corrigiendo)}>
              <Icono de="lapiz" /> Corregir el texto
            </button>
            {!estado.desactualizado && (otrasOpciones || textoCambiado) && (
              <button className="final-boton principal" onClick={() => void poner(textoCambiado)}>
                Volver a grabar
              </button>
            )}
          </div>
        </div>
      )}

      {corrigiendo && listo && estado.renglones && (
        <ol className="sub-renglones">
          {estado.renglones.map((r, i) => (
            <li key={i}>
              <button
                className="sub-tiempo"
                title="Ver este momento"
                onClick={() => {
                  if (reproductor.current) reproductor.current.currentTime = r.palabras[0].start
                }}
              >
                {reloj(r.palabras[0].start)}
              </button>
              <input
                value={textos[i] ?? ''}
                onFocus={() => {
                  if (reproductor.current?.paused) reproductor.current.currentTime = r.palabras[0].start
                }}
                onChange={(e) => setTextos(textos.map((t, k) => (k === i ? e.target.value : t)))}
              />
            </li>
          ))}
        </ol>
      )}
      {error && <span className="bad small">{error}</span>}
    </div>
  )
}
