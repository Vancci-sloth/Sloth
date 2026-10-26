import { execFile, execFileSync, spawn } from 'node:child_process'
import { chmodSync, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { copyFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Requisito } from '../shared/types.ts'
import { correr } from './version.ts'

/**
 * Lo que las skills necesitan fuera de Sloth: FFmpeg, Python y sus paquetes, el Python de Sloth y, opcional, la cuenta de
 * ChatGPT. Quien abre la app por primera vez ve encima del compositor lo que le falta al estilo elegido (de los paquetes,
 * solo los que importa su skill), y «Descargar todo» lo instala uno tras otro con winget y pip, sin permisos de
 * administrador (todo va a su usuario). ChatGPT no se instala: se conecta en Opciones.
 *
 * En Mac y Linux no hay winget: FFmpeg y Python se bajan, ya armados, a `BAJADAS` (que scripts/start.mjs pone primero en
 * el PATH). El Python es siempre el de Sloth: el del sistema falta (Mac) o no deja instalar paquetes con pip (Ubuntu).
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

const WINGET = '--exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity'

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
const MODELOS = join(process.env.APPDATA ?? '', 'youtube', 'modelos')
const BANDERAS = ['-E', '-s', '-B', '-X', 'utf8']
/** Fuera de Windows: lo que Sloth baja para las skills (Python, FFmpeg). `bin` va primero en el PATH (scripts/start.mjs). */
const BAJADAS = join(process.env.APPDATA ?? '', 'sloth', 'piezas')
const BAJADAS_BIN = join(BAJADAS, 'bin')

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

/** Lo que tiene que poder importar el Python de Sloth. Sin uno, su instalación se cortó a medias. */
const MODULOS_SLOTH = ['torch', 'whisperx', 'yt_dlp', 'transformers']

/**
 * Lo que le falta al Python de Sloth: módulos (`MODULOS_SLOTH`) y modelos de la transcripción en `MODELOS` (Whisper, que
 * usan todos, y `voxpopuli-es`, el alineador de la voz). Los modelos los mira `installed()` de
 * `python/procesos/modelos_transcripcion.py`, que sabe sus tamaños. `null` si no hay Python de Sloth o no se pudo mirar.
 */
function faltaAlPythonSloth(app: string): Promise<string[] | null> {
  const python = rutaPythonSloth()
  if (!python) return Promise.resolve(null)
  const codigo =
    `import sys,pathlib,importlib.util as u,modelos_transcripcion as m;` +
    `print(','.join([x for x in sys.argv[2].split(',') if not u.find_spec(x)]+[x.name for x in m.needed('voxpopuli-es') if not x.installed(pathlib.Path(sys.argv[1]))]))`
  return new Promise((ok) =>
    execFile(python, [...BANDERAS, '-c', codigo, MODELOS, MODULOS_SLOTH.join(',')], { cwd: join(app, 'python', 'procesos') }, (error, salida) =>
      ok(error ? null : salida.trim().split(',').filter(Boolean))
    )
  )
}

/**
 * El Python de Sloth en una computadora nueva: un Python propio (python-build-standalone, sin tocar el del sistema) en
 * `PYTHONES`, con las versiones con que se hizo todo (3.12, torch 2.8, WhisperX 3.8.6), y sus modelos en `MODELOS`. Con
 * una NVIDIA, torch con CUDA; sin ella, el de CPU, y los procesos transcriben solos en el procesador (`int8`). Si se
 * corta, volver a pulsar sigue donde se quedó: pip y los modelos se saltan lo que ya está.
 */
const SISTEMA: Record<string, string> = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu'
}
const PYTHON_STANDALONE = `https://github.com/astral-sh/python-build-standalone/releases/download/20261013/cpython-3.12.15%2B20261013-${SISTEMA[`${process.platform}-${process.arch}`] ?? SISTEMA['win32-x64']}-install_only.tar.gz`
const TORCH = ['torch==2.8.0', 'torchaudio==2.8.0', 'torchvision==0.23.0']
// `hf_xet` baja los modelos de Hugging Face más rápido; `deno` resuelve los retos de JavaScript de YouTube en yt-dlp.
const PIP_SLOTH = ['whisperx==3.8.6', 'transformers==4.57.6', 'hf_xet', 'yt-dlp[default]', 'deno', 'scikit-learn']
/** Baja lo que falte de los modelos: Whisper, el alineador de la voz y el de vectores (huellas.py). */
const BAJAR_MODELOS = [
  'import sys,pathlib,modelos_transcripcion as m',
  'from vectores import E5',
  'd=pathlib.Path(sys.argv[1])',
  "for x in [*m.needed('voxpopuli-es'),E5]:",
  "  if not x.installed(d): print('Bajando',x.name,flush=True); x.download(d)"
].join('\n')

/**
 * Si la NVIDIA aguanta el torch de CUDA 12.8 (`nvidia-smi --query-gpu=compute_cap,driver_version`, una línea por
 * tarjeta): cómputo 7.0 o más (de 2017 en adelante) y un controlador 528.33 o más nuevo. Con una más vieja, torch no la
 * usa y serían ~5 GB de más para nada: va el de CPU. Las cifras son las de la app de YouTube archivada.
 */
export function aguantaCuda(salida: string): boolean {
  return salida.split(/\r?\n/).some((linea) => {
    const [computo = '', controlador = ''] = linea.split(',').map((x) => x.trim())
    const [mayor = 0, menor = 0] = controlador.split('.').map(Number)
    return Number(computo) >= 7 && (mayor > 528 || (mayor === 528 && menor >= 33))
  })
}

export async function instalarPythonSloth(app: string, { raiz = PYTHONES, modelos = MODELOS, cuda }: { raiz?: string; modelos?: string; cuda?: boolean } = {}) {
  cuda ??= await correr('nvidia-smi --query-gpu=compute_cap,driver_version --format=csv,noheader,nounits', app).then(aguantaCuda, () => false)
  const carpeta = join(raiz, `3.12.15-${cuda ? 'cu128' : 'cpu'}-sloth`)
  paso = 'Bajando Python'
  const python = await pythonStandalone(carpeta, app)
  paso = 'Preparando los paquetes'
  const pip = (...args: string[]) =>
    ejecutar(python, ['-E', '-s', '-X', 'utf8', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location', ...args], app, verPaso)
  // En Windows y Mac, el torch de PyPI es el de CPU (en Mac, con la GPU de Apple); en Linux, el de CUDA, que pesa gigas
  // de más sin una NVIDIA: ahí va antes el de CPU.
  const indice = cuda ? 'cu128' : process.platform === 'linux' ? 'cpu' : null
  if (indice) await pip(...TORCH, '--index-url', `https://download.pytorch.org/whl/${indice}`)
  await pip(...TORCH, ...PIP_SLOTH)
  mkdirSync(modelos, { recursive: true })
  return ejecutar(python, [...BANDERAS, '-c', BAJAR_MODELOS, modelos], join(app, 'python', 'procesos'), verPaso)
}

/**
 * Lo que va haciendo la instalación en curso, en su fila en vez de «Descargando…»: el Python de Sloth baja gigas durante
 * muchos minutos y, sin decir qué, parece atascado.
 */
let paso: string | undefined
const verPaso = (linea: string) => void (paso = pasoDePip(linea) ?? paso)

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
 * Fuera de Windows, el Python con que corren los scripts de las skills (`python` en el PATH): uno propio en `BAJADAS`, el
 * mismo de python-build-standalone, con `python`, `python3` y `pip` en `BAJADAS_BIN`.
 */
async function instalarPython(app: string) {
  const python = await pythonStandalone(join(BAJADAS, 'python'), app)
  mkdirSync(BAJADAS_BIN, { recursive: true })
  for (const [nombre, destino] of [['python', python], ['python3', python], ['pip', join(dirname(python), 'pip3')]]) {
    rmSync(join(BAJADAS_BIN, nombre), { force: true })
    symlinkSync(destino, join(BAJADAS_BIN, nombre))
  }
  return ejecutar(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'pip'], app)
}

/**
 * Fuera de Windows, FFmpeg y FFprobe ya compilados, en `BAJADAS_BIN`: en Mac, los de Martin Riedl (para Apple Silicon o
 * Intel); en Linux, los de BtbN, estáticos. Los dos de la 9.0, como el de Windows (Gyan).
 */
async function instalarFfmpeg(app: string) {
  const aparte = join(tmpdir(), `sloth-ffmpeg-${Date.now()}`)
  mkdirSync(aparte, { recursive: true })
  mkdirSync(BAJADAS_BIN, { recursive: true })
  try {
    if (process.platform === 'darwin') {
      for (const f of ['ffmpeg', 'ffprobe']) {
        const zip = join(aparte, `${f}.zip`)
        await bajar(`https://ffmpeg.martin-riedl.de/redirect/latest/macos/${process.arch === 'arm64' ? 'arm64' : 'amd64'}/release/${f}.zip`, zip)
        await ejecutar('unzip', ['-o', zip, '-d', aparte], app)
      }
    } else {
      const tar = join(aparte, 'ffmpeg.tar.xz')
      await bajar(`https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-linux${process.arch === 'arm64' ? 'arm64' : '64'}-gpl-9.0.tar.xz`, tar)
      await ejecutar('tar', ['-xJf', tar, '-C', aparte, '--strip-components=2', '--wildcards', '*/bin/ffmpeg', '*/bin/ffprobe'], app)
    }
    for (const f of ['ffmpeg', 'ffprobe']) {
      await copyFile(join(aparte, f), join(BAJADAS_BIN, f))
      chmodSync(join(BAJADAS_BIN, f), 0o755)
    }
  } finally {
    rmSync(aparte, { recursive: true, force: true })
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

/**
 * En Windows, un Python que ya estaba pero no en el PATH (se instaló sin «Add python.exe to PATH»): `python` es entonces
 * el atajo de la Microsoft Store, y winget no pone otro 3.13 encima (sale con 1638, «ya hay otra versión»). Se busca donde
 * lo registra su instalador y en sus carpetas de siempre, y el más nuevo (3.10 o más) entra en el PATH de este proceso y
 * en el del usuario, como lo habría puesto su instalador. Devuelve su versión, o null.
 */
export async function pythonFueraDelPath(): Promise<string | null> {
  const carpetas = new Set(registroPython())
  const raices = [join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python'), process.env.ProgramFiles ?? 'C:\\Program Files', 'C:\\']
  for (const raiz of raices) {
    try {
      for (const d of readdirSync(raiz)) if (/^Python3\d+$/i.test(d)) carpetas.add(join(raiz, d))
    } catch {}
  }
  let mejor: { carpeta: string; version: string; orden: number[] } | null = null
  for (const carpeta of carpetas) {
    const exe = join(carpeta, 'python.exe')
    if (!existsSync(exe)) continue
    const v = await new Promise<string | undefined>((ok) => execFile(exe, ['--version'], { windowsHide: true }, (e, s) => ok(e ? undefined : /Python (3\.\S+)/.exec(s)?.[1])))
    const orden = v?.split('.').map((n) => parseInt(n)) ?? []
    if (!v || orden[1] < 10) continue
    if (!mejor || orden[1] > mejor.orden[1] || (orden[1] === mejor.orden[1] && orden[2] > mejor.orden[2])) mejor = { carpeta, version: v, orden }
  }
  if (!mejor) return null
  const nuevas = [mejor.carpeta, join(mejor.carpeta, 'Scripts')]
  process.env.PATH = [...nuevas, process.env.PATH].join(';')
  try {
    const usuario = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('Path', 'User')"], { encoding: 'utf8', windowsHide: true }).trim()
    const sinBarra = (c: string) => c.toLowerCase().replace(/\\$/, '')
    const faltan = nuevas.filter((n) => !usuario.split(';').map(sinBarra).includes(sinBarra(n)))
    if (faltan.length) {
      const script = "[Environment]::SetEnvironmentVariable('Path', $env:SLOTH_PATH, 'User')"
      execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, env: { ...process.env, SLOTH_PATH: [...faltan, usuario].filter(Boolean).join(';') } })
    }
  } catch {
    // Sin PowerShell, vale para esta vez: al volver a abrir Sloth se busca de nuevo.
  }
  return mejor.version
}

/** Las carpetas donde los instaladores de Python dicen que lo pusieron (`HK*\Software\Python\PythonCore\*\InstallPath`). */
function registroPython(): string[] {
  const carpetas: string[] = []
  for (const clave of ['HKCU\\Software\\Python\\PythonCore', 'HKLM\\Software\\Python\\PythonCore', 'HKLM\\Software\\WOW6432Node\\Python\\PythonCore']) {
    let salida = ''
    try {
      salida = execFileSync('reg.exe', ['query', clave, '/s', '/ve'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    } catch {
      continue
    }
    let enInstallPath = false
    for (const linea of salida.split(/\r?\n/)) {
      if (/^HKEY_/.test(linea)) enInstallPath = /\\InstallPath$/i.test(linea.trim())
      else if (enInstallPath) {
        const valor = /REG_SZ\s+(.+)$/.exec(linea)?.[1].trim()
        if (valor) carpetas.push(valor.replace(/\\$/, ''))
      }
    }
  }
  return carpetas
}

/** En orden: los paquetes van después de Python. */
const PIEZAS: Pieza[] = [
  {
    id: 'ffmpeg',
    nombre: 'FFmpeg',
    para: 'Arma, mide y comprime los videos. Lo usan todos los estilos.',
    mirar: version('ffmpeg -version', /ffmpeg version n?(\d+(?:\.\d+)+)/),
    instalar: (app) => (WINDOWS ? correr(`winget install --id Gyan.FFmpeg ${WINGET}`, app) : instalarFfmpeg(app))
  },
  {
    id: 'python',
    nombre: 'Python',
    para: 'Corre los scripts de los estilos de video.',
    // Sin Python, `python` es el atajo de la Microsoft Store, que sale con 9009. Fuera de Windows cuenta solo el propio.
    mirar: async (app) =>
      WINDOWS
        ? ((await version('python --version', /Python (3\.\S+)/)(app)) ?? pythonFueraDelPath())
        : existsSync(join(BAJADAS_BIN, 'python'))
          ? version('python --version', /Python (3\.\S+)/)(app)
          : null,
    instalar: (app) =>
      WINDOWS
        ? correr(`winget install --id Python.Python.3.13 --scope user ${WINGET} --override "/quiet InstallAllUsers=0 PrependPath=1 Include_launcher=0"`, app)
        : instalarPython(app)
  },
  paquetes(Object.keys(PAQUETES)),
  {
    id: 'python-sloth',
    nombre: 'Python de Sloth',
    para: 'WhisperX y yt-dlp, con sus modelos: bajar y transcribir el video del tema y tu voz. Se baja una vez y ocupa unos 5 GB (unos 10 con una tarjeta NVIDIA).',
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
    aMano: 'Conecta tu cuenta de ChatGPT en Opciones → Agentes → Codex.',
    opcional: true,
    // `codex` lo pone en el PATH scripts/start.mjs (o `npm start`). Sale con 0 si hay sesión.
    mirar: (app) => correr('codex login status', app).then(() => 'conectado', () => null)
  }
]

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
      const faltan = (await modulosQueFaltan(app, modulos)) ?? modulos
      return correr(`python -m pip install --disable-pip-version-check ${faltan.map((m) => `"${PAQUETES[m].pip}"`).join(' ')}`, app)
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
/** Si se está instalando algo: reiniciar el servidor mataría a winget o pip a la mitad. */
export const instalandoAlgo = () => (instalando ? `Se está instalando ${instalando.nombre}. Espera a que termine.` : null)
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
  // winget sale con error si ya estaba (fuera del PATH de este proceso): lo que cuenta es si ahora se encuentra.
  if ((await pieza.mirar(app)) !== null) delete fallos[pieza.id]
  else fallos[pieza.id] ??= 'Se instaló, pero no aparece. Cierra Sloth y vuelve a abrirlo.'
  await siguiente(app)
}

/**
 * Lo recién instalado entra en el PATH del usuario, no en el de este proceso, que se leyó al arrancar. Se vuelve a leer
 * para encontrarlo sin reiniciar Sloth, y así lo heredan también los agentes que se lancen desde ahora.
 */
function refrescarPath() {
  // Fuera de Windows, lo que se instala va a `BAJADAS_BIN`, que ya estaba en el PATH.
  if (!WINDOWS) return
  const leer = (de: string) =>
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('Path', '${de}')`], { encoding: 'utf8' }).trim()
  try {
    const nuevo = [leer('Machine'), leer('User'), process.env.PATH ?? ''].join(';').split(';').filter(Boolean)
    process.env.PATH = [...new Set(nuevo)].join(';')
  } catch {
    // Sin PowerShell se queda como estaba: se verá al reiniciar.
  }
}
