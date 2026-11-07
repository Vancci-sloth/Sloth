import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { esColor, idDe, type ColorProyecto, type Proyecto, type SerieProyecto } from '../shared/proyectos.ts'
import { guardar } from './disco.ts'
import { cuerpo as body, json as send } from './http.ts'

/**
 * Proyectos y series. Cada proyecto es una carpeta en `data/proyectos/<id>/`:
 *
 * - `proyecto.json` con `{ id, nombre, color, logo?, creado, archivado? }`
 * - `MEMORIA.md`: lo que el agente tiene que saber de la marca (nicho, tono, público, reglas, cierre)
 * - `series/<serieId>/serie.json` y `series/<serieId>/MEMORIA.md`
 *
 * Nada se borra: archivar es una marca (`archivado`). Un hilo guarda el id de su proyecto y de su serie (`SessionMeta`);
 * al crearlo, su primer mensaje lleva las líneas `Proyecto:`, `MemoriaProyecto:` y `MemoriaSerie:` (`lineasDe`), y el
 * texto de las memorias le llega al agente, sea cual sea el proveedor, al principio de su primer turno (`contexto`,
 * que `Sessions` antepone en un solo sitio).
 */

/** Las secciones de la memoria de un proyecto nuevo. */
export const PLANTILLA = (nombre: string) => `# ${nombre}

Lo que el agente tiene que saber de este proyecto antes de hacer un video. Lo lee al empezar cada hilo del proyecto.

## Marca

## Tono

## Público

## Reglas

## Cierre
`

/** La memoria de una serie nueva. */
export const PLANTILLA_SERIE = (nombre: string, proyecto: string) => `# ${nombre} (${proyecto})

Qué es la serie, cómo se elige el tema, qué tiene que pasar en cada episodio y cómo cierra.

## Formato

## Tema

## Reglas

## Cierre
`

export class Proyectos {
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  private carpeta = (id: string, serie?: string) => (serie ? join(this.dir, id, 'series', serie) : join(this.dir, id))

  /** La ruta absoluta de la memoria del proyecto, o de su serie. */
  rutaMemoria(id: string, serie?: string) {
    return join(this.carpeta(id, serie), 'MEMORIA.md')
  }

  private leerJson<T>(archivo: string): T | null {
    try {
      return JSON.parse(readFileSync(archivo, 'utf8')) as T
    } catch {
      return null
    }
  }

  private seriesDe(id: string): SerieProyecto[] {
    const dir = join(this.dir, id, 'series')
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => {
        const s = this.leerJson<SerieProyecto>(join(dir, d.name, 'serie.json'))
        return s?.id ? [s] : []
      })
      .sort((a, b) => a.creado - b.creado)
  }

  /** Un proyecto con sus series (también las archivadas). */
  get(id: string): Proyecto | null {
    if (!/^[\w-]+$/.test(id)) return null
    const p = this.leerJson<Omit<Proyecto, 'series'>>(join(this.dir, id, 'proyecto.json'))
    return p?.id ? { ...p, series: this.seriesDe(id) } : null
  }

  /** Todos, del más viejo al más nuevo. Sin `archivados`, solo los vivos, y en cada uno solo sus series vivas. */
  listar(archivados = false): Proyecto[] {
    return readdirSync(this.dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => {
        const p = this.get(d.name)
        return p ? [p] : []
      })
      .filter((p) => archivados || !p.archivado)
      .map((p) => (archivados ? p : { ...p, series: p.series.filter((s) => !s.archivado) }))
      .sort((a, b) => a.creado - b.creado)
  }

  private libre(base: string, usado: (id: string) => boolean) {
    let id = base
    for (let k = 2; usado(id); k++) id = `${base}-${k}`
    return id
  }

  private guardarProyecto(p: Proyecto) {
    const { series: _, ...resto } = p
    guardar(join(this.dir, p.id, 'proyecto.json'), JSON.stringify(resto, null, 2) + '\n')
  }

  crear(input: { nombre: string; color?: string; logo?: string }): Proyecto {
    const nombre = limpiar(input.nombre)
    if (!nombre) throw new Error('Escribe un nombre.')
    const id = this.libre(idDe(nombre), (i) => existsSync(join(this.dir, i)))
    mkdirSync(join(this.dir, id, 'series'), { recursive: true })
    const p: Proyecto = { id, nombre, color: esColor(input.color) ? input.color : 'ambar', ...(input.logo ? { logo: input.logo } : {}), creado: Date.now(), series: [] }
    this.guardarProyecto(p)
    guardar(this.rutaMemoria(id), PLANTILLA(nombre))
    return p
  }

  /** Renombrar, cambiar el color o el logo, archivar o desarchivar. */
  actualizar(id: string, cambios: { nombre?: string; color?: string; logo?: string | null; archivado?: boolean }): Proyecto {
    const p = this.get(id)
    if (!p) throw new Error('No existe ese proyecto.')
    if (cambios.nombre !== undefined) {
      const nombre = limpiar(cambios.nombre)
      if (!nombre) throw new Error('Escribe un nombre.')
      p.nombre = nombre
    }
    if (cambios.color !== undefined) {
      if (!esColor(cambios.color)) throw new Error('Ese color no es de la paleta.')
      p.color = cambios.color
    }
    if (cambios.logo === null || cambios.logo === '') delete p.logo
    else if (cambios.logo !== undefined) p.logo = cambios.logo
    if (cambios.archivado !== undefined) {
      if (cambios.archivado) p.archivado = true
      else delete p.archivado
    }
    this.guardarProyecto(p)
    return p
  }

  /** Archivar no borra nada: el proyecto, sus series y su memoria se quedan en disco. */
  archivar(id: string, si = true) {
    return this.actualizar(id, { archivado: si })
  }

  crearSerie(id: string, input: { nombre: string }): SerieProyecto {
    const p = this.get(id)
    if (!p) throw new Error('No existe ese proyecto.')
    const nombre = limpiar(input.nombre)
    if (!nombre) throw new Error('Escribe un nombre.')
    const sid = this.libre(idDe(nombre), (i) => existsSync(this.carpeta(id, i)))
    mkdirSync(this.carpeta(id, sid), { recursive: true })
    const s: SerieProyecto = { id: sid, nombre, creado: Date.now() }
    guardar(join(this.carpeta(id, sid), 'serie.json'), JSON.stringify(s, null, 2) + '\n')
    guardar(this.rutaMemoria(id, sid), PLANTILLA_SERIE(nombre, p.nombre))
    return s
  }

  actualizarSerie(id: string, sid: string, cambios: { nombre?: string; archivado?: boolean }): SerieProyecto {
    const s = this.get(id)?.series.find((x) => x.id === sid)
    if (!s) throw new Error('No existe esa serie.')
    if (cambios.nombre !== undefined) {
      const nombre = limpiar(cambios.nombre)
      if (!nombre) throw new Error('Escribe un nombre.')
      s.nombre = nombre
    }
    if (cambios.archivado !== undefined) {
      if (cambios.archivado) s.archivado = true
      else delete s.archivado
    }
    guardar(join(this.carpeta(id, sid), 'serie.json'), JSON.stringify(s, null, 2) + '\n')
    return s
  }

  leerMemoria(id: string, serie?: string): string {
    if (!this.existe(id, serie)) throw new Error(serie ? 'No existe esa serie.' : 'No existe ese proyecto.')
    try {
      return readFileSync(this.rutaMemoria(id, serie), 'utf8')
    } catch {
      return ''
    }
  }

  escribirMemoria(id: string, serie: string | undefined, texto: string) {
    if (!this.existe(id, serie)) throw new Error(serie ? 'No existe esa serie.' : 'No existe ese proyecto.')
    guardar(this.rutaMemoria(id, serie), texto.replace(/\r\n/g, '\n'))
  }

  private existe(id: string, serie?: string) {
    const p = this.get(id)
    return !!p && (!serie || p.series.some((s) => s.id === serie))
  }

  /**
   * Las líneas de control del primer mensaje de un hilo del proyecto (y de su serie), que leen las skills
   * (`skills/video-base/PROYECTOS.md`). Nada si el proyecto no existe.
   */
  lineasDe(proyecto?: string, serie?: string): string[] {
    const p = proyecto ? this.get(proyecto) : null
    if (!p) return []
    const s = serie ? p.series.find((x) => x.id === serie) : undefined
    return [
      `Proyecto: ${p.nombre}${s ? ` · serie ${s.nombre}` : ''}`,
      `MemoriaProyecto: ${this.rutaMemoria(p.id)}`,
      ...(s ? [`MemoriaSerie: ${this.rutaMemoria(p.id, s.id)}`] : [])
    ]
  }

  /**
   * El bloque de contexto con el texto de las memorias, para el principio del primer turno del agente. Va para todos
   * los proveedores por igual: `Sessions` lo antepone al mensaje que manda, no a lo que se ve en el hilo.
   */
  contexto(proyecto?: string, serie?: string): string {
    const p = proyecto ? this.get(proyecto) : null
    if (!p) return ''
    const partes: string[] = []
    const mem = this.leerMemoria(p.id).trim()
    if (mem) partes.push(`### Memoria del proyecto ${p.nombre} (${this.rutaMemoria(p.id)})\n\n${mem}`)
    const s = serie ? p.series.find((x) => x.id === serie) : undefined
    if (s) {
      const ms = this.leerMemoria(p.id, s.id).trim()
      if (ms) partes.push(`### Memoria de la serie ${s.nombre} (${this.rutaMemoria(p.id, s.id)})\n\n${ms}`)
    }
    if (!partes.length) return ''
    return `<contexto-del-proyecto>
Este hilo es del proyecto ${p.nombre}${s ? `, serie ${s.nombre}` : ''}. Respeta su memoria: manda sobre lo general del estilo en marca, tono, público, reglas y cierre. Al cerrar el video, propón (sin escribirlo tú) qué agregar a la memoria.

${partes.join('\n\n')}
</contexto-del-proyecto>

`
  }

  /** `/api/proyectos…`. Devuelve si atendió la ruta. */
  async api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/api/proyectos')) return false
    const method = req.method ?? 'GET'
    const intentar = async (f: () => unknown | Promise<unknown>) => {
      try {
        send(res, 200, await f())
      } catch (e) {
        send(res, 400, { error: e instanceof Error ? e.message : String(e) })
      }
      return true
    }
    if (path === '/api/proyectos' && method === 'GET') return intentar(() => this.listar(true))
    if (path === '/api/proyectos' && method === 'POST') return intentar(async () => this.crear(await body(req)))
    const m = /^\/api\/proyectos\/([\w-]+)(?:\/series(?:\/([\w-]+))?)?(\/memoria)?$/.exec(path)
    if (!m) return false
    const [, id, serie, memoria] = m
    const conSeries = path.includes('/series')
    if (memoria) {
      if (method === 'GET') return intentar(() => ({ texto: this.leerMemoria(id, serie), ruta: this.rutaMemoria(id, serie) }))
      if (method === 'POST') return intentar(async () => (this.escribirMemoria(id, serie, String((await body<{ texto?: string }>(req)).texto ?? '')), { ok: true }))
      return false
    }
    if (conSeries && !serie && method === 'POST') return intentar(async () => this.crearSerie(id, await body(req)))
    if (serie && method === 'POST') return intentar(async () => this.actualizarSerie(id, serie, await body(req)))
    if (!conSeries && method === 'GET') return intentar(() => this.get(id) ?? Promise.reject(new Error('No existe ese proyecto.')))
    if (!conSeries && method === 'POST') return intentar(async () => this.actualizar(id, await body(req)))
    return false
  }
}

/** Una línea, sin espacios de sobra, del largo de un título. */
const limpiar = (t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
