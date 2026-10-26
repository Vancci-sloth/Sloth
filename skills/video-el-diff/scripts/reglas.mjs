// Revisa el episodio sin renderizarlo: abre su vista en vivo (vivo/), la recorre cada `paso` segundos y mide en la página
// lo que el revisor de hojas encontraba a ojo, una y otra vez:
//   cita chica      lo citado de una captura (lo que está bajo una marca; si no hay marcas, lo que se ve) se ve con
//                   menos de 28 px de letra
//   cita cortada    lo citado queda partido por la orilla de la zona (el resto del texto se desvanece a propósito)
//   cita tapada     algo de encima (la fuente, una etiqueta, un emoji, el sello) cae sobre lo citado
//   marca fuera     un resaltador o una caja roja se sale de la zona
//   bandas          en vertical, una captura a lo ancho que deja bandas vacías arriba y abajo
//   texto cortado   un texto propio (titular, subtítulo, rótulo) queda partido por una orilla
//   texto al borde  un titular a menos de 20 px de la orilla del cuadro
// Lo citado se mide con el texto que `pagina.mjs` guardó dentro de cada captura; las capturas sin él se nombran al final.
//
//   node <skill>/scripts/reglas.mjs [--paso 0.2] [--minimo 0.4] [--desde 0] [--hasta 60] [--json]
//
// Solo cuenta lo que se queda a la vista al menos `--minimo` segundos: lo de una entrada o salida animada no.
//
// Se corre en la raíz del episodio. Sale con 1 si encontró algo. Reparte el recorrido en tramos, un Chrome por tramo
// (hasta 4): el episodio de 6 min tardaba 136 s con uno solo.
import { existsSync, readFileSync, realpathSync, statSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'
import { abrirChrome, procesos, servir } from './web.mjs'

const LETRA_CITADA = 28 // px de letra en el cuadro final: menos ya no se lee en un celular
const BORDE = 20 // px: un titular más pegado a la orilla se ve a ras
const BANDAS = 0.55 // una captura a lo ancho que ocupa menos de esta parte del alto de su zona deja bandas

function opciones(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o[a.slice(2)] = argv[++i]
    else o[a.slice(2)] = true
  }
  return o
}

/** El texto que `pagina.mjs` guardó en un PNG (bloque iTXt `sloth-pagina`), o null. */
function textoDePagina(archivo) {
  const png = readFileSync(archivo)
  for (let i = 8; i < png.length - 12; ) {
    const largo = png.readUInt32BE(i)
    const tipo = png.toString('latin1', i + 4, i + 8)
    if (tipo === 'iTXt') {
      const datos = png.subarray(i + 8, i + 8 + largo)
      const fin = datos.indexOf(0)
      if (datos.toString('latin1', 0, fin) === 'sloth-pagina') {
        // clave \0 comprimido(1) método(1) idioma\0 traducida\0 texto
        let j = fin + 3
        j = datos.indexOf(0, j) + 1
        j = datos.indexOf(0, j) + 1
        const crudo = datos.subarray(j)
        const d = JSON.parse((datos[fin + 1] ? inflateSync(crudo) : crudo).toString('utf8'))
        return png.readUInt32BE(16) === d.ancho && png.readUInt32BE(20) === d.alto ? d : null
      }
    }
    if (tipo === 'IEND') break
    i += 12 + largo
  }
  return null
}

/** Arma vivo/vivo.js si falta o si src/ cambió después. */
function vistaAlDia(raiz) {
  const js = join(raiz, 'vivo', 'vivo.js')
  const masNuevo = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((m, e) =>
    Math.max(m, e.isDirectory() ? masNuevo(join(dir, e.name)) : statSync(join(dir, e.name)).mtimeMs), 0)
  if (!existsSync(join(raiz, 'vivo.mjs'))) throw new Error('Este episodio no tiene vista en vivo (vivo.mjs): cópiala de la plantilla de la skill.')
  if (!existsSync(js) || statSync(js).mtimeMs < masNuevo(join(raiz, 'src'))) execFileSync('node', ['vivo.mjs'], { cwd: raiz, stdio: 'inherit' })
}

/**
 * Corre en la página: mide el cuadro de ahora. `citas` lleva el texto de cada captura (por su ruta en public/).
 * Devuelve los hallazgos de este instante: { regla, que, valor }.
 */
export const MEDIR = `(({ citas, LETRA_CITADA, BORDE, BANDAS }) => {
  const comp = [...document.querySelectorAll('#raiz *')].find((e) => (e.offsetWidth === 1080 && e.offsetHeight === 1920) || (e.offsetWidth === 1920 && e.offsetHeight === 1080))
  if (!comp) return { error: 'no encontré la composición en la vista en vivo' }
  const CW = comp.offsetWidth, CH = comp.offsetHeight
  const cr = comp.getBoundingClientRect(), s = cr.width / CW
  const aComp = (x, y) => [(x - cr.left) / s, (y - cr.top) / s]
  const recortes = new Map()
  // Lo que se ve de un elemento: el corte de los padres que recortan; null si algo lo oculta.
  const vista = (el) => {
    if (recortes.has(el)) return recortes.get(el)
    let v = { l: cr.left, t: cr.top, r: cr.right, b: cr.bottom }
    for (let e = el; e && e !== comp.parentElement; e = e.parentElement) {
      const st = getComputedStyle(e)
      if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.05) { v = null; break }
      if (e !== el && st.overflow !== 'visible') { const q = e.getBoundingClientRect(); v = { l: Math.max(v.l, q.left), t: Math.max(v.t, q.top), r: Math.min(v.r, q.right), b: Math.min(v.b, q.bottom) } }
    }
    recortes.set(el, v)
    return v
  }
  // Cajas como { l, t, r, b }; las del navegador (DOMRect) se pasan por caja().
  const caja = (q) => ({ l: q.left, t: q.top, r: q.right, b: q.bottom })
  const area = (a) => Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t)
  const corte = (a, v) => ({ l: Math.max(a.l, v.l), t: Math.max(a.t, v.t), r: Math.min(a.r, v.r), b: Math.min(a.b, v.b) })
  const out = []
  const grupos = []
  // Lo dibujado de una marca: en una caja roja, su rectángulo, no el <svg> que lo lleva con 20 px de margen (Caja, piezas.tsx).
  const dibujo = (e) => caja((e.tagName === 'svg' ? e.querySelector('rect, ellipse') ?? e : e).getBoundingClientRect())

  // Las capturas: la imagen, y su grupo (la imagen con sus marcas y traducciones, que van dentro o a su lado).
  for (const img of comp.querySelectorAll('img')) {
    const ruta = decodeURIComponent(new URL(img.src, location.href).pathname).replace(/^.*?\\/public\\//, '')
    if (!(ruta in citas)) continue // un emoji, un avatar: no es una captura
    const d = citas[ruta]
    const v = vista(img)
    const grupo = img.parentElement?.parentElement ?? img.parentElement
    if (!v || !area(corte(caja(img.getBoundingClientRect()), v))) continue
    grupos.push(grupo)
    if (d === null) { out.push({ regla: 'sin texto', que: ruta }); continue }
    const ir = img.getBoundingClientRect()
    const k = ir.width / d.ancho
    const visto = corte(caja(ir), v)
    // Bandas: una captura que llena el ancho pero deja la mayor parte del alto de su zona vacía.
    if (CH > CW) {
      // La zona de la escena: el primer padre que recorta y no es la propia caja de la imagen (la que la mueve con la cámara).
      const zona = (() => { for (let e = img.parentElement; e && e !== comp; e = e.parentElement) { const q = e.getBoundingClientRect(); if (getComputedStyle(e).overflow !== 'visible' && Math.abs(q.height - ir.height) > 2 && q.width >= 0.9 * cr.width) return q } return cr })()
      // Con su copia guardada, se arregla sacándola otra vez con lo de alrededor de la frase (--contexto), que llena la
      // zona. Más angosta no: un post de X no baja de 380 px.
      const arreglo = d.copia ? '; sácala con lo de alrededor: pagina.mjs ' + d.copia.split(/[\\\\/]/).slice(-3).join('/') + ' public/' + ruta + ' --contexto' : ''
      if ((visto.r - visto.l) >= 0.9 * zona.width && (visto.b - visto.t) < BANDAS * zona.height) out.push({ regla: 'bandas', que: ruta, valor: Math.round(100 * (visto.b - visto.t) / zona.height) + ' % del alto' + arreglo })
    }
    // Lo citado: las palabras bajo una marca (resaltador o caja) de este grupo. Si en este instante no hay marcas, todo
    // lo que se ve. Lo de alrededor que sigue más allá de la zona se desvanece a propósito (ver CapturaVertical): solo
    // cuenta como cortado lo citado.
    const marcas = [...grupo.children].filter((e) => !e.querySelector('img') && e.tagName !== 'IMG').map(dibujo).filter((q) => q.r - q.l >= 4 && q.b - q.t >= 4)
    const marcada = (b) => { const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2; return marcas.some((m) => cx >= m.l && cx <= m.r && cy >= m.t && cy <= m.b) }
    const texto = (ps) => '«' + ps.slice(0, 6).map((p) => p.t).join(' ') + (ps.length > 6 ? '…' : '') + '»'
    for (const l of d.lineas) {
      const vistas = [], cortadas = [], tapadas = new Map()
      for (const p of l.palabras) {
        const b = { l: ir.left + p.r[0] * k, t: ir.top + p.r[1] * k, r: ir.left + (p.r[0] + p.r[2]) * k, b: ir.top + (p.r[1] + p.r[3]) * k }
        const a = area(b), vis = area(corte(b, v))
        if (!vis) continue
        const citada = !marcas.length || marcada(b)
        if (vis < 0.85 * a) { if (citada && marcas.length) cortadas.push(p); continue }
        if (citada) vistas.push(p)
        const encima = document.elementFromPoint((b.l + b.r) / 2, (b.t + b.b) / 2)
        // Tapado solo cuenta sobre lo citado: un recorte sobre el contador de vistas de un tuit no le quita nada.
        if (citada && encima && !grupo.contains(encima)) {
          const quien = (encima.textContent || encima.getAttribute('src') || encima.tagName).trim().slice(0, 30)
          tapadas.set(quien, [...(tapadas.get(quien) ?? []), p])
        }
      }
      if (cortadas.length) out.push({ regla: 'cita cortada', que: ruta + ' · ' + texto(cortadas) })
      for (const [quien, ps] of tapadas) out.push({ regla: 'cita tapada', que: ruta + ' · ' + texto(ps), valor: 'por «' + quien + '»' })
      const tam = l.letra.tam * k / s
      if (vistas.length && tam < LETRA_CITADA) out.push({ regla: 'cita chica', que: ruta + ' · ' + texto(l.palabras), valor: Math.round(tam) + ' px' })
    }
  }
  // Marcas: resaltadores y cajas del grupo de una captura, fuera de su zona.
  for (const g of grupos) {
    for (const e of g.children) {
      if (e.querySelector('img') || e.tagName === 'IMG') continue
      const q = dibujo(e), v = vista(e)
      if (!v || q.r - q.l < 4 || q.b - q.t < 4) continue
      const a = area(q), vis = area(corte(q, v))
      if (vis && vis < 0.9 * a) out.push({ regla: 'marca fuera', que: 'marca de ' + Math.round((q.r - q.l) / s) + 'x' + Math.round((q.b - q.t) / s) + ' px' })
    }
  }
  // El texto propio: todo lo que no es de una captura.
  const andar = document.createTreeWalker(comp, NodeFilter.SHOW_TEXT)
  const rango = document.createRange()
  for (let n; (n = andar.nextNode()); ) {
    const txt = n.textContent.trim()
    const el = n.parentElement
    if (!txt || !el || grupos.some((g) => g.contains(el))) continue
    const v = vista(el)
    if (!v) continue
    rango.selectNodeContents(n)
    const rs = [...rango.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map(caja)
    const q = el.getBoundingClientRect()
    const esc = el.offsetWidth ? q.width / el.offsetWidth / s : 1
    const tam = parseFloat(getComputedStyle(el).fontSize) * esc
    for (const r of rs) {
      const a = area(r), vis = area(corte(r, v))
      if (!vis) continue
      if (vis < 0.9 * a) { out.push({ regla: 'texto cortado', que: '«' + txt.slice(0, 40) + '»' }); break }
      const [x0] = aComp(r.l, 0), [x1] = aComp(r.r, 0)
      if (tam >= 48 && (x0 < BORDE || x1 > CW - BORDE)) { out.push({ regla: 'texto al borde', que: '«' + txt.slice(0, 40) + '»', valor: Math.round(Math.min(x0, CW - x1)) + ' px' }); break }
    }
  }
  return { hallazgos: out, ancho: CW, alto: CH }
})`

async function main() {
  const o = opciones(process.argv.slice(2))
  const raiz = resolve('.')
  const paso = Number(o.paso ?? 0.2)
  const linea = JSON.parse(readFileSync(join(raiz, 'src', 'timeline.json'), 'utf8'))
  const beats = linea.beats ?? []
  vistaAlDia(raiz)

  // El texto de cada captura de public/ (null si no lo trae: no salió de pagina.mjs o se editó después).
  const citas = {}
  const publico = join(raiz, 'public')
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else if (/\.png$/i.test(e.name)) citas[p.slice(publico.length + 1).replaceAll('\\', '/')] = textoDePagina(p)
    }
  }
  // Las capturas viven en public/web/ (ver MATERIAL.md); lo demás (emojis, avatares, fotos) no se cita.
  if (existsSync(join(publico, 'web'))) recorrer(join(publico, 'web'))

  // Los instantes a medir, en tramos seguidos: cada Chrome recorre el suyo y los hallazgos se juntan en orden, así que lo
  // que cruza de un tramo al otro se agrupa igual que con uno solo.
  const fin = Math.min(Number(o.hasta ?? Infinity), linea.duracion ?? beats.at(-1)?.fin ?? 0)
  const instantes = []
  for (let t = Number(o.desde ?? 0); t <= fin; t += paso) instantes.push(t)
  const n = procesos(Math.ceil(instantes.length / 50))
  const tandas = Array.from({ length: n }, (_, i) => instantes.slice(Math.round((i * instantes.length) / n), Math.round(((i + 1) * instantes.length) / n)))

  const servidor = await servir({ raiz })
  const t0 = Date.now()
  const medir = async (tanda) => {
    const c = await abrirChrome({ ancho: 1080, alto: 1920 })
    const hallazgos = []
    try {
      const cargada = new Promise((r) => c.alEvento('Page.loadEventFired', r))
      await c.enviar('Page.navigate', { url: `${servidor.url}vivo/index.html` })
      await cargada
      // El texto de las capturas va a la página una sola vez (pesa cientos de KB), no en cada medición. Tras el salto,
      // un cuadro basta para que React haya pintado: con dos salía lo mismo y tardaba un tercio más.
      // Saltar al cuadro donde ya está no dispara `frameupdate` ni la respuesta: se espera un cuadro y ya (el primero, el 0,
      // esperaba los 4 s del tope).
      await c.evaluar(`(() => {
        let cuadro = 0
        window.__ir = (t) => new Promise((ok) => {
          const k = Math.round(t * ${linea.fps})
          if (k === cuadro) return requestAnimationFrame(() => ok(t))
          cuadro = k
          const f = (e) => { if (e.data?.vivo === 'tiempo') { removeEventListener('message', f); requestAnimationFrame(() => ok(e.data.t)) } }
          addEventListener('message', f); postMessage({ vivo: 'ir', t }, '*')
          setTimeout(() => { removeEventListener('message', f); ok(null) }, 4000)
        })
        const datos = ${JSON.stringify({ citas, LETRA_CITADA, BORDE, BANDAS })}
        window.__medir = () => ${MEDIR}(datos)
        return true
      })()`)
      for (const t of tanda) {
        await c.evaluar(`window.__ir(${t})`)
        const r = await c.evaluar('window.__medir()')
        if (r.error) throw new Error(r.error)
        for (const h of r.hallazgos) hallazgos.push({ t: +t.toFixed(2), ...h })
      }
    } finally {
      await c.cerrar()
    }
    return hallazgos
  }
  let hallazgos
  try {
    hallazgos = (await Promise.all(tandas.map(medir))).flat()
  } finally {
    servidor.cerrar()
  }

  // Un hallazgo por regla y cosa, con el tramo de tiempo en que se ve y su beat.
  const beatDe = (t) => beats.find((b) => t >= b.inicio && t < b.fin)?.id ?? '—'
  const grupos = []
  for (const h of hallazgos) {
    const g = grupos.findLast((x) => x.regla === h.regla && x.que === h.que && h.t - x.hasta <= paso * 1.5)
    if (g) { g.hasta = h.t; g.valor ??= h.valor } else grupos.push({ regla: h.regla, que: h.que, valor: h.valor, desde: h.t, hasta: h.t, beat: beatDe(h.t) })
  }
  const sinTexto = [...new Set(grupos.filter((g) => g.regla === 'sin texto').map((g) => g.que))]
  // Lo que dura menos que `minimo` es una entrada o una salida animada, no algo que se quede a la vista.
  const minimo = Number(o.minimo ?? 0.4)
  const fallas = grupos.filter((g) => g.regla !== 'sin texto' && g.hasta - g.desde + paso >= minimo)
  const segundos = ((Date.now() - t0) / 1000).toFixed(0)
  if (o.json) console.log(JSON.stringify({ fallas, sinTexto, segundos: +segundos }, null, 1))
  else {
    for (const g of fallas) console.log(`${g.beat.padEnd(5)} ${g.desde.toFixed(1).padStart(6)}–${g.hasta.toFixed(1).padEnd(6)} s  ${g.regla.padEnd(15)} ${g.que}${g.valor ? ` (${g.valor})` : ''}`)
    if (sinTexto.length) console.log(`\nSin el texto de la página (no se revisa lo citado en ellas; hazlas con pagina.mjs): ${sinTexto.join(', ')}`)
    const cuenta = Object.entries(fallas.reduce((m, g) => ({ ...m, [g.regla]: (m[g.regla] ?? 0) + 1 }), {})).map(([r, n]) => `${n} ${r}`).join(', ')
    console.log(`\n${fallas.length ? cuenta : 'Nada que corregir'} · ${segundos} s`)
  }
  process.exit(fallas.length ? 1 : 0)
}

// Por la ruta real: Node carga el script por ella aunque se llame por un enlace (~/.claude/skills es una unión), y con la
// ruta del enlace no coincidía y salía sin hacer nada.
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.message)
    process.exit(2)
  })
