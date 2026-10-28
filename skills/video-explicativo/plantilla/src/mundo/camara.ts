// La cámara del mundo 3D: un solo mundo para todo el video y una cámara que lo recorre sin cortes. Cada `Plano` dice
// desde qué cuadro va hacia dónde (`pos`), qué mira (`mira`) y en cuántos cuadros llega; con `arco` el camino se curva
// por ese punto (para rodear algo en vez de cruzarlo). Mientras sostiene un plano, rodea despacio lo que mira (`deriva`,
// en grados; un plano sí, otro no, al lado contrario) y respira un poco: nunca está quieta.
//
// Es una función pura del cuadro: el lienzo 3D la copia, y lo 2D que vive en el mundo (EnMundo) la usa para saber dónde
// cae cada punto en la pantalla.
import { createContext, useContext } from "react";
import { Easing } from "remotion";
import * as THREE from "three";
import { ALTO, ANCHO, ZONA } from "../tema";

export type V3 = [number, number, number];
export type Plano = { en: number; pos: V3; mira: V3; fov?: number; dura?: number; arco?: V3; deriva?: number };

/** El campo de visión vertical, en grados: el mismo en los dos formatos (en horizontal, a lo ancho cabe el triple). */
export const FOV = 32;
/** Cuántos grados rodea la mira un plano sostenido si no dice otra cosa (0, quieta; negativo, al otro lado). */
export const DERIVA = 6;
/**
 * Dónde cae la mira en la pantalla: el centro de la zona entre el texto de arriba y el perro (vertical), o arriba a la
 * izquierda del texto y del personaje (horizontal). Ver `ZONA` en tema.ts.
 */
export const [CENTRO_X, CENTRO_Y] = ZONA.mira;
/** Píxeles que mide un metro a un metro de la cámara (a `d` metros, K / d): 3348 en vertical, 1883 en horizontal. */
export const K = Math.round(ALTO / 2 / Math.tan((FOV * Math.PI) / 360));

/** Corre el cuadro para que la mira caiga en (CENTRO_X, CENTRO_Y) y no en el centro de la pantalla. */
export const centrar = (cam: THREE.PerspectiveCamera) => cam.setViewOffset(ANCHO, ALTO, ANCHO / 2 - CENTRO_X, ALTO / 2 - CENTRO_Y, ANCHO, ALTO);

const curva = Easing.inOut(Easing.cubic);
export const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

type Vista = { pos: THREE.Vector3; mira: THREE.Vector3; fov: number };

const ARRIBA = new THREE.Vector3(0, 1, 0);

export const vistaEn = (planos: Plano[], f: number): Vista => {
  const v: Vista = { pos: v3(planos[0].pos), mira: v3(planos[0].mira), fov: planos[0].fov ?? FOV };
  planos.forEach((p, i) => {
    if (f < p.en) return;
    if (i > 0) {
      const t = curva(Math.min(1, (f - p.en) / (p.dura ?? 30)));
      const destino = v3(p.pos);
      if (p.arco) {
        const c = v3(p.arco);
        v.pos = v.pos.clone().lerp(c, t).lerp(c.clone().lerp(destino, t), t);
      } else v.pos.lerp(destino, t);
      v.mira.lerp(v3(p.mira), t);
      v.fov += ((p.fov ?? FOV) - v.fov) * t;
    }
    // Ya llegó: rodea la mira hasta que arranca el plano siguiente (ahí se queda, y de ahí sale el siguiente).
    const quieto = Math.min(f, planos[i + 1]?.en ?? f) - (i > 0 ? p.en + (p.dura ?? 30) : 0);
    if (quieto <= 0) return;
    const grados = (p.deriva ?? (i % 2 ? -DERIVA : DERIVA)) * (1 - Math.exp(-quieto / 90)) * Math.min(1, quieto / 20);
    v.pos = v.pos.clone().sub(v.mira).applyAxisAngle(ARRIBA, (grados * Math.PI) / 180).add(v.mira);
  });
  return v;
};

export const camaraDe = (planos: Plano[], f: number) => {
  const v = vistaEn(planos, f);
  const cam = new THREE.PerspectiveCamera(v.fov, ANCHO / ALTO, 0.05, 400);
  // Respira: unos centímetros de vaivén, como cámara en mano.
  cam.position.copy(v.pos).add(new THREE.Vector3(Math.sin(f / 53) * 0.035, Math.sin(f / 41) * 0.03, Math.sin(f / 67) * 0.03));
  cam.lookAt(v.mira.clone().add(new THREE.Vector3(Math.sin(f / 61) * 0.02, Math.sin(f / 47) * 0.02, 0)));
  centrar(cam);
  cam.updateMatrixWorld();
  return cam;
};

/** Dónde cae un punto del mundo en la pantalla (px) y a qué profundidad está de la cámara. */
export const proyectar = (cam: THREE.PerspectiveCamera, p: V3) => {
  const w = v3(p);
  const prof = -w.clone().applyMatrix4(cam.matrixWorldInverse).z;
  const n = w.project(cam);
  return { x: ((n.x + 1) / 2) * ANCHO, y: ((1 - n.y) / 2) * ALTO, prof };
};

/** Cuánto se movió la imagen entre el cuadro anterior y este (px): para el desenfoque de barrido. */
export const rapidezDe = (planos: Plano[], f: number) => {
  if (f <= 0) return 0;
  const antes = camaraDe(planos, f - 1);
  const ahora = camaraDe(planos, f);
  const mira = vistaEn(planos, f).mira;
  let max = 0;
  for (const d of [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]) {
    const p = mira.clone().add(d).toArray() as V3;
    const a = proyectar(antes, p);
    const b = proyectar(ahora, p);
    max = Math.max(max, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return max;
};

export const CamaraContexto = createContext<THREE.PerspectiveCamera | null>(null);
export const useCamara = () => {
  const c = useContext(CamaraContexto);
  if (!c) throw new Error("Falta CamaraContexto");
  return c;
};
