import { execFile, execFileSync, spawn } from 'node:child_process'
import { chmodSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { copyFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as esperar } from 'node:timers/promises'
import type { MotorVoz as Motor, Requisito } from '../shared/types.ts'
import { llaveEnUso } from './acceso.ts'
import { correr } from './version.ts'

/**
 * Lo que las skills necesitan fuera de Sloth: FFmpeg, Python y sus paquetes, el Python de Sloth y, opcional, la cuenta de
 * ChatGPT. Quien abre la app por primera vez ve encima del compositor lo que le falta al estilo elegido (de los paquetes,
 * solo los que importa su skill), y «Descargar todo» lo instala uno tras otro, sin permisos de administrador (todo va a
 * su usuario). ChatGPT no se instala: se conecta en Opciones.
 *
 * FFmpeg y el Python de las skills se bajan ya armados a `BAJADAS` (que scripts/start.mjs pone primero en el PATH). El
 * Python, en Mac y Linux, es siempre ese: el del sistema
 * falta (Mac) o no deja instalar paquetes con pip (Ubuntu). En Windows sirve el que ya tengas mientras haya paquetes
 * compilados para él; si no, `paquetes` pasa al de Sloth.
 */

/**
 * Los paquetes de Python que importan los scripts de las skills: módulo → paquete de pip, su nombre, para qué es y las
 * skills que lo importan. La card de cada estilo pide solo los de su skill; Opciones, todos.
 */
const PAQUETES: Record<string, { pip: string; nombre: string; uso: string; skills: string[]; fueraDeWindows?: true }> = {
  PIL: { pip: 'pillow', nombre: 'Pillow', uso: 'imágenes', skills: ['video-el-diff', 'video-explicativo', 'reel-collage', 'video-documental'] },
  numpy: { pip: 'numpy', nombre: 'NumPy', uso: 'sonido', skills: ['video-el-diff', 'video-explicativo', 'reel-collage', 'video-documental'] },
  cv2: { pip: 'opencv-python-headless', nombre: 'OpenCV', uso: 'el color de las imágenes', skills: ['video-documental'] },
  soundfile: { pip: 'soundfile', nombre: 'soundfile', uso: 'sonido', skills: ['video-documental'] },
  scipy: { pip: 'scipy', nombre: 'SciPy', uso: 'sonido', skills: ['video-el-diff', 'video-explicativo'] },
  playwright: { pip: 'playwright', nombre: 'Playwright', uso: 'capturas', skills: ['reel-collage'] },
  // El Diff recorta con `recorte.py` de video-base.
  rembg: { pip: 'rembg[cpu]', nombre: 'rembg', uso: 'recortes', skills: ['video-el-diff', 'video-explicativo', 'reel-collage'] },
  edge_tts: { pip: 'edge-tts', nombre: 'edge-tts', uso: 'voz', skills: ['reel-collage'] },
  // El OCR de `ubicar.py` en Mac y Linux (en Windows usa el del sistema). Corre con el onnxruntime que trae rembg[cpu].
  rapidocr: { pip: 'rapidocr', nombre: 'RapidOCR', uso: 'leer texto en imágenes', skills: ['video-el-diff'], fueraDeWindows: true }
}

interface Pieza {
  id: string
  nombre: string
  para: string
  aMano?: string
  /** Sin ella todo funciona, peor: no avisa como lo que falta. */
  opcional?: boolean
  /** `null` si falta; si no, lo que se encontró (la versión). */
  mirar(app: string): Promise<string | null>
  /** Lo que falta, cuando no basta con decir que falta. */
  falta?(app: string): Promise<string | undefined>
  /** El comando que la instala. Sin él, se consigue a mano (`aMano`). */
  instalar?(app: string): Promise<string>
}

const version = (comando: string, patron: RegExp) => (app: string) => correr(comando, app).then((s) => patron.exec(s)?.[1] ?? '', () => null)

/** Los de `modulos` que faltan, sin importarlos (rembg tarda segundos en cargar). `null` si no hay Python. */
async function modulosQueFaltan(app: string, modulos: string[]): Promise<string[] | null> {
  // Con comillas simples: las dobles las lee cmd.
  const codigo = `import importlib.util as u;print(','.join(m for m in [${modulos.map((m) => `'${m}'`)}] if not u.find_spec(m)))`
  return correr(`python -c "${codigo}"`, app).then((s) => s.split(',').filter(Boolean), () => null)
}

const WINDOWS = process.platform === 'win32'
/**
 * Donde lo buscan todos (aquí, `sloth.py` de video-base y `comun.py` de El Diff): `<id>\python\python.exe`, o
 * `<id>/python/bin/python3` en Mac y Linux. %APPDATA% fuera de Windows lo pone scripts/start.mjs.
 */
const PYTHONES = join(process.env.APPDATA ?? '', 'youtube', 'piezas', 'python')
/** El ejecutable dentro de un Python de python-build-standalone. */
const EXE_PY = WINDOWS ? 'python.exe' : join('bin', 'python3')
/** Los modelos de la transcripción y de los vectores, en una carpeta por modelo (`modelos_transcripcion.py`). */
export const MODELOS = join(process.env.APPDATA ?? '', 'youtube', 'modelos')
export const BANDERAS = ['-E', '-s', '-B', '-X', 'utf8']
/** Lo que Sloth baja para las skills (FFmpeg; fuera de Windows, también Python). `bin` va primero en el PATH (scripts/start.mjs). */
const BAJADAS = join(process.env.APPDATA ?? '', 'sloth', 'piezas')
const BAJADAS_BIN = join(BAJADAS, 'bin')
/** El Python propio con que corren las skills: en Windows, su carpeta va en el PATH (scripts/start.mjs). */
const PYTHON_BAJADO = join(BAJADAS, 'python', 'python', EXE_PY)

/**
 * El `python.exe` del Python de Sloth, o null. Trae yt-dlp y WhisperX y se lanza siempre con `-E -s -B -X utf8`: sin
 * -B, el que instaló la app de YouTube (archivada) reescribe sus .pyc, aquella app cree que se dañó y vuelve a bajar 4 GB.
 */
export function rutaPythonSloth(): string | null {
  const id = elegirPython(existsSync(PYTHONES) ? readdirSync(PYTHONES).filter((id) => existsSync(join(PYTHONES, id, 'python', EXE_PY))) : [], (id) => statSync(join(PYTHONES, id, 'python', EXE_PY)).mtimeMs)
  return id ? join(PYTHONES, id, 'python', EXE_PY) : null
}

/**
 * Cuál de los Python de Sloth se usa si hay más de uno (el que instaló esta app, `*-sloth`, y uno de la app de YouTube
 * archivada): el de esta app y, entre iguales, el más nuevo. `python_sloth()` de `sloth.py` elige igual: antes esta
 * miraba uno y las skills usaban otro.
 */
export function elegirPython(ids: string[], fecha: (id: string) => number): string | undefined {
  return [...ids].sort((a, b) => Number(b.endsWith('-sloth')) - Number(a.endsWith('-sloth')) || fecha(b) - fecha(a))[0]
}

/** La carpeta del Python de Sloth que se usa (`<piezas>/python/<id>`), si está entero (para borrar los otros); si no, null. */
export async function pythonSlothEntero(app: string): Promise<string | null> {
  const python = rutaPythonSloth()
  if (!python) return null
  const falta = await faltaAlPythonSloth(app)
  return falta && !falta.length ? dirname(dirname(WINDOWS ? python : dirname(python))) : null
}

/**
 * Con qué transcribe la voz el Python de Sloth (`MotorVoz`): sin NVIDIA, Parakeet va unas cinco veces más rápido que
 * Whisper en el procesador. Se elige al instalarlo y lo dice el nombre de su carpeta.
 */
export const motorDe = (carpeta: string): Motor => (/-cu\d+/.test(carpeta) ? 'whisper' : /-onnx-/.test(carpeta) ? 'parakeet-solo' : 'parakeet')

/** El motor del Python de Sloth que se usa, o null si no hay. */
export function motorSloth(): Motor | null {
  const python = rutaPythonSloth()
  return python ? motorDe(python.slice(PYTHONES.length)) : null
}

/**
 * Lo que le falta al Python de Sloth (`falta`: módulos y modelos sin los que no transcribe) y lo que lo haría más rápido
 * (`mejora`: Parakeet, en uno sin NVIDIA que ya transcribe con Whisper), de `check()` de
 * `python/procesos/modelos_transcripcion.py`, que sabe los tamaños de los modelos. `null` si no hay Python de Sloth o no
 * se pudo mirar.
 */
function revisarPythonSloth(app: string): Promise<{ falta: string[]; mejora: string[] } | null> {
  const python = rutaPythonSloth()
  const motor = motorSloth()
  if (!python || !motor) return Promise.resolve(null)
  const codigo = 'import sys,json,pathlib,modelos_transcripcion as m;print(json.dumps(m.check(pathlib.Path(sys.argv[1]),sys.argv[2])))'
  return new Promise((ok) =>
    execFile(python, [...BANDERAS, '-c', codigo, MODELOS, motor], { cwd: join(app, 'python', 'procesos'), windowsHide: true }, (error, salida) => {
      try {
        ok(error ? null : JSON.parse(salida.trim().split(/\r?\n/).pop()!))
      } catch {
        ok(null)
      }
    })
  )
}

const faltaAlPythonSloth = (app: string) => revisarPythonSloth(app).then((r) => r?.falta ?? null)

/** Lo que haría más rápido al Python de Sloth (vacío si nada), o null si no hay o no se pudo mirar. */
export const mejoraDelPythonSloth = (app: string) => revisarPythonSloth(app).then((r) => r?.mejora ?? null)

/**
 * El Python de Sloth en una computadora nueva: un Python propio (python-build-standalone, sin tocar el del sistema) en
 * `PYTHONES`, con las versiones con que se hizo todo (3.12, torch 2.8, WhisperX 3.8.6), y sus modelos en `MODELOS`. Con
 * una NVIDIA, torch con CUDA y Whisper; sin ella, el torch de CPU y Parakeet (`Motor`). Si se corta, volver a pulsar
 * sigue donde se quedó: pip y los modelos se saltan lo que ya está.
 */
const SISTEMA: Record<string, string> = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu'
}

/**
 * Para qué procesador se baja lo de fuera (Python, FFmpeg). La de Mac con Intel, en un Mac con Apple Silicon, corre con
 * Rosetta (`sysctl.proc_translated` vale 1): ahí se bajan los de ARM, que corren nativos y tienen torch (el de Intel
 * dejó de salir en la 2.3). La de Apple Silicon ya es de ARM.
 */
export const ARQUITECTURA = (() => {
  if (process.platform !== 'darwin' || process.arch !== 'x64') return process.arch
  try {
    return execFileSync('sysctl', ['-n', 'sysctl.proc_translated'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === '1' ? 'arm64' : 'x64'
  } catch {
    return 'x64'
  }
})()
/** Un Mac con Intel: no hay torch 2.8 para él, así que su Python de Sloth no lleva torch (`parakeet-solo`). */
const SIN_TORCH = process.platform === 'darwin' && ARQUITECTURA === 'x64'
const PYTHON_STANDALONE = `https://github.com/astral-sh/python-build-standalone/releases/download/20261013/cpython-3.12.15%2B20261013-${SISTEMA[`${process.platform}-${ARQUITECTURA}`] ?? SISTEMA['win32-x64']}-install_only.tar.gz`
const TORCH = ['torch==2.8.0', 'torchaudio==2.8.0', 'torchvision==0.23.0']
// `hf_xet` baja los modelos de Hugging Face más rápido; `deno` resuelve los retos de JavaScript de YouTube en yt-dlp.
const PIP_SLOTH = ['whisperx==3.8.6', 'transformers==4.57.6', 'hf_xet', 'yt-dlp[default]', 'deno', 'scikit-learn']
const PARAKEET = 'onnx-asr[cpu]==0.12.0'
const PIP_SIN_TORCH = [PARAKEET, 'huggingface_hub', 'hf_xet', 'yt-dlp[default]', 'deno']
/** Baja lo que falte de los modelos del motor (`sys.argv[2]`): el suyo, el alineador de la voz y el de vectores (huellas.py), que pide torch. */
const BAJAR_MODELOS = [
  'import sys,pathlib,modelos_transcripcion as m',
  'd=pathlib.Path(sys.argv[1]); motor=sys.argv[2]',
  "xs=m.needed('voxpopuli-es',motor)",
  "if motor!='parakeet-solo':",
  '  from vectores import E5; xs.append(E5)',
  'for x in xs:',
  "  if not x.installed(d): print('Bajando',x.name,flush=True); x.download(d)"
].join('\n')

/** WhisperX en la GPU ocupa unos 3 GB: con menos memoria que esta (en MiB), mejor Parakeet en el procesador. */
const MEMORIA_CUDA = 3900

/**
 * Si la NVIDIA aguanta el torch de CUDA 12.8 y Whisper (`nvidia-smi --query-gpu=compute_cap,driver_version,memory.total`,
 * una línea por tarjeta): cómputo 7.0 o más (de 2017 en adelante), un controlador 528.33 o más nuevo y 4 GB de memoria
 * (las MX450 y MX550 de las laptops traen 2). Con una que no, serían ~5 GB de más para nada: va el de CPU, con Parakeet.
 * Las dos primeras cifras son las de la app de YouTube archivada.
 */
export function aguantaCuda(salida: string): boolean {
  return salida.split(/\r?\n/).some((linea) => {
    const [computo = '', controlador = '', memoria = ''] = linea.split(',').map((x) => x.trim())
    const [mayor = 0, menor = 0] = controlador.split('.').map(Number)
    return Number(computo) >= 7 && (mayor > 528 || (mayor === 528 && menor >= 33)) && Number(memoria) >= MEMORIA_CUDA
  })
}

export async function instalarPythonSloth(app: string, { raiz = PYTHONES, modelos = MODELOS, cuda }: { raiz?: string; modelos?: string; cuda?: boolean } = {}) {
  cuda ??= await correr('nvidia-smi --query-gpu=compute_cap,driver_version,memory.total --format=csv,noheader,nounits', app).then(aguantaCuda, () => false)
  const motor: Motor = cuda ? 'whisper' : SIN_TORCH ? 'parakeet-solo' : 'parakeet'
  const carpeta = join(raiz, `3.12.15-${cuda ? 'cu128' : SIN_TORCH ? 'onnx' : 'cpu'}-sloth`)
  paso = 'Bajando Python'
  const python = await pythonStandalone(carpeta, app)
  paso = 'Preparando los paquetes'
  const pipUnaVez = (...args: string[]) =>
    ejecutar(python, ['-E', '-s', '-X', 'utf8', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location', ...args], app, verPaso)
  // Una descarga dañada se reintenta una vez sin la caché de pip, que la guardaría: casi siempre es el espejo de PyTorch,
  // que rehace sus páginas varias veces al día y por unos minutos anuncia huellas que no son las de sus archivos.
  const pip = (...args: string[]) =>
    pipUnaVez(...args).catch(async (e) => {
      if (!descargaDanada(String(e))) throw e
      paso = 'La descarga llegó dañada: se vuelve a bajar en un momento'
      await esperar(60_000)
      return pipUnaVez('--no-cache-dir', ...args)
    })
  if (motor === 'parakeet-solo') await pip(...PIP_SIN_TORCH)
  else {
    // En Windows y Mac, el torch de PyPI es el de CPU (en Mac, con la GPU de Apple); en Linux, el de CUDA, que pesa gigas
    // de más sin una NVIDIA: ahí va antes el de CPU. Del espejo de PyTorch salen solo los tres torch (`--no-deps`): sus
    // dependencias, como todo lo demás, vienen de PyPI en el pip siguiente.
    const indice = cuda ? 'cu128' : process.platform === 'linux' ? 'cpu' : null
    if (indice) await pip(...TORCH, '--no-deps', '--index-url', `https://download.pytorch.org/whl/${indice}`)
    await pip(...TORCH, ...PIP_SLOTH, ...(motor === 'parakeet' ? [PARAKEET] : []))
  }
  mkdirSync(modelos, { recursive: true })
  return ejecutar(python, [...BANDERAS, '-c', BAJAR_MODELOS, modelos, motor], join(app, 'python', 'procesos'), verPaso)
}

/**
 * yt-dlp se pone al día una vez al día, cuando no trabaja nadie (`libre`): YouTube cambia seguido, y con el que dejó la
 * instalación, que nunca se tocaba, la descarga acaba pidiendo «Sign in to confirm you're not a bot». Si falla, sigue
 * el que había, y se vuelve a intentar la siguiente vez.
 */
export async function actualizarYtDlp(app: string, libre: () => boolean) {
  const python = rutaPythonSloth()
  const marca = join(app, 'data', 'yt-dlp.txt')
  const hoy = new Date().toISOString().slice(0, 10)
  if (!python || instalando || ytDlp || !libre() || (existsSync(marca) && readFileSync(marca, 'utf8') === hoy)) return
  ytDlp = true
  try {
    await ejecutar(python, ['-E', '-s', '-X', 'utf8', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location', '--upgrade', 'yt-dlp[default]'], app)
    writeFileSync(marca, hoy)
  } catch (e) {
    console.error(`No se pudo poner al día yt-dlp: ${e instanceof Error ? e.message : e}`)
  } finally {
    ytDlp = false
  }
}
let ytDlp = false

/**
 * Lo que va haciendo la instalación en curso, en su fila en vez de «Descargando…»: el Python de Sloth baja gigas durante
 * muchos minutos y, sin decir qué, parece atascado.
 */
let paso: string | undefined
const verPaso = (linea: string) => void (paso = pasoDePip(linea) ?? paso)

/** Lo que dice pip cuando un archivo no tiene la huella (sha256) que anuncia el índice: llegó dañado o cambiado. */
export const descargaDanada = (salida: string) => /DO NOT MATCH THE HASHES|Expected sha256/.test(salida)

/** «Bajando torch (3,4 GB)» de las líneas de pip (y de `BAJAR_MODELOS`) que dicen en qué va; `undefined` de las demás. */
export function pasoDePip(linea: string): string | undefined {
  const bajando = /^\s*Downloading (?:\S*\/)?([A-Za-z0-9_.]+?)-\d\S*\s+\(([\d.]+) (kB|MB|GB)\)/.exec(linea)
  if (bajando) {
    const [, nombre, cuanto, unidad] = bajando
    const [n, u] = unidad === 'MB' && +cuanto >= 1000 ? [(+cuanto / 1000).toFixed(1), 'GB'] : [cuanto, unidad]
    return `Bajando ${nombre} (${n.replace('.', ',')} ${u})`
  }
  if (/^\s*Installing collected packages/.test(linea)) return 'Instalando los paquetes'
  const modelo = /^Bajando (\S+)/.exec(linea)
  if (modelo) return `Bajando el modelo ${modelo[1]}`
}

/**
 * Un Python de python-build-standalone en `<carpeta>/python`, si no está ya. Devuelve su ejecutable. Se descomprime
 * aparte y se mueve entero: uno a medias no se confunde con uno listo.
 */
async function pythonStandalone(carpeta: string, app: string): Promise<string> {
  const python = join(carpeta, 'python', EXE_PY)
  if (existsSync(python)) return python
  const tar = join(tmpdir(), `sloth-python-${Date.now()}.tar.gz`)
  const aparte = `${carpeta}.bajando`
  try {
    await bajar(PYTHON_STANDALONE, tar)
    rmSync(aparte, { recursive: true, force: true, ...REINTENTOS })
    mkdirSync(aparte, { recursive: true })
    await ejecutar(WINDOWS ? join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar', ['-xzf', tar, '-C', aparte], app)
    await moverPython(join(aparte, 'python'), join(carpeta, 'python'))
  } finally {
    rmSync(tar, { force: true })
    // Si el antivirus aún la tiene abierta, se queda: la borra el próximo intento.
    try {
      rmSync(aparte, { recursive: true, force: true, ...REINTENTOS })
    } catch {}
  }
  return python
}

/**
 * El Python con que corren los scripts de las skills (`python` en el PATH): uno propio en `BAJADAS`, el mismo de
 * python-build-standalone. Fuera de Windows, con `python`, `python3` y `pip` en `BAJADAS_BIN`; en Windows, scripts/start.mjs
 * ya pone su carpeta en el PATH.
 */
async function instalarPython(app: string) {
  const python = await pythonStandalone(join(BAJADAS, 'python'), app)
  if (!WINDOWS) {
    mkdirSync(BAJADAS_BIN, { recursive: true })
    for (const [nombre, destino] of [['python', python], ['python3', python], ['pip', join(dirname(python), 'pip3')]]) {
      rmSync(join(BAJADAS_BIN, nombre), { force: true })
      symlinkSync(destino, join(BAJADAS_BIN, nombre))
    }
  }
  return ejecutar(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'pip'], app)
}

/**
 * FFmpeg y FFprobe ya compilados, de la 9.0, en `BAJADAS_BIN`: en Mac, los de Martin Riedl (para Apple Silicon o Intel);
 * en Windows y Linux, los de BtbN, estáticos. En Windows antes iban con winget, pero el que trae un Windows sin
 * actualizar (la 1.3) no conoce sus opciones y solo enseñaba su ayuda, y hay Windows sin winget.
 */
async function instalarFfmpeg(app: string) {
  const aparte = join(tmpdir(), `sloth-ffmpeg-${Date.now()}`)
  mkdirSync(aparte, { recursive: true })
  mkdirSync(BAJADAS_BIN, { recursive: true })
  const exe = WINDOWS ? '.exe' : ''
  try {
    if (WINDOWS) {
      const zip = join(aparte, 'ffmpeg.zip')
      await bajar(`https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win${ARQUITECTURA === 'arm64' ? 'arm64' : '64'}-gpl-9.0.zip`, zip)
      // El `tar` de Windows abre zips; el de Git, si va antes en el PATH, no.
      const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      await ejecutar(tar, ['-xf', zip, '-C', aparte, '--strip-components=2', '*/bin/ffmpeg.exe', '*/bin/ffprobe.exe'], app)
    } else if (process.platform === 'darwin') {
      for (const f of ['ffmpeg', 'ffprobe']) {
        const zip = join(aparte, `${f}.zip`)
        await bajar(`https://ffmpeg.martin-riedl.de/redirect/latest/macos/${ARQUITECTURA === 'arm64' ? 'arm64' : 'amd64'}/release/${f}.zip`, zip)
        await ejecutar('unzip', ['-o', zip, '-d', aparte], app)
      }
    } else {
      const tar = join(aparte, 'ffmpeg.tar.xz')
      await bajar(`https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-linux${ARQUITECTURA === 'arm64' ? 'arm64' : '64'}-gpl-9.0.tar.xz`, tar)
      await ejecutar('tar', ['-xJf', tar, '-C', aparte, '--strip-components=2', '--wildcards', '*/bin/ffmpeg', '*/bin/ffprobe'], app)
    }
    for (const f of ['ffmpeg', 'ffprobe']) {
      await copyFile(join(aparte, f + exe), join(BAJADAS_BIN, f + exe))
      if (!WINDOWS) chmodSync(join(BAJADAS_BIN, f), 0o755)
    }
  } finally {
    rmSync(aparte, { recursive: true, force: true, ...REINTENTOS })
  }
  return 'listo'
}

/** Para borrar lo que el antivirus de Windows tiene abierto un momento. */
const REINTENTOS = { maxRetries: 10, retryDelay: 500 }

/**
 * Lleva el Python recién descomprimido a su sitio. En Windows, el antivirus revisa lo recién escrito y lo deja abierto
 * unos segundos, y mover la carpeta sale con EPERM: se reintenta casi un minuto y, si sigue, se copia, con `python.exe` al
 * final (sin él, uno a medias no cuenta). Lo que hubiera en el destino ya no tenía `python.exe`: se quita.
 */
export async function moverPython(de: string, a: string, espera = 500) {
  rmSync(a, { recursive: true, force: true, ...REINTENTOS })
  mkdirSync(dirname(a), { recursive: true })
  for (let i = 0; i < 20; i++) {
    try {
      return renameSync(de, a)
    } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e
      await new Promise((r) => setTimeout(r, espera * Math.min(i + 1, 6)))
    }
  }
  const exe = join(de, EXE_PY)
  await cp(de, a, { recursive: true, filter: (x) => x !== exe })
  await copyFile(exe, join(a, EXE_PY))
}

async function bajar(url: string, destino: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) })
  if (!res.ok || !res.body) throw new Error(`No se pudo bajar ${url} (${res.status})`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destino))
}

/** Como `correr`, sin shell: las rutas con espacios (el nombre del usuario) van tal cual. `alLeer` recibe cada línea. */
function ejecutar(exe: string, args: string[], cwd: string, alLeer?: (linea: string) => void): Promise<string> {
  return new Promise((ok, falla) => {
    const proc = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let salida = ''
    let resto = ''
    const leer = (d: Buffer) => {
      salida += d
      if (!alLeer) return
      const lineas = (resto + d).split(/\r?\n/)
      resto = lineas.pop()!
      lineas.forEach(alLeer)
    }
    proc.stdout.on('data', leer)
    proc.stderr.on('data', leer)
    proc.on('error', falla)
    proc.on('exit', (code) => (code === 0 ? ok(salida.trim()) : falla(new Error(salida.trim().slice(-600) || `${exe} salió con código ${code}`))))
  })
}

/** En orden: los paquetes van después de Python. */
const PIEZAS: Pieza[] = [
  {
    id: 'ffmpeg',
    nombre: 'FFmpeg',
    para: 'Arma, mide y comprime los videos. Lo usan todos los estilos.',
    mirar: version('ffmpeg -version', /ffmpeg version n?(\d+(?:\.\d+)+)/),
    instalar: instalarFfmpeg
  },
  {
    id: 'python',
    nombre: 'Python',
    para: 'Corre los scripts de los estilos de video.',
    // Sin Python, `python` es el atajo de la Microsoft Store, que sale con 9009. Fuera de Windows cuenta solo el propio.
    mirar: async (app) => (WINDOWS || existsSync(join(BAJADAS_BIN, 'python')) ? version('python --version', /Python (3\.\S+)/)(app) : null),
    instalar: instalarPython
  },
  paquetes(Object.keys(PAQUETES)),
  {
    id: 'python-sloth',
    nombre: 'Python de Sloth',
    para: 'El transcriptor y yt-dlp, con sus modelos: bajar y transcribir el video del tema y tu voz (con una tarjeta NVIDIA, Whisper; sin ella, Parakeet, rápido en el procesador). Se baja una vez y ocupa unos 6 GB (unos 10 con NVIDIA).',
    mirar: async (app) => ((await faltaAlPythonSloth(app))?.length === 0 ? '' : null),
    falta: async (app) => {
      if (!rutaPythonSloth()) return undefined
      const faltan = await faltaAlPythonSloth(app)
      return faltan ? `Faltan ${faltan.join(', ')}` : 'No se pudo mirar qué tiene'
    },
    instalar: (app) => instalarPythonSloth(app)
  },
  {
    id: 'chatgpt',
    nombre: 'ChatGPT (Codex)',
    para: 'Opcional. Hace las portadas y las imágenes de los videos; sin él, salen sin imágenes generadas.',
    aMano: 'Conecta tu cuenta de ChatGPT en Opciones → Agentes → Codex, o usa una llave de API.',
    opcional: true,
    // `codex` lo pone en el PATH scripts/start.mjs (o `npm start`). Sale con 0 si hay sesión. Con la llave de API
    // (`server/acceso.ts`), `codex exec` la lee de CODEX_API_KEY.
    mirar: (app) => (llaveEnUso('codex') ? Promise.resolve('con llave de API') : correr('codex login status', app).then(() => 'conectado', () => null))
  }
]

/** Lo que dice pip cuando un paquete no tiene rueda para este Python. */
export const sinRueda = (error: string) => /No matching distribution found|Could not find a version|ResolutionImpossible/i.test(error)

/**
 * Lo que pip no compila. Fuera de Windows, numba y llvmlite (de rembg, por pymatting): desde la 0.63 y la 0.46 no salen
 * para Mac con Intel, y compilar llvmlite pide LLVM. En Windows, nada: el Python puede ser el tuyo, y en uno recién salido
 * (3.15) pip compilaba scikit-image, también de rembg, y fallaba con un error que nadie entiende. Con esto se queda con la
 * última versión que trae rueda o, si ninguna la trae para tu Python, `paquetes` sigue con el de Sloth.
 */
const SOLO_RUEDAS = WINDOWS ? ':all:' : 'numba,llvmlite'

/** Los paquetes de `modulos` en una sola fila, que los baja todos con pip. */
function paquetes(modulos: string[]): Pieza {
  const y = (xs: string[]) => [...new Set(xs)].join(', ').replace(/, ([^,]*)$/, ' y $1')
  return {
    id: 'paquetes',
    nombre: 'Paquetes de Python',
    para: `${y(modulos.map((m) => PAQUETES[m].nombre))}: ${y(modulos.map((m) => PAQUETES[m].uso))}.`,
    mirar: async (app) => ((await modulosQueFaltan(app, modulos))?.length === 0 ? '' : null),
    falta: async (app) => {
      const faltan = await modulosQueFaltan(app, modulos)
      return faltan ? `Faltan ${faltan.map((m) => PAQUETES[m].pip).join(', ')}` : 'Antes hace falta Python'
    },
    instalar: async (app) => {
      const pip = async () => {
        const faltan = (await modulosQueFaltan(app, modulos)) ?? modulos
        return correr(`python -m pip install --disable-pip-version-check --only-binary=${SOLO_RUEDAS} ${faltan.map((m) => `"${PAQUETES[m].pip}"`).join(' ')}`, app)
      }
      try {
        return await pip()
      } catch (e) {
        if (!WINDOWS || existsSync(PYTHON_BAJADO) || !sinRueda(String(e))) throw e
        paso = 'Bajando Python'
        await instalarPython(app)
        paso = 'Instalando los paquetes'
        return pip()
      }
    }
  }
}

/**
 * Lo que pide una skill: todo, menos los paquetes que no importa. Sin skill (Opciones), todo, con los paquetes de las
 * skills que trae la app (la que se vende no trae todas).
 */
function piezas(app: string, skill?: string): Pieza[] {
  const modulos = Object.keys(PAQUETES)
    .filter((m) => !(WINDOWS && PAQUETES[m].fueraDeWindows))
    .filter((m) => (skill ? PAQUETES[m].skills.includes(skill) : PAQUETES[m].skills.some((s) => existsSync(join(app, 'skills', s)))))
  return PIEZAS.flatMap((p) => (p.id !== 'paquetes' ? [p] : modulos.length ? [paquetes(modulos)] : []))
}

/** La que se está instalando y las que esperan su turno. */
let instalando: Pieza | null = null
let cola: Pieza[] = []
/** Si se está instalando algo: reiniciar el servidor cortaría una descarga o pip a la mitad. */
export const instalandoAlgo = () => (instalando ? `Se está instalando ${instalando.nombre}. Espera a que termine.` : ytDlp ? 'Se está poniendo al día yt-dlp. Espera a que termine.' : null)
const fallos: Record<string, string> = {}
/**
 * Por skill, la última vez que no había nada que bajar. Mirarlo son cinco procesos (ffmpeg, python…), y se miraba en
 * cada hilo nuevo: mientras siga así no se vuelve a mirar. Instalar y abrir Opciones (`fresco`) miran de nuevo.
 */
const listos = new Map<string, Requisito[]>()

export async function requisitos(app: string, fresco = false, skill?: string): Promise<Requisito[]> {
  const ya = listos.get(skill ?? '')
  if (ya && !fresco) return ya
  const lista = await mirar(app, piezas(app, skill))
  // Lo que no se puede bajar desde aquí (el Python de Sloth) no se arregla volviendo a mirar.
  if (lista.every((r) => (r.listo || !r.instalable) && !r.estado && !r.error)) listos.set(skill ?? '', lista)
  else listos.delete(skill ?? '')
  return lista
}

function mirar(app: string, de: Pieza[]): Promise<Requisito[]> {
  return Promise.all(
    de.map(async (p): Promise<Requisito> => {
      const hallado = await p.mirar(app)
      return {
        id: p.id,
        nombre: p.nombre,
        para: p.para,
        listo: hallado !== null,
        // Mientras se instala, en qué va; si no, lo que se encontró o lo que falta.
        detalle: instalando?.id === p.id ? paso : hallado !== null ? hallado || undefined : await p.falta?.(app),
        instalable: !!p.instalar,
        aMano: p.aMano,
        opcional: p.opcional,
        estado: instalando?.id === p.id ? 'instalando' : cola.some((c) => c.id === p.id) ? 'esperando' : undefined,
        error: fallos[p.id]
      }
    })
  )
}

/** Pone en la cola las que faltan de `ids` (o todas) de lo que pide `skill`, y responde sin esperar. */
export async function instalar(app: string, ids?: string[], skill?: string) {
  const estado = await requisitos(app, true, skill)
  const nuevas = piezas(app, skill).filter((p) => {
    const r = estado.find((r) => r.id === p.id)!
    return p.instalar && !r.listo && !r.estado && (!ids || ids.includes(p.id))
  })
  for (const p of nuevas) delete fallos[p.id]
  cola.push(...nuevas)
  if (!instalando) void siguiente(app)
  return requisitos(app, false, skill)
}

/**
 * Instala la mejora del Python de Sloth (Parakeet, `mejoraDelPythonSloth`) aunque ya cuente como listo: es su misma
 * instalación, que se salta lo que ya está. La pide el aviso del hilo nuevo y Opciones → Tu equipo.
 */
export function instalarMejora(app: string) {
  if (instalando?.id === MEJORA.id || cola.some((c) => c.id === MEJORA.id)) return
  delete fallos[MEJORA.id]
  cola.push(MEJORA)
  if (!instalando) void siguiente(app)
}

/** La mejora va en la cola como una pieza más (pip no puede correr dos veces en el mismo Python), con su id y sus fallos. */
const MEJORA: Pieza = {
  id: 'mejora',
  nombre: 'Parakeet',
  para: 'Transcribe tu voz unas cinco veces más rápido en una computadora sin NVIDIA.',
  mirar: async (app) => ((await mejoraDelPythonSloth(app))?.length === 0 ? '' : null),
  instalar: (app) => instalarPythonSloth(app)
}

/** Cómo va la instalación de una pieza: si se instala o espera, en qué paso va y por qué falló la última vez. */
export const instalacionDe = (id: string) => ({
  estado: instalando?.id === id ? ('instalando' as const) : cola.some((c) => c.id === id) ? ('esperando' as const) : undefined,
  paso: instalando?.id === id ? paso : undefined,
  error: fallos[id]
})

async function siguiente(app: string) {
  const pieza = cola[0]
  if (!pieza) return void (instalando = null)
  cola = cola.slice(1)
  instalando = pieza
  try {
    await pieza.instalar!(app)
  } catch (e) {
    fallos[pieza.id] = e instanceof Error ? e.message : String(e)
  }
  paso = undefined
  refrescarPath()
  // Lo que cuenta es si ahora se encuentra: un instalador puede salir con error si ya estaba (fuera del PATH de este proceso).
  if ((await pieza.mirar(app)) !== null) delete fallos[pieza.id]
  else fallos[pieza.id] ??= 'Se instaló, pero no aparece. Cierra Sloth y vuelve a abrirlo.'
  await siguiente(app)
}

/**
 * Lo recién instalado entra en el PATH del usuario, no en el de este proceso, que se leyó al arrancar. Se vuelve a leer
 * para encontrarlo sin reiniciar Sloth, y así lo heredan también los agentes que se lancen desde ahora.
 */
function refrescarPath() {
  // Fuera de Windows, todo va a `BAJADAS_BIN`, que ya estaba en el PATH.
  if (!WINDOWS) return
  const leer = (de: string) =>
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('Path', '${de}')`], { encoding: 'utf8' }).trim()
  try {
    // Lo de este proceso va primero: el Python de Sloth debe seguir delante del que haya en el sistema.
    const nuevo = [process.env.PATH ?? '', leer('Machine'), leer('User')].join(';').split(';').filter(Boolean)
    process.env.PATH = [...new Set(nuevo)].join(';')
  } catch {
    // Sin PowerShell se queda como estaba: se verá al reiniciar.
  }
}
