import voz from "../public/voz.json";

export const FPS = 30;
export const W = 1080;
export const H = 1920;

type Palabra = { w: string; a: number; b: number };
type Frase = { i: number; texto: string; inicio: number; fin: number; palabras: Palabra[] };
const frases = voz.frases as Frase[];

// Frase de la voz -> fotograma. Las frases están numeradas como en audio/voz.py.
export const ini = (i: number) => Math.round(frases[i].inicio * FPS);
export const fin = (i: number) => Math.round(frases[i].fin * FPS);

/** Fotograma en que empieza la palabra `w` (por prefijo, sin acentos) dentro de la frase `i`. */
export const palabra = (i: number, w: string, despuesDe = 0) => {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const p = frases[i].palabras.find((p, k) => k >= despuesDe && norm(p.w).startsWith(norm(w)));
  if (!p) throw new Error(`No encontré "${w}" en la frase ${i}: ${frases[i].texto}`);
  return Math.round(p.a * FPS);
};

export const COLA = Math.round(0.2 * FPS); // el reel corta en la última palabra, como los de referencia
export const DURACION = Math.round(voz.duracion * FPS) + COLA;
