/**
 * El fondo de la comunidad: la mitad de lo que cae por Stripe (la tarjeta) en el mes de Ciudad de México, ya sin su
 * comisión, sin lo devuelto y sin el IVA, se reparte al cerrar el mes entre quienes comparten en Estilos lo que la gente
 * usa (los puntos de `tienda.ts`) y quisieron participar con su Binance ID (`reparto.ts`). Lo decidió el creador el 13
 * de noviembre de 2026. Arriba de la comunidad sale cuánto va, en vivo, y el paso a paso para participar
 * (`web/src/Fondo.tsx`).
 *
 * El primer reparto es el 1 de enero de 2027 y junta lo que entra desde que el fondo se anunció (`DESDE`, el 15 de
 * noviembre de 2026): así quien quiera participar tiene tiempo de hacer su estilo. Lo que Stripe había cobrado antes no
 * cuenta: es del creador. De ahí en adelante, cada mes (`periodoFondo`).
 *
 * - `GET /comunidad/fondo`: el periodo y lo que se lleva la comunidad, por moneda.
 *
 * Lo cobrado sale de los movimientos del saldo de Stripe (`balance_transactions`) del periodo, que ya vienen sin su
 * comisión. El IVA no viene ahí: los precios lo llevan dentro (Stripe Tax, `tax_behavior: inclusive`), así que se saca
 * qué parte de lo cobrado en el mes fue impuesto, de las sesiones de los pagos sueltos y de las facturas de los
 * mensuales (`proporcionDeImpuesto`), y se quita en esa misma proporción. Se lee a lo más cada minuto (en la memoria del
 * isolate).
 */
import type { FondoComunidad } from '../../shared/types.ts'
import type { Env } from './index.ts'
import { stripe } from './stripe.ts'
import { mesDe, periodoVoz } from './voz-mensual.ts'

/** La parte de la comunidad. */
export const PARTE = 0.5
/** Lo que entra y sale con los apoyos: cobros, devoluciones, contracargos y comisiones sueltas. Los retiros al banco no. */
const CUENTAN = new Set(['charge', 'refund', 'dispute', 'dispute_reversal', 'fee', 'refund_failure', 'partial_capture_reversal'])
const CADA = 60_000
/** Lo más que se pagina de cada lista: 5.000 movimientos al mes. */
const PAGINAS = 50

export interface Movimiento {
  /** Lo que entró o salió (negativo en una devolución o una comisión suelta), lo que se quedó Stripe y lo que queda. */
  amount: number
  fee: number
  net: number
  currency: string
  reporting_category: string
}

/**
 * Cobros de la cuenta de Stripe que no son de Sloth y no entran al fondo, por decisión del creador: su moneda, su monto
 * en centavos y el minuto (UTC) en que se cobró. El del 20 de noviembre de 2026 fue un link de pago de 1.000 MXN.
 */
const FUERA = [{ currency: 'mxn', amount: 100_000, minuto: '2026-11-20T20:23' }]

/** Si un movimiento es el cobro de uno de `FUERA` (con su comisión, que va en el mismo movimiento). */
export function fueraDelFondo(m: Pick<Movimiento, 'amount' | 'currency' | 'reporting_category'> & { created?: number }): boolean {
  if (m.reporting_category !== 'charge' || m.created === undefined) return false
  const minuto = new Date(m.created * 1000).toISOString().slice(0, 16)
  return FUERA.some((f) => f.currency === m.currency && f.amount === m.amount && f.minuto === minuto)
}

/** Lo que es devolver: devoluciones y contracargos (y lo que regresa de ellos). */
const DEVUELTO = new Set(['refund', 'dispute', 'dispute_reversal', 'refund_failure', 'partial_capture_reversal'])

/** Un pago, para saber cuánto fue impuesto: lo cobrado y su impuesto (en la misma moneda), y cuánto pesa (en la del precio). */
export interface Cobrado {
  total: number
  impuesto: number
  peso: number
}

/**
 * Las cuentas del fondo de unos movimientos, por moneda y en unidades (no centavos): lo cobrado, la comisión de Stripe,
 * lo devuelto, el impuesto (`impuesto`, la proporción de lo cobrado que lo fue, sobre lo que no se devolvió), lo que
 * queda y la mitad para la comunidad. Nada negativo; de la moneda con más, primero.
 */
export function cuentasDelFondo(movimientos: Movimiento[], impuesto = 0): FondoComunidad['cuentas'] {
  const por = new Map<string, { cobrado: number; comision: number; devuelto: number; neto: number }>()
  for (const m of movimientos) {
    if (!CUENTAN.has(m.reporting_category)) continue
    const c = por.get(m.currency) ?? { cobrado: 0, comision: 0, devuelto: 0, neto: 0 }
    if (m.reporting_category === 'charge') c.cobrado += m.amount
    else if (DEVUELTO.has(m.reporting_category)) c.devuelto -= m.amount
    // Una comisión suelta (la de Stripe Tax o Billing) va en `amount`, negativa.
    if (m.reporting_category === 'fee') c.comision -= m.amount
    c.comision += m.fee
    c.neto += m.net
    por.set(m.currency, c)
  }
  const parte = Math.min(Math.max(impuesto, 0), 1)
  // Hacia abajo, pero sin que el redondeo de los decimales quite un centavo (499.9999… es 500).
  const abajo = (centavos: number) => Math.max(0, Math.floor(centavos + 1e-6)) / 100
  return [...por]
    .map(([moneda, c]) => {
      const iva = Math.max(0, Math.round((c.cobrado - c.devuelto) * parte))
      const queda = Math.max(0, c.neto - iva)
      return {
        moneda: moneda.toUpperCase(),
        cobrado: abajo(c.cobrado),
        comision: abajo(c.comision),
        devuelto: abajo(c.devuelto),
        impuesto: abajo(iva),
        neto: abajo(queda),
        comunidad: abajo(queda * PARTE)
      }
    })
    .filter((c) => c.cobrado > 0)
    .sort((a, b) => b.comunidad - a.comunidad)
}

/** Lo que se lleva la comunidad, de sus cuentas. */
export const montosDe = (cuentas: FondoComunidad['cuentas']): FondoComunidad['montos'] =>
  cuentas.filter((c) => c.comunidad > 0).map((c) => ({ moneda: c.moneda, monto: c.comunidad }))

/**
 * Qué parte de lo cobrado fue impuesto: la de cada pago (su impuesto entre su total, que no depende de la moneda en que
 * se pagó), pesada por lo que vale en la moneda del precio. Sin pagos, nada.
 */
export function proporcionDeImpuesto(pagos: Cobrado[]): number {
  let impuesto = 0
  let peso = 0
  for (const p of pagos) {
    if (!(p.total > 0) || !(p.peso > 0)) continue
    impuesto += (Math.min(Math.max(p.impuesto, 0), p.total) / p.total) * p.peso
    peso += p.peso
  }
  return peso ? impuesto / peso : 0
}

/** El día 1 a las 00:00 de Ciudad de México (UTC-6 todo el año desde 2022), en segundos. */
export function inicioDelMes(periodo: string): number {
  const [anio, mes] = periodo.split('-').map(Number)
  return Date.UTC(anio, mes - 1, 1, 6) / 1000
}

/** El primer periodo del fondo, que se reparte el 1 de enero de 2027. */
export const PRIMER_PERIODO = '2026-12'
/**
 * Desde cuándo cuenta lo que entra, en segundos: el 15 de noviembre de 2026 a las 14:45 de Ciudad de México, cuando el
 * creador lo fijó. Lo cobrado antes, también lo de noviembre, es suyo y no entra al fondo.
 */
export const DESDE = Date.UTC(2026, 10, 15, 20, 45) / 1000
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/** El periodo del fondo al que cuenta una fecha: su mes de Ciudad de México o, antes del primer reparto, el primero. */
export function periodoFondo(ahora = new Date()): string {
  const p = periodoVoz(ahora)
  return p < PRIMER_PERIODO ? PRIMER_PERIODO : p
}

/** Si es un periodo del fondo: un mes, del primero en adelante. */
export const esPeriodo = (p: string) => PERIODO.test(p) && p >= PRIMER_PERIODO

/** De cuándo a cuándo (en segundos) entra lo de un periodo: su mes; el primero, desde `DESDE`. */
export function tramoDe(periodo: string): { desde: number; hasta: number } {
  const [anio, mes] = periodo.split('-').map(Number)
  return { desde: periodo === PRIMER_PERIODO ? DESDE : inicioDelMes(periodo), hasta: Date.UTC(anio, mes, 1, 6) / 1000 }
}

/** Cómo se llama un periodo: «enero de 2027»; el primero, «noviembre y diciembre de 2026». */
export const nombreDe = (periodo: string) => (periodo === PRIMER_PERIODO ? `noviembre y ${mesDe(periodo)}` : mesDe(periodo))

/** Los periodos del fondo, del primero al de `ahora`. */
export function periodosHasta(ahora = new Date()): string[] {
  const lista: string[] = []
  const fin = periodoFondo(ahora)
  for (let [anio, mes] = PRIMER_PERIODO.split('-').map(Number); ; mes === 12 ? (anio++, (mes = 1)) : mes++) {
    const p = `${anio}-${String(mes).padStart(2, '0')}`
    lista.push(p)
    if (p >= fin) return lista
  }
}

/** Todas las páginas de una lista de Stripe creadas en ese tramo. */
async function todos<T extends { id: string }>(env: Env, ruta: string, tramo: { desde: number; hasta: number }, extra: Record<string, string> = {}): Promise<T[]> {
  const lista: T[] = []
  let despues = ''
  for (let i = 0; i < PAGINAS; i++) {
    const q = new URLSearchParams({ 'created[gte]': String(tramo.desde), 'created[lt]': String(tramo.hasta), limit: '100', ...extra, ...(despues ? { starting_after: despues } : {}) })
    const r = await stripe<{ data: T[]; has_more: boolean }>(env, 'GET', `${ruta}?${q}`)
    lista.push(...r.data)
    if (!r.has_more || !r.data.length) break
    despues = r.data[r.data.length - 1].id
  }
  return lista
}

interface Sesion {
  id: string
  mode: string
  payment_status: string
  amount_total: number | null
  total_details?: { amount_tax?: number } | null
  currency_conversion?: { amount_total: number } | null
}
interface Factura {
  id: string
  total: number
  tax?: number | null
  total_taxes?: { amount: number }[] | null
}

/**
 * Los pagos del mes con su impuesto: los sueltos (el año, el apoyo de una vez) en sus sesiones de Checkout, y los
 * mensuales (el primero y cada renovación) en sus facturas. La sesión de un mensual no: su factura ya lo cuenta.
 */
async function pagosDelMes(env: Env, desde: { desde: number; hasta: number }): Promise<Cobrado[]> {
  const [sesiones, facturas] = await Promise.all([
    todos<Sesion>(env, '/v1/checkout/sessions', desde, { status: 'complete' }),
    todos<Factura>(env, '/v1/invoices', desde, { status: 'paid' })
  ])
  return [
    ...sesiones
      .filter((s) => s.mode === 'payment' && s.payment_status === 'paid')
      .map((s) => ({ total: s.amount_total ?? 0, impuesto: s.total_details?.amount_tax ?? 0, peso: s.currency_conversion?.amount_total ?? s.amount_total ?? 0 })),
    // Desde la API de 2025-03-31 el impuesto va en `total_taxes`; antes, en `tax`.
    ...facturas.map((f) => ({ total: f.total, impuesto: f.total_taxes ? f.total_taxes.reduce((s, t) => s + (t.amount ?? 0), 0) : (f.tax ?? 0), peso: f.total }))
  ]
}

/** Lo último que se leyó de cada periodo. */
const guardados = new Map<string, { leido: number; fondo: FondoComunidad }>()

/** El fondo del periodo de `ahora`. */
export const fondo = (env: Env, ahora = new Date()): Promise<FondoComunidad> => fondoDe(env, periodoFondo(ahora), ahora)

/** El fondo de un periodo: en vivo si sigue abierto, entero si ya cerró. Se lee de Stripe a lo más cada minuto. */
export async function fondoDe(env: Env, periodo: string, ahora = new Date()): Promise<FondoComunidad> {
  const guardado = guardados.get(periodo)
  if (guardado && ahora.getTime() - guardado.leido < CADA) return guardado.fondo
  const tramo = tramoDe(periodo)
  const vacio: FondoComunidad = {
    periodo,
    mes: nombreDe(periodo),
    montos: [],
    cuentas: [],
    cierra: new Date(tramo.hasta * 1000).toISOString(),
    ...(periodo === PRIMER_PERIODO ? { primero: true, desde: new Date(tramo.desde * 1000).toISOString() } : {})
  }
  if (!env.STRIPE_SECRET_KEY) return vacio
  try {
    const [movimientos, pagos] = await Promise.all([todos<Movimiento & { id: string; created: number }>(env, '/v1/balance_transactions', tramo), pagosDelMes(env, tramo)])
    const cuentas = cuentasDelFondo(movimientos.filter((m) => !fueraDelFondo(m)), proporcionDeImpuesto(pagos))
    const fondo = { ...vacio, montos: montosDe(cuentas), cuentas }
    guardados.set(periodo, { leido: ahora.getTime(), fondo })
    return fondo
  } catch (e) {
    // Si Stripe no contesta, lo último que se leyó de ese periodo; si no hay, que no salga.
    if (guardado) return guardado.fondo
    throw e
  }
}
