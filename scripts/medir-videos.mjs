// Dónde se va el tiempo de los videos: una fila por video, de las transcripciones de Claude y de Codex, que llevan la hora
// de cada paso (los `.jsonl` de Sloth no). El tiempo se reparte entre «pensar» (el modelo escribiendo, de un resultado a
// su siguiente llamada) y la fase de la herramienta que corría. Los huecos de más de 10 min no cuentan: nadie estaba.
// Es la vara del antes y el después de docs/plan-videos-rapidos.md.
//   npm run medir-videos                          los 20 videos más recientes, de esta copia y de la app instalada
//   npm run medir-videos -- --estilo video-explicativo --desde 2026-11-01 --n 40
//   npm run medir-videos -- --fases               además, los minutos de cada fase en cada video
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opcion = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const ESTILO = opcion('--estilo')
const DESDE = opcion('--desde') ? Date.parse(opcion('--desde')) : 0
const N = Number(opcion('--n') ?? 20)
const HUECO = 10 * 60_000

/** La fase de una llamada, por lo que hace. La primera que encaja gana. */
const FASES = [
  ['subagentes', /^(Agent|Task|spawn_agent|wait_agent|SendMessage)\b/],
  ['render final', /final\.py(?! --borrador)|terminar\.py(?! . --borrador)/],
  ['portada', /portada/i],
  ['revisar', /revisar|--borrador|borrador-|fotos\.mjs|hoja\.mjs|hojas\.py|reglas\.mjs|vivo\.mjs|\.(png|jpe?g)\b|imageView/],
  ['compilar', /tsc\b|encuadre|esbuild/],
  ['voz', /generar_voz|estado_voz|alinear|acelerar|subtitulos|voz\.py|voz\/|adaptar\.py|sintetizar/],
  ['imágenes', /codex exec|image_gen|generar_imagen|estado_flow|texturas|pedido|bocas\.py|perro\.py/],
  ['modelos 3D', /modelos\.py|modelos-3d|src\/modelos/],
  ['investigar', /WebSearch|WebFetch|web_search|buscar\.mjs|leer\.mjs|pagina\.mjs|capturar\.mjs|curl |investigacion|citas\.py|verificar\.py/],
  ['escribir', /^(Write|Edit|MultiEdit|apply_patch)\b|sed -i|python - <<|cat > /],
  ['leer', /^(Read|Grep|Glob)\b|\bcat |\bsed -n|\bhead |\bls\b/],
]
const faseDe = (texto) => (FASES.find(([, r]) => r.test(texto)) ?? ['otro'])[0]

const leer = (f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .flatMap((l) => {
      try {
        return l ? [JSON.parse(l)] : []
      } catch {
        return []
      }
    })

const ORDEN = FASES.map(([n]) => n).concat('otro')

/**
 * Suma cada tramo al estado en que estaba: la fase de lo que seguía corriendo (si eran varias a la vez, la primera de
 * FASES) o, sin nada pendiente, `pensar`. Cada paso abre una llamada (`abre`, con su fase) o cierra una (`cierra`).
 * Lo que el modelo tarda en generar una llamada que escribe un archivo (su contenido entero) cuenta como `escribir`.
 */
function repartir(pasos) {
  const fases = {}
  const pendientes = new Map()
  let antes = null
  for (const p of pasos) {
    const estado = pendientes.size ? ORDEN.find((n) => [...pendientes.values()].includes(n)) : p.abre && p.fase === 'escribir' ? 'escribir' : 'pensar'
    if (antes != null && p.t - antes < HUECO) fases[estado] = (fases[estado] ?? 0) + (p.t - antes)
    antes = p.t
    if (p.abre) pendientes.set(p.abre, p.fase)
    if (p.cierra) pendientes.delete(p.cierra)
  }
  return fases
}

/** Claude: cada `tool_use` abre su llamada y su `tool_result` la cierra. */
function deClaude(f) {
  const pasos = []
  let vueltas = 0, subagentes = 0, inicio = null
  for (const e of leer(f)) {
    const t = e.timestamp && Date.parse(e.timestamp)
    if (!t) continue
    inicio ??= t
    const c = e.message?.content
    if (!Array.isArray(c)) continue
    if (e.type === 'assistant') {
      if (!c.some((b) => b.type === 'tool_use')) pasos.push({ t })
      for (const b of c.filter((b) => b.type === 'tool_use')) {
        vueltas++
        if (b.name === 'Agent' || b.name === 'Task') subagentes++
        pasos.push({ t, abre: b.id, fase: faseDe(`${b.name} ${b.input?.command ?? b.input?.file_path ?? JSON.stringify(b.input ?? {})}`) })
      }
    } else if (e.type === 'user') for (const b of c.filter((b) => b.type === 'tool_result')) pasos.push({ t, cierra: b.tool_use_id })
  }
  return { pasos, vueltas, subagentes, inicio }
}

/** Codex: sus llamadas (`exec` lleva el código que corre) y sus salidas, unidas por `call_id`. */
function deCodex(f) {
  const pasos = []
  let vueltas = 0, subagentes = 0, inicio = null, cwd = ''
  for (const e of leer(f)) {
    const t = e.timestamp && Date.parse(e.timestamp)
    if (!t) continue
    inicio ??= t
    const p = e.payload ?? {}
    // Los subagentes y los `codex exec` de las imágenes tienen su propio archivo: cuentan dentro del video que los lanzó.
    if (e.type === 'session_meta' && (p.parent_thread_id || p.source !== 'vscode')) return { pasos, vueltas: 0, subagentes, inicio }
    if (e.type === 'session_meta') cwd = p.cwd ?? ''
    if (e.type !== 'response_item') continue
    if (p.type === 'custom_tool_call' || p.type === 'function_call') {
      vueltas++
      if (p.name === 'spawn_agent') subagentes++
      pasos.push({ t, abre: p.call_id, fase: faseDe(`${p.name} ${p.input ?? p.arguments ?? ''}`) })
    } else if (/_output$/.test(p.type)) pasos.push({ t, cierra: p.call_id })
  }
  return { pasos, vueltas, subagentes, inicio, cwd }
}

const ESTILOS = /trabajo[-\\/](video-[a-z-]+|reel-[a-z-]+)/

function transcripciones() {
  const lista = []
  const vistos = new Set() // en Windows, `sloth-app` y `Sloth-app` son la misma carpeta
  for (const base of [join(REPO, 'data', 'claude', 'projects'), join(homedir(), '.claude', 'projects')]) {
    if (!existsSync(base)) continue
    for (const dir of readdirSync(base)) {
      const estilo = dir.match(ESTILOS)?.[1]
      if (!estilo) continue
      const donde = base.startsWith(REPO) ? 'dev' : 'app'
      for (const f of readdirSync(join(base, dir)).filter((x) => x.endsWith('.jsonl') && !vistos.has(x) && vistos.add(x)))
        lista.push({ f: join(base, dir, f), estilo, donde, agente: 'claude', t: statSync(join(base, dir, f)).mtimeMs })
    }
  }
  const codex = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions')
  const recorrer = (d) => {
    if (!existsSync(d)) return
    for (const x of readdirSync(d, { withFileTypes: true })) {
      const r = join(d, x.name)
      if (x.isDirectory()) recorrer(r)
      else if (x.name.startsWith('rollout-') && x.name.endsWith('.jsonl')) lista.push({ f: r, agente: 'codex', t: statSync(r).mtimeMs })
    }
  }
  recorrer(codex)
  return lista.filter((x) => x.t >= DESDE).sort((a, b) => b.t - a.t)
}

const min = (ms) => (ms / 60_000).toFixed(1).padStart(5)
const filas = []
for (const x of transcripciones()) {
  if (filas.length >= N) break
  const r = x.agente === 'claude' ? deClaude(x.f) : deCodex(x.f)
  if (x.agente === 'codex') {
    x.estilo = r.cwd?.match(ESTILOS)?.[1]
    x.donde = /sloth-dev|vancci-sloth/.test(r.cwd) ? 'dev' : 'app'
  }
  if (!x.estilo || (ESTILO && x.estilo !== ESTILO) || r.vueltas < 15) continue
  const fases = repartir(r.pasos)
  const activo = Object.values(fases).reduce((a, b) => a + b, 0)
  filas.push({ ...x, ...r, fases, activo })
}

if (!filas.length) {
  console.log('No hay videos con esos filtros.')
  process.exit(0)
}
for (const v of filas) {
  const fecha = new Date(v.inicio).toISOString().slice(5, 16).replace('T', ' ')
  console.log(
    `${fecha}  ${v.estilo.padEnd(18)} ${v.donde} ${v.agente.padEnd(6)} ${min(v.activo)} min · pensar ${min(v.fases.pensar ?? 0)} · ${String(v.vueltas).padStart(3)} vueltas · ${String(v.subagentes).padStart(2)} subagentes`,
  )
  if (args.includes('--fases'))
    console.log(
      '      ' +
        Object.entries(v.fases)
          .filter(([k, ms]) => k !== 'pensar' && ms >= 30_000)
          .sort((a, b) => b[1] - a[1])
          .map(([k, ms]) => `${k} ${(ms / 60_000).toFixed(1)}`)
          .join(' · '),
    )
}
const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
console.log(`\n${filas.length} videos · mediana ${min(mediana(filas.map((v) => v.activo))).trim()} min y ${mediana(filas.map((v) => v.vueltas))} vueltas`)
const total = {}
for (const v of filas) for (const [k, ms] of Object.entries(v.fases)) total[k] = (total[k] ?? 0) + ms
console.log(
  'promedio por video: ' +
    Object.entries(total)
      .sort((a, b) => b[1] - a[1])
      .map(([k, ms]) => `${k} ${(ms / filas.length / 60_000).toFixed(1)}`)
      .join(' · '),
)
