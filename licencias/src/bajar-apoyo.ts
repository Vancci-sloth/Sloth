/**
 * El 13 de noviembre de 2026 el apoyo pasó a ser uno solo de $10 USD al mes (199 MXN con Mercado Pago), en vez del de
 * Fundador ($15, 299 MXN) y el de Donador PRO ($30, 599 MXN). Lo que cada quien ya pagó de más no se pierde: vale como
 * tiempo (`extraDe`: $15 dan 15 días más; $30, 60), y su siguiente cobro, ya de $10, no sale antes de que se acabe.
 *
 * `POST /bajar-apoyo` (`node scripts/bajar-apoyo.mjs`), solo del creador, lo hace con los apoyos de producción pagados
 * antes de `antes` que siguen pagados, de `limite` en `limite` (cada uno pide varias cosas a su pasarela):
 * - La suscripción de Stripe baja a $10 y su siguiente cobro pasa a `extra_hasta` (`trial_end`, sin prorrateo).
 * - La de PayPal o Mercado Pago baja a $10 (199 MXN) y se pausa: ninguna deja mover la fecha del cobro. El cron la
 *   reanuda ese día (`reanudarPausadas`); con PayPal, al reanudarse cobra ese día o en su fecha de cada mes.
 * - Lo pagado de una vez, lo cancelado y lo dado a mano solo suman los días: no hay cobro que mover.
 * Luego un correo le dice a cada quien hasta cuándo vale y cuándo se le cobra. Con `probar`, solo dice qué haría.
 * Cada fila se hace una vez (`extra_dias`) y se avisa una vez (`extra_avisado`): repetirlo sigue donde se quedó.
 */
import { correo, deAMano, delCreador, deUnaVez, fecha, json, masDias, mp, pasarela, paypal, refrescar, Rechazo, cuerpo, type Env, type Fila } from './index.ts'
import { stripe } from './stripe.ts'

const DIA = 24 * 3600_000
/** Un mes promedio, para contar cuántos meses lleva pagados una fila. */
const MES = 30.44 * DIA

/** El apoyo de hoy en la moneda de la fila; `undefined` en otra moneda. */
export function precioEn(env: Pick<Env, 'MONEDA' | 'PRECIO_MENSUAL' | 'PRECIO_MENSUAL_MXN'>, moneda: string): number | undefined {
  if (moneda === 'MXN') return Number(env.PRECIO_MENSUAL_MXN)
  if (moneda === env.MONEDA) return Number(env.PRECIO_MENSUAL)
}

/**
 * Los días que vale lo pagado de más con el apoyo a `precio`: cada mes pagado a `monto` vale `monto / precio` meses de
 * 30 días. Los meses pagados se cuentan desde el primer pago hasta lo pagado (un mes, si lleva menos).
 */
export function extraDe(f: Pick<Fila, 'monto' | 'autorizada' | 'pagado_hasta'>, precio: number): number {
  if (!f.autorizada || !f.pagado_hasta || !(precio > 0) || !(f.monto > precio)) return 0
  const meses = Math.max(1, Math.round((Date.parse(f.pagado_hasta) - Date.parse(f.autorizada)) / MES))
  return Math.round(meses * (f.monto / precio - 1) * 30)
}

/** «15 días», «2 meses». */
export function tiempo(dias: number): string {
  if (dias % 30) return `${dias} ${dias === 1 ? 'día' : 'días'}`
  return dias === 30 ? '1 mes' : `${dias / 30} meses`
}

const dinero = (monto: number, moneda: string) => `$${monto.toLocaleString('es-MX')} ${moneda}`

/** Lo que pasa con el cobro de la fila: `stripe`, `paypal` o `mp` se cambian y aplazan; `nada`, no hay cobro que mover. */
export type Accion = 'stripe' | 'paypal' | 'mp' | 'nada'

export function accionDe(f: Pick<Fila, 'estado' | 'stripe' | 'paypal' | 'preapproval' | 'plan'>): Accion {
  if (f.estado !== 'authorized' && f.estado !== 'paused') return 'nada'
  if (f.stripe?.startsWith('sub_')) return 'stripe'
  if (f.paypal) return 'paypal'
  if (f.preapproval) return 'mp'
  return 'nada'
}

/** Lo que se hizo (o se haría, al probar) con una fila. */
interface Hecho {
  email: string
  monto: string
  pasarela: string
  accion: Accion
  dias: number
  antes: string
  hasta: string
  avisado?: boolean
  error?: string
}

export async function bajarApoyo(req: Request, env: Env): Promise<Response> {
  if (!delCreador(req, env)) throw new Rechazo(401, 'No autorizado.')
  const c = await cuerpo(req)
  const antes = String(c.antes ?? '')
  if (!/^\d{4}-\d{2}-\d{2}T/.test(antes) || Number.isNaN(Date.parse(antes))) throw new Rechazo(400, 'Falta `antes`: la fecha del cambio, en ISO.')
  const limite = Math.min(10, Math.max(1, Number(c.limite) || 3))
  // Las rifas dan apoyos con un correo de Sloth: no son de nadie que haya pagado.
  const { results } = await env.DB.prepare(
    `SELECT * FROM licencias WHERE modo = 'produccion' AND plan IN ('mensual', 'unico') AND autorizada IS NOT NULL AND autorizada < ?
       AND estado IN ('authorized', 'paused', 'cancelled', 'pagado') AND julianday(pagado_hasta) > julianday('now')
       AND extra_avisado IS NULL AND email NOT LIKE '%@sloth.vancci.org' ORDER BY autorizada`
  )
    .bind(antes)
    .all<Fila>()
  const pendientes = results
    .map((f) => ({ f, precio: precioEn(env, f.moneda) }))
    .filter(({ f, precio }) => precio && ((f.extra_dias ?? 0) > 0 || extraDe(f, precio) > 0)) as { f: Fila; precio: number }[]
  if (c.probar === true)
    return json({
      quedan: pendientes.length,
      filas: pendientes.map(({ f, precio }) => {
        const dias = f.extra_dias || extraDe(f, precio)
        return { ...resumen(f, accionDe(f), dias), hasta: f.extra_dias ? f.pagado_hasta! : masDias(f.pagado_hasta!, dias) }
      })
    })
  const hechos: Hecho[] = []
  for (const { f, precio } of pendientes.slice(0, limite)) hechos.push(await unaFila(env, f, precio))
  return json({ quedan: pendientes.length - hechos.filter((h) => h.avisado).length, hechos })
}

function resumen(f: Fila, accion: Accion, dias: number): Hecho {
  return { email: f.email, monto: dinero(f.monto, f.moneda), pasarela: deAMano(f) ? 'a mano' : pasarela(f), accion, dias, antes: f.pagado_hasta!, hasta: '' }
}

/** Una fila: su cobro (si no se hizo ya), sus días y su correo. Un error se reporta y la fila se queda para la siguiente vuelta. */
async function unaFila(env: Env, f: Fila, precio: number): Promise<Hecho> {
  const accion = accionDe(f)
  let dias = f.extra_dias ?? 0
  const h = resumen(f, accion, dias || extraDe(f, precio))
  try {
    let antes = f.pagado_hasta!
    if (!dias) {
      dias = extraDe(f, precio)
      const hasta = masDias(antes, dias)
      await aplazarCobro(env, f, accion, precio, hasta)
      // El mensual con cripto paga el siguiente mes al nuevo precio; lo de una vez conserva lo que se pagó.
      const monto = accion !== 'nada' || (f.cripto && f.plan === 'mensual') ? precio : f.monto
      await env.DB.prepare('UPDATE licencias SET extra_dias = ?, extra_hasta = ?, pagado_hasta = ?, reanudar = ?, monto = ? WHERE id = ?')
        .bind(dias, hasta, hasta, accion === 'paypal' || accion === 'mp' ? hasta : null, monto, f.id)
        .run()
      f = { ...f, extra_dias: dias, extra_hasta: hasta, pagado_hasta: hasta, monto }
    } else antes = masDias(f.pagado_hasta!, -dias)
    Object.assign(h, { dias, antes, hasta: f.pagado_hasta! })
    h.avisado = await avisar(env, f, accion, h)
    if (h.avisado) await env.DB.prepare('UPDATE licencias SET extra_avisado = ? WHERE id = ?').bind(new Date().toISOString(), f.id).run()
  } catch (e) {
    h.error = e instanceof Error ? e.message : String(e)
  }
  return h
}

/** Baja el cobro de la suscripción a `precio` y lo aplaza a `hasta`. Cada paso se puede repetir si el anterior falló a medias. */
async function aplazarCobro(env: Env, f: Fila, accion: Accion, precio: number, hasta: string) {
  if (accion === 'stripe') {
    const s = await stripe<{ items: { data: { id: string; price: { product: string } }[] } }>(env, 'GET', `/v1/subscriptions/${encodeURIComponent(f.stripe!)}`)
    const item = s.items.data[0]
    await stripe(env, 'POST', `/v1/subscriptions/${encodeURIComponent(f.stripe!)}`, {
      'items[0][id]': item.id,
      'items[0][price_data][currency]': f.moneda.toLowerCase(),
      'items[0][price_data][product]': item.price.product,
      'items[0][price_data][unit_amount]': String(Math.round(precio * 100)),
      'items[0][price_data][recurring][interval]': 'month',
      'items[0][price_data][tax_behavior]': 'inclusive',
      // Sin cobrar ni abonar la diferencia: lo pagado de más ya vale como estos días.
      proration_behavior: 'none',
      trial_end: String(Math.floor(Date.parse(hasta) / 1000))
    })
  } else if (accion === 'paypal') {
    const ruta = `/v1/billing/subscriptions/${encodeURIComponent(f.paypal!)}`
    await paypal(env, 'PATCH', ruta, [
      { op: 'replace', path: '/plan/billing_cycles/@sequence==1/pricing_scheme/fixed_price', value: { currency_code: f.moneda, value: precio.toFixed(2) } }
    ])
    // Ya suspendida (una vuelta anterior que no llegó a guardarse), PayPal contesta 422.
    if (f.estado === 'authorized')
      await paypal(env, 'POST', `${ruta}/suspend`, { reason: 'El apoyo bajo a 10 USD: lo pagado de mas vale hasta que se reanude' }).catch((e) => {
        if (!(e instanceof Rechazo) || e.status !== 422) throw e
      })
  } else if (accion === 'mp') {
    const ruta = `/preapproval/${encodeURIComponent(f.preapproval!)}`
    await mp(env, 'PUT', ruta, { auto_recurring: { transaction_amount: precio, currency_id: f.moneda } })
    if (f.estado === 'authorized') await mp(env, 'PUT', ruta, { status: 'paused' })
  }
}

/** El correo a cada quien: cuánto tiempo más tiene, hasta cuándo vale y si se le cobra, cuándo y cuánto. */
function avisar(env: Env, f: Fila, accion: Accion, h: Hecho): Promise<boolean> {
  const precio = precioEn(env, f.moneda)!
  const quien = pasarela(f)
  const parrafos = [
    'Hola:',
    `El apoyo de Sloth ahora es uno solo, de $10 USD al mes ($199 MXN con Mercado Pago). Tú pagaste ${h.monto}, más que eso, y lo que pagaste de más no se pierde: te da ${tiempo(h.dias)} más de apoyo.`
  ]
  const hasta = `Tu apoyo ahora vale hasta el ${fecha(h.hasta)} (antes, hasta el ${fecha(h.antes)}).${f.fundador ? ' Sigues siendo Fundador.' : ''}`
  if (accion !== 'nada') {
    parrafos.push(
      `${hasta} ${quien} no te cobra nada antes de esa fecha. Desde ahí te cobra ${dinero(precio, f.moneda)} al mes (IVA incluido), ya no ${h.monto}.`
    )
    if (accion !== 'stripe')
      parrafos.push(`Mientras tanto, en tu cuenta de ${quien} tu suscripción aparece en pausa: así no se te cobra antes. Se reanuda sola el ${fecha(h.hasta)}, no tienes que hacer nada.`)
    parrafos.push(`Si no quieres seguir, cancélala antes en Sloth: Opciones, Apoyo, «Cancelar apoyo», o responde a este correo. Lo pagado vale hasta el ${fecha(h.hasta)}.`)
  } else {
    const porque = f.cripto && f.plan === 'mensual'
      ? `Con cripto no hay cobro automático: antes de que se acabe te avisamos para pagar el mes siguiente, ya de ${dinero(precio, f.moneda)}.`
      : deUnaVez(f) || deAMano(f)
        ? `Fue un apoyo de una vez: no se renueva solo y no te cobramos nada. Si después quieres seguir, el apoyo ya es de ${dinero(precio, f.moneda)} al mes, en sloth.vancci.org.`
        : `Tu suscripción ya está cancelada: no te cobramos nada. Si después quieres volver, el apoyo ya es de ${dinero(precio, f.moneda)} al mes, en sloth.vancci.org.`
    parrafos.push(`${hasta} ${porque}`)
  }
  parrafos.push('Gracias por apoyar a Sloth. Si tienes dudas, responde a este correo.')
  return correo(env, f.email, `Sloth baja a $10 al mes: tienes ${tiempo(h.dias)} más de apoyo`, parrafos, `bajar-apoyo-${f.id}`)
}

/**
 * Cada 10 minutos: las suscripciones de PayPal o Mercado Pago que se pausaron al bajar el apoyo y ya llegaron a su día
 * se reanudan. Si se cancelaron mientras, ya no se tocan. Un error se queda para la siguiente vuelta.
 */
export async function reanudarPausadas(env: Env, ahora = Date.now()) {
  const { results } = await env.DB.prepare('SELECT * FROM licencias WHERE reanudar IS NOT NULL AND reanudar <= ?').bind(new Date(ahora).toISOString()).all<Fila>()
  for (const vieja of results) {
    try {
      let f = await refrescar(env, vieja)
      if (f.estado === 'paused') {
        if (f.paypal) await paypal(env, 'POST', `/v1/billing/subscriptions/${encodeURIComponent(f.paypal)}/activate`, { reason: 'Se acabo lo pagado de mas' })
        else if (f.preapproval) await mp(env, 'PUT', `/preapproval/${encodeURIComponent(f.preapproval)}`, { status: 'authorized' })
        f = await refrescar(env, f)
      }
      if (f.estado !== 'paused') await env.DB.prepare('UPDATE licencias SET reanudar = NULL WHERE id = ?').bind(f.id).run()
    } catch (e) {
      console.error('Reanudar', vieja.id, e instanceof Error ? e.message : e)
    }
  }
}
