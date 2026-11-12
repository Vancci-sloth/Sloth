import { existsSync, type FSWatcher, readdirSync, readFileSync, statSync, watch } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join, normalize, sep } from 'node:path'
import type { Biblioteca3D, Modelo3D } from '../shared/types.ts'
import { servir } from './etapas.ts'
import { ejecutar } from './modelos3d-acciones.ts'

/**
 * La biblioteca de modelos 3D (`skills/modelos-3d`), para verla en Sloth: cada modelo (`modelos/<id>`) con su foto, su
 * giro, qué es y qué puede hacer, sus etiquetas y de qué video salió, y los tipos en que se agrupan (`categorias.json`); y
 * el visor 3D de todos (`visor/`, que arma `modelos.py visor`), donde la ficha gira el modelo de verdad. Solo se lee:
 * los videos la llenan con `modelos.py guardar` y el agente busca en ella antes de hacer uno. Quitarlo es borrar este archivo, sus líneas en `server/index.ts` y las marcadas
 * «modelos 3D» en `web/src`.
 */
export function modelos3d(raiz: string, opciones: { python?: () => string } = {}) {
  const dir = join(raiz, 'modelos')
  /** La URL de un archivo de la vista, con su fecha: si se vuelve a sacar, cambia y el navegador no usa la vieja. */
  function url(id: string, archivo: string) {
    const ruta = join(dir, id, archivo)
    return existsSync(ruta) ? `/api/modelos3d/${id}/${archivo}?t=${Math.floor(statSync(ruta).mtimeMs)}` : undefined
  }

  const visor = join(raiz, 'visor')
  /** Los que trae el visor 3D, y su fecha: si se vuelve a armar, la dirección cambia. */
  function enElVisor() {
    try {
      const ruta = join(visor, 'lista.json')
      return { ids: new Set((JSON.parse(readFileSync(ruta, 'utf8')) as { ids: string[] }).ids), v: Math.floor(statSync(ruta).mtimeMs) }
    } catch {
      return { ids: new Set<string>(), v: 0 }
    }
  }

  /**
   * Si al visor le falta algún modelo, o uno cambió después de armarlo (o el visor de la skill), se vuelve a armar solo, de
   * fondo y uno a la vez: `modelos.py visor` tarda unos segundos y no vuelve a sacar ninguna vista. Así una biblioteca
   * guardada antes del visor lo tiene en cuanto se abre la sección. Si no sale (sin los módulos de los videos), no se
   * reintenta con los mismos modelos hasta que algo cambie; y si en 5 minutos no acabó, se le termina.
   */
  let armando = false
  let intentado = ''
  function alDia(ids: string[], v: number) {
    if (!opciones.python || armando) return
    const archivos = [join(raiz, 'visor.tsx'), ...ids.map((id) => join(dir, id, `${id}.tsx`))]
    const ultimo = Math.max(...archivos.map((a) => (existsSync(a) ? statSync(a).mtimeMs : 0)))
    const conVisor = enElVisor()
    const firma = `${ids.join(',')}@${Math.floor(ultimo)}`
    if ((ids.every((id) => conVisor.ids.has(id)) && ultimo <= v) || firma === intentado) return
    armando = true
    intentado = firma
    void ejecutar(opciones.python(), ['-B', '-X', 'utf8', join(raiz, 'scripts', 'modelos.py'), 'visor'], raiz, { SLOTH_SKILLS: dirname(raiz) }, 5 * 60_000).finally(() => {
      armando = false
      armada = null
    })
  }

  function lista(): Modelo3D[] {
    if (!existsSync(dir)) return []
    const todos: Modelo3D[] = []
    const conVisor = enElVisor()
    for (const id of readdirSync(dir)) {
      try {
        const ficha = JSON.parse(readFileSync(join(dir, id, 'modelo.json'), 'utf8')) as Omit<Modelo3D, 'id' | 'vista' | 'giro' | 'vuelta' | 'visor'>
        const visor3d = conVisor.ids.has(id) ? `/api/modelos3d/visor/index.html?id=${encodeURIComponent(id)}&v=${conVisor.v}` : undefined
        todos.push({ ...ficha, id, vista: url(id, 'vista.webp'), giro: url(id, 'vista.webm'), vuelta: url(id, 'vuelta.webm'), visor: visor3d })
      } catch {
        // Una carpeta sin modelo.json (o a medio escribir) no es un modelo todavía.
      }
    }
    if (todos.length) alDia(todos.map((m) => m.id), conVisor.v)
    // Los más nuevos primero: lo último que se sumó es lo que más se busca.
    return todos.sort((a, b) => (b.actualizado ?? '').localeCompare(a.actualizado ?? '') || a.nombre.localeCompare(b.nombre))
  }

  function categorias(): Biblioteca3D['categorias'] {
    try {
      return JSON.parse(readFileSync(join(raiz, 'categorias.json'), 'utf8'))
    } catch {
      return []
    }
  }

  /**
   * La respuesta ya armada: leer las 103 fichas y mirar la fecha de 206 archivos tardaba más de 100 ms, y la página
   * nueva de «Modelos 3D» los esperaba. Se vuelve a armar cuando algo cambia en la biblioteca (un modelo que se guarda,
   * se importa o se borra, o `categorias.json`). Donde no se puede vigilar la carpeta, se arma en cada pedido. Y si cambió
   * cuántos hay (un modelo nuevo o importado, por si el aviso de la carpeta llega tarde), también: contarlos es una sola
   * lectura de la carpeta.
   */
  let armada: string | null = null
  let cuantos = -1
  let vigilante: FSWatcher | null = null
  function respuesta() {
    if (!vigilante) {
      try {
        vigilante = watch(raiz, { recursive: true, persistent: false }, () => (armada = null)).on('error', () => {
          armada = null
          vigilante?.close()
          vigilante = null
        })
      } catch {
        // La carpeta aún no existe: sin guardar, hasta que exista.
      }
    }
    const ahora = existsSync(dir) ? readdirSync(dir).length : 0
    if (ahora !== cuantos) armada = null
    cuantos = ahora
    const texto = armada ?? JSON.stringify({ categorias: categorias(), modelos: lista() } satisfies Biblioteca3D)
    if (vigilante) armada = texto
    return texto
  }

  /** `GET /api/modelos3d`: los tipos y todos los modelos. `GET /api/modelos3d/<id>/vista.webp` (o `.webm`, o `vuelta.webm`): la foto, el vaivén o la vuelta entera de uno. */
  async function api(req: IncomingMessage, res: ServerResponse, pedido: URL): Promise<boolean> {
    const vista = /^\/api\/modelos3d\/([\w-]+)\/(vista\.(?:webp|webm)|vuelta\.webm)$/.exec(pedido.pathname)
    if (vista) return servir(req, res, join(dir, vista[1], vista[2]))
    // El visor 3D: su página, su código y los archivos de los modelos, sin salir de su carpeta.
    if (pedido.pathname.startsWith('/api/modelos3d/visor/')) {
      let ruta = ''
      try {
        ruta = decodeURIComponent(pedido.pathname.slice('/api/modelos3d/visor/'.length))
      } catch {
        // Un % mal escrito: no hay tal archivo.
      }
      const archivo = normalize(join(visor, ruta))
      // Solo archivos: una carpeta (o lo que no está) leída como archivo tumbaba el servidor.
      let esArchivo = false
      try {
        esArchivo = statSync(archivo, { throwIfNoEntry: false })?.isFile() ?? false
      } catch {
        // Una ruta que no puede ser (un byte nulo): no hay tal archivo.
      }
      if (!archivo.startsWith(visor + sep) || !esArchivo) {
        res.writeHead(404).end()
        return true
      }
      return servir(req, res, archivo, 'no-cache')
    }
    if (pedido.pathname !== '/api/modelos3d') return false
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(respuesta())
    return true
  }

  return { api, cerrar: () => vigilante?.close() }
}
