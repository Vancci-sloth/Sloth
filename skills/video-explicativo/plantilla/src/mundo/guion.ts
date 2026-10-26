// El guion del mundo 3D de este video, atado a las palabras de la voz con en(): cuándo pasa cada cosa (T), dónde vive
// cada cosa (L), qué le pasa a la moneda protagonista (monedaEn), qué precio lleva pegado (precioEn) y qué enseña la
// cámara en cada idea (TOMAS, que encuadra.ts vuelve PLANOS). Se reescribe en cada video; el de Berachain, completo,
// está en ~/.claude/skills/video-explicativo/ejemplos/berachain/src/mundo/guion.ts (aún con los planos a mano).
import { Easing, interpolate, spring } from "remotion";
import { FPS } from "../tema";
// import { en } from "../tiempo";
import type { EstadoMoneda, Rota } from "../modelos/moneda";
import type { V3 } from "./camara";
import { Cosa, planosDe, Toma } from "./encuadra";

/**
 * Los momentos, en cuadros: el cuadro en que la voz dice cada palabra que dispara algo. P. ej.
 * `rompe: en("dieciocho")`, `apps: en("apps")`, `vender: en("vender", 2)` (la segunda vez que lo dice).
 */
export const T = {
  pero: 300, // «pero primero»: en("pero primero")
};

/**
 * Los lugares del mundo, en metros. El piso es y = 0 y la cámara mira hacia −z. En vertical cabe muy poco a lo ancho
 * (a 10 m se ven ~2.8 m de lado a lado): lo que tiene que verse junto va en fila hacia el fondo, no a los lados.
 */
export const L = {
  casa: [0, 1.08, 3.6] as V3, // la casa de la moneda: parada en el piso; el gancho y el cierre pasan aquí
};

// ---------------------------------------------------------------------------------------------------------------------
// La moneda protagonista

type Paso = { en: number; pos: V3; escala: number; dura?: number };

/** Por dónde anda la moneda. Con escala 0 desaparece; si estaba en 0, aparece ya en su sitio nuevo (no viaja). */
const PASOS: Paso[] = [{ en: 0, pos: L.casa, escala: 1 }];

const curva = Easing.inOut(Easing.cubic);

const pasoEn = (f: number) => {
  let pos = [...PASOS[0].pos] as V3;
  let escala = PASOS[0].escala;
  for (const p of PASOS.slice(1)) {
    if (f < p.en) break;
    const t = curva(Math.min(1, (f - p.en) / (p.dura ?? 24)));
    if (escala < 0.01) pos = [...p.pos] as V3;
    else pos = pos.map((v, i) => v + (p.pos[i] - v) * t) as V3;
    escala += (p.escala - escala) * t;
  }
  return { pos, escala };
};

/** Un resorte de 0 a 1 que empieza en `desde`. */
export const resorte = (f: number, desde: number, rigidez = 80) => spring({ frame: f - desde, fps: FPS, config: { damping: 14, stiffness: rigidez } });

/**
 * Cómo está la moneda en el cuadro `f`. Entra girando (ya a medio entrar en el cuadro 0: la miniatura del feed no
 * puede ir vacía) y se mece apenas. Aquí se suman sus vueltas (`resorte` en la palabra), su brillo, su gris, su
 * candado y, con `rota`, el momento en que se deshace en cubos (ver el ejemplo de Berachain).
 */
export const monedaEn = (f: number): { e: EstadoMoneda; rota?: Rota } => {
  const { pos, escala } = pasoEn(f);
  const entrada = spring({ frame: f + 14, fps: FPS, config: { damping: 20, stiffness: 70 } });
  const giro = (1 - entrada) * Math.PI * 2.4 + Math.sin(f / 34) * (f < T.pero ? 0.55 : 0.15);
  return { e: { pos, escala: escala * (0.82 + 0.18 * entrada), giro, inclina: 0.1 + Math.sin(f / 47) * 0.07 } };
};

// ---------------------------------------------------------------------------------------------------------------------
// El precio pegado a la moneda

export type Precio = { valor: number; rojo: boolean; nota: string; tam: number; visible: number };

export const fundido = (f: number, desde: number, hasta: number) => interpolate(f, [desde, desde + 5, hasta - 5, hasta], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
export const corre = (f: number, desde: number, hasta: number, de: number, a: number) =>
  interpolate(f, [desde, hasta], [de, a], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

/**
 * El precio que la moneda lleva pegado cuando la historia habla de él; null cuando no. `tam` ≥ 120 es el grande del
 * gancho (sin tarjeta); menos, en su tarjeta chica. `nota` es la fecha y la fuente.
 */
export const precioEn = (f: number): Precio | null => {
  void f;
  return null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Las tomas: qué tiene que verse en cada idea y desde dónde. encuadra.ts saca la cámara de cada una (va al final: usa
// monedaEn y lo demás de arriba).

const moneda = (f: number): Cosa => {
  const m = monedaEn(f).e;
  return { n: "moneda", p: m.pos, r: m.escala * 1.05 };
};
const bajoMoneda = (f: number, w: number, h: number): Cosa => {
  const m = monedaEn(f).e;
  return { n: "bajo la moneda", p: [m.pos[0], m.pos[1] - m.escala * 1.2, m.pos[2]], caja: { w, h, origen: [0.5, 0] } };
};
export const sobreMoneda = (f: number, w: number, h: number): Cosa => {
  const m = monedaEn(f).e;
  return { n: "sobre la moneda", p: [m.pos[0], m.pos[1] + m.escala * 1.15, m.pos[2]], caja: { w, h, origen: [0.5, 1] } };
};

/** Una toma por idea; el de nuevo-9, con 35, está en trabajo/video-explicativo/nuevo-9/src/mundo/guion.ts. */
export const TOMAS: Toma[] = [
  { n: "gancho", en: 0, az: 0, el: 12, cosas: [moneda(60), bajoMoneda(60, 600, 200)], lejos: 1.15 },
  { n: "gancho2", en: 1, dura: T.pero - 1, az: 0, el: 10, cosas: [moneda(60), bajoMoneda(60, 600, 200)] },
];

/** Los planos de la cámara, uno por toma. */
export const PLANOS = planosDe(TOMAS);
