import type { CuentaClaude, LimitesClaude } from '../shared/types.ts'
import { conLlave, llaveDe, llaveEnUso } from './acceso.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { CodexRpc } from './codex-rpc.ts'
import { ventanasCodex, type LimitesCodexRpc } from './limites-codex.ts'
import { ORIGINAL, perfilesAgente } from './perfiles-agentes.ts'

/**
 * La cuenta de ChatGPT se autoriza y renueva en Codex; Sloth solo ve su correo, su plan y el enlace de inicio de sesión.
 * Puede haber varias (`server/perfiles-agentes.ts`): un proceso de Codex por cuenta, que se cierra a los 30 segundos sin
 * uso. Todo va con la que usan los hilos nuevos (`activa`), salvo autorizar una en concreto.
 */
const cuentas = () => perfilesAgente('codex')
type Estado = { account: { type: string; email?: string; planType?: string } | null }
type Cliente = { rpc: CodexRpc; usos: number; reloj?: ReturnType<typeof setTimeout>; lectura?: Promise<Estado> }
const clientes = new Map<string, Cliente>()
let login: { perfil: string; id: string; url: string; codigo?: string; reloj: ReturnType<typeof setTimeout> } | undefined
/** La cuenta cuyo inicio de sesión se está pidiendo, antes de tener su enlace. */
let iniciando: string | undefined
let fallo: string | undefined
let limites: { id: string; leido: number; valor: Promise<LimitesClaude> } | undefined
let leyendoLimites = 0

/** Si esa cuenta se está autorizando: sus hilos esperan a que acabe. */
export const perfilCodexAutorizando = (id: string) => login?.perfil === id || iniciando === id
export const conectandoCodex = () => (login || iniciando ? 'Se está conectando la cuenta de ChatGPT. Termina de autorizarla primero.' : leyendoLimites ? 'Se están leyendo los límites de Codex.' : null)

function terminar(error?: string) {
  clearTimeout(login?.reloj)
  login = undefined
  fallo = error
}

/** El Codex de esa cuenta, abierto mientras alguien lo usa. */
async function conCliente<T>(id: string, usar: (rpc: CodexRpc) => Promise<T>): Promise<T> {
  let c = clientes.get(id)
  if (!c) {
    const rpc = new CodexRpc(
      (method, value) => {
        if (method !== 'account/login/completed') return
        const aviso = value as { loginId: string; success: boolean; error?: string }
        if (login?.id !== aviso.loginId || login.perfil !== id) return
        void completar(id, aviso.success, aviso.error)
      },
      (error) => {
        if (clientes.get(id)?.rpc !== rpc) return
        clientes.delete(id)
        if (login?.perfil === id) terminar(error?.message ?? 'Se cerró el inicio de sesión. Vuelve a intentarlo.')
      },
      {},
      null,
      cuentas().configuracion(id)
    )
    c = { rpc, usos: 0 }
    clientes.set(id, c)
  }
  const cliente = c
  clearTimeout(cliente.reloj)
  cliente.usos++
  try {
    await cliente.rpc.ready
    return await usar(cliente.rpc)
  } finally {
    cliente.usos--
    if (!cliente.usos && login?.perfil !== id && clientes.get(id) === cliente) cliente.reloj = setTimeout(() => cliente.rpc.close(), 30_000).unref()
  }
}

/** Los avisos y Opciones pueden leer a la vez: comparten una lectura y un proceso. */
function leer(id: string): Promise<Estado> {
  const antes = clientes.get(id)?.lectura
  if (antes) return antes
  const lectura = conCliente(id, (rpc) => rpc.request<Estado>('account/read', { refreshToken: false }))
  const c = clientes.get(id)
  if (c) c.lectura = lectura
  return lectura.finally(() => {
    if (c?.lectura === lectura) c.lectura = undefined
  })
}

async function completar(id: string, exito: boolean, error?: string) {
  try {
    if (!exito) throw new Error(error ?? 'No se pudo conectar la cuenta de ChatGPT.')
    const { account } = await leer(id)
    if (account?.type !== 'chatgpt' || (id !== ORIGINAL && !account.email)) throw new Error('Codex no confirmó la cuenta de ChatGPT.')
    cuentas().autorizar(id, account.email ?? '')
    limites = undefined
    terminar()
    for (const f of alEntrar) f(id)
  } catch (e) {
    terminar(e instanceof Error ? e.message : String(e))
  }
}

/** Quienes deben saber que se entró con una cuenta: los hilos quietos de esa cuenta sueltan su Codex. */
const alEntrar: ((id: string) => void)[] = []
export const alEntrarCodex = (f: (id: string) => void) => void alEntrar.push(f)

export async function cuentaCodex(): Promise<CuentaClaude> {
  if (login || iniciando) return { conectada: false, conectando: { url: login?.url, codigo: login?.codigo }, llave: llaveDe('codex') }
  if (llaveEnUso('codex')) return conLlave('codex')
  // Sin el programa de Codex (aún no se bajó, `server/agentes.ts`) no hay sesión: mirarla no lo baja; conectarla, sí.
  if (!rutaAgente('codex')) return { conectada: false, llave: llaveDe('codex') }
  const { activa, perfiles } = cuentas().leer()
  if (perfiles.some((c) => c.id === activa && c.bloqueado)) return { conectada: false, error: fallo || 'Vuelve a autorizar esta cuenta de ChatGPT con su correo.', llave: llaveDe('codex') }
  try {
    const { account } = await leer(activa)
    return { conectada: account?.type === 'chatgpt', quien: account?.email, plan: account?.planType, error: fallo, llave: llaveDe('codex') }
  } catch (error) {
    return { conectada: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Conecta una cuenta de ChatGPT: `nueva`, otra en su carpeta; sin `perfil`, la activa (volver a autorizarla). Desde la
 * web (`remoto`), con un código de dispositivo: el inicio normal vuelve a un puerto de esta computadora, que desde el
 * celular no carga; con el código se autoriza en cualquier navegador.
 */
export async function conectarCodex(remoto = false, perfil?: string): Promise<CuentaClaude> {
  if (login || iniciando) return cuentaCodex()
  const id = perfil === 'nueva' ? cuentas().nueva() : (perfil ?? cuentas().leer().activa)
  if (id !== ORIGINAL && !cuentas().leer().perfiles.some((c) => c.id === id)) throw new Error('No hay esa cuenta de ChatGPT.')
  iniciando = id
  fallo = undefined
  limites = undefined
  try {
    await asegurarAgente('codex')
    await conCliente(id, async (rpc) => {
      const r = await rpc.request<{ loginId: string; authUrl?: string; verificationUrl?: string; userCode?: string }>('account/login/start', { type: remoto ? 'chatgptDeviceCode' : 'chatgpt' })
      const reloj = setTimeout(() => {
        terminar('El inicio de sesión venció. Vuelve a intentarlo.')
        rpc.close()
      }, 15 * 60_000).unref()
      login = { perfil: id, id: r.loginId, url: r.verificationUrl ?? r.authUrl ?? '', codigo: r.userCode, reloj }
    })
  } finally {
    iniciando = undefined
  }
  return cuentaCodex()
}

/** Que los hilos nuevos usen otra de las cuentas ya autorizadas. */
export function usarPerfilCodex(id: string) {
  if (login || iniciando) throw new Error('Termina antes de autorizar la cuenta de ChatGPT que estás conectando.')
  cuentas().usar(id)
  fallo = undefined
  limites = undefined
}

/** Quita una de las cuentas agregadas (no la original) y su carpeta. */
export function quitarPerfilCodex(id: string) {
  if (login || iniciando) throw new Error('Termina antes de autorizar la cuenta de ChatGPT que estás conectando.')
  clientes.get(id)?.rpc.close()
  clientes.delete(id)
  cuentas().quitar(id)
  limites = undefined
}

/** Cierra la sesión de ChatGPT de la cuenta activa (`account/logout`, que borra sus credenciales). La llave de API se queda. */
export async function salirCodex(): Promise<CuentaClaude> {
  if (!login && !iniciando && rutaAgente('codex')) {
    const id = cuentas().leer().activa
    await conCliente(id, (rpc) => rpc.request('account/logout'))
    for (const f of alEntrar) f(id)
  }
  fallo = undefined
  limites = undefined
  return cuentaCodex()
}

/** Lee las cuotas del plan de la cuenta activa sin abrir un turno ni gastar tokens, con un minuto de caché. */
export function limitesCodex(): Promise<LimitesClaude> {
  // Con la llave no hay plan: se paga por uso.
  if (llaveEnUso('codex')) return Promise.resolve({ ventanas: [], llave: true })
  const id = cuentas().leer().activa
  if (!limites || limites.id !== id || Date.now() - limites.leido > 60_000) {
    const valor = (async () => {
      leyendoLimites++
      try {
        return await conCliente(id, async (rpc) => ventanasCodex(await rpc.request<LimitesCodexRpc>('account/rateLimits/read')))
      } finally {
        leyendoLimites--
      }
    })()
    limites = { id, leido: Date.now(), valor }
  }
  return limites.valor
}
