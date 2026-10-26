// El banco de El Diff: dos episodios reales de las sesiones medidas, recortados para que una ronda dure minutos y no
// una hora, con los scripts y la plantilla de este repo. Mide los segundos que el usuario espera (final.py y redes.py)
// y compara cada video con su referencia (la skill de antes del bucle). Solo imprime `segundos:` si todo pasa la guardia.
//   node .autoloop/checks/banco.mjs          mide
//   node .autoloop/checks/banco.mjs --ref    renderiza las referencias (solo al preparar el banco)
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SKILL = join(AQUI, '..', '..', 'video-el-diff')
const PROYECTOS = 'C:/dev/sesiones-el-diff/proyectos' // los episodios tal como salieron de las sesiones
const NODE = 'C:/dev/sesiones-el-diff/node-el-diff/node_modules'
// Fuera del repo: son cientos de MB de video y la rama se sube a GitHub como respaldo.
const REF = 'C:/dev/sesiones-el-diff/banco-ref'
const TRABAJO = join(tmpdir(), 'banco-el-diff')
const VMAF_MIN = 96.5 // promedio: la base otra vez da 97,6-97,9; CRF 23 da 95,9
const VMAF_PISO = 90 // el peor fotograma (la base, 95,4): una captura que falta 2 s da 0 y el promedio solo baja a 95,2
const LU = 0.5 // sonoridad integrada, en LU, contra la referencia

const CASOS = [
  // Horizontal con su corte: intro, logo y el primer bloque (82 s); el corte 1 sin su último tramo, que queda fuera.
  {
    proyecto: 'el-diff-6', hasta: 'cuentas',
    redes: [{ nombre: 'corte', gancho: 'LE DIJERON IDIOTA\nPOR CLONAR PHOTOSHOP', tramos: [['b01', 'b04'], ['b14', 'b17']] }],
    pasos: [['final.py'], ['redes.py']],
    videos: ['out/el-diff-final.mp4', 'out/redes/corte.mp4'],
    hojas: ['revision/final_hoja.png', 'revision/redes_corte.png']
  },
  // Un video del lote en «solo vertical»: sin final horizontal, el fondo vuelve a montar el episodio. Intro y logo (66 s).
  {
    proyecto: 'lote-1007-1542-01', hasta: 'logo', redes: 'todo',
    pasos: [['redes.py', 'vertical']],
    videos: ['out/redes/vertical.mp4'],
    hojas: ['revision/redes_vertical.png']
  }
]

const referencias = process.argv.includes('--ref')
const leer = (f) => JSON.parse(readFileSync(f, 'utf8'))
const escribir = (f, o) => writeFileSync(f, JSON.stringify(o, null, 1))

// Copia el proyecto, le pone la plantilla de este repo y lo recorta hasta el párrafo `hasta`.
function preparar(c) {
  const dir = join(TRABAJO, c.proyecto)
  rmSync(dir, { recursive: true, force: true })
  // Sin fuentes/ (no se usa al renderizar) ni lo que generan los scripts: out/, revision/ y el fondo de public/redes.
  const r = spawnSync('robocopy', [join(PROYECTOS, c.proyecto), dir, '/E', '/MT:8', '/NFL', '/NDL', '/NJH', '/NJS', '/NP',
    '/XD', 'node_modules', 'fuentes', 'out', 'revision', '__pycache__', 'redes'])
  if (r.status >= 8) throw new Error(`robocopy falló (${r.status})`)
  cpSync(join(SKILL, 'plantilla', 'src'), join(dir, 'src'), { recursive: true, filter: (f) => !/[\\/](timeline|lineas)\.json$/.test(f) })
  symlinkSync(NODE, join(dir, 'node_modules'), 'junction')

  const guion = leer(join(dir, 'guion.json'))
  guion.parrafos = guion.parrafos.slice(0, guion.parrafos.findIndex((p) => p.id === c.hasta) + 1)
  const ids = new Set(guion.parrafos.flatMap((p) => p.beats.map((b) => b.id)))
  const linea = leer(join(dir, 'src', 'timeline.json'))
  linea.beats = linea.beats.filter((b) => ids.has(b.id))
  linea.duracion = linea.beats.at(-1).fin
  escribir(join(dir, 'guion.json'), guion)
  escribir(join(dir, 'src', 'timeline.json'), linea)
  const redes = c.redes === 'todo'
    ? [{ nombre: 'vertical', gancho: leer(join(dir, 'redes.json'))[0].gancho, tramos: [[linea.beats[0].id, linea.beats.at(-1).id]] }]
    : c.redes
  escribir(join(dir, 'redes.json'), redes)
  return dir
}

const sonda = (video, campos, stream) => spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', stream,
  '-show_entries', `stream=${campos}`, '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout.trim()
const imagen = (v) => sonda(v, 'width,height,r_frame_rate,nb_read_frames,pix_fmt', 'v:0')
const sonido = (v) => sonda(v, 'codec_name,sample_rate,channels', 'a:0')

function sonoridad(video) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', video, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' })
  return Number([...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1] ?? NaN)
}

// Promedio y peor fotograma. El log va con ruta relativa: en Windows, «C:» rompe la sintaxis de los filtros.
function vmaf(video, ref) {
  rmSync(join(TRABAJO, 'vmaf.json'), { force: true })
  spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', video, '-i', ref, '-lavfi',
    '[0][1]libvmaf=n_threads=12:log_fmt=json:log_path=vmaf.json', '-f', 'null', '-'], { cwd: TRABAJO, encoding: 'utf8' })
  if (!existsSync(join(TRABAJO, 'vmaf.json'))) return [NaN, NaN]
  const v = leer(join(TRABAJO, 'vmaf.json')).frames.map((f) => f.metrics.vmaf)
  return [v.reduce((a, b) => a + b, 0) / v.length, Math.min(...v)]
}

mkdirSync(TRABAJO, { recursive: true })
let total = 0
let fallos = 0
for (const c of CASOS) {
  const dir = preparar(c)
  let roto = false
  for (const [script, ...args] of c.pasos) {
    const t0 = performance.now()
    // ponytail: en Windows el timeout mata a python, no a sus Chrome; si quedan colgados, ciérralos a mano.
    const r = spawnSync('python', [join(AQUI, 'correr.py'), join(SKILL, 'scripts', script), ...args],
      { cwd: dir, encoding: 'utf8', timeout: 30 * 60_000, maxBuffer: 1 << 28 })
    const s = (performance.now() - t0) / 1000
    if (r.status !== 0) {
      console.log(`${c.proyecto} · ${script} ${r.error ? 'se colgó (30 min)' : 'falló'}:\n${(r.stderr || r.stdout || '').slice(-2000)}`)
      roto = true
      break
    }
    total += s
    console.log(`${c.proyecto} · ${[script, ...args].join(' ')} · ${s.toFixed(1)} s`)
  }
  if (roto) {
    fallos++
    continue
  }
  for (const h of c.hojas) {
    if (!existsSync(join(dir, h))) {
      console.log(`${c.proyecto} · falta ${h} · NO PASA`)
      fallos++
    }
  }
  for (const v of c.videos) {
    const video = join(dir, v)
    const ref = join(REF, c.proyecto, basename(v))
    if (referencias) {
      mkdirSync(dirname(ref), { recursive: true })
      copyFileSync(video, ref)
      console.log(`${c.proyecto}/${basename(v)} · referencia: ${imagen(video)} · ${sonido(video)} · ${sonoridad(video)} LUFS`)
      continue
    }
    const [esta, debe] = [imagen(video), imagen(ref)]
    const [oye, debeOir] = [sonido(video), sonido(ref)]
    const [lufs, lufsRef] = [sonoridad(video), sonoridad(ref)]
    const [media, peor] = vmaf(video, ref)
    const bien = esta === debe && oye === debeOir && Math.abs(lufs - lufsRef) <= LU && media >= VMAF_MIN && peor >= VMAF_PISO
    if (!bien) fallos++
    console.log(`${c.proyecto}/${basename(v)} · vmaf ${media.toFixed(1)} (peor ${peor.toFixed(1)}) · ${lufs} LUFS · ` +
      `${esta}${esta === debe ? '' : ` (debía ser ${debe})`} · ${oye}${oye === debeOir ? '' : ` (debía ser ${debeOir})`}` +
      `${bien ? '' : ' · NO PASA'}`)
  }
}

if (fallos) console.log(`${fallos} fallo(s): sin score.`)
else console.log(`segundos: ${total.toFixed(1)}`)
