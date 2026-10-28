import voz from "../public/voz.json";

// El formato del reel, el de la línea `Formato:` del mensaje: lo pone `nuevo.py --formato` y lo leen la composición y
// los scripts (comun.py). Un reel se compone en uno solo desde el principio; cómo va cada plano en cada uno, en
// «El formato» de ESCENAS.md.
export type Formato = "vertical" | "horizontal";
export const FORMATO = "vertical" as Formato;
export const HORIZONTAL = FORMATO === "horizontal";
/** El valor de cada formato: `segun(780, 1240)` es 780 en vertical y 1240 en horizontal. */
export const segun = <T,>(vertical: T, horizontal: T): T => (HORIZONTAL ? horizontal : vertical);

export const FPS = 30;
export const W = segun(1080, 1920);
export const H = segun(1920, 1080);
/** El alto de los recortes respecto al vertical: en horizontal, plano abierto a lo ancho y lugar para volar. Las poses
 * ya lo traen (`pose()`); a las criaturas y la utilería dales su alto del vertical por esto. */
export const ESCALA = segun(1, 0.75);

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
