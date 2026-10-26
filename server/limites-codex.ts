import type { LimitesClaude } from '../shared/types.ts'

/** La respuesta oficial de account/rateLimits/read. Las ventanas no tienen posiciones fijas por duración. */
type Ventana = { usedPercent: number; windowDurationMins?: number | null; resetsAt?: number | null }
type Limite = { limitId?: string | null; limitName?: string | null; primary?: Ventana | null; secondary?: Ventana | null }
export type LimitesCodexRpc = { rateLimits?: Limite | null; rateLimitsByLimitId?: Record<string, Limite> | null }

/** Convierte todas las cuotas que devuelve Codex al formato que ya usa Sloth para Claude. */
export function ventanasCodex(respuesta: LimitesCodexRpc): LimitesClaude {
  const grupos = respuesta.rateLimitsByLimitId && Object.keys(respuesta.rateLimitsByLimitId).length
    ? Object.entries(respuesta.rateLimitsByLimitId)
    : respuesta.rateLimits ? [[respuesta.rateLimits.limitId ?? 'codex', respuesta.rateLimits] as const] : []
  const ventanas: LimitesClaude['ventanas'] = []
  for (const [id, limite] of grupos) {
    for (const [posicion, v] of [limite.primary, limite.secondary].entries()) {
      if (!v || !Number.isFinite(v.usedPercent)) continue
      const mins = v.windowDurationMins
      const nombre = typeof mins === 'number' && mins > 0
        ? mins >= 43200 ? 'Mes' : mins >= 10080 ? 'Semana' : mins === 300 ? 'Sesión de 5 horas' : mins >= 60 ? `Sesión de ${mins / 60} horas` : `Sesión de ${mins} minutos`
        : posicion === 0 ? 'Sesión' : 'Semana'
      const fecha = typeof v.resetsAt === 'number' && v.resetsAt > 0 ? new Date(v.resetsAt * 1000) : undefined
      ventanas.push({
        nombre: id === 'codex' ? nombre : `${nombre} · ${limite.limitName || id}`,
        uso: Math.max(0, Math.min(100, v.usedPercent)),
        reinicia: fecha && Number.isFinite(fecha.getTime()) ? fecha.toISOString() : undefined,
      })
    }
  }
  return { ventanas }
}
