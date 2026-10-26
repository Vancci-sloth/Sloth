// Prepara pares de formas para un morph de verdad: dos trazos con los mismos comandos, que CSS interpola animando `d`.
//
//   node morph.mjs <desde.json> <hasta.json> <salida.json> --par <pieza-desde>:<pieza-hasta>:<puntos>[,<puntos>...] ...
//                  [--matriz escala,tx,ty] [--css prefijo]
//
// <desde.json> y <hasta.json> son salidas de `trazar-piezas.mjs`. Cada --par empareja una pieza de un dibujo con la del
// otro; `puntos` son las muestras por subtrazo (una cifra por cada `M`: una forma con agujero, como un ojo con su
// pupila hueca, lleva dos). Más puntos, más fiel; 60–260 según el tamaño. Las dos piezas deben tener los mismos
// subtrazos (agujeros incluidos).
//
// --matriz pasa `desde` a las coordenadas de `hasta` (si un dibujo está a otra escala): x·escala+tx, y·escala+ty. Es la
// misma matriz que se pone en el SVG como `transform="matrix(e 0 0 e tx ty)"` para el resto del dibujo.
//
// Cada forma se muestrea a igual distancia, se alinea con la otra (mismo sentido de giro y el desfase con menos
// distancia total, para que no se retuerza al cambiar) y se reescribe como Bézier cerradas.
//
// Escribe {pieza: {desde, hasta}} y, con --css, imprime los @keyframes `<prefijo>-<pieza>` hasta la forma final.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.join(process.cwd(), 'x.js'))
const { svgPathProperties } = require('svg-path-properties')

const [desdeArchivo, hastaArchivo, salida, ...rest] = process.argv.slice(2)
if (!desdeArchivo || !hastaArchivo || !salida) {
  console.error('Uso: node morph.mjs <desde.json> <hasta.json> <salida.json> --par a:b:puntos ... [--matriz e,tx,ty] [--css prefijo]')
  process.exit(1)
}
const pares = []
let matriz = [1, 0, 0]
let css = null
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--par') { const [a, b, puntos] = rest[++i].split(':'); pares.push({ a, b, puntos: puntos.split(',').map(Number) }) }
  else if (rest[i] === '--matriz') matriz = rest[++i].split(',').map(Number)
  else if (rest[i] === '--css') css = rest[++i]
  else throw new Error(`Opción desconocida: ${rest[i]}`)
}
const leer = (archivo) => { const j = JSON.parse(fs.readFileSync(archivo, 'utf8')); return j.piezas ?? j }
const desde = leer(desdeArchivo)
const hasta = leer(hastaArchivo)

const f = (v) => +v.toFixed(1)
const subtrazos = (d) => d.split(/(?=M)/).map((s) => s.trim()).filter(Boolean)
const muestrear = (d, n) => {
  const p = new svgPathProperties(d)
  const largo = p.getTotalLength()
  return Array.from({ length: n }, (_, i) => { const q = p.getPointAtLength((largo * i) / n); return [q.x, q.y] })
}
const area = (pts) => pts.reduce((a, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return a + x * y2 - x2 * y }, 0)
function alinear(a, b) {
  const n = a.length
  if (Math.sign(area(a)) !== Math.sign(area(b))) b = b.slice().reverse()
  let mejor = 0, menor = Infinity
  for (let k = 0; k < n; k++) {
    let d = 0
    for (let i = 0; i < n; i += 2) { const p = a[i], q = b[(i + k) % n]; d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 }
    if (d < menor) { menor = d; mejor = k }
  }
  return b.map((_, i) => b[(i + mejor) % n])
}
const suave = (pts) => {
  const n = pts.length
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d + 'Z'
}

const [escala, tx, ty] = matriz
const resultado = {}
for (const { a, b, puntos } of pares) {
  if (!desde[a]) throw new Error(`No hay «${a}» en ${desdeArchivo}`)
  if (!hasta[b]) throw new Error(`No hay «${b}» en ${hastaArchivo}`)
  const sa = subtrazos(desde[a]), sb = subtrazos(hasta[b])
  if (sa.length !== sb.length) throw new Error(`«${a}» tiene ${sa.length} subtrazos y «${b}» ${sb.length}: deben coincidir (los agujeros también).`)
  if (puntos.length !== sa.length) throw new Error(`«${a}»: da una cifra de puntos por subtrazo (${sa.length}).`)
  const de = [], a_ = []
  sa.forEach((trazo, i) => {
    const pa = muestrear(trazo, puntos[i]).map(([x, y]) => [x * escala + tx, y * escala + ty])
    const pb = alinear(pa, muestrear(sb[i], puntos[i]))
    de.push(suave(pa))
    a_.push(suave(pb))
  })
  resultado[a] = { desde: de.join(''), hasta: a_.join('') }
  console.error(`${a} → ${b}: ${resultado[a].desde.length} caracteres`)
}
fs.writeFileSync(salida, JSON.stringify(resultado, null, 1))
if (css) for (const [pieza, { hasta: d }] of Object.entries(resultado)) console.log(`@keyframes ${css}-${pieza} { to { d: path("${d}"); } }`)
