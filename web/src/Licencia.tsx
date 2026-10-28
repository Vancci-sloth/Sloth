import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Licencia } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import './Licencia.css'

const pesos = (n: number) => `$${n.toLocaleString('es-MX')}`
const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
/** La página de Sloth: ahí se apoya, y tiene los términos y el aviso de privacidad. */
const PAGINA = 'https://sloth.vancci.org'
/** La versión de los términos que acepta quien crea su cuenta: la de `TERMINOS` en la página. */
const TERMINOS = '2026-10-28'
/** Cada cuántos inicios sale el recordatorio a quien no apoya. */
const CADA = 10
const INICIOS = 'sloth:inicios'

/** Si la clave quita el recordatorio: un apoyo vigente o un lugar gratis de por vida (de cuando Sloth se vendía). */
const apoya = (l?: Licencia) => !!l?.activa && l.plan !== 'cuenta'
const apoyar = () => window.open(`${PAGINA}/#apoyar`, '_blank')

/**
 * Sloth es gratis (`server/licencia.ts`). Cada `CADA` inicios, a quien no apoya le recuerda que puede hacerlo, sin
 * bloquear nada: «Recordarme más tarde» vuelve a contar desde cero. Un inicio es una ventana nueva (`sessionStorage`).
 */
export function Recordatorio() {
  const [licencia, setLicencia] = useState<Licencia>()
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(INICIOS)) return
    sessionStorage.setItem(INICIOS, '1')
    const inicios = Number(localStorage.getItem(INICIOS) ?? 0) + 1
    localStorage.setItem(INICIOS, String(inicios))
    if (inicios < CADA) return
    // Sin conexión con el cobro, no se sabe si apoya: no se le molesta.
    api<Licencia>('/api/licencia').then((l) => (setLicencia(l), setAbierto(!apoya(l) && !l.error)), () => {})
  }, [])

  function luego() {
    localStorage.setItem(INICIOS, '0')
    setAbierto(false)
  }

  if (!abierto || !licencia) return null
  return createPortal(
    <div className="modal-backdrop" onClick={luego}>
      <div className="modal licencia-caja" role="dialog" aria-modal aria-label="Apoya a Sloth" onClick={(e) => e.stopPropagation()}>
        {clave ? (
          <Clave licencia={licencia} onCambio={(l) => (setLicencia(l), apoya(l) && setAbierto(false))} onVolver={() => setClave(false)} />
        ) : (
          <>
            <Cabeza titulo="Sloth es gratis">
              La hace una sola persona. Si te sirve, <b>apóyala al mes</b>: quien apoya recibe lo nuevo antes y decide qué sale
              primero. Mira lo que viene en sloth.vancci.org.
            </Cabeza>
            <div className="licencia-pie">
              <button className="primary" autoFocus onClick={() => (apoyar(), luego())}>
                Apoyar
              </button>
              <button className="ghost" onClick={() => setClave(true)}>
                Ya apoyo
              </button>
              <button className="ghost" onClick={luego}>
                Recordarme más tarde
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

/** Pegar la clave del apoyo, la de otra computadora o la de antes de reinstalar. */
function Clave({ licencia, onCambio, onVolver }: { licencia: Licencia; onCambio(l: Licencia): void; onVolver(): void }) {
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function usarClave(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true)
    setError('')
    try {
      const l = await api<Licencia>('/api/licencia/clave', { clave })
      if (!l.activa) setError(l.estado === 'pending' ? 'Todavía no se confirma el pago de esa clave.' : 'Ese apoyo ya terminó. Puedes renovarlo en sloth.vancci.org.')
      onCambio(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <Cabeza titulo="Escribe tu clave">
        <b>Te llegó a tu correo</b> al apoyar en sloth.vancci.org, en «Tu clave de Sloth» (si no lo ves, revisa spam o promociones).
        {licencia.plan === 'cuenta' && ' Tu cuenta de la comunidad se queda: es la misma con tu correo.'}
      </Cabeza>
      <form onSubmit={usarClave}>
        <label>
          Tu clave
          <input className="mono" autoFocus placeholder="SLOTH-XXXX-XXXX-XXXX-XXXX" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <span className="muted small">Sirve en dos computadoras a la vez. Si ya la usas en otra, también está en sus Opciones.</span>
        {error && <p className="bad small">{error}</p>}
        <div className="licencia-pie">
          <button className="primary" disabled={ocupado || !clave.trim()}>
            {ocupado ? 'Revisando…' : 'Usar clave'}
          </button>
          <button type="button" className="ghost" onClick={onVolver}>
            Volver
          </button>
        </div>
        <Privacidad />
      </form>
    </>
  )
}

/** La cuenta gratis, para entrar a la comunidad (`Comunidad.tsx`). */
export function Unirse({ onListo }: { onListo(): void }) {
  const [email, setEmail] = useState('')
  const [acepto, setAcepto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function unirse(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true)
    setError('')
    try {
      await api<Licencia>('/api/licencia/unirse', { email, terminos: TERMINOS })
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  return (
    <div className="licencia-caja licencia-unirse">
      <Cabeza titulo="Entra a la comunidad">
        Mira qué hace la gente con Sloth y cómo, y enseña lo tuyo. Crea tu cuenta gratis con tu correo: ahí te llega tu clave.
      </Cabeza>
      <form onSubmit={unirse}>
        <label>
          Tu correo
          <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="licencia-acepto">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          <span>
            Soy mayor de 18 años y acepto los{' '}
            <a href={`${PAGINA}/terminos`} target="_blank" rel="noreferrer">
              términos y condiciones
            </a>
            .
          </span>
        </label>
        {error && <p className="bad small">{error}</p>}
        <div className="licencia-pie">
          <button className="primary" disabled={ocupado || !email.trim() || !acepto}>
            {ocupado ? 'Creando…' : 'Crear mi cuenta'}
          </button>
        </div>
        <Privacidad />
      </form>
    </div>
  )
}

function Privacidad() {
  // Quién es el responsable, su domicilio y su correo están en el aviso completo: aquí no se enseñan.
  return (
    <span className="muted small licencia-privacidad">
      Tu correo, tu clave y un identificador de esta computadora solo sirven para tu cuenta, tu apoyo y darte soporte; nunca para
      publicidad. Todo en el{' '}
      <a href={`${PAGINA}/privacidad`} target="_blank" rel="noreferrer">
        aviso de privacidad
      </a>
      .
    </span>
  )
}

function Cabeza({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <header>
      <img src="/icon.svg" alt="" />
      <div>
        <h1>{titulo}</h1>
        <p>{children}</p>
      </div>
    </header>
  )
}

/**
 * En Opciones: el apoyo (o la cuenta gratis, o el lugar gratis), el próximo cobro, la clave, cambiar la tarjeta (con
 * Stripe), renovar (un año pagado de una vez) y cancelar.
 */
export function SuscripcionOpciones() {
  const [l, setL] = useState<Licencia>()
  const [error, setError] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [copiada, setCopiada] = useState(false)
  const [clave, setClave] = useState(false)

  useEffect(() => {
    api<Licencia>('/api/licencia?fresco').then(setL, (e) => setError(e.message))
  }, [])

  if (!l) return <div className="fila"><span className="muted small">{error || 'Mirando…'}</span></div>
  // Adónde se paga: el portal de Stripe o, con un año pagado de una vez, el pago del siguiente.
  const pagar = () => api<{ enlace: string }>('/api/licencia/pago', {}).then((r) => window.open(r.enlace, '_blank'), (e) => setError(e.message))
  const cada = l.plan === 'anual' ? 'al año' : 'al mes'
  const pagado = l.plan === 'mensual' || l.plan === 'anual'
  const titulo = `${l.plan === 'gratis' ? 'Gratis de por vida' : pagado ? `Apoyo ${l.plan}` : 'Sin apoyo'}${l.fundador ? ' · Fundador' : ''}`
  const resumen =
    l.plan === 'gratis'
      ? l.activa
        ? 'De las primeras personas: no te sale el recordatorio'
        : 'Sin acceso'
      : !pagado
        ? l.plan === 'cuenta'
          ? 'Tienes tu cuenta gratis de la comunidad'
          : 'Sloth es gratis: si te sirve, apóyala'
        : l.estado === 'authorized'
          ? `${l.monto ? `${pesos(l.monto)} ${cada}` : 'Activo'}${l.pagadaHasta ? ` · próximo cobro el ${fecha(l.pagadaHasta)}` : ''}`
          : l.estado === 'pagado' && l.activa
            ? `Pagado hasta el ${fecha(l.pagadaHasta)} · no se renueva solo`
            : l.activa
            ? `Cancelado: vale hasta el ${fecha(l.pagadaHasta)}${l.folio ? ` · folio ${l.folio}` : ''}`
            : 'Terminó'
  return (
    <div className="item">
      <div className="fila">
        <div className="fila-nombre">
          <strong>{titulo}</strong>
          <span>{resumen}</span>
        </div>
        {/* Pagado de una vez: se renueva con la misma clave, también cuando ya se acabó. */}
        {l.estado === 'pagado' && (
          <button className={apoya(l) ? 'ghost small' : 'primary small'} onClick={pagar}>
            Renovar
          </button>
        )}
        {!apoya(l) && (
          <>
            {l.estado !== 'pagado' && (
              <button className="primary small" onClick={apoyar}>
                Apoyar
              </button>
            )}
            <button className="ghost small" onClick={() => setClave(true)}>
              Ya apoyo
            </button>
          </>
        )}
        {l.pasarela === 'stripe' && (l.estado === 'authorized' || l.estado === 'paused') && (
          <button className="ghost small" onClick={pagar}>
            Cambiar tarjeta
          </button>
        )}
        {l.estado === 'authorized' && (
          <button className="ghost small" onClick={() => setCancelando(true)}>
            Cancelar apoyo
          </button>
        )}
      </div>
      {l.clave && (
        <div className="fila-extra">
          <div className="opcion-fila">
            <span className="mono">{l.clave}</span>
            <button
              className="ghost small"
              onClick={() => navigator.clipboard.writeText(l.clave!).then(() => (setCopiada(true), setTimeout(() => setCopiada(false), 1500)))}
            >
              {copiada ? 'Copiada' : 'Copiar'}
            </button>
          </div>
          <p className="muted small">Tu clave: con ella entras desde otra computadora (dos a la vez).</p>
          <p className="muted small">
            <a href={`${PAGINA}/terminos`} target="_blank" rel="noreferrer">
              Términos y condiciones
            </a>{' '}
            ·{' '}
            <a href={`${PAGINA}/privacidad`} target="_blank" rel="noreferrer">
              Aviso de privacidad
            </a>
          </p>
          {(error || l.error) && <p className="bad small">{error || l.error}</p>}
        </div>
      )}
      {clave &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setClave(false)}>
            <div className="modal licencia-caja" role="dialog" aria-modal aria-label="Tu clave" onClick={(e) => e.stopPropagation()}>
              <Clave licencia={l} onCambio={(n) => (setL(n), apoya(n) && setClave(false))} onVolver={() => setClave(false)} />
            </div>
          </div>,
          document.body
        )}
      {cancelando && (
        <Confirm
          title="¿Cancelar tu apoyo?"
          action="Cancelar apoyo"
          danger
          onConfirm={() => api<Licencia>('/api/licencia/cancelar', {}).then(setL)}
          onClose={() => setCancelando(false)}
        >
          Dejamos de cobrarte desde ahora, sin penalización. Sloth sigue siendo gratis; lo que ya pagaste vale hasta el{' '}
          {fecha(l.pagadaHasta)}. Te damos un folio de la cancelación.
        </Confirm>
      )}
    </div>
  )
}
