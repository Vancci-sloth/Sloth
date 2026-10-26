// Vectoriza un dibujo pieza a pieza: separa sus manchas conexas, corta las que se tocan y traza cada una con potrace.
//
//   node trazar-piezas.mjs <dibujo.png> <salida.json> [opciones]
//
//   --canal alfa|luz        Qué es «tinta»: el alfa > 127 (logo con fondo transparente, por defecto) o el brillo > umbral
//                           (líneas claras sobre fondo oscuro, como un PNG plano).
//   --umbral 128            Umbral del brillo con --canal luz.
//   --invertir              Tinta oscura sobre fondo claro (con --canal luz).
//   --min 30                Manchas de menos píxeles se ignoran (ruido).
//   --corte x1,y1,x2,y2,ancho[,pieza]
//                           Borra una franja entre dos puntos para separar dos piezas que se tocan. Sus píxeles van
//                           luego a `pieza` (si se da). Se puede repetir.
//   --pieza nombre=x,y      La mancha bajo (x,y) se llama `nombre`. Se puede repetir; varias pueden dar el mismo nombre.
//   --zona nombre=x0,y0,x1,y1@de
//                           Pasa a `nombre` los píxeles de la pieza `de` dentro del rectángulo: para partir una pieza que
//                           es una sola línea (la cola que acaba en el portátil). Se aplican en orden; se puede repetir.
//   --resto nombre          A qué pieza va lo que no nombra ningún --pieza (por defecto, cada mancha suelta con su id).
//   --mascaras <carpeta>    Guarda la máscara de cada pieza (negro sobre blanco), para `centro.mjs`.
//   --decimales 1           Redondea las coordenadas del trazo.
//
// Sin --pieza, solo lista las manchas (id, píxeles, caja) y traza cada una como `mancha-<id>`: es el primer paso para
// saber qué punto cae en qué pieza.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.join(process.cwd(), 'x.js'))
const { PNG } = require('pngjs')
const potrace = require('potrace')

const [input, output, ...rest] = process.argv.slice(2)
if (!input || !output) {
  console.error('Uso: node trazar-piezas.mjs <dibujo.png> <salida.json> [--canal alfa|luz] [--corte ...] [--pieza nombre=x,y] ...')
  process.exit(1)
}
const opts = { canal: 'alfa', umbral: 128, invertir: false, min: 30, cortes: [], piezas: [], zonas: [], resto: null, mascaras: null, decimales: 1 }
for (let i = 0; i < rest.length; i++) {
  const flag = rest[i]
  const next = () => rest[++i]
  if (flag === '--canal') opts.canal = next()
  else if (flag === '--umbral') opts.umbral = Number(next())
  else if (flag === '--invertir') opts.invertir = true
  else if (flag === '--min') opts.min = Number(next())
  else if (flag === '--corte') { const [x1, y1, x2, y2, ancho, pieza] = next().split(','); opts.cortes.push({ x1: +x1, y1: +y1, x2: +x2, y2: +y2, ancho: +ancho, pieza }) }
  else if (flag === '--pieza') { const [nombre, punto] = next().split('='); const [x, y] = punto.split(',').map(Number); opts.piezas.push({ nombre, x, y }) }
  else if (flag === '--zona') { const [nombre, resto] = next().split('='); const [caja, de] = resto.split('@'); const [x0, y0, x1, y1] = caja.split(',').map(Number); opts.zonas.push({ nombre, de, x0, y0, x1, y1 }) }
  else if (flag === '--resto') opts.resto = next()
  else if (flag === '--mascaras') opts.mascaras = next()
  else if (flag === '--decimales') opts.decimales = Number(next())
  else throw new Error(`Opción desconocida: ${flag}`)
}

const png = PNG.sync.read(fs.readFileSync(input))
const { width: W, height: H, data } = png
const tinta = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) {
  if (opts.canal === 'alfa') tinta[i] = data[i * 4 + 3] > 127 ? 1 : 0
  else {
    const luz = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3
    tinta[i] = (opts.invertir ? luz < opts.umbral : luz > opts.umbral) ? 1 : 0
  }
}

// Los cortes: una franja borrada entre dos puntos; sus píxeles de tinta se recuerdan para dárselos a su pieza.
const cortada = tinta.slice()
const deCorte = new Map()
for (const c of opts.cortes) {
  const pasos = Math.ceil(Math.hypot(c.x2 - c.x1, c.y2 - c.y1))
  for (let k = 0; k <= pasos; k++) {
    const cx = c.x1 + ((c.x2 - c.x1) * k) / pasos, cy = c.y1 + ((c.y2 - c.y1) * k) / pasos
    for (let dy = -c.ancho; dy <= c.ancho; dy++) for (let dx = -c.ancho; dx <= c.ancho; dx++) {
      const x = Math.round(cx + dx), y = Math.round(cy + dy)
      if (x < 0 || y < 0 || x >= W || y >= H || Math.hypot(dx, dy) > c.ancho) continue
      const i = y * W + x
      if (tinta[i]) { cortada[i] = 0; if (c.pieza) deCorte.set(i, c.pieza) }
    }
  }
}

// Las manchas conexas (4 vecinos).
const etiqueta = new Int32Array(W * H)
const manchas = []
for (let i = 0; i < W * H; i++) {
  if (!cortada[i] || etiqueta[i]) continue
  const id = manchas.length + 1
  const pila = [i]
  etiqueta[i] = id
  let cuenta = 0, x0 = W, y0 = H, x1 = 0, y1 = 0
  while (pila.length) {
    const p = pila.pop()
    cuenta++
    const x = p % W, y = (p / W) | 0
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const q = ny * W + nx
      if (cortada[q] && !etiqueta[q]) { etiqueta[q] = id; pila.push(q) }
    }
  }
  manchas.push({ id, pixeles: cuenta, caja: [x0, y0, x1, y1] })
}
const grandes = manchas.filter((m) => m.pixeles >= opts.min)
console.error('Manchas:', grandes.map((m) => `${m.id} (${m.pixeles} px, caja ${m.caja.join(',')})`).join(' · '))

// A qué pieza va cada mancha.
const nombreDe = new Map()
for (const p of opts.piezas) {
  const id = etiqueta[p.y * W + p.x]
  if (!id) throw new Error(`El punto de «${p.nombre}» (${p.x},${p.y}) no cae en tinta: elige otro dentro de la pieza.`)
  nombreDe.set(id, p.nombre)
}
const piezas = new Map()
const pieza = (nombre) => { if (!piezas.has(nombre)) piezas.set(nombre, new Uint8Array(W * H)); return piezas.get(nombre) }
for (let i = 0; i < W * H; i++) {
  const id = etiqueta[i]
  if (id) {
    const m = manchas[id - 1]
    if (m.pixeles < opts.min) continue
    const nombre = nombreDe.get(id) ?? (opts.piezas.length ? opts.resto : null) ?? `mancha-${id}`
    if (nombre) pieza(nombre)[i] = 1
  } else if (deCorte.has(i)) pieza(deCorte.get(i))[i] = 1
}

// Las zonas: parten una pieza por rectángulos.
for (const z of opts.zonas) {
  const de = piezas.get(z.de)
  if (!de) throw new Error(`--zona ${z.nombre}: no hay pieza «${z.de}»`)
  const a = pieza(z.nombre)
  for (let y = Math.max(0, z.y0); y < Math.min(H, z.y1); y++) for (let x = Math.max(0, z.x0); x < Math.min(W, z.x1); x++) {
    const i = y * W + x
    if (de[i]) { de[i] = 0; a[i] = 1 }
  }
}

const trazar = (mascara) => {
  const img = new PNG({ width: W, height: H })
  for (let i = 0; i < W * H; i++) { const v = mascara[i] ? 0 : 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
  const buffer = PNG.sync.write(img)
  return new Promise((resolve, reject) => potrace.trace(buffer, { turdSize: 10, optTolerance: 0.3, threshold: 128 }, (error, svg) => error ? reject(error) : resolve([svg, buffer])))
}

const salida = {}
if (opts.mascaras) fs.mkdirSync(opts.mascaras, { recursive: true })
const redondeo = new RegExp(`\\.(\\d{${opts.decimales}})\\d+`, 'g')
for (const [nombre, mascara] of piezas) {
  const [svg, buffer] = await trazar(mascara)
  salida[nombre] = /d="([^"]+)"/.exec(svg)[1].replace(redondeo, '.$1')
  if (opts.mascaras) fs.writeFileSync(path.join(opts.mascaras, `${nombre}.png`), buffer)
  console.error(`${nombre}: ${salida[nombre].length} caracteres, ${(salida[nombre].match(/M/g) || []).length} subtrazos`)
}
fs.writeFileSync(output, JSON.stringify({ ancho: W, alto: H, piezas: salida }, null, 1))
