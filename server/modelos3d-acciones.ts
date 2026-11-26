import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, unlinkSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { MAX_PROMPT_3D, MAX_REFERENCIAS_3D, MODELO3D_CARD, OPERACIONES_3D, TIPOS_REFERENCIA_3D, type OperacionModelo3D, type TipoReferencia3D, type TrabajoModelo3D } from '../shared/modelos3d.ts'
import type { Model, SessionMeta } from '../shared/types.ts'
import { proveedorDe } from '../shared/providers.ts'
import type { SkillRef } from './agent.ts'
import { cuerpo, json } from './http.ts'
import { LIMITE_MARCAS, LIMITE_PUNTOS_MARCA } from '../shared/estilos-imagen.ts'
import { chatsPorModelo3D, tipoMarca3D, type PuntoModelo3D } from '../shared/modelos3d.ts'

/**
 * Lo que se hace desde «Modelos 3D» además de mirar (`web/src/Modelos3DAcciones.tsx`):
 *  - `POST /api/modelos3d/importar?nombre=…&categoria=…&licencia=…`, con el .glb de cuerpo: `modelos.py importar` lo mete
 *    en la biblioteca y le saca la vista, sin agente. Llega a una carpeta temporal que se borra al terminar: queda una sola
 *    copia, la de la biblioteca. Uno a la vez.
 *  - `POST /api/modelos3d/nuevo`: abre un hilo con un id de salida reservado. Las referencias ya subidas con
 *    `/api/upload` van en su mensaje. Con un modelo de origen, el resultado es una variante.
 *  - `POST /api/modelos3d/borrar`: quita un modelo guardado de `modelos/` después de la confirmación de la interfaz.
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
export function mensajeNuevo(descripcion: string, conImagen: boolean, trabajo?: TrabajoModelo3D, tipoReferencia?: TipoReferencia3D): string {
  const pide = trabajo?.editando ? `Continúa la edición del modelo «${trabajo.editando}» en este chat con la skill modelos-3d.` : 'Hazme un modelo 3D nuevo para la biblioteca de «Modelos 3D», sin video: sigue la skill modelos-3d, «Un modelo sin video».'
  const imagen = conImagen ? '\nCada imagen que te mando es una referencia. Mira todas y usa las proporciones, el perfil y los rasgos que permiten reconocer al sujeto. Antes de guardar, ejecuta modelos.py revisar con el id del modelo, abre sus tres renders y compara el ángulo más cercano con la referencia. Corrige las diferencias visibles y vuelve a renderizar.' : ''
  const tipo = tipoReferencia ? `\nClasificación de la referencia: «${TIPOS_REFERENCIA_3D.find((t) => t.id === tipoReferencia)?.nombre}». La categoría orienta la construcción. Conserva la identidad, el vestuario, las marcas y los materiales visibles aunque el texto del pedido sea breve.` : ''
  const operacion = trabajo?.operacion ? OPERACIONES_3D.find((o) => o.id === trabajo.operacion) : undefined
  const modo = operacion ? [
    `\nOperación elegida: «${operacion.nombre}».`,
    operacion.ayuda,
    operacion.detalle,
    `Conserva: ${operacion.conserva}`,
    `Entrega: ${operacion.resultado}`,
    'Ejecuta solo lo necesario, comprueba el resultado desde varios ángulos y resume las decisiones sin repetir el contexto.',
  ].join(' ') : ''
  const salida = trabajo ? modo + '\n' + [
    'Este pedido ya tiene su hilo y su carpeta. Construye el modelo aquí con modelos.py y revisa su render local. No abras Sloth ni vuelvas a enviar el pedido desde el formulario o la API.',
    `Guarda el resultado en la biblioteca con el id exacto «${trabajo.resultado}». Este id conecta el resultado con el editor de Sloth.`,
    trabajo.editando ? 'Edita el componente del id indicado en este proyecto. Si la carpeta aún no tiene package.json, inicialízala con modelos.py nuevo usando un id auxiliar libre, sin guardarlo. Si falta el componente que debes corregir, trae su código y archivos con modelos.py usar y el id indicado. Guarda la corrección bajo el mismo id y regenera sus vistas.'
      : trabajo.origen
      ? `Copia «${trabajo.origen}» al proyecto con la skill y úsalo como punto de partida. Crea un componente para el id de salida y conserva lo que el usuario no pidió cambiar. Si usa archivos propios, prepara las copias que necesite. No sobrescribas ni borres el modelo original.`
      : 'Entrega un modelo nuevo con este id, incluso si aprovechas uno de la biblioteca como punto de partida.',
    'Comprueba visualmente la silueta, los materiales y los cambios desde distintos ángulos antes de terminar.',
    'El usuario lee tu respuesta junto al visor 3D. Al guardar, resume el resultado en ese chat.'
  ].join('\n') : ''
  return `${pide}${imagen}${tipo}${salida}\n\n${descripcion.trim()}`
}

export interface Ejecucion {
  codigo: number
  salida: string
}

/** Corre un programa y junta lo que dice; con `limite` (ms), si tarda más, se le termina. */
export function ejecutar(programa: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, limite?: number): Promise<Ejecucion> {
  return new Promise((ok) => {
    let salida = ''
    const p = spawn(programa, args, { cwd, env: { ...process.env, ...env, PYTHONUTF8: '1' }, windowsHide: true, ...(limite ? { timeout: limite } : {}) })
    p.stdout.on('data', (d) => (salida += d))
    p.stderr.on('data', (d) => (salida += d))
    p.on('error', (e) => ok({ codigo: -1, salida: e.message }))
    p.on('close', (codigo) => ok({ codigo: codigo ?? -1, salida }))
  })
}

export interface Dependencias {
  sessions: {
    create(input: { cardId: string; title: string; model: string; effort?: string; cwd: string; modelo3d?: TrabajoModelo3D }): SessionMeta
    list(): SessionMeta[]
    setModel(id: string, model: string, effort?: string): void
    editarModelo3D(id: string, modelo: string): void
    steer(id: string, text: string, images?: string[], visible?: string): void
    send(id: string, text: string, skill?: SkillRef, images?: string[], visible?: string): void
  }
  skillRef(nombre: string): SkillRef | undefined
  rutaHistorial(id: string): string
  modelos(): Model[]
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

  async function borrarModelo(req: IncomingMessage, res: ServerResponse) {
    const i = await cuerpo<{ id?: string }>(req)
    const id = typeof i?.id === 'string' ? i.id.trim() : ''
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return json(res, 400, { error: 'El modelo no es válido.' })
    const carpeta = join(d.biblioteca, 'modelos', id)
    if (!lstatSync(join(carpeta, 'modelo.json'), { throwIfNoEntry: false })?.isFile()) return json(res, 404, { error: 'Ese modelo ya no está en la biblioteca.' })
    rmSync(carpeta, { recursive: true, force: true })
    return json(res, 200, { id, borrado: true })
  }

  async function nuevo(req: IncomingMessage, res: ServerResponse) {
    const i = await cuerpo<{ descripcion?: string; zonas?: PuntoModelo3D[][]; referencia?: string; referencias?: string[]; origen?: string; operacion?: string | null; tipoReferencia?: string; model?: string; effort?: string }>(req)
    const descripcion = typeof i?.descripcion === 'string' ? i.descripcion.trim() : ''
    if (!descripcion) return json(res, 400, { error: 'Describe el objeto que quieres.' })
    if (descripcion.length > MAX_PROMPT_3D) return json(res, 400, { error: `Describe el modelo en hasta ${MAX_PROMPT_3D} caracteres.` })
    const pedidas = i.referencias ?? (i.referencia ? [i.referencia] : [])
    const zonas = i.zonas ?? []
    if (!Array.isArray(zonas) || zonas.length > LIMITE_MARCAS || zonas.some(z => !Array.isArray(z) || !z.length || z.length > LIMITE_PUNTOS_MARCA ||
      z.some(p => !p || ![p.x, p.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100))))
      return json(res, 400, { error: 'La marca del visor no es válida.' })
    if (!Array.isArray(pedidas) || pedidas.length > MAX_REFERENCIAS_3D || pedidas.some((p) => typeof p !== 'string' || !p || p.includes('\0')))
      return json(res, 400, { error: `Puedes usar hasta ${MAX_REFERENCIAS_3D} imágenes de referencia.` })
    const referencias = [...new Set(pedidas.map((p) => resolve(p)))]
    if (referencias.some((p) => dirname(p) !== resolve(d.adjuntos) || !IMAGENES.has(extname(p).toLowerCase()) || !lstatSync(p, { throwIfNoEntry: false })?.isFile()))
      return json(res, 400, { error: 'Usa imágenes PNG, JPG, WebP o GIF subidas desde Sloth.' })
    const origen = i.origen
    const grupo = origen ? chatsPorModelo3D(d.sessions.list()).get(origen) : undefined
    const previo = grupo?.[0]
    const enCurso = !!(previo?.running || previo?.background?.length)
    const destinoActual = previo?.modelo3d?.editando ?? previo?.modelo3d?.resultado
    const tipoReferencia = TIPOS_REFERENCIA_3D.some((t) => t.id === i.tipoReferencia) ? i.tipoReferencia as TipoReferencia3D : undefined
    if (origen !== undefined && (typeof origen !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(origen)
      || (!(enCurso && origen === destinoActual) && !lstatSync(join(d.biblioteca, 'modelos', origen, 'modelo.json'), { throwIfNoEntry: false })?.isFile())))
      return json(res, 404, { error: 'El modelo que quieres editar ya no está en la biblioteca.' })
    const porDefecto = origen ? (i.operacion === null ? undefined : 'mejorar') : referencias.length ? 'imagen' : 'texto'
    const operacion = OPERACIONES_3D.find(o => o.id === i.operacion)?.id ?? porDefecto
    const catalogo = d.modelos()
    const eleccion = i.model ?? previo?.model
    const modelo = eleccion === undefined
      ? catalogo.find((m) => proveedorDe(m.id) === 'claude') ?? catalogo[0]
      : catalogo.find((m) => m.id === eleccion)
    if (!modelo) return json(res, 409, { error: i.model ? 'El modelo elegido ya no está disponible. Selecciona otro para continuar.' : 'Todavía no hay ningún agente con que hacerlo.' })
    const marcas = zonas.map((z, n) => `${tipoMarca3D(z)} ${n + 1}: ${z.map(p => `${p.x},${p.y}`).join(' ')}`)
    const pedido = marcas.length ? `${descripcion}\n\nMarcas en la vista fijada (x e y de 0 a 100, desde la esquina superior izquierda):\n${marcas.join('\n')}` : descripcion
    const effort = i.effort && modelo.efforts.includes(i.effort) ? i.effort : modelo.defaultEffort
    if (previo && origen) {
      if (enCurso && (modelo.id !== previo.model || origen !== destinoActual))
        return json(res, 409, { error: 'Espera a que termine la edición actual para cambiar de versión o de agente.' })
      if (previo.model !== modelo.id) d.sessions.setModel(previo.id, modelo.id, effort)
      d.sessions.editarModelo3D(previo.id, origen)
      const historiales = grupo?.slice(1).map(s => d.rutaHistorial(s.id)) ?? []
      const contexto = historiales.length ? `Mensajes de las versiones anteriores de este modelo, por si necesitas consultar una decisión previa:\n${historiales.join('\n')}\n\n` : ''
      const mensaje = contexto + mensajeNuevo(pedido, !!referencias.length, { resultado: origen, editando: origen, operacion }, tipoReferencia)
      d.sessions.steer(previo.id, mensaje, referencias, descripcion)
      return json(res, 200, previo)
    }
    // Los modelos importados abren su primer chat aquí. Cada chat conserva su carpeta durante las correcciones.
    const base = origen ? origen.slice(0, 40).replace(/-+$/, '') + '-variante' : idDe(descripcion.split(/\s+/).slice(0, 4).join(' ')).slice(0, 40).replace(/-+$/, '')
    let cwd = join(d.trabajo, base)
    for (let n = 2; existsSync(cwd) || existe(basename(cwd)); n++) cwd = join(d.trabajo, `${base}-${n}`)
    mkdirSync(cwd, { recursive: true })
    const title = `Modelo 3D: ${origen ?? descripcion.split('\n')[0]}`.slice(0, 80)
    const modelo3d = { resultado: origen ?? basename(cwd), ...(origen ? { editando: origen } : {}), operacion }
    const meta = d.sessions.create({ cardId: MODELO3D_CARD.id, title, model: modelo.id, effort, cwd, modelo3d })
    d.sessions.send(meta.id, mensajeNuevo(pedido, !!referencias.length, modelo3d, tipoReferencia), d.skillRef(SKILL), referencias, descripcion)
    return json(res, 200, meta)
  }

  async function api(req: IncomingMessage, res: ServerResponse, pedido: URL): Promise<boolean> {
    if (req.method !== 'POST') return false
    if (pedido.pathname === '/api/modelos3d/importar') return importar(req, res, pedido)
    if (pedido.pathname === '/api/modelos3d/borrar') return borrarModelo(req, res)
    if (pedido.pathname === '/api/modelos3d/nuevo') return nuevo(req, res)
    return false
  }

  /** Para «Reiniciar backend»: no cortar una importación a medias. */
  const ocupado = () => (importando ? 'Se está importando un modelo 3D. Espera a que termine.' : null)

  return { api, ocupado }
}
