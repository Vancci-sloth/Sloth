import { readdirSync, statSync, watch } from 'node:fs'
import { join } from 'node:path'
import type { Reinicio } from '../shared/types.ts'
import { correr } from './version.ts'

/**
 * Cuánto espera sin cambios y sin que nada trabaje antes de reiniciarse: el agente de la card Sloth suele tocar varios
 * archivos seguidos, y el reinicio no debe pillarlo a medias.
 */
const ESPERA = 20_000

/**
 * El reinicio solo. Cuando cambia un `.ts` de server/ o shared/ (lo edita el agente de la card Sloth, o tú), el servidor
 * se reinicia él mismo, como con «Reiniciar backend»: cuando lleva 20 s sin cambios y sin nada trabajando (`ocupado`). Si
 * algo empieza a trabajar mientras espera, vuelve a esperar. Antes comprueba los tipos: con un error no se reinicia, y lo
 * avisa para que el botón lo enseñe, hasta que algo vuelva a cambiar. `reiniciar` sale con el código que
 * scripts/start.mjs entiende como «vuelve a levantarme».
 */
export function reinicioSolo(app: string, ocupado: () => string | null, avisar: (r: Reinicio) => void, reiniciar: () => void) {
  let estado: Reinicio = { pendiente: false }
  // El último cambio, el último que ya se comprobó (y no compiló) y desde cuándo no trabaja nada.
  let cambio = 0
  let probado = 0
  let quieto = 0
  let probando = false

  // Cuándo se modificó cada .ts al arrancar. Windows también avisa cuando alguien solo LEE un archivo (le cambia la hora de
  // acceso): un typecheck o un Grep sobre server/ parecían cambios. Solo cuenta si cambia la fecha de modificación.
  const mtimes = new Map<string, number | null>()
  const mtime = (ruta: string) => {
    try {
      return statSync(ruta).mtimeMs
    } catch {
      return null // se borró
    }
  }
  for (const carpeta of ['server', 'shared']) {
    for (const nombre of readdirSync(join(app, carpeta), { recursive: true }) as string[]) {
      if (nombre.endsWith('.ts')) mtimes.set(join(app, carpeta, nombre), mtime(join(app, carpeta, nombre)))
    }
    const vigia = watch(join(app, carpeta), { recursive: true }, (_evento, nombre) => {
      if (!String(nombre ?? '').endsWith('.ts')) return
      const ruta = join(app, carpeta, String(nombre))
      const ahora = mtime(ruta)
      if (ahora === (mtimes.get(ruta) ?? null)) return
      mtimes.set(ruta, ahora)
      cambio = Date.now()
      // Un error de antes ya no vale: lo que cambió puede ser el arreglo.
      if (!estado.pendiente || estado.error) avisar((estado = { pendiente: true }))
    })
    // Sin esto, un error del vigilante (la carpeta se movió, un permiso) tumbaba el servidor.
    vigia.on('error', (e) => console.error(`reinicio: dejé de vigilar ${carpeta}:`, e.message))
  }

  setInterval(async () => {
    if (!cambio || cambio === probado || probando) return
    if (ocupado()) return void (quieto = 0)
    quieto ||= Date.now()
    if (Date.now() - Math.max(cambio, quieto) < ESPERA) return
    const este = cambio
    probando = true
    try {
      await correr('npm run typecheck', app)
    } catch (error) {
      probado = este
      const salida = error instanceof Error ? error.message : String(error)
      const errores = salida.split('\n').filter((l) => /error TS\d+/.test(l))
      if (cambio === este) avisar((estado = { pendiente: true, error: errores.length ? errores.join('\n') : salida }))
      return
    } finally {
      probando = false
    }
    // Mientras comprobaba pudo cambiar algo más (se comprobará eso) o empezar a trabajar un agente (se esperará).
    if (cambio !== este || ocupado()) return void (quieto = 0)
    console.log('Cambió el servidor y nada trabaja: me reinicio para aplicarlo.')
    reiniciar()
  }, 2000).unref()

  return { estado: () => estado }
}
