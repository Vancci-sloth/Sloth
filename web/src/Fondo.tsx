import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { FondoComunidad, MiFondo, TiendaEstilos } from '../../shared/types'
import { api } from './api'
import { avanceDe, diasPara, guardarVisto, leerVisto, noticiaDe, subioDe, vistoDe } from './fondoNoticia'
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
 * Casi siempre es un renglón: el monto sobre la raya del reparto, que va del día en que empieza a contar al día en que
 * se reparte, y lo que subió desde que lo abriste. Un clic lo abre entero. Sale en grande solo cuando trae noticia
 * (`fondoNoticia.ts`: la primera vez de cada reparto, un salto del monto, los últimos días) y al cerrarlo vuelve al
 * renglón.
 *
 * Participar es de quien quiera (`licencias/src/reparto.ts`): «¿Quieres participar?» abre el paso a paso (hacer un
 * estilo, compartirlo en Estilos, que otros lo usen y poner tu Binance ID, adonde se te paga). Quien ya participa ve
 * sus puntos, lo que lleva y sus partes de antes. «Cómo se cuentan los puntos» enseña las reglas del reparto, con lo que
 * vale cada cosa (lo dice la tienda, `reglas`). Abajo, apoyar, que es lo que hace crecer el fondo.
 */
const PAGINA = 'https://sloth.vancci.org'
const dia = (iso: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' }).format(new Date(iso))
/** «15 nov», para los extremos de la raya. */
const diaCorto = (iso: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' }).format(new Date(iso)).replace('.', '')

/** `onEstilos`: ir a la tienda de estilos (fuera de ella). */
export function Fondo({ onEstilos }: { onEstilos?(): void }) {
  const [fondo, setFondo] = useState<FondoComunidad | null>(null)
  const [mio, setMio] = useState<MiFondo | null>(null)
  const [pasos, setPasos] = useState(false)
  const [reglas, setReglas] = useState(false)
  // Lo que viste la última vez que cerraste el recuadro, y si ahora va en grande: hasta que lo abres o lo cierras, lo
  // decide si hay noticia al entrar (no a media visita, que sería abrirse solo mientras lees otra cosa).
  const [visto, setVisto] = useState(leerVisto)
  const [grande, setGrande] = useState<boolean | null>(null)
  const alEntrar = useRef<boolean | null>(null)

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
  const ahora = Date.now()
  alEntrar.current ??= !!noticiaDe(fondo, visto, ahora)
  const dias = diasPara(fondo, ahora)
  const reparto = dia(fondo.cierra)
  const faltan = `Faltan ${dias} ${dias === 1 ? 'día' : 'días'}.`
  const monto = fondo.montos.length ? fondo.montos.map(dinero).join(' + ') : '$0.00'
  const subio = subioDe(fondo, visto)
    .map((m) => `+${dinero(m)}`)
    .join(' ')

  function cerrar() {
    if (!fondo) return
    const v = vistoDe(fondo, Date.now())
    guardarVisto(v)
    setVisto(v)
    setGrande(false)
    setPasos(false)
    setReglas(false)
  }

  if (!(grande ?? alEntrar.current))
    return (
      <button className="fondo-renglon" aria-expanded={false} title="El fondo de la comunidad: ver sus cuentas y cómo participar" onClick={() => setGrande(true)}>
        {/* Solo «Fondo»: lo que quepa de más es de la raya. */}
        <span className="fondo-renglon-nombre">
          <Icono de="personas" /> <span>Fondo</span>
        </span>
        <Via fondo={fondo} ahora={ahora}>
          <b className="fondo-renglon-monto">{monto}</b>
          {subio && (
            <span className="fondo-subio" title="Lo que subió desde la última vez que lo abriste">
              {subio}
            </span>
          )}
        </Via>
        <span className="fondo-renglon-faltan">{faltan.replace('.', '').toLowerCase()}</span>
        <Icono de="siguiente" />
      </button>
    )

  return (
    <section className="fondo" aria-labelledby="fondo-titulo">
      <p className="fondo-antetitulo">
        <Icono de="personas" /> Fondo de la comunidad · {fondo.primero ? 'primer reparto' : fondo.mes.replace(/ de \d+$/, '')}
        <span className="fondo-vivo">en vivo</span>
        <button className="fondo-cerrar" title="Dejarlo en un renglón" aria-label="Cerrar el fondo" onClick={cerrar}>
          <Icono de="cerrar" />
        </button>
      </p>
      <h2 id="fondo-titulo">{fondo.primero ? 'Para el primer reparto, la comunidad lleva' : 'Este mes la comunidad se lleva'}</h2>
      <p className="fondo-monto">{monto}</p>
      {subio && <p className="fondo-noticia">{subio} desde la última vez que lo viste</p>}
      <Via fondo={fondo} ahora={ahora} />
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

      <div className="fondo-acciones">
        {!pasos && !mio?.participa && (
          <button className="fondo-boton" onClick={() => setPasos(true)}>
            ¿Quieres participar? <Icono de="flecha" />
          </button>
        )}
        <button className="fondo-reglas-boton" aria-expanded={reglas} onClick={() => setReglas(!reglas)}>
          <Icono de="pregunta" /> Cómo se cuentan los puntos
        </button>
      </div>
      {reglas && <Reglas />}
      {pasos && (
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
        <button className="fondo-enlace" onClick={() => window.open(`${PAGINA}/#pago`, '_blank')}>
          Apoyar a Sloth
        </button>
      </p>
    </section>
  )
}

/**
 * Las reglas del reparto: cuánto suma cada cosa y qué no cuenta. Lo que vale cada una lo dice la tienda (`reglas` en
 * `/api/comunidad/estilos`): se pide al abrirlas, no antes.
 */
function Reglas() {
  const [r, setR] = useState<TiendaEstilos['reglas'] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<TiendaEstilos>('/api/comunidad/estilos').then(
      (t) => setR(t.reglas),
      (e: Error) => setError(e.message)
    )
  }, [])
  if (error) return <p className="fondo-error">{error}</p>
  if (!r) return <p className="fondo-reglas">Cargando…</p>
  return (
    <div className="fondo-reglas">
      <p>
        En cada reparto, cada estilo suma <b>{r.persona} puntos</b> por cada persona distinta que termina un video con él, <b>{r.video} punto</b> por cada video (hasta {r.tope}{' '}
        por persona) y <b>{r.variante} puntos</b> por cada variante que otra persona comparte en la comunidad a partir de él. El fondo se reparte según los puntos entre
        quienes pusieron su Binance ID: un estilo con la mitad de los puntos se lleva la mitad del fondo. Participar es opcional.
      </p>
      <p>
        Para que sea justo con todos: lo que haces con tu propio estilo no cuenta, ni desde tus otras cuentas; varias computadoras en la misma conexión son una persona; una
        cuenta suma videos si apoya a Sloth y después de sus primeros {r.dias} días, y cada video manda su portada como prueba, que solo ve el creador de Sloth y revisa antes
        de pagar. Del video no sale nada más. Las descargas y los me gusta se ven, pero no dan puntos.
      </p>
    </div>
  )
}

/**
 * La raya del reparto: de cuándo empieza a contar a cuándo se reparte, llena hasta hoy. Sobre el día de hoy va lo que le
 * pongan (en el renglón, el monto); sin nada, un punto.
 */
function Via({ fondo, ahora, children }: { fondo: FondoComunidad; ahora: number; children?: ReactNode }) {
  const { desde, avance } = avanceDe(fondo, ahora)
  return (
    <span className="fondo-via">
      <span>{diaCorto(desde)}</span>
      <i className="fondo-via-hecho" style={{ flexGrow: avance }} />
      {children ?? <i className="fondo-via-hoy" />}
      <i className="fondo-via-falta" style={{ flexGrow: 100 - avance }} />
      <span>{diaCorto(fondo.cierra)}</span>
    </span>
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
