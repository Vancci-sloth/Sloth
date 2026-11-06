import { useEffect, useState } from 'react'
import { NOMBRE_AGENTE, type Proveedor } from '../../shared/providers'
import type { CuentaEnFlow, EstadoFlow, GastoFlow, LimitesClaude } from '../../shared/types'
import { api } from './api'

/** Cuánto falta para el reinicio. No supone que una ventana vencida tenga ya el 100% disponible. También en `LimiteClaude.tsx`. */
export function reinicio(fecha: string, ahora: number): string {
  const minutos = Math.ceil((Date.parse(fecha) - ahora) / 60_000)
  if (!Number.isFinite(minutos)) return 'Sin fecha de reinicio'
  if (minutos <= 0) return 'Pendiente de actualizar'
  const dias = Math.floor(minutos / 1440)
  const horas = Math.floor(minutos % 1440 / 60)
  if (dias) return `${dias} d${horas ? ` ${horas} h` : ''}`
  if (horas) return `${horas} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`
  return `${minutos} min`
}

/** `sinPlan`: lo que se dice si no da límites. */
function Cuenta({ id, nombre, ahora, sinPlan = 'El proveedor no informa límites del plan.' }: { id: string; nombre: string; ahora: number; sinPlan?: string }) {
  const [limites, setLimites] = useState<LimitesClaude>()
  const [error, setError] = useState(false)
  useEffect(() => {
    let vigente = true
    const leer = () => api<LimitesClaude>(`/api/${id}/limites`).then(
      (datos) => { if (vigente) { setLimites(datos); setError(false) } },
      () => { if (vigente) setError(true) },
    )
    void leer()
    const reloj = setInterval(leer, 60_000)
    return () => { vigente = false; clearInterval(reloj) }
  }, [id])
  return (
    <span className="context-provider">
      {error ? <span className="context-limit-note">No se pudieron consultar los límites.</span>
        : !limites ? <span className="context-limit-note">Consultando límites…</span>
        : limites.llave ? <span className="context-limit-note">Pagas con tu llave de API: se cobra por uso y no hay límites del plan. Para verlos, cambia a «Tu suscripción» en Opciones → Agentes.</span>
        : !limites.ventanas.length ? <span className="context-limit-note">{sinPlan}</span>
        : limites.ventanas.map((v) => {
          const queda = Math.max(0, Math.min(100, 100 - v.uso))
          return (
            <span className={`context-limit ${queda <= 10 ? 'agotandose' : ''}`} key={v.nombre}>
              <span className="context-limit-heading"><span>{v.nombre.replace('Sesión de 5 horas', 'Sesión')}</span><b>{Math.round(queda)}% disponible</b></span>
              <span className="context-limit-bar" role="meter" aria-label={`${nombre}: ${v.nombre}, disponible`} aria-valuenow={queda} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${queda}%` }} />
              </span>
              {v.reinicia && <span className="context-limit-reset" title={new Date(v.reinicia).toLocaleString('es-MX')}>↻ Se restablece en {reinicio(v.reinicia, ahora)}</span>}
            </span>
          )
        })}
    </span>
  )
}

/** Los que dicen cuánto queda del plan; los demás no tienen qué enseñar. */
const CON_PLAN: Proveedor[] = ['claude', 'codex', 'opencode']

/**
 * Se monta solo al abrir «Uso»: consulta el plan del agente del hilo, el único que importa ahí. En OpenCode, los límites
 * de Go si la cuenta lo tiene; si no, que su uso gratis tiene un tope que OpenCode no enseña.
 */
export function LimitesContexto({ proveedor }: { proveedor: Proveedor }) {
  const [ahora, setAhora] = useState(Date.now)
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(reloj)
  }, [])
  if (!CON_PLAN.includes(proveedor)) return null
  return (
    <span className="context-limits">
      <span className="picker-label">Tu plan de {NOMBRE_AGENTE[proveedor]}</span>
      <Cuenta
        id={proveedor}
        nombre={NOMBRE_AGENTE[proveedor]}
        ahora={ahora}
        sinPlan={proveedor === 'opencode' ? 'Sin OpenCode Go: el uso gratis tiene un tope que OpenCode no publica ni deja ver, y es de tu computadora: cambiar de cuenta no lo repone. Al acabarse, vuelve solo en unas horas o al día siguiente. Los modelos de pago se cobran de tu saldo.' : undefined}
      />
    </span>
  )
}

/** Las cuentas que se ven en «Uso»; las demás, en Opciones. Con 50, la tarjeta sería una lista. */
const CUENTAS_A_LA_VISTA = 5
/** Lo que da al día una cuenta gratis: la barra se mide contra esto, o contra lo más que se le haya leído. */
const DIARIO_GRATIS = 50
const LITE = 10
const horaFlow = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const MOTIVO: Record<NonNullable<CuentaEnFlow['descansa']>['motivo'], string> = { creditos: 'Sin créditos', frenada: 'Flow la frenó', sesion: 'Sin sesión' }

function CuentaFlow({ c, ahora }: { c: CuentaEnFlow; ahora: number }) {
  const s = c.saldo
  const renovados = !!s?.renueva && s.renueva <= ahora
  const queda = !s ? 0 : renovados ? 100 : Math.min(100, (s.creditos / Math.max(DIARIO_GRATIS, s.maximo ?? 0)) * 100)
  const nota = c.generando
    ? 'Generando'
    : c.descansa
      ? `${MOTIVO[c.descansa.motivo]} · vuelve a probar a las ${horaFlow(c.descansa.hasta)}`
      : renovados
        ? `↻ Se renovaron a las ${horaFlow(s!.renueva!)}: actualiza para verlos`
        : s?.renueva
          ? `↻ Se renuevan a las ${horaFlow(s.renueva)}`
          : ''
  return (
    <span className={`context-limit ${c.descansa || (s && !renovados && s.creditos < LITE) ? 'agotandose' : ''}`}>
      <span className="context-limit-heading" title={c.correo}>
        <span className="una-linea">{c.correo.replace(/@gmail\.com$/, '')}</span>
        <b>{!s ? 'sin leer' : renovados ? 'renovados' : `${s.creditos} créditos`}</b>
      </span>
      <span className="context-limit-bar" role="meter" aria-label={`${c.correo}: créditos de Flow`} aria-valuenow={Math.round(queda)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${queda}%` }} />
      </span>
      {nota && <span className="context-limit-reset">{nota}</span>}
    </span>
  )
}

/**
 * Google Flow en «Uso», si hay cuentas: lo que les queda entre todas y a cada una (las que más tienen), y lo que gastó
 * este chat (`delChat`, de sus herramientas: `resumenDe`). Se monta al abrir la tarjeta, y mientras lee los saldos
 * (`/api/flow/saldos`, abre el Flow de cada cuenta sin ventana) vuelve a preguntar.
 */
export function FlowEnUso({ delChat }: { delChat?: GastoFlow }) {
  const [e, setE] = useState<EstadoFlow>()
  const ahora = Date.now()
  useEffect(() => void api<EstadoFlow>('/api/flow').then(setE, () => {}), [])
  useEffect(() => {
    if (!e?.leyendo) return
    const t = setTimeout(() => void api<EstadoFlow>('/api/flow').then(setE, () => {}), 3000)
    return () => clearTimeout(t)
  }, [e])
  if (!e?.cuentas.length) return null
  const orden = [...e.cuentas].sort((a, b) => (b.saldo?.creditos ?? -1) - (a.saldo?.creditos ?? -1))
  const sinLeer = e.cuentas.filter((c) => !c.saldo).length
  const clips = Math.floor(e.quedan / LITE)
  return (
    <span className="context-limits">
      <span className="context-flow-cabeza">
        <span className="picker-label">Google Flow</span>
        {e.leyendo ? (
          <span className="context-limit-note">Leyendo…</span>
        ) : (
          <button className="link small" title="Abre el Flow de cada cuenta, sin ventana, y lee cuánto le queda. No gasta." onClick={() => void api<EstadoFlow>('/api/flow/saldos', { faltan: false }).then(setE, () => {})}>
            Actualizar
          </button>
        )}
      </span>
      <span className="context-figure">Quedan {e.quedan} créditos</span>
      <span className="context-limit-note">
        {clips ? `Alcanzan para ${clips} ${clips === 1 ? 'clip' : 'clips'} en Lite` : 'No alcanzan para un clip en Lite'} · {e.cuentas.length === 1 ? '1 cuenta' : `${e.cuentas.length} cuentas`}
        {sinLeer ? ` · ${sinLeer} sin leer` : ''}
        {delChat?.videos ? (
          <>
            <br />
            Este chat gastó {delChat.creditos} en {delChat.videos} {delChat.videos === 1 ? 'clip' : 'clips'}
          </>
        ) : null}
      </span>
      {orden.slice(0, CUENTAS_A_LA_VISTA).map((c) => (
        <CuentaFlow key={c.correo} c={c} ahora={ahora} />
      ))}
      {orden.length > CUENTAS_A_LA_VISTA && <span className="context-limit-note">Y {orden.length - CUENTAS_A_LA_VISTA} cuentas más, en Opciones → Google Flow.</span>}
    </span>
  )
}
