import { useEffect, useState } from 'react'
import type { LimitesClaude } from '../../shared/types'
import { api } from './api'

/** Cuánto falta para el reinicio. No supone que una ventana vencida tenga ya el 100% disponible. */
function reinicio(fecha: string, ahora: number): string {
  const minutos = Math.ceil((Date.parse(fecha) - ahora) / 60_000)
  if (!Number.isFinite(minutos)) return 'Sin fecha de reinicio'
  if (minutos <= 0) return 'Pendiente de actualizar'
  const dias = Math.floor(minutos / 1440)
  const horas = Math.floor(minutos % 1440 / 60)
  if (dias) return `${dias} d${horas ? ` ${horas} h` : ''}`
  if (horas) return `${horas} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`
  return `${minutos} min`
}

/** `opcional` (Codex): si no hay cuenta conectada o no da límites, no sale. */
function Proveedor({ id, nombre, ahora, opcional }: { id: string; nombre: string; ahora: number; opcional?: boolean }) {
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
  if (opcional && (error || (!limites?.ventanas.length && !limites?.llave))) return null
  return (
    <span className={`context-provider context-provider-${id}`}>
      <strong className="context-provider-name">{nombre}</strong>
      {error ? <span className="context-limit-note">No se pudieron consultar los límites.</span>
        : !limites ? <span className="context-limit-note">Consultando límites…</span>
        : limites.llave ? <span className="context-limit-note">Pagas con tu llave de API: se cobra por uso y no hay límites del plan. Para verlos, cambia a «Tu suscripción» en Opciones → Agentes.</span>
        : !limites.ventanas.length ? <span className="context-limit-note">El proveedor no informa límites del plan.</span>
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

/**
 * Se monta solo al abrir el hover del contexto: consulta las dos cuentas, sin bloquear una si falla la otra. En un hilo
 * de OpenCode va primero lo suyo: no tiene plan, y su uso gratis tiene un tope que OpenCode no enseña.
 */
export function LimitesContexto({ opencode }: { opencode?: boolean }) {
  const [ahora, setAhora] = useState(Date.now)
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(reloj)
  }, [])
  return (
    <span className="context-limits">
      <span className="picker-label">Límites del plan</span>
      {opencode && (
        <span className="context-provider context-provider-opencode">
          <strong className="context-provider-name">OpenCode · gratis</strong>
          <span className="context-limit-note">Sin plan: el uso gratis tiene un tope que OpenCode no publica ni deja ver. Al acabarse, vuelve solo en unas horas o al día siguiente.</span>
        </span>
      )}
      <Proveedor id="codex" nombre="Codex" ahora={ahora} opcional />
      <Proveedor id="claude" nombre="Claude" ahora={ahora} />
    </span>
  )
}
