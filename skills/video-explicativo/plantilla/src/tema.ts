// Medidas y colores del estilo: texto arriba, diagrama al centro y el personaje abajo; lo único de collage es el
// personaje, una foto recortada como sticker. Los colores de fondo son de cada video (`PALETA`).
import { loadFont as figtree } from "@remotion/google-fonts/Figtree";
import { loadFont as mono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as marcador } from "@remotion/google-fonts/PermanentMarker";

export const ANCHO = 1080;
export const ALTO = 1920;
export const FPS = 30;

const letra = figtree("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin", "latin-ext"] });
const mono_ = mono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const marcador_ = marcador("normal", { weights: ["400"], subsets: ["latin"] });
export const LETRA = letra.fontFamily;
export const MONO = mono_.fontFamily;
// Lo que el personaje escribe a mano en su cartel.
export const MARCADOR = marcador_.fontFamily;
/** Cuando ya cargaron las tres: los subtítulos miden cada palabra, y medir con la fuente de reserva las encima. */
export const FUENTES = Promise.all([letra.waitUntilDone(), mono_.waitUntilDone(), marcador_.waitUntilDone()]);

export type Tema = "oscuro" | "claro";

/**
 * Los colores de este video, que salen de su lugar (la `paleta` de fuentes/huella.json): el fondo de los capítulos
 * oscuros, con texto blanco encima (oscuro de verdad: un azul noche, un verde bosque, un café de madera vieja), el de
 * los claros, con texto negro (un papel, un hielo, un arena), y la luz de contra que tiñe los bordes (la tele, una
 * lámpara, el hielo). Estos son los de los primeros videos, un negro y un blanco: cada video pone los suyos.
 */
export const PALETA = { oscuro: "#0f0f0f", claro: "#f9f9f9", luz: "#f5a524" };
/** La cuadrícula del piso, la de los primeros videos. Si el lugar tiene su propio piso (madera, pasto, baldosa), false. */
export const REJILLA = true;

/** Mezcla dos colores #rrggbb: `t` = 0 es `a`, 1 es `b`. */
const mezcla = (a: string, b: string, t: number) => {
  const c = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t).toString(16).padStart(2, "0")).join("");
};

// Lo demás sale del fondo, en las mismas proporciones que el negro y el blanco de los primeros videos.
const oscuro = PALETA.oscuro;
const claro = PALETA.claro;
export const COLORES = {
  oscuro: {
    fondo: oscuro,
    linea: mezcla(oscuro, "#ffffff", 0.03),
    texto: "#ffffff",
    tenue: "#8a8a8a",
    tarjeta: mezcla(oscuro, "#ffffff", 0.03),
    tarjeta2: mezcla(oscuro, "#ffffff", 0.058),
    borde: mezcla(oscuro, "#ffffff", 0.11),
    sombra: "0 18px 50px rgba(0,0,0,0.55)",
    solido: mezcla(oscuro, "#ffffff", 0.12), // lo que tiene que verse de lejos: los bloques de la cadena
    rejilla: mezcla(oscuro, "#ffffff", 0.067),
  },
  claro: {
    fondo: claro,
    linea: mezcla(claro, "#000000", 0.036),
    texto: "#111111",
    tenue: "#8f8f8f",
    tarjeta: "#ffffff",
    tarjeta2: mezcla(claro, "#000000", 0.02),
    borde: mezcla(claro, "#000000", 0.08),
    sombra: "0 14px 40px rgba(0,0,0,0.10)",
    solido: "#1b1b1b",
    rejilla: mezcla(claro, "#000000", 0.084),
  },
};

// Colores con significado, iguales en los dos temas.
export const AZUL = "#2f80ed"; // la caja de selección
export const VERDE = "#22c55e";
export const ROJO = "#ef4444";
export const NARANJA = "#f7931a";
export const MIEL = "#f5a524"; // el oro: el protagonista y la luz de estudio

/**
 * Un color, un significado, igual en todo el video (y en el 3D). Lo que no significa nada (los bloques de la cadena)
 * usa DECORATIVOS, que no se cruzan con estos. Cada video dice en su guion qué es cada uno y, si necesita otro
 * significado, lo suma aquí. En Berachain: protagonista = BERA, segundo = BGT, ajeno = las monedas de otras cadenas,
 * regla = Proof of Liquidity y el canje 1:1.
 */
export const SIGNIFICA = {
  protagonista: MIEL, // el protagonista del video y lo que vale
  segundo: "#ff6f1a", // lo segundo en importancia de la historia
  ajeno: "#c3c9d2", // lo de otros: lo que no es del protagonista
  dinero: VERDE, // dinero
  pierde: ROJO, // lo que se pierde, se rompe, se vende o no se puede
  regla: AZUL, // las reglas del sistema: quién manda, cómo funciona
  apagado: "#7a7a7a", // lo jubilado, lo detenido
};
export const DECORATIVOS = ["#a855f7", "#ec4899", "#14b8a6", "#6366f1", "#d946ef", "#8b5cf6"];

// Zonas del cuadro. TikTok tapa ~140 px a la derecha (botones) y ~360 abajo (usuario y texto): lo importante va al centro.
export const ZONA = {
  texto: { centro: 330, ancho: 940 },
  escena: { arriba: 470, abajo: 1390 },
  personaje: { alto: 600 },
};
