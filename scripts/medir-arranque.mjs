// Mide el arranque de una Sloth compilada (`npm run compilar -- --sin-instalador`), sin tocar la instalada: corre en otro
// puerto, con su propia carpeta. Ver docs/agents/rendimiento.md.
//
//   node scripts/medir-arranque.mjs <carpeta de Sloth.exe> [veces] [carpeta de hilos que copiar]
//
// En Mac y Linux, la carpeta es la de su ejecutable (linux-unpacked, mac) y sus datos van a una `casa-de-medir` dentro de ella.
// Con la variable ANTES, ese comando corre antes de cada arranque: en Linux, para vaciar la caché del disco y medir en frío.
// Los hilos se copian sin nada que retome un agente. Por cada arranque dice, en ms desde que se lanzó Sloth.exe: cuándo
// empezó a cargar la interfaz (`servidor`), cuándo se montó (`montada`) y cuándo llegaron los datos (`estado`). Luego
// recarga la interfaz en esta máquina y frenada 4 y 6 veces, como en una computadora más lenta: `monta` es lo que tarda en
// montarse y `script`, el JavaScript que corrió. Windows no pinta una ventana tapada: por eso no se usa el primer pintado.
import { execSync, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [carpeta, veces = '6', hilos] = process.argv.slice(2)
if (!carpeta) throw new Error('Falta la carpeta de Sloth.exe, por ejemplo dist/instalador/win-unpacked')
const PUERTO = 4871
const DEPURA = 9371
const FRENOS = [1, 4, 6]
const mediana = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const WINDOWS = process.platform === 'win32'
const MAC = process.platform === 'darwin'
const CASA = join(resolve(carpeta), 'casa-de-medir')
const APP = WINDOWS ? join(carpeta, 'app') : MAC ? join(CASA, 'Library', 'Application Support', 'Sloth') : join(CASA, '.local', 'share', 'sloth')
const PROGRAMA = join(carpeta, WINDOWS ? 'Sloth.exe' : MAC ? join('Sloth.app', 'Contents', 'MacOS', 'Sloth') : 'sloth')

const sesiones = join(APP, 'data', 'sessions')
mkdirSync(sesiones, { recursive: true })
if (hilos && !readdirSync(sesiones).length) {
  for (const f of readdirSync(hilos).filter((x) => x.endsWith('.json'))) {
    const meta = JSON.parse(readFileSync(join(hilos, f), 'utf8'))
    meta.running = false
    delete meta.pendiente
    delete meta.background
    writeFileSync(join(sesiones, f), JSON.stringify(meta))
    const registro = join(hilos, f.replace(/json$/, 'jsonl'))
    if (existsSync(registro)) cpSync(registro, join(sesiones, f.replace(/json$/, 'jsonl')))
  }
}

function conectar(url) {
  return new Promise((listo, fallo) => {
    const ws = new WebSocket(url)
    let n = 0
    const esperan = new Map()
    ws.onopen = () =>
      listo({
        enviar: (method, params = {}) =>
          new Promise((ok, mal) => {
            esperan.set(++n, { ok, mal })
            ws.send(JSON.stringify({ id: n, method, params }))
          }),
        cerrar: () => ws.close()
      })
    ws.onerror = () => fallo(new Error('sin depurador'))
    ws.onmessage = ({ data }) => {
      const m = JSON.parse(data)
      const e = esperan.get(m.id)
      if (!e) return
      esperan.delete(m.id)
      if (m.error) e.mal(new Error(m.error.message))
      else e.ok(m.result)
    }
  })
}

/** Anota cuándo aparece la interfaz en la página, medido desde dentro. */
const MONTAJE = `new MutationObserver((_, o) => {
  if (document.getElementById('root')?.childElementCount) { window.__montada = performance.now(); o.disconnect() }
}).observe(document, { childList: true, subtree: true })`

const LEER = `(() => {
  const res = performance.getEntriesByType('resource')
  return {
    origen: performance.timeOrigin,
    estado: res.find((r) => r.name.includes('/api/state'))?.responseEnd,
    js: res.filter((r) => /\\.js$/.test(r.name)).reduce((s, r) => s + r.decodedBodySize, 0)
  }
})()`

async function unaVez() {
  if (process.env.ANTES) execSync(process.env.ANTES, { stdio: 'ignore' })
  const t0 = Date.now()
  const { ELECTRON_RUN_AS_NODE: _, XDG_DATA_HOME: __, ...env } = process.env
  const p = spawn(PROGRAMA, [`--remote-debugging-port=${DEPURA}`], { env: { ...env, PORT: String(PUERTO), ...(WINDOWS ? {} : { HOME: CASA }) }, stdio: 'ignore', detached: !WINDOWS })
  try {
    let objetivo
    for (let i = 0; i < 2400 && !objetivo; i++) {
      const lista = await fetch(`http://127.0.0.1:${DEPURA}/json/list`).then((r) => r.json(), () => [])
      objetivo = lista.find((x) => x.type === 'page' && x.url.includes(`:${PUERTO}`))
      if (!objetivo) await dormir(25)
    }
    if (!objetivo) throw new Error('la interfaz no cargó')
    const cdp = await conectar(objetivo.webSocketDebuggerUrl)
    const js = async (expression) => (await cdp.enviar('Runtime.evaluate', { expression, returnByValue: true })).result.value
    await cdp.enviar('Page.enable')
    await cdp.enviar('Performance.enable')
    await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: MONTAJE })
    let m
    let montada
    for (let i = 0; i < 2400; i++) {
      m = await js(LEER).catch(() => undefined)
      if (!montada && (await js(`document.getElementById('root')?.childElementCount > 0`).catch(() => false))) montada = Date.now() - t0
      if (montada && m?.estado) break
      await dormir(25)
    }
    const r = { servidor: m.origen - t0, montada, estado: m.origen + m.estado - t0, jsKB: m.js / 1024 }
    await dormir(1000)
    for (const freno of FRENOS) {
      await cdp.enviar('Emulation.setCPUThrottlingRate', { rate: freno })
      const metricas = async () => Object.fromEntries((await cdp.enviar('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
      const antes = await metricas()
      await cdp.enviar('Page.reload')
      await dormir(200)
      let monta
      for (let i = 0; i < 800 && !monta; i++) {
        monta = await js('window.__montada').catch(() => undefined)
        if (!monta) await dormir(25)
      }
      await dormir(freno * 700)
      const despues = await metricas()
      r[`monta${freno}x`] = monta
      // Un contador que volvió a cero con la recarga ya es lo de esta carga.
      r[`script${freno}x`] = (despues.ScriptDuration < antes.ScriptDuration ? despues.ScriptDuration : despues.ScriptDuration - antes.ScriptDuration) * 1000
      r[`memoria${freno}x`] = despues.JSHeapUsedSize / 1048576
    }
    cdp.cerrar()
    return r
  } finally {
    if (WINDOWS) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true })
    else {
      process.kill(-p.pid, 'SIGKILL')
      // El servidor va en su propio grupo de procesos y sobreviviría a la ventana.
      spawnSync('pkill', ['-9', '-f', `${resolve(carpeta)}/.*[Rr]esources/node/`])
    }
    await dormir(1500)
  }
}

await unaVez().catch((e) => console.log(`El primero solo calienta: ${e.message}`)) // Copia las skills: no cuenta.
const filas = []
for (let i = 0; i < Number(veces); i++) {
  filas.push(await unaVez())
  console.log(JSON.stringify(Object.fromEntries(Object.entries(filas.at(-1)).map(([k, v]) => [k, Math.round(v)]))))
}
console.log(`\n${carpeta}: ${filas.length} arranques, mediana (mín–máx)`)
for (const k of Object.keys(filas[0])) {
  const v = filas.map((f) => f[k])
  const d = k.startsWith('memoria') ? 1 : 0
  console.log(`  ${k.padEnd(12)} ${mediana(v).toFixed(d).padStart(7)}   (${Math.min(...v).toFixed(d)}–${Math.max(...v).toFixed(d)})`)
}
