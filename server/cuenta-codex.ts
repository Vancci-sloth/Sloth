import type { CuentaClaude, LimitesClaude } from '../shared/types.ts'
import { conLlave, llaveDe, llaveEnUso } from './acceso.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { CodexRpc } from './codex-rpc.ts'
import { ventanasCodex, type LimitesCodexRpc } from './limites-codex.ts'
import { CLAUDE_ORIGINAL, perfilesAgente } from './perfiles-agentes.ts'

const perfiles = perfilesAgente('codex')
type Estado = { account: { type: string; email?: string; planType?: string } | null }
type Cliente = {
  rpc: CodexRpc
  usos: number
  reloj?: ReturnType<typeof setTimeout>
  lectura?: Promise<Estado>
}
const clientes = new Map<string, Cliente>()
let login: { perfil: string; id: string; url: string; reloj: ReturnType<typeof setTimeout> } | undefined
let iniciando: string | undefined
let fallo: string | undefined
let limites: { id: string; leido: number; valor: Promise<LimitesClaude> } | undefined
let leyendoLimites = 0

export const perfilCodexAutorizando = (id: string) => login?.perfil === id || iniciando === id
export const conectandoCodex = () => login || iniciando ? 'Se está conectando la cuenta de ChatGPT. Termina de autorizarla primero.' : leyendoLimites ? 'Se están leyendo los límites de Codex.' : null

function terminar(error?: string) {
  clearTimeout(login?.reloj)
  login = undefined
  fallo = error
}

async function conCliente<T>(id: string, usar: (rpc: CodexRpc) => Promise<T>): Promise<T> {
  let c = clientes.get(id)
  if (!c) {
    const rpc = new CodexRpc((method, value) => {
      if (method !== 'account/login/completed') return
      const aviso = value as { loginId: string; success: boolean; error?: string }
      if (login?.id !== aviso.loginId || login.perfil !== id) return
      void completar(id, aviso.success, aviso.error)
    }, error => {
      if (clientes.get(id)?.rpc !== rpc) return
      clientes.delete(id)
      if (login?.perfil === id) terminar(error?.message ?? 'Se cerró el inicio de sesión.')
    }, {}, null, perfiles.configuracion(id))
    c = { rpc, usos: 0 }
    clientes.set(id, c)
  }
  clearTimeout(c.reloj)
  c.usos++
  try {
    await c.rpc.ready
    return await usar(c.rpc)
  } finally {
    c.usos--
    if (!c.usos && login?.perfil !== id && clientes.get(id) === c)
      c.reloj = setTimeout(() => c.rpc.close(), 30_000).unref()
  }
}

function leer(id: string) {
  const c = clientes.get(id)
  if (c?.lectura) return c.lectura
  const lectura = conCliente(id, rpc => rpc.request<Estado>('account/read', { refreshToken: false }))
  const cliente = clientes.get(id)
  if (cliente) cliente.lectura = lectura
  return lectura.finally(() => { if (cliente?.lectura === lectura) cliente.lectura = undefined })
}

async function completar(id: string, exito: boolean, error?: string) {
  try {
    if (!exito) throw new Error(error ?? 'No se pudo conectar la cuenta de ChatGPT.')
    const { account } = await leer(id)
    if (account?.type !== 'chatgpt' || !account.email) throw new Error('Codex no confirmó la cuenta de ChatGPT.')
    if (id === CLAUDE_ORIGINAL) perfiles.usar(id)
    else perfiles.autorizar(id, account.email)
    limites = undefined
    terminar()
  } catch (e) {
    terminar(e instanceof Error ? e.message : String(e))
  } finally {
    const c = clientes.get(id)
    if (c && !c.usos) c.rpc.close()
  }
}

export async function cuentaCodex(): Promise<CuentaClaude> {
  if (login || iniciando) return { conectada: false, conectando: { url: login?.url }, llave: llaveDe('codex') }
  if (llaveEnUso('codex')) return conLlave('codex')
  if (!rutaAgente('codex')) return { conectada: false, llave: llaveDe('codex') }
  const estado = perfiles.leer()
  if (estado.perfiles.some(p => p.id === estado.activa && p.bloqueado)) return { conectada: false, error: fallo || 'Autoriza el perfil con su correo original.' }
  try {
    const { account } = await leer(estado.activa)
    return { conectada: account?.type === 'chatgpt', quien: account?.email, plan: account?.planType, error: fallo, llave: llaveDe('codex') }
  } catch (e) {
    return { conectada: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function conectarCodex(perfil?: string): Promise<CuentaClaude> {
  if (login || iniciando) return cuentaCodex()
  const estado = perfiles.leer()
  const id = perfil === 'nuevo' ? perfiles.nuevo() : perfil ?? estado.activa
  if (perfil !== 'nuevo' && id !== CLAUDE_ORIGINAL && !estado.perfiles.some(p => p.id === id)) throw new Error('Perfil de ChatGPT desconocido.')
  iniciando = id
  fallo = undefined
  limites = undefined
  try {
    await asegurarAgente('codex')
    await conCliente(id, async rpc => {
      const r = await rpc.request<{ loginId: string; authUrl: string }>('account/login/start', { type: 'chatgpt' })
      const reloj = setTimeout(() => {
        terminar('El inicio de sesión venció. Vuelve a intentarlo.')
        rpc.close()
      }, 15 * 60_000).unref()
      login = { perfil: id, id: r.loginId, url: r.authUrl, reloj }
    })
  } finally {
    iniciando = undefined
  }
  return cuentaCodex()
}

export function usarPerfilCodex(id: string) {
  if (login || iniciando) throw new Error('Termina el inicio de sesión de ChatGPT antes de cambiar de cuenta.')
  perfiles.usar(id)
  fallo = undefined
}

export async function salirCodex(): Promise<CuentaClaude> {
  if (!login && !iniciando && rutaAgente('codex')) {
    await conCliente(perfiles.leer().activa, rpc => rpc.request('account/logout'))
    fallo = undefined
    limites = undefined
  }
  return cuentaCodex()
}

export function limitesCodex(): Promise<LimitesClaude> {
  if (llaveEnUso('codex')) return Promise.resolve({ ventanas: [], llave: true })
  const id = perfiles.leer().activa
  if (!limites || limites.id !== id || Date.now() - limites.leido > 60_000) {
    const valor = (async () => {
      leyendoLimites++
      try { return await conCliente(id, async rpc => ventanasCodex(await rpc.request<LimitesCodexRpc>('account/rateLimits/read'))) }
      finally { leyendoLimites-- }
    })()
    limites = { id, leido: Date.now(), valor }
  }
  return limites.valor
}
