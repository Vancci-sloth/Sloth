import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { version } from '../../package.json'
import type { Licencia } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import { claveEscrita } from './Respaldo'
import './Licencia.css'

const dinero = (n: number) => `$${n.toLocaleString('es-MX')}`
const fecha = (iso?: string, month: 'long' | 'short' = 'long') => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month, year: 'numeric' }) : '')

/** Lo último que dijo el servidor de la clave: el pie y Opciones enseñan lo mismo, y cambian juntos al escribir una clave o cancelar. */
let sabida: Licencia | undefined
const oyentes = new Set<(l: Licencia) => void>()
function saber(l: Licencia): Licencia {
  sabida = l
  for (const o of oyentes) o(l)
  return l
}
function useLicencia(fresco = false) {
  const [l, setL] = useState(sabida)
  const [error, setError] = useState('')
  useEffect(() => {
    oyentes.add(setL)
    if (fresco || !sabida) api<Licencia>(`/api/licencia${fresco ? '?fresco' : ''}`).then(saber, (e) => setError(e.message))
    return () => void oyentes.delete(setL)
  }, [fresco])
  return { l, error }
}

/** Cuándo termina el apoyo. Nada si no hay fecha que decir: sin apoyo, con la cuenta gratis o gratis de por vida. */
function finApoyo(l: Licencia | undefined, corta: boolean): string {
  if (!l?.pagadaHasta || (l.plan !== 'mensual' && l.plan !== 'anual' && l.plan !== 'unico')) return ''
  const dia = fecha(l.pagadaHasta, corta ? 'short' : 'long')
  // Con el cobro en marcha no termina: ese día se cobra otra vez.
  return !l.activa ? `tu apoyo terminó el ${dia}` : l.estado === 'authorized' ? `tu apoyo se renueva el ${dia}` : `tu apoyo termina el ${dia}`
}

/** La versión de Sloth que tienes y hasta cuándo vale tu apoyo: bajo el título de Opciones y abajo de la barra lateral (`corta`). */
export function VersionYApoyo({ corta = false, className }: { corta?: boolean; className: string }) {
  const fin = finApoyo(useLicencia().l, corta)
  return (
    <span className={className}>
      Sloth {version}
      {fin && ` · ${fin}`}
    </span>
  )
}
/** La página de Sloth: ahí se apoya, y tiene los términos y el aviso de privacidad. */
const PAGINA = 'https://sloth.vancci.org'
/** La versión de los términos que acepta quien crea su cuenta: la de `TERMINOS` en la página. */
const TERMINOS = '2026-10-30'
/** Cada cuántos inicios sale el recordatorio a quien no apoya. */
const CADA = 10
const INICIOS = 'sloth:inicios'

/** Si la clave quita el recordatorio: un apoyo vigente o un lugar gratis de por vida (de cuando Sloth se vendía). */
const apoya = (l?: Licencia) => !!l?.activa && l.plan !== 'cuenta'
/** Abre la página ya en el formulario del pago (`#pago`), no en la tabla de lo que trae el apoyo. */
const apoyar = () => window.open(`${PAGINA}/#pago`, '_blank')

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

/** Pegar la clave del apoyo, la de otra computadora, la de antes de reinstalar o la de la cuenta gratis recién creada (`aviso`). */
function Clave({ licencia, aviso, onCambio, onVolver }: { licencia: Licencia; aviso?: ReactNode; onCambio(l: Licencia): void; onVolver(): void }) {
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function usarClave(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true)
    setError('')
    try {
      const l = saber(await api<Licencia>('/api/licencia/clave', { clave }))
      // Si esa clave ya se usa en otra computadora, Sloth ofrece traer lo de allá.
      if (l.activa) claveEscrita()
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
        {aviso ?? (
          <>
            <b>Te llegó a tu correo</b> al apoyar en sloth.vancci.org, en «Tu clave de Sloth» (si no lo ves, revisa spam o promociones).
            {licencia.plan === 'cuenta' && ' Tu cuenta de la comunidad se queda: es la misma con tu correo.'}
          </>
        )}
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
  // La clave va al correo: se escribe aquí para entrar.
  const [enviada, setEnviada] = useState<Licencia>()

  async function unirse(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true)
    setError('')
    try {
      const l = await api<Licencia & { enviada?: boolean }>('/api/licencia/unirse', { email, terminos: TERMINOS })
      if (!l.enviada) return onListo()
      setEnviada(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setOcupado(false)
  }

  if (enviada)
    return (
      <div className="licencia-caja licencia-unirse">
        <Clave
          licencia={enviada}
          aviso={
            <>
              <b>Te la mandamos a {email.trim()}</b>, en «Tu cuenta de Sloth» (si no lo ves, revisa spam o promociones).
            </>
          }
          onCambio={(l) => l.activa && onListo()}
          onVolver={() => setEnviada(undefined)}
        />
      </div>
    )

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

/** En Opciones: el apoyo (o la cuenta gratis, o el lugar gratis), el próximo cobro, la clave, renovar (un año pagado de una vez) y cancelar. */
export function SuscripcionOpciones() {
  // Recién leída del cobro; mientras llega, lo que ya se sabía.
  const { l, error: sinLeer } = useLicencia(true)
  const [fallo, setError] = useState('')
  const error = fallo || sinLeer
  const [cancelando, setCancelando] = useState(false)
  const [copiada, setCopiada] = useState(false)
  const [clave, setClave] = useState(false)
  // Lo que paga hoy quien entra (el apoyo sube con la gente): al cancelar se dice, porque quien vuelve entra con ese.
  const [hoy, setHoy] = useState<{ mensual: number; paso: number }>()
  useEffect(() => {
    if (cancelando) api<{ mensual: number; paso: number }>('/api/licencia/precio').then(setHoy, () => {})
  }, [cancelando])

  if (!l) return <div className="fila"><span className="muted small">{error || 'Mirando…'}</span></div>
  // Un año pagado de una vez: el pago del siguiente.
  const renovar = () => api<{ enlace: string }>('/api/licencia/pago', {}).then((r) => window.open(r.enlace, '_blank'), (e) => setError(e.message))
  const cada = l.plan === 'anual' ? 'al año' : 'al mes'
  const pagado = l.plan === 'mensual' || l.plan === 'anual' || l.plan === 'unico'
  const titulo = `${l.plan === 'gratis' ? 'Gratis de por vida' : l.plan === 'unico' ? 'Apoyo de una vez' : pagado ? `Apoyo ${l.plan}` : 'Sin apoyo'}${l.fundador ? ' · Fundador' : ''}`
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
          ? `${l.monto ? `${dinero(l.monto)} ${cada}` : 'Activo'}${l.pagadaHasta ? ` · próximo cobro el ${fecha(l.pagadaHasta)}` : ''}`
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
          <button className={apoya(l) ? 'ghost small' : 'primary small'} onClick={renovar}>
            {l.plan === 'unico' ? 'Apoyar otra vez' : 'Renovar'}
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
              <Clave licencia={l} onCambio={(n) => apoya(n) && setClave(false)} onVolver={() => setClave(false)} />
            </div>
          </div>,
          document.body
        )}
      {cancelando && (
        <Confirm
          title="¿Cancelar tu apoyo?"
          action="Cancelar apoyo"
          danger
          onConfirm={() => api<Licencia>('/api/licencia/cancelar', {}).then(saber)}
          onClose={() => setCancelando(false)}
        >
          Dejamos de cobrarte desde ahora, sin penalización. Sloth sigue siendo gratis; lo que ya pagaste vale hasta el{' '}
          {fecha(l.pagadaHasta)}. Te damos un folio de la cancelación.
          {!!hoy?.paso && ` Tu precio se queda contigo solo mientras sigas: si después vuelves, entras con el precio de ese día (hoy, ${dinero(hoy.mensual)} USD el primer mes).`}
        </Confirm>
      )}
    </div>
  )
}
