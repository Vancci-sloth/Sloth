import { type ReactNode, useEffect, useState } from 'react'
import type { Equipo } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import { Icono, type NombreIcono } from './Iconos'

/** «unos 40 s», «unos 3 min». */
const tiempo = (s: number) => (s < 90 ? `unos ${Math.max(5, Math.round(s / 5) * 5)} s` : `unos ${Math.round(s / 60)} min`)

const motor = (e: Equipo) =>
  e.motor === 'whisper'
    ? e.nvidia
      ? 'Con Whisper, en tu tarjeta NVIDIA'
      : 'Con Whisper, en el procesador (lento)'
    : e.motor === 'parakeet'
      ? 'Con Parakeet, en el procesador'
      : 'Con Parakeet, en el procesador (sin afinar los tiempos)'

const POR_QUE =
  'Tu computadora no tiene una tarjeta NVIDIA que aguante Whisper, así que hoy transcribe tu voz en el procesador, lento. Con Parakeet lo hace unas cinco veces más rápido, con el mismo tiempo para cada palabra. Se baja una vez (unos 670 MB) y puedes seguir trabajando mientras.'

/** Lo que lee el aviso y la tarjeta, con la mejora en curso mirada cada tres segundos. */
function useEquipo() {
  const [e, setE] = useState<Equipo>()
  const [error, setError] = useState('')
  const leer = () => api<Equipo>('/api/equipo').then(setE, (x) => setError(x.message))
  useEffect(() => void leer(), [])
  // Mientras mide (unos 30 s) o baja la mejora.
  const trabajando = !!e?.midiendo || !!e?.mejora?.estado
  useEffect(() => {
    if (!trabajando) return
    const id = setInterval(leer, 3000)
    return () => clearInterval(id)
  }, [trabajando])
  const mejorar = () => api<Equipo>('/api/equipo/mejorar', {}).then(setE)
  return { e, setE, error, setError, mejorar }
}

/**
 * Arriba del hilo nuevo, junto a «Actualizar Claude Code»: si esta computadora puede ir más rápido (Parakeet, en una sin
 * NVIDIA que aún transcribe con Whisper), lo dice y lo baja con un clic. Mientras baja, en qué va.
 */
export function AvisoEquipo() {
  const { e, mejorar } = useEquipo()
  const [preguntar, setPreguntar] = useState(false)
  if (!e?.mejora) return null
  if (e.mejora.estado) return <span className="aviso-version quieto">{e.mejora.paso ?? 'Acelerando tu equipo…'}</span>
  return (
    <>
      <button className="aviso-version" title={e.mejora.error ? `La última vez falló: ${e.mejora.error}` : 'Transcribir tu voz unas cinco veces más rápido'} onClick={() => setPreguntar(true)}>
        ↑ Acelerar Sloth en tu equipo
      </button>
      {preguntar && (
        <Confirm title="¿Acelerar Sloth en tu equipo?" action="Acelerar" onConfirm={mejorar} onClose={() => setPreguntar(false)}>
          {POR_QUE}
          {e.mejora.error && <span className="bad small fila-extra">La última vez falló: {e.mejora.error}</span>}
        </Confirm>
      )}
    </>
  )
}

/**
 * Opciones → Tu equipo (`server/equipo.ts`): qué tiene esta computadora, cómo trabaja Sloth en ella (lo elige solo) y
 * cuánto tarda cada cosa aquí, de lo que ya midió.
 */
export function TuEquipo() {
  const { e, setE, error, setError, mejorar } = useEquipo()

  function medir() {
    setError('')
    api<Equipo>('/api/equipo/medir', {}).then(setE, (x) => setError(x.message))
  }

  const voz = !e?.motor
    ? 'Falta el Python de Sloth: descárgalo en Herramientas de video.'
    : e.midiendo
      ? 'Midiendo cuánto tarda aquí… (unos 30 s)'
      : e.voz
        ? `10 min de voz se transcriben en ${tiempo(e.voz.carga + e.voz.veces * 600)}.`
        : e.error
          ? `No se pudo medir: ${e.error}`
          : 'Se mide la primera vez que transcribas una voz.'

  return (
    <section className="grupo">
      <div className="grupo-titulo">
        <h2>Tu equipo</h2>
        {e?.motor?.startsWith('parakeet') && !e.midiendo && (
          <button className="ghost small" onClick={medir}>
            Medir otra vez
          </button>
        )}
      </div>
      <div className="panel">
        {!e ? (
          <div className="item fila muted small">{error || 'Mirando tu equipo…'}</div>
        ) : (
          <>
            <Fila icono="ajustar" nombre={e.procesador || 'Procesador'} detalle={[`${e.hilos} hilos`, `${Math.round(e.memoria / 2 ** 30)} GB de memoria`, e.tarjeta].filter(Boolean).join(' · ')} />
            <Fila icono="sonido" nombre={e.motor ? motor(e) : 'Tu voz'} detalle={voz}>
              {e.mejora &&
                (e.mejora.estado ? (
                  <span className="estado">{e.mejora.paso ?? 'Acelerando…'}</span>
                ) : (
                  <button className="primary" title={POR_QUE} onClick={() => mejorar().catch((x) => setError(x.message))}>
                    Acelerar
                  </button>
                ))}
            </Fila>
            <Fila
              icono="video"
              nombre="El render"
              detalle={[
                e.tresD?.software && 'El 3D se dibuja sin tu tarjeta de video, por software, y va muy lento: actualiza su controlador.',
                e.render ? `Un minuto de video sale en ${tiempo(1800 / e.render.cuadros)}.` : 'Se mide en el primer video que termines.'
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <Fila icono="claqueta" nombre={`${e.aLaVez === 1 ? 'Un video' : `${e.aLaVez} videos`} a la vez`} detalle="En un lote: uno por cada 3 hilos del procesador y cada 4 GB de memoria." />
          </>
        )}
      </div>
      {e && error && <p className="bad small fila-extra">{error}</p>}
      <p className="grupo-nota">Sloth elige solo cómo trabajar en esta computadora. Los tiempos salen de lo que ya hizo aquí, y los scripts los usan para decirte cuánto falta.</p>
    </section>
  )
}

function Fila({ icono, nombre, detalle, children }: { icono: NombreIcono; nombre: string; detalle: string; children?: ReactNode }) {
  return (
    <div className="item">
      <div className="fila">
        <span className="logo" aria-hidden>
          <Icono de={icono} />
        </span>
        <div className="fila-nombre">
          <strong>{nombre}</strong>
          <span>{detalle}</span>
        </div>
        {children}
      </div>
    </div>
  )
}
