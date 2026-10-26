// Los capítulos del video: cada cambio de tema (oscuro o claro) es un capítulo. Cambiar de capítulo no cambia de sitio:
// el mismo mundo 3D se repinta (fondo, piso, niebla y luces), y todo el cuadro se desenfoca y pasa por gris en ~6
// cuadros.
import { interpolate, interpolateColors } from "remotion";
import { COLORES, Tema } from "./tema";
import { en } from "./tiempo";

export const TEMAS: { desde: number; tema: Tema }[] = [
  { desde: 0, tema: "oscuro" },
  { desde: en("pero primero"), tema: "claro" },
  { desde: en("entonces qué falló"), tema: "oscuro" },
  { desde: en("en julio"), tema: "claro" },
  { desde: en("ahora dice"), tema: "oscuro" },
];

const ANTES = 3; // cuadros de desenfoque antes del cambio
const DESPUES = 4; // y después

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
  const color = (k: "fondo" | "linea" | "texto" | "tenue") => interpolateColors(mezcla, [0, 1], [COLORES[cap.tema][k], COLORES[otro][k]]);
  /** 0 = oscuro, 1 = claro, con la mezcla del cambio: para las luces del 3D. */
  const claridad = (cap.tema === "claro" ? 1 : 0) * (1 - mezcla) + (otro === "claro" ? 1 : 0) * mezcla;
  return { n, tema: cap.tema, borroso, color, claridad };
};
