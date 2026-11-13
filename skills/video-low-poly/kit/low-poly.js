// El estilo Low-Poly, dirigido por el plan de un video (window.PLAN, que hacer.py escribe en revision/plan.json a partir
// de momentos.json y de la voz). Es la animación de referencia del estilo con su contenido sacado: el mismo mundo en
// miniatura (la costa, el islote, los montes, el río, el mar que respira, el bosque), la misma paleta, los mismos
// materiales facetados, la misma luz y el mismo acabado; lo que cambia de un video a otro es qué entra en cada lugar,
// cuándo, y por dónde va la cámara. Todo lo que no se decide en cada video (encuadre, foco, sonido, orden de las
// banderas) lo pone este director, y lo mismo de entrada da el mismo video: nada de Math.random, Date ni relojes.
//
// Los lugares (LUGARES) son sitios fijos del mapa con su encuadre. Las cosas (COSAS) se arman en código con primitivas
// facetadas y entran desplegándose faceta por faceta o brotando del suelo con un rebote, como en la referencia.
{
  const P = window.PLAN
  const VERTICAL = P.alto > P.ancho
  const D = P.duracion
  const AVISOS = (window.AVISOS = [])

  // ---------------------------------------------------------------- la paleta (la de la referencia, sin tocar)
  const PAL = {
    seaDeep: '#1f6a80', sea: '#2e8f9c', seaShallow: '#63bfb4', foam: '#e6f5ea', river: '#59b9cc',
    sand: '#ecd3a0', bed: '#c9b99a', grass: '#a5bf66', meadow: '#86ad5c', forest: '#5d9160', pine: '#3f7d62', leaf: '#74a857', ochre: '#e0a646',
    rock: '#a3929b', rockDark: '#857a8c', snow: '#fffbf4', trunk: '#7d5e4e',
    cloud: '#fff8ef', cloudSide: '#f4e7de', cloudBase: '#c8c4dc',
    paper: '#fff6e4', ink: '#22303c', accent: '#e9684a',
    skyTop: '#66a9cf', skyPale: '#f7ead9', haze: '#f8dcc0', sun: '#ffcf99',
  }
  const _hsl = {}
  function tone(hex, key, amount = 1) {
    const c = new THREE.Color(hex); c.getHSL(_hsl)
    return c.setHSL(_hsl.h + (K.hash(key, 1.3) - 0.5) * 0.03 * amount, K.clamp(_hsl.s * (1 + (K.hash(key, 7.7) - 0.5) * 0.22 * amount)), K.clamp(_hsl.l * (1 + (K.hash(key, 13.1) - 0.5) * 0.15 * amount)))
  }

  // ---------------------------------------------------------------- herramientas de facetas (las de la referencia)
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Vector3()
  const vkey = (p, i) => Math.round(p.getX(i) * 500) + ',' + Math.round(p.getY(i) * 500) + ',' + Math.round(p.getZ(i) * 500)
  function jitter(geo, amount, seed = 1) {
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const k = Math.round(p.getX(i) * 500) * 0.731 + Math.round(p.getY(i) * 500) * 1.913 + Math.round(p.getZ(i) * 500) * 3.377 + seed * 17.17
      p.setXYZ(i, p.getX(i) + (K.hash(k, 1) - 0.5) * 2 * amount, p.getY(i) + (K.hash(k, 2) - 0.5) * 2 * amount, p.getZ(i) + (K.hash(k, 3) - 0.5) * 2 * amount)
    }
    return geo
  }
  function facet(src, paint) {
    const g = src.index ? src.toNonIndexed() : src, p = g.attributes.position, pos = [], col = [], nor = [], cen = []
    for (let i = 0; i < p.count; i += 3) {
      _a.fromBufferAttribute(p, i); _b.fromBufferAttribute(p, i + 1); _c.fromBufferAttribute(p, i + 2)
      _n.subVectors(_b, _a).cross(_m.subVectors(_c, _a))
      if (_n.length() < 1e-6) continue
      _n.normalize(); _m.copy(_a).add(_b).add(_c).divideScalar(3)
      const k = paint(_m, _n, i / 3)
      for (const v of [_a, _b, _c]) { pos.push(v.x, v.y, v.z); col.push(k.r, k.g, k.b); nor.push(_n.x, _n.y, _n.z); cen.push(_m.x, _m.y, _m.z) }
    }
    const out = new THREE.BufferGeometry()
    for (const [name, arr] of [['position', pos], ['color', col], ['normal', nor], ['aCen', cen]]) out.setAttribute(name, new THREE.Float32BufferAttribute(arr, 3))
    return out
  }
  function merge(list) {
    const out = new THREE.BufferGeometry()
    for (const name of Object.keys(list[0].attributes)) {
      const size = list[0].attributes[name].itemSize, arr = new Float32Array(list.reduce((s, g) => s + g.attributes[name].array.length, 0))
      let o = 0; for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size))
    }
    return out
  }
  function unfold(geo, { from = [0, 0, 0], speed = 3, duration = 0, start = 0 } = {}) {
    const p = geo.attributes.position, cen = geo.attributes.aCen, n = p.count / 3, edges = new Map(), nb = Array.from({ length: n }, () => [])
    for (let f = 0; f < n; f++) for (let e = 0; e < 3; e++) {
      const k0 = vkey(p, f * 3 + e), k1 = vkey(p, f * 3 + (e + 1) % 3), k = k0 < k1 ? k0 + '|' + k1 : k1 + '|' + k0, o = edges.get(k)
      if (o) { nb[f].push([o.f, e, o.e]); nb[o.f].push([f, o.e, e]) } else edges.set(k, { f, e })
    }
    const born = new Float32Array(n).fill(Infinity), hinge = new Int8Array(n), seen = new Uint8Array(n)
    const dist = (f, x, y, z) => Math.hypot(cen.getX(f * 3) - x, cen.getY(f * 3) - y, cen.getZ(f * 3) - z)
    for (let k = 0; k < n; k++) {
      let f = -1, best = Infinity
      for (let i = 0; i < n; i++) if (!seen[i] && born[i] < best) { best = born[i]; f = i }
      if (f < 0) {
        for (let i = 0; i < n; i++) if (!seen[i]) { const d = dist(i, from[0], from[1], from[2]); if (d < best) { best = d; f = i } }
        born[f] = best / speed
      }
      seen[f] = 1
      for (const [g, , eg] of nb[f]) { const t = born[f] + dist(g, cen.getX(f * 3), cen.getY(f * 3), cen.getZ(f * 3)) / speed; if (!seen[g] && t < born[g]) { born[g] = t; hinge[g] = eg } }
    }
    const last = Math.max(...born), pace = duration ? duration / last : 1
    const A = new Float32Array(n * 9), B = new Float32Array(n * 9), bt = new Float32Array(n * 3)
    for (let f = 0; f < n; f++) {
      _a.fromBufferAttribute(p, f * 3 + (hinge[f] + 1) % 3); _b.fromBufferAttribute(p, f * 3 + hinge[f])
      for (let v = 0; v < 3; v++) { _a.toArray(A, f * 9 + v * 3); _b.toArray(B, f * 9 + v * 3); bt[f * 3 + v] = start + born[f] * pace + K.hash(f, 3.1) * 0.04 }
    }
    geo.setAttribute('aHingeA', new THREE.BufferAttribute(A, 3)); geo.setAttribute('aHingeB', new THREE.BufferAttribute(B, 3)); geo.setAttribute('aBorn', new THREE.BufferAttribute(bt, 1))
    return geo
  }
  const clock = { value: 0 }
  const WAVE = 'float seaWave(vec2 p, float t){ return sin(p.x * 1.25 + t * 1.35) * cos(p.y * 1.05 - t * 1.1) * 0.6 + sin(p.x * 2.7 - p.y * 2.2 + t * 2.3) * 0.4; }\n'
  function faceted(o = {}) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: o.roughness == null ? 0.9 : o.roughness, metalness: 0, side: o.unfold ? THREE.DoubleSide : THREE.FrontSide })
    const uniforms = Object.assign({ uTime: clock, uFold: { value: o.fold || 0.38 } }, o.uniforms || {})
    const patch = (sh, colour) => {
      Object.assign(sh.uniforms, uniforms)
      let head = 'uniform float uTime, uFold; attribute vec3 aCen;\n' + (o.head || ''), body = ''
      if (o.wave) { head += WAVE; body += `transformed.y += seaWave(transformed.xz, uTime) * ${o.wave.toFixed(4)};\n` }
      if (o.unfold) {
        head += 'attribute vec3 aHingeA, aHingeB; attribute float aBorn;\n'
        body += `float fu = clamp((uTime - aBorn) / uFold, 0.0, 1.0);
          float fopen = 1.0 - pow(1.0 - fu, 3.0) + 0.3 * sin(fu * 3.14159) * fu * fu;
          float fang = (1.0 - fopen) * 2.4;
          vec3 fax = normalize(aHingeB - aHingeA), frel = transformed - aHingeA;
          frel = frel * cos(fang) + cross(fax, frel) * sin(fang) + fax * dot(fax, frel) * (1.0 - cos(fang));
          transformed = mix(0.5 * (aHingeA + aHingeB), aHingeA + frel, smoothstep(0.0, 0.45, fu));\n`
      }
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + head).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body)
      if (colour && o.tint) sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n' + o.tint)
    }
    const id = JSON.stringify([o.wave, o.unfold, o.tint, o.head, o.glow])
    m.onBeforeCompile = (sh) => {
      patch(sh, true)
      if (o.glow) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${o.glow.toFixed(3)};`)
    }
    m.customProgramCacheKey = () => 'facet' + id
    if (o.unfold || o.wave) {
      m.depth = new THREE.MeshDepthMaterial({ side: m.side })
      m.depth.onBeforeCompile = (sh) => patch(sh, false); m.depth.customProgramCacheKey = () => 'facetDepth' + id
    }
    return m
  }
  const mesh = (geo, mat, o = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = true; if (mat.depth) m.customDepthMaterial = mat.depth; return m }

  // ---------------------------------------------------------------- el suelo: puntos sueltos y su triangulación
  function scatter([x0, z0, x1, z1], spacing, seed, root = 11) {
    const r = K.rng(seed), out = []
    const cell = (x, z, s) => { if (s > spacing(x + s / 2, z + s / 2)) { const h = s / 2; cell(x, z, h); cell(x + h, z, h); cell(x, z + h, h); cell(x + h, z + h, h) } else out.push([x + s * r.range(0.15, 0.85), z + s * r.range(0.15, 0.85)]) }
    for (let x = x0; x < x1; x += root) for (let z = z0; z < z1; z += root) cell(x, z, root)
    return out
  }
  function triangulate(pts) {
    const n = pts.length, Q = pts.concat([[-4e3, -4e3], [4e3, -4e3], [0, 4e3]])
    const circ = (a, b, c) => {
      const [ax, ay] = Q[a], [bx, by] = Q[b], [cx, cy] = Q[c], d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
      const x = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d, y = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
      return { a, b, c, x, y, r2: (ax - x) * (ax - x) + (ay - y) * (ay - y) }
    }
    let open = [circ(n, n + 1, n + 2)]; const done = []
    for (const i of pts.map((_, k) => k).sort((u, v) => Q[u][0] - Q[v][0])) {
      const [px, py] = Q[i], edge = new Map(), keep = []
      for (const t of open) {
        const dx = px - t.x, dy = py - t.y
        if (dx > 0 && dx * dx > t.r2) { done.push(t); continue }
        if (dx * dx + dy * dy >= t.r2) { keep.push(t); continue }
        for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = u < v ? u * 1e6 + v : v * 1e6 + u; if (edge.has(k)) edge.delete(k); else edge.set(k, [u, v]) }
      }
      open = keep; for (const [u, v] of edge.values()) open.push(circ(u, v, i))
    }
    return done.concat(open).filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c])
  }
  function upward(tris) {
    const pos = []
    for (const [a, b, c] of tris) { const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]); pos.push(...a, ...(up < 0 ? c : b), ...(up < 0 ? b : c)) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }
  const surface = (pts, height) => upward(triangulate(pts).map((tri) => tri.map((i) => [pts[i][0], pts[i][2] == null ? height(pts[i][0], pts[i][1]) : pts[i][2], pts[i][1]])))

  // ---------------------------------------------------------------- las piezas de la referencia
  function rockGeo(seed) {
    const g = jitter(new THREE.IcosahedronGeometry(0.5, 1), 0.11, seed); g.scale(1.15, 0.72, 0.9)
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.12) p.setY(i, -0.12)
    return facet(g, (c, n) => tone(n.y > 0.55 ? PAL.rock : PAL.rockDark, c.x * 31 + c.y * 17 + c.z * 7 + seed))
  }
  function pineGeo(seed, slim = 1) {
    const r = K.rng(seed), parts = []
    const trunk = new THREE.CylinderGeometry(0.04, 0.06, 0.26, 5); trunk.translate(0, 0.13, 0)
    parts.push(facet(trunk, (c) => tone(PAL.trunk, c.x * 9 + c.z * 5 + c.y)))
    ;[[0.33, 0.46, 0.2], [0.25, 0.42, 0.5], [0.165, 0.4, 0.78]].forEach(([rad, h, y], i) => {
      const g = jitter(new THREE.ConeGeometry(rad * slim, h, 6, 1), 0.022, seed + i)
      g.rotateZ(r.range(-0.07, 0.07)); g.rotateY(r.range(0, 6.28)); g.translate(r.range(-0.015, 0.015), y + h / 2, r.range(-0.015, 0.015))
      parts.push(facet(g, (c, n) => tone(PAL.pine, c.x * 13 + c.y * 7 + c.z * 3 + seed, 1).multiplyScalar(n.y < -0.5 ? 0.6 : 1 + i * 0.1)))
    })
    return merge(parts)
  }
  function treeGeo(seed, colour) {
    const parts = [], trunk = new THREE.CylinderGeometry(0.035, 0.055, 0.42, 5); trunk.translate(0, 0.21, 0)
    parts.push(facet(trunk, (c) => tone(PAL.trunk, c.x * 9 + c.z * 5 + c.y)))
    ;[[0, 0.68, 0, 0.36], [0.2, 0.52, 0.08, 0.22]].forEach(([x, y, z, rad], i) => {
      const g = jitter(new THREE.IcosahedronGeometry(rad, 1), rad * 0.16, seed + i * 3); g.scale(1, 0.92, 1); g.translate(x, y, z)
      parts.push(facet(g, (c, n) => tone(colour, c.x * 13 + c.y * 7 + c.z * 3 + seed, 1.2).multiplyScalar(0.92 + 0.14 * n.y)))
    })
    return merge(parts)
  }
  function cloudGeo(puffs, seed) {
    return merge(puffs.map(([x, y, z, rad], i) => {
      const g = jitter(new THREE.IcosahedronGeometry(rad, 1), rad * 0.12, seed + i * 5); g.scale(1, 0.86, 0.92); g.translate(x, y, z)
      const p = g.attributes.position, base = -0.012 * i; for (let k = 0; k < p.count; k++) if (p.getY(k) < base) p.setY(k, base)
      return facet(g, (c, n) => tone(n.y < -0.5 ? PAL.cloudBase : n.y > 0.3 ? PAL.cloud : PAL.cloudSide, c.x * 11 + c.y * 5 + c.z * 3 + seed + i, 0.55))
    }))
  }
  function dropGeo(w, h) { const g = new THREE.OctahedronGeometry(1, 0); g.scale(w, h, w); return facet(g, () => new THREE.Color(1, 1, 1)) }
  function boatGeo() {
    const Q = { bow: [0.36, 0.13, 0], stern: [-0.36, 0.13, 0], l: [0, 0.11, 0.12], r: [0, 0.11, -0.12], keel: [0, -0.05, 0], mast: [0.02, 0.56, 0], s0: [-0.2, 0.14, 0], s1: [0.22, 0.14, 0] }
    const tris = [['bow', 'l', 'keel'], ['l', 'stern', 'keel'], ['stern', 'r', 'keel'], ['r', 'bow', 'keel'], ['bow', 'stern', 'l'], ['bow', 'r', 'stern'], ['s0', 's1', 'mast'], ['s1', 's0', 'mast']]
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((t) => t.flatMap((k) => Q[k])), 3))
    return facet(g, (c, n, i) => tone(i >= 6 ? PAL.accent : PAL.paper, i, 0.6))
  }
  // La bandera de papel en su alfiler: el número en el color de acento, la palabra en tinta. side = 1 cuelga a la derecha.
  function flag(num, word, { height = 1.25, side = 1 } = {}) {
    const FONT = '700 150px "Oswald"', PXH = 250, BH = 0.64, u = BH / PXH, gap = 34, pad = 50, notch = 70
    const meas = document.createElement('canvas').getContext('2d'); meas.font = FONT; meas.letterSpacing = '7px'
    const wn = num ? meas.measureText(String(num)).width : -gap, ww = meas.measureText(word).width, W = Math.ceil(pad + wn + gap + ww + pad + notch)
    const x0 = side > 0 ? pad : notch + pad
    const tex = K.canvasTex(W, PXH, (ctx) => {
      ctx.fillStyle = PAL.paper; ctx.fillRect(0, 0, W, PXH)
      ctx.font = FONT; ctx.letterSpacing = '7px'; ctx.textBaseline = 'alphabetic'
      if (num) { ctx.fillStyle = PAL.accent; ctx.fillText(String(num), x0, PXH / 2 + 60) }
      ctx.fillStyle = PAL.ink; ctx.fillText(word, x0 + wn + gap, PXH / 2 + 60)
    })
    const w = W * u, s = new THREE.Shape()
    s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w - notch * u, BH / 2); s.lineTo(w, BH); s.lineTo(0, BH); s.closePath()
    const sg = new THREE.ShapeGeometry(s), uv = sg.attributes.uv, sp = sg.attributes.position
    for (let i = 0; i < sp.count; i++) { const fx = sp.getX(i) / w; uv.setXY(i, side > 0 ? fx : 1 - fx, sp.getY(i) / BH); if (side < 0) sp.setX(i, -sp.getX(i)) }
    if (side < 0) sg.index.array.reverse()
    const board = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.95, side: THREE.DoubleSide }))
    board.position.set(0, height - BH - 0.05, 0.03); board.castShadow = true; board.receiveShadow = true
    const pg = new THREE.CylinderGeometry(0.02, 0.02, height, 5); pg.translate(0, height / 2, 0)
    const pole = new THREE.Group(), pin = mesh(facet(pg, () => new THREE.Color(PAL.ink)), faceted({ roughness: 0.6 }))
    const head = mesh(facet(new THREE.IcosahedronGeometry(0.075, 0), (c, n, i) => tone(PAL.accent, i, 0.7)), faceted({ roughness: 0.5 })); head.position.y = height + 0.04
    pole.add(pin, head, board)
    const group = new THREE.Group(); group.add(pole)
    // pop(t, t0): el alfiler sale del suelo con un rebote y el papel da la vuelta y se asienta; `fold` (0 a 1) lo dobla
    // otra vez contra el alfiler.
    const pop = (t, t0, fold = 0) => {
      const a = K.spring(t - t0, 2.6, 0.38), b = K.spring(t - t0 - 0.14, 2.1, 0.42)
      // primero se dobla el papel y luego el alfiler se hunde: no queda un palito suelto
      const fp = K.smooth(0, 0.55, fold), fa = K.smooth(0.45, 1, fold)
      group.visible = t > t0 && fold < 0.999; pole.scale.set(1, Math.max(0.001, a * (1 - fa)), 1)
      board.rotation.y = side * ((1 - b) + fp * 0.8) * -1.9; board.scale.set(Math.max(0.001, K.seg(t, t0 + 0.12, t0 + 0.34, K.ease.out) * (1 - fp)), 1, 1)
    }
    return { group, pop, width: w }
  }

  // ---------------------------------------------------------------- piezas nuevas, hechas igual: primitivas movidas, cortadas y facetadas
  // Un prisma de techo a dos aguas, con la cumbrera a lo largo de x.
  function roofGeo(w, h, d) {
    const x = w / 2, z = d / 2, Q = { a: [-x, 0, -z], b: [x, 0, -z], c: [x, 0, z], e: [-x, 0, z], f: [-x, h, 0], g: [x, h, 0] }
    const tris = [['e', 'c', 'g'], ['e', 'g', 'f'], ['b', 'a', 'f'], ['b', 'f', 'g'], ['a', 'e', 'f'], ['c', 'b', 'g']]
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((t) => t.flatMap((k) => Q[k])), 3))
    return geo
  }
  function houseGeo(seed) {
    const r = K.rng(seed), w = r.range(0.4, 0.55), h = r.range(0.28, 0.38), d = r.range(0.34, 0.42)
    const body = jitter(new THREE.BoxGeometry(w, h, d, 1, 1, 1), 0.012, seed); body.translate(0, h / 2, 0)
    const roof = jitter(roofGeo(w + 0.1, r.range(0.2, 0.28), d + 0.1), 0.012, seed + 1); roof.translate(0, h, 0)
    const door = new THREE.BoxGeometry(0.09, 0.15, 0.02); door.translate(r.range(-0.1, 0.1), 0.075, d / 2 + 0.005)
    const win = new THREE.BoxGeometry(0.08, 0.07, 0.02); win.translate(-w * 0.28, h * 0.6, d / 2 + 0.005)
    const wall = r.pick([PAL.paper, PAL.sand, PAL.cloudSide]), top = r.pick([PAL.accent, PAL.accent, PAL.rockDark, PAL.ochre])
    return merge([
      facet(body, (c, n) => tone(wall, c.x * 17 + c.y * 5 + c.z * 9 + seed, 0.7)),
      facet(roof, (c, n) => tone(top, c.x * 7 + c.z * 13 + seed, 0.9).multiplyScalar(n.y > 0 ? 1 : 0.8)),
      facet(door, () => tone(PAL.trunk, seed)), facet(win, () => tone(PAL.ink, seed + 2, 0.4)),
    ])
  }
  function factoryGeo() {
    const parts = []
    const body = jitter(new THREE.BoxGeometry(1.05, 0.46, 0.62, 2, 1, 1), 0.012, 31); body.translate(0, 0.23, 0)
    parts.push(facet(body, (c) => tone(PAL.sand, c.x * 11 + c.y * 3 + c.z * 7, 0.8)))
    for (let i = 0; i < 3; i++) {            // el techo en dientes de sierra
      const t = new THREE.BufferGeometry(), x0 = -0.525 + i * 0.35, x1 = x0 + 0.35, z = 0.31, y = 0.46
      t.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z, x1, y, z, x0, y + 0.2, z, x0, y, -z, x0, y + 0.2, -z, x1, y, -z, x0, y + 0.2, z, x1, y, z, x1, y, -z, x0, y + 0.2, z, x1, y, -z, x0, y + 0.2, -z, x0, y, z, x0, y + 0.2, z, x0, y + 0.2, -z, x0, y, z, x0, y + 0.2, -z, x0, y, -z], 3))
      parts.push(facet(t, (c, n) => tone(n.x > 0.3 ? PAL.skyTop : PAL.rockDark, c.x * 5 + i, 0.6)))
    }
    const chim = jitter(new THREE.CylinderGeometry(0.075, 0.1, 0.95, 7), 0.008, 33); chim.translate(0.36, 0.475, -0.12)
    parts.push(facet(chim, (c) => tone(c.y > 0.82 ? PAL.accent : PAL.rock, c.y * 9 + c.x, 0.6)))
    const door = new THREE.BoxGeometry(0.22, 0.24, 0.02); door.translate(-0.2, 0.12, 0.315)
    parts.push(facet(door, () => tone(PAL.ink, 5, 0.4)))
    return merge(parts)
  }
  function millGeo() {
    const tower = jitter(new THREE.CylinderGeometry(0.11, 0.2, 0.95, 6), 0.01, 41); tower.translate(0, 0.475, 0)
    const cap = jitter(new THREE.ConeGeometry(0.17, 0.24, 6), 0.01, 42); cap.translate(0, 1.07, 0)
    return merge([facet(tower, (c) => tone(PAL.paper, c.y * 13 + c.x * 7, 0.7)), facet(cap, (c) => tone(PAL.accent, c.x * 9 + c.z, 0.7))])
  }
  function bladesGeo() {
    return merge([0, 1, 2, 3].map((i) => {
      const b = new THREE.BoxGeometry(0.075, 0.52, 0.015); b.translate(0.02, 0.3, 0); b.rotateZ(i * Math.PI / 2)
      return facet(b, (c) => tone(i % 2 ? PAL.cloudSide : PAL.paper, i * 3 + c.y, 0.5))
    }))
  }
  function truckGeo() {
    const cab = jitter(new THREE.BoxGeometry(0.2, 0.2, 0.22), 0.006, 51); cab.translate(0.2, 0.15, 0)
    const box = jitter(new THREE.BoxGeometry(0.4, 0.26, 0.25), 0.006, 52); box.translate(-0.11, 0.18, 0)
    const glass = new THREE.BoxGeometry(0.02, 0.08, 0.17); glass.translate(0.305, 0.19, 0)
    return merge([facet(cab, (c) => tone(PAL.accent, c.x * 9 + c.y * 3, 0.6)), facet(box, (c) => tone(PAL.paper, c.x * 7 + c.z * 3, 0.6)), facet(glass, () => tone(PAL.skyTop, 1, 0.3))])
  }
  function wheelGeo() { const g = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 7); g.rotateX(Math.PI / 2); return facet(g, (c, n, i) => tone(PAL.ink, i, 0.4)) }
  function lighthouseGeo() {
    const tower = jitter(new THREE.CylinderGeometry(0.1, 0.17, 0.95, 8, 4), 0.006, 61); tower.translate(0, 0.475, 0)
    const cap = new THREE.ConeGeometry(0.15, 0.18, 8); cap.translate(0, 1.15, 0)
    const deck = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 8); deck.translate(0, 0.97, 0)
    return merge([facet(tower, (c) => tone(Math.floor(c.y / 0.24) % 2 ? PAL.accent : PAL.paper, c.y * 11 + c.x, 0.5)), facet(cap, (c) => tone(PAL.accent, c.x + 3, 0.5)), facet(deck, () => tone(PAL.ink, 7, 0.3))])
  }
  function lampGeo() { return facet(new THREE.IcosahedronGeometry(0.09, 0), (c, n, i) => tone(PAL.sun, i, 0.4)) }
  function sproutGeo(seed) {
    const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.7, 5); stem.translate(0, 0.35, 0)
    const parts = [facet(stem, (c) => tone(PAL.meadow, c.y * 9, 0.6))]
    ;[[0.62, 0.0, 1], [0.42, 2.3, 0.85], [0.26, 4.2, 0.7]].forEach(([y, a, s], i) => {
      const leaf = jitter(new THREE.OctahedronGeometry(0.16 * s, 0), 0.01, seed + i); leaf.scale(1.6, 0.35, 0.8); leaf.translate(0.16 * s, 0, 0); leaf.rotateZ(0.35); leaf.rotateY(a); leaf.translate(0, y, 0)
      parts.push(facet(leaf, (c, n) => tone(PAL.leaf, c.x * 13 + c.z * 5 + i, 1).multiplyScalar(0.92 + 0.14 * n.y)))
    })
    const bud = jitter(new THREE.IcosahedronGeometry(0.09, 0), 0.01, seed + 7); bud.translate(0, 0.74, 0)
    parts.push(facet(bud, (c, n, i) => tone(PAL.ochre, i + seed, 0.6)))
    return merge(parts)
  }
  function plankGeo() { const g = new THREE.BoxGeometry(0.16, 0.035, 0.5); return facet(jitter(g, 0.006, 71), (c, n, i) => tone(PAL.trunk, i, 0.8).multiplyScalar(n.y > 0.5 ? 1.15 : 0.85)) }
  function puffGeo() { return facet(new THREE.IcosahedronGeometry(1, 0), (c, n, i) => tone(n.y > 0.2 ? PAL.cloudSide : PAL.cloudBase, i, 0.4)) }

  registerStyle({
    id: 'low-poly',
    name: 'Low-Poly',
    duration: D,
    fonts: ['700 150px "Oswald"'],
    // El acabado de la referencia, igual en los dos formatos (el mismo lente largo también en vertical: la cámara se aleja).
    render: { samples: 64, shutter: 0.4, tone: 'neutral', exposure: 1.0, bloom: 0.35, bloomThreshold: 1.25, vignette: 0.22, grain: 0.014, fov: 30, background: PAL.haze, far: 400 },

    build(S) {
      const { scene, camera } = S
      const N = K.noise(7), smooth = K.smooth

      // ------------------------------------------------------------ el lugar: el de la referencia, a mano
      const PEAKS = [[3.6, -2.0, 3.9, 4.0], [6.6, -0.9, 2.7, 3.0], [0.6, -5.4, 3.0, 3.6], [9.5, -5.0, 4.4, 4.6], [-2.0, -10, 2.4, 4.5],
        [5, -15, 6.0, 8], [16, -9, 5.5, 7], [-6, -24, 6.5, 10], [22, -22, 8, 12], [14, 3, 2.6, 5], [24, 0, 5, 8]]
      const ISLES = [[-4.7, 1.9, 0.78, 1.5], [-13, -9, 2.6, 4.2], [-24, -22, 5.5, 9], [-17, -15.5, 1.5, 2.6], [-40, -34, 8, 14]]
      const peak = (x, z, p, i) => {
        const dx = x - p[0], dz = z - p[1], a = Math.atan2(dz, dx)
        const r = p[3] * (1 + 0.17 * Math.sin(a * 3 + i * 1.9) + 0.09 * Math.sin(a * 5 + i * 3.1) + 0.05 * Math.sin(a * 9 + i))
        return p[2] * Math.pow(Math.max(0, 1 - Math.hypot(dx, dz) / r), 1.35)
      }
      const smin = (a, b, k) => { const h = K.clamp(0.5 + 0.5 * (b - a) / k); return K.lerp(b, a, h) - k * h * (1 - h) }
      const coast = (x, z) => smin(x - (-2.9 + 0.22 * z + 0.35 * Math.sin(z * 0.8 + 0.6)), 5.9 + 0.4 * Math.sin(x * 0.6 + 1) - z, 2) + 0.3 * N.fbm(x * 0.35, z * 0.35, 0, 3)
      const natural = (x, z) => {
        const d = coast(x, z)
        let m = 0; PEAKS.forEach((p, i) => { m += Math.pow(peak(x, z, p, i), 4) }); m = Math.pow(m, 0.25)
        let h = d > 0 ? 0.08 + 0.5 * (1 - Math.exp(-d * 0.45)) + 0.015 * d + m * smooth(0.2, 2.6, d) + N.fbm(x * 0.6, z * 0.6, 1, 3) * (0.1 + 0.3 * smooth(0.3, 1.6, m)) * smooth(0, 1, d) : Math.max(-1.7, d * 0.55)
        ISLES.forEach((p, i) => { h = Math.max(h, peak(x, z, p, i + 20) - 0.3) })
        return h
      }
      const RIVER = [[2.9, -0.8], [2.15, 0.2], [1.2, 0.3], [0.45, 1.15], [-0.75, 1.0], [-1.5, 1.95], [-2.3, 2.3], [-2.75, 2.5]]
      const river = (() => {
        const curve = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), n = 140, pts = curve.getSpacedPoints(n)
        let y = pts.map((p) => natural(p.x, p.z))
        for (let i = 1; i <= n; i++) y[i] = Math.min(y[i], y[i - 1])
        y = y.map((v, i) => K.lerp(v, 0.0, smooth(0.72, 0.97, i / n)))
        for (let k = 0; k < 6; k++) y = y.map((v, i) => (y[Math.max(0, i - 1)] + v + y[Math.min(n, i + 1)]) / 3)
        const rows = pts.map((p, i) => { const tg = curve.getTangentAt(i / n); return { x: p.x, z: p.z, y: y[i] + 0.03, s: i / n, w: 0.13 + 0.22 * (i / n), nx: -tg.z, nz: tg.x } })
        const near = (x, z) => { let best = rows[0], bd = Infinity; for (const r of rows) { const d = (r.x - x) * (r.x - x) + (r.z - z) * (r.z - z); if (d < bd) { bd = d; best = r } } return { d: Math.sqrt(bd), row: best } }
        return { rows, near, n }
      })()
      const height = (x, z) => {
        const h = natural(x, z), { d, row } = river.near(x, z)
        return d > row.w + 1.7 || h < 0 ? h : Math.max(Math.min(h, 0.02), K.lerp(row.y + 0.1, h, smooth(row.w + 0.24, row.w + 1.7, d)))
      }
      const MOUTH = river.rows[Math.round(river.n * 0.93)]

      // ------------------------------------------------------------ los lugares del mapa, cada uno con su encuadre
      // Los de la referencia (`ref`) traen, en horizontal, sus `tomas`: los puntos de su grúa, cada uno a tantos segundos
      // de que empieza lo suyo, y `enfoca`: cuándo pasa el foco a ellos (null: el río no lo mueve).
      // suelo: dónde se ponen las cosas; alto: dónde flota su nube; bandera: dónde se clava y hacia qué lado cuelga;
      // cam: de dónde la mira la cámara y a qué apunta (en horizontal; en vertical se aleja para que quepa); foco: lo nítido.
      const LUGARES = {
        // `cam2`: si en la costa o en la llanura ya hay cosas, el mar se mira desde el oeste para que no estorben delante.
        mar: { ref: true, suelo: [-4.2, 0.6], alto: [-3.5, 3.75, -0.7], agua: true, bandera: { at: [-4.95, 1.95], yaw: 0.25, height: 1.3 }, cam: { pos: [-0.9, 1.2, 9.0], aim: [-3.8, 1.45, 1.6] }, cam2: { pos: [-6.6, 1.9, 8.6], aim: [-4.3, 1.3, 1.5] }, evita: ['costa', 'llanura'], foco: [-3.8, 1.3, 1.9], barco: [[-6.4, 0.2], [-5.6, 3.3]],
          tomas: [{ en: 0.7, pos: [-0.9, 1.2, 9.0], aim: [-3.8, 1.45, 1.6] }], enfoca: [-0.2, 1.0] },
        cielo: { ref: true, suelo: [-3.5, -0.7], alto: [-3.5, 3.75, -0.7], aire: true, bandera: { nube: true, at: [-1.35, 0.1], yaw: 0, height: 1.35 }, cam: { pos: [-2.4, 4.3, 7.6], aim: [-3.1, 4.7, -0.5] }, foco: [-3.2, 4.6, -0.6],
          tomas: [{ en: 0.3, pos: [-1.4, 2.3, 10.6], aim: [-3.7, 2.7, 0.8] }, { en: 1.6, pos: [-2.4, 4.3, 7.6], aim: [-3.1, 4.7, -0.5] }], enfoca: [0.1, 1.3] },
        montaña: { ref: true, suelo: [4.3, -0.3], alto: [3.3, 4.3, -1.0], bandera: { at: [5.95, 1.2], yaw: -0.05, height: 1.4, side: -1 }, cam: { pos: [2.8, 4.6, 9.6], aim: [3.1, 3.8, -0.4] }, foco: [4.4, 2.6, 1.2],
          tomas: [{ en: 0.3, pos: [2.8, 4.6, 9.6], aim: [3.1, 3.8, -0.4] }, { en: 1.2, pos: [4.0, 3.8, 10.8], aim: [3.9, 2.8, 0.4] }], enfoca: [-0.6, 0.5] },
        rio: { ref: true, suelo: [2.2, 1.7], alto: [0.1, 4.75, -1.6], bandera: { at: [0.9, 3.6], yaw: 0, height: 1.0 }, cam: { pos: [1.6, 4.8, 13.4], aim: [0.7, 2.3, 0.8] }, foco: [0.9, 0.9, 3.6],
          tomas: [{ en: 1.7, pos: [1.6, 4.8, 13.4], aim: [0.7, 2.3, 0.8] }], enfoca: null },
        // Los tres del frente, uno junto a otro de oeste a este; cada bandera cuelga hacia fuera de lo suyo (`dir`: hacia
        // dónde se ponen las cosas, del lado contrario a su papel).
        costa: { suelo: [-1.45, 3.75], huecos: [[-1.45, 3.75], [-0.75, 2.75], [-1.9, 2.75], [-0.3, 3.5]], alto: [-2.2, 4.2, 1.6], bandera: { at: [-0.2, 4.15], yaw: 0, height: 1.2 }, cam: { pos: [-1.6, 3.4, 10.9], aim: [-1.3, 0.6, 3.6] }, foco: [-1.3, 0.6, 3.8], barco: [[-4.3, 4.6], [-2.95, 3.55]] },
        llanura: { suelo: [2.6, 4.5], alto: [2.4, 4.3, 2.4], dir: 1, bandera: { at: [1.25, 5.0], yaw: 0, height: 1.1, side: -1 }, cam: { pos: [2.6, 3.4, 11.4], aim: [2.3, 0.7, 4.4] }, foco: [2.6, 0.6, 4.4] },
        valle: { suelo: [6.7, 3.4], alto: [6.6, 4.4, 1.5], dir: -1, bandera: { at: [8.0, 3.95], yaw: -0.05, height: 1.15 }, cam: { pos: [6.6, 3.6, 10.4], aim: [6.9, 0.9, 3.4] }, foco: [6.8, 0.8, 3.5] },
        bosque: { suelo: [8.6, -0.4], alto: [8.0, 5.0, -2.0], dir: 1, bandera: { at: [7.2, 1.4], yaw: -0.1, height: 1.3, side: -1 }, cam: { pos: [7.6, 4.8, 7.6], aim: [8.2, 1.9, -0.3] }, foco: [8.2, 1.6, 0.2] },
        // En vertical, el mundo entero se mira desde el mar del oeste: lo largo del mapa (de la costa a los montes) queda a
        // lo alto del cuadro, y las banderas se vuelven hacia la cámara.
        todo: { ref: true, cam: VERTICAL ? { pos: [-11.5, 9.5, 4.2], aim: [1.6, 0.9, 2.4] } : { pos: [0.2, 5.4, 14.3], aim: [0.1, 2.7, 0] }, foco: VERTICAL ? [1.6, 0.9, 2.4] : [0.1, 2.2, 0.8], ap: 0.05,
          tomas: [{ en: 0.65, pos: [0.35, 5.25, 14.0], aim: [0.1, 2.65, 0] }, { en: 'fin', pos: [0.2, 5.4, 14.3], aim: [0.1, 2.7, 0] }], enfoca: [-1.45, 0.45] },
      }
      const lugar = (n) => LUGARES[n] || LUGARES.todo
      // Delante del suelo de un lugar, donde para lo que llega (el camión) sin pisar sus cosas.
      const parada = (L) => [L.suelo[0], L.suelo[1] + 1.1]
      // Los huecos de un lugar para sus cosas: el primero en su suelo y los demás hacia `dir`, lejos de su bandera.
      const sitio = (L, k = 0) => { if (L.huecos) return L.huecos[k % L.huecos.length]; const s = L.dir || 1, off = [[0, 0], [1.75 * s, -0.25], [0.6 * s, -1.3], [-1.0 * s, -1.15], [2.6 * s, -1.2]][k % 5]; return [L.suelo[0] + off[0], L.suelo[1] + off[1]] }

      // ------------------------------------------------------------ el plan: qué entra, dónde y cuándo
      // El primer momento ya está en el primer cuadro (su bandera y sus cosas): el primer cuadro ya vale la pena.
      const MOM = P.momentos.map((m, i) => Object.assign({}, m, { t0: i === 0 ? -9 : m.t, fin: i + 1 < P.momentos.length ? P.momentos[i + 1].t : D }))
      const ENTRAN = [], ocupados = {}
      MOM.forEach((m, i) => (m.entra || []).forEach((e) => {
        const k = ocupados[m.en] = (ocupados[m.en] || 0) + (['vapor', 'nube', 'lluvia', 'anillo', 'rio', 'barco'].includes(e.tipo) ? 0 : 1)
        ENTRAN.push(Object.assign({ en: m.en, t: m.t0, fin: m.fin, i, hueco: k - 1 }, e))
      }))
      const de = (tipo) => ENTRAN.filter((e) => e.tipo === tipo)
      const usados = new Set(MOM.map((m) => m.en))

      // ------------------------------------------------------------ luz, cielo y bruma (los de la referencia)
      const SUN = new THREE.Vector3(-0.78, 0.4, 0.3).normalize()
      K.env(S, { top: '#7db7dd', horizon: '#ffe2c4', bottom: '#8fa98a', intensity: 0.55, panels: [{ pos: [SUN.x * 30, SUN.y * 30, SUN.z * 30], size: [10, 10], color: PAL.sun, power: 14, round: true }] })
      K.sun(S, { pos: [SUN.x * 45, SUN.y * 45, SUN.z * 45], target: [0, 0, 0], color: '#ffe0ba', power: 3.5, size: 15, soft: 2.2, mapSize: 4096, far: 110, normalBias: 0.03 })
      K.skyLight(S, { color: '#a9c9ff', power: 0.9, size: 13, center: [0, 1, 0], mapSize: 2048, spread: 0.9 })
      scene.fog = new THREE.Fog(PAL.haze, 12, 56)
      const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color(PAL.skyTop) }, pale: { value: new THREE.Color(PAL.skyPale) }, haze: { value: new THREE.Color(PAL.haze) }, sunC: { value: new THREE.Color(PAL.sun) }, sunDir: { value: SUN } },
        vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec3 vD; uniform vec3 top, haze, pale, sunC, sunDir;
          void main(){ vec3 d = normalize(vD); float s = max(dot(d, sunDir), 0.0);
            float y = max(d.y, 0.0);
            vec3 c = mix(mix(haze, pale, smoothstep(0.0, 0.12, y)), top, smoothstep(0.06, 0.5, y));
            c += sunC * (pow(s, 5.0) * 0.35 + pow(s, 40.0) * 0.8 + smoothstep(0.9988, 0.9992, s) * 5.0);
            gl_FragColor = vec4(c, 1.0); }`,
      }))
      scene.add(sky)

      // ------------------------------------------------------------ la tierra
      const hero = (x, z) => Math.max(Math.abs(x - 0.5) - 8.5, -7 - z, z - 8.5, 0)
      const landPts = scatter([-55, -77, 55, 11], (x, z) => 0.69 * (1 + hero(x, z) * 0.2), 3).filter(([x, z]) => river.near(x, z).d > river.near(x, z).row.w + 0.5)
      PEAKS.concat(ISLES).forEach((p) => landPts.push([p[0], p[1]]))
      river.rows.forEach((r, i) => {
        if (i % 3 || natural(r.x, r.z) < 0.03) return
        const j = (K.hash(i, 1) - 0.5) * 0.06
        for (const [k, dy] of [[0, -0.13], [-1, -0.08], [1, -0.08], [-1.9, 0.11], [1.9, 0.11]]) { const off = k * r.w + Math.sign(k) * (Math.abs(k) > 1 ? 0.24 - 0.9 * r.w : 0); landPts.push([r.x + r.nx * off + j, r.z + r.nz * off - j, r.y + dy]) }
      })
      const paintLand = (c, n) => {
        const key = c.x * 12.9898 + c.z * 78.233 + c.y * 37.7, j = K.hash(key, 5) - 0.5, { d, row } = river.near(c.x, c.z)
        let name
        if (d < row.w + 0.1 && c.y < row.y + 0.02) name = 'bed'
        else if (c.y < 0.15 + j * 0.08) name = 'sand'
        else if (c.y > 2.75 + j * 0.5 && n.y > 0.5) name = 'snow'
        else if (n.y < 0.76 + j * 0.06 || c.y > 2.4) name = K.hash(key, 9) < 0.6 ? 'rock' : 'rockDark'
        else if (c.y > 1.2 + j * 0.5) name = 'forest'
        else name = N.fbm(c.x * 0.3, c.z * 0.3, 3, 2) > 0.02 ? 'meadow' : 'grass'
        return tone(PAL[name], key, name === 'snow' ? 0.35 : 1)
      }
      scene.add(mesh(facet(surface(landPts, height), paintLand), faceted()))

      // ------------------------------------------------------------ el mar, con el anillo de la llegada si lo hay
      const anillo = de('anillo')[0]
      const ringAt = anillo ? (anillo.en === 'mar' ? [LUGARES.mar.bandera.at[0] + 0.4, LUGARES.mar.bandera.at[1] - 0.2] : [MOUTH.x, MOUTH.z]) : [0, 0]
      const seaPts = scatter([-121, -121, 99, 33], (x, z) => 0.69 * (1 + hero(x, z) * 0.25), 5)
      const paintSea = (c) => {
        const depth = -height(c.x, c.z), key = c.x * 3.1 + c.z * 7.7
        return tone(depth < 0.055 ? PAL.foam : depth < 0.36 ? PAL.seaShallow : depth < 1.0 ? PAL.sea : PAL.seaDeep, key, 1.1)
      }
      scene.add(mesh(facet(surface(seaPts, () => 0), paintSea), faceted({ roughness: 0.3, wave: 0.075,
        uniforms: { uRing: { value: new THREE.Vector3(ringAt[0], ringAt[1], anillo ? anillo.t : 1e6) } }, head: 'uniform vec3 uRing;\n',
        tint: 'float rd = distance(aCen.xz, uRing.xy), rt = (uTime - uRing.z) * 2.6; vColor.rgb = mix(vColor.rgb, vec3(0.75, 0.95, 0.93), 0.75 * smoothstep(0.55, 0.0, abs(rd - rt)) * step(0.0, rt) * smoothstep(5.5, 1.0, rt));' }), { cast: false }))

      // ------------------------------------------------------------ el río: se despliega río abajo si entra en un momento; si no, ya corre
      const rioE = de('rio')[0], RIO_T = rioE ? rioE.t : -12, RIO_DUR = 1.9
      const BANK_TREES = Array.from({ length: 13 }, (_, i) => { const s = 0.3 + i * 0.05; return { s, t: rioE ? RIO_T + s * RIO_DUR + 0.16 : -9 } })
      {
        const rows = river.rows.filter((_, i) => i % 2 === 0), tris = []
        const at = (r, k, i) => { const inner = k === 1 || k === 2, j = inner ? (K.hash(i, k) - 0.5) * 0.09 : 0, off = [-1, -0.36, 0.36, 1][k] * (r.w + 0.2); return [r.x + r.nx * off + r.nz * j, r.y + (inner ? (K.hash(i, k + 5) - 0.5) * 0.02 : 0), r.z + r.nz * off - r.nx * j] }
        for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < 3; k++) {
          const a = at(rows[i], k, i), b = at(rows[i], k + 1, i), c = at(rows[i + 1], k, i + 1), d = at(rows[i + 1], k + 1, i + 1)
          if ((i + k) % 2) tris.push([a, b, c], [b, d, c]); else tris.push([a, b, d], [a, d, c])
        }
        const g = unfold(facet(upward(tris), (c) => tone(PAL.river, c.x * 5.3 + c.z * 9.1, 1.3)), { from: [river.rows[0].x, river.rows[0].y, river.rows[0].z], duration: RIO_DUR, start: RIO_T })
        scene.add(mesh(g, faceted({ roughness: 0.35, unfold: true, fold: 0.3,
          tint: 'float fl = fract((aCen.x * 0.9 - aCen.z * 0.5) * 0.9 + uTime * 1.3 + fract(aCen.x * 37.0 + aCen.z * 17.0) * 0.4); vColor.rgb = mix(vColor.rgb, vec3(0.86, 0.97, 0.96), 0.5 * smoothstep(0.7, 0.85, fl) * smoothstep(1.0, 0.85, fl));' }), { cast: false }))
      }

      // ------------------------------------------------------------ las banderas: una por cada momento que la trae, numeradas en orden
      const yaHay = {}
      // Las banderas se planean aquí y se arman después del barquito, donde las arma la referencia: three.js dibuja por
      // el orden de los materiales, y donde una gota o un árbol atraviesa el papel gana el último en dibujarse.
      const anchoBandera = (num, word) => {
        const meas = document.createElement('canvas').getContext('2d'); meas.font = '700 150px "Oswald"'; meas.letterSpacing = '7px'
        const wn = num ? meas.measureText(String(num)).width : -34
        return Math.ceil(50 + wn + 34 + meas.measureText(word).width + 50 + 70) * (0.64 / 250)
      }
      const BANDERAS = MOM.filter((m) => m.bandera).map((m, k) => {
        const L = lugar(m.en), num = k + 1, texto = String(m.bandera).toUpperCase()
        // La segunda de un mismo lugar va en el mismo sitio, casi un metro más arriba: un poste de señales.
        const piso = (yaHay[m.en] = (yaHay[m.en] || 0) + 1) - 1, sube = piso * 0.95
        // En vertical, la de un lugar con cosas va detrás de ellas, más alta y centrada encima: el cuadro es alto y no
        // cabe de lado. En horizontal (y en el mar, el cielo, el monte y el río), donde la puso la referencia.
        if (VERTICAL && (L.dir || L.huecos)) {
          const alto = P.momentos.some((o) => o.en === m.en && (o.entra || []).some((e) => ['fabrica', 'molino', 'faro', 'planta'].includes(e.tipo)))
          const B = { height: (alto ? 2.6 : 2.0) + sube, side: 1, yaw: 0 }, f = { width: anchoBandera(num, texto) }, [cx, cz] = sitio(L, 0)
          B.at = [cx - f.width / 2 + piso * 0.12, cz - 1.0 - piso * 0.05]
          return { m, L, B, f, num, texto, t: m.t0 < 0 ? -9 : m.t0 }
        }
        const B = piso ? Object.assign({}, L.bandera, { height: (L.bandera.height || 1.25) + sube, at: [L.bandera.at[0] + piso * 0.12 * (L.bandera.side || 1), L.bandera.at[1] - piso * 0.05] }) : L.bandera
        return { m, L, B, f: { width: anchoBandera(num, texto) }, num, texto, t: m.t0 < 0 ? -9 : m.t0 }
      })
      // Lo que no puede crecer encima de una bandera ni de una cosa: su frente y su sitio.
      const LIBRES = []
      BANDERAS.forEach(({ B, L }) => { if (!B.nube && !L.ref) LIBRES.push([B.at[0] + (B.side || 1) * 1.1, B.at[1] + 0.9, 1.6]) })
      ENTRAN.forEach((e) => { if (!['vapor', 'nube', 'lluvia', 'anillo', 'rio', 'barco', 'puente'].includes(e.tipo) && !(e.tipo === 'faro' && e.en === 'mar')) { const [x, z] = sitio(lugar(e.en), e.hueco); LIBRES.push([x, z, { cultivo: 1.9, fabrica: 1.4, casas: 1.6 }[e.tipo] || 0.9]) } })
      de('camion').forEach((e) => { const a = sitio(lugar(e.en), e.hueco), b = parada(lugar(e.a)); for (let u = 0; u <= 1; u += 0.1) LIBRES.push([K.lerp(a[0], b[0], u), K.lerp(a[1], b[1], u), 0.45]) })
      const libre = (x, z) => !LIBRES.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)
      const clear = (x, z) => (usados.has('montaña') && x > 1.9 && x < 6.3 && z > 0.9 && z < 3.4) || (usados.has('rio') && x > 0.5 && x < 4.3 && z > 3.2 && z < 6.5) || LIBRES.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)

      // ------------------------------------------------------------ árboles y rocas, por reglas (los de la referencia), y las arboledas que entran
      const slope = (x, z) => Math.hypot(height(x + 0.2, z) - height(x - 0.2, z), height(x, z + 0.2) - height(x, z - 0.2)) / 0.4
      const plants = { pine: [], pine2: [], tree: [], ochre: [], rock: [], rock2: [] }
      {
        const r = K.rng(21), taken = []
        const free = (x, z, gap) => taken.every((q) => Math.hypot(q[0] - x, q[1] - z) > gap)
        const put = (kind, x, z, s, t0 = -9) => { taken.push([x, z]); plants[kind].push({ x, z, y: height(x, z) - 0.03, s, rot: r.range(0, 6.28), t0, lean: r.range(-0.06, 0.06) }) }
        BANK_TREES.forEach((b, i) => {
          const row = river.rows[Math.round(b.s * river.n)], off = -Math.sign(row.nz) * (row.w + 0.6 + 0.45 * K.hash(i, 4))
          const x = row.x + row.nx * off, z = row.z + row.nz * off
          if (libre(x, z)) put(i % 4 === 1 ? 'ochre' : 'tree', x, z, r.range(0.7, 0.95), b.t)
        })
        // Las arboledas y las rocas que entran en un momento: brotan de una en una.
        ENTRAN.filter((e) => e.tipo === 'arboles' || e.tipo === 'rocas').forEach((e, k) => {
          const [cx, cz] = sitio(lugar(e.en), e.hueco), rr = K.rng(100 + k), n = e.tipo === 'arboles' ? 8 : 4
          LIBRES.push([cx, cz, 0])                                                      // sin hueco: aquí sí crecen
          for (let i = 0; i < n; i++) {
            const a = i * 2.39996 + rr.range(-0.3, 0.3), d = e.tipo === 'arboles' ? 0.25 + 0.75 * Math.sqrt((i + 0.5) / n) : 0.35 + 0.3 * i / n
            const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 0.8
            const kind = e.tipo === 'rocas' ? (i % 2 ? 'rock' : 'rock2') : height(x, z) > 0.9 ? (i % 2 ? 'pine' : 'pine2') : i % 4 === 2 ? 'ochre' : 'tree'
            taken.push([x, z]); plants[kind].push({ x, z, y: height(x, z) - 0.03, s: e.tipo === 'rocas' ? rr.range(0.35, 0.6) : rr.range(0.75, 1.0), rot: rr.range(0, 6.28), t0: e.t + i * 0.11, lean: rr.range(-0.06, 0.06) })
          }
        })
        for (let i = 0; i < 2600; i++) {
          const x = r.range(-4, 16), z = r.range(-9, 6.2), y = height(x, z), sl = slope(x, z), { d, row } = river.near(x, z)
          if (y < 0.2 || d < row.w + 0.6 || clear(x, z) || (d < row.w + 1.5 && ((x - row.x) * row.nx + (z - row.z) * row.nz) * row.nz > 0)) continue
          const grove = N.fbm(x * 0.45, z * 0.45, 9, 2)
          if (y > 0.75 && y < 2.3 && sl < 1.1 && grove > -0.06 && free(x, z, 0.36)) put(r.chance(0.5) ? 'pine' : 'pine2', x, z, r.range(0.62, 1.0) * (1.15 - y * 0.12))
          else if (y < 0.8 && sl < 0.5 && grove > 0.1 && free(x, z, 0.55)) put(r.chance(0.16) ? 'ochre' : r.chance(0.3) ? 'pine' : 'tree', x, z, r.range(0.6, 1.0))
        }
        for (let i = 0; i < 500; i++) {
          const x = r.range(-7, 9), z = r.range(-6, 6.5), y = height(x, z), { d, row } = river.near(x, z)
          if (d < row.w + 0.3 || !free(x, z, 0.5) || !libre(x, z)) continue
          if ((y > -0.12 && y < 0.1 && r.chance(0.35)) || (y > 1.6 && y < 2.6 && r.chance(0.12)) || (d < row.w + 0.6 && row.s > 0.3 && r.chance(0.5))) put(r.chance(0.5) ? 'rock' : 'rock2', x, z, r.range(0.22, 0.6))
        }
      }
      const kinds = { pine: pineGeo(1), pine2: pineGeo(2, 0.8), tree: treeGeo(3, PAL.leaf), ochre: treeGeo(4, PAL.ochre), rock: rockGeo(5), rock2: rockGeo(6) }
      const plantMat = faceted(), inst = {}
      for (const k of Object.keys(kinds)) {
        const m = inst[k] = new THREE.InstancedMesh(kinds[k], plantMat, Math.max(1, plants[k].length)); m.count = plants[k].length; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m)
        plants[k].forEach((q, i) => m.setColorAt(i, new THREE.Color().setScalar(0.9 + 0.2 * K.hash(q.x, q.z))))
      }

      // ------------------------------------------------------------ las nubes: una por sitio del cielo; la lluvia trae la suya si no había
      const PUFFS = [
        [[0, 0.3, 0, 1.0], [-1.05, 0.12, 0.1, 0.72], [1.0, 0.18, -0.05, 0.8], [1.8, 0.02, 0.12, 0.5], [0.25, 0.02, 0.55, 0.62], [-0.45, 0.72, -0.1, 0.55]],
        [[0, 0.35, 0, 1.05], [-1.1, 0.15, 0.15, 0.75], [1.05, 0.2, -0.1, 0.82], [0.3, 0.05, 0.6, 0.66], [-0.4, 0.05, -0.6, 0.6], [0.45, 0.85, -0.05, 0.6], [1.85, 0.03, 0.1, 0.48]],
        [[0, 0.2, 0, 0.6], [0.7, 0.08, 0.05, 0.45], [-0.6, 0.05, 0.1, 0.4]],
      ]
      const nubes = {}
      // Lo que una nube se ha ido tierra adentro: 7 cm por segundo, como en la referencia, y en un video largo cada vez más
      // despacio (desde los 8,5 s, lo que dura la referencia), para que no se salga de su sitio.
      const deriva = (t) => (t <= 8.5 ? 0.07 * t : 0.595 + 0.6 * Math.tanh((t - 8.5) * 0.07 / 0.6))
      // La nube del mar es la A de la referencia, la del monte la C y la chica del banco la B (sus semillas y desde dónde se
      // despliegan, las de ella).
      const FORMA = { mar: 0, cielo: 0, montaña: 1 }, DESDE = [[-0.6, 0, 0.3, 2.3], [-1.8, 0, 0, 2.6], [-1, 0, 0, 2.6]], SEMILLA = [1, 3, 2]
      const hazNube = (alto, t, en, forma) => {
        const key = alto.join(','); if (nubes[key]) return nubes[key]
        const k = forma ?? FORMA[en] ?? Object.keys(nubes).length % 2, [fx, fy, fz, vel] = DESDE[k]
        const m = mesh(unfold(cloudGeo(PUFFS[k], SEMILLA[k]), { from: [fx, fy, fz], start: t, speed: vel }), faceted({ unfold: true, fold: 0.42, glow: 0.22 }))
        const g = new THREE.Group(); g.add(m); g.position.set(...alto); g.userData = { pos: alto, mesh: m, t, k, storm: null }; scene.add(g)
        return (nubes[key] = g)
      }
      ENTRAN.forEach((e, k) => {
        const L = lugar(e.en)
        if (e.tipo === 'nube') hazNube(L.alto, e.t, e.en)
        if (e.tipo === 'lluvia') {
          // Si ya había una nube en otro sitio, el banco crece hacia la de la lluvia con una chica en medio (la B de la
          // referencia, año y medio antes de llover); la de la lluvia se despliega un segundo antes.
          const otra = Object.values(nubes).find((n) => n.userData.pos.join(',') !== L.alto.join(','))
          if (otra && !nubes[L.alto.join(',')] && e.t >= 0) {
            const a = otra.userData.pos, medio = [(a[0] + L.alto[0]) / 2 + 0.2, (a[1] + L.alto[1]) / 2 + 0.725, (a[2] + L.alto[2]) / 2 - 0.75].map((v) => Math.round(v * 1000) / 1000)
            hazNube(medio, Math.round((e.t - 1.5) * 1000) / 1000, null, 2)
          }
          const n = hazNube(L.alto, e.t < 0 ? e.t : Math.round((e.t - 1.0) * 1000) / 1000, e.en); n.userData.storm = e.t
        }
      })
      // Una bandera en el cielo se clava en su nube y se va con ella.
      BANDERAS.forEach((b) => { if (b.B.nube && !nubes[b.L.alto.join(',')]) hazNube(b.L.alto, b.m.t0 < 0 ? -9 : b.m.t0, b.m.en) })
      const STORM = new THREE.Color(0.52, 0.5, 0.62), WHITE = new THREE.Color(1, 1, 1)
      ;[[[-27, 5.4, -30], 2.2, 11], [[13, 8.6, -26], 2.0, 12], [[-34, 7.5, -48], 3.0, 13]].forEach(([pos, s, seed]) => {
        const m = mesh(cloudGeo([[0, 0.25, 0, 0.9], [-0.95, 0.1, 0.1, 0.65], [0.9, 0.12, 0, 0.7], [1.6, 0.02, 0.1, 0.42]], seed), faceted({ glow: 0.22 })); m.position.set(...pos); m.scale.setScalar(s); scene.add(m)
      })
      const nubeArriba = (L) => nubes[L.alto.join(',')] || null

      // ------------------------------------------------------------ las gotas: vapor que sube a su nube, lluvia que cae de ella
      const dropMat = new THREE.MeshStandardMaterial({ color: '#dff6ff', emissive: '#bfeaff', emissiveIntensity: 0.55, flatShading: true, roughness: 0.4 })
      const vapores = de('vapor').map((e, k) => {
        const L = lugar(e.en), [sx, sz] = L.suelo, NV = 110, im = new THREE.InstancedMesh(dropGeo(0.045, 0.085), dropMat, NV); im.frustumCulled = false; im.castShadow = false; scene.add(im)
        const base = Math.max(0, height(sx, sz)) + 0.03
        const q = Array.from({ length: NV }, (_, i) => ({ x: sx + (K.hash(i + k * 200, 1) - 0.5) * 3.8, z: sz + (K.hash(i + k * 200, 2) - 0.5) * 3.0, ph: K.hash(i + k * 200, 3), life: 2.3 + K.hash(i + k * 200, 4) * 1.2, dx: (K.hash(i + k * 200, 5) - 0.5) * 2.4, dz: (K.hash(i + k * 200, 6) - 0.5) * 0.9, s: 0.7 + K.hash(i + k * 200, 7) * 0.7 }))
        return { e, L, im, q, base }
      })
      const lluvias = de('lluvia').map((e, k) => {
        const L = lugar(e.en), nube = nubeArriba(L), NR = 150, im = new THREE.InstancedMesh(dropGeo(0.022, 0.15), dropMat, NR); im.frustumCulled = false; im.castShadow = false; scene.add(im)
        const [ax, ay, az] = L.alto
        const q = Array.from({ length: NR }, (_, i) => { const x = ax + (K.hash(i + k * 300, 11) - 0.5) * 3.6, z = Math.round((az + 0.1) * 1000) / 1000 + (K.hash(i + k * 300, 12) - 0.5) * 1.7, top = ay + 0.05; return { x, z, top, fall: top - Math.max(0, height(x - 0.2, z)), ph: K.hash(i + k * 300, 13), v: 6.5 + K.hash(i + k * 300, 14) * 1.5 } })
        return { e, L, im, q, nube }
      })

      // ------------------------------------------------------------ las cosas que se paran en el suelo
      const brotes = []                       // { obj, t, x, y, z, s, rot }: brotan con un resorte, como los árboles de la orilla
      const ponEn = (obj, e, s = 1, giro = 0, extra = {}) => {
        const [x, z] = sitio(lugar(e.en), e.hueco), y = Math.max(0, height(x, z)) - 0.02
        obj.position.set(x, y, z); obj.rotation.y = giro; scene.add(obj)
        const b = Object.assign({ obj, t: e.t, x, y, z, s, giro }, extra); brotes.push(b); return b
      }
      const matPiezas = faceted()  // el de la tierra y los árboles: papel mate
      const casas = [], humos = [], molinos = [], camiones = [], faros = [], plantas = [], puentes = [], barcos = [], cultivos = []
      ENTRAN.forEach((e, k) => {
        const L = lugar(e.en)
        if (e.tipo === 'casas') {
          const [cx, cz] = sitio(L, e.hueco)
          ;[[0, 0, 0.1], [-0.95, -0.4, -0.25], [0.92, -0.5, 0.3], [-0.3, -1.15, -0.1], [0.7, 0.62, 0.5]].forEach(([dx, dz, rot], i) => {
            const g = new THREE.Group(), m = mesh(houseGeo(k * 10 + i + 1), matPiezas); g.add(m)
            const x = cx + dx, z = cz + dz, y = Math.max(0, height(x, z)) - 0.02
            g.position.set(x, y, z); g.rotation.y = rot; scene.add(g)
            brotes.push({ obj: g, t: e.t + i * 0.16, x, y, z, s: 1.5, giro: rot }); casas.push({ e, t: e.t + i * 0.16 })
          })
        }
        if (e.tipo === 'fabrica') {
          const g = new THREE.Group(); g.add(mesh(factoryGeo(), matPiezas)); const b = ponEn(g, e, 1.5, -0.15)
          const NP = 9, im = new THREE.InstancedMesh(puffGeo(), faceted({ glow: 0.22 }), NP); im.castShadow = true; im.frustumCulled = false; scene.add(im)
          const top = new THREE.Vector3(0.36, 0.97, -0.12).multiplyScalar(1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.15).add(g.position)
          humos.push({ b, im, top, NP })
        }
        if (e.tipo === 'molino') {
          const g = new THREE.Group(); g.add(mesh(millGeo(), matPiezas))
          const aspas = mesh(bladesGeo(), faceted({ roughness: 0.9 })); aspas.position.set(0, 0.92, 0.19); g.add(aspas)
          molinos.push({ b: ponEn(g, e, 1.6, 0.12), aspas })
        }
        if (e.tipo === 'faro') {
          const g = new THREE.Group(); g.add(mesh(lighthouseGeo(), matPiezas))
          const luz = mesh(lampGeo(), faceted({ glow: 0.22 })); luz.position.y = 1.03; luz.castShadow = false; g.add(luz)
          // En el mar, el faro va en el islote.
          let b
          if (e.en === 'mar') { const y = height(-5.2, 1.55) - 0.04; g.position.set(-5.2, y, 1.55); scene.add(g); b = { obj: g, t: e.t, x: -5.2, y, z: 1.55, s: 1.25, giro: 0 }; brotes.push(b) }
          else b = ponEn(g, e, 1.5)
          faros.push({ b, luz })
        }
        if (e.tipo === 'planta') {
          const g = new THREE.Group(); g.add(mesh(sproutGeo(k + 3), matPiezas)); plantas.push(ponEn(g, e, 1.9, 0.4, { crece: true }))
        }
        if (e.tipo === 'cultivo') {
          // Surcos sobre el terreno, de una esquina a la otra; se despliegan faceta por faceta.
          const [cx, cz] = sitio(L, e.hueco), tris = [], filas = 7, largo = 2.6, paso = 0.32
          for (let f = 0; f < filas; f++) for (let s = 0; s < 10; s++) {
            const z0 = cz - filas * paso / 2 + f * paso, x0 = cx - largo / 2 + s * largo / 10, x1 = x0 + largo / 10
            const p = (x, z, dy) => [x, Math.max(0, height(x, z)) + 0.06 + dy, z]
            const a = p(x0, z0, 0), b = p(x1, z0, 0), c = p(x0, z0 + 0.12, 0.13), d = p(x1, z0 + 0.12, 0.13), e2 = p(x0, z0 + 0.24, 0), f2 = p(x1, z0 + 0.24, 0)
            tris.push([a, b, d], [a, d, c], [c, d, f2], [c, f2, e2])
          }
          const geo = unfold(facet(upward(tris), (c, n) => { const fila = Math.floor((c.z - (cz - filas * paso / 2)) / paso); return tone(fila % 2 ? PAL.ochre : PAL.leaf, c.x * 7.1 + c.z * 3.3, 1).multiplyScalar(n.z > 0 ? 1.08 : 0.86) }), { from: [cx - largo / 2, 0, cz - filas * paso / 2], start: e.t, duration: 1.2 })
          scene.add(mesh(geo, faceted({ unfold: true, fold: 0.3 }), { cast: false })); cultivos.push(e)
        }
        if (e.tipo === 'camion') {
          const g = new THREE.Group(), cuerpo = mesh(truckGeo(), matPiezas); g.add(cuerpo)
          const ruedas = [[0.2, 0.135], [0.2, -0.135], [-0.2, 0.135], [-0.2, -0.135]].map(([x, z]) => { const w = mesh(wheelGeo(), matPiezas); w.position.set(x, 0.055, z); g.add(w); return w })
          const a = sitio(L, e.hueco), bb = parada(lugar(e.a))
          scene.add(g); g.scale.setScalar(1.7)
          // El camino: una cinta de arena que se despliega delante del camión.
          const paso = 24, tris = []
          const pt = (u, lado) => { const x = K.lerp(a[0], bb[0], u), z = K.lerp(a[1], bb[1], u), dx = bb[0] - a[0], dz = bb[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l; const xx = x + nx * lado * 0.2, zz = z + nz * lado * 0.2; return [xx, Math.max(0, height(xx, zz)) + 0.025, zz] }
          for (let i = 0; i < paso; i++) { const u0 = i / paso, u1 = (i + 1) / paso; tris.push([pt(u0, -1), pt(u1, -1), pt(u1, 1)], [pt(u0, -1), pt(u1, 1), pt(u0, 1)]) }
          const viaje = Math.max(1.6, Math.min(4, e.fin - e.t - 0.2))
          const geo = unfold(facet(upward(tris), (c) => tone(PAL.bed, c.x * 5 + c.z * 3, 1)), { from: [a[0], 0, a[1]], start: e.t - 0.3, duration: viaje * 0.6 })
          scene.add(mesh(geo, faceted({ unfold: true, fold: 0.3 }), { cast: false }))
          camiones.push({ e, g, ruedas, a, b: bb, viaje })
        }
        if (e.tipo === 'barco') {
          const g = new THREE.Group(); g.add(mesh(boatGeo(), (() => { const m = faceted({ roughness: 0.8 }); m.side = THREE.DoubleSide; return m })())); g.scale.setScalar(2.2); scene.add(g)
          const [a, bb] = e.a && lugar(e.a).barco ? [L.barco[1], lugar(e.a).barco[1]] : L.barco
          barcos.push({ e, g, a, b: bb })
        }
        if (e.tipo === 'puente') {
          const row = river.rows[Math.round(river.n * 0.45)], planks = []
          for (let i = 0; i < 9; i++) {
            const u = (i - 4) / 4, x = row.x + row.nx * u * (row.w + 0.45), z = row.z + row.nz * u * (row.w + 0.45), y = Math.max(row.y + 0.12, height(x, z) + 0.02) + 0.14 * (1 - u * u)
            const m = mesh(plankGeo(), matPiezas); m.position.set(x, y, z); m.rotation.y = Math.atan2(row.nx, row.nz) + Math.PI / 2; m.rotation.z = -u * 0.16; scene.add(m); planks.push({ m, t: e.t + i * 0.07 })
          }
          puentes.push(planks)
        }
      })

      // ------------------------------------------------------------ el barquito de papel de siempre y las banderas
      const boat = mesh(boatGeo(), faceted({ roughness: 0.8 })); boat.material.side = THREE.DoubleSide; scene.add(boat)
      BANDERAS.forEach((b) => Object.assign(b.f, flag(b.num, b.texto, b.B)))
      BANDERAS.forEach((b) => {
        const [x, z] = b.B.at
        // en la nube, `at` es en el espacio de la nube: el pie, bajo la cima del copo, para que se vaya con ella
        if (b.B.nube) { b.f.group.position.set(x, 0.6, z); nubes[b.L.alto.join(',')].add(b.f.group) }
        else { b.f.group.position.set(x, height(x, z) - 0.02, z); scene.add(b.f.group) }
        b.f.group.rotation.y = b.B.yaw
      })

      // ------------------------------------------------------------ la cámara: un solo movimiento de grúa que pasa por cada lugar
      // Cada plano (los momentos seguidos en un mismo lugar) se encuadra solo: su bandera entera y sus cosas dentro del
      // cuadro, con margen. En horizontal se queda el encuadre de la referencia mientras nada se corte; en vertical la
      // cámara sube un poco (el suelo llena lo alto del cuadro) y deja libre lo de abajo, donde la red pone el texto.
      const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]), UP = new THREE.Vector3(0, 1, 0)
      const TV = Math.tan(THREE.MathUtils.degToRad(30 / 2)), TH = TV * P.ancho / P.alto
      // Los márgenes del cuadro (de 0 al borde, que es 1); en los lugares de la referencia, los de ella: que quepa entero.
      const MG0 = VERTICAL ? { l: 0.86, r: 0.86, t: 0.8, b: 0.5 } : { l: 0.93, r: 0.93, t: 0.88, b: 0.84 }, MG_REF = { l: 0.99, r: 0.99, t: 0.97, b: 0.97 }
      let MG = MG0
      const caja = (A, f, r, u, d, pts) => {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
        for (const p of pts) { const q = V3(p).sub(A), z = Math.max(0.5, d + q.dot(f)), nx = q.dot(r) / (z * TH), ny = q.dot(u) / (z * TV); x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny) }
        return { x0, x1, y0, y1, cabe: x0 >= -MG.l && x1 <= MG.r && y0 >= -MG.b && y1 <= MG.t }
      }
      const encuadre = (pos0, aim0, pts, dmin, dmax, alto = 0, soloAleja = false) => {
        let A = V3(aim0), v = V3(pos0).sub(A)
        if (VERTICAL) { const el = Math.asin(v.y / v.length()), az = Math.atan2(v.x, v.z), e2 = Math.min(0.85, Math.max(el + 0.2, alto)), l = v.length(); v = new THREE.Vector3(Math.sin(az) * Math.cos(e2), Math.sin(e2), Math.cos(az) * Math.cos(e2)).multiplyScalar(l) }
        let d = v.length(); const f = v.clone().normalize().negate(), r = new THREE.Vector3().crossVectors(f, UP).normalize(), u = new THREE.Vector3().crossVectors(r, f)
        // Si ya cabe, los números de la referencia tal cual: rehacerlos desde un vector normalizado deja errores de 1e-15
        // que, en alguna de las 64 pasadas, mueven un borde de píxel.
        if (soloAleja && caja(A, f, r, u, d, pts).cabe) return { pos: pos0.slice(), aim: aim0.slice() }
        for (let it = 0; it < 20; it++) {
          const b = caja(A, f, r, u, d, pts)
          // En los lugares de la referencia (horizontal) se queda su composición (la misma mira): si algo no cabe, solo se aleja.
          if (soloAleja) { d = Math.min(dmax, d * Math.max(1, b.x1 / MG.r, -b.x0 / MG.l, b.y1 / MG.t, -b.y0 / MG.b) * 1.01); continue }
          A.addScaledVector(r, ((b.x0 + b.x1) / 2 - (MG.r - MG.l) / 2) * d * TH).addScaledVector(u, ((b.y0 + b.y1) / 2 - (MG.t - MG.b) / 2) * d * TV)
          d = K.clamp(d * Math.max((b.x1 - b.x0) / (MG.l + MG.r), (b.y1 - b.y0) / (MG.t + MG.b)) * 1.02, dmin, dmax)
        }
        // Lo que aún se salga (los puntos a distinta hondura no escalan igual): se aleja por la misma línea hasta que quepa.
        for (let it = 0; it < 40 && d < dmax && !caja(A, f, r, u, d, pts).cabe; it++) d = Math.min(dmax, d * 1.04)
        return { pos: A.clone().addScaledVector(f, -d).toArray(), aim: A.toArray() }
      }
      // Lo que tiene que caber: la bandera (el alfiler y el papel) y cada cosa con su tamaño.
      const ptsBandera = (b, yaw = b.B.yaw) => {
        const g = b.f.group, n = b.B.nube ? nubes[b.L.alto.join(',')] : null, base = n ? V3(b.L.alto).add(g.position).add(new THREE.Vector3(deriva(b.t + 2), 0, 0)) : g.position.clone()
        const s = b.B.side || 1, w = b.f.width, h = b.B.height || 1.25, c = Math.cos(yaw), sn = Math.sin(yaw)
        return [[0, 0], [0, h + 0.12], [s * (w + 0.2) * c, h + 0.05, -s * (w + 0.2) * sn], [s * (w + 0.2) * c, h - 0.8, -s * (w + 0.2) * sn]].map(([dx, dy, dz = 0]) => [base.x + dx, base.y + dy, base.z + dz])
      }
      const ptsCosa = (e) => {
        const L = lugar(e.en), cerca = (x, z, r, alto) => { const y = Math.max(0, height(x, z)); return [[x - r, y, z], [x + r, y, z], [x, y, z - r], [x, y, z + r], [x, y + alto, z]] }
        if (e.tipo === 'nube' || e.tipo === 'lluvia') { const [x0, y, z] = L.alto, x = x0 + deriva(Math.max(0, e.t) + 2); return [[x - 1.6, y + 1.0, z], [x + 2.0, y + 0.9, z], [x - 1.4, y, z + 0.5], [x + 1.8, y, z + 0.5]].concat(e.tipo === 'lluvia' ? [[x, Math.max(0, height(x, z)), z + 0.8]] : []) }
        if (e.tipo === 'vapor') { const [x, z] = L.suelo; return [[x - 1.5, 0, z + 1], [x + 1.5, 0, z + 1], [L.alto[0], L.alto[1] - 0.3, L.alto[2]]] }
        if (e.tipo === 'rio') return [0.05, 0.5, 0.95].map((s) => { const r = river.rows[Math.round(s * river.n)]; return [r.x, r.y, r.z] })
        if (e.tipo === 'anillo') return [[ringAt[0] - 2, 0, ringAt[1]], [ringAt[0] + 2, 0, ringAt[1]], [ringAt[0], 0, ringAt[1] + 1.5]]
        if (e.tipo === 'camion') { const a = sitio(L, e.hueco); return cerca(a[0], a[1], 0.5, 0.6) }
        if (e.tipo === 'barco') return (e.a && lugar(e.a).barco ? [L.barco[1], lugar(e.a).barco[1]] : L.barco).map(([x, z]) => [x, 1.2, z])
        if (e.tipo === 'puente') { const r = river.rows[Math.round(river.n * 0.45)]; return cerca(r.x, r.z, 0.9, 0.4) }
        if (e.tipo === 'faro' && e.en === 'mar') return cerca(-5.2, 1.55, 0.4, 1.9)
        const [x, z] = sitio(L, e.hueco), R = { casas: [1.4, 1.0], cultivo: [1.4, 0.3], fabrica: [1.0, 3.0], molino: [0.6, 2.4], faro: [0.4, 2.0], planta: [0.6, 1.6], arboles: [1.0, 1.0], rocas: [0.7, 0.4] }[e.tipo] || [0.6, 0.8]
        return cerca(x, z, R[0], R[1])
      }
      const planos = []
      MOM.forEach((m, i) => { const prev = planos[planos.length - 1]; if (prev && prev.en === m.en && !m.camara) { prev.fin = m.fin; prev.ms.push(m) } else planos.push({ en: m.en, t: i === 0 ? 0 : m.t, fin: m.fin, cerca: m.camara === 'cerca', ms: [m] }) })
      const pose = (p) => {
        const L0 = lugar(p.en), L = L0.cam2 && ENTRAN.some((e) => L0.evita.includes(e.en) && e.t < p.fin) ? Object.assign({}, L0, { cam: L0.cam2 }) : L0
        const d0 = V3(L.cam.pos).distanceTo(V3(L.cam.aim)), todo = p.en === 'todo'
        // Lo de este lugar que ya está o entra en este plano; en el de todo, todo.
        const hasta = p.fin, mios = (x) => (todo || x.en === p.en) && x.t < hasta
        let pts = ENTRAN.filter((e) => mios(e) && (!p.cerca || p.ms.includes(MOM[e.i]))).flatMap(ptsCosa)
        const flags = BANDERAS.filter((b) => (todo || b.m.en === p.en) && b.t < hasta)
        // En el de todo en vertical, cada bandera ya vuelta hacia la cámara (`giro`).
        if (todo && VERTICAL) flags.forEach((b) => { const o = b.B.nube ? b.L.alto : [0, 0, 0], dx = L.cam.pos[0] - b.f.group.position.x - o[0], dz = L.cam.pos[2] - b.f.group.position.z - o[2]; b.giro = Math.atan2(dx, dz) })
        if (!p.cerca) pts = pts.concat(flags.flatMap((b) => ptsBandera(b, b.giro ?? b.B.yaw)))
        // Nítido, lo que se cuenta: el centro de sus cosas (sin cosas, el foco del lugar).
        // En horizontal, los lugares de la referencia (`ref`) se miran y se enfocan como en ella: solo sus banderas tienen
        // que caber enteras, y lo nítido es su foco.
        const fiel = !VERTICAL && L.ref && (p.en !== 'todo' || MOM.every((m) => lugar(m.en).ref)), cosas = ENTRAN.filter((e) => mios(e)).flatMap(ptsCosa)
        const foco = fiel || todo || !cosas.length ? L.foco || L.cam.aim : [0, 1, 2].map((j) => cosas.reduce((s, x) => s + x[j], 0) / cosas.length)
        if (!pts.length) pts.push(L.foco || L.cam.aim)
        const caben = fiel ? (p.cerca ? pts : flags.flatMap((b) => ptsBandera(b))).concat([L.foco || L.cam.aim]) : pts
        MG = fiel ? MG_REF : MG0
        const q = encuadre(L.cam.pos, L.cam.aim, caben, fiel ? 0 : d0 * (p.cerca ? 0.6 : 0.9), d0 * (todo ? 4.5 : VERTICAL ? 3.4 : 2.4), todo && VERTICAL ? 0.55 : 0, fiel)
        MG = MG0
        return { pos: q.pos, aim: q.aim, foco, ap: L.ap || 0.06, pts, flags, todo }
      }
      // La grúa, como en la referencia: un solo movimiento que fluye por sus puntos con K.path (posición y mira), el foco
      // con K.track. Llega a cada lugar poco después de que empieza lo suyo; si se queda más de un par de segundos, sus
      // puntos se van acercando despacio (como los dos últimos de la referencia) para que no se vaya antes de tiempo, y
      // sale hacia el siguiente un poco antes de que empiece.
      const keysP = [], keysA = [], keysF = [], keysAp = []
      // Los segundos, redondeados al milésimo: 1,2 + 1,6 da 2,8000000000000003, y la referencia dice 2,8.
      const seg = (x) => Math.round(x * 1000) / 1000
      const poner = (t, pos, aim) => {
        // Una toma nueva quita las que quedaron después de ella (la de un lugar que la cámara aún no alcanzaba).
        while (keysP.length && keysP[keysP.length - 1][0] > t - 0.3) { keysP.pop(); keysA.pop() }
        keysP.push([t, pos]); keysA.push([t, aim])
      }
      let antes = null
      planos.forEach((p, i) => {
        const q = (p.q = pose(p)), sig = planos[i + 1], L = lugar(p.en)
        // El plano de todo es el de la referencia solo si el video entero pasa en sus lugares; si no, se encuadra lo que hay.
        const soloRef = MOM.every((m) => lugar(m.en).ref)
        const fiel = !VERTICAL && L.tomas && !p.cerca && (p.en !== 'todo' || soloRef) && !(L.cam2 && ENTRAN.some((e) => L.evita.includes(e.en) && e.t < p.fin))
        const lejos = sig ? V3(pose(sig).pos).distanceTo(V3(q.pos)) > 6 : false
        const llega = i === 0 ? 0 : fiel ? seg(p.t + L.tomas[0].en) : Math.max(p.t + (antes.lejos ? 0.8 : 0.7), antes.sale + 0.9)
        let ultima = { t: llega, pos: q.pos, aim: q.aim }
        if (fiel) {
          L.tomas.forEach((tm, k) => {
            const tk = tm.en === 'fin' ? D : i === 0 && k === 0 ? 0 : seg(p.t + tm.en)
            if (tk > D) return
            // La toma de la referencia; si una bandera ya clavada no cabe, se aleja por la misma línea.
            const flags = BANDERAS.filter((b) => (p.en === 'todo' || b.m.en === p.en) && b.t <= tk + 0.05)
            MG = MG_REF
            const e = flags.length ? encuadre(tm.pos, tm.aim, flags.flatMap((b) => ptsBandera(b)), 0, V3(tm.pos).distanceTo(V3(tm.aim)) * 2.4, 0, true) : tm
            MG = MG0
            poner(tk, e.pos, e.aim); ultima = { t: tk, pos: e.pos, aim: e.aim }
          })
        } else poner(llega, q.pos, q.aim)
        // Si se queda mucho más (con voz), sus puntos se van acercando despacio para que no se vaya antes de tiempo.
        const sale = Math.max(ultima.t + 0.05, sig ? sig.t - (lejos ? 0.7 : 0.5) : D)
        const cerca = (k) => ultima.pos.map((v, j) => ultima.aim[j] + (v - ultima.aim[j]) * k), fin2 = sig ? 0.95 : 0.97
        // En los de la referencia, como ella (no se para entre sus tomas); en los demás, espera a que pase lo suyo.
        if (sale - ultima.t > (fiel ? 2.6 : 0.6)) {
          const n = Math.floor((sale - ultima.t) / 1.3)
          for (let k = 1; k <= n; k++) { const tk = ultima.t + (sale - ultima.t) * k / (n + 1); poner(tk, cerca(1 - (1 - fin2) * k / (n + 1)), ultima.aim) }
          poner(sale, cerca(fin2), ultima.aim)
        }
        // El foco: el de la referencia en sus lugares, cuando ella lo cambia; en los demás, al llegar.
        const ve = fiel ? L.enfoca : [-0.9 + (llega - p.t), 0.3 + (llega - p.t)]
        if (i === 0) { keysF.push([0, q.foco]); keysAp.push([0, q.ap]) }
        else if (ve) {
          const desde = Math.max(seg(p.t + ve[0]), keysF[keysF.length - 1][0] + 0.05), hasta = Math.max(seg(p.t + ve[1]), desde + 0.05)
          keysF.push([desde, keysF[keysF.length - 1][1]], [hasta, q.foco, 'inOut'])
          keysAp.push([desde, keysAp[keysAp.length - 1][1]], [hasta, q.ap, 'inOut'])
        }
        Object.assign(p, { llega, sale }); antes = { sale, q, lejos }
      })
      if (keysP.length === 1) { keysP.push([D, keysP[0][1]]); keysA.push([D, keysA[0][1]]) }
      if (keysAp.length === 1) { keysAp.push([D, keysAp[0][1]]); keysF.push([D, keysF[0][1]]) }
      const TODO = planos.find((p) => p.en === 'todo') || { llega: 1e9 }
      const camPos = K.path(keysP), camAim = K.path(keysA), camFoco = K.track(keysF), camAp = K.track(keysAp)
      const cam = (t) => ({ pos: camPos(t), aim: camAim(t), foco: camFoco(t), ap: camAp(t) })
      // Una bandera de otro lugar que se cruza con lo que se cuenta aquí (delante o detrás), o que quedaría cortada por el
      // borde, dobla su papel contra el alfiler mientras la cámara está aquí, y lo vuelve a abrir cuando se va.
      planos.forEach((p) => {
        if (p.q.todo || (!VERTICAL && lugar(p.en).ref)) return  // en horizontal, los de la referencia como en ella
        // con la cámara ya acercada al final del plano, que es cuando más se corta lo del borde
        const A = V3(p.q.aim), v = V3(p.q.pos).sub(A), d = v.length() * 0.95, f = v.clone().normalize().negate(), r = new THREE.Vector3().crossVectors(f, UP).normalize(), u = new THREE.Vector3().crossVectors(r, f)
        const sujeto = caja(A, f, r, u, d, p.q.pts)
        BANDERAS.filter((b) => !p.q.flags.includes(b) && b.t < p.sale).forEach((b) => {
          const pb = ptsBandera(b), k = caja(A, f, r, u, d, pb)
          const dentro = k.x1 > -1 && k.x0 < 1 && k.y1 > -1 && k.y0 < 1
          const corta = dentro && !(k.x0 >= -1 && k.x1 <= 1 && k.y0 >= -1 && k.y1 <= 1)
          const tapa = k.x1 > sujeto.x0 - 0.05 && k.x0 < sujeto.x1 + 0.05 && k.y1 > sujeto.y0 - 0.05 && k.y0 < sujeto.y1 + 0.05
          if (corta || tapa) (b.pliegues = b.pliegues || []).push([p.llega - 0.8, p.sale + 0.15])
        })
      })
      const plegado = (b, t) => (b.pliegues || []).reduce((m, [a, z]) => Math.max(m, K.smooth(a, a + 0.4, t) * (1 - K.smooth(z, z + 0.4, t))), 0)

      return {
        update(t) {
          clock.value = t
          // las nubes se van tierra adentro y se mecen; la de la lluvia se oscurece antes de llover
          Object.values(nubes).forEach((c, i) => {
            c.position.set(c.userData.pos[0] + deriva(t), c.userData.pos[1] + 0.05 * Math.sin(t * 0.9 + i * 2.1), c.userData.pos[2])
            c.userData.mesh.material.color.copy(WHITE).lerp(STORM, c.userData.storm == null ? 0 : K.seg(t, c.userData.storm - 0.7, c.userData.storm + 0.5, K.ease.inOut))
          })
          vapores.forEach(({ e, L, im, q, base }) => {
            const nube = nubeArriba(L), tx = L.alto[0], tz = Math.round((L.alto[2] + 0.1) * 1000) / 1000, top = (nube ? nube.position.y + 0.25 : L.alto[1] - 0.4)
            const on = K.seg(t, e.t, e.t + 0.6)
            q.forEach((d, i) => {
              const u = ((t / d.life + d.ph) % 1 + 1) % 1, ee = u * u * (3 - 2 * u)
              const sc = d.s * Math.min(1, u * 16) * (1 - K.smooth(0.75, 1, u)) * (e.t < 0 ? 1 : on * (d.ph < on ? 1 : 0))
              K.place(im, i, [K.lerp(d.x, tx + d.dx, ee * ee) + 0.08 * Math.sin(u * 9 + i), base + top * Math.pow(u, 1.35), K.lerp(d.z, tz + d.dz, ee * ee) + 0.08 * Math.cos(u * 7 + i * 1.7)], [0, u * 5 + i, 0.25 * Math.sin(u * 11 + i)], sc)
            })
            im.instanceMatrix.needsUpdate = true
          })
          lluvias.forEach(({ e, im, q, nube }) => {
            const dx = nube ? nube.position.x - nube.userData.pos[0] : 0
            q.forEach((d, i) => {
              const t1 = t - e.t - d.ph * 0.5, period = d.fall / d.v + 0.08, k = t1 / period, u = k - Math.floor(k)
              const y = d.top - u * period * d.v, on = t1 > 0 && y > d.top - d.fall
              K.place(im, i, [d.x + dx - (d.top - y) * 0.09, y, d.z], [0, i, -0.09], on ? 1 : 0)
            })
            im.instanceMatrix.needsUpdate = true
          })
          for (const k of Object.keys(inst)) {
            plants[k].forEach((q, i) => { const a = q.t0 < 0 ? 1 : K.spring(t - q.t0, 2.4, 0.36), w = q.t0 < 0 ? 1 : K.spring(t - q.t0, 1.9, 0.5); K.place(inst[k], i, [q.x, q.y, q.z], [q.lean, q.rot, q.lean * 0.7], [q.s * w, q.s * a, q.s * w]) })
            inst[k].instanceMatrix.needsUpdate = true
          }
          // lo que brota: del suelo, con un rebote (la planta crece de abajo arriba)
          brotes.forEach((b) => {
            const a = b.t < 0 ? 1 : K.spring(t - b.t, b.crece ? 1.4 : 2.4, b.crece ? 0.55 : 0.36), w = b.t < 0 ? 1 : K.spring(t - b.t, b.crece ? 1.2 : 1.9, 0.5)
            b.obj.visible = b.t < 0 || t > b.t
            b.obj.scale.set(b.s * Math.max(0.001, b.crece ? Math.min(1, a * 1.1) : w), b.s * Math.max(0.001, a), b.s * Math.max(0.001, b.crece ? Math.min(1, a * 1.1) : w))
          })
          molinos.forEach(({ b, aspas }) => { aspas.rotation.z = -t * 2.2 })
          faros.forEach(({ b, luz }) => { luz.scale.setScalar(1 + 0.12 * Math.sin(t * 5)) })
          humos.forEach(({ b, im, top, NP }) => {
            for (let i = 0; i < NP; i++) {
              const life = 2.6, u = (((t - b.t) / life + i / NP) % 1 + 1) % 1, on = b.t < 0 || t - b.t > 0.4 + i * 0.05
              const s = on ? (0.06 + 0.16 * u) * (1 - K.smooth(0.7, 1, u)) * Math.min(1, u * 8) : 0
              K.place(im, i, [top.x + 0.5 * u * u + 0.05 * Math.sin(i * 3 + t), top.y + 0.05 + 1.3 * u, top.z - 0.1 * u], [i, u * 2, i * 0.5], Math.max(0.0001, s))
            }
            im.instanceMatrix.needsUpdate = true
          })
          camiones.forEach(({ e, g, ruedas, a, b, viaje }) => {
            const u = e.t < 0 ? 1 : K.seg(t, e.t, e.t + viaje, K.ease.inOut), x = K.lerp(a[0], b[0], u), z = K.lerp(a[1], b[1], u)
            const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]), y = Math.max(0, height(x, z)) + 0.02
            const yb = Math.max(0, height(x + Math.cos(ang) * 0.25, z - Math.sin(ang) * 0.25))
            g.position.set(x, y + 0.01 * Math.sin(t * 22) * (u > 0 && u < 1 ? 1 : 0), z); g.rotation.set(0, ang, Math.atan2(yb - y + 0.02, 0.25) * 0.6)
            const pop = e.t < 0 ? 1 : K.spring(t - e.t + 0.25, 2.4, 0.4); g.visible = e.t < 0 || t > e.t - 0.25; g.scale.setScalar(1.7 * Math.max(0.001, pop))
            ruedas.forEach((w) => { w.rotation.z = -u * Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.055 })
          })
          barcos.forEach(({ e, g, a, b }) => {
            const u = e.t < 0 ? 0.5 : K.seg(t, e.t, e.t + Math.max(2, e.fin - e.t), K.ease.inOut), x = K.lerp(a[0], b[0], u), z = K.lerp(a[1], b[1], u)
            const wv = (x, z) => 0.075 * (Math.sin(x * 1.25 + t * 1.35) * Math.cos(z * 1.05 - t * 1.1) * 0.6 + Math.sin(x * 2.7 - z * 2.2 + t * 2.3) * 0.4)
            g.position.set(x, wv(x, z) + 0.03, z); g.rotation.set(0.08 * Math.sin(t * 1.3), Math.atan2(-(b[1] - a[1]), b[0] - a[0]) || 0.5, (wv(x + 0.3, z) - wv(x - 0.3, z)) * 1.2)
            const pop = e.t < 0 ? 1 : K.spring(t - e.t, 2.2, 0.4); g.visible = e.t < 0 || t > e.t; g.scale.setScalar(2.2 * Math.max(0.001, pop))
          })
          puentes.forEach((planks) => planks.forEach(({ m, t: t0 }) => { const a = t0 < 0 ? 1 : K.spring(t - t0, 2.6, 0.4); m.visible = t0 < 0 || t > t0; m.scale.set(Math.max(0.001, a), 1, Math.max(0.001, a)) }))
          BANDERAS.forEach((b) => {
            b.f.pop(t, b.t, plegado(b, t))
            if (b.giro != null) b.f.group.rotation.y = K.lerp(b.B.yaw, b.giro, K.smooth(TODO.t - 0.2, TODO.llega + 0.3, t))
          })
          const bx = -6.9 + 0.1 * t, bz = -1.4, wv = (x, z) => 0.075 * (Math.sin(x * 1.25 + t * 1.35) * Math.cos(z * 1.05 - t * 1.1) * 0.6 + Math.sin(x * 2.7 - z * 2.2 + t * 2.3) * 0.4)
          boat.position.set(bx, wv(bx, bz) + 0.03, bz); boat.rotation.set(0.08 * Math.sin(t * 1.3), 0.5, (wv(bx + 0.3, bz) - wv(bx - 0.3, bz)) * 1.2)
          const c = cam(t), cp = c.pos, ca = c.aim
          K.look(camera, cp, ca); K.focus(camera, c.foco, c.ap)
          // La bruma empieza donde empezaba en la referencia respecto a lo que se mira: si la cámara se aleja (el plano
          // general en vertical), se aleja con ella y no lava el mundo.
          const dist = Math.hypot(cp[0] - ca[0], cp[1] - ca[1], cp[2] - ca[2]); scene.fog.near = Math.max(12, dist - 3); scene.fog.far = scene.fog.near + 44
          sky.position.copy(camera.position)
        },
      }
    },

    // El sonido sale del mismo plan que la imagen: cada cosa suena en el cuadro en que aparece.
    sound(k) {
      const r = K.rng(4), MOMS = P.momentos.map((m, i) => Object.assign({}, m, { t0: i === 0 ? 0.05 : m.t, fin: i + 1 < P.momentos.length ? P.momentos[i + 1].t : D }))
      k.music('pad', 0, D, { bpm: 56, gain: 0.9, chords: [['D4', 'F#4', 'A4', 'C#5'], ['G3', 'B3', 'D4', 'F#4']] })
      k.bed('room', 0, D, { gain: 0.6 })
      const lluvia = MOMS.find((m) => (m.entra || []).some((e) => e.tipo === 'lluvia'))
      k.bed('hiss', 0, lluvia ? lluvia.t0 : D, { gain: 0.5 })
      if (lluvia) k.bed('rain', lluvia.t0 - 0.1, D, { gain: 0.9 })
      MOMS.forEach((m, i) => (m.entra || []).forEach((e, j) => {
        const t = m.t0, pan = (K.hash(i, j) - 0.5) * 0.6
        k.withMinor(() => {
          const nubeLuego = MOMS.find((o, j2) => j2 > i && (o.entra || []).some((x) => x.tipo === 'nube'))
          if (e.tipo === 'vapor') for (let u = i === 0 ? 0.15 : t; u < (nubeLuego ? nubeLuego.t0 + 0.6 : t + 1.6); u += 0.22 + r() * 0.12) k.tone(u, { f: [[0, 1300 + r() * 500], [0.25, 2100 + r() * 900]], dur: 0.3, gain: 0.035, a: 0.05, pan: -0.5 + r() * 0.4, verb: 0.4 })
          // cada nube al desplegarse: papel, del lado donde está (la A a la izquierda, la C a la derecha). El segundo, redondeado:
          // el kit siembra el ruido de cada sonido con su segundo, y 4,1 − 1,5 da 2,5999…, no 2,6
          const papel = (tt, dur, x) => { tt = Math.round(tt * 1000) / 1000; const pn = Math.round(K.clamp(x * 0.09, -0.6, 0.6) * 10) / 10; k.play('paper', tt, { dur, gain: 0.8, pan: pn }); k.play('paper', tt + dur * 0.45, { dur: dur * 0.6, gain: 0.5, pan: pn }) }
          const alto = (n) => ({ mar: [-3.5], cielo: [-3.5], montaña: [3.3], rio: [0.1], costa: [-2.2], llanura: [2.4], valle: [6.6], bosque: [8.0] })[n] || [0]
          if (e.tipo === 'nube') papel(t, 1.2, alto(e.en || m.en)[0])
          if (e.tipo === 'lluvia' && i > 0) {
            const antes = MOMS.slice(0, i).find((o) => (o.entra || []).some((x) => x.tipo === 'nube' && (x.en || o.en) !== (e.en || m.en)))
            if (antes) papel(t - 1.5, 0.55, (alto(antes.en)[0] + alto(e.en || m.en)[0]) / 2 + 0.2)
            papel(t - 1.0, 1.2, alto(e.en || m.en)[0])
          }
          if (e.tipo === 'rio') { for (let u = 0; u < 1; u += 0.035 + r() * 0.02) k.tone(t + u * 1.9, { f: [[0, 2300 - 900 * u + r() * 400], [0.06, 1500 - 600 * u]], dur: 0.09, gain: 0.05, a: 0.004, pan: 0.4 - 0.7 * u, verb: 0.25 }); for (let b = 0; b < 13; b++) k.play('pop', t + (0.3 + b * 0.05) * 1.9 + 0.16, { gain: 0.3, f: 520 + (b * 97) % 340, pan: 0.3 - 0.04 * b }) }
          if (e.tipo === 'arboles') for (let b = 0; b < 8; b++) k.play('pop', t + b * 0.11, { gain: 0.35, f: 480 + (b * 113) % 320, pan: pan + (b % 3 - 1) * 0.15 })
          if (e.tipo === 'rocas') for (let b = 0; b < 4; b++) k.play('thud', t + b * 0.11, { gain: 0.25, f: 110 + b * 12, pan })
          if (e.tipo === 'cultivo') { k.play('paper', t, { dur: 1.2, gain: 0.7, pan }); k.play('stroke', t + 0.1, { dur: 1.0, material: 'brush', gain: 0.6, pan }) }
          if (e.tipo === 'molino') for (let b = 0; b < 4; b++) k.play('swish', t + 0.5 + b * 0.7, { gain: 0.25, dur: 0.22, pan })
          if (e.tipo === 'fabrica') for (let b = 0; b < 3; b++) k.play('tock', t + 0.5 + b * 0.35, { gain: 0.25, f: 380, pan })
          if (e.tipo === 'camion') { k.play('roller', t, { dur: Math.max(1.6, Math.min(4, m.fin - t - 0.2)), gain: 0.5, pan }); k.play('buzz', t, { dur: 0.9, f: 70, gain: 0.35, pan }) }
          if (e.tipo === 'barco') { k.play('paper', t, { dur: 0.6, gain: 0.6, pan }); k.play('swish', t + 0.4, { gain: 0.3, dur: 0.4, pan }) }
          if (e.tipo === 'puente') for (let b = 0; b < 9; b++) k.play('tock', t + b * 0.07, { gain: 0.3, f: 600 + b * 25, pan: -0.4 + b * 0.1 })
        })
        if (e.tipo === 'lluvia') k.play('thud', t - 0.25, { gain: 0.22, f: 70, pan: 0.3 })
        if (e.tipo === 'rio') k.play('whoosh', t - 0.1, { gain: 0.35, dur: 0.8, top: 1800, pan: 0.3 })
        if (e.tipo === 'casas') for (let b = 0; b < 5; b++) { k.play('pop', t + b * 0.16, { gain: 0.6, f: 520 + b * 50, pan: pan + (b - 2) * 0.1 }); k.play('tock', t + b * 0.16 + 0.12, { gain: 0.3, f: 700 }) }
        if (e.tipo === 'fabrica') { k.play('press', t, { gain: 0.6, pan }); k.play('stamp', t + 0.25, { gain: 0.35, pan }) }
        if (e.tipo === 'molino' || e.tipo === 'faro') { k.play('pop', t, { gain: 0.8, f: 520, pan }); k.play('tock', t + 0.25, { gain: 0.4, f: 700, pan }) }
        if (e.tipo === 'faro') k.play('ding', t + 0.35, { gain: 0.35, f: 'E6', pan })
        if (e.tipo === 'planta') { k.play('pop', t, { gain: 0.5, f: 700, pan }); k.play('sparkle', t + 0.3, { gain: 0.4, n: 4 }) }
        if (e.tipo === 'anillo') { k.play('success', t, { gain: 0.6, f: 'A5' }); k.play('sparkle', t + 0.1, { gain: 0.6 }) }
      }))
      // las banderas: el alfiler entra, el papel da la vuelta
      MOMS.filter((m) => m.bandera && m.t0 >= 0.1).forEach((m, i) => {
        const t = m.t0
        k.play('pop', t, { gain: 0.9, f: 560 + (i % 3) * 60, pan: [-0.3, 0.35, 0][i % 3] }); k.play('swish', t + 0.12, { gain: 0.5, dur: 0.2 }); k.play('tock', t + 0.3, { gain: 0.45, f: 700 })
      })
    },
  })
}
