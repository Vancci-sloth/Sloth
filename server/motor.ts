import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync, watch } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { join, matchesGlob, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * El motor en vivo: el video de un hilo reproducido en el navegador tal cual saldrá, sin renderizarlo, sea cual sea su
 * estilo, mientras esté hecho con Remotion. Sloth arma la página él solo, con el esbuild y el Player que ya trae el
 * proyecto, y la vuelve a armar en cuanto cambia algo de lo que entra en el video: el agente escribe una escena y en un
 * segundo se puede ver y recorrer. Las skills no hacen nada para tenerlo. La página es `motor-pagina.jsx`; el monitor la
 * cambia por la nueva sin parpadear ni perder el segundo (`web/src/Monitor.tsx`).
 */

/** Cómo va el motor de una carpeta: `v` sube con cada versión que se puede ver; `error`, por qué no salió la última. */
export type EstadoMotor = { v: number; armando: boolean; error?: string }

type Motor = EstadoMotor & {
  folder: string
  entrada: string
  js?: string
  /** El armado incremental de esbuild: la segunda vez solo relee lo que cambió. */
  ctx?: Promise<any>
  /** La hora de `motor-pagina.jsx` con que se hizo `ctx`: si la página cambia, se vuelve a hacer. */
  pagina?: number
  /** Los archivos del proyecto que entraron en la última versión, por su ruta en minúsculas y con `/`. */
  entradas: Set<string>
  /** Cuándo empezó la versión que se ve: lo que no cambió desde entonces no la deja vieja. */
  desde: number
  /** Lo que no cuenta aunque cambie: lo que el propio render deja dentro de `public/` (los `!…` de `entradas` en la card). */
  ignorar: string[]
  cerrar(): void
  avisar(): void
  otraVez: boolean
  usado: number
}

/** Los motores abiertos, por carpeta. Como mucho `MAX`: el que lleva más tiempo sin mirarse se cierra. */
const motores = new Map<string, Motor>()
const MAX = 6

const ENTRADAS = ['src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx']
const PAGINA = new URL('./motor-pagina.jsx', import.meta.url)

const clave = (ruta: string) => ruta.replaceAll('\\', '/').toLowerCase()

/** El archivo con `registerRoot` de un proyecto de Remotion con lo que hace falta instalado, o nada. */
function entradaDe(folder: string): string | undefined {
  const nm = join(folder, 'node_modules')
  if (!existsSync(join(nm, '@remotion', 'player')) || !existsSync(join(nm, 'esbuild')) || !existsSync(join(nm, 'remotion'))) return
  return ENTRADAS.map((e) => join(folder, e)).find((e) => existsSync(e))
}

/**
 * El motor de la carpeta de un hilo, si es un proyecto de Remotion: lo abre (y arma la primera versión) la primera vez que
 * alguien mira el hilo. `avisar` se llama cada vez que hay una versión nueva o un error, para que la interfaz relea.
 * `ignorar`: globs de la carpeta que no cuentan aunque cambien.
 */
export function motorDe(folder: string, avisar: () => void, ignorar: string[] = []): EstadoMotor | undefined {
  folder = resolve(folder)
  let m = motores.get(clave(folder))
  if (!m) {
    const entrada = entradaDe(folder)
    if (!entrada) return
    m = abrir(folder, entrada)
  }
  m.avisar = avisar
  m.ignorar = ignorar.map((g) => g.toLowerCase())
  m.usado = Date.now()
  return { v: m.v, armando: m.armando, error: m.error }
}

function abrir(folder: string, entrada: string): Motor {
  if (motores.size >= MAX) [...motores.values()].sort((a, b) => a.usado - b.usado)[0].cerrar()
  let timer: ReturnType<typeof setTimeout> | undefined
  let rearmar = false
  const m: Motor = { folder, entrada, v: 0, armando: false, entradas: new Set(), desde: 0, ignorar: [], otraVez: false, usado: Date.now(), avisar: () => {}, cerrar }
  // Lo que cambia en la carpeta: lo que entra en el video se vuelve a armar; lo de `public/` (imágenes, la voz) solo
  // pide recargar la página. Se juntan los cambios de un cuarto de segundo. Windows también avisa cuando solo se lee un
  // archivo: lo que no cambió desde la versión que se ve no cuenta.
  let w: ReturnType<typeof watch> | undefined
  try {
    w = watch(folder, { recursive: true }, (_e, nombre) => {
      const ruta = clave(nombre ?? '')
      if (!ruta || /(^|\/)(node_modules|\.git)(\/|$)/.test(ruta)) return
      const entra = m.entradas.has(ruta) || ruta.startsWith('src/')
      if ((!entra && !ruta.startsWith('public/')) || m.ignorar.some((g) => matchesGlob(ruta, g))) return
      const st = statSync(join(folder, nombre!), { throwIfNoEntry: false })
      if (st && (st.isDirectory() || st.mtimeMs < m.desde)) return
      rearmar ||= entra
      clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        const todo = rearmar || !m.js
        rearmar = false
        if (todo) return void armar(m)
        m.desde = Date.now()
        m.v++
        m.avisar()
      }, 250)
    })
    w.on('error', cerrar)
  } catch {}
  function cerrar() {
    clearTimeout(timer)
    w?.close()
    void m.ctx?.then((c) => c.dispose()).catch(() => {})
    motores.delete(clave(folder))
  }
  motores.set(clave(folder), m)
  void armar(m)
  return m
}

/** El esbuild del proyecto, el mismo con que Remotion arma sus renders: así no hace falta otro. */
const esbuilds = new Map<string, Promise<any>>()
function esbuildDe(folder: string): Promise<any> {
  const main = join(folder, 'node_modules', 'esbuild', 'lib', 'main.js')
  if (!esbuilds.has(main)) esbuilds.set(main, import(pathToFileURL(main).href).then((mod) => mod.default ?? mod))
  return esbuilds.get(main)!
}

/**
 * Lo que cambia la página para leer el video: el proyecto importa `remotion` y aquí recibe uno igual, salvo que
 * `registerRoot` y `<Composition>` solo anotan qué video es (`motor-pagina.jsx` lo lee) en vez de abrir el Studio.
 */
const REMOTION = `
export * from 'remotion'
const g = globalThis
export const registerRoot = (raiz) => { g.__slothRaiz = raiz }
export const Composition = (props) => { (g.__slothComposiciones ??= []).push(props); return null }
export const Still = (props) => { (g.__slothComposiciones ??= []).push({ ...props, durationInFrames: 1, fps: 30, still: true }); return null }
export const Folder = ({ children }) => children
`

/** El armado de la página de una carpeta, para volver a correrlo con `rebuild()`. */
async function contexto(m: Motor) {
  const esbuild = await esbuildDe(m.folder)
  const plugin = {
    name: 'sloth-motor',
    setup(b: any) {
      b.onResolve({ filter: /^sloth:raiz$/ }, () => ({ path: m.entrada }))
      // El `remotion` del proyecto pasa por la página; el de las librerías y el de la propia página, no.
      b.onResolve({ filter: /^remotion$/ }, (args: any) =>
        args.namespace === 'sloth' || /[\\/]node_modules[\\/]/.test(args.importer) ? undefined : { path: 'remotion', namespace: 'sloth' }
      )
      b.onLoad({ filter: /.*/, namespace: 'sloth' }, () => ({ contents: REMOTION, resolveDir: m.folder, loader: 'js' }))
    }
  }
  const imagenes = Object.fromEntries(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.otf'].map((e) => [e, 'dataurl']))
  return esbuild.context({
    stdin: { contents: readFileSync(PAGINA, 'utf8'), resolveDir: m.folder, sourcefile: 'sloth-motor.jsx', loader: 'jsx' },
    absWorkingDir: m.folder,
    bundle: true,
    write: false,
    metafile: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    jsx: 'automatic',
    loader: imagenes,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
    plugins: [plugin]
  })
}

/** Arma la página. Si ya se está armando, lo vuelve a hacer al acabar, con lo último. */
async function armar(m: Motor) {
  if (m.armando) return void (m.otraVez = true)
  m.armando = true
  m.avisar()
  const inicio = Date.now()
  try {
    const pagina = statSync(PAGINA).mtimeMs
    if (m.ctx && m.pagina !== pagina) {
      void m.ctx.then((c) => c.dispose()).catch(() => {})
      m.ctx = undefined
    }
    m.pagina = pagina
    m.ctx ??= contexto(m)
    const r = await (await m.ctx).rebuild()
    m.js = r.outputFiles[0].text
    m.entradas = new Set(Object.keys(r.metafile.inputs).filter((i) => !i.includes('node_modules') && !i.includes(':')).map(clave))
    m.error = undefined
    m.desde = inicio
    m.v++
  } catch (e: any) {
    // Si ni siquiera empezó (falta algo del proyecto), la próxima vez se intenta desde cero.
    if (!e?.errors) m.ctx = undefined
    // De un error de esbuild, el primero con su archivo y su línea; si no, el mensaje.
    const x = e?.errors?.[0]
    m.error = x ? `${x.location ? `${x.location.file}:${x.location.line}: ` : ''}${x.text}` : String(e?.message ?? e)
  } finally {
    m.armando = false
    if (m.otraVez) {
      m.otraVez = false
      void armar(m)
    } else m.avisar()
  }
}

/**
 * `GET /api/sessions/<id>/motor`: la página del motor de la carpeta `folder`; `/motor/motor.js`, su script. `base` es
 * la ruta desde la que se sirve la carpeta del hilo: de ahí lee la página lo de `public/` (`staticFile`).
 */
export function servirMotor(res: ServerResponse, folder: string, sub: string | undefined, base: string): true {
  const m = motores.get(clave(resolve(folder)))
  if (sub === 'motor.js') {
    if (!m?.js) return texto(res, 404, 'text/plain', 'Aún no está armado')
    return texto(res, 200, 'text/javascript; charset=utf-8', m.js)
  }
  const html = `<!doctype html>
<html lang="es">
<meta charset="utf-8" />
<title>Sloth · en vivo</title>
<style>html, body, #raiz { margin: 0; height: 100%; background: #000; overflow: hidden; }</style>
<div id="raiz"></div>
<script>
  window.remotion_staticBase = ${JSON.stringify(`${base}/public`)}
  // Antes que nada: si el video falla al cargar (el código del proyecto corre antes que el de la página), el monitor se
  // entera y se queda con la versión anterior.
  const fallo = (e) => { const m = String(e?.message ?? e ?? 'Error'); if (!/ResizeObserver/.test(m)) parent.postMessage({ vivo: 'error', mensaje: m.slice(0, 400) }, '*') }
  addEventListener('error', (e) => fallo(e.error ?? e.message))
  addEventListener('unhandledrejection', (e) => fallo(e.reason))
</script>
<script src="motor/motor.js?v=${m?.v ?? 0}"></script>
`
  return texto(res, 200, 'text/html; charset=utf-8', html)
}

function texto(res: ServerResponse, status: number, tipo: string, cuerpo: string): true {
  res.writeHead(status, { 'content-type': tipo, 'cache-control': 'no-store' })
  res.end(cuerpo)
  return true
}

/** Cuántos picos por segundo lleva la onda de un audio. */
const POR_SEGUNDO = 50
const ondas = new Map<string, Promise<number[]>>()

/**
 * `GET /api/sessions/<id>/onda?ruta=…`: la onda de un audio de la carpeta del hilo, para la línea de tiempo: un pico por
 * cada 20 ms, de 0 a 255. Sale de ffmpeg y se guarda por archivo y fecha.
 */
export async function servirOnda(res: ServerResponse, file: string): Promise<true> {
  const st = statSync(file, { throwIfNoEntry: false })
  if (!st?.isFile()) return texto(res, 404, 'application/json', JSON.stringify({ error: 'No existe' }))
  const k = `${file}|${st.mtimeMs}`
  if (!ondas.has(k)) ondas.set(k, picos(file))
  try {
    const p = await ondas.get(k)!
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=31536000, immutable' })
    res.end(JSON.stringify({ porSegundo: POR_SEGUNDO, picos: p }))
  } catch (e) {
    ondas.delete(k)
    texto(res, 500, 'application/json', JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
  return true
}

function picos(file: string): Promise<number[]> {
  const RATE = 8000
  const cada = RATE / POR_SEGUNDO
  return new Promise((ok, mal) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { windowsHide: true })
    const out: number[] = []
    let max = 0
    let n = 0
    let resto: Buffer | undefined
    p.stdout.on('data', (d: Buffer) => {
      const b = resto ? Buffer.concat([resto, d]) : d
      const par = b.length - (b.length % 2)
      for (let i = 0; i < par; i += 2) {
        const v = Math.abs(b.readInt16LE(i))
        if (v > max) max = v
        if (++n === cada) {
          // La raíz levanta lo bajo: la voz se ve aunque esté grabada floja.
          out.push(Math.round(Math.sqrt(max / 32768) * 255))
          max = n = 0
        }
      }
      resto = par < b.length ? b.subarray(par) : undefined
    })
    p.on('error', mal)
    p.on('close', (code) => (code === 0 ? ok(out) : mal(new Error(`ffmpeg salió con ${code}`))))
  })
}
