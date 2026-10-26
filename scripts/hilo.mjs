// Resume un hilo de Sloth desde sus archivos (`data/sessions/<id>.json` y `.jsonl`), para no escribir otro lector cada vez:
// cómo va, cuánto lleva y costó cada turno, en qué herramientas se fue, qué falló, qué sigue en segundo plano y cuánto
// disco queda. Sin id, los hilos más recientes.
//   npm run hilo                       los 15 últimos hilos
//   npm run hilo -- <id>               el resumen de uno
//   npm run hilo -- <id> --errores     además, cada herramienta que falló, con su salida
//   npm run hilo -- <id> --mensajes    además, lo que pidió el usuario en cada turno
import { existsSync, readdirSync, readFileSync, statfsSync, statSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SESIONES = join(REPO, 'data', 'sessions')
const [id, ...banderas] = process.argv.slice(2)
const min = (ms) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 5_400_000 ? `${(ms / 60_000).toFixed(1)} min` : ms < 172_800_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${Math.round(ms / 86_400_000)} días`)
const hace = (t) => `hace ${min(Date.now() - t)}`
const corto = (s, n = 160) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n)
const meta = (i) => JSON.parse(readFileSync(join(SESIONES, `${i}.json`), 'utf8'))

if (!existsSync(SESIONES)) {
  console.error(`No hay hilos en ${SESIONES}: corre esto en la copia de Sloth donde trabajan (la de C:/dev/vancci-sloth).`)
  process.exit(1)
}

if (!id) {
  const hilos = readdirSync(SESIONES)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ id: f.slice(0, -6), t: statSync(join(SESIONES, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, 15)
  for (const h of hilos) {
    const m = existsSync(join(SESIONES, `${h.id}.json`)) ? meta(h.id) : {}
    console.log(`${h.id}  ${(m.cardId ?? '?').padEnd(18)} ${m.running ? 'TRABAJANDO' : '          '} ${hace(h.t).padEnd(16)} ${corto(m.title, 70)}`)
  }
  process.exit(0)
}

if (!existsSync(join(SESIONES, `${id}.jsonl`))) {
  console.error(`No existe ${join(SESIONES, `${id}.jsonl`)}`)
  process.exit(1)
}
const m = meta(id)
const eventos = readFileSync(join(SESIONES, `${id}.jsonl`), 'utf8')
  .split('\n')
  .flatMap((l) => {
    try {
      return l ? [JSON.parse(l)] : []
    } catch {
      return []
    }
  })

const turnos = []
const herramientas = new Map()
const llamadas = new Map()
const errores = []
let turno, fondo = [], ultimo = 0, contexto
for (const e of eventos) {
  if (e.at) ultimo = Math.max(ultimo, e.at)
  if (e.t === 'user') turnos.push((turno = { pedido: e.text, inicio: e.at, herramientas: 0, errores: 0 }))
  else if (e.t === 'turn_start' && turno) turno.inicio ??= e.at
  else if (e.t === 'tool') {
    llamadas.set(e.id, e)
    herramientas.set(e.name, (herramientas.get(e.name) ?? 0) + 1)
    if (turno) turno.herramientas++
  } else if (e.t === 'tool_update' && e.done && e.error) {
    const t = llamadas.get(e.id)
    errores.push({ nombre: t?.name, entrada: t?.input, salida: e.output })
    if (turno) turno.errores++
  } else if (e.t === 'background') fondo = e.tasks ?? []
  else if (e.t === 'context') contexto = e
  else if (e.t === 'turn_end' && turno) Object.assign(turno, { fin: e.at, costo: e.costUsd ?? 0, ok: e.ok, error: e.error })
}

const costo = turnos.reduce((s, t) => s + (t.costo ?? 0), 0)
console.log(`${m.title}  (${m.cardId}, ${m.model ?? '?'} ${m.effort ?? ''})`)
console.log(`carpeta: ${m.cwd}`)
console.log(`${m.running ? 'TRABAJANDO' : m.acaboBien === false ? 'ACABÓ MAL' : 'quieto'} · última actividad ${hace(ultimo)} · ${turnos.length} turnos · $${costo.toFixed(2)}${contexto ? ` · contexto ${Math.round(contexto.used / 1000)}k de ${Math.round(contexto.max / 1000)}k` : ''}`)
if (fondo.length) console.log(`en segundo plano: ${fondo.join(' · ')}`)
try {
  const d = statfsSync(parse(REPO).root)
  const libre = (d.bavail * d.bsize) / 1e9
  console.log(`disco libre en ${parse(REPO).root}: ${libre.toFixed(1)} GB${libre < 20 ? '  ← POCO: los renders fallan con ENOSPC' : ''}`)
} catch {}

console.log('\nturnos:')
turnos.forEach((t, i) => {
  const dura = t.fin && t.inicio ? min(t.fin - t.inicio) : 'sin acabar'
  const estado = t.ok === false ? `  FALLÓ: ${corto(t.error, 100)}` : ''
  console.log(`  ${String(i + 1).padStart(2)}. ${dura.padEnd(10)} $${(t.costo ?? 0).toFixed(2).padEnd(6)} ${String(t.herramientas).padStart(4)} herr. ${String(t.errores).padStart(3)} err.  ${banderas.includes('--mensajes') ? '' : corto(t.pedido, 70)}${estado}`)
  if (banderas.includes('--mensajes')) console.log(`      ${corto(t.pedido, 1200)}`)
})

console.log(`\nherramientas: ${[...herramientas].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(' · ')}`)
console.log(`fallaron: ${errores.length}`)
if (banderas.includes('--errores'))
  for (const e of errores) console.log(`\n  ${e.nombre} ${corto(JSON.stringify(e.entrada), 200)}\n    → ${corto(e.salida, 400)}`)
