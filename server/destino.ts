import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { copyFile, mkdir, rename, rm, utimes } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { Card, SessionMeta } from '../shared/types.ts'
import { finalesDe, folderOf } from './etapas.ts'
import type { Sessions } from './sessions.ts'

/**
 * «Guardar en…»: los videos terminados de un hilo (`finalesDe` en etapas.ts) se copian a una carpeta del disco que elige
 * el usuario, su `destino`, al acabar cada turno y al elegirla. Cada copia se llama como su carpeta de video y su archivo
 * (`t-rex-naciendo - video-vertical.mp4`): renombrar el hilo no la duplica, y los videos de un lote, cada uno en su
 * carpeta, no chocan. Lo que no cambió no se vuelve a copiar; un render nuevo reemplaza su copia. Un fallo no tumba nada:
 * queda en el hilo (`copia.error`, que enseña la fase Entrega) y en el log.
 */

/** Cuánto se espera al acabar un turno: un MP4 que cambió hace menos de 5 s aún no cuenta (`FRESCO` en etapas.ts). */
export const TRAS_EL_TURNO = 6000

/**
 * La carpeta de destino, si vale: una ruta completa y fuera de donde trabaja el estilo. Dentro, las copias pasarían por
 * videos del propio estilo y se volverían a copiar.
 */
export function destinoValido(ruta: unknown, card: Card): string {
  const r = typeof ruta === 'string' ? ruta.trim() : ''
  if (process.platform !== 'win32' ? !isAbsolute(r) : !isAbsolute(r) || !/^([A-Za-z]:[\\/]|\\\\)/.test(r))
    throw new Error(`Elige una carpeta con su ruta completa (${process.platform === 'win32' ? 'C:\\…' : '/…'}).`)
  const destino = resolve(r)
  const cwd = resolve(card.cwd)
  if ((destino + sep).toLowerCase().startsWith((cwd + sep).toLowerCase())) throw new Error(`Elige una carpeta fuera de ${cwd}, donde trabaja el estilo.`)
  return destino
}

/** El diálogo de carpetas, en PowerShell. Con un dueño encima de todo: sin él, se abre detrás del navegador. */
const DIALOGO = [
  "$ProgressPreference = 'SilentlyContinue'",
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$d.Description = 'Dónde guardar los videos terminados'",
  '$d.ShowNewFolderButton = $true',
  'if ($env:SLOTH_DESDE -and (Test-Path -LiteralPath $env:SLOTH_DESDE -PathType Container)) { $d.SelectedPath = $env:SLOTH_DESDE }',
  '$f = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }',
  "if ($d.ShowDialog($f) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
  '$f.Dispose()'
].join('\n')

let abierto: Promise<string | null> | null = null

/**
 * El diálogo de carpetas de Windows, que empieza en `desde` si existe, para cuando Sloth se abre en un navegador: en su
 * ventana lo pone Electron, en los tres sistemas (`elegirCarpeta` de electron/preload.ts). La ruta va por el entorno y no
 * dentro del script: así no hay comillas que escapar. Devuelve `null` si se cancela. Mientras está abierto, pedirlo otra
 * vez espera al mismo.
 */
export function elegirCarpeta(desde?: string): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.reject(new Error('Elige la carpeta desde la ventana de Sloth.'))
  abierto ??= new Promise<string | null>((listo, falla) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(DIALOGO, 'utf16le').toString('base64')], {
      env: { ...process.env, SLOTH_DESDE: desde ?? '' },
      windowsHide: true
    })
    let out = ''
    let err = ''
    ps.stdout.setEncoding('utf8').on('data', (d) => (out += d))
    ps.stderr.setEncoding('utf8').on('data', (d) => (err += d))
    ps.on('error', (e) => falla(new Error(`No se pudo abrir el diálogo de carpetas: ${e.message}`)))
    ps.on('close', (code) => (code ? falla(new Error(`El diálogo de carpetas falló: ${err.trim() || `código ${code}`}`)) : listo(out.trim() || null)))
  }).finally(() => (abierto = null))
  return abierto
}

/** Un error al copiar, dicho para quien no lee códigos. */
function enLlano(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') return 'No se puede escribir ahí: la copia está abierta en otro programa, o la carpeta es de solo lectura.'
  if (code === 'ENOSPC') return 'No queda espacio en ese disco.'
  if (code === 'ENOENT') return 'No se encuentra la carpeta o el video (¿un disco desconectado?).'
  return error instanceof Error ? error.message : String(error)
}

/** Copia a `destino` los videos terminados del hilo que cambiaron. Devuelve el nombre de cada copia. */
async function copiar(meta: SessionMeta, card: Card, destino: string): Promise<string[]> {
  const folder = folderOf(meta)
  const finales = finalesDe(meta, card, folder)
  if (!finales.length) return []
  await mkdir(destino, { recursive: true })
  // Con el estilo delante: la carpeta de un video solo es única dentro de su estilo, y el mismo tema en El Diff y en el
  // Reel de comedia daría la misma copia, una encima de la otra.
  const estilo = card.title.replace(/[<>:"/\\|?*]+/g, '-').trim()
  const nombres: string[] = []
  for (const f of finales) {
    const origen = join(folder, f.ruta)
    const nombre = `${estilo} - ${f.nombre}`
    nombres.push(nombre)
    const copia = join(destino, nombre)
    const st = statSync(origen)
    const ya = statSync(copia, { throwIfNoEntry: false })
    // La copia lleva la fecha del original: si pesa lo mismo y tiene su fecha, es ese video. Con dos segundos de margen,
    // que un disco FAT (una memoria USB) guarda la hora así.
    if (ya && ya.size === st.size && Math.abs(ya.mtimeMs - st.mtimeMs) < 2000) continue
    // Primero con otro nombre: si se corta a medias, no queda un video roto con el nombre bueno.
    const temporal = `${copia}.copiando`
    try {
      await copyFile(origen, temporal)
      await utimes(temporal, st.atime, st.mtime)
      await rename(temporal, copia)
    } catch (error) {
      await rm(temporal, { force: true }).catch(() => {})
      throw error
    }
  }
  return nombres
}

const colas = new Map<string, Promise<void>>()
/** Si se está copiando algo: reiniciar el servidor dejaría a medias un `.copiando` en la carpeta del usuario. */
export const copiando = () => (colas.size ? 'Se están copiando videos a su carpeta. Espera a que termine.' : null)

/**
 * Copia los videos del hilo a su destino, si tiene, y anota en el hilo cómo fue. Las de un mismo hilo van una tras otra.
 * Nunca falla: un error queda en `copia.error` y en el log.
 */
export function guardarCopias(sessions: Sessions, cards: Card[], id: string): Promise<void> {
  const esta = (colas.get(id) ?? Promise.resolve())
    .then(async () => {
      const meta = sessions.meta(id)
      const card = cards.find((c) => c.id === meta?.cardId)
      const destino = meta?.destino
      if (!meta || !destino || !card?.etapas?.length) return
      try {
        const archivos = await copiar(meta, card, destino)
        // Si mientras tanto cambió el destino, lo que cuenta es la copia que viene detrás.
        if (sessions.meta(id)?.destino === destino) sessions.setCopia(id, archivos.length ? { archivos } : undefined)
      } catch (error) {
        console.error(`No se pudieron copiar los videos de «${meta.title}» a ${destino}:`, error)
        if (sessions.meta(id)?.destino === destino) sessions.setCopia(id, { archivos: meta.copia?.archivos ?? [], error: enLlano(error) })
      }
    })
    .catch((error) => console.error('Guardar en…:', error))
  colas.set(id, esta)
  void esta.then(() => colas.get(id) === esta && colas.delete(id))
  return esta
}

async function leer<T>(req: IncomingMessage): Promise<T> {
  let text = ''
  for await (const chunk of req) text += chunk
  return (text ? JSON.parse(text) : {}) as T
}

function json(res: ServerResponse, status: number, data: unknown): true {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
  return true
}

/**
 * `POST /api/elegir-carpeta` con `{ desde? }` abre el diálogo de carpetas y devuelve `{ ruta }`, `null` si se cancela.
 * `POST /api/sessions/<id>/destino` con `{ destino }` pone, cambia o quita (`null`) el destino de un hilo, y copia ya lo
 * que esté terminado. Devuelve si atendió la petición.
 */
export async function destinoApi(req: IncomingMessage, res: ServerResponse, url: URL, sessions: Sessions, cards: Card[]): Promise<boolean> {
  if (req.method !== 'POST') return false
  if (url.pathname === '/api/elegir-carpeta') {
    const { desde } = await leer<{ desde?: string }>(req)
    try {
      return json(res, 200, { ruta: await elegirCarpeta(desde) })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
  const m = /^\/api\/sessions\/([\w-]+)\/destino$/.exec(url.pathname)
  if (!m) return false
  const meta = sessions.meta(m[1])
  const card = cards.find((c) => c.id === meta?.cardId)
  if (!meta || !card?.etapas?.length) return json(res, 404, { error: 'Este hilo no tiene videos que guardar' })
  const { destino } = await leer<{ destino?: string | null }>(req)
  let ruta: string | undefined
  try {
    ruta = destino ? destinoValido(destino, card) : undefined
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
  sessions.setDestino(meta.id, ruta)
  await guardarCopias(sessions, cards, meta.id)
  return json(res, 200, { copia: sessions.meta(meta.id)?.copia })
}
