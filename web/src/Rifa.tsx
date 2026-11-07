import { useCallback, useEffect, useState } from 'react'
import type { RifaComunidad } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'
import './Rifa.css'

/**
 * «Participa en la rifa», hasta arriba de la comunidad mientras el creador tiene una abierta (`licencias/src/rifa.ts`):
 * qué se rifa, cuántos participan y un solo botón. Al pulsarlo queda claro que ya estás dentro y adónde llega el aviso
 * si ganas. Quien ya tiene los créditos de cada mes (paga $15 USD o más) o es Fundador la ve, con por qué no participa. Sin rifa abierta, durante unos días, quién ganó
 * la última. Al creador le lleva a Administrador, donde se sortea (`RifaAdmin.tsx`).
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
          <strong>Ya se sorteó la rifa:</strong> {u.premio}. {u.ganadores.length > 1 ? 'Ganaron' : 'Ganó'} <strong>{u.ganadores.join(', ')}</strong>.
          {rifa.gane && <span className="rifa-tu"> ¡Ganaste tú!</span>}
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
        <p className="rifa-premio">{a.premio}</p>
        <p className="rifa-texto">
          {a.creditos > 0 ? 'Te puedes llevar créditos de Sloth completamente gratis' : 'Te lo puedes llevar completamente gratis'}: solo pulsa el botón y ya estás participando.
          {a.ganadores > 1 && ` Ganan ${a.ganadores} personas.`}
        </p>

        {rifa.participo ? (
          <div className={`rifa-dentro${recien ? ' recien' : ''}`} role="status">
            <span className="rifa-sello">
              <Icono de="palomita" />
            </span>
            <div>
              <strong>¡Ya estás participando!</strong>
              <p>
                Tu boleto ya está adentro y no tienes que hacer nada más. Si ganas, te sale el aviso aquí en tu Sloth y te llega un correo
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
