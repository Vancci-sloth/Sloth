import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, join, resolve, sep } from 'node:path'
import type { Card, SessionMeta } from '../shared/types.ts'
import type { SkillRef } from './agent.ts'
import { nombreAdjunto } from './agent.ts'
import { cuerpo, json } from './http.ts'

/**
 * Los modelos 3D que se hacen, se amplían o se importan desde «Modelos 3D» (`web/src/Modelos3D.tsx`):
 *  - `POST /api/modelos3d/nuevo`  `{ nombre, descripcion, referencia? }`: abre un hilo de la card «Nuevo modelo 3D» con el
 *    primer mensaje armado (`mensajeNuevo`); `referencia` es una imagen ya subida con `/api/upload`.
 *  - `POST /api/modelos3d/<id>/ampliar`  `{ que }`: lo mismo para hacerle una variante, una animación o los colores de un proyecto.
 *  - `POST /api/modelos3d/importar?nombre=…&categoria=…&licencia=…`: el cuerpo es el .glb; lo mete en la biblioteca con
 *    `modelos.py importar` y le saca la vista. Tarda lo que tarda esa vista.
 * El hilo trabaja en la carpeta de la card (`nuevo-modelo-3d`), que es el proyecto de prueba compartido.
 */

export const CARD_NUEVO_MODELO = 'nuevo-modelo-3d'
const SKILL = 'modelos-3d'
const TOPE_GLB = 300 * 1024 * 1024

/** Un id de modelo: minúsculas con guiones. */
export const idValido = (id: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)

/** «Caja fuerte» → `caja-fuerte`. */
export const idDe = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'modelo'

const linea = (n: string, v?: string) => (v?.trim() ? `${n}: ${v.trim()}` : '')

/** El primer mensaje de un modelo nuevo. */
export function mensajeNuevo(i: { nombre: string; descripcion: string; referencia?: string }, id = idDe(i.nombre)): string {
  return [
    `Hazme un modelo 3D nuevo para la biblioteca.`,
    linea('Nombre', i.nombre),
    linea('Id', id),
    linea('Descripción', i.descripcion),
    linea('Imagen de referencia', i.referencia),
    `Primero busca en la biblioteca (modelos.py buscar) por si ya hay uno parecido. Si no, arma el proyecto de prueba y el andamio con modelos.py nuevo ${id} --nombre "${i.nombre.trim()}" --descripcion "…"${i.referencia ? ' --referencia <la imagen>' : ''}, escribe el modelo, sácale la vista (modelos.py vista ${id}), mírala y guárdalo en la biblioteca (modelos.py guardar). Sigue la skill modelos-3d.`
  ]
    .filter(Boolean)
    .join('\n')
}

/** El primer mensaje para ampliar un modelo de la biblioteca. */
export function mensajeAmpliar(i: { id: string; nombre?: string; que: string }): string {
  return [
    `Amplía un modelo 3D de la biblioteca.`,
    linea('Modelo', `${i.nombre ? `${i.nombre} (` : ''}${i.id}${i.nombre ? ')' : ''}`),
    linea('Qué quiero', i.que),
    `Cópialo con modelos.py ampliar ${i.id} --que "${i.que.trim().replace(/"/g, "'")}" (queda como ${i.id}-v2, o el nombre que le des con --como; el original no se toca), modifícalo en el proyecto de prueba, sácale la vista (modelos.py vista) y guárdalo en la biblioteca (modelos.py guardar). Sigue la skill modelos-3d.`
  ]
    .filter(Boolean)
    .join('\n')
}

export interface Ejecucion {
  codigo: number
  salida: string
}

/** Corre un programa y junta lo que dice. */
export function ejecutar(programa: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<Ejecucion> {
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
  cards(): Card[]
  sessions: { create(input: { cardId: string; title: string; model: string; effort?: string; cwd: string }): SessionMeta; send(id: string, text: string, skill?: SkillRef): void }
  skillRef(nombre: string): SkillRef | undefined
  /** El modelo con que nace un hilo si la interfaz no dice cuál. */
  modeloPorOmision(): { model: string; effort?: string } | undefined
  /** Donde se guardan los .glb que llegan, antes de importarlos. */
  adjuntos: string
  /** La carpeta de la skill `modelos-3d`. */
  biblioteca: string
  /** El Python con que correr `modelos.py`. */
  python(): string
  /** Para probar sin correr Python. */
  ejecutar?: typeof ejecutar
}

/** Lo que dicen las últimas líneas de una salida larga. */
const cola = (s: string) => s.trim().split(/\r?\n/).slice(-8).join('\n')

export function modelos3dHilos(d: Dependencias) {
  let importando = false
  const run = d.ejecutar ?? ejecutar

  function existe(id: string) {
    return ['modelos', 'plantilla'].some((c) => existsSync(join(d.biblioteca, c, id, 'modelo.json')))
  }

  function abrirHilo(titulo: string, texto: string, modelo?: { model?: string; effort?: string }): SessionMeta | string {
    const card = d.cards().find((c) => c.id === CARD_NUEVO_MODELO)
    if (!card) return 'Falta la card «Nuevo modelo 3D».'
    const por = modelo?.model ? { model: modelo.model, effort: modelo.effort } : d.modeloPorOmision()
    if (!por) return 'No hay ningún modelo de agente disponible todavía.'
    mkdirSync(card.cwd, { recursive: true })
    const meta = d.sessions.create({ cardId: card.id, title: titulo.slice(0, 80), model: por.model, effort: por.effort, cwd: card.cwd })
    d.sessions.send(meta.id, texto, d.skillRef(SKILL))
    return meta
  }

  async function api(req: IncomingMessage, res: ServerResponse, pedido: URL): Promise<boolean> {
    const ruta = pedido.pathname
    if (req.method !== 'POST') return false

    if (ruta === '/api/modelos3d/nuevo') {
      const i = await cuerpo<{ nombre?: string; descripcion?: string; referencia?: string; model?: string; effort?: string }>(req)
      const nombre = String(i.nombre ?? '').trim()
      const descripcion = String(i.descripcion ?? '').trim()
      if (!nombre || !descripcion) return json(res, 400, { error: 'Escribe el nombre y qué es el modelo.' })
      if (i.referencia && !resolve(String(i.referencia)).startsWith(resolve(d.adjuntos) + sep)) return json(res, 400, { error: 'La imagen de referencia tiene que ser una subida desde Sloth.' })
      const id = idDe(nombre)
      if (existe(id)) return json(res, 409, { error: `Ya hay un modelo «${id}» en la biblioteca: ábrelo y pulsa «Ampliar».` })
      const meta = abrirHilo(`Modelo 3D: ${nombre}`, mensajeNuevo({ nombre, descripcion, referencia: i.referencia }, id), i)
      return typeof meta === 'string' ? json(res, 409, { error: meta }) : json(res, 200, meta)
    }

    const amp = /^\/api\/modelos3d\/([\w-]+)\/ampliar$/.exec(ruta)
    if (amp) {
      const id = amp[1]
      const i = await cuerpo<{ que?: string; model?: string; effort?: string }>(req)
      const que = String(i.que ?? '').trim()
      if (!que) return json(res, 400, { error: 'Di qué quieres: una variante, una animación, los colores de un proyecto…' })
      if (!idValido(id) || !existe(id)) return json(res, 404, { error: 'Ese modelo no está en la biblioteca.' })
      let nombre: string | undefined
      for (const c of ['modelos', 'plantilla']) {
        try {
          nombre = JSON.parse(readFileSync(join(d.biblioteca, c, id, 'modelo.json'), 'utf8')).nombre
          break
        } catch {
          // Probamos en la otra carpeta.
        }
      }
      const meta = abrirHilo(`Ampliar ${nombre ?? id}`, mensajeAmpliar({ id, nombre, que }), i)
      return typeof meta === 'string' ? json(res, 409, { error: meta }) : json(res, 200, meta)
    }

    if (ruta === '/api/modelos3d/importar') {
      const nombre = (pedido.searchParams.get('nombre') ?? '').trim()
      const categoria = (pedido.searchParams.get('categoria') ?? 'Objetos').trim()
      const licencia = (pedido.searchParams.get('licencia') ?? '').trim()
      if (!nombre) return json(res, 400, { error: 'Ponle nombre al modelo.' })
      if (importando) return json(res, 409, { error: 'Ya se está importando un modelo. Espera a que termine.' })
      if (existe(idDe(nombre))) return json(res, 409, { error: `Ya hay un modelo «${idDe(nombre)}» en la biblioteca.` })
      importando = true
      try {
        mkdirSync(d.adjuntos, { recursive: true })
        const archivo = join(d.adjuntos, `${Date.now()}-${nombreAdjunto(basename(pedido.searchParams.get('archivo') ?? 'modelo.glb'))}`)
        let recibidos = 0
        await new Promise<void>((ok, fail) => {
          const salida = createWriteStream(archivo)
          req.on('data', (t: Buffer) => {
            recibidos += t.length
            if (recibidos > TOPE_GLB) req.destroy(new Error('El archivo pasa de 300 MB.'))
          })
          req.on('error', fail)
          req.pipe(salida).on('finish', ok).on('error', fail)
        })
        const card = d.cards().find((c) => c.id === CARD_NUEVO_MODELO)
        if (!card) return json(res, 409, { error: 'Falta la card «Nuevo modelo 3D».' })
        mkdirSync(card.cwd, { recursive: true })
        const args = ['-B', '-X', 'utf8', join(d.biblioteca, 'scripts', 'modelos.py'), 'importar', archivo, '--nombre', nombre, '--categoria', categoria]
        if (licencia) args.push('--licencia', licencia)
        const r = await run(d.python(), args, card.cwd)
        if (r.codigo !== 0) return json(res, 500, { error: cola(r.salida) || 'No se pudo importar el modelo.' })
        return json(res, 200, { id: idDe(nombre) })
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
      } finally {
        importando = false
      }
    }
    return false
  }

  return { api }
}
