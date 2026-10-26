// Lo 2D de cada capítulo (clavado en el mundo 3D) y las poses del personaje, atadas a las palabras de la voz con en().
// Las poses que sostienen algo enseñan encima lo que se explica: el cartel con el remate, el canal en el celular (ver
// ~/.claude/skills/video-explicativo/personaje/POSES.md). Se reescribe en cada video.
import React from "react";
import { TEMAS } from "../capitulos";
import type { Tramo } from "../piezas/Personaje";
import { MARCADOR } from "../tema";
import { PrecioPegado } from "./comun";

/** Lo 2D de cada capítulo, en el orden de TEMAS (capitulos.ts): un componente por capítulo. */
const Gancho: React.FC = () => <PrecioPegado />;
export const CAPITULOS = TEMAS.map((t, i) => ({ ...t, Escena: [Gancho][i] ?? Gancho }));

/** Lo que el personaje escribió a mano en su cartel (la pose `cartel`, con `objeto: { nodo: <Cartel texto="−99%" /> }`). */
export const Cartel: React.FC<{ texto: string }> = ({ texto }) => (
  <div style={{ fontFamily: MARCADOR, fontSize: 112, color: "#141414", transform: "rotate(-4deg)", lineHeight: 1 }}>{texto}</div>
);

/** Cuánto sube el personaje cuando enseña algo a la altura del pecho, para que no lo tape el texto de TikTok. */
export const SUBE = 140;

/** El personaje entra en «pero primero» (el gancho va sin él) y cambia de pose en la palabra que la pide. */
export const PERSONAJE: { tramos: Tramo[]; entra: number } = {
  entra: 300, // en("pero primero")
  tramos: [
    { desde: 0, pose: "normal" },
    // { desde: en("qué es"), pose: "ladea" },
    // { desde: en("pero si quieres"), pose: "celular", objeto: { nodo: <PantallaCanal /> }, sube: SUBE },
    // { desde: en("el enlace"), pose: "feliz" },
  ],
};
