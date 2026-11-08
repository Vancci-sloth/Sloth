import { useCallback, useEffect, useState } from 'react'
import type { RifaComunidad } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'
import './Rifa.css'

/**
 * «Participa en la rifa», hasta arriba de la comunidad mientras el creador tiene una abierta (`licencias/src/rifa.ts`):
 * «Llévate créditos de Sloth» (qué y para cuántos lo decide el creador en cada sorteo), cuántos participan, quién ya
 * ganó y un solo botón. La rifa sigue abierta entre sorteos: quien participa entra en todos hasta que gana una vez. Al pulsarlo queda claro que ya estás dentro y adónde llega el aviso
 * si ganas. Quien ya tiene los créditos de cada mes (paga $15 USD o más) o es Fundador la ve, con por qué no participa.
 * Cerrada, durante unos días, quién ganó qué. Al creador le lleva a Administrador, donde se sortea (`RifaAdmin.tsx`).
 */
export const RIFA_CAMBIO = 'sloth-rifa'

export function Rifa({ creador, conNombre }: { creador: boolean; conNombre(accion: () => void): void }) {
  const [rifa, setRifa] = useState<RifaComunidad | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  // Recién entraste: el boleto entra con su sello, una vez.
  const [recien, setRecien] = useState(false)

  const cargar = useCallback(() => void api<RifaComunidad>('/api/comunidad/rifa').then(setRifa, () => {}), [])
  useEffect(() => {
    cargar()
    const t = setInterval(() => document.visibilityState === 'visible' && cargar(), 60_000)
    addEventListener(RIFA_CAMBIO, cargar)
    return () => (clearInterval(t), removeEventListener(RIFA_CAMBIO, cargar))
  }, [cargar])
  // Lo que ganaste sale a toda la pantalla (`GanasteRifa.tsx`): que la app lo pida ya, sin esperar su vuelta.
  useEffect(() => void (rifa?.gane && dispatchEvent(new Event('sloth-comunidad-avisos'))), [rifa?.gane?.rifa])

  function participar() {
    conNombre(() => {
      setOcupado(true)
      setError('')
      api<RifaComunidad>('/api/comunidad/rifa/participar', {})
        .then((r) => (setRifa(r), setRecien(true)), (e: Error) => setError(e.message))
        .finally(() => setOcupado(false))
    })
  }

  if (!rifa) return null
  const a = rifa.abierta
  if (!a) {
    if (!rifa.ultima) return null
    const u = rifa.ultima
    return (
      <section className="rifa-ultima">
        <Icono de="regalo" />
        <p>
          <strong>Terminó la rifa.</strong> {u.ganadores.length > 1 ? 'Ganaron' : 'Ganó'}{' '}
          {u.ganadores.map((g, i) => (
            <span key={i}>
              {i ? (i === u.ganadores.length - 1 ? ' y ' : ', ') : ''}
              <strong>{g.nombre}</strong> ({g.premio})
            </span>
          ))}
          .{rifa.gane && <span className="rifa-tu"> ¡Ganaste tú!</span>}
        </p>
      </section>
    )
  }

  const personas = `${a.participantes.toLocaleString('es-MX')} ${a.participantes === 1 ? 'persona participa' : 'personas participan'}`
  return (
    <section className={`rifa${rifa.participo ? ' dentro' : ''}`} aria-labelledby="rifa-titulo">
      <Boletos />
      <div className="rifa-cuerpo">
        <p className="rifa-antetitulo">
          <Icono de="boleto" /> Rifa de Sloth · gratis
        </p>
        <h2 id="rifa-titulo">Participa en la rifa</h2>
        <p className="rifa-premio">Llévate créditos de Sloth</p>
        <p className="rifa-texto">Completamente gratis: solo pulsa el botón y ya estás participando.</p>

        {rifa.ganaste ? (
          <div className="rifa-dentro" role="status">
            <span className="rifa-sello">
              <Icono de="regalo" />
            </span>
            <div>
              <strong>¡Ganaste en esta rifa!</strong>
              <p>
                Te llevaste <b>{rifa.ganaste}</b>. Te llegó el aviso aquí y un correo. En esta rifa ya no vuelves a entrar a los
                siguientes sorteos: le toca a alguien más.
              </p>
            </div>
          </div>
        ) : rifa.participo ? (
          <div className={`rifa-dentro${recien ? ' recien' : ''}`} role="status">
            <span className="rifa-sello">
              <Icono de="palomita" />
            </span>
            <div>
              <strong>¡Ya estás participando!</strong>
              <p>
                Tu boleto ya está adentro y no tienes que hacer nada más: entras en todos los sorteos de esta rifa. Si ganas, te sale el aviso aquí en tu Sloth y te llega un correo
                {rifa.correo ? (
                  <>
                    {' '}
                    a <b>{rifa.correo}</b>
                  </>
                ) : null}
                .
              </p>
            </div>
          </div>
        ) : creador ? (
          <div className="rifa-acciones">
            <button className="rifa-boton" onClick={() => (location.hash = '/admin')}>
              Sortearla en Administrador <Icono de="flecha" />
            </button>
          </div>
        ) : rifa.fuera ? (
          <p className="rifa-fuera">{rifa.fuera}</p>
        ) : (
          <div className="rifa-acciones">
            <button className="rifa-boton" disabled={ocupado} onClick={participar}>
              <Icono de="boleto" /> {ocupado ? 'Entrando…' : 'Participar gratis'}
            </button>
          </div>
        )}
        {error && <p className="rifa-error">{error}</p>}
        <p className="rifa-cuenta">
          <Icono de="personas" /> {personas}
          {a.ganadores.length > 0 && (
            <>
              {' · '}
              <Icono de="regalo" /> Ya {a.ganadores.length > 1 ? 'ganaron' : 'ganó'} {a.ganadores.join(', ')}
            </>
          )}
        </p>
      </div>
    </section>
  )
}

/** Los boletos de adorno, a la derecha: dos de trazo, uno encima del otro, con su estrella. */
function Boletos() {
  const boleto = 'M8 4h104a6 6 0 0 1 6 6v14a10 10 0 0 0 0 20v14a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V44a10 10 0 0 0 0-20V10a6 6 0 0 1 6-6z'
  return (
    <svg className="rifa-boletos" viewBox="0 0 200 160" aria-hidden="true">
      <g transform="translate(70 18) rotate(14 60 34)" className="rifa-boleto atras">
        <path d={boleto} />
        <path d="M84 8v60" strokeDasharray="4 6" />
      </g>
      <g transform="translate(24 62) rotate(-10 60 34)" className="rifa-boleto">
        <path d={boleto} />
        <path d="M84 8v60" strokeDasharray="4 6" />
        <path className="rifa-estrella" d="M42 18l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8L42 45.1l-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7z" />
      </g>
    </svg>
  )
}
