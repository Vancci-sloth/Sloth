// La taza: brota en su plato, el café sube dentro y empieza a humear.
registrarPieza('taza', {
  radio: 0.7, alto: 1.5, escala: 1.4,
  crear({ THREE, K, PAL, tone, jitter, facet, merge, faceted, mesh }) {
    const grupo = new THREE.Group()
    const plato = new THREE.CylinderGeometry(0.55, 0.45, 0.06, 12); plato.translate(0, 0.03, 0)
    const cuerpo = new THREE.CylinderGeometry(0.4, 0.3, 0.6, 12, 1, true); cuerpo.translate(0, 0.36, 0)
    const fondo = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12); fondo.translate(0, 0.08, 0)
    const asa = new THREE.TorusGeometry(0.14, 0.04, 5, 8, Math.PI); asa.rotateZ(-Math.PI / 2); asa.translate(0.42, 0.38, 0)
    const pinta = (c, n, i) => tone(c.y > 0.5 && c.y < 0.58 ? PAL.accent : PAL.paper, i, 0.5)
    grupo.add(mesh(merge([facet(plato, pinta), facet(cuerpo, pinta), facet(fondo, pinta), facet(asa, pinta)]), (() => { const m = faceted(); m.side = THREE.DoubleSide; return m })()))
    const cafe = mesh(facet(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), (c, n, i) => tone(PAL.trunk, i, 0.4)), faceted({ roughness: 0.3 })); grupo.add(cafe)
    const vapor = [0, 1, 2].flatMap((w) => [0, 1, 2, 3].map((k) => { const m = mesh(facet(new THREE.IcosahedronGeometry(0.06, 0), (c, n, i) => tone(PAL.cloudSide, i, 0.3)), faceted({ glow: 0.22 })); m.castShadow = false; grupo.add(m); return { m, w, k } }))
    return {
      objeto: grupo,
      update(t, t0) {
        const u = t0 < 0 ? 1 : K.seg(t, t0 + 0.6, t0 + 2.2, K.ease.inOut), h = 0.1 + 0.45 * u, r = 0.3 + 0.1 * (h - 0.06) / 0.6
        cafe.position.y = h; cafe.scale.set(r, 1, r); cafe.visible = u > 0.01
        vapor.forEach(({ m, w, k }) => { const v = ((t * 0.5 + k / 4 + w * 0.33) % 1); const on = t0 < 0 ? 1 : K.seg(t, t0 + 1.6, t0 + 2.4); m.position.set(-0.15 + w * 0.15 + 0.06 * Math.sin(t * 2 + k + w), 0.65 + v * 0.7, 0.04 * Math.cos(t * 3 + k)); m.scale.setScalar(Math.max(0.001, on * (0.6 + v) * (1 - v))) })
      },
    }
  },
  sonido(k, t0, { pan }) { k.play('pop', t0, { gain: 0.8, f: 600, pan }); k.play('tape', t0 + 0.6, { dur: 1.6, gain: 0.5, pan }); k.play('ding', t0 + 2.2, { gain: 0.35, f: 'E6', pan }) },
})
