import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { FuenteRadar, FuentesRadar } from '../../shared/types.ts'
import { VENTA } from '../../shared/venta.ts'
import { abrirBase, buscarEn } from './base.ts'
import { aTexto, guardarFuentes, leerFuentes, nombreDe } from './fuentes.ts'
import { interpretar, probar } from './probar.ts'
import { proponerFuentes } from './proponer.ts'

/**
 * El radar: un buscador propio de noticias. Cada 5 minutos, en segundo plano, lee lo nuevo de las fuentes que eligió el
 * usuario en Opciones → Radar (`fuentes.ts`; sin elegir, unas 120 de IA y tecnología: las cuentas de X que importan, los
 * blogs de los laboratorios, los medios, Hacker News, GitHub Trending) y lo guarda entero en `data/radar/radar.db`.
 * Buscar ahí tarda milisegundos y no cuesta nada: la investigación de un video empieza con casi todo ya leído. Lo que el
 * radar no tiene (lo de hace meses, la biografía de alguien) se busca en la web como siempre.
 *
 * - `POST /api/radar/buscar` `{consultas: string[], n?, horas?, textos?}`: por consulta, lo más pertinente y reciente.
 * - `GET /api/radar`: cuántos documentos hay, de cuándo, y cada fuente leída alguna vez con su última lectura y su error.
 * - `GET /api/radar/fuentes`: las que lee ahora y lo que trajeron en 24 h. `POST` `{fuentes}` las cambia (`null`: las de
 *   siempre) y las lee ya.
 * - `POST /api/radar/fuentes/probar` `{texto}`: lo que pegó el usuario como fuente, probada. No la guarda.
 * - `POST /api/radar/proponer` `{tema}`: las fuentes que propone Claude para un tema, probadas. No las guarda.
 */
export function radar(app: string) {
  const carpeta = join(app, 'data', 'radar')
  let db: DatabaseSync | null = null
  const base = () => (db ??= abrirBase(join(carpeta, 'radar.db')))
  let hijo: ChildProcess | null = null

  function rastrear() {
    if (hijo) return
    // Compilada (`scripts/compilar.mjs`), el rastreo va armado aparte; aquí es el .ts, que corre con tsx (`execArgv`).
    const script = VENTA ? join(app, 'server', 'radar', 'rastrear.mjs') : join(dirname(fileURLToPath(import.meta.url)), 'rastrear.ts')
    hijo = spawn(process.execPath, [...process.execArgv, script], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let salida = ''
    hijo.stdout?.on('data', (d) => (salida += d))
    hijo.stderr?.on('data', (d) => (salida += d))
    hijo.on('exit', (codigo) => {
      hijo = null
      if (salida.trim()) writeFileSync(join(carpeta, 'ultima-pasada.log'), `${salida.trim()}\n(salió con ${codigo})\n`)
    })
  }
  // El primero, un minuto después de arrancar: no compite con lo que hace Sloth al abrir.
  setTimeout(rastrear, 60_000).unref()
  setInterval(rastrear, 5 * 60_000).unref()

  /** Las fuentes que se leen, con lo que se sabe de cada una. Lo leído de una que se quitó se queda en la base. */
  function fuentes(): FuentesRadar {
    const d = base()
    const leidas = new Map((d.prepare('select nombre, ultima, error from fuentes').all() as Array<{ nombre: string; ultima: number; error: string | null }>).map((f) => [f.nombre, f]))
    const docs = new Map((d.prepare('select fuente, count(*) n from docs group by fuente').all() as Array<{ fuente: string; n: number }>).map((f) => [f.fuente, f.n]))
    const hoy = new Map((d.prepare('select fuente, count(*) n from docs where coalesce(fecha, visto) >= ? group by fuente').all(Date.now() - 864e5) as Array<{ fuente: string; n: number }>).map((f) => [f.fuente, f.n]))
    const { fuentes: lista, deSiempre } = leerFuentes(app)
    return {
      deSiempre,
      recientes: lista.reduce((n, f) => n + (hoy.get(nombreDe(f)) ?? 0), 0),
      fuentes: lista.map((f) => {
        const id = nombreDe(f)
        return { ...aTexto(f), id, ultima: leidas.get(id)?.ultima ?? null, error: leidas.get(id)?.error ?? null, docs: docs.get(id) ?? 0 }
      })
    }
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/api/radar')) return false
    const cuerpo = async <T>() => {
      let texto = ''
      for await (const trozo of req) texto += trozo
      return JSON.parse(texto || '{}') as T
    }
    if (url.pathname === '/api/radar/fuentes' && req.method === 'GET') return enviar(res, fuentes()), true
    if (url.pathname === '/api/radar/fuentes' && req.method === 'POST') {
      const { fuentes: lista } = await cuerpo<{ fuentes?: FuenteRadar[] | null }>()
      if (lista !== null && !Array.isArray(lista)) return enviar(res, { error: 'Faltan las fuentes.' }, 400), true
      guardarFuentes(app, lista)
      // Las nuevas se leen ya, no en la siguiente pasada.
      rastrear()
      return enviar(res, fuentes()), true
    }
    if (url.pathname === '/api/radar/fuentes/probar' && req.method === 'POST') {
      const { texto = '' } = await cuerpo<{ texto?: string }>()
      try {
        return enviar(res, await probar(await interpretar(texto))), true
      } catch (e) {
        return enviar(res, { error: e instanceof Error ? e.message : String(e) }, 400), true
      }
    }
    if (url.pathname === '/api/radar/proponer' && req.method === 'POST') {
      const { tema = '' } = await cuerpo<{ tema?: string }>()
      if (!tema.trim()) return enviar(res, { error: 'Escribe un tema.' }, 400), true
      return enviar(res, await proponerFuentes(tema.trim())), true
    }
    if (url.pathname === '/api/radar/buscar' && req.method === 'POST') {
      const { consultas = [], n = 5, horas, textos = false } = await cuerpo<{ consultas?: string[]; n?: number; horas?: number; textos?: boolean }>()
      const t0 = Date.now()
      const resultados = consultas.map((consulta) => ({ consulta, docs: buscarEn(base(), consulta, { n, horas, textos }) }))
      enviar(res, { resultados, ms: Date.now() - t0 })
      return true
    }
    if (url.pathname === '/api/radar' && req.method === 'GET') {
      const d = base()
      const total = d.prepare('select count(*) n, sum(completo) completos, min(coalesce(fecha, visto)) desde from docs').get()
      const porFuente = d.prepare(`select f.nombre, f.ultima, f.error, f.nuevos, count(d.id) docs from fuentes f
        left join docs d on d.fuente = f.nombre group by f.nombre order by f.nombre`).all()
      enviar(res, { total, rastreando: Boolean(hijo), fuentes: porFuente })
      return true
    }
    return false
  }

  return { api }
}

function enviar(res: ServerResponse, datos: unknown, estado = 200) {
  res.writeHead(estado, { 'content-type': 'application/json' })
  res.end(JSON.stringify(datos))
}
