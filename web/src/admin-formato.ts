/**
 * Cómo dice el Administrador (`Admin.tsx`) cada cosa: los planes de Sloth, los errores del proveedor y del cobro, las
 * cifras y las fechas, todo en español; y cómo se busca a alguien (sin acentos, cada palabra en cualquier parte).
 */

export interface Licencia {
  plan: string
  estado: string
  monto?: number
  moneda?: string
  pagado_hasta?: string | null
  creada?: string
  fundador?: number
}

export interface Cuenta {
  email: string
  licencias: Licencia[]
}

/** Lo que quiere decir cada código de error del proveedor o del cobro. */
export const CODIGOS: Record<string, string> = {
  insufficient_credits: 'Sin créditos',
  sin_conexion: 'Sin conexión con el proveedor',
  user_suspended: 'Suspendido',
  rate_limited: 'Demasiadas a la vez',
  not_found: 'No existe',
  invalid_voice: 'Esa voz no existe',
  text_too_long: 'Texto muy largo'
}
export const STATUS: Record<number, string> = { 400: 'Pedido mal hecho', 401: 'Sin permiso', 402: 'Sin créditos', 403: 'Sin permiso', 404: 'No existe', 409: 'En conflicto', 429: 'Demasiadas a la vez', 500: 'Falló el proveedor', 502: 'Sin conexión con el proveedor', 503: 'Proveedor caído', 504: 'Tardó demasiado' }
const PLANES: Record<string, string> = { mensual: 'Apoyo mensual', anual: 'Apoyo anual', unico: 'Pago único', cuenta: 'Cuenta gratis' }
const ESTADOS_PLAN: Record<string, string> = { authorized: 'activo', pagado: 'pagado', pending: 'pendiente', cancelled: 'cancelado', gratis: '' }

/** El porqué de una llamada fallida, en español. */
export const explicar = (r: { status: number; codigo: string | null; error: string | null }) => (r.codigo && CODIGOS[r.codigo]) || STATUS[r.status] || r.error || `Respondió ${r.status}`

/** El plan de Sloth de un correo en pocas palabras: el que sigue en pie (o el más nuevo), y «+1» si hay más. */
export function planCorto(c?: Cuenta): string {
  if (!c?.licencias.length) return '—'
  const vivas = c.licencias.filter((l) => l.estado === 'authorized' || l.estado === 'pagado' || l.estado === 'gratis')
  const l = vivas.find((x) => x.plan !== 'cuenta') ?? vivas[0] ?? c.licencias[0]
  const resto = c.licencias.length - 1
  return `${planLargo(l)}${resto > 0 ? ` · +${resto}` : ''}`
}
export function planLargo(l: Licencia): string {
  const estado = ESTADOS_PLAN[l.estado] ?? l.estado
  return [PLANES[l.plan] ?? l.plan, l.monto ? `${num(l.monto)} ${l.moneda ?? ''}`.trimEnd() : '', estado, l.fundador ? 'Fundador' : ''].filter(Boolean).join(' · ')
}

export const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('es-MX', { maximumFractionDigits: 2 }) : '—')
export const segundos = (ms: unknown) => (typeof ms === 'number' ? `${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s` : '—')
export function fecha(v: unknown): string {
  const t = typeof v === 'string' || typeof v === 'number' ? new Date(v) : undefined
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}
/** «7 nov 21:36», en una línea: la hora en 24 h para que no parta la celda. */
export function fechaCorta(v: unknown): string {
  const t = typeof v === 'string' || typeof v === 'number' ? new Date(v) : undefined
  if (!t || Number.isNaN(t.getTime())) return '—'
  const dia = t.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).replace('.', '')
  return `${dia} ${t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}
/** «hace 3 min», «hace 2 h». */
export function hace(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 45) return 'hace un momento'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`
  return `el ${fechaCorta(ms)}`
}

/** Si `buscable` (ya sin acentos) tiene cada palabra de `consulta`, en cualquier orden y parte. */
export const coincide = (buscable: string, consulta: string) =>
  sinAcentos(consulta.trim())
    .split(/\s+/)
    .filter(Boolean)
    .every((p) => buscable.includes(p))
