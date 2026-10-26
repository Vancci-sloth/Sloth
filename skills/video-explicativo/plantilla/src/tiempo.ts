// La voz manda: cada cosa aparece en el cuadro en que se dice su palabra. voz.json lo escribe scripts/alinear.py con
// los tiempos de WhisperX sobre la grabación (palabras), las frases de los subtítulos (subtitulos.txt) y el nivel de la
// voz en cada cuadro (boca).
import voz from "./datos/voz.json";
import { FPS } from "./tema";

export type Palabra = { w: string; s: number; e: number };
export type PalabraFrase = { t: string; i: number; clave: boolean; caja: boolean; icono?: string | null };
export type Frase = { palabras: PalabraFrase[] };

export const PALABRAS: Palabra[] = voz.palabras;
export const FRASES: Frase[] = voz.frases as Frase[];
export const BOCA: number[] = voz.boca;
export const DURACION = Math.ceil((voz.duracion + 0.6) * FPS);

export const cuadro = (s: number) => Math.round(s * FPS);

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ%$]/g, "");

/** Índice de la palabra de la voz donde empieza `texto` (la n-ésima vez que se dice). */
export const indice = (texto: string, n = 1): number => {
  const buscadas = texto.split(/\s+/).map(normal).filter(Boolean);
  let vistas = 0;
  for (let i = 0; i + buscadas.length <= PALABRAS.length; i++) {
    if (buscadas.every((b, k) => normal(PALABRAS[i + k].w) === b) && ++vistas === n) return i;
  }
  throw new Error(`La voz no dice «${texto}» (vez ${n})`);
};

/** Cuadro en que empieza a decirse `texto`. */
export const en = (texto: string, n = 1) => cuadro(PALABRAS[indice(texto, n)].s);

/** Cuadro en que se termina de decir `texto`. */
export const fin = (texto: string, n = 1) => {
  const i = indice(texto, n) + texto.split(/\s+/).filter((p) => normal(p)).length - 1;
  return cuadro(PALABRAS[i].e);
};
