// Lo de Reddit, para cualquier video que cuente un post (la serie «Historias de Reddit»): el post rehecho y un
// comentario, con el usuario tapado, el texto traducido por nosotros y los votos de verdad. Es la parte de la serie que
// se reconoce de un video a otro; dónde sale (en una pantalla del mundo, en un celular, impreso, en una tarjeta) y qué
// le acompaña (EDITs, una etiqueta) son de cada video: van en `etiqueta` y `debajo`.
import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { LETRA } from "../tema";
import { Glifo, NombreIcono } from "./iconos";
import { sujeta, suave, useColores } from "./ui";

export const NARANJA_REDDIT = "#ff4500";
const TAPADO = "u/●●●●●●";

/** Un número de Reddit: 5285 → «5.3 mil». */
const abrevia = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} mil` : String(Math.round(v)));

/** Un dato de la barra de abajo del post: su ícono y su número. */
const Dato: React.FC<{ icono: NombreIcono; valor: number; color?: string }> = ({ icono, valor, color }) => {
  const c = useColores();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: c.tarjeta2, fontSize: 30, fontWeight: 700, color: color ?? c.texto, fontVariantNumeric: "tabular-nums" }}>
      <Glifo nombre={icono} tam={32} />
      {abrevia(valor)}
    </div>
  );
};

/**
 * Un post de Reddit. `children` es el título, citado (con su `Subrayado` si hace falta). `votos` y `comentarios`:
 * [cuadro desde, cuadro hasta, total] en que corren sus cuentas (sin ellos, no se enseñan). `etiqueta`: lo de la
 * derecha de la cabecera (una píldora «EN VIVO», «+1 año sin resolver»). `debajo`: lo que cuelga del post (los EDIT).
 */
export const Post: React.FC<{
  sub: string;
  fecha: string;
  votos?: [number, number, number];
  comentarios?: [number, number, number];
  etiqueta?: React.ReactNode;
  debajo?: React.ReactNode;
  ancho?: number;
  tam?: number;
  children: React.ReactNode;
}> = ({ sub, fecha, votos, comentarios, etiqueta, debajo, ancho = 860, tam = 44, children }) => {
  const f = useCurrentFrame();
  const c = useColores();
  const corre = ([desde, hasta, total]: [number, number, number], de: number) => interpolate(f, [desde, hasta], [de, total], { ...sujeta, easing: suave });
  return (
    <div style={{ width: ancho, fontFamily: LETRA, color: c.texto }}>
      <div style={{ background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 28, boxShadow: c.sombra, padding: "26px 32px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Img src={staticFile("logos/reddit.png")} style={{ width: 58, height: 58, borderRadius: 58 }} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{sub}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: c.tenue }}>
              {TAPADO} · {fecha}
            </div>
          </div>
          {etiqueta ? <div style={{ marginLeft: "auto" }}>{etiqueta}</div> : null}
        </div>
        <div style={{ fontSize: tam, fontWeight: 800, lineHeight: 1.2, marginTop: 18, letterSpacing: "-0.01em" }}>{children}</div>
        {votos || comentarios ? (
          <div style={{ display: "flex", gap: 14, marginTop: 20 }}>
            {votos ? <Dato icono="ArrowFatUp" valor={corre(votos, 1)} color={f >= votos[0] ? NARANJA_REDDIT : undefined} /> : null}
            {comentarios ? <Dato icono="ChatCircle" valor={corre(comentarios, 0)} /> : null}
          </div>
        ) : null}
      </div>
      {debajo}
    </div>
  );
};

/** Un comentario: el usuario tapado, sus votos (o su fecha) y su texto. */
export const Comentario: React.FC<{ votos?: number; fecha?: string; ancho?: number; tam?: number; children: React.ReactNode }> = ({
  votos,
  fecha,
  ancho = 820,
  tam = 40,
  children,
}) => {
  const c = useColores();
  return (
    <div style={{ width: ancho, background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 24, boxShadow: c.sombra, padding: "20px 28px 22px", fontFamily: LETRA, color: c.texto }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 25, fontWeight: 700, color: c.tenue }}>
        <div style={{ width: 44, height: 44, borderRadius: 44, background: c.tarjeta2, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Glifo nombre="User" tam={28} />
        </div>
        {TAPADO}
        {fecha ? ` · ${fecha}` : ""}
        {votos !== undefined ? (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, color: NARANJA_REDDIT, fontSize: 30 }}>
            <Glifo nombre="ArrowFatUp" tam={30} />
            {votos.toLocaleString("en-US")}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: tam, fontWeight: 700, lineHeight: 1.25, marginTop: 12 }}>{children}</div>
    </div>
  );
};
