// La voz manda: cada cosa aparece en el cuadro en que se dice su palabra. voz.json lo escribe scripts/alinear.py con
// los tiempos de WhisperX sobre la grabación (palabras), las frases de los subtítulos (subtitulos.txt) y el nivel de la
// voz en cada cuadro (boca).
import { Easing, interpolate, spring } from "remotion";
import voz from "./datos/voz.json";
import { FPS } from "./tema";

export type Palabra = { w: string; s: number; e: number };
export type PalabraFrase = { t: string; i: number; clave: boolean; caja: boolean; icono?: string | null };
export type Frase = { palabras: PalabraFrase[] };

export const PALABRAS: Palabra[] = voz.palabras;
export const FRASES: Frase[] = voz.frases as Frase[];
export const BOCA: number[] = voz.boca;
export const DURACION = Math.ceil((voz.duracion + 0.6) * FPS);

/** El cuadro de un segundo de la voz: solo para lo que no se ata a una palabra (el gancho en el 0). */
export const cuadro = (s: number) => Math.round(s * FPS);

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ%$]/g, "");

/**
 * Índice de la palabra de la voz donde empieza `texto`: una palabra o varias seguidas («pero primero», «dos mil
 * quince»), sin importar tildes, mayúsculas ni signos. `n`, qué vez se dice: `en("estudio", 3)`. Si la voz no lo dice,
 * el error lo dice al revisar.
 */
export const indice = (texto: string, n = 1): number => {
  const buscadas = texto.split(/\s+/).map(normal).filter(Boolean);
  let vistas = 0;
  for (let i = 0; i + buscadas.length <= PALABRAS.length; i++) {
    if (buscadas.every((b, k) => normal(PALABRAS[i + k].w) === b) && ++vistas === n) return i;
  }
  throw new Error(`La voz no dice «${texto}» (vez ${n})`);
};

/** Cuadro en que empieza a decirse `texto` (como en `indice`). */
export const en = (texto: string, n = 1) => cuadro(PALABRAS[indice(texto, n)].s);

/** Cuadro en que se termina de decir `texto`. */
export const fin = (texto: string, n = 1) => {
  const i = indice(texto, n) + texto.split(/\s+/).filter((p) => normal(p)).length - 1;
  return cuadro(PALABRAS[i].e);
};

/** Un resorte de 0 a 1 que empieza en el cuadro `desde`: para que algo gire, entre o cambie de estado en su palabra. */
export const resorte = (f: number, desde: number, rigidez = 80) => spring({ frame: f - desde, fps: FPS, config: { damping: 14, stiffness: rigidez } });

/** 0 → 1 → 0: aparece en 5 cuadros desde `desde` y se va en los 5 antes de `hasta`. */
export const fundido = (f: number, desde: number, hasta: number) =>
  interpolate(f, [desde, desde + 5, hasta - 5, hasta], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** Un valor que corre de `de` a `a` entre dos cuadros, frenando al llegar: un número, una escala, una posición. */
export const corre = (f: number, desde: number, hasta: number, de: number, a: number) =>
  interpolate(f, [desde, hasta], [de, a], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
