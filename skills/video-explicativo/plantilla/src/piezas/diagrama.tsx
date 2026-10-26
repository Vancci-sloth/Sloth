// Las piezas 2D chicas: la ficha de una moneda o un sello, la píldora, el logo redondo y el botón que dice que no.
import { getLength, getPointAtLength } from "@remotion/paths";
import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { LETRA, MONO, ROJO } from "../tema";
import { sujeta, suave, useColores } from "./ui";

/** La ficha redonda de una moneda, un token o un sello, con su texto o su imagen. */
export const Ficha: React.FC<{ texto: string; color: string; tam?: number; img?: string; tinta?: string }> = ({ texto, color, tam = 64, img, tinta = "#1a1205" }) => (
  <div
    style={{
      width: tam,
      height: tam,
      borderRadius: tam,
      background: `radial-gradient(circle at 35% 30%, #fff8 0%, ${color} 38%, ${color} 70%, #0004 100%)`,
      border: `${Math.max(2, tam / 22)}px solid #0003`,
      boxShadow: `0 ${tam / 10}px ${tam / 4}px #0005`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: LETRA,
      fontWeight: 800,
      fontSize: tam * (texto.length > 3 ? 0.26 : 0.34),
      color: tinta,
      letterSpacing: "-0.02em",
      overflow: "hidden",
    }}
  >
    {img ? <Img src={staticFile(img)} style={{ width: tam * 0.7, height: tam * 0.7 }} /> : texto}
  </div>
);

export const Pildora: React.FC<{ children: React.ReactNode; color?: string; fondo?: string; style?: React.CSSProperties }> = ({ children, color, fondo, style }) => {
  const c = useColores();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 24px",
        borderRadius: 999,
        background: fondo ?? c.tarjeta2,
        border: `2px solid ${color ?? c.borde}`,
        color: color ?? c.texto,
        fontFamily: LETRA,
        fontSize: 34,
        fontWeight: 700,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/**
 * «No se puede»: desde `en`, lo que se intentó parpadea en rojo tres veces y se queda rojo (sin cruces ni bordes
 * remarcados). Devuelve cuánto rojo lleva en este cuadro, de 0 a 1.
 */
export const useNegado = (en?: number) => {
  const f = useCurrentFrame();
  if (en === undefined || f < en) return 0;
  const t = f - en;
  return t >= 15 ? 1 : Math.floor(t / 2.5) % 2 === 0 ? 1 : 0.15;
};

/** Un logo real, redondo (public/logos/<logo>.png), como el avatar de una cuenta: en vez de escribir el nombre. */
export const Insignia: React.FC<{ logo: string; tam?: number; color?: string; luz?: number; style?: React.CSSProperties }> = ({ logo, tam = 120, color, luz = 0, style }) => {
  const c = useColores();
  return (
    <Img
      src={staticFile(`logos/${logo}.png`)}
      style={{
        width: tam,
        height: tam,
        borderRadius: tam,
        border: `${Math.max(3, tam / 28)}px solid ${color ?? c.borde}`,
        boxShadow: luz ? `0 0 ${tam * 0.5 * luz}px ${color ?? "#fff"}aa, ${c.sombra}` : c.sombra,
        background: "#fff",
        display: "block",
        ...style,
      }}
    />
  );
};
