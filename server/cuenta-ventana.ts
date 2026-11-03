import type { Proveedor } from '../shared/providers.ts'
import { NOMBRE_AGENTE } from '../shared/providers.ts'
import type { CuentaClaude } from '../shared/types.ts'
import { execFile } from 'node:child_process'
import { entornoSinLlaves } from './acceso.ts'
import { asegurarAgente, rutaAgente } from './agentes.ts'
import { enVentana } from './cuenta.ts'

/**
 * La cuenta de un agente que inicia sesión en su propio programa (`grok login`, `muse login`, `/login` de Pi), como la de
 * Claude: «Conectar» lo baja si falta y abre su ventana; al cerrarla, se mira si quedó conectada. Sloth no toca el código
 * ni las credenciales: las guarda el agente, donde las guarda siempre.
 */
export type Estado = Pick<CuentaClaude, 'conectada' | 'quien' | 'plan' | 'llavesSloth'>

export function cuentaConVentana(
  p: Proveedor,
  o: {
    /** El comando que inicia sesión, con el programa ya bajado. */
    comando(exe: string): { command: string[]; env?: Record<string, string> }
    /** Si hay sesión, sin abrir nada que se vea. */
    estado(): Promise<Estado>
    /** Lo que cierra la sesión, sin ventana (`grok logout`), si el agente lo tiene. */
    salir?(exe: string): { command: string[]; env?: Record<string, string> }
  }
) {
  let login = false
  let fallo = ''
  let conocida: CuentaClaude | null = null

  async function cuenta(fresco = false): Promise<CuentaClaude> {
    // Sin el programa no hay sesión: mirarla no lo baja; conectarla, sí.
    if (!rutaAgente(p)) return { conectada: false, conectando: login ? {} : undefined, error: fallo || undefined }
    if (conocida && !fresco && !login) return conocida
    const s = await o.estado().catch((): Estado => ({ conectada: false }))
    const c: CuentaClaude = { ...s, conectando: login ? {} : undefined, error: fallo || undefined }
    conocida = s.conectada && !login ? c : null
    return c
  }

  function conectar(): Promise<CuentaClaude> {
    if (!login) {
      login = true
      fallo = ''
      conocida = null
      void asegurarAgente(p)
        .then((exe) => {
          const c = o.comando(exe)
          return enVentana(NOMBRE_AGENTE[p], c.command, c.env)
        })
        .then(
          async () => {
            if (!(await o.estado().catch(() => ({ conectada: false }))).conectada) fallo = 'No se terminó de iniciar sesión. Vuelve a intentarlo.'
          },
          (e: Error) => (fallo = e.message)
        )
        .finally(() => (login = false))
    }
    return cuenta()
  }

  /** Cierra la sesión con el comando del agente, que borra sus credenciales, y mira cómo quedó. */
  const salir = o.salir && (async () => {
    const exe = rutaAgente(p)
    if (exe) {
      const [command, ...args] = o.salir!(exe).command
      await new Promise<void>((ok) => execFile(command, args, { timeout: 30_000, windowsHide: true, env: { ...entornoSinLlaves(), ...o.salir!(exe).env } }, () => ok()))
    }
    conocida = null
    return cuenta(true)
  })

  return {
    cuenta,
    conectar,
    ...(salir ? { salir } : {}),
    conectando: () => (login ? `Se está conectando la cuenta de ${NOMBRE_AGENTE[p]}. Termina de autorizarla primero.` : null)
  }
}
