// Dónde se va el tiempo (y el dinero) de una sesión de Claude Code, por etapa, leído de su registro.
//
//   node tiempos.mjs --buscar <skill> [--en <carpeta>]    lista las sesiones que llamaron a esa skill
//   node tiempos.mjs <sesión.jsonl> [--etapas etapas.json] [--desde "texto"] [--md salida.md]
//   node tiempos.mjs <sesión>/subagents/agent-<id>.jsonl ...   un subagente y los que él lanzó (una prueba de la skill)
//
// Lee la sesión y sus subagentes (<sesión>/subagents/agent-*.jsonl). Cada tramo de tiempo es del modelo (desde que le
// llega la entrada hasta que termina de escribir), de una herramienta (hasta que vuelve su resultado), de esperar a un
// agente o de esperar al usuario (eso no cuenta). Cada llamada a herramienta tiene una clave (`capturar.py`,
// `WebSearch`, `agente: <descripción>`...) y `etapas.json` agrupa las claves en etapas: `[["Etapa", "regex"], ...]`,
// gana la primera que encaje. El tiempo del modelo va a la etapa de las herramientas que pidió en esa llamada.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

// $ por millón de tokens: entrada, salida, lectura de caché, escritura de caché a 5 min y a 1 h.
const PRECIOS = {
  'opus-5-5': [4, 20, 0.2, 5, 8],
  'sonnet-5-5': [2, 10, 0.2, 2.5, 4],
  'haiku-5-5': [0.1, 0.5, 0.01, 0.125, 0.2], // ponytail: la lectura de caché de Haiku es estimada (0.1× la entrada)
  'fable-5-1': [10, 50, 0.25, 12.5, 20],
}

const args = process.argv.slice(2)
const opcion = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v }
const buscar = opcion('--buscar')
const rutaEtapas = opcion('--etapas')
const desde = opcion('--desde')
const rutaMd = opcion('--md')

// Las sesiones traídas de otra computadora van fuera de ~/.claude/projects: `--en` las busca ahí.
const PROYECTOS = opcion('--en') ?? join(homedir(), '.claude', 'projects')
const leer = (ruta) => readFileSync(ruta, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
const mmss = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const ms = (ts) => Date.parse(ts)

if (buscar) {
  const marca = `<command-name>/${buscar}</command-name>`
  const filas = []
  for (const dir of readdirSync(PROYECTOS)) {
    const carpeta = join(PROYECTOS, dir)
    if (!statSync(carpeta).isDirectory()) continue
    for (const f of readdirSync(carpeta).filter((f) => f.endsWith('.jsonl'))) {
      const ruta = join(carpeta, f)
      const texto = readFileSync(ruta, 'utf8')
      if (!texto.includes(marca)) continue
      const lineas = leer(ruta)
      const cwd = lineas.find((d) => d.cwd)?.cwd ?? dir
      const ts = lineas.filter((d) => d.timestamp).map((d) => d.timestamp)
      const local = (t) => t ? new Date(t).toLocaleString('sv-SE').slice(0, 16) : ''
      filas.push([local(ts[0]), local(ts.at(-1)), cwd, ruta])
    }
  }
  filas.sort()
  for (const [a, b, cwd, ruta] of filas) console.log(`${a} → ${b.slice(0, 10) === a.slice(0, 10) ? b.slice(11) : b}  ${cwd}\n  ${ruta}`)
  if (!filas.length) console.log(`Ninguna sesión llamó a /${buscar} en ${PROYECTOS}`)
  process.exit(0)
}

const ruta = args[0]
if (!ruta) { console.log('uso: node tiempos.mjs <sesión.jsonl> [--etapas etapas.json] [--desde "texto"] [--md salida.md]\n     node tiempos.mjs --buscar <skill> [--en <carpeta>]'); process.exit(1) }
const reglas = rutaEtapas ? JSON.parse(readFileSync(rutaEtapas, 'utf8')).map(([e, r]) => [e, new RegExp(r, 'i')]) : []
const etapaDe = (clave) => reglas.find(([, r]) => r.test(clave))?.[0] ?? null

function clave(b) {
  const i = b.input ?? {}
  if (b.name === 'Bash' || b.name === 'PowerShell') {
    const cmd = i.command ?? ''
    // Un bucle con sleep es esperar algo que corre en segundo plano: se nombra por el archivo que espera.
    if (/\b(for|until|while)\b/.test(cmd) && /\bsleep\b/.test(cmd)) {
      const f = cmd.match(/[\w.-]+\.(?:json|txt|log|output|png|mp4|wav)\b/)
      return `esperar: ${f ? f[0] : cmd.replace(/^(cd\s+\S+\s*(&&|;)\s*)+/, '').slice(0, 30)}`
    }
    if (/^\s*python3?\s+-(c\b|\s|$)/.test(cmd.replace(/^(cd\s+\S+\s*(&&|;)\s*)+/, ''))) return 'python -c'
    const script = cmd.match(/[\w.-]+\.(?:py|mjs|js|ps1|ts)\b/)
    if (script) return script[0]
    const palabras = cmd.replace(/^(cd\s+\S+\s*(&&|;)\s*)+/, '').trim().split(/\s+/)
    return `${b.name.toLowerCase()}: ${palabras.slice(0, 2).join(' ').slice(0, 40)}`
  }
  if (b.name === 'Read') return /\.(png|jpe?g|webp|gif)$/i.test(i.file_path ?? '') ? 'ver imagen' : `leer ${basename(i.file_path ?? '')}`
  if (b.name === 'Write' || b.name === 'Edit') return `escribir ${basename(i.file_path ?? '')}`
  if (b.name === 'Agent' || b.name === 'Task') return `agente: ${i.description ?? ''}`
  if (b.name === 'SendMessage') return `agente: (retomar) ${i.summary ?? ''}`
  return b.name
}

// Lo que escribió el usuario (con o sin imágenes); null si es un resultado de herramienta.
const textoUsuario = (m) => typeof m.content === 'string' ? m.content
  : Array.isArray(m.content) && !m.content.some((b) => b.type === 'tool_result') ? m.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ') : null
const esDelUsuario = (d, texto) => !!texto && !d.isMeta && (!texto.startsWith('<') || texto.includes('<command-name>'))

function costo(modelo, u) {
  const p = PRECIOS[modelo]
  if (!p || !u) return 0
  const c = u.cache_creation ?? {}
  const c1h = c.ephemeral_1h_input_tokens ?? 0
  const c5m = c.ephemeral_5m_input_tokens ?? (u.cache_creation_input_tokens ?? 0) - c1h
  return (u.input_tokens * p[0] + u.output_tokens * p[1] + (u.cache_read_input_tokens ?? 0) * p[2] + c5m * p[3] + c1h * p[4]) / 1e6
}

// Un registro → tramos { tipo: modelo|herramienta|agente|usuario, clave, etapa, seg, modelo, costo }.
function tramos(lineas, conDesde) {
  const out = []
  const usos = new Map() // id de tool_use → { clave, ts, rid, agente }
  const pedidos = new Map() // requestId → { inicio, fin, modelo, uso, claves: [] }
  const fondos = new Map() // id de un comando en segundo plano → su clave
  let activo = !conDesde?.texto
  let entrada = null // ts de la última entrada (usuario o resultado)
  let ultimaEtapa = null
  let pendiente = null // pedido que acabó sin herramientas: el hueco hasta la siguiente entrada es una espera
  for (const d of lineas) {
    if (!d.timestamp || (d.isSidechain && !conDesde?.subagente)) continue
    const t = ms(d.timestamp)
    const m = d.message ?? {}
    if (d.type === 'user') {
      const texto = textoUsuario(m)
      if (!activo && texto && conDesde?.texto && texto.includes(conDesde.texto)) activo = true
      if (!activo) continue
      if (pendiente && entrada !== null) {
        const hueco = (t - pendiente.fin) / 1000
        const aviso = texto?.match(/<tool-use-id>(\w+)<\/tool-use-id>/)
        // Los avisos viejos no traen el id, solo el resumen: Agent "x" / Background command "x".
        const resumen = texto?.match(/<summary>(Agent|Background command) "([^"]+)"/)
        if (aviso && usos.has(aviso[1])) {
          const u = usos.get(aviso[1])
          out.push({ tipo: u.agente ? 'agente' : 'herramienta', clave: u.clave, etapa: etapaDe(u.clave), seg: hueco })
        } else if (resumen) {
          const k = resumen[1] === 'Agent' ? `agente: ${resumen[2]}` : `segundo plano: ${resumen[2]}`
          out.push({ tipo: resumen[1] === 'Agent' ? 'agente' : 'herramienta', clave: k, etapa: etapaDe(k), seg: hueco })
        } else if (esDelUsuario(d, texto)) out.push({ tipo: 'usuario', clave: 'esperando al usuario', seg: hueco })
        // Un subagente parado (límite de uso) que alguien retoma después: es pausa, no trabajo.
        else if (d.isMeta && /sent a message/.test(texto ?? '')) out.push({ tipo: 'pausa', clave: 'pausa', seg: hueco })
        else out.push({ tipo: 'herramienta', clave: 'otros', etapa: null, seg: hueco })
      }
      pendiente = null
      // Resultados de herramientas: el tramo va desde que acabó el pedido hasta el último resultado, repartido.
      const resultados = Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_result') : []
      for (const r of resultados) {
        const u = usos.get(r.tool_use_id)
        if (u) u.fin = t
        // Un comando que quedó en segundo plano: esperar su salida (<id>.output) es esperar ese comando.
        const id = JSON.stringify(r.content ?? '').match(/in background with ID: (\w+)/)
        if (u && id) fondos.set(id[1], u.clave)
      }
      entrada = t
      continue
    }
    if (d.type !== 'assistant' || !activo || entrada === null) continue
    const rid = d.requestId ?? d.uuid
    let p = pedidos.get(rid)
    if (!p) {
      // Cerrar las herramientas del pedido anterior: repartir su hueco de reloj entre ellas.
      cerrarHerramientas(out, usos, pedidos)
      p = { inicio: entrada, fin: t, modelo: (m.model ?? '?').replace(/^claude-/, ''), esfuerzo: d.effort, uso: m.usage, claves: [], ids: [] }
      pedidos.set(rid, p)
    }
    p.fin = t
    if (m.usage) p.uso = m.usage
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b.type !== 'tool_use') continue
      let k = clave(b)
      const salida = k.match(/^esperar: (\w+)\.output$/)
      if (salida && fondos.has(salida[1])) k = fondos.get(salida[1])
      p.claves.push(k)
      p.ids.push(b.id)
      usos.set(b.id, { clave: k, ts: t, rid, agente: ['Agent', 'Task', 'SendMessage'].includes(b.name), fondo: !!b.input?.run_in_background })
    }
    if (m.stop_reason === 'end_turn' || (m.stop_reason && m.stop_reason !== 'tool_use')) pendiente = p
  }
  cerrarHerramientas(out, usos, pedidos)
  // El tiempo del modelo de cada pedido, en la etapa de lo que pidió (o la anterior si solo escribió texto).
  for (const p of pedidos.values()) {
    if (p.modelo === '<synthetic>') continue // errores de la API, sin modelo detrás
    const etapa = p.claves.map(etapaDe).find(Boolean) ?? (p.claves.length ? null : ultimaEtapa)
    if (etapa) ultimaEtapa = etapa
    out.push({ tipo: 'modelo', clave: p.claves[0] ?? 'respuesta', etapa, seg: (p.fin - p.inicio) / 1000,
      modelo: `${p.modelo}${p.esfuerzo ? '·' + p.esfuerzo : ''}`, costo: costo(p.modelo, p.uso), llamadas: 1 })
  }
  return out
}

function cerrarHerramientas(out, usos, pedidos) {
  for (const [rid, p] of pedidos) {
    if (p.cerrado) continue
    const mias = p.ids.map((id) => usos.get(id)).filter((u) => u?.fin && !u.fondo)
    if (!mias.length) { if (p.ids.length && p.ids.every((id) => usos.get(id)?.fin || usos.get(id)?.fondo)) p.cerrado = true; continue }
    if (!p.ids.every((id) => usos.get(id)?.fin || usos.get(id)?.fondo)) continue
    p.cerrado = true
    const reloj = (Math.max(...mias.map((u) => u.fin)) - p.fin) / 1000
    const suma = mias.reduce((s, u) => s + Math.max(0.001, u.fin - u.ts), 0)
    for (const u of mias) {
      out.push({ tipo: u.agente ? 'agente' : 'herramienta', clave: u.clave, etapa: etapaDe(u.clave),
        seg: Math.max(0, reloj) * Math.max(0.001, u.fin - u.ts) / suma, larga: (u.fin - u.ts) / 1000 })
    }
  }
}

// La sesión y sus subagentes (y los de ellos), solo los que lanzó la parte medida.
function medir(ruta) {
const lineasPrincipal = leer(ruta)
const esSubagente = /[\\/]subagents[\\/]agent-[^\\/]+\.jsonl$/.test(ruta)
const principal = tramos(lineasPrincipal, esSubagente ? { subagente: true, texto: desde ?? undefined } : desde ? { texto: desde } : null)
const idsLanzados = new Set(lineasPrincipal.flatMap((d) => Array.isArray(d.message?.content) ? d.message.content.filter((b) => b.type === 'tool_use').map((b) => b.id) : []))
const subagentes = []
// Un subagente (`<sesión>/subagents/agent-*.jsonl`) se mide con los suyos, que están en su misma carpeta.
const carpetaSub = esSubagente ? dirname(ruta) : join(ruta.replace(/\.jsonl$/, ''), 'subagents')
if (existsSync(carpetaSub)) {
  const metas = readdirSync(carpetaSub).filter((f) => f.endsWith('.meta.json')).map((f) => ({ f, ...JSON.parse(readFileSync(join(carpetaSub, f), 'utf8')) }))
  let cambio = true
  const hechos = new Set()
  const desdeTs = desde ? principal.length && lineasPrincipal.find((d) => d.type === 'user' && textoUsuario(d.message ?? {})?.includes(desde))?.timestamp : null
  while (cambio) {
    cambio = false
    for (const meta of metas) {
      if (hechos.has(meta.f) || !idsLanzados.has(meta.toolUseId)) continue
      hechos.add(meta.f)
      cambio = true
      const lineas = leer(join(carpetaSub, meta.f.replace('.meta.json', '.jsonl')))
      if (desdeTs && lineas[0]?.timestamp < desdeTs) continue
      for (const d of lineas) for (const b of Array.isArray(d.message?.content) ? d.message.content : []) if (b.type === 'tool_use') idsLanzados.add(b.id)
      const t = tramos(lineas, { subagente: true })
      const ts = lineas.filter((d) => d.timestamp).map((d) => ms(d.timestamp))
      subagentes.push({ nombre: meta.description ?? meta.f, tramos: t, reloj: (Math.max(...ts) - Math.min(...ts)) / 1000 })
    }
  }
}
return { principal, subagentes }
}

// Varias sesiones se suman: el reloj es la suma de los relojes, aunque hayan corrido a la vez.
const sesiones = args.map((r) => ({ ruta: r, ...medir(r) }))
const principal = sesiones.flatMap((s) => s.principal)
const subagentes = sesiones.flatMap((s) => s.subagentes)

// Tablas.
const suma = (xs, f = (x) => x.seg) => xs.reduce((s, x) => s + (f(x) || 0), 0)
const nombreEtapa = (x) => x.etapa ?? (reglas.length ? 'sin etapa' : x.clave)
function porEtapa(xs) {
  const g = new Map()
  for (const x of xs) {
    const k = nombreEtapa(x)
    const e = g.get(k) ?? { modelo: 0, herramienta: 0, agente: 0, llamadas: 0, costo: 0, modelos: new Set() }
    e[x.tipo] += x.seg
    if (x.tipo === 'modelo') { e.llamadas++; e.costo += x.costo; e.modelos.add(x.modelo) }
    g.set(k, e)
  }
  return [...g].map(([k, e]) => ({ etapa: k, total: e.modelo + e.herramienta + e.agente, ...e })).sort((a, b) => b.total - a.total)
}

const todo = [...principal, ...subagentes.flatMap((s) => s.tramos)]
const reloj = principal.filter((x) => x.tipo !== 'usuario' && x.tipo !== 'pausa')
const trabajo = todo.filter((x) => !['usuario', 'agente', 'pausa'].includes(x.tipo))
const pausas = suma(todo.filter((x) => x.tipo === 'pausa'))
const lineas = []
const p = (s = '') => lineas.push(s)
p(`# Tiempos · ${sesiones.length > 1 ? `${sesiones.length} sesiones` : basename(ruta)}${desde ? ` · desde «${desde}»` : ''}`)
p()
p(`Reloj (sin esperarte a ti): **${mmss(suma(reloj))}** · esperándote: ${mmss(suma(principal.filter((x) => x.tipo === 'usuario')))} · ` +
  (pausas ? `pausas por el límite de uso: ${mmss(pausas)} · ` : '') +
  `llamadas al modelo: ${suma(todo, (x) => x.llamadas)} · costo aprox.: **$${suma(todo, (x) => x.costo).toFixed(2)}** (con ${subagentes.length} subagentes)`)
p()
if (sesiones.length > 1) {
  p('| Sesión | Reloj | Esperándote | Llamadas | Costo |')
  p('|---|---|---|---|---|')
  for (const s of sesiones) {
    const t = [...s.principal, ...s.subagentes.flatMap((a) => a.tramos)]
    p(`| ${basename(s.ruta).slice(0, 8)} | ${mmss(suma(s.principal.filter((x) => x.tipo !== 'usuario' && x.tipo !== 'pausa')))} | ${mmss(suma(s.principal.filter((x) => x.tipo === 'usuario')))} | ${suma(t, (x) => x.llamadas)} | $${suma(t, (x) => x.costo).toFixed(2)} |`)
  }
  p()
}
p('## Lo que esperas: el hilo principal, por etapa')
p()
p('| Etapa | Tiempo | % | Modelo | Herramientas | Esperando agentes | Llamadas | Modelo·esfuerzo |')
p('|---|---|---|---|---|---|---|---|')
const totalReloj = suma(reloj) || 1
for (const e of porEtapa(reloj)) p(`| ${e.etapa} | ${mmss(e.total)} | ${Math.round(100 * e.total / totalReloj)} % | ${mmss(e.modelo)} | ${mmss(e.herramienta)} | ${mmss(e.agente)} | ${e.llamadas} | ${[...e.modelos].join(', ')} |`)
p()
p('## Todo el trabajo, con subagentes, por etapa')
p()
p('| Etapa | Tiempo | Modelo | Herramientas | Llamadas | Costo | Modelo·esfuerzo |')
p('|---|---|---|---|---|---|---|')
const filasTrabajo = porEtapa(trabajo)
const tope = reglas.length ? Infinity : 25
for (const e of filasTrabajo.slice(0, tope)) p(`| ${e.etapa} | ${mmss(e.total)} | ${mmss(e.modelo)} | ${mmss(e.herramienta)} | ${e.llamadas} | $${e.costo.toFixed(2)} | ${[...e.modelos].join(', ')} |`)
if (filasTrabajo.length > tope) p(`| (otras ${filasTrabajo.length - tope}) | ${mmss(filasTrabajo.slice(tope).reduce((s, e) => s + e.total, 0))} | | | | | |`)
if (subagentes.length) {
  p()
  p('## Subagentes')
  p()
  p('| Agente | Reloj | Modelo | Herramientas | Llamadas | Costo | Modelo·esfuerzo |')
  p('|---|---|---|---|---|---|---|')
  for (const s of subagentes.sort((a, b) => b.reloj - a.reloj)) {
    const m = s.tramos.filter((x) => x.tipo === 'modelo')
    p(`| ${s.nombre} | ${mmss(s.reloj)} | ${mmss(suma(m))} | ${mmss(suma(s.tramos.filter((x) => x.tipo === 'herramienta')))} | ${m.length} | $${suma(m, (x) => x.costo).toFixed(2)} | ${[...new Set(m.map((x) => x.modelo))].join(', ')} |`)
  }
}
p()
p('## Lo más lento, llamada por llamada')
p()
p(reglas.length ? '| Qué | Etapa | Tiempo |' : '| Qué | Tiempo |')
p(reglas.length ? '|---|---|---|' : '|---|---|')
for (const x of [...todo].filter((x) => x.tipo === 'herramienta' || x.tipo === 'modelo').sort((a, b) => (b.larga ?? b.seg) - (a.larga ?? a.seg)).slice(0, 12)) {
  p(`| ${x.tipo === 'modelo' ? `modelo (${x.modelo}) → ${x.clave}` : x.clave} |${reglas.length ? ` ${nombreEtapa(x)} |` : ''} ${mmss(x.larga ?? x.seg)} |`)
}
if (reglas.length) {
  const sueltas = new Map()
  for (const x of todo.filter((x) => !x.etapa && x.tipo !== 'usuario' && x.tipo !== 'pausa')) sueltas.set(x.clave, (sueltas.get(x.clave) ?? 0) + x.seg)
  if (sueltas.size) {
    p()
    p('## Sin etapa (para afinar etapas.json)')
    p()
    for (const [k, s] of [...sueltas].sort((a, b) => b[1] - a[1]).slice(0, 20)) p(`- ${k}: ${mmss(s)}`)
  }
}
const salida = lineas.join('\n')
console.log(salida)
if (rutaMd) writeFileSync(rutaMd, salida + '\n')
