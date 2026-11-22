/**
 * La escalera del apoyo, desde el 18 de noviembre de 2026.
 *
 * Sube con la gente: por cada `PRECIO_CADA` personas que apoyan hoy (`apoyan` en `/precio`), el apoyo cuesta
 * `PRECIO_SUBE` más (`PRECIO_SUBE_MXN` en pesos) que `PRECIO_MENSUAL`: con 50 de cada, $10 hasta 49 personas, $15 de 50
 * a 99, $20 de 100 a 149… (`precioDe`). Si bajan las personas, baja el precio.
 *
 * Y a cada quien le baja con el tiempo: quien entra con el precio del día paga eso el primer mes y `PRECIO_SUBE` menos
 * cada mes siguiente, hasta su `piso` (`PRECIO_MENSUAL`): $15 y luego $10; o $20, $15 y $10. Solo el mensual al precio
 * del día (`piso` en la fila, que pone `suscribir`): quien elige su monto se queda con él, y lo de una vez no tiene
 * otro cobro. Los de antes ya están en el piso.
 *
 * Baja al confirmarse cada pago (`bajarCadaMes`, cada vez que la fila se vuelve a leer: `guardarEstado`): la
 * suscripción queda cobrando el monto siguiente desde su próximo cobro, sin prorrateo, y la fila lo guarda en `monto`,
 * así que el aviso de cada cobro ya dice lo que se va a cobrar. `bajado` guarda el `pagado_hasta` del mes con que bajó:
 * una vez por cada mes pagado. Primero la pasarela y luego la fila, con el monto que sale de la fila: si dos avisos
 * llegan a la vez, los dos piden lo mismo. Si la pasarela falla, se anota y se reintenta en la siguiente lectura.
 * Con cripto no hay suscripción: baja la fila, y la factura del mes siguiente sale con ese monto.
 *
 * El precio de cada quien no vuelve a subir mientras siga apoyando; quien cancela y vuelve entra con el del día. Es lo
 * que más se le dice (`tuPrecioSeQueda`, `siVuelves`): en el correo de la clave, en el aviso de cada cobro, al cancelar
 * (el correo y la app) y en la página.
 */
import { accionDe, cambiarMonto } from './bajar-apoyo.ts'
import type { Env, Fila } from './index.ts'

const DIA = 24 * 3600_000
/** Dos lecturas del mismo mes pagado dan el mismo `pagado_hasta`, o uno a minutos; el del mes siguiente, a unos 30 días. */
const OTRO_MES = 20 * DIA

/** Lo que cuesta el apoyo con `apoyan` personas: `base` más `paso` por cada `cada`. Sin `paso` o sin `cada`, `base`. */
export function precioDe(base: number, paso: number, cada: number, apoyan: number): number {
  return paso > 0 && cada > 0 ? base + paso * Math.floor(Math.max(0, apoyan) / cada) : base
}

/** Cuánto sube el apoyo por cada escalón y cuánto baja cada mes, en la moneda de la fila; 0 si no hay escalera. */
export function pasoEn(env: Pick<Env, 'MONEDA' | 'PRECIO_SUBE' | 'PRECIO_SUBE_MXN'>, moneda: string): number {
  return Number(moneda === 'MXN' ? env.PRECIO_SUBE_MXN : moneda === env.MONEDA ? env.PRECIO_SUBE : 0) || 0
}

type DeEscalera = Pick<Fila, 'plan' | 'monto' | 'moneda' | 'piso'>

/** Lo que se cobra el mes siguiente si todavía baja; `undefined` si ya está en su piso o no baja. */
export function siguiente(env: Pick<Env, 'MONEDA' | 'PRECIO_SUBE' | 'PRECIO_SUBE_MXN'>, f: DeEscalera): number | undefined {
  const paso = pasoEn(env, f.moneda)
  if (f.plan !== 'mensual' || f.piso == null || !(f.monto > f.piso) || !paso) return undefined
  return Math.max(f.piso, f.monto - paso)
}

const dinero = (n: number) => `$${n.toLocaleString('es-MX')}`

/** Cómo baja, dicho a quien paga (en la página de pago de Stripe): `undefined` si no baja. */
export function comoBaja(env: Pick<Env, 'MONEDA' | 'PRECIO_SUBE' | 'PRECIO_SUBE_MXN'>, f: DeEscalera): string | undefined {
  const luego = siguiente(env, f)
  if (luego === undefined) return undefined
  if (luego === f.piso) return `${dinero(f.monto)} ${f.moneda} el primer mes y ${dinero(luego)} ${f.moneda} cada mes desde el segundo.`
  return `${dinero(f.monto)} ${f.moneda} el primer mes; después baja ${dinero(pasoEn(env, f.moneda))} cada mes hasta quedar en ${dinero(f.piso!)} ${f.moneda} al mes.`
}

/** Lo mismo, con el primer pago ya hecho (en el correo de la clave). */
export function comoSigue(env: Pick<Env, 'MONEDA' | 'PRECIO_SUBE' | 'PRECIO_SUBE_MXN'>, f: DeEscalera): string | undefined {
  const luego = siguiente(env, f)
  if (luego === undefined) return undefined
  const resto = luego === f.piso ? 'y ahí se queda' : `y sigue bajando ${dinero(pasoEn(env, f.moneda))} cada mes hasta quedar en ${dinero(f.piso!)} ${f.moneda} al mes`
  return `Tu apoyo baja cada mes que sigues: tu siguiente cobro ya es de ${dinero(luego)} ${f.moneda}, ${resto}.`
}

/**
 * Lo que más pesa de la escalera, dicho a quien apoya cada mes (en el correo de su clave y en el aviso de cada cobro):
 * su precio no sube mientras siga, y si cancela y vuelve entra con el del día. `hoy`: lo que paga hoy el primer mes
 * quien entra, en la moneda de la fila; se dice si es más que lo suyo.
 */
export function tuPrecioSeQueda(env: Pick<Env, 'MONEDA' | 'PRECIO_SUBE' | 'PRECIO_SUBE_MXN'>, f: DeEscalera, hoy?: number): string {
  const vuelves = 'Si cancelas y después vuelves, entras con el precio de ese día.'
  if (hoy === undefined || !(hoy > f.monto)) return `Mientras sigas apoyando, tu precio no sube aunque el apoyo suba para quien llegue después. ${vuelves}`
  const tuyo = siguiente(env, f) === undefined ? `se queda en ${dinero(f.monto)} ${f.moneda} al mes` : `sigue bajando hasta ${dinero(f.piso!)} ${f.moneda} al mes`
  return `Hoy el apoyo para quien entra es de ${dinero(hoy)} ${f.moneda} el primer mes; el tuyo ${tuyo} mientras sigas apoyando. ${vuelves}`
}

/** Lo mismo, a quien acaba de cancelar. */
export function siVuelves(f: Pick<Fila, 'monto' | 'moneda'>, hoy?: number): string {
  return `Si después quieres volver, entras con el precio de ese día${hoy !== undefined && hoy > f.monto ? ` (hoy, ${dinero(hoy)} ${f.moneda} el primer mes)` : ''}, no con el que tenías.`
}

/**
 * Si a la fila le toca bajar ahora: un mensual que baja, por encima de su piso, con un mes recién pagado (su
 * `pagado_hasta` aún no llega y no es el del mes con que ya bajó) y que se sigue cobrando: una suscripción al corriente
 * o, con cripto, un mes pagado. Mercado Pago da la suscripción por autorizada antes de cobrar el primer mes, con el
 * cobro a minutos: hasta que su fecha no pasa al mes siguiente no baja, o ese primer cobro saldría ya rebajado.
 */
export function tocaBajar(f: Pick<Fila, 'plan' | 'monto' | 'piso' | 'estado' | 'autorizada' | 'pagado_hasta' | 'bajado' | 'cripto'>, ahora: number): boolean {
  if (f.plan !== 'mensual' || f.piso == null || !(f.monto > f.piso) || !f.autorizada || !f.pagado_hasta) return false
  if (f.estado !== 'authorized' && !(f.estado === 'pagado' && f.cripto)) return false
  const hasta = Date.parse(f.pagado_hasta)
  return hasta > ahora && hasta - Date.parse(f.autorizada) > OTRO_MES && (!f.bajado || hasta - Date.parse(f.bajado) > OTRO_MES)
}

/** Con un mes recién pagado, deja la suscripción cobrando el monto siguiente. Un error se anota y la fila se queda como estaba. */
export async function bajarCadaMes(env: Env, f: Fila, ahora = Date.now()): Promise<Fila> {
  const monto = siguiente(env, f)
  if (monto === undefined || !tocaBajar(f, ahora)) return f
  const accion = accionDe(f)
  // Una suscripción de tarjeta que aún no deja su `sub_…` en la fila: se baja en la siguiente lectura.
  if (accion === 'nada' && !f.cripto) return f
  try {
    await cambiarMonto(env, f, accion, monto)
    await env.DB.prepare('UPDATE licencias SET monto = ?, bajado = ? WHERE id = ? AND monto = ?').bind(monto, f.pagado_hasta, f.id, f.monto).run()
    return { ...f, monto, bajado: f.pagado_hasta }
  } catch (e) {
    console.error('Bajar el apoyo del mes', f.id, e instanceof Error ? e.message : e)
    return f
  }
}
