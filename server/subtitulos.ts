import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, join, relative, resolve, sep } from 'node:path'
import type { EstiloSubtitulos, OpcionesSubtitulos, Renglon, TrabajoSubtitulos } from '../shared/subtitulos.ts'
import { OPCIONES_SUBTITULOS } from '../shared/subtitulos.ts'
import { guardar } from './disco.ts'
import { cuerpo, json } from './http.ts'

/**
 * Los subtítulos de un video terminado, en la Entrega del hilo (`web/src/Subtitulos.tsx`, dentro de `Final.tsx`): sin
 * agente ni IA de pago. El transcriptor local de Sloth saca cada palabra con su tiempo (`video-base/scripts/subtitulos.py`),
 * aquí se juntan en renglones, se escriben el .srt y un .ass con el estilo elegido, y FFmpeg los graba en una copia.
 *
 * Van en la carpeta del video, fuera de `out/` para que no cuenten como otro video terminado:
 * `subtitulos/<video>/` con `subtitulos.json` (los renglones y las opciones), `<video>.srt` y `<video>-subtitulos.mp4`.
 * Corregir el texto o cambiar el estilo solo vuelve a grabar; si el video se rehízo, se transcribe otra vez. Uno a la vez
 * en toda la app: transcribir y grabar ya ocupan todo el procesador.
 *
 *  - `GET /api/sessions/<id>/subtitulos?ruta=out/x.mp4`: cómo van los de ese video.
 *  - `POST /api/sessions/<id>/subtitulos` `{ ruta, opciones, textos? }`: los pone, o los vuelve a grabar con otro estilo o
 *    el texto corregido (un texto por renglón).
 * Los archivos se bajan por `/api/sessions/<id>/archivo` (`server/etapas.ts`), como todo lo de la carpeta del video.
 * Quitarlo es borrar este archivo, `shared/subtitulos.ts`, sus líneas en `server/index.ts` y en `Final.tsx`, y
 * `Subtitulos.tsx`.
 */

const LIMITE_PYTHON = 60 * 60_000


// ——— Los renglones ———

export interface Palabra {
  text: string
  start: number
  end: number
}

/**
 * Las palabras en renglones. Corta al llegar a `maxPalabras` o `maxLetras`, al acabar una frase, en cada silencio de más
 * de `pausa` s (un renglón nunca junta dos frases que se dicen separadas) y en una coma si ya lleva `coma` letras: en
 * los clásicos, así no queda suelto el final de una frase larga.
 */
export function agrupar(palabras: Palabra[], estilo: EstiloSubtitulos): Renglon[] {
  const { maxPalabras, maxLetras, pausa, coma } =
    estilo === 'resaltada' ? { maxPalabras: 3, maxLetras: 18, pausa: 0.4, coma: 0 } : { maxPalabras: 14, maxLetras: 74, pausa: 0.7, coma: 22 }
  const renglones: Renglon[] = []
  let actual: Palabra[] = []
  const cerrar = () => actual.length && (renglones.push({ palabras: actual }), (actual = []))
  const largo = () => actual.reduce((n, a) => n + a.text.length + 1, -1)
  for (const p of palabras) {
    const texto = p.text.trim()
    if (!texto) continue
    const anterior = actual.at(-1)
    if (anterior && (p.start - anterior.end > pausa || actual.length >= maxPalabras || largo() + 1 + texto.length > maxLetras)) cerrar()
    actual.push({ text: texto, start: p.start, end: Math.max(p.start, p.end) })
    if (/[.!?…]$/.test(texto) || (/[,;:]$/.test(texto) && largo() >= coma)) cerrar()
  }
  cerrar()
  return renglones
}

/** Las palabras de todos los renglones, para volver a agruparlas con otro estilo. */
export const palabrasDe = (renglones: Renglon[]) => renglones.flatMap((r) => r.palabras)

/**
 * Los renglones con el texto corregido, uno por renglón: si quedan las mismas palabras, cada una conserva su tiempo; si
 * no, se reparten el del renglón a partes iguales. Un renglón vacío se quita.
 */
export function corregir(renglones: Renglon[], textos: string[]): Renglon[] {
  const salida: Renglon[] = []
  renglones.forEach((r, i) => {
    const nuevas = (textos[i] ?? r.palabras.map((p) => p.text).join(' ')).split(/\s+/).filter(Boolean)
    if (!nuevas.length || !r.palabras.length) return
    if (nuevas.length === r.palabras.length) return salida.push({ palabras: r.palabras.map((p, k) => ({ ...p, text: nuevas[k] })) })
    const inicio = r.palabras[0].start
    const paso = (r.palabras.at(-1)!.end - inicio) / nuevas.length
    const ms = (s: number) => Math.round(s * 1000) / 1000
    salida.push({ palabras: nuevas.map((text, k) => ({ text, start: ms(inicio + k * paso), end: ms(inicio + (k + 1) * paso) })) })
  })
  return salida
}

/**
 * Cuándo se ve cada renglón: de su primera palabra hasta el siguiente si el hueco es corto (sin parpadeo entre renglones),
 * y si no, un poco después de su última palabra.
 */
export function tiempos(renglones: Renglon[]): { inicio: number; fin: number }[] {
  return renglones.map((r, i) => {
    const inicio = r.palabras[0].start
    const ultima = r.palabras.at(-1)!.end
    const siguiente = renglones[i + 1]?.palabras[0].start ?? Infinity
    const fin = siguiente - ultima < 0.5 ? siguiente : Math.min(siguiente, ultima + 0.3)
    return { inicio, fin: Math.max(fin, inicio + 0.05) }
  })
}

// ——— Los archivos ———

const dos = (n: number) => String(n).padStart(2, '0')

function hms(s: number) {
  const total = Math.max(0, s)
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: Math.floor(total % 60), frac: total % 1 }
}

export function tiempoSrt(s: number): string {
  const t = hms(Math.round(s * 1000) / 1000)
  return `${dos(t.h)}:${dos(t.m)}:${dos(t.s)},${String(Math.round(t.frac * 1000) % 1000).padStart(3, '0')}`
}

export function tiempoAss(s: number): string {
  const t = hms(Math.round(s * 100) / 100)
  return `${t.h}:${dos(t.m)}:${dos(t.s)}.${dos(Math.round(t.frac * 100) % 100)}`
}

export function srt(renglones: Renglon[]): string {
  const t = tiempos(renglones)
  return renglones
    .map((r, i) => `${i + 1}\n${tiempoSrt(t[i].inicio)} --> ${tiempoSrt(t[i].fin)}\n${r.palabras.map((p) => p.text).join(' ')}\n`)
    .join('\n')
}

/** El ámbar de Sloth (`--amber`), como lo escribe ASS: &HBBGGRR. */
const AMBAR = '&H3DA3E8&'
const BLANCO = '&HFFFFFF&'

/** Las llaves y la barra invertida mandan en ASS: en el texto de alguien no deben. */
const limpio = (t: string) => t.replace(/[{}]/g, '').replace(/\\/g, '/')

export interface Medidas {
  ancho: number
  alto: number
}

/** La letra de cada estilo: gruesa en la resaltada, como los verticales; la de siempre en los clásicos. */
export const LETRA: Record<EstiloSubtitulos, string> = { resaltada: 'Arial Black', clasicos: 'Arial' }

/**
 * El .ass con el estilo elegido, a la medida del video. «Palabra resaltada»: pocas palabras en mayúsculas, gruesas, y la
 * que se está diciendo en ámbar (un evento por palabra). «Clásicos»: el renglón entero en blanco, que libass parte en dos
 * líneas parejas si no cabe.
 */
export function ass(renglones: Renglon[], o: OpcionesSubtitulos, v: Medidas): string {
  const corto = Math.min(v.ancho, v.alto)
  const vertical = v.alto > v.ancho
  const escala = o.estilo === 'resaltada' ? { chico: 0.06, mediano: 0.08, grande: 0.1 } : { chico: 0.045, mediano: 0.055, grande: 0.068 }
  const tamano = Math.round(corto * escala[o.tamano])
  const alineacion = { arriba: 8, centro: 5, abajo: 2 }[o.posicion]
  // Abajo, en un vertical, por encima del texto y los botones de TikTok y Reels.
  const margenV = Math.round(v.alto * (o.posicion === 'abajo' && vertical ? 0.2 : o.posicion === 'centro' ? 0 : 0.08))
  const margenH = Math.round(v.ancho * 0.08)
  const borde = Math.max(2, Math.round(tamano * (o.estilo === 'resaltada' ? 0.1 : 0.07)))
  const cabeza = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${v.ancho}`,
    `PlayResY: ${v.alto}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sloth,${LETRA[o.estilo]},${tamano},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${borde},${o.estilo === 'resaltada' ? 0 : Math.round(borde / 2)},${alineacion},${margenH},${margenH},${margenV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  const t = tiempos(renglones)
  const evento = (inicio: number, fin: number, texto: string) => `Dialogue: 0,${tiempoAss(inicio)},${tiempoAss(fin)},Sloth,,0,0,0,,${texto}`
  const eventos: string[] = []
  renglones.forEach((r, i) => {
    if (o.estilo === 'clasicos') return eventos.push(evento(t[i].inicio, t[i].fin, limpio(r.palabras.map((p) => p.text).join(' '))))
    const palabras = r.palabras.map((p) => limpio(p.text.toLocaleUpperCase('es')))
    r.palabras.forEach((p, k) => {
      const inicio = k === 0 ? t[i].inicio : p.start
      const fin = r.palabras[k + 1]?.start ?? t[i].fin
      if (fin <= inicio) return
      const texto = palabras.map((w, j) => (j === k ? `{\\c${AMBAR}}${w}{\\c${BLANCO}}` : w)).join(' ')
      eventos.push(evento(inicio, fin, texto))
    })
  })
  return [...cabeza, ...eventos, ''].join('\n')
}

/** Los archivos de las letras, donde las tiene cada sistema; en Linux, las encuentra fontconfig. */
function letras(estilo: EstiloSubtitulos): string[] {
  const fuentes =
    process.platform === 'win32'
      ? join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts')
      : process.platform === 'darwin'
        ? '/System/Library/Fonts/Supplemental'
        : ''
  if (!fuentes) return []
  const nombres = process.platform === 'win32' ? { resaltada: ['ariblk.ttf', 'arialbd.ttf'], clasicos: ['arialbd.ttf'] } : { resaltada: ['Arial Black.ttf', 'Arial Bold.ttf'], clasicos: ['Arial Bold.ttf'] }
  return nombres[estilo].map((n) => join(fuentes, n)).filter((f) => existsSync(f))
}

// ——— Los programas ———

/** Corre un programa; `linea` recibe cada línea de su salida. Resuelve con el código y lo último que dijo. */
function correr(programa: string, args: string[], cwd: string, linea: (l: string) => void, env: NodeJS.ProcessEnv = {}, limite?: number) {
  return new Promise<{ codigo: number; cola: string }>((ok) => {
    let cola = ''
    let resto = ''
    const p = spawn(programa, args, { cwd, env: { ...process.env, ...env, PYTHONUTF8: '1' }, windowsHide: true, ...(limite ? { timeout: limite } : {}) })
    const leer = (d: Buffer) => {
      const texto = resto + d.toString('utf8')
      const lineas = texto.split(/\r?\n/)
      resto = lineas.pop() ?? ''
      for (const l of lineas) if (l.trim()) (linea(l.trim()), (cola = (cola + '\n' + l).slice(-3000)))
    }
    p.stdout.on('data', leer)
    p.stderr.on('data', leer)
    p.on('error', (e) => ok({ codigo: -1, cola: e.message }))
    p.on('close', (codigo) => ok({ codigo: codigo ?? -1, cola: (cola + '\n' + resto).trim() }))
  })
}

/** Ancho, alto y duración del video, con ffprobe; el giro de un celular cambia el ancho por el alto. */
async function medir(video: string, cwd: string): Promise<Medidas & { duracion: number }> {
  let salida = ''
  const r = await correr('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration', '-of', 'json', video], cwd, (l) => (salida += l))
  if (r.codigo !== 0) throw new Error('No pude leer el video: ¿es un archivo de video?')
  const datos = JSON.parse(salida)
  const s = datos.streams?.[0]
  if (!s?.width) throw new Error('El archivo no tiene imagen.')
  const giro = Math.abs(Number(s.side_data_list?.find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0)) % 180 === 90
  return { ancho: giro ? s.height : s.width, alto: giro ? s.width : s.height, duracion: Number(datos.format?.duration) || 0 }
}

/** «Mi video (1).MOV» → `mi-video-1`. */
export const nombreArchivo = (nombre: string) =>
  nombre
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'video'

const opcionesValidas = (o: Partial<OpcionesSubtitulos> | undefined): OpcionesSubtitulos => ({
  estilo: OPCIONES_SUBTITULOS.estilo.some((x) => x.value === o?.estilo) ? o!.estilo! : 'resaltada',
  tamano: OPCIONES_SUBTITULOS.tamano.some((x) => x.value === o?.tamano) ? o!.tamano! : 'mediano',
  posicion: OPCIONES_SUBTITULOS.posicion.some((x) => x.value === o?.posicion) ? o!.posicion! : 'abajo'
})

// ——— El servidor ———

/** Lo que se guarda de cada video en `subtitulos.json`. */
interface Guardado {
  /** La fecha del video cuando se transcribió: si cambia, el video se rehízo y hay que transcribir otra vez. */
  t: number
  ancho: number
  alto: number
  duracion: number
  opciones: OpcionesSubtitulos
  renglones: Renglon[]
}

export interface Dependencias {
  /** La carpeta del video de un hilo, o undefined si el hilo no tiene. */
  carpeta(sessionId: string): string | undefined
  /** La carpeta de `video-base/scripts`, donde está `subtitulos.py`. */
  scripts: string
  /** El Python de Sloth, o null si aún no se bajó. */
  python(): string | null
  banderas: string[]
}

export function subtitulos(d: Dependencias) {
  /** El que trabaja ahora (por la ruta entera del video): su estado va en cada consulta. */
  let actual: { video: string; estado: 'transcribiendo' | 'grabando'; aviso: string; avance?: number } | null = null
  const errores = new Map<string, string>()

  /** El video pedido y su carpeta de subtítulos, si es un MP4 dentro de la carpeta del hilo. */
  function ubicar(sessionId: string, ruta: string) {
    const carpeta = d.carpeta(sessionId)
    if (!carpeta || !ruta) return null
    const video = resolve(carpeta, ruta)
    if (!video.startsWith(resolve(carpeta) + sep) || !video.toLowerCase().endsWith('.mp4') || !existsSync(video)) return null
    const nombre = nombreArchivo(basename(video))
    const dir = join(carpeta, 'subtitulos', nombre)
    return { carpeta, video, dir, json: join(dir, 'subtitulos.json'), mp4: join(dir, `${nombre}-subtitulos.mp4`), srt: join(dir, `${nombre}.srt`) }
  }
  type Lugar = NonNullable<ReturnType<typeof ubicar>>

  const leer = (l: Lugar): Guardado | null => {
    try {
      return JSON.parse(readFileSync(l.json, 'utf8'))
    } catch {
      return null
    }
  }
  const fecha = (f: string) => Math.round(statSync(f).mtimeMs)
  /** Las rutas, como las pide `/archivo`: relativas a la carpeta del video y con «/». */
  const rel = (l: Lugar, f: string) => relative(l.carpeta, f).split(sep).join('/')

  function vista(l: Lugar): TrabajoSubtitulos {
    const g = leer(l)
    const trabaja = actual?.video === l.video ? actual : null
    const hecho = !!g && existsSync(l.mp4)
    const base = { opciones: g?.opciones ?? opcionesValidas(undefined), desactualizado: !!g && g.t !== fecha(l.video) }
    if (trabaja) return { ...base, estado: trabaja.estado, aviso: trabaja.aviso, avance: trabaja.avance, t: 0 }
    if (errores.has(l.video)) return { ...base, estado: 'error', aviso: errores.get(l.video)!, t: 0, renglones: g?.renglones }
    if (!hecho) return { ...base, estado: 'nada', aviso: '', t: 0 }
    return { ...base, estado: 'listo', aviso: '', video: rel(l, l.mp4), srt: rel(l, l.srt), t: fecha(l.mp4), renglones: g.renglones }
  }

  /** Graba el .srt, el .ass y la copia con subtítulos. */
  async function grabar(l: Lugar, g: Guardado) {
    guardar(l.srt, srt(g.renglones))
    guardar(join(l.dir, 'subtitulos.ass'), ass(g.renglones, g.opciones, g))
    const fuentes = join(l.dir, 'fuentes')
    rmSync(fuentes, { recursive: true, force: true })
    mkdirSync(fuentes)
    for (const f of letras(g.opciones.estilo)) copyFileSync(f, join(fuentes, basename(f)))
    actual = { video: l.video, estado: 'grabando', aviso: 'Grabando los subtítulos en el video…', avance: 0 }
    const temporal = join(l.dir, `_${basename(l.mp4)}`)
    // El filtro `ass` va con rutas relativas: no se lleva con «C:\» ni con espacios.
    const r = await correr(
      'ffmpeg',
      ['-nostdin', '-y', '-v', 'error', '-progress', 'pipe:1', '-i', l.video, '-vf', 'ass=subtitulos.ass:fontsdir=fuentes', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', temporal],
      l.dir,
      (linea) => {
        const us = /^out_time_us=(\d+)/.exec(linea)
        if (us && g.duracion && actual) actual.avance = Math.min(1, Number(us[1]) / 1e6 / g.duracion)
      }
    )
    rmSync(fuentes, { recursive: true, force: true })
    if (r.codigo !== 0) throw new Error(`FFmpeg no pudo grabarlos: ${r.cola.split('\n').filter((x) => !x.includes('=')).slice(-2).join(' ')}`)
    try {
      renameSync(temporal, l.mp4)
    } catch {
      // Windows no deja reemplazar uno que se está leyendo: se copia encima.
      copyFileSync(temporal, l.mp4)
      rmSync(temporal, { force: true })
    }
  }

  async function transcribir(l: Lugar, opciones: OpcionesSubtitulos): Promise<Guardado> {
    const python = d.python()
    if (!python) throw new Error('Falta el transcriptor de Sloth: descárgalo en Opciones → Requisitos («Python de Sloth»).')
    actual = { video: l.video, estado: 'transcribiendo', aviso: 'Transcribiendo la voz en tu computadora…' }
    const t = fecha(l.video)
    const medidas = await medir(l.video, l.dir)
    const salida = join(l.dir, 'palabras.json')
    const r = await correr(python, [...d.banderas, join(d.scripts, 'subtitulos.py'), l.video, salida], l.dir, (linea) => {
      if (actual && /^(Transcrib|Esperando)/.test(linea)) actual.aviso = linea
    }, {}, LIMITE_PYTHON)
    if (r.codigo !== 0 || !existsSync(salida)) {
      const motivo = r.cola.split('\n').filter((x) => !/^\s*(File |Traceback|\^)/.test(x)).slice(-2).join(' ')
      throw new Error(motivo || 'No se pudo transcribir.')
    }
    const palabras: Palabra[] = JSON.parse(readFileSync(salida, 'utf8'))
    rmSync(salida, { force: true })
    if (!palabras.length) throw new Error('No se oye a nadie hablar en el video.')
    return { t, ...medidas, opciones, renglones: agrupar(palabras, opciones.estilo) }
  }

  async function trabajar(l: Lugar, pedido: { opciones?: Partial<OpcionesSubtitulos>; textos?: string[] }) {
    errores.delete(l.video)
    try {
      mkdirSync(l.dir, { recursive: true })
      const antes = leer(l)
      const opciones = opcionesValidas({ ...antes?.opciones, ...pedido.opciones })
      let g: Guardado
      // Sin renglones, o con un video que se rehízo, se transcribe; si no, solo se vuelve a grabar.
      if (!antes || antes.t !== fecha(l.video)) g = await transcribir(l, opciones)
      else {
        g = { ...antes, opciones }
        if (Array.isArray(pedido.textos)) g.renglones = corregir(g.renglones, pedido.textos.map(String))
        // Otro estilo lleva renglones de otro largo: se rehacen con las palabras, ya corregidas.
        if (opciones.estilo !== antes.opciones.estilo) g.renglones = agrupar(palabrasDe(g.renglones), opciones.estilo)
      }
      guardar(l.json, JSON.stringify(g, null, 2))
      await grabar(l, g)
    } catch (e) {
      errores.set(l.video, e instanceof Error ? e.message : String(e))
    } finally {
      actual = null
    }
  }

  async function api(req: IncomingMessage, res: ServerResponse, pedido: URL): Promise<boolean> {
    const m = /^\/api\/sessions\/([\w-]+)\/subtitulos$/.exec(pedido.pathname)
    if (!m || (req.method !== 'GET' && req.method !== 'POST')) return false
    if (req.method === 'GET') {
      const l = ubicar(m[1], pedido.searchParams.get('ruta') ?? '')
      return l ? json(res, 200, vista(l)) : json(res, 404, { error: 'No existe ese video.' })
    }
    const i = await cuerpo<{ ruta?: string; opciones?: Partial<OpcionesSubtitulos>; textos?: string[] }>(req)
    const l = ubicar(m[1], String(i.ruta ?? ''))
    if (!l) return json(res, 404, { error: 'No existe ese video.' })
    if (actual) return json(res, 409, { error: 'Ya se están poniendo subtítulos a otro video. Espera a que terminen.' })
    actual = { video: l.video, estado: 'grabando', aviso: 'Empezando…' }
    void trabajar(l, i)
    return json(res, 200, vista(l))
  }

  /** Para «Reiniciar backend»: no cortarlo a medias. */
  const ocupado = () => (actual ? 'Se están poniendo subtítulos a un video. Espera a que terminen.' : null)

  return { api, ocupado }
}
