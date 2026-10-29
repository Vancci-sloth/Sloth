import type { CuentaClaude, LimitesClaude } from '../shared/types.ts'
import { conLlave, llaveDe, llaveEnUso } from './acceso.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { CodexRpc } from './codex-rpc.ts'
import { ventanasCodex, type LimitesCodexRpc } from './limites-codex.ts'

/** La cuenta se autoriza y renueva en Codex; Sloth solo ve su correo, plan y enlace de inicio de sesión. */
let rpc: CodexRpc | undefined
let login: { id: string; url: string } | undefined
let fallo: string | undefined
let reloj: ReturnType<typeof setTimeout> | undefined
let lectura: Promise<CuentaClaude> | undefined
let limites: { leido: number; valor: Promise<LimitesClaude> } | undefined
let leyendoLimites = 0

export const conectandoCodex = () => login ? 'Se está conectando la cuenta de ChatGPT. Termina de autorizarla primero.' : leyendoLimites ? 'Se están leyendo los límites de Codex.' : null

function cliente() {
  clearTimeout(reloj)
  if (!rpc) {
    const nuevo = new CodexRpc((method, value) => {
      if (method !== 'account/login/completed') return
      const p = value as { loginId: string; success: boolean; error?: string }
      if (p.loginId !== login?.id) return
      login = undefined
      limites = undefined
      fallo = p.success ? undefined : p.error ?? 'No se pudo conectar la cuenta de ChatGPT.'
      descansar()
    }, (error) => {
      if (rpc !== nuevo) return
      rpc = undefined
      if (login) fallo = error?.message ?? 'Se cerró el inicio de sesión. Vuelve a intentarlo.'
      login = undefined
    })
    rpc = nuevo
  }
  return rpc
}

/** Cierra el proceso que lee la cuenta, para poder reemplazar Codex al actualizarlo. El siguiente uso lo abre otra vez. */
export function cerrarCuentaCodex() {
  clearTimeout(reloj)
  rpc?.close()
  rpc = undefined
}

function descansar() {
  clearTimeout(reloj)
  if (!login && !leyendoLimites && !lectura) reloj = setTimeout(() => rpc?.close(), 60_000).unref()
}

export function cuentaCodex(): Promise<CuentaClaude> {
  if (llaveEnUso('codex')) return Promise.resolve(conLlave('codex'))
  // Sin el programa de Codex (aún no se bajó, `server/agentes.ts`) no hay sesión: mirarla no lo baja; conectarla, sí.
  if (!rutaAgente('codex')) return Promise.resolve({ conectada: false, llave: llaveDe('codex') })
  // Los avisos y Opciones pueden leer a la vez; comparten una lectura y un proceso.
  lectura ??= (async () => {
    const c = cliente()
    try {
      await c.ready
      const r = await c.request<{ account: { type: string; email?: string; planType?: string } | null }>('account/read', { refreshToken: false })
      return { conectada: r.account?.type === 'chatgpt', quien: r.account?.email, plan: r.account?.planType, conectando: login && { url: login.url }, error: fallo, llave: llaveDe('codex') }
    } catch (error) {
      return { conectada: false, error: error instanceof Error ? error.message : String(error) }
    } finally { lectura = undefined; descansar() }
  })()
  return lectura
}

export async function conectarCodex(): Promise<CuentaClaude> {
  await asegurarAgente('codex')
  const c = cliente()
  await c.ready
  if (login) return cuentaCodex()
  fallo = undefined
  limites = undefined
  const r = await c.request<{ loginId: string; authUrl: string }>('account/login/start', { type: 'chatgpt' })
  login = { id: r.loginId, url: r.authUrl }
  return cuentaCodex()
}

/** Lee las cuotas del plan sin abrir un turno ni gastar tokens. Las lecturas simultáneas comparten un minuto de caché. */
export function limitesCodex(): Promise<LimitesClaude> {
  // Con la llave no hay plan: se paga por uso.
  if (llaveEnUso('codex')) return Promise.resolve({ ventanas: [], llave: true })
  if (!limites || Date.now() - limites.leido > 60_000) {
    limites = { leido: Date.now(), valor: (async () => {
      leyendoLimites++
      try {
        const c = cliente()
        await c.ready
        return ventanasCodex(await c.request<LimitesCodexRpc>('account/rateLimits/read'))
      } finally { leyendoLimites--; descansar() }
    })() }
  }
  return limites.valor
}
