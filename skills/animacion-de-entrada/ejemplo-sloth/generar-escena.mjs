// El generador de la escena de Sloth, tal cual se usó: arma el SVG de la entrada (`svg4.html`, que va en index.html) y
// los @keyframes que salen de los datos (`kf4.css`, que va al final de splash.css) a partir de los trazos.
//
// Entradas (de la carpeta de trabajo, hechas con los scripts de la primera versión, equivalentes a los de `scripts/`):
//   laptop-paths.json  piezas del perezoso con portátil: band (cabeza), eyeL, eyeR, pupilL, pupilR, nose, arm, dot
//                      (manzana), tail (cola), screen (tapa), base (teclado). Con `trazar-piezas.mjs` hoy son
//                      cabeza, ojoIzq, ojoDer, pupilaIzq, pupilaDer, nariz, brazo, manzana, cola, pantalla, teclado.
//   paths2.json        piezas del logo: band (la «S»), eyeL, eyeR, pupilL, pupilR, nose.
//   lap-band-center.txt / lap-tail-center.txt   líneas centrales de la cabeza y la cola (`centro.mjs`).
//
// Lo que enseña: la escala que pone el dibujo del portátil (1254 px) sobre el logo (512 px) como `matrix(...)`; el par
// de morph de cada pieza (lo mismo que hace `morph.mjs`); la tinta caliente y la punta del pincel reutilizando la línea
// central con `<use>`; las máscaras que descubren los trazos; los clipPath; y el orden de capas de la escena.
import fs from 'node:fs'
import { svgPathProperties } from 'svg-path-properties'
const L = JSON.parse(fs.readFileSync('laptop-paths.json', 'utf8'))
const P = JSON.parse(fs.readFileSync('paths2.json', 'utf8'))
const S = 0.5145, TX = -64.3, TY = -36.2
const M = `matrix(${S} 0 0 ${S} ${TX} ${TY})`
const f = (v) => +v.toFixed(1)
const subpaths = (d) => d.split(/(?=M)/).map((s) => s.trim()).filter(Boolean)
const sample = (d, n) => { const p = new svgPathProperties(d); const len = p.getTotalLength(); return Array.from({ length: n }, (_, i) => { const q = p.getPointAtLength(len * i / n); return [q.x, q.y] }) }
const area = (pts) => pts.reduce((a, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return a + x * y2 - x2 * y }, 0)
function align(a, b) {
  const n = a.length
  if (Math.sign(area(a)) !== Math.sign(area(b))) b = b.slice().reverse()
  let best = 0, bestD = Infinity
  for (let k = 0; k < n; k++) { let d = 0; for (let i = 0; i < n; i += 2) { const p = a[i], q = b[(i + k) % n]; d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 } if (d < bestD) { bestD = d; best = k } }
  return b.map((_, i) => b[(i + best) % n])
}
const smooth = (pts) => {
  const n = pts.length
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d + 'Z'
}
function pair(lap, logo, counts) {
  const a = subpaths(lap), b = subpaths(logo)
  if (a.length !== b.length) throw new Error(`subpaths ${a.length} vs ${b.length}`)
  const from = [], to = []
  a.forEach((sa, i) => {
    const pa = sample(sa, counts[i]).map(([x, y]) => [x * S + TX, y * S + TY])
    const pb = align(pa, sample(b[i], counts[i]))
    from.push(smooth(pa)); to.push(smooth(pb))
  })
  return { from: from.join(''), to: to.join('') }
}
const morph = {
  s: pair(L.band, P.band, [260]),
  izq: pair(L.eyeL, P.eyeL, [110, 44]),
  der: pair(L.eyeR, P.eyeR, [120, 44]),
  nariz: pair(L.nose, P.nose, [72])
}
const bandC = fs.readFileSync('lap-band-center.txt', 'utf8').trim()
const tailC = fs.readFileSync('lap-tail-center.txt', 'utf8').trim()
// The hot ink: three stretches that follow the tip, from the shortest and brightest to the longest and faintest.
const TINTA = [[0.035, 1], [0.09, 0.55], [0.18, 0.25]]
const tinta = (center, cls, pad) => TINTA.map(([l, o], i) =>
  `<use href="#${center}" class="splash-tinta ${cls}-${i + 1}" stroke-dasharray="${l} 3" opacity="${o}" />`).join('\n' + pad)
const chispa = (center, cls, pad) => `<use href="#${center}" class="splash-chispa splash-chispa-halo ${cls}" filter="url(#splash-difuso)" />\n${pad}<use href="#${center}" class="splash-chispa ${cls}" />`
const polvo = [[-46, -22, 5, 190], [-30, -34, 4, 215], [-18, -16, 6, 250], [24, -30, 5, 330], [40, -18, 6, 380], [58, -30, 4, 430], [70, -12, 5, 470]]
  .map(([dx, dy, r, x]) => `<circle cx="${x}" cy="490" r="${r}" style="--dx: ${dx}px; --dy: ${dy}px" />`).join('\n                ')
const svg = `<svg class="splash-logo" viewBox="-30 -20 600 600">
        <defs>
          <path id="splash-centro-cabeza" pathLength="1" d="${bandC}" />
          <path id="splash-centro-cola" pathLength="1" d="${tailC}" />
          <filter id="splash-difuso" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="9" /></filter>
          <radialGradient id="splash-luz-pantalla">
            <stop offset="0" stop-color="#f4b04a" stop-opacity="0.5" />
            <stop offset="1" stop-color="#f4b04a" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="splash-brillo">
            <stop offset="0" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.5" stop-color="#fff" stop-opacity="0.95" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <clipPath id="splash-clip-cabeza"><path d="${L.band}" /></clipPath>
          <clipPath id="splash-clip-cola"><path d="${L.tail}" /></clipPath>
          <clipPath id="splash-clip-logo">
            <path d="${P.band}" />
            <path clip-rule="evenodd" d="${P.eyeL}" />
            <path clip-rule="evenodd" d="${P.eyeR}" />
            <path d="${P.nose}" />
          </clipPath>
          <mask id="splash-trazo-cabeza" maskUnits="userSpaceOnUse" x="-30" y="-20" width="600" height="600">
            <use href="#splash-centro-cabeza" class="splash-trazo splash-trazo-cabeza" transform="${M}" />
            <rect class="splash-revela" x="-30" y="-20" width="600" height="600" />
          </mask>
        </defs>
        <g class="splash-encuadre">
          <g class="splash-camara">
            <ellipse class="splash-luz" cx="400" cy="395" rx="190" ry="160" fill="url(#splash-luz-pantalla)" />
            <g class="splash-mesa">
              <g transform="${M}">
                <mask id="splash-trazo-cola" maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254">
                  <use href="#splash-centro-cola" class="splash-trazo splash-trazo-cola" />
                </mask>
                <path class="splash-cola" mask="url(#splash-trazo-cola)" d="${L.tail}" />
                <g class="splash-tinta-g splash-tinta-g-cola" clip-path="url(#splash-clip-cola)">
                  ${tinta('splash-centro-cola', 'splash-tinta-cola', '                  ')}
                </g>
                <path class="splash-teclado" fill-rule="evenodd" d="${L.base}" />
                <g class="splash-brazo"><path d="${L.arm}" /></g>
                <g class="splash-tapa">
                  <path fill-rule="evenodd" d="${L.screen}" />
                  <path class="splash-manzana" d="${L.dot}" />
                </g>
                ${chispa('splash-centro-cola', 'splash-chispa-cola', '                ')}
              </g>
              <g class="splash-glifos">
                <path class="splash-glifo splash-glifo-1" d="M400 292l20 12-20 12z" />
                <circle class="splash-glifo splash-glifo-2" cx="452" cy="300" r="7" />
                <rect class="splash-glifo splash-glifo-3" x="478" y="296" width="30" height="9" rx="4.5" />
              </g>
              <ellipse class="splash-onda" cx="330" cy="492" rx="190" ry="16" />
              <g class="splash-polvo">
                ${polvo}
              </g>
            </g>
            <g class="splash-cara">
              <path class="splash-s" mask="url(#splash-trazo-cabeza)" d="${morph.s.from}" />
              <g class="splash-tinta-g splash-tinta-g-cabeza" transform="${M}" clip-path="url(#splash-clip-cabeza)">
                ${tinta('splash-centro-cabeza', 'splash-tinta-cabeza', '                ')}
              </g>
              <path class="splash-parche splash-parche-izq" fill-rule="evenodd" d="${morph.izq.from}" />
              <path class="splash-nariz" d="${morph.nariz.from}" />
              <path class="splash-pupila splash-pupila-izq" d="${P.pupilL}" />
              <g class="splash-ojo-der">
                <path class="splash-parche splash-parche-der" fill-rule="evenodd" d="${morph.der.from}" />
                <path class="splash-pupila splash-pupila-der" d="${P.pupilR}" />
                <circle class="splash-parpado" cx="353.5" cy="203.5" r="21" />
                <path class="splash-guino" d="M340 206Q353.5 216 367 206" />
              </g>
              <g clip-path="url(#splash-clip-logo)">
                <rect class="splash-reflejo" x="-320" y="-20" width="170" height="600" fill="url(#splash-brillo)" />
              </g>
            </g>
            <g transform="${M}">
              ${chispa('splash-centro-cabeza', 'splash-chispa-cabeza', '              ')}
            </g>
            <g class="splash-sorpresa">
              <path class="splash-exclama" d="M514 -6L499 58" />
              <circle class="splash-exclama-punto" cx="493" cy="86" r="9" />
              <path class="splash-raya splash-raya-1" pathLength="1" d="M553 20L573 2" />
              <path class="splash-raya splash-raya-2" pathLength="1" d="M462 4L452 -20" />
              <path class="splash-raya splash-raya-3" pathLength="1" d="M560 62L586 62" />
            </g>
            <path class="splash-destello" d="M432 112Q435 133 456 136Q435 139 432 160Q429 139 408 136Q429 133 432 112Z" />
          </g>
        </g>
      </svg>`
fs.writeFileSync('svg4.html', svg)
// The morph targets, and the synced dash offsets for each stretch of hot ink.
let kf = Object.entries(morph).map(([k, m]) => `@keyframes splash-a-logo-${k} { to { d: path("${m.to}"); } }`).join('\n')
kf += '\n' + TINTA.map(([l], i) => `@keyframes splash-tinta-${i + 1} { from { stroke-dashoffset: ${+(l + 0.1).toFixed(3)}; } to { stroke-dashoffset: ${+(l - 1).toFixed(3)}; } }`).join('\n')
fs.writeFileSync('kf4.css', kf)
console.log('svg', svg.length, 'kf', kf.length)
