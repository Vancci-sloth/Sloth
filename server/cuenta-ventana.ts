import type { Proveedor } from '../shared/providers.ts'
import { NOMBRE_AGENTE } from '../shared/providers.ts'
import type { CuentaClaude } from '../shared/types.ts'
import { execFile } from 'node:child_process'
import { entornoSinLlaves } from './acceso.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { enVentana } from './cuenta.ts'
import { CLAUDE_ORIGINAL, entornoPerfilAgente, perfilesAgente } from './perfiles-agentes.ts'

/**
 * La cuenta de un agente que inicia sesión en su propio programa (`grok login`, `muse login`, `/login` de Pi), como la de
 * Claude: «Conectar» lo baja si falta y abre su ventana; al cerrarla, se mira si quedó conectada. VyMotion no toca el código
 * ni las credenciales: las guarda el agente, donde las guarda siempre.
 */
export type Estado = Pick<CuentaClaude, 'conectada' | 'quien' | 'plan' | 'llavesSloth'>
const autorizando = new Map<Proveedor, string>()
export const perfilVentanaAutorizando = (p: Proveedor, id: string) => autorizando.get(p) === id
const escuchas = new Set<() => void>()
export const alAutorizarPerfil = (f: () => void) => { escuchas.add(f) }

export function cuentaConVentana(
  p: Proveedor,
  o: {
    /** El comando que inicia sesión, con el programa ya bajado. */
    comando(exe: string): { command: string[]; env?: Record<string, string> }
    /** Si hay sesión, sin abrir nada que se vea. */
    estado(dir?: string): Promise<Estado>
    /** Lo que cierra la sesión, sin ventana (`grok logout`), si el agente lo tiene. */
    salir?(exe: string): { command: string[]; env?: Record<string, string> }
  }
) {
  const perfiles = perfilesAgente(p)
  let login: string | undefined
  let fallo = ''
  let conocida: CuentaClaude | null = null

  async function cuenta(fresco = false): Promise<CuentaClaude> {
    // Sin el programa no hay sesión: mirarla no lo baja; conectarla, sí.
    if (login || !rutaAgente(p)) return { ...conocida, conectada: !!conocida?.conectada, conectando: login ? {} : undefined, error: fallo || undefined }
    if (conocida && !fresco && !login) return conocida
    const id = perfiles.leer().activa
    const s = await o.estado(perfiles.configuracion(id)).catch((): Estado => ({ conectada: false }))
    if (id !== perfiles.leer().activa) return cuenta(fresco)
    const c: CuentaClaude = { ...s, conectando: login ? {} : undefined, error: fallo || undefined }
    conocida = s.conectada && !login ? c : null
    return c
  }

  function conectar(perfil?: string): Promise<CuentaClaude> {
    if (!login) {
      const estado = perfiles.leer()
      const id = perfil === 'nuevo' ? perfiles.nuevo() : perfil ?? estado.activa
      if (perfil !== 'nuevo' && id !== CLAUDE_ORIGINAL && !estado.perfiles.some(x => x.id === id)) throw new Error('Perfil desconocido.')
      const dir = perfiles.configuracion(id)
      login = id
      autorizando.set(p, id)
      fallo = ''
      conocida = null
      void asegurarAgente(p)
        .then((exe) => {
          const c = o.comando(exe)
          return enVentana(NOMBRE_AGENTE[p], c.command, { ...c.env, ...entornoPerfilAgente(p, dir) })
        })
        .then(
          async () => {
            const s = await o.estado(dir)
            if (!s.conectada) throw new Error('No se terminó de iniciar sesión. Vuelve a intentarlo.')
            perfiles.autorizar(id, s.quien ?? `Cuenta ${id.slice(0, 6)}`)
            for (const f of escuchas) f()
          },
          (e: Error) => (fallo = e.message)
        )
        .catch((e: Error) => { fallo = e.message })
        .finally(() => { login = undefined; autorizando.delete(p) })
    }
    return cuenta()
  }

  /** Cierra la sesión con el comando del agente, que borra sus credenciales, y mira cómo quedó. */
  const salir = o.salir && (async () => {
    const exe = rutaAgente(p)
    if (exe) {
      const [command, ...args] = o.salir!(exe).command
      await new Promise<void>((ok) => execFile(command, args, { timeout: 30_000, windowsHide: true, env: { ...entornoSinLlaves(), ...o.salir!(exe).env, ...entornoPerfilAgente(p, perfiles.configuracion(perfiles.leer().activa)) } }, () => ok()))
    }
    conocida = null
    return cuenta(true)
  })

  return {
    cuenta,
    conectar,
    usar(id: string) {
      if (login) throw new Error('Termina el inicio de sesión primero.')
      perfiles.usar(id)
      conocida = null
      fallo = ''
      return cuenta()
    },
    ...(salir ? { salir } : {}),
    conectando: () => (login ? `Se está conectando la cuenta de ${NOMBRE_AGENTE[p]}. Termina de autorizarla primero.` : null)
  }
}
