import type { CuentaClaude, LimitesClaude } from '../shared/types.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { CONSOLA, conexion } from './opencode.ts'

/**
 * La cuenta de OpenCode con la que trabaja Sloth: sin ella no hay OpenCode (sin cuenta, el uso gratis es de toda la
 * computadora y se acaba enseguida). Se crea gratis en opencode.ai; con saldo, sirven también los modelos de pago. Se
 * conecta como en la terminal de OpenCode: su página pide confirmar un código y OpenCode termina solo. OpenCode recuerda
 * cada cuenta que se conectó y trabaja con la activa (`credential.activate`): así se cambia de una a otra.
 *
 * Todo va al `opencode serve` de Sloth (`server/opencode.ts`), con sus datos en `data/opencode`: no toca la cuenta del
 * OpenCode que tenga instalado el usuario.
 */

const SERVIDOR = 'https://opencode.ai/console'

/** El inicio de sesión que espera al navegador. */
let intento: { id: string; url: string; codigo?: string } | undefined
let fallo: string | undefined

/** `cambio`: la cuenta se conectó en esta lectura, y hay que volver a pedir los modelos. */
type Cuenta = CuentaClaude & { cambio?: boolean }

export const conectandoOpenCode = () => (intento ? 'Se está conectando la cuenta de OpenCode. Termina de autorizarla primero.' : null)

export async function cuentaOpenCode(): Promise<Cuenta> {
  // Sin el programa (aún no se bajó, `server/agentes.ts`) no hay cuenta: mirarla no lo baja; conectarla, sí.
  if (!rutaAgente('opencode')) return { conectada: false }
  try {
    const { client } = await conexion()
    let cambio = false
    if (intento) {
      const estado = await client.integration.oauth.status({ integrationID: CONSOLA, attemptID: intento.id }).then((r) => r.data, () => null)
      if (estado?.status !== 'pending') {
        intento = undefined
        cambio = estado?.status === 'complete'
        fallo = estado?.status === 'failed' ? estado.message : estado?.status === 'expired' || !estado ? 'El código venció antes de autorizarlo. Vuelve a conectar.' : undefined
      }
    }
    const cuentas = (await client.credential.list()).filter((c) => c.integrationID === CONSOLA)
    const activa = cuentas.find((c) => c.active)
    // La etiqueta es el nombre de la organización («Personal» en todas): se distinguen por el correo.
    const quien = (c: (typeof cuentas)[number]) => {
      const correo = c.value.metadata?.email
      return typeof correo === 'string' ? correo : c.label
    }
    // Dónde se ven el saldo y el uso de la cuenta activa, en su organización de opencode.ai.
    const uso = activa && (await client.experimental.usage.limits().then((r) => r.data?.workspace.usageURL, () => undefined))
    return {
      conectada: !!activa,
      quien: activa && quien(activa),
      conectando: intento && { url: intento.url, codigo: intento.codigo },
      error: fallo,
      cuentas: cuentas.map((c) => ({ id: c.id, quien: quien(c), activa: c.active })),
      uso,
      cambio
    }
  } catch (error) {
    return { conectada: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Baja OpenCode si falta y pide el código. Conectar otra vez agrega otra cuenta, que queda como la activa. */
export async function conectarOpenCode(): Promise<Cuenta> {
  await asegurarAgente('opencode')
  const { client } = await conexion()
  if (!intento) {
    fallo = undefined
    // OpenCode carga sus integraciones al arrancar, un momento después de contestar: antes, `connect` da 500 («OAuth
    // method not found»). Se espera a que la de su cuenta tenga el método.
    for (const fin = Date.now() + 15_000; ; await new Promise((r) => setTimeout(r, 250))) {
      const i = await client.integration.get({ integrationID: CONSOLA }).catch(() => null)
      if (i?.data.methods.some((m) => 'id' in m && m.id === 'device')) break
      if (Date.now() > fin) throw new Error('OpenCode no ofrece conectar la cuenta ahora. Intenta otra vez en un momento.')
    }
    const r = await client.integration.oauth.connect({ integrationID: CONSOLA, methodID: 'device', answer: { server: SERVIDOR } })
    intento = { id: r.data.attemptID, url: r.data.url, codigo: /code:\s*(\S+)/i.exec(r.data.instructions)?.[1] }
  }
  return cuentaOpenCode()
}

/** Deja de esperar al navegador. */
export async function cancelarOpenCode(): Promise<Cuenta> {
  if (intento) {
    const { client } = await conexion()
    await client.integration.oauth.cancel({ integrationID: CONSOLA, attemptID: intento.id }).catch(() => {})
    intento = undefined
  }
  return cuentaOpenCode()
}

/** Trabajar con otra de las cuentas conectadas. */
export async function usarCuentaOpenCode(id: string): Promise<Cuenta> {
  const { client } = await conexion()
  await client.credential.activate({ credentialID: id })
  return cuentaOpenCode()
}

/** Quitar una cuenta de Sloth. La cuenta sigue en opencode.ai; se puede volver a conectar. */
export async function quitarCuentaOpenCode(id: string): Promise<Cuenta> {
  const { client } = await conexion()
  await client.credential.remove({ credentialID: id })
  return cuentaOpenCode()
}

/**
 * Los límites de OpenCode Go, si la cuenta lo tiene (sesión de 5 horas, semana y mes). Sin Go no hay plan: lo gratis y
 * el saldo no tienen ventanas que enseñar. Las lecturas de un minuto se comparten.
 */
let limites: { leido: number; valor: Promise<LimitesClaude> } | undefined
export function limitesOpenCode(): Promise<LimitesClaude> {
  if (!rutaAgente('opencode')) return Promise.resolve({ ventanas: [] })
  if (!limites || Date.now() - limites.leido > 60_000) {
    limites = {
      leido: Date.now(),
      valor: (async () => {
        const { client } = await conexion()
        const go = (await client.experimental.usage.limits()).data?.go
        if (!go) return { ventanas: [] }
        // `resetsAt` llega en segundos o en milisegundos según la versión.
        const fecha = (n: number) => new Date(n < 1e12 ? n * 1000 : n).toISOString()
        return {
          ventanas: [
            { nombre: 'Sesión de 5 horas', uso: go.rolling.percent, reinicia: fecha(go.rolling.resetsAt) },
            { nombre: 'Semana', uso: go.weekly.percent, reinicia: fecha(go.weekly.resetsAt) },
            { nombre: 'Mes', uso: go.monthly.percent, reinicia: fecha(go.monthly.resetsAt) }
          ]
        }
      })()
    }
    limites.valor.catch(() => (limites = undefined))
  }
  return limites.valor
}
