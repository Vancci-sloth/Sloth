import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, unlinkSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { MODELO3D_CARD } from '../shared/modelos3d.ts'
import type { SessionMeta } from '../shared/types.ts'
import type { SkillRef } from './agent.ts'
import { cuerpo, json } from './http.ts'

/**
 * Lo que se hace desde «Modelos 3D» además de mirar (`web/src/Modelos3DAcciones.tsx`):
 *  - `POST /api/modelos3d/importar?nombre=…&categoria=…&licencia=…`, con el .glb de cuerpo: `modelos.py importar` lo mete
 *    en la biblioteca y le saca la vista, sin agente. Llega a una carpeta temporal que se borra al terminar: queda una sola
 *    copia, la de la biblioteca. Uno a la vez.
 *  - `POST /api/modelos3d/nuevo` `{ descripcion, referencia?, model?, effort? }`: abre un hilo de `MODELO3D_CARD` (no sale
 *    en el inicio) en una carpeta propia, `<trabajo>/modelos-3d/<nombre>`: dos a la vez no se pisan. `referencia` es una
 *    imagen ya subida con `/api/upload`, que va en el mensaje como cualquier imagen.
 * Quitarlo es borrar este archivo, su línea en `server/index.ts`, `shared/modelos3d.ts` y `Modelos3DAcciones`.
 */

const SKILL = 'modelos-3d'
const TOPE_GLB = 300 * 1024 * 1024
const IMAGENES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/** «Caja Fuerte!» → `caja-fuerte`, como `slug` de modelos.py. */
export const idDe = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'modelo'

/** El primer mensaje del hilo: lo pedido y por dónde empieza la skill (su §6). */
export function mensajeNuevo(descripcion: string, conImagen: boolean): string {
  const pide = 'Hazme un modelo 3D nuevo para la biblioteca de «Modelos 3D», sin video: sigue la skill modelos-3d, «Un modelo sin video».'
  const imagen = conImagen ? '\nLa imagen que te mando es la referencia: mírala antes de modelar.' : ''
  return `${pide}${imagen}\n\n${descripcion.trim()}`
}

export interface Ejecucion {
  codigo: number
  salida: string
}

/** Corre un programa y junta lo que dice. */
export function ejecutar(programa: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<Ejecucion> {
  return new Promise((ok) => {
    let salida = ''
    const p = spawn(programa, args, { cwd, env: { ...process.env, ...env, PYTHONUTF8: '1' }, windowsHide: true })
    p.stdout.on('data', (d) => (salida += d))
    p.stderr.on('data', (d) => (salida += d))
    p.on('error', (e) => ok({ codigo: -1, salida: e.message }))
    p.on('close', (codigo) => ok({ codigo: codigo ?? -1, salida }))
  })
}

export interface Dependencias {
  sessions: {
    create(input: { cardId: string; title: string; model: string; effort?: string; cwd: string }): SessionMeta
    send(id: string, text: string, skill?: SkillRef, images?: string[]): void
  }
  skillRef(nombre: string): SkillRef | undefined
  /** Lo elegido en la interfaz si es un modelo que hay; si no, el de por omisión. */
  modelo(pedido: { model?: string; effort?: string }): { model: string; effort?: string } | undefined
  /** Donde `/api/upload` deja lo que se sube: de ahí, y solo de ahí, la imagen de referencia. */
  adjuntos: string
  /** La carpeta de la skill `modelos-3d`. */
  biblioteca: string
  /** Donde trabajan los hilos de modelos y las importaciones: `<trabajo>/modelos-3d`. */
  trabajo: string
  /** El Python con que correr `modelos.py`. */
  python(): string
  /** Para probar sin correr Python. */
  ejecutar?: typeof ejecutar
}

/** Lo que dicen las últimas líneas de una salida larga. */
const cola = (s: string) => s.trim().split(/\r?\n/).slice(-4).join('\n')

/**
 * Borra una carpeta temporal de importación. Si `modelos.py` se cortó, su proyecto de prueba puede seguir ahí con su
 * `node_modules`, que es un enlace a la carpeta que comparten los videos: se quita el enlace antes, para no vaciarla.
 */
function borrar(carpeta: string) {
  const nm = join(carpeta, 'proyecto', 'node_modules')
  try {
    if (lstatSync(nm).isSymbolicLink()) (process.platform === 'win32' ? rmdirSync : unlinkSync)(nm)
  } catch {
    // No hay enlace: nada que quitar.
  }
  if (existsSync(nm)) return console.error(`Modelos 3D: ${nm} no es un enlace; se deja ${carpeta}.`)
  rmSync(carpeta, { recursive: true, force: true })
}

export function modelos3dAcciones(d: Dependencias) {
  let importando = false
  const run = d.ejecutar ?? ejecutar
  const existe = (id: string) => ['modelos', 'plantilla'].some((c) => existsSync(join(d.biblioteca, c, id, 'modelo.json')))

  async function importar(req: IncomingMessage, res: ServerResponse, pedido: URL) {
    const nombre = (pedido.searchParams.get('nombre') ?? '').trim()
    const categoria = (pedido.searchParams.get('categoria') ?? 'Objetos').trim()
    const licencia = (pedido.searchParams.get('licencia') ?? '').trim()
    if (!nombre) return json(res, 400, { error: 'Ponle nombre al modelo.' })
    if (Number(req.headers['content-length'] ?? 0) > TOPE_GLB) return json(res, 413, { error: 'El archivo pasa de 300 MB.' })
    if (importando) return json(res, 409, { error: 'Ya se está importando un modelo. Espera a que termine.' })
    if (existe(idDe(nombre))) return json(res, 409, { error: `Ya hay un modelo «${idDe(nombre)}» en la biblioteca: ponle otro nombre.` })
    importando = true
    mkdirSync(d.trabajo, { recursive: true })
    const tmp = mkdtempSync(join(d.trabajo, '.importar-'))
    try {
      const archivo = join(tmp, 'modelo.glb')
      let recibidos = 0
      await pipeline(
        req,
        async function* (trozos: AsyncIterable<Buffer>) {
          for await (const t of trozos) {
            recibidos += t.length
            if (recibidos > TOPE_GLB) throw new Error('El archivo pasa de 300 MB.')
            yield t
          }
        },
        createWriteStream(archivo)
      )
      const args = ['-B', '-X', 'utf8', join(d.biblioteca, 'scripts', 'modelos.py'), 'importar', archivo, '--nombre', nombre, '--categoria', categoria, '--proyecto', join(tmp, 'proyecto')]
      if (licencia) args.push('--licencia', licencia)
      const r = await run(d.python(), args, tmp, { SLOTH_SKILLS: dirname(d.biblioteca) })
      const id = /^importado: (\S+)$/m.exec(r.salida)?.[1]
      if (r.codigo !== 0 || !id) return json(res, 500, { error: cola(r.salida) || 'No se pudo importar el modelo.' })
      return json(res, 200, { id })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    } finally {
      borrar(tmp)
      importando = false
    }
  }

  async function nuevo(req: IncomingMessage, res: ServerResponse) {
    const i = await cuerpo<{ descripcion?: string; referencia?: string; model?: string; effort?: string }>(req)
    const descripcion = String(i.descripcion ?? '').trim()
    if (!descripcion) return json(res, 400, { error: 'Describe el objeto que quieres.' })
    const referencia = i.referencia ? resolve(String(i.referencia)) : undefined
    if (referencia && (!referencia.startsWith(resolve(d.adjuntos) + sep) || !IMAGENES.has(extname(referencia).toLowerCase()) || !existsSync(referencia)))
      return json(res, 400, { error: 'La imagen de referencia tiene que ser una PNG, JPG, WebP o GIF subida desde Sloth.' })
    const modelo = d.modelo(i)
    if (!modelo) return json(res, 409, { error: 'Todavía no hay ningún agente con que hacerlo.' })
    // Su carpeta, con las primeras palabras de lo pedido: una nueva por hilo, aunque se pida lo mismo dos veces.
    const base = idDe(descripcion.split(/\s+/).slice(0, 4).join(' ')).slice(0, 40).replace(/-+$/, '')
    let cwd = join(d.trabajo, base)
    for (let n = 2; existsSync(cwd); n++) cwd = join(d.trabajo, `${base}-${n}`)
    mkdirSync(cwd, { recursive: true })
    const title = `Modelo 3D: ${descripcion.split('\n')[0]}`.slice(0, 80)
    const meta = d.sessions.create({ cardId: MODELO3D_CARD.id, title, model: modelo.model, effort: modelo.effort, cwd })
    d.sessions.send(meta.id, mensajeNuevo(descripcion, !!referencia), d.skillRef(SKILL), referencia ? [referencia] : [])
    return json(res, 200, meta)
  }

  async function api(req: IncomingMessage, res: ServerResponse, pedido: URL): Promise<boolean> {
    if (req.method !== 'POST') return false
    if (pedido.pathname === '/api/modelos3d/importar') return importar(req, res, pedido)
    if (pedido.pathname === '/api/modelos3d/nuevo') return nuevo(req, res)
    return false
  }

  /** Para «Reiniciar backend»: no cortar una importación a medias. */
  const ocupado = () => (importando ? 'Se está importando un modelo 3D. Espera a que termine.' : null)

  return { api, ocupado }
}
