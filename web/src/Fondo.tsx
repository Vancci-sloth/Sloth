import { useCallback, useEffect, useState } from 'react'
import type { FondoComunidad, MiFondo } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'
import { dinero } from './Tienda'
import './Fondo.css'

/**
 * «Fondo de la comunidad», arriba de la comunidad (`licencias/src/fondo.ts`): lo que se lleva la comunidad en este
 * periodo, la mitad de cada apoyo con tarjeta, en vivo (se vuelve a pedir cada minuto), con sus cuentas ya hechas: lo
 * cobrado, la comisión de Stripe, lo devuelto y el IVA, lo que queda y la mitad. Dice cuándo se reparte: el primer
 * reparto es el 1 de enero de 2027 y junta lo que entra desde el 15 de noviembre (`desde`; lo de antes no cuenta), para
 * que haya tiempo de prepararse.
 *
 * Participar es de quien quiera (`licencias/src/reparto.ts`): «¿Quieres participar?» abre el paso a paso (hacer un
 * estilo, compartirlo en Estilos, que otros lo usen y poner tu Binance ID, adonde se te paga). Quien ya participa ve
 * sus puntos, lo que lleva y sus partes de antes. Abajo, apoyar, que es lo que hace crecer el fondo.
 */
const PAGINA = 'https://sloth.vancci.org'
const dia = (iso: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' }).format(new Date(iso))

/** `onEstilos`: ir a la tienda de estilos (fuera de ella). */
export function Fondo({ onEstilos }: { onEstilos?(): void }) {
  const [fondo, setFondo] = useState<FondoComunidad | null>(null)
  const [mio, setMio] = useState<MiFondo | null>(null)
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(() => {
    void api<FondoComunidad>('/api/comunidad/fondo').then(setFondo, () => {})
    void api<MiFondo>('/api/comunidad/fondo/mio').then(setMio, () => {})
  }, [])
  useEffect(() => {
    cargar()
    const t = setInterval(() => document.visibilityState === 'visible' && cargar(), 60_000)
    return () => clearInterval(t)
  }, [cargar])

  if (!fondo) return null
  const dias = Math.max(1, Math.ceil((Date.parse(fondo.cierra) - Date.now()) / 86_400_000))
  const reparto = dia(fondo.cierra)
  const faltan = `Faltan ${dias} ${dias === 1 ? 'día' : 'días'}.`

  return (
    <section className="fondo" aria-labelledby="fondo-titulo">
      <p className="fondo-antetitulo">
        <Icono de="personas" /> Fondo de la comunidad · {fondo.primero ? 'primer reparto' : fondo.mes.replace(/ de \d+$/, '')}
        <span className="fondo-vivo">en vivo</span>
      </p>
      <h2 id="fondo-titulo">{fondo.primero ? 'Para el primer reparto, la comunidad lleva' : 'Este mes la comunidad se lleva'}</h2>
      <p className="fondo-monto">{fondo.montos.length ? fondo.montos.map(dinero).join(' + ') : '$0.00'}</p>
      <p className="fondo-texto">
        {fondo.primero ? (
          <>
            Es la mitad de lo que entra con tarjeta{fondo.desde && ` desde el ${dia(fondo.desde)}`}. <b>El primer reparto es el {reparto}</b>, entre quienes comparten estilos que la gente usa: tienes hasta
            entonces para hacer el tuyo, compartirlo y poner tu Binance ID. {faltan}
          </>
        ) : (
          <>
            Es la mitad de lo que entra con tarjeta, y se reparte el {reparto} entre quienes comparten estilos que la gente usa.{' '}
            {fondo.montos.length ? faltan : 'Aún va en cero: el primer apoyo con tarjeta lo arranca.'}
          </>
        )}
      </p>
      {fondo.cuentas.map((c) => (
        <dl key={c.moneda} className="fondo-cuentas" aria-label={`Las cuentas en ${c.moneda}`}>
          <div>
            <dt>Entró con tarjeta</dt>
            <dd>{dinero({ moneda: c.moneda, monto: c.cobrado })}</dd>
          </div>
          <div>
            <dt>Comisión de Stripe</dt>
            <dd>−{dinero({ moneda: c.moneda, monto: c.comision })}</dd>
          </div>
          {c.devuelto > 0 && (
            <div>
              <dt>Devuelto</dt>
              <dd>−{dinero({ moneda: c.moneda, monto: c.devuelto })}</dd>
            </div>
          )}
          <div>
            <dt>IVA</dt>
            <dd>−{dinero({ moneda: c.moneda, monto: c.impuesto })}</dd>
          </div>
          <div className="fondo-queda">
            <dt>Queda</dt>
            <dd>{dinero({ moneda: c.moneda, monto: c.neto })}</dd>
          </div>
          <div className="fondo-mitad">
            <dt>La mitad, para la comunidad</dt>
            <dd>{dinero({ moneda: c.moneda, monto: c.comunidad })}</dd>
          </div>
        </dl>
      ))}

      {mio && (mio.participa || mio.puntos > 0 || mio.partes.length > 0) && <Mio mio={mio} onCambio={setMio} />}

      {!abierto ? (
        !mio?.participa && (
          <div className="fondo-acciones">
            <button className="fondo-boton" onClick={() => setAbierto(true)}>
              ¿Quieres participar? <Icono de="flecha" />
            </button>
          </div>
        )
      ) : (
        <ol className="fondo-pasos">
          <li>
            <strong>Haz tu estilo</strong>
            <p>Con la card «Nuevo estilo»: cuéntale al agente cómo quieres tus videos, o dale unos de ejemplo.</p>
            <button className="small" onClick={() => (location.hash = '/new/nuevo-estilo')}>
              <Icono de="mas" /> Crear mi estilo
            </button>
          </li>
          <li>
            <strong>Compártelo en Estilos</strong>
            <p>En su card, «Compartir». Lo reviso y, en cuanto lo apruebo, lo ven y lo instalan quienes apoyan a Sloth.</p>
          </li>
          <li>
            <strong>Que la gente lo use</strong>
            <p>
              Ganas según cuánta gente usa tu estilo: 3 puntos cada persona distinta que termina un video con él, 1 cada video (hasta 10 por persona) y 10 cada variante que
              otra persona comparte a partir de él. Lo que haces tú con tu propio estilo no cuenta, y cada video lleva su portada de prueba, que reviso antes de pagar.
            </p>
            {onEstilos && (
              <button className="small" onClick={onEstilos}>
                <Icono de="claqueta" /> Ver cómo va cada estilo
              </button>
            )}
          </li>
          <li>
            <strong>Pon tu Binance ID y cobra</strong>
            <p>
              Participar es opcional: si quieres tu parte, pon tu Binance ID y ahí te llega al cerrar cada reparto. Con la mitad de los puntos, la mitad del fondo. Sin él, tu
              estilo sigue en la comunidad pero no se lleva nada.
            </p>
            {mio && !mio.participa && <Binance onListo={setMio} />}
          </li>
        </ol>
      )}

      <p className="fondo-apoyo">
        <Icono de="estrella" /> ¿Quieres que crezca? La mitad de tu apoyo con tarjeta va directo aquí.{' '}
        <button className="fondo-enlace" onClick={() => window.open(`${PAGINA}/#apoyar`, '_blank')}>
          Apoyar a Sloth
        </button>
      </p>
    </section>
  )
}

/** Lo tuyo: si participas y adónde se te paga, tus puntos y lo que llevas, y tus partes de los repartos ya cerrados. */
function Mio({ mio, onCambio }: { mio: MiFondo; onCambio(m: MiFondo): void }) {
  const [cambiando, setCambiando] = useState(false)
  const [error, setError] = useState('')
  const llevas = mio.estimado.length ? mio.estimado.map(dinero).join(' + ') : ''
  return (
    <div className="fondo-mio">
      <strong>
        {mio.participa ? 'Participas en el fondo' : 'Aún no participas en el fondo'}
        {mio.binance && <span> · tu parte va al Binance ID {mio.binance}</span>}
      </strong>
      <span>
        Tus estilos llevan {mio.puntos.toLocaleString('es-MX')} {mio.puntos === 1 ? 'punto' : 'puntos'} en este reparto
        {llevas && (mio.participa ? `: ≈ ${llevas} si cerrara hoy.` : `: te llevarías ≈ ${llevas} si participaras.`)}
        {!llevas && '.'}
      </span>
      {mio.partes.map((p) => (
        <span key={p.periodo} className="fondo-parte">
          {p.mes}: {p.montos.length ? p.montos.map(dinero).join(' + ') : '$0.00'} · {p.pagado ? `pagado el ${dia(p.pagado)}` : 'por pagar'}
        </span>
      ))}
      {!mio.participa || cambiando ? (
        <Binance onListo={(m) => (setCambiando(false), onCambio(m))} onCancelar={cambiando ? () => setCambiando(false) : undefined} />
      ) : (
        <span className="fondo-mio-acciones">
          <button className="fondo-enlace" onClick={() => setCambiando(true)}>
            Cambiar mi Binance ID
          </button>
          <button
            className="fondo-enlace"
            title="Tus estilos siguen en la comunidad, pero ya no se llevan del fondo. Lo de los repartos ya cerrados se te paga igual."
            onClick={() => (setError(''), void api<MiFondo>('/api/comunidad/fondo/salir', {}).then(onCambio, (e: Error) => setError(e.message)))}
          >
            Dejar de participar
          </button>
        </span>
      )}
      {error && <span className="fondo-error">{error}</span>}
    </div>
  )
}

/** Poner o cambiar tu Binance ID: adonde se te paga tu parte. Solo lo ven tú y el creador de Sloth. */
function Binance({ onListo, onCancelar }: { onListo(m: MiFondo): void; onCancelar?(): void }) {
  const [valor, setValor] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  async function guardar() {
    if (!valor.trim() || ocupado) return
    setOcupado(true)
    setError('')
    try {
      onListo(await api<MiFondo>('/api/comunidad/fondo/participar', { binance: valor }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div className="fondo-binance">
      <label>
        <span>Tu Binance ID</span>
        <input
          value={valor}
          inputMode="numeric"
          maxLength={14}
          placeholder="El número de tu cuenta de Binance"
          onChange={(e) => setValor(e.target.value.replace(/[^\d\s-]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && void guardar()}
        />
      </label>
      <button className="small" disabled={!valor.trim() || ocupado} onClick={() => void guardar()}>
        {ocupado ? 'Guardando…' : 'Participar'}
      </button>
      {onCancelar && (
        <button className="fondo-enlace" onClick={onCancelar}>
          Cancelar
        </button>
      )}
      <p>Está en Binance, en tu perfil. Solo lo ven tú y el creador de Sloth, y cada cambio te llega por correo.</p>
      {error && <p className="fondo-error">{error}</p>}
    </div>
  )
}
