/**
 * Lo que queda de los créditos de voz de cada mes. Sloth los dio en noviembre de 2026 a quien pagaba activamente el
 * apoyo: 100.000 al mes, sin acumular. Desde el 15 de noviembre de 2026 ya no se dan, por decisión del creador: quien
 * los recibió conserva su saldo, nadie más los recibe y no se rellenan. Lo entregado sigue en `voz_mensual` (migración
 * 0024) y se ve en Administrador → Créditos mensuales; una fila en `enviando` o `revisar` se comprueba en el proveedor.
 *
 * Aquí siguen: la marca que abre las voces de Sloth a todos (`APERTURA_VOZ`, que deja `scripts/publicar.mjs` al
 * terminar de subir una versión), el mes de Ciudad de México (también lo usa el fondo), quién apoya con el sugerido o
 * más (`daCreditos`, la regla de la rifa) y la cuenta de cuánto saldo queda libre para rifar o regalar.
 */
import type { Env } from './index.ts'

export const APERTURA_VOZ = 'voz-mensual.json'

/** Hora local, también en el cambio de año: el Worker corre en UTC. */
export function periodoVoz(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).formatToParts(ahora)
  return `${partes.find((p) => p.type === 'year')!.value}-${partes.find((p) => p.type === 'month')!.value}`
}

export async function vocesPublicadas(env: Env): Promise<boolean> {
  return !!(await env.DESCARGAS.head(APERTURA_VOZ))
}

/** El apoyo sugerido (`PRECIO_MENSUAL` en `MONEDA`; en pesos, `PRECIO_MENSUAL_MXN`). */
export const desdeCuanto = (env: Env) => ({
  moneda: String(env.MONEDA ?? 'USD').replace(/[^A-Z]/g, '') || 'USD',
  monto: Number(env.PRECIO_MENSUAL) || 10,
  pesos: Number(env.PRECIO_MENSUAL_MXN) || 199
})

/**
 * La licencia `t` es de quien paga activamente el apoyo sugerido o más (una expresión SQL; `ahora`, la fecha con que se
 * compara). Es un apoyo de producción, con pago confirmado (`autorizada`) y sin vencer: el mensual o el de una vez (que
 * vale ese mes) de al menos `PRECIO_MENSUAL` en `MONEDA` o `PRECIO_MENSUAL_MXN` en los de pesos, o el anual. No lo son
 * las cuentas gratis, los apoyos de menos (el monto que cada quien elige, desde $1), los vencidos, los de prueba, los
 * que aún no pagan ni los lugares gratis de Fundador de por vida. El Fundador que pagó por transferencia es un `unico`
 * de `PRECIO_MENSUAL`: sí. Era la regla de los créditos de cada mes; hoy la usa la rifa (`rifa.ts`) para dejarlos fuera.
 */
export function daCreditos(env: Env, t: string, ahora: string): string {
  const d = desdeCuanto(env)
  return `(${t}.plan IN ('mensual', 'anual', 'unico') AND ${t}.modo = 'produccion' AND ${t}.autorizada IS NOT NULL
    AND julianday(${t}.pagado_hasta) > julianday(${ahora})
    AND (${t}.plan = 'anual' OR (${t}.moneda = '${d.moneda}' AND ${t}.monto >= ${d.monto}) OR (${t}.moneda = 'MXN' AND ${t}.monto >= ${d.pesos})))`
}

/** Para sumarle créditos a alguien (la rifa): `preparar` encuentra o crea su cuenta con 0 y `sumar` usa esa misma llave y registra el movimiento. */
export interface RepartidorVoz {
  preparar(externo: string): Promise<string>
  sumar(externo: string, llave: string, cantidad: number): Promise<void>
}

/** «noviembre de 2026», de `2026-11`. */
export function mesDe(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, mes - 1, 15)))
}

/**
 * Cuánto saldo queda libre para repartir (rifas, regalos): el saldo general de todas las llaves, menos lo que ya tienen
 * los usuarios sin gastar (asignar no gasta el saldo, pero generar sí).
 */
export function cuentaDeReparto(o: { saldo: number; usuarios: { externo: string; creditos: number }[] }) {
  const tienen = new Map(o.usuarios.map((u) => [u.externo, Math.max(0, Math.floor(u.creditos))]))
  const enUsuarios = [...tienen.values()].reduce((t, c) => t + c, 0)
  return { saldo: o.saldo, enUsuarios, libres: o.saldo - enUsuarios }
}
