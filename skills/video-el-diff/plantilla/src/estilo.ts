import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as jetbrains } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as lilita } from "@remotion/google-fonts/LilitaOne";
import { loadFont as silkscreen } from "@remotion/google-fonts/Silkscreen";
import { loadFont as newsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as courier } from "@remotion/google-fonts/CourierPrime";

export const FUENTE = {
  titulo: anton("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily,
  gorda: lilita("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily,
  ui: inter("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily,
  codigo: jetbrains("normal", { weights: ["400", "700"], subsets: ["latin"] }).fontFamily,
  pixel: silkscreen("normal", { weights: ["400", "700"], subsets: ["latin", "latin-ext"] }).fontFamily,
  serif: newsreader("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] }).fontFamily,
  maquina: courier("normal", { weights: ["400", "700"], subsets: ["latin", "latin-ext"] }).fontFamily,
};

export const COLOR = {
  fondo: "#0d0d10",
  crema: "#f4ead2",
  rojo: "#ff3b30",
  naranja: "#ff7a1a",
  amarillo: "#ffd23f",
  verde: "#35d07f",
  azul: "#4c8dff",
  morado: "#a77bff",
  gris: "#8b8b95",
  resaltador: "rgba(255, 140, 26, 0.85)",
};

/** Rellenos de los titulares grandes. */
export const RELLENO: Record<string, { fondo: string; borde: string; sombra: string }> = {
  crema: { fondo: COLOR.crema, borde: "transparent", sombra: "rgba(0,0,0,0.5)" },
  fuego: { fondo: "linear-gradient(180deg, #ffe066 0%, #ff9a1f 45%, #ff3d17 100%)", borde: "#5a0b00", sombra: "#2a0500" },
  sol: { fondo: "linear-gradient(180deg, #fff3a0 0%, #ffc531 50%, #ff8a00 100%)", borde: "#5a2a00", sombra: "#2a1300" },
  rojo: { fondo: "linear-gradient(180deg, #ff6b5e 0%, #ff2d20 60%, #c10f0f 100%)", borde: "#3d0000", sombra: "#1a0000" },
  verde: { fondo: "linear-gradient(180deg, #b6ffcf 0%, #35d07f 60%, #129c55 100%)", borde: "#003d1c", sombra: "#001a0b" },
  azul: { fondo: "linear-gradient(180deg, #bcd4ff 0%, #4c8dff 60%, #1f4fd1 100%)", borde: "#001a4d", sombra: "#000a1f" },
};
