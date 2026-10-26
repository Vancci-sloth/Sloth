// Encuadres sin renderizar. Cada toma de la lista dice qué tiene que verse: objetos 3D (centro y radio en el mundo) y
// tarjetas 2D clavadas en el mundo (su punto, su tamaño en px, qué punto de la caja va en él y cuánto se corre), y desde
// dónde se mira (azimut: 0 es de frente desde +z, positivo desde la derecha; elevación: cuánto desde arriba). Calcula
// la cámara más cercana que deja todo dentro de la zona útil (entre el texto de arriba —o el índice— y el perro), lo
// centra e imprime el plano para guion.ts. Con --revisa dice, para los planos actuales, qué se sale.
//   npx esbuild scripts/encuadre.ts --bundle --platform=node --outfile=out/encuadre.cjs --log-level=warning && node out/encuadre.cjs
import * as THREE from "three";
import { camaraDe, CENTRO_Y, FOV, proyectar, V3 } from "../src/mundo/camara";
import { L, monedaEn, PLANOS, T } from "../src/mundo/guion";
import { ALTO, ANCHO } from "../src/tema";

type Cosa = { n: string; p: V3; r?: number; caja?: { w: number; h: number; origen?: [number, number]; desplaza?: [number, number] } };
type Toma = { n: string; f: number; az: number; el: number; arriba?: number; cosas: Cosa[] };

const moneda = (f: number): Cosa => {
  const m = monedaEn(f).e;
  return { n: "moneda", p: m.pos, r: m.escala * 1.05 };
};
const bajoMoneda = (f: number, w: number, h: number): Cosa => {
  const m = monedaEn(f).e;
  return { n: "bajo la moneda", p: [m.pos[0], m.pos[1] - m.escala * 1.2, m.pos[2]], caja: { w, h, origen: [0.5, 0] } };
};
const sobreMoneda = (f: number, w: number, h: number): Cosa => {
  const m = monedaEn(f).e;
  return { n: "sobre la moneda", p: [m.pos[0], m.pos[1] + m.escala * 1.15, m.pos[2]], caja: { w, h, origen: [0.5, 1] } };
};
const panal: Cosa = { n: "panal", p: [L.panal[0], 1.15, L.panal[2]], r: 1.35 };
const fantasma: V3 = [0, 0.45, 1.0];
const INDICE = 575; // en «qué falló», lo de arriba empieza bajo el índice 1 · 2 · 3

const TOMAS: Toma[] = [
  { n: "recompensa", f: T.regalar + 10, az: -10, el: -4, cosas: [moneda(T.regalar + 10), bajoMoneda(T.regalar + 10, 560, 110)] },
  {
    n: "imprime de más",
    f: T.menos + 20,
    az: 22,
    el: 16,
    arriba: INDICE,
    cosas: [
      { n: "cabeza", p: L.cabeza, r: 0.6 },
      { n: "montón", p: [-1.3, 0.2, 0.3], r: 0.7 },
      { n: "BGT", p: [-1.7, 1.05, 0.6], caja: { w: 340, h: 95, origen: [0.5, 1] } },
      { n: "BERA", p: [1.1, 1.05, 0.5], caja: { w: 300, h: 95, origen: [0.5, 1] } },
      { n: "prueba", p: [-0.5, 1.95, 0.05], caja: { w: 660, h: 220, origen: [0.5, 1] } },
    ],
  },
  {
    n: "precio",
    f: T.lanza,
    az: -48,
    el: 14,
    arriba: INDICE,
    cosas: [moneda(T.lanza), bajoMoneda(T.lanza, 320, 150), { n: "calendario", p: monedaEn(T.lanza).e.pos, caja: { w: 250, h: 290, origen: [0, 0.5], desplaza: [250, -60] } }],
  },
  {
    n: "bóveda",
    f: T.t43 + 10,
    az: -52,
    el: 20,
    arriba: INDICE,
    cosas: [
      { n: "bóveda", p: [L.boveda[0], 0.75, L.boveda[2]], r: 0.95 },
      { n: "montón", p: [L.boveda[0] + 0.6, 0.2, L.boveda[2] + 1.6], r: 0.8 },
      { n: "calendario", p: [L.boveda[0], 0.75, L.boveda[2]], caja: { w: 220, h: 260, origen: [0.5, 0.5], desplaza: [300, -230] } },
      { n: "fichas", p: [L.boveda[0], 0, L.boveda[2] + 0.7], caja: { w: 420, h: 90, origen: [0.5, 0] } },
      { n: "cuenta", p: [L.boveda[0] + 0.9, 1.2, L.boveda[2] + 1.8], caja: { w: 360, h: 100, origen: [0.5, 1] } },
    ],
  },
  {
    n: "balancer",
    f: T.exchange + 20,
    az: -42,
    el: 12,
    arriba: INDICE,
    cosas: [
      { n: "balancer", p: L.balancer, r: 0.8 },
      { n: "bex", p: L.bex, r: 0.7 },
      { n: "confianza", p: [-2.3, 0.2, -14.2], caja: { w: 726, h: 100, origen: [0.5, 0] } },
    ],
  },
  {
    n: "se detiene",
    f: T.doce + 10,
    az: -32,
    el: 16,
    arriba: INDICE,
    cosas: [
      { n: "cabeza", p: L.cabeza, r: 0.6 },
      { n: "fantasma", p: fantasma, r: 0.6 },
      { n: "tuit", p: [0.2, 2.3, 0.4], caja: { w: 660, h: 290, origen: [0.5, 1] } },
      { n: "12M", p: [0.9, 0.3, 1.4], caja: { w: 240, h: 80, origen: [0, 0.5] } },
    ],
  },
  {
    n: "brevan",
    f: T.anio + 10,
    az: 4,
    el: 8,
    arriba: INDICE,
    cosas: [
      moneda(T.anio + 10),
      { n: "brevan", p: L.brevan, r: 0.48 },
      { n: "the block", p: [L.casa[0] + 0.3, L.brevan[1] + 0.5, L.casa[2]], caja: { w: 660, h: 170, origen: [0.5, 1] } },
      { n: "plazo", p: [L.casa[0], 0, L.casa[2] + 0.9], caja: { w: 720, h: 80, origen: [0.5, 0] } },
    ],
  },
  { n: "jubilado", f: T.corazon + 10, az: -10, el: -4, cosas: [moneda(T.corazon + 10), sobreMoneda(T.corazon + 10, 660, 220)] },
  { n: "mínimo", f: T.minimo + 10, az: -10, el: -4, cosas: [moneda(T.minimo + 10), bajoMoneda(T.minimo + 10, 320, 150)] },
  {
    n: "nasdaq",
    f: T.valia + 10,
    az: 24,
    el: 12,
    cosas: [
      { n: "nasdaq", p: L.nasdaq, r: 0.55 },
      moneda(T.valia + 10),
      { n: "gnln", p: [L.nasdaq[0], L.nasdaq[1] - 0.62, L.nasdaq[2]], caja: { w: 200, h: 70, origen: [0.5, 0] } },
      { n: "barras", p: [L.nasdaq[0] - 0.6, L.nasdaq[1] + 0.75, L.nasdaq[2]], caja: { w: 680, h: 330, origen: [0.5, 1] } },
    ],
  },
  { n: "panal", f: T.treinta, az: 14, el: 10, cosas: [panal, { n: "tvl", p: [L.panal[0], 1.6, L.panal[2] + 0.4], caja: { w: 560, h: 160, origen: [0.5, 0.5] } }] },
];

const k = (d: number, fov = FOV) => ALTO / 2 / Math.tan((fov * Math.PI) / 360) / d;

const camara = (pos: THREE.Vector3, mira: THREE.Vector3) => {
  const cam = new THREE.PerspectiveCamera(FOV, ANCHO / ALTO, 0.05, 400);
  cam.position.copy(pos);
  cam.lookAt(mira);
  cam.setViewOffset(ANCHO, ALTO, 0, ALTO / 2 - CENTRO_Y, ANCHO, ALTO);
  cam.updateMatrixWorld();
  return cam;
};

/** La caja en pantalla de una cosa: [x0, y0, x1, y1]. */
const cajaDe = (cam: THREE.PerspectiveCamera, c: Cosa) => {
  const p = proyectar(cam, c.p);
  if (c.caja) {
    const { w, h, origen = [0.5, 0.5], desplaza = [0, 0] } = c.caja;
    const x0 = p.x + desplaza[0] - origen[0] * w;
    const y0 = p.y + desplaza[1] - origen[1] * h;
    return [x0, y0, x0 + w, y0 + h];
  }
  const rpx = (c.r ?? 0) * k(p.prof, cam.fov);
  return [p.x - rpx, p.y - rpx, p.x + rpx, p.y + rpx];
};

const todo = (cam: THREE.PerspectiveCamera, cosas: Cosa[]) =>
  cosas.map((c) => cajaDe(cam, c)).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);

const zona = (t: Toma) => ({ x0: 90, x1: 990, y0: t.arriba ?? 500, y1: 1320 });

const encuadra = (t: Toma) => {
  const z = zona(t);
  const a = (t.az * Math.PI) / 180;
  const e = (t.el * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  const mira = t.cosas.reduce((s, c) => s.add(new THREE.Vector3(...c.p)), new THREE.Vector3()).divideScalar(t.cosas.length);
  let d = 10;
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    let [lo, hi] = [1.5, 80];
    for (let i = 0; i < 40; i++) {
      d = (lo + hi) / 2;
      const [x0, y0, x1, y1] = todo(camara(mira.clone().add(dir.clone().multiplyScalar(d)), mira), t.cosas);
      if (x1 - x0 <= z.x1 - z.x0 && y1 - y0 <= z.y1 - z.y0) hi = d;
      else lo = d;
    }
    d = hi;
    const cam = camara(mira.clone().add(dir.clone().multiplyScalar(d)), mira);
    const [x0, y0, x1, y1] = todo(cam, t.cosas);
    const dx = (x0 + x1) / 2 - (z.x0 + z.x1) / 2;
    const dy = (y0 + y1) / 2 - (z.y0 + z.y1) / 2;
    const derecha = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const arriba = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    mira.add(derecha.multiplyScalar(dx / k(d))).add(arriba.multiplyScalar(-dy / k(d)));
  }
  const pos = mira.clone().add(dir.multiplyScalar(d));
  const r = (v: THREE.Vector3) => `[${v.toArray().map((x) => Math.round(x * 100) / 100).join(", ")}]`;
  return `pos: ${r(pos)}, mira: ${r(mira)}  (d ${d.toFixed(1)})`;
};

const revisa = process.argv.includes("--revisa");
for (const t of TOMAS) {
  if (!revisa) {
    console.log(`${t.n.padEnd(15)} ${encuadra(t)}`);
    continue;
  }
  const z = zona(t);
  const cam = camaraDe(PLANOS, t.f);
  const partes = t.cosas.map((c) => {
    const [x0, y0, x1, y1] = cajaDe(cam, c);
    const fuera = x0 < z.x0 - 4 || x1 > z.x1 + 4 || y0 < z.y0 - 4 || y1 > z.y1 + 4;
    return `${fuera ? "✗" : "✓"} ${c.n} [${[x0, y0, x1, y1].map(Math.round).join(" ")}]`;
  });
  console.log(`${t.n.padEnd(15)} f${String(t.f).padStart(4)}  ${partes.join("  ")}`);
}
