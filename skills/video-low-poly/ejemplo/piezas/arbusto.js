// El cafeto: un arbusto de copas facetadas; sus cerezas rojas salen de una en una después de que brota.
registrarPieza('arbusto', {
  radio: 0.7, alto: 1.4,
  crear({ THREE, K, PAL, tone, jitter, facet, merge, faceted, mesh }) {
    const partes = []
    const tronco = new THREE.CylinderGeometry(0.05, 0.08, 0.5, 5); tronco.translate(0, 0.25, 0)
    partes.push(facet(tronco, (c) => tone(PAL.trunk, c.y * 9)))
    ;[[0, 0.75, 0, 0.42], [0.28, 0.55, 0.12, 0.3], [-0.26, 0.6, -0.08, 0.32], [0.05, 1.05, 0.05, 0.28]].forEach(([x, y, z, r], i) => {
      const g = jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.15, 40 + i); g.translate(x, y, z)
      partes.push(facet(g, (c, n) => tone(i % 2 ? PAL.forest : PAL.leaf, c.x * 13 + c.y * 7 + c.z * 3 + i, 1.1).multiplyScalar(0.9 + 0.15 * n.y)))
    })
    const grupo = new THREE.Group(); grupo.add(mesh(merge(partes), faceted()))
    const cereza = facet(new THREE.IcosahedronGeometry(0.06, 0), (c, n, i) => tone(PAL.accent, i, 0.5))
    const r = K.rng(7), cerezas = Array.from({ length: 14 }, (_, i) => {
      const a = i * 2.4, h = r.range(0.45, 1.15), d = 0.38 + 0.1 * Math.sin(i)
      const m = mesh(cereza, faceted({ roughness: 0.5 })); m.position.set(Math.cos(a) * d, h, Math.sin(a) * d * 0.9 + 0.12); grupo.add(m)
      return { m, dt: 0.6 + i * 0.07 }
    })
    return { objeto: grupo, update(t, t0) { cerezas.forEach(({ m, dt }) => { const s = t0 < 0 ? 1 : K.spring(t - t0 - dt, 3, 0.4); m.visible = t0 < 0 || t > t0 + dt; m.scale.setScalar(Math.max(0.001, s)) }) } }
  },
  sonido(k, t0, { pan }) { k.play('pop', t0, { gain: 0.7, f: 520, pan }); for (let i = 0; i < 14; i++) k.play('tick', t0 + 0.6 + i * 0.07, { gain: 0.5, f: 4200 + (i % 4) * 300, pan }) },
})
