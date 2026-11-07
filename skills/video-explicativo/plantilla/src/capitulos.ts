// Los capítulos del video: cada cambio de tema (el fondo oscuro o el claro de `PALETA`) es un capítulo. Cambiar de capítulo no cambia de sitio:
// el mismo mundo 3D se repinta (fondo, piso, niebla y luces), y todo el cuadro se desenfoca y pasa por gris en ~6
// cuadros. Con cuál empieza (`tema` de momentos.json) y dónde cambia (`tema` de un momento) lo dice el director.
import { interpolate, interpolateColors } from "remotion";
import { fondoEn, TEMAS } from "./director/guion";
import { COLORES } from "./tema";

export { TEMAS };

const ANTES = 3; // cuadros de desenfoque antes del cambio
const DESPUES = 4; // y después

/** Lo claro de un color #rrggbb, de 0 a 1. */
const luminancia = (h: string) => {
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** El capítulo de este cuadro y, cerca de un cambio, el tema del otro lado y cuánto se mezclan (0 → 0.5). */
export const temaEn = (f: number) => {
  const n = Math.max(0, TEMAS.findLastIndex((c) => c.desde <= f));
  const cap = TEMAS[n];
  const siguiente = TEMAS[n + 1];
  let mezcla = 0;
  let otro = cap.tema;
  let borroso = 0;
  if (siguiente && f >= siguiente.desde - ANTES && siguiente.tema !== cap.tema) {
    otro = siguiente.tema;
    mezcla = interpolate(f, [siguiente.desde - ANTES, siguiente.desde], [0, 0.5]);
    borroso = interpolate(f, [siguiente.desde - ANTES, siguiente.desde], [0, 1]);
  } else if (n > 0 && f < cap.desde + DESPUES && TEMAS[n - 1].tema !== cap.tema) {
    otro = TEMAS[n - 1].tema;
    mezcla = interpolate(f, [cap.desde, cap.desde + DESPUES], [0.5, 0]);
    borroso = interpolate(f, [cap.desde, cap.desde + DESPUES], [1, 0]);
  }
  const delTema = (k: "fondo" | "linea" | "texto" | "tenue" | "rejilla") => interpolateColors(mezcla, [0, 1], [COLORES[cap.tema][k], COLORES[otro][k]]);
  // El fondo de la escena en que está (`fondo` de `escenas`), si lo trae: es lo que más pone el ambiente (la noche, el neón).
  const fondo = fondoEn(f);
  // El texto, blanco o negro según lo claro de ese fondo: con el tema claro sobre el morado del neón, los subtítulos del
  // SMS de Bienestar no se leían.
  const claro = fondo ? luminancia(fondo) > 0.5 : cap.tema === "claro";
  const color = (k: "fondo" | "linea" | "texto" | "tenue" | "rejilla") => {
    if (!fondo) return delTema(k);
    if (k === "texto") return claro ? COLORES.claro.texto : COLORES.oscuro.texto;
    if (k === "tenue") return claro ? COLORES.claro.tenue : COLORES.oscuro.tenue;
    return interpolateColors(k === "fondo" ? 0 : k === "rejilla" ? 0.08 : 0.04, [0, 1], [fondo, claro ? "#000000" : "#ffffff"]);
  };
  /** 0 = oscuro, 1 = claro, con la mezcla del cambio: para las luces del 3D. */
  const claridad = fondo ? (claro ? 1 : 0) : (cap.tema === "claro" ? 1 : 0) * (1 - mezcla) + (otro === "claro" ? 1 : 0) * mezcla;
  // Las tarjetas toman el tema de lo claro del fondo de la escena, como el texto.
  return { n, tema: fondo ? ((claro ? "claro" : "oscuro") as typeof cap.tema) : cap.tema, borroso, color, claridad };
};
