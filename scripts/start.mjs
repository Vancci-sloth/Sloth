// Levanta el servidor y abre VyMotion en su ventana (electron/main.ts). Si el servidor sale con 75 (botón «Reiniciar
// backend»), lo vuelve a levantar: así la app aplica los cambios de su código.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.PORT ?? '4848'
const URL = `http://localhost:${PORT}`
let opened = process.argv.includes('--no-open')
// Compilar Electron mientras arranca el servidor evita hacerlo después de anunciar la dirección.
const ventanaPreparada = opened ? Promise.resolve() : import('./electron.mjs').then((m) => m.prepararVentana()).then(() => null, (error) => error)
// La app compilada (`scripts/compilar.mjs`) trae el servidor ya armado; el repo lo corre con tsx.
const SERVIDOR = existsSync(join(APP, 'server', 'index.mjs')) ? ['server/index.mjs'] : ['--import', 'tsx', 'server/index.ts']
// Lo que corren los agentes (`node`, `npm`, `codex`) sale de este Node y de los paquetes de Sloth, aunque la computadora
// no tenga otros.
const camino = [dirname(process.execPath), join(APP, 'node_modules', '.bin')]
/**
 * Fuera de Windows, lo que allí es %APPDATA% (el Python de Sloth y sus modelos, la llave de publicar) es
 * ~/Library/Application Support en Mac y ~/.config en Linux. Va en APPDATA para que el servidor, los agentes y los
 * scripts de las skills lo busquen igual en los tres. Ahí deja Sloth el Python y el FFmpeg que instala, en
 * sloth/piezas/bin (server/requisitos.ts), y las llaves de Opciones, en sloth/variables.json (server/opciones.ts). Una
 * app abierta desde el Finder no hereda el PATH de la terminal: sin Homebrew, no vería lo que se instaló con él.
 */
if (process.platform !== 'win32') {
  const mac = process.platform === 'darwin'
  process.env.APPDATA ??= mac ? join(homedir(), 'Library', 'Application Support') : process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  camino.push(join(process.env.APPDATA, 'sloth', 'piezas', 'bin'), ...(mac ? ['/opt/homebrew/bin', '/usr/local/bin'] : []))
  try {
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(process.env.APPDATA, 'sloth', 'variables.json'), 'utf8')))) process.env[k] ??= v
  } catch {
    // Aún no se guardó ninguna.
  }
}
// En Windows, el Python solo existe si el tuyo no servía (server/requisitos.ts): entonces va delante del que haya en el
// sistema. En `bin`, el FFmpeg que baja Sloth.
else {
  const piezas = join(process.env.APPDATA ?? '', 'sloth', 'piezas')
  camino.push(join(piezas, 'python', 'python'), join(piezas, 'python', 'python', 'Scripts'), join(piezas, 'bin'))
}
process.env.PATH = [...camino, process.env.PATH].join(delimiter)

/**
 * La ventana de Sloth, la misma que la app que se vende. Sin Electron (falta `npm install`), Edge en modo app: una
 * ventana sin barra de direcciones; en Mac y Linux, el navegador de siempre. La app compilada pone su ventana ella misma
 * (`--no-open`).
 */
async function abrir() {
  opened = true
  console.log('Abriendo la ventana de VyMotion…')
  try {
    const errorPreparando = await ventanaPreparada
    if (errorPreparando) throw errorPreparando
    const { abrirVentana } = await import('./electron.mjs')
    if (await abrirVentana(URL)) return
  } catch (error) {
    console.error(`No se pudo abrir la ventana de VyMotion; va en el navegador. ${error instanceof Error ? error.message : error}`)
  }
  const [cmd, ...args] = process.platform === 'win32' ? ['cmd', '/c', 'start', '', 'msedge', `--app=${URL}`] : [process.platform === 'darwin' ? 'open' : 'xdg-open', URL]
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref()
}

function run() {
  const child = spawn(process.execPath, SERVIDOR, { cwd: APP, stdio: ['inherit', 'pipe', 'inherit'] })
  child.on('error', (error) => {
    console.error(`No se pudo arrancar VyMotion: ${error.message}`)
    process.exitCode = 1
  })
  child.stdout.pipe(process.stdout, { end: false })
  const salida = createInterface({ input: child.stdout })
  salida.on('line', (linea) => {
    if (!opened && linea.endsWith(` en ${URL}`)) void abrir()
  })
  child.on('exit', (code, signal) => {
    if (code === 75) return run()
    // Una caída también lo vuelve a levantar: la ventana se reconecta sola y los hilos siguen donde iban. Si cae más de
    // tres veces en un minuto, algo lo tumba al arrancar y se para, para que se vea el error.
    const ahora = Date.now()
    caidas = caidas.filter((t) => ahora - t < 60_000)
    if (code && !signal && caidas.push(ahora) <= 3) {
      console.error(`\nEl servidor se cayó (código ${code}). Lo vuelvo a levantar…\n`)
      return run()
    }
    process.exit(code ?? 0)
  })
}

let caidas = []

// Si Sloth ya corre (se abrió otra vez), solo abre su ventana: un segundo servidor no tendría puerto.
if (await fetch(`${URL}/api/state`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false)) {
  if (!opened) await abrir()
} else run()
