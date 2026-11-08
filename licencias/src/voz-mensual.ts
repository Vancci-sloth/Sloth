/**
 * Los 100.000 créditos mensuales de Sloth salen de las cuentas del socio (`voz.ts`). Se refrescan (se llena hasta 100.000, sin acumular) una vez por mes natural
 * de Ciudad de México, sin recuperar meses anteriores. SOLO para quien paga activamente $15 USD o más (`daCreditos`) y
 * nadie más; una persona es el id de la primera licencia de su correo, aunque tenga más de una clave o computadora.
 *
 * Empieza cuando `scripts/publicar.mjs` termina de subir una actualización que trae esta función. Desplegar el Worker
 * no la abre antes. El cron entrega y avisa por correo aunque la persona no abra Sloth; `/voz` adelanta su entrega.
 * La suma al proveedor no tiene idempotencia documentada: se guarda `enviando` ANTES de pedirla. Un corte o respuesta
 * ambigua se deja para revisión en Administrador, sin repetir una suma que pudo haber llegado. El alta sí es repetible.
 */
import { correo, type Env } from './index.ts'

export const CREDITOS_MENSUALES = 100_000
export const APERTURA_VOZ = 'voz-mensual.json'

export interface BeneficiarioVoz {
  externo: string
  email: string
  clave: string
}

interface Entrega {
  externo: string
  periodo: string
  email: string
  clave: string
  estado: string
  entregado: string | null
  correo: string | null
}

/** Hora local, también en el cambio de año: el Worker corre en UTC. */
export function periodoVoz(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).formatToParts(ahora)
  return `${partes.find((p) => p.type === 'year')!.value}-${partes.find((p) => p.type === 'month')!.value}`
}

export async function vocesPublicadas(env: Env): Promise<boolean> {
  return !!(await env.DESCARGAS.head(APERTURA_VOZ))
}

/** Desde cuánto se reciben los créditos: el apoyo sugerido (`PRECIO_MENSUAL` en `MONEDA`; en pesos, `PRECIO_MENSUAL_MXN`). */
export const desdeCuanto = (env: Env) => ({
  moneda: String(env.MONEDA ?? 'USD').replace(/[^A-Z]/g, '') || 'USD',
  monto: Number(env.PRECIO_MENSUAL) || 15,
  pesos: Number(env.PRECIO_MENSUAL_MXN) || 299
})
/** «$15 USD (299 MXN en los apoyos en pesos)», para Administrador. */
export const desdeTexto = (env: Env) => {
  const d = desdeCuanto(env)
  return `$${d.monto} ${d.moneda} (${d.pesos} MXN en los apoyos en pesos)`
}

/**
 * La licencia `t` da los créditos del mes (una expresión SQL; `ahora`, la fecha con que se compara): SOLO quien paga
 * activamente $15 USD o más, por decisión del creador (7 de noviembre de 2026), y nadie más. Es un apoyo de producción,
 * con pago confirmado (`autorizada`) y sin vencer: el mensual o el de una vez (que vale ese mes) de al menos
 * `PRECIO_MENSUAL` en `MONEDA` o `PRECIO_MENSUAL_MXN` en los de pesos, o el anual. NO reciben: las cuentas gratis, los
 * apoyos de menos (el monto que cada quien elige, desde $1), los vencidos, los de prueba, los que aún no pagan y los
 * lugares gratis de Fundador de por vida. El Fundador que pagó por transferencia es un `unico` de `PRECIO_MENSUAL`: sí.
 * La rifa (`rifa.ts`) usa esta misma regla para saber quién ya los tiene.
 */
export function daCreditos(env: Env, t: string, ahora: string): string {
  const d = desdeCuanto(env)
  return `(${t}.plan IN ('mensual', 'anual', 'unico') AND ${t}.modo = 'produccion' AND ${t}.autorizada IS NOT NULL
    AND julianday(${t}.pagado_hasta) > julianday(${ahora})
    AND (${t}.plan = 'anual' OR (${t}.moneda = '${d.moneda}' AND ${t}.monto >= ${d.monto}) OR (${t}.moneda = 'MXN' AND ${t}.monto >= ${d.pesos})))`
}

/**
 * Quiénes reciben los créditos (`?1`, ahora; `?2`, NULL, o el correo con `unCorreo`). Se excluye todo el correo si hay
 * un bloqueo. Con un correo va por su índice; un `?2 IS NULL OR` recorrería la tabla entera en cada consulta de `/voz`.
 */
export const beneficiariosVoz = (env: Env, unCorreo = false) => `SELECT
  (SELECT v.id FROM licencias v WHERE v.email = l.email ORDER BY v.creada, v.id LIMIT 1) AS externo,
  l.email, l.clave FROM licencias l
  WHERE NOT EXISTS (SELECT 1 FROM licencias v WHERE v.email = l.email AND v.estado = 'vetada')
  AND ${daCreditos(env, 'l', '?1')}
  AND ${unCorreo ? 'l.email = ?2' : '?2 IS NULL'}
  GROUP BY l.email`

export async function beneficiarioVoz(env: Env, email: string): Promise<BeneficiarioVoz | null> {
  return env.DB.prepare(beneficiariosVoz(env, true)).bind(new Date().toISOString(), email).first<BeneficiarioVoz>()
}

/**
 * `preparar` encuentra o crea con 0 créditos; `quedan` lee cuántos le quedan en esa llave; `sumar` usa su misma llave y
 * registra el movimiento.
 */
export interface RepartidorVoz {
  preparar(externo: string): Promise<string>
  quedan(externo: string, llave: string): Promise<number>
  sumar(externo: string, llave: string, cantidad: number): Promise<void>
}

/**
 * Los créditos se refrescan cada mes, no se acumulan: se suma lo que le falta para llegar a `CREDITOS_MENSUALES`. Lo que
 * no usó el mes pasado no pasa a este. Nunca se quita: si el creador le dio de más a mano, los conserva.
 */
export const faltanPara = (quedan: number) => Math.max(0, CREDITOS_MENSUALES - Math.max(0, Math.floor(quedan)))

/** Reclamación atómica entre cron y todas las computadoras; un fallo de correo nunca vuelve a sumar créditos. */
export async function entregarVozMensual(env: Env, b: BeneficiarioVoz, repartidor: RepartidorVoz, ahora = new Date()): Promise<void> {
  const periodo = periodoVoz(ahora)
  const intento = ahora.toISOString()
  await env.DB.prepare('INSERT OR IGNORE INTO voz_mensual (externo, periodo, creditos, email, clave) VALUES (?, ?, ?, ?, ?)').bind(b.externo, periodo, CREDITOS_MENSUALES, b.email, b.clave).run()
  const leer = () => env.DB.prepare('SELECT * FROM voz_mensual WHERE externo = ? AND periodo = ?').bind(b.externo, periodo).first<Entrega>()
  let fila = await leer()
  if (!fila?.entregado) {
    const tomada = await env.DB.prepare("UPDATE voz_mensual SET estado = 'preparando', intento = ?, error = NULL WHERE externo = ? AND periodo = ? AND (estado = 'pendiente' OR (estado = 'preparando' AND intento < ?))")
      .bind(intento, b.externo, periodo, new Date(ahora.getTime() - 5 * 60_000).toISOString()).run()
    if (!tomada.meta.changes) return
    let llave: string
    let faltan: number
    try {
      llave = await repartidor.preparar(b.externo)
      // Se lee antes de marcar `enviando`: si falla, se puede volver a intentar sin riesgo de sumar dos veces.
      faltan = faltanPara(await repartidor.quedan(b.externo, llave))
    } catch (e) {
      await env.DB.prepare("UPDATE voz_mensual SET estado = 'pendiente', error = ? WHERE externo = ? AND periodo = ? AND estado = 'preparando' AND intento = ?")
        .bind(String(e instanceof Error ? e.message : e).slice(0, 300), b.externo, periodo, intento).run()
      return
    }
    // `creditos` queda con lo que de verdad se sumó para llegar a los del mes.
    const enviando = await env.DB.prepare("UPDATE voz_mensual SET estado = 'enviando', creditos = ? WHERE externo = ? AND periodo = ? AND estado = 'preparando' AND intento = ?")
      .bind(faltan, b.externo, periodo, intento).run()
    if (!enviando.meta.changes) return
    try {
      if (faltan > 0) await repartidor.sumar(b.externo, llave, faltan)
      await env.DB.prepare("UPDATE voz_mensual SET estado = 'entregado', entregado = ? WHERE externo = ? AND periodo = ?")
        .bind(intento, b.externo, periodo).run()
    } catch (e) {
      await env.DB.prepare("UPDATE voz_mensual SET estado = 'revisar', error = ? WHERE externo = ? AND periodo = ?")
        .bind(String(e instanceof Error ? e.message : e).slice(0, 300), b.externo, periodo).run()
      return
    }
    fila = await leer()
  }
  if (!fila?.entregado || fila.correo) return
  try {
    await avisarEntrega(env, fila)
  } catch (e) {
    // La voz ya está abonada: un problema de Resend no impide usarla. El cron retoma el correo.
    console.error('Correo de créditos de voz', b.externo, e instanceof Error ? e.message : e)
  }
}

/** «noviembre de 2026», de `2026-11`. */
export function mesDe(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, mes - 1, 15)))
}

async function avisarEntrega(env: Env, b: Entrega): Promise<void> {
  const periodo = b.periodo
  // En el tono de Vancci (docs/agents/anuncios.md): sin acentos, como en un chat. Lo mismo dice el aviso de la app
  // (web/src/CreditosVoz.tsx).
  const mes = mesDe(periodo)
  const d = desdeCuanto(env)
  const enviada = await correo(env, b.email, `YA TIENES TUS 100,000 CREDITOS DE VOZ :))) · ${mes}`, [
    'Holaaaaa como estas, aqui Vancci.',
    `Oye estoy bien emocionado de contarte esto: por apoyar a Sloth con $${d.monto} ${d.moneda} o mas ya tienes 100,000 CREDITOS DE VOZ para ${mes}. Neta muchisimas gracias, gracias a ti esto sigue creciendo :)))`,
    `Y lo mejor: se te refrescan CADA MES mientras sigas apoyando con $${d.monto} ${d.moneda} o mas, cada mes vuelves a tener 100,000. Si tu apoyo se vence o baja de $${d.monto} ya no se refrescan. Ojo, no se acumulan, los que no uses en el mes no pasan al siguiente, asi que usalos sin miedo.`,
    `Tu clave de Sloth: ${b.clave}`,
    'Para usarlos actualiza Sloth y entra a Opciones > Voz > Voces de Sloth. Ahi le das a "Añadir clave de Sloth" y pegas tu clave. Si ya la tenias puesta en Apoyo nada mas dale a "Volver a leer tus creditos" y yap.',
    'Ya con eso escoges una voz o clonas LA TUYA con una grabacion, y el agente la usa solita para tus videos. Esta bien perron, ya veras. Ojo, los creditos son SOLO para la voz, los agentes de IA siguen con su propia cuenta.',
    'Si algo no jala o tienes dudas respondeme este correo, contesto ABSOLUTAMENTE TODO. Un abrazoooooo',
    'Vancci · Descarga o actualiza Sloth en https://sloth.vancci.org'
  ], `voz-mensual/${b.externo}/${periodo}`)
  if (enviada) await env.DB.prepare('UPDATE voz_mensual SET correo = ? WHERE externo = ? AND periodo = ?').bind(new Date().toISOString(), b.externo, periodo).run()
}

/**
 * Cuánto saldo queda libre para repartir (rifas, regalos) sin quedarse corto con lo de cada mes: el saldo general de
 * todas las llaves, menos lo que ya tienen los usuarios sin gastar (asignar no gasta el saldo, pero generar sí), menos
 * lo que falta por entregar este mes a quien apoya con $15 o más (a cada uno, lo que le falta para llegar a 100,000).
 */
export function cuentaDeReparto(o: { saldo: number; usuarios: { externo: string; creditos: number }[]; beneficiarios: string[]; entregados: Set<string> }) {
  const tienen = new Map(o.usuarios.map((u) => [u.externo, Math.max(0, Math.floor(u.creditos))]))
  const enUsuarios = [...tienen.values()].reduce((t, c) => t + c, 0)
  const porEntregar = o.beneficiarios.filter((b) => !o.entregados.has(b)).reduce((t, b) => t + faltanPara(tienen.get(b) ?? 0), 0)
  return {
    saldo: o.saldo,
    enUsuarios,
    beneficiarios: o.beneficiarios.length,
    porEntregar,
    cadaMes: o.beneficiarios.length * CREDITOS_MENSUALES,
    libres: o.saldo - enUsuarios - porEntregar
  }
}

/** Lotes pequeños: un correo o proveedor que falla no impide entregar al resto. */
export async function repartirVozMensual(env: Env, repartidor: RepartidorVoz): Promise<void> {
  if (!(await vocesPublicadas(env))) return
  const periodo = periodoVoz()
  const filas = await env.DB.prepare(`SELECT b.* FROM (${beneficiariosVoz(env)}) b LEFT JOIN voz_mensual m ON m.externo = b.externo AND m.periodo = ?3
    WHERE m.externo IS NULL OR m.estado = 'pendiente' OR (m.estado = 'preparando' AND m.intento < ?4) OR (m.entregado IS NOT NULL AND m.correo IS NULL)
    ORDER BY COALESCE(m.intento, ''), b.externo LIMIT 10`)
    .bind(new Date().toISOString(), null, periodo, new Date(Date.now() - 5 * 60_000).toISOString()).all<BeneficiarioVoz>()
  for (const b of filas.results) {
    try {
      await entregarVozMensual(env, b, repartidor)
    } catch (e) {
      console.error('Reparto mensual de voz', b.externo, e instanceof Error ? e.message : e)
    }
  }
  // Un correo pendiente no se pierde al cambiar de mes o vencer el apoyo: sus créditos ya se entregaron.
  const correos = await env.DB.prepare('SELECT * FROM voz_mensual WHERE entregado IS NOT NULL AND correo IS NULL ORDER BY periodo, externo LIMIT 10').all<Entrega>()
  for (const b of correos.results) {
    try {
      await avisarEntrega(env, b)
    } catch (e) {
      console.error('Correo de créditos de voz', b.externo, e instanceof Error ? e.message : e)
    }
  }
}
