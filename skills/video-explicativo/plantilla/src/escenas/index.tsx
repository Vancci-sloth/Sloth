// Lo 2D del video (las tarjetas de momentos.json, clavadas sobre sus cosas, y el cierre de la marca) y las poses del
// personaje, atadas a las palabras de la voz. Lo arma el director (src/director): no se escribe a mano.
import React from "react";
import { CANAL, POSES, TEMAS } from "../director/guion";
import { Tarjetas } from "../director/Escena";
import type { Tramo } from "../piezas/Personaje";
import { MARCADOR, ZONA } from "../tema";
import { Canal, PantallaCanal } from "./comun";

const Capa: React.FC = () => (
  <>
    <Tarjetas />
    {CANAL ? <Canal pero={CANAL.pero} unete={CANAL.unete} enlace={CANAL.enlace} /> : null}
  </>
);

/** Lo 2D de cada capítulo, en el orden de TEMAS: el mismo en todos (cada tarjeta ya sabe cuándo entra). */
export const CAPITULOS = TEMAS.map((t) => ({ ...t, Escena: Capa }));

/** Lo que el personaje escribió a mano en su cartel (la pose `cartel`). */
export const Cartel: React.FC<{ texto: string }> = ({ texto }) => (
  <div style={{ fontFamily: MARCADOR, fontSize: 112, color: "#141414", transform: "rotate(-4deg)", lineHeight: 1 }}>{texto}</div>
);

/** Cuánto sube el personaje cuando enseña algo a la altura del pecho, para que no lo tape el texto de TikTok (vertical). */
export const SUBE = ZONA.personaje.sube;

/** El personaje, desde el primer cuadro, con la pose de cada momento; al cierre, el canal en su celular. */
export const PERSONAJE: { tramos: Tramo[]; entra: number } = {
  entra: 0,
  tramos: POSES.map((p) => (p.celular ? { desde: p.desde, pose: p.pose, objeto: { nodo: <PantallaCanal /> }, sube: SUBE } : { desde: p.desde, pose: p.pose })),
};
