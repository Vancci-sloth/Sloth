// El encuadre de cada toma, sin adivinar: la cámara más cercana que deja todo lo que la toma tiene que enseñar (objetos
// 3D con su radio y tarjetas 2D con su tamaño en px) dentro de la zona útil, entre el texto de arriba (o el índice) y el
// perro. guion.ts escribe sus TOMAS y saca de ellas sus PLANOS con `planosDe`: la cámara no se copia a mano, y al
// cambiar una toma su plano cambia solo. `npm run encuadre -- --revisa` los mide.
import * as THREE from "three";
import { ALTO, ANCHO } from "../tema";
import { CENTRO_Y, FOV, Plano, proyectar, V3 } from "./camara";

/** Algo que la toma tiene que enseñar: un objeto 3D (`r`, su radio) o una tarjeta 2D clavada en el mundo (`caja`, su
 * tamaño en px como en EnMundo, qué punto de la caja va en `p` y cuánto se corre). */
export type Cosa = { n: string; p: V3; r?: number; caja?: { w: number; h: number; origen?: [number, number]; desplaza?: [number, number] } };

/**
 * Una toma por idea: desde `en` la cámara va (en `dura` cuadros, 30 por omisión) a ver sus `cosas` desde el azimut `az`
 * (0 es de frente desde +z, positivo desde la derecha) y la elevación `el` (cuánto desde arriba). `arriba`, dónde
 * empieza la zona útil (575 si hay un índice fijo arriba); `lejos`, cuánto más lejos que la distancia justa (1.3 deja
 * aire). `deriva`, `arco` y `fov`, como en `Plano`.
 */
export type Toma = { n: string; en: number; dura?: number; az: number; el: number; arriba?: number; cosas: Cosa[]; lejos?: number; deriva?: number; arco?: V3; fov?: number };

/** Si hay un índice fijo arriba (1 · 2 · 3), lo de arriba empieza debajo de él: `arriba: INDICE`. */
export const INDICE = 575;

const k = (d: number, fov = FOV) => ALTO / 2 / Math.tan((fov * Math.PI) / 360) / d;

export const camaraFija = (pos: THREE.Vector3, mira: THREE.Vector3, fov = FOV) => {
  const cam = new THREE.PerspectiveCamera(fov, ANCHO / ALTO, 0.05, 400);
  cam.position.copy(pos);
  cam.lookAt(mira);
  cam.setViewOffset(ANCHO, ALTO, 0, ALTO / 2 - CENTRO_Y, ANCHO, ALTO);
  cam.updateMatrixWorld();
  return cam;
};

/** La caja en pantalla de una cosa: [x0, y0, x1, y1]. */
export const cajaDe = (cam: THREE.PerspectiveCamera, c: Cosa) => {
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

export const zona = (t: Toma) => ({ x0: 90, x1: 990, y0: t.arriba ?? 500, y1: 1320 });

const r2 = (v: THREE.Vector3) => v.toArray().map((x) => Math.round(x * 100) / 100) as V3;

/** La cámara de una toma: `pos`, `mira` y a qué distancia quedó. */
export const encuadra = (t: Toma): { pos: V3; mira: V3; d: number } => {
  // Un margen de 20 px: la cámara respira unos centímetros y, de cerca, eso mueve el cuadro (nuevo-9).
  const z0 = zona(t);
  const z = { x0: z0.x0 + 20, x1: z0.x1 - 20, y0: z0.y0 + 20, y1: z0.y1 - 20 };
  const fov = t.fov ?? FOV;
  const a = (t.az * Math.PI) / 180;
  const e = (t.el * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  const mira = t.cosas.reduce((s, c) => s.add(new THREE.Vector3(...c.p)), new THREE.Vector3()).divideScalar(t.cosas.length);
  let d = 10;
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    let [lo, hi] = [1.2, 80];
    for (let i = 0; i < 40; i++) {
      d = (lo + hi) / 2;
      const [x0, y0, x1, y1] = todo(camaraFija(mira.clone().add(dir.clone().multiplyScalar(d)), mira, fov), t.cosas);
      if (x1 - x0 <= z.x1 - z.x0 && y1 - y0 <= z.y1 - z.y0) hi = d;
      else lo = d;
    }
    d = hi * (t.lejos ?? 1);
    const cam = camaraFija(mira.clone().add(dir.clone().multiplyScalar(d)), mira, fov);
    const [x0, y0, x1, y1] = todo(cam, t.cosas);
    const dx = (x0 + x1) / 2 - (z.x0 + z.x1) / 2;
    const dy = (y0 + y1) / 2 - (z.y0 + z.y1) / 2;
    const derecha = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const arriba = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    mira.add(derecha.multiplyScalar(dx / k(d, fov))).add(arriba.multiplyScalar(-dy / k(d, fov)));
  }
  const pos = mira.clone().add(dir.multiplyScalar(d));
  return { pos: r2(pos), mira: r2(mira), d };
};

/** Los planos de la cámara, uno por toma. */
export const planosDe = (tomas: Toma[]): Plano[] =>
  tomas.map((t) => {
    const { pos, mira } = encuadra(t);
    return { en: t.en, pos, mira, dura: t.dura, deriva: t.deriva, arco: t.arco, fov: t.fov };
  });
