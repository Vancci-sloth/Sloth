// De quién es el video: a qué red y a qué cuenta invita el cierre, con qué foto, y quién narra abajo. Lo escribe
// scripts/marca.py de la skill (`aplicar`) desde el marca.json de la carpeta de la card; no se edita a mano.
import datos from "./datos/marca.json";

/** A dónde invita el cierre. `web` es una página propia; `ninguna`, sin tarjeta de cierre. */
export type Red = "telegram" | "whatsapp" | "instagram" | "tiktok" | "youtube" | "x" | "web" | "ninguna";

export const MARCA = datos as {
  red: Red;
  /** El nombre de la cuenta, el canal o la página, como se ve en la tarjeta. */
  nombre: string;
  /** La foto de la tarjeta, en public; sin ella, el logo de la red. */
  avatar?: string;
  /** `perro`, uno propio o `ninguno` (sin narrador abajo). */
  personaje: string;
};

/** Si abajo hay narrador. */
export const CON_PERSONAJE = MARCA.personaje !== "ninguno";
