// Lo 2D de cada capítulo (clavado en el mundo 3D) y las poses del perrito, atadas a las palabras de la voz con en().
// Las poses que sostienen algo enseñan encima lo que se explica: el cartel con el remate, el canal en el celular. La
// moneda no: la protagonista es la moneda 3D del mundo.
import React from "react";
import { TEMAS } from "../capitulos";
import type { Tramo } from "../piezas/Personaje";
import { MARCADOR } from "../tema";
import { en } from "../tiempo";
import { Cierre } from "./Cierre";
import { PantallaCanal } from "./comun";
import { Explica } from "./Explica";
import { Fallas } from "./Fallas";
import { Gancho } from "./Gancho";
import { Hoy } from "./Hoy";

/** Lo 2D de cada capítulo, clavado en el mundo 3D (el orden es el de TEMAS en capitulos.ts). */
export const CAPITULOS = TEMAS.map((t, i) => ({ ...t, Escena: [Gancho, Explica, Fallas, Hoy, Cierre][i] }));

/** Lo que el perro escribió a mano en su cartel. */
const Cartel: React.FC<{ texto: string }> = ({ texto }) => (
  <div style={{ fontFamily: MARCADOR, fontSize: 112, color: "#141414", transform: "rotate(-4deg)", lineHeight: 1 }}>{texto}</div>
);

const SUBE = 140; // cuando enseña algo a la altura del pecho, para que no lo tape el texto de TikTok

export const PERSONAJE: { tramos: Tramo[]; entra: number } = {
  entra: en("pero primero"),
  tramos: [
    // Qué es Berachain
    { desde: 0, pose: "arriba" },
    { desde: en("qué es berachain"), pose: "ladea" },
    { desde: en("es una blockchain"), pose: "normal" },
    { desde: en("truco"), pose: "lentes" },
    { desde: en("casi todas"), pose: "lado" },
    { desde: en("imprimen"), pose: "arriba" },
    { desde: en("berachain se las daba"), pose: "normal" },
    { desde: en("proof of liquidity"), pose: "feliz" },
    { desde: en("la recompensa"), pose: "arriba" },
    { desde: en("no se podía vender"), pose: "pata" },
    { desde: en("solo se podía"), pose: "ladea" },
    { desde: en("por bera"), pose: "lado" },
    { desde: en("y vender"), pose: "reojo" },
    // Qué falló
    { desde: en("entonces qué falló"), pose: "ladea" },
    { desde: en("tres cosas"), pose: "arriba" },
    { desde: en("lo admitió"), pose: "reojo" },
    { desde: en("recibe menos"), pose: "tapa" },
    { desde: en("dos los que"), pose: "normal" },
    { desde: en("vendieron"), pose: "reojo" },
    { desde: en("sesenta y nueve"), pose: "susto" },
    { desde: en("y el seis de febrero"), pose: "arriba" },
    { desde: en("se liberó"), pose: "llave" },
    { desde: en("cuarenta y tres"), pose: "susto" },
    { desde: en("tres la confianza"), pose: "ladea" },
    { desde: en("hackearon"), pose: "lentes" },
    { desde: en("apagaron"), pose: "pata" },
    { desde: en("doce millones"), pose: "normal" },
    { desde: en("luego salió"), pose: "lado" },
    { desde: en("veinticinco millones"), pose: "billetes" },
    { desde: en("todavía no se sabe"), pose: "lupa" },
    // Hoy
    { desde: en("en julio"), pose: "arriba" },
    { desde: en("el corazón"), pose: "triste" },
    { desde: en("catorce centavos"), pose: "tapa" },
    { desde: en("ese mismo día"), pose: "arriba" },
    { desde: en("pagó"), pose: "billetes" },
    { desde: en("valía"), pose: "susto" },
    { desde: en("llegó a tener"), pose: "lado" },
    { desde: en("hoy le quedan"), pose: "cartel", objeto: { nodo: <Cartel texto="−99%" /> }, sube: SUBE + 40 },
    // Cierre
    { desde: en("ahora dice"), pose: "reojo" },
    { desde: en("revive"), pose: "ladea" },
    { desde: en("se apaga"), pose: "triste" },
    { desde: en("yo no te digo"), pose: "pata" },
    { desde: en("pero si quieres"), pose: "celular", objeto: { nodo: <PantallaCanal /> }, sube: SUBE },
    { desde: en("el enlace"), pose: "feliz" },
  ],
};
