import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esOutlier, idiomaDe, urlVertical } from '../../shared/ideas.ts'
import type { Transcripcion, VideoYT } from '../../shared/types.ts'
import { guardar } from '../disco.ts'
import { rutaPythonSloth } from '../requisitos.ts'
import type { Ctx } from './investigar.ts'
import { dormir } from './navegador-investigacion.ts'
import { enLineas } from './resumen.ts'
import { correr, Detenido, Pausa, ytdlp } from './youtube.ts'

/**
 * Lo que se dice en los videos de la investigación, en `transcripciones/<id>.json` dentro de la carpeta del canal: así el
 * resumen cuenta ganchos dichos y Claude lee completas las de su evidencia al preparar un video. YouTube va por sus
 * subtítulos, sin bajar el video; TikTok e Instagram, por su audio y el Whisper de Sloth (`python/procesos/
 * transcribir-lote.py`), de 20 en 20 para cargar el modelo una vez por lote. Mientras Whisper transcribe un lote, se baja el
 * siguiente. Lo transcrito no se repite, y si una red frena, lo que falta queda para la vuelta siguiente.
 */

const PROCESOS = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'python', 'procesos')
const MODELOS = join(process.env.APPDATA ?? '', 'youtube', 'modelos')
/** Cuántos audios van a Whisper en cada llamada, y cada cuántos videos se guarda la investigación. */
const LOTE = 20
/** El gancho dicho: los primeros 3 s en TikTok e Instagram (hasta acabar la frase), los primeros 30 s en YouTube. */
const GANCHO_VERTICAL = 3
const GANCHO_YOUTUBE = 30
const MAX_PALABRAS = 30
/** Tantas descargas seguidas fallidas en una red no son esos videos: es la red, que frena sin decir 429. */
const FALLAS = 5
/** Lo que dice la red cuando frena a quien baja demasiado. */
const FRENO = /429|Too Many Requests|not a bot|no eres un bot|IP address is blocked/i
/** Lo que es de ese video (borrado, privado, con edad): no cuenta como freno. */
const DEL_VIDEO = /unavailable|private|removed|no longer available|not available|confirm your age|confirma tu edad|inadecuado|members|miembros|subscriber/i

type Segmento = Transcripcion['segmentos'][number]
/** Lo que contesta `transcribir-lote.py` por cada audio. */
type Dicho = { idioma?: string; segmentos: { start: number; end: number; text: string }[] } | { error: string }

export interface CtxTranscribir {
  paso: Ctx['paso']
  avance: Ctx['avance']
  signal: AbortSignal
  /** Guarda la investigación: se llama al marcar cada lote, para que lo transcrito se quede si la detienes. */
  guardar?: () => void
}

/**
 * Transcribe los `videos` que aún no tienen `transcripciones/<id>.json` y marca en cada uno `transcrito`, `gancho` y
 * `sinVoz`. Primero los outliers, del mayor `x` al menor; luego los de `buscados` (los que salieron en las búsquedas), y
 * luego el resto. Los Reels de Instagram se bajan por su enlace directo (`enlaces`, id → url), que caduca: el que no lo
 * tiene se salta. Si la red frena, lo que falta de ella queda para la próxima vuelta, sin que falle la investigación.
 */
export async function transcribirVideos(carpeta: string, videos: VideoYT[], ctx: CtxTranscribir, enlaces = new Map<string, string>(), buscados = new Set<string>()) {
  const dir = join(carpeta, 'transcripciones')
  const ruta = (id: string) => join(dir, `${id}.json`)
  // Una que se escribió y no llegó a marcarse (se detuvo antes de guardar) se marca sin volver a transcribirla.
  let marcadas = 0
  for (const v of videos)
    if (!v.transcrito && existsSync(ruta(v.id)))
      try {
        marcar(v, JSON.parse(readFileSync(ruta(v.id), 'utf8')) as Transcripcion)
        marcadas++
      } catch {}
  if (marcadas) ctx.guardar?.()

  const python = rutaPythonSloth()
  const terminos = terminosDelNicho(videos)
  const faltan = videos.filter((v) => !existsSync(ruta(v.id)))
  const sinEnlace = faltan.filter((v) => v.red === 'instagram' && !enlaces.has(v.id)).length
  const sinPython = python ? 0 : faltan.filter((v) => v.red).length
  const rango = (v: VideoYT) => (esOutlier(v) ? 0 : buscados.has(v.id) ? 1 : 2)
  const cola = faltan
    .filter((v) => !v.red || (python && (v.red === 'tiktok' || enlaces.has(v.id))))
    .sort((a, b) => rango(a) - rango(b) || (rango(a) ? 0 : (b.x ?? 0) - (a.x ?? 0)))
  const avisos = [
    videos.length > faltan.length && `${videos.length - faltan.length} ya estaban transcritos.`,
    sinEnlace && `${sinEnlace} ${sinEnlace === 1 ? 'Reel no tiene' : 'Reels no tienen'} enlace para bajarlo: Meta no lo da de las cuentas ajenas, solo la búsqueda de Instagram y tu cuenta.`,
    sinPython && `Sin el Python de Sloth no transcribo los ${sinPython} de TikTok e Instagram.`
  ]
  const detalle = avisos.filter(Boolean).join(' ') || undefined
  if (!cola.length) return void (detalle && ctx.paso('transcribir', 'No hay videos nuevos que transcribir.', detalle))
  const tt = cola.filter((v) => v.red === 'tiktok').length
  const ig = cola.filter((v) => v.red === 'instagram').length
  const yt = cola.length - tt - ig
  const partes = [yt && `${yt} de YouTube por sus subtítulos`, (tt || ig) && `${[tt && `${tt} de TikTok`, ig && `${ig} de Instagram`].filter(Boolean).join(' y ')} con Whisper`]
  ctx.paso('transcribir', `Transcribo ${cola.length} videos: ${partes.filter(Boolean).join('; ')}.`, detalle)

  /** Escribe la transcripción de un video y lo marca. */
  function escribir(v: VideoYT, fuente: Transcripcion['fuente'], idioma: string | undefined, segmentos: Segmento[]) {
    const t: Transcripcion = {
      id: v.id,
      red: v.red ?? 'youtube',
      fuente,
      ...(idioma && segmentos.length ? { idioma } : {}),
      segmentos,
      texto: segmentos.map((s) => s.texto).join(' '),
      hecha: Date.now()
    }
    mkdirSync(dir, { recursive: true })
    guardar(ruta(v.id), enLineas(t) + '\n')
    marcar(v, t)
  }

  const tmp = mkdtempSync(join(tmpdir(), 'sloth-transcribir-'))
  let hechos = 0
  let sinVoz = 0
  let sinSubtitulos = 0
  let fallidos = 0
  let ultimoFallo = ''
  /** Lo marcado desde el último guardado, para contarlo en un paso. */
  let tanda: VideoYT[] = []
  function guardarTanda() {
    if (!tanda.length) return
    ctx.guardar?.()
    const mejor = tanda.filter((v) => v.gancho).sort((a, b) => (b.x ?? 0) - (a.x ?? 0))[0]
    const callados = tanda.filter((v) => v.sinVoz).length
    ctx.paso(
      'transcribir',
      `${hechos} de ${cola.length} transcritos${callados ? ` · ${callados} sin voz en este lote` : ''}`,
      mejor ? `${mejor.canal}: «${mejor.gancho}»` : undefined
    )
    tanda = []
  }
  function hecho(v: VideoYT) {
    hechos++
    if (v.sinVoz) sinVoz++
    tanda.push(v)
  }

  // Whisper corre aparte mientras se baja el lote siguiente. Su fallo se guarda para el próximo `await`: un rechazo sin
  // nadie esperándolo tumbaría el servidor.
  let lote: { v: VideoYT; wav: string }[] = []
  let enCurso: Promise<void> = Promise.resolve()
  let fallo: unknown
  let sinWhisper = false
  async function transcribirLote(este: { v: VideoYT; wav: string }[]) {
    try {
      const dichos = await whisper(python!, este.map((x) => x.wav), ctx, terminos)
      for (const { v, wav } of este) {
        const d = dichos[wav]
        if (!d || 'error' in d) {
          fallidos++
          ultimoFallo = d?.error ?? 'Whisper no lo devolvió.'
          continue
        }
        escribir(v, 'whisper', d.idioma, d.segmentos.map((s) => ({ inicio: s.start, fin: s.end, texto: s.text })))
        hecho(v)
      }
      guardarTanda()
    } catch (e) {
      if (e instanceof Detenido || ctx.signal.aborted) throw new Detenido('Detenida')
      sinWhisper = true
      ctx.paso('error', 'Whisper no pudo transcribir: lo que falta de TikTok e Instagram se transcribe en la próxima vuelta.', (e as Error).message)
    } finally {
      for (const { wav } of este) rmSync(wav, { force: true })
    }
  }
  async function esperarWhisper() {
    await enCurso
    if (fallo) throw fallo
  }
  async function cerrarLote() {
    await esperarWhisper()
    if (!lote.length || sinWhisper) return
    const este = lote
    lote = []
    enCurso = transcribirLote(este).catch((e) => void (fallo ??= e))
  }

  const nombre = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' }
  const frenadas = new Set<string>()
  const seguidas = new Map<string, number>()
  try {
    for (const [i, v] of cola.entries()) {
      const red = v.red ?? 'youtube'
      if (frenadas.has(red) || (v.red && sinWhisper)) continue
      if (fallo) throw fallo
      ctx.avance(i, cola.length, `Transcribiendo · ${i} de ${cola.length}`)
      try {
        if (!v.red) {
          // La pausa de `llamar()`: YouTube frena a quien pide seguido.
          await dormir(1200 + Math.random() * 1300, ctx.signal)
          const s = await subtitulosYoutube(v, tmp, ctx.signal)
          if (s) {
            escribir(v, 'subtitulos', s.idioma, s.segmentos)
            hecho(v)
            if (tanda.length >= LOTE) guardarTanda()
          } else sinSubtitulos++
        } else {
          if (v.red === 'tiktok') await dormir(1200 + Math.random() * 1300, ctx.signal)
          lote.push({ v, wav: await audio(v, enlaces.get(v.id), tmp, ctx.signal) })
          if (lote.length >= LOTE) await cerrarLote()
        }
        seguidas.set(red, 0)
      } catch (e) {
        if (e instanceof Detenido || ctx.signal.aborted) throw new Detenido('Detenida')
        const m = (e as Error).message
        fallidos++
        ultimoFallo = m
        const veces = DEL_VIDEO.test(m) ? 0 : (seguidas.get(red) ?? 0) + 1
        seguidas.set(red, veces)
        const frena = e instanceof Pausa || FRENO.test(m)
        if (frena || veces >= FALLAS) {
          frenadas.add(red)
          ctx.paso('pausa', `${frena ? `${nombre[red]} frenó las descargas` : `${FALLAS} descargas seguidas de ${nombre[red]} fallaron`}: lo que falta se transcribe en la próxima vuelta.`, m)
        }
      }
    }
    await cerrarLote()
    await esperarWhisper()
    guardarTanda()
  } finally {
    // Si se detuvo, Whisper puede tardar un momento en soltar sus audios.
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    } catch {}
  }
  ctx.avance(cola.length, cola.length, 'Transcripciones listas')
  const resto = [sinSubtitulos && `${sinSubtitulos} sin subtítulos`, fallidos && `${fallidos} no se pudieron bajar o transcribir`].filter(Boolean)
  ctx.paso(
    'transcribir',
    `Transcritos ${hechos} de ${cola.length}${sinVoz ? `, ${sinVoz} sin voz` : ''}${resto.length ? `; ${resto.join(' y ')}` : ''}.`,
    fallidos ? `El último error: ${ultimoFallo}` : undefined
  )
}

/** Marca en el video lo que dice su transcripción. */
function marcar(v: VideoYT, t: Transcripcion) {
  v.transcrito = t.hecha
  const g = t.segmentos.length ? gancho(t) : undefined
  if (g) v.gancho = g
  else delete v.gancho
  if (t.segmentos.length) delete v.sinVoz
  else v.sinVoz = true
}

/**
 * Lo dicho al principio. En YouTube, los primeros 30 s. En TikTok e Instagram, lo de los primeros 3 s y hasta acabar esa
 * frase, con un máximo de 30 palabras: Whisper da trozos de hasta 30 s sin el tiempo de cada palabra, así que el de cada
 * trozo se reparte entre sus palabras. Si nada se dice en los primeros 3 s, no hay gancho dicho.
 */
function gancho(t: Pick<Transcripcion, 'red' | 'segmentos'>): string | undefined {
  if (t.red === 'youtube')
    return (
      t.segmentos
        .filter((s) => s.inicio < GANCHO_YOUTUBE)
        .map((s) => s.texto)
        .join(' ')
        .trim() || undefined
    )
  const palabras = t.segmentos.flatMap((s) => {
    const ps = s.texto.split(/\s+/).filter(Boolean)
    return ps.map((p, i) => ({ p, en: s.inicio + ((s.fin - s.inicio) * i) / ps.length }))
  })
  const dichas: string[] = []
  for (const { p, en } of palabras) {
    if (en >= GANCHO_VERTICAL && (!dichas.length || /[.!?…]["'»”)]*$/.test(dichas.at(-1)!))) break
    dichas.push(p)
    if (dichas.length >= MAX_PALABRAS) return `${dichas.join(' ').replace(/[,;:]$/, '')}…`
  }
  return dichas.join(' ') || undefined
}

/** El texto de una línea de subtítulos, sin etiquetas, sin entidades ni anotaciones de sonido (`[Música]`, `>>`). */
function limpiar(linea: string) {
  return linea
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[[^\]]*\]/g, '')
    .replace(/^\s*>>\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** El idioma de una pista o de un video de YouTube: `es` de `es-orig`, `es-419` o `es-US`. */
const lengua = (clave: string) => clave.split('-')[0].toLowerCase()

const segundos = (t: string) => t.split(':').reduce((a, x) => a * 60 + Number(x), 0)

/**
 * Un VTT en segmentos. Los automáticos de YouTube enseñan cada línea dos veces (abajo al decirla, arriba en la pista
 * siguiente, y además una pista de 10 ms entre las dos): de cada pista solo cuentan las líneas que no traía la anterior.
 */
function deVtt(vtt: string): Segmento[] {
  const segmentos: Segmento[] = []
  let antes = new Set<string>()
  for (const bloque of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lineas = bloque.split('\n')
    const i = lineas.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [inicio, fin] = lineas[i].split('-->').map((x) => segundos(x.trim().split(/\s+/)[0]))
    const textos = lineas.slice(i + 1).map(limpiar).filter(Boolean)
    const nuevas = textos.filter((t) => !antes.has(t))
    antes = new Set(textos)
    if (nuevas.length && Number.isFinite(inicio) && Number.isFinite(fin)) segmentos.push({ inicio, fin, texto: nuevas.join(' ') })
  }
  return segmentos
}

/**
 * La pista de subtítulos de un video de YouTube que dice lo que se habla, no una traducción ni un doblaje: la manual en
 * su idioma, o la automática original (`es-orig`). Un video doblado tiene una original por idioma, y las de los doblajes
 * llevan `variant=timing-optimized` en su enlace (2026-10-11): eso manda, porque YouTube a veces da como idioma del video
 * el de un doblaje (salió una transcripción en árabe de un video en español). Si no se distingue, la del idioma del
 * video o de su título, o la de español o inglés.
 */
function pista(info: any, titulo: string): { clave: string; manual: boolean } | null {
  const manuales: Record<string, any[]> = info?.subtitles ?? {}
  const auto: Record<string, any[]> = info?.automatic_captions ?? {}
  const vtt = (x?: any[]) => !!x?.some((f) => f?.ext === 'vtt')
  const base = lengua(String(info?.language ?? '')) || idiomaDe(titulo) || ''
  const orden = (k: string) => (lengua(k) === base ? 0 : lengua(k) === 'es' ? 1 : lengua(k) === 'en' ? 2 : 3)
  const originales = Object.keys(auto).filter((k) => k.endsWith('-orig') && vtt(auto[k]))
  const sinDoblar = originales.filter((k) => !auto[k].some((f) => /[?&]variant=/.test(f?.url ?? '')))
  const original = (sinDoblar.length === 1 ? sinDoblar : originales).sort((a, b) => orden(a) - orden(b))[0]
  const idioma = original ? lengua(original) : base
  const conVtt = Object.keys(manuales).filter((k) => k !== 'live_chat' && vtt(manuales[k]))
  const candidatas = [
    ...conVtt.filter((k) => idioma && lengua(k) === idioma).map((clave) => ({ clave, manual: true })),
    ...(original ? [{ clave: original, manual: false }] : []),
    ...(base && vtt(auto[base]) ? [{ clave: base, manual: false }] : []),
    ...conVtt.filter((k) => ['es', 'en'].includes(lengua(k))).map((clave) => ({ clave, manual: true }))
  ]
  return candidatas[0] ?? null
}

/**
 * Los subtítulos de un video de YouTube, sin bajarlo. Primero sus datos, para elegir la pista original, y luego solo esa
 * pista, desde esos mismos datos (`--load-info-json`): pedirlas todas (`es.*,en.*`) baja también las traducciones, y
 * YouTube frena a la tercera (429, el 2026-10-11). `null` si no tiene subtítulos.
 *
 * Los datos van sin formatos (`--ignore-no-formats-error`): los subtítulos llegan aunque YouTube pida «confirma que no
 * eres un bot» para ver el video, como pidió a todos el 2026-10-11. El cliente `web_embedded` dice además su idioma.
 */
export async function subtitulosYoutube(v: Pick<VideoYT, 'id' | 'titulo'>, tmp: string, signal: AbortSignal): Promise<{ idioma: string; segmentos: Segmento[] } | null> {
  const info = await correr(['--extractor-args', 'youtube:player_client=web_embedded', '--ignore-no-formats-error', '--skip-download', '--no-playlist', `https://www.youtube.com/watch?v=${v.id}`], signal)
  const p = pista(info, v.titulo)
  if (!p) return null
  const datos = join(tmp, `${v.id}.info.json`)
  const vtt = join(tmp, `${v.id}.${p.clave}.vtt`)
  try {
    writeFileSync(datos, JSON.stringify(info))
    await conYtdlp(['--load-info-json', datos, '--skip-download', p.manual ? '--write-subs' : '--write-auto-subs', '--sub-langs', p.clave, '--sub-format', 'vtt', '-o', join(tmp, '%(id)s.%(ext)s')], signal)
    if (!existsSync(vtt)) return null
    return { idioma: lengua(p.clave), segmentos: deVtt(readFileSync(vtt, 'utf8')) }
  } finally {
    rmSync(datos, { force: true })
    rmSync(vtt, { force: true })
  }
}

/**
 * El audio de un video de TikTok o Instagram, en un WAV de 16 kHz, mono y 16 bits, como lo pide Whisper. De TikTok se baja
 * el video más liviano con yt-dlp (su formato `audio` es el sonido de fondo, no la voz); de Instagram, el archivo de su
 * enlace directo.
 */
async function audio(v: VideoYT, enlace: string | undefined, tmp: string, signal: AbortSignal): Promise<string> {
  let medio: string
  if (v.red === 'instagram') {
    if (!enlace) throw new Error('Sin enlace para bajar el Reel.')
    medio = join(tmp, `${v.id}.mp4`)
    let r: Response
    try {
      r = await fetch(enlace, { signal })
      if (!r.ok) throw new Error(`Instagram respondió ${r.status} al bajar el Reel${r.status === 403 ? ': el enlace caducó' : ''}.`)
      writeFileSync(medio, Buffer.from(await r.arrayBuffer()))
    } catch (e) {
      if (signal.aborted) throw new Detenido('Detenida')
      throw e
    }
  } else {
    const dicho = await conYtdlp(['--no-playlist', '--no-simulate', '--print', 'after_move:filepath', '-f', 'w[format_id!=download]/w', '-o', join(tmp, '%(id)s.%(ext)s'), urlVertical(v)], signal)
    medio = dicho.trim().split('\n').at(-1)!.trim()
    if (!medio || !existsSync(medio)) throw new Error('yt-dlp no dijo dónde dejó el video.')
  }
  const wav = join(tmp, `${v.id}.wav`)
  try {
    await lanzar('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', medio, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], signal)
  } finally {
    rmSync(medio, { force: true })
  }
  return wav
}

/**
 * Cómo se escriben los nombres del nicho, para Whisper: las palabras con mayúscula que más se repiten en los títulos y
 * descripciones de los videos (Claude, ChatGPT, CapCut…). Un nombre lleva mayúscula también a media frase, en al menos 3
 * videos, y más veces con ella que sin ella: así no entra la que solo la lleva por abrir la frase («Sígueme», «Así»). Sin
 * ellas, Whisper oía «Cloud» donde decían «Claude».
 */
export function terminosDelNicho(videos: VideoYT[], max = 25): string[] {
  const conMayuscula = new Map<string, Map<string, Set<string>>>()
  const aMedia = new Map<string, Set<string>>()
  const sinMayuscula = new Map<string, number>()
  for (const v of videos)
    for (const frase of v.titulo.split(/[.!?¡¿:\n]+/u))
      for (const [i, p] of (frase.match(/[\p{L}\p{N}][\p{L}\p{N}.+-]*/gu) ?? []).entries()) {
        const palabra = p.replace(/[.+-]+$/, '')
        const clave = palabra.toLowerCase()
        if (palabra.length < 3) continue
        // Lo que va todo en mayúsculas es un grito («GRATIS»), no un nombre.
        if (/\p{Lu}/u.test(palabra) && palabra !== palabra.toUpperCase()) {
          const formas = conMayuscula.get(clave) ?? new Map<string, Set<string>>()
          formas.set(palabra, (formas.get(palabra) ?? new Set()).add(v.id))
          conMayuscula.set(clave, formas)
          if (i > 0) aMedia.set(clave, (aMedia.get(clave) ?? new Set()).add(v.id))
        } else if (palabra === clave) sinMayuscula.set(clave, (sinMayuscula.get(clave) ?? 0) + 1)
      }
  return [...conMayuscula]
    .map(([clave, formas]) => {
      const [forma, ids] = [...formas].sort((a, b) => b[1].size - a[1].size)[0]
      const veces = [...formas.values()].reduce((n, s) => n + s.size, 0)
      return { forma, ids: ids.size, veces, medio: aMedia.get(clave)?.size ?? 0, sin: sinMayuscula.get(clave) ?? 0 }
    })
    .filter((t) => t.medio >= 3 && t.veces > t.sin)
    .sort((a, b) => b.medio - a.medio)
    .slice(0, max)
    .map((t) => t.forma)
}

/** Whisper sobre un lote de audios, con el modelo cargado una vez. Si espera la GPU, lo dice en un paso. */
async function whisper(python: string, wavs: string[], ctx: CtxTranscribir, terminos: string[]): Promise<Record<string, Dicho>> {
  let esperando = false
  const salida = await lanzar(python, ['-E', '-s', '-B', '-X', 'utf8', 'transcribir-lote.py'], ctx.signal, {
    cwd: PROCESOS,
    entrada: JSON.stringify({ files: wavs, options: { modelos: MODELOS, terminos } }),
    plazo: 30 * 60_000,
    linea: (l) => {
      if (esperando || !l.startsWith('Esperando la GPU')) return
      esperando = true
      ctx.paso('pausa', 'Espero la GPU: un video se está transcribiendo.')
    }
  })
  try {
    return JSON.parse(salida)
  } catch {
    throw new Error('transcribir-lote.py no devolvió lo esperado.')
  }
}

/** yt-dlp sin `-J`, con el Python con que lo lanza `ytdlp()`. Devuelve lo que imprimió. */
function conYtdlp(args: string[], signal: AbortSignal) {
  const l = ytdlp()
  if (!l) return Promise.reject(new Error('Falta yt-dlp: instala el Python de Sloth, o corre «python -m pip install yt-dlp».'))
  return lanzar(l.exe, [...l.args, '-m', 'yt_dlp', '--no-warnings', ...args], signal)
}

/**
 * Corre un programa y devuelve su salida. Si se detiene la investigación, lo mata. Si falla, con su última línea de error
 * (la de `ERROR` en yt-dlp), y como `Pausa` si la red pidió ir más despacio (429).
 */
function lanzar(exe: string, args: string[], signal: AbortSignal, o: { cwd?: string; entrada?: string; plazo?: number; linea?: (l: string) => void } = {}): Promise<string> {
  return new Promise((ok, mal) => {
    if (signal.aborted) return mal(new Detenido('Detenida'))
    const p = spawn(exe, args, { cwd: o.cwd, windowsHide: true })
    let out = ''
    let err = ''
    let resto = ''
    p.stdout.setEncoding('utf8').on('data', (d) => (out += d))
    p.stderr.setEncoding('utf8').on('data', (d: string) => {
      err += d
      if (!o.linea) return
      const lineas = (resto + d).split(/\r?\n/)
      resto = lineas.pop() ?? ''
      for (const l of lineas) o.linea(l)
    })
    const matar = () => p.kill()
    signal.addEventListener('abort', matar, { once: true })
    const reloj = setTimeout(matar, o.plazo ?? 180_000)
    const fin = () => (clearTimeout(reloj), signal.removeEventListener('abort', matar))
    p.on('error', (e) => (fin(), mal(e)))
    p.on('close', (code) => {
      fin()
      if (signal.aborted) return mal(new Detenido('Detenida'))
      if (code !== 0) {
        const lineas = err
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('@progreso'))
        const linea = (lineas.filter((l) => /ERROR/.test(l)).at(-1) ?? lineas.at(-1) ?? `${exe} salió con ${code}`).replace(/^ERROR:\s*/, '')
        return mal(/429|Too Many Requests/i.test(err) ? new Pausa(linea) : new Error(linea))
      }
      ok(out)
    })
    p.stdin.on('error', () => {})
    p.stdin.end(o.entrada ?? '')
  })
}
