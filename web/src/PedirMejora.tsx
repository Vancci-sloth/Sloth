import { useEffect, useState } from 'react'
import type { OrigenMejora, PublicacionComunidad, SessionMeta } from '../../shared/types'
import { api } from './api'
import { abrirPublicacion } from './Comunidad'
import { Escribir } from './Escribir'
import { MEJORA_EVENT } from './etiquetas'
import { Icono } from './Iconos'
import { MarcaClaude } from './Logos'
import './PedirMejora.css'

/**
 * «Pedir una mejora», desde cualquier hilo: el símbolo de Claude del encabezado, el que sale junto a «Citar» y el de cada
 * error lo abren (`pedirMejora` de etiquetas.ts) con el hilo y lo que pasó. Escribes lo que debería ser distinto, como te
 * salga, y «Ayúdame a decirlo» le pide a Claude que lo entienda con lo que pasaba en el hilo. Se publica en Mejoras de la
 * comunidad, donde todos la ven; el hilo de donde salió no se publica (se queda en esta computadora, `server/comunidad.ts`).
 * Un aviso lleva a ella.
 */
export function PedirMejora({ sessions }: { sessions: SessionMeta[] }) {
  const [origen, setOrigen] = useState<OrigenMejora | null>(null)
  const [anotada, setAnotada] = useState<PublicacionComunidad | null>(null)

  useEffect(() => {
    const abrir = (e: Event) => {
      const { hilo, cita } = (e as CustomEvent<{ hilo: string; cita?: string }>).detail
      setOrigen({ hilo, titulo: sessions.find((s) => s.id === hilo)?.title ?? '', ...(cita?.trim() ? { cita: cita.trim() } : {}) })
    }
    addEventListener(MEJORA_EVENT, abrir)
    return () => removeEventListener(MEJORA_EVENT, abrir)
  }, [sessions])
  useEffect(() => {
    if (!origen) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setOrigen(null)
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  }, [origen])
  useEffect(() => {
    if (!anotada) return
    const t = setTimeout(() => setAnotada(null), 6000)
    return () => clearTimeout(t)
  }, [anotada])

  return (
    <>
      {origen && (
        <div className="pm-velo" onMouseDown={(e) => e.target === e.currentTarget && setOrigen(null)}>
          <div className="pm-caja" role="dialog" aria-modal="true" aria-labelledby="pm-titulo">
            <header className="pm-cabeza">
              <span className="pm-marca">
                <MarcaClaude />
              </span>
              <div>
                <h2 id="pm-titulo">Pedir una mejora</h2>
                <p>Dilo como te salga: se publica en Mejoras de la comunidad, sin este hilo. Si no sabes cómo decirlo, Claude te ayuda con lo que pasó aquí.</p>
              </div>
              <button className="pm-cerrar" title="Cerrar (Esc)" onClick={() => setOrigen(null)}>
                <Icono de="cerrar" />
              </button>
            </header>
            <div className="pm-desde">
              <div className="pm-desde-titulo">
                <Icono de="hilo" /> Desde «{origen.titulo || 'este hilo'}»
              </div>
              {origen.cita && <blockquote>{origen.cita}</blockquote>}
            </div>
            <Escribir
              key={`${origen.hilo}:${origen.cita ?? ''}`}
              compacto
              placeholder="¿Qué debería ser distinto? Dilo como te salga."
              accion="Publicar mejora"
              autoFocus
              ayuda
              origen={origen}
              onListo={async ({ texto, adjuntos }) => {
                const m = await api<PublicacionComunidad>('/api/mejoras', { texto, adjuntos, origen })
                setOrigen(null)
                setAnotada(m)
              }}
              onCancelar={() => setOrigen(null)}
            />
          </div>
        </div>
      )}
      {anotada && (
        <div className="pm-aviso" role="status">
          <Icono de="palomita" /> Publicada en Mejoras
          <button onClick={() => (setAnotada(null), abrirPublicacion(anotada.id))}>Verla</button>
        </div>
      )}
    </>
  )
}
