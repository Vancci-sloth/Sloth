// El banco de las capturas de El Diff: llamadas reales de las sesiones a pagina.mjs y tuit.py, con los scripts de este
// repo, una detrás de otra como las hace el agente. Mide los segundos y exige que cada una salga (con un reintento), con
// su tamaño, con una frase que se sabe que está en la página (OCR con una copia congelada de ubicar.py) y con esa misma
// frase en el texto que pagina.mjs guarda dentro del PNG. Solo imprime `segundos:` si todo pasa. Las páginas son de
// verdad: la red mete ruido.
//   node .autoloop/checks/capturas/banco.mjs
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SKILL = join(AQUI, '..', '..', '..', 'video-el-diff')
const TRABAJO = join(tmpdir(), 'banco-capturas')
const WEB = 'fuentes/material/web'
const TUITS = 'fuentes/material/tuits'

// [url, archivo, ancho, alto, escala, frase que tiene que estar]. Un post de x.com sale recortado al post (antes lo
// hacía recortar_tuit.py): su ancho y su alto son como mucho los de la ventana.
const CAPTURAS = [
  ['https://github.com/KittenML/KittenTTS', `${WEB}/gh-readme-angosto.png`, 400, 2600, 3, 'Open-source State-of-the-art TTS model'],
  ['https://github.com/ggml-org/llama.cpp/issues/91', `${WEB}/gh-issue-angosto.png`, 400, 1800, 3, 'Should use mmap for model loading'],
  ['https://github.com/pingdotgg/t3code/pull/2829', `${WEB}/gh-pr.png`, 1280, 900, 2, 'introduce new orchestrator'],
  ['https://x.com/elonmusk/status/2104366530938994817', `${TUITS}/x-musk.png`, 600, 1600, 2, 'Accurate (for now)'],
  ['https://x.com/elonmusk/status/2104366530938994817', `${TUITS}/x-musk-angosto.png`, 380, 1800, 3, 'Accurate (for now)'],
  ['https://x.com/thsottiaux/status/2104823812042940713', `${TUITS}/x-tibo-angosto.png`, 380, 3000, 3, 'we are re-opening the Pro'],
  ['https://arxiv.org/abs/1706.03762', `${WEB}/arxiv.png`, 1000, 1000, 2, 'Attention Is All You Need'],
  ['https://blog.google/technology/ai/google-gemini-ai/', `${WEB}/blog-google-largo.png`, 900, 5000, 2, 'our largest and most capable'],
  ['https://openai.com/index/introducing-gpt-6-sol-and-luna/', `${WEB}/openai.png`, 1000, 1800, 2, 'Introducing GPT-6 Sol and Luna'],
  ['https://huggingface.co/KittenML/kitten-tts-2', `${WEB}/hf-largo.png`, 1000, 7500, 2, 'speech language model'],
  ['https://effect.website/docs/concurrency/fibers/', `${WEB}/effect-angosto.png`, 400, 2400, 3, 'Fibers are lightweight virtual threads'],
  ['https://www.amny.com/news/ai-giants-nyc-council-whistleblower-warnings/', `${WEB}/amny-angosto-largo.png`, 400, 6000, 3, 'questioned under oath at City Hall']
]
// [url, nombre, frase del texto del post]
const POSTS = [
  ['https://x.com/elonmusk/status/2104366530938994817', 'x-musk', 'Accurate (for now)'],
  ['https://x.com/thsottiaux/status/2104823812042940713', 'x-tibo', 're-opening the Pro']
]

// Los Edge sin ventana que quedan sueltos (no toca el navegador del usuario: el suyo no va con --headless).
const limpiar = () => spawnSync('powershell', ['-NoProfile', '-Command',
  "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -match '--headless' } | " +
  'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'])

limpiar()
rmSync(TRABAJO, { recursive: true, force: true })
mkdirSync(join(TRABAJO, WEB), { recursive: true })
mkdirSync(join(TRABAJO, TUITS), { recursive: true })
cpSync(join(AQUI, 'guardia'), join(TRABAJO, '_guardia'), { recursive: true })

let total = 0
let fallos = 0
// Un reintento, con su tiempo sumado: la red de verdad a veces corta, pero lo que falla seguido sale caro.
function correr(nombre, programa, args) {
  const t0 = performance.now()
  let r
  let intentos = 0
  do {
    r = spawnSync(programa[0], [...programa.slice(1), ...args.map(String)], { cwd: TRABAJO, encoding: 'utf8', timeout: 3 * 60_000 })
    intentos++
  } while (r.status !== 0 && intentos < 2)
  const s = (performance.now() - t0) / 1000
  total += s
  const bien = r.status === 0
  if (!bien) fallos++
  const nota = bien ? (intentos > 1 ? ' · al segundo intento' : '') : ` · FALLÓ: ${(r.stderr || r.stdout || r.error?.message || '').trim().slice(-300)}`
  console.log(`${nombre} · ${s.toFixed(1)} s${nota}`)
  return bien
}

/** El tamaño del PNG (su cabecera) y el texto de la página que pagina.mjs guardó dentro (el bloque iTXt `sloth-pagina`). */
function leerPng(png) {
  const b = readFileSync(png)
  let texto = ''
  for (let i = 8; i < b.length; ) {
    const largo = b.readUInt32BE(i)
    const tipo = b.toString('latin1', i + 4, i + 8)
    if (tipo === 'iTXt' && b.toString('latin1', i + 8, i + 8 + 12) === 'sloth-pagina') {
      const datos = JSON.parse(inflateSync(b.subarray(i + 8 + 12 + 5, i + 8 + largo)).toString('utf8'))
      texto = datos.lineas.map((l) => l.palabras.map((p) => p.t).join(' ')).join(' ')
    }
    i += 12 + largo
  }
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), texto }
}
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}]+/gu, '')
const ocr = (png, frase) => spawnSync('python', [join(TRABAJO, '_guardia', 'guardia.py'), png, frase], { encoding: 'utf8' })

const hechas = []
for (const [url, archivo, ancho, alto, escala, frase] of CAPTURAS) {
  const args = [url, archivo, '--ancho', ancho, '--alto', alto, '--escala', escala]
  if (correr(`pagina ${archivo.split('/').pop()}`, ['node', join(SKILL, 'scripts', 'pagina.mjs')], args)) hechas.push([url, archivo, ancho * escala, alto * escala, frase])
}
for (const [url, nombre, frase] of POSTS) {
  if (!correr(`tuit ${nombre}`, ['python', join(SKILL, 'scripts', 'tuit.py')], [url, TUITS, nombre])) continue
  const json = join(TRABAJO, TUITS, `${nombre}.json`)
  const texto = existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')).tweet?.text ?? '' : ''
  if (!texto.toLowerCase().includes(frase.toLowerCase())) {
    fallos++
    console.log(`tuit ${nombre} · su JSON no trae "${frase}" · NO PASA`)
  }
}

// La guardia, fuera del tiempo.
for (const [url, archivo, w, h, frase] of hechas) {
  const png = join(TRABAJO, archivo)
  const problemas = []
  if (!existsSync(png)) problemas.push('no está')
  else {
    const p = leerPng(png)
    const post = /x\.com\/.*\/status\//.test(url)
    if (post ? !(p.w > 0 && p.w <= w && p.h > 0 && p.h < h) : !(p.w === w && p.h === h)) problemas.push(`mide ${p.w} ${p.h} y debía ${post ? 'caber en ' : ''}${w} ${h}`)
    if (!norm(p.texto).includes(norm(frase))) problemas.push(`su texto no trae "${frase}"`)
    const r = ocr(png, frase)
    if (r.status !== 0) problemas.push(`el OCR no encuentra "${frase}": ${(r.stderr || r.stdout).trim().slice(-160)}`)
  }
  if (problemas.length) fallos++
  console.log(`  ${archivo.split('/').pop()} · ${problemas.length ? problemas.join(' · ') + ' · NO PASA' : 'bien'}`)
}
limpiar()

if (fallos) console.log(`${fallos} fallo(s): sin score.`)
else console.log(`segundos: ${total.toFixed(1)}`)
