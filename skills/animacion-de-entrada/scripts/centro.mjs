// La línea central de una pieza de grosor variable (la «S» de un logo, una cola): por ella avanza el trazo que la dibuja.
//
//   node centro.mjs <mascara.png> <x,y> [paso=14] > centro.txt
//
// <mascara.png> es la de la pieza (negro sobre blanco, la que guarda `trazar-piezas.mjs --mascaras`). <x,y> es un punto
// cerca del extremo por el que empieza a dibujarse: de los extremos del esqueleto se toma el más cercano. `paso` son los
// píxeles entre muestras: más pequeño sigue mejor las curvas cerradas, más grande da un trazo más corto y suave.
//
// Imprime el `d` (Bézier cúbicas por Catmull-Rom) y, por la salida de errores, el medio grosor máximo: el `stroke-width`
// del trazo que la descubre debe ser al menos el doble (y algo más, por los bordes).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.join(process.cwd(), 'x.js'))
const { PNG } = require('pngjs')

const [input, punto, pasoTexto = '14'] = process.argv.slice(2)
if (!input || !punto) {
  console.error('Uso: node centro.mjs <mascara.png> <x,y> [paso]')
  process.exit(1)
}
const [SX, SY] = punto.split(',').map(Number)
const PASO = Number(pasoTexto)
const src = PNG.sync.read(fs.readFileSync(input))
const { width: W, height: H } = src
const m = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) m[i] = src.data[i * 4] < 128 ? 1 : 0

// El grosor: transformada de distancia (chaflán), solo para informar del medio grosor máximo.
const dist = new Float64Array(W * H)
for (let i = 0; i < W * H; i++) dist[i] = m[i] ? 1e9 : 0
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x; if (!m[i]) continue
  if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1)
  if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1)
  if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - W - 1] + 1.414)
  if (x < W - 1 && y > 0) dist[i] = Math.min(dist[i], dist[i - W + 1] + 1.414)
}
for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
  const i = y * W + x; if (!m[i]) continue
  if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1)
  if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1)
  if (x < W - 1 && y < H - 1) dist[i] = Math.min(dist[i], dist[i + W + 1] + 1.414)
  if (x > 0 && y < H - 1) dist[i] = Math.min(dist[i], dist[i + W - 1] + 1.414)
}
let medio = 0
for (let i = 0; i < W * H; i++) if (m[i]) medio = Math.max(medio, dist[i])
console.error('medio grosor máximo', medio.toFixed(1), '→ stroke-width de al menos', Math.ceil(medio * 2 + 6))

// El esqueleto: adelgazamiento de Zhang-Suen.
const s = m.slice()
const P = (x, y) => s[y * W + x]
let cambia = true
while (cambia) {
  cambia = false
  for (const paso of [0, 1]) {
    const borrar = []
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (!P(x, y)) continue
      const n = [P(x, y - 1), P(x + 1, y - 1), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1), P(x - 1, y + 1), P(x - 1, y), P(x - 1, y - 1)]
      const B = n.reduce((a, b) => a + b, 0)
      if (B < 2 || B > 6) continue
      let A = 0
      for (let k = 0; k < 8; k++) if (!n[k] && n[(k + 1) % 8]) A++
      if (A !== 1) continue
      if (paso === 0 ? n[0] * n[2] * n[4] === 0 && n[2] * n[4] * n[6] === 0 : n[0] * n[2] * n[6] === 0 && n[0] * n[4] * n[6] === 0) borrar.push(y * W + x)
    }
    for (const i of borrar) s[i] = 0
    if (borrar.length) cambia = true
  }
}

// El camino más largo desde el extremo más cercano a <x,y>.
const vecinos = (i) => {
  const x = i % W, y = (i / W) | 0, r = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && s[(y + dy) * W + x + dx]) r.push((y + dy) * W + x + dx)
  return r
}
const puntos = []
for (let i = 0; i < W * H; i++) if (s[i]) puntos.push(i)
const extremos = puntos.filter((i) => vecinos(i).length === 1)
console.error('extremos del esqueleto', extremos.map((i) => [i % W, (i / W) | 0]).map((p) => p.join(',')).join(' · '))
if (!extremos.length) throw new Error('El esqueleto no tiene extremos (es un anillo): corta la pieza para abrirla.')
const inicio = extremos.sort((a, b) => Math.hypot(a % W - SX, ((a / W) | 0) - SY) - Math.hypot(b % W - SX, ((b / W) | 0) - SY))[0]
const previo = new Map([[inicio, -1]])
const cola = [inicio]
let ultimo = inicio
while (cola.length) {
  const c = cola.shift()
  ultimo = c
  for (const n of vecinos(c)) if (!previo.has(n)) { previo.set(n, c); cola.push(n) }
}
const camino = []
for (let c = ultimo; c !== -1; c = previo.get(c)) camino.push([c % W, (c / W) | 0])
camino.reverse()
console.error('camino de', camino[0].join(','), 'a', camino.at(-1).join(','), `(${camino.length} px)`)

// Muestras cada PASO píxeles, suavizadas a Bézier.
const muestras = []
for (let k = 0; k < camino.length; k += PASO) muestras.push(camino[k])
if (muestras.at(-1) !== camino.at(-1)) muestras.push(camino.at(-1))
let d = `M${muestras[0][0]},${muestras[0][1]}`
for (let k = 0; k < muestras.length - 1; k++) {
  const p0 = muestras[Math.max(0, k - 1)], p1 = muestras[k], p2 = muestras[k + 1], p3 = muestras[Math.min(muestras.length - 1, k + 2)]
  const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
  const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
  d += ` C${c1.map((v) => v.toFixed(1))} ${c2.map((v) => v.toFixed(1))} ${p2}`
}
console.log(d)
