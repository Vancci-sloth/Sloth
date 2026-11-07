// Las piezas 2D chicas: la ficha de una moneda o un sello, la píldora, el logo redondo y el botón que dice que no.
// `Simbolo` es lo que va delante de un texto en cualquier pieza: un ícono de Phosphor, un logo real o una imagen.
import { getLength, getPointAtLength } from "@remotion/paths";
import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { LETRA, MONO, ROJO } from "../tema";
import { Glifo, type NombreIcono } from "./iconos";
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

/** Lo que va delante de un texto: un ícono de Phosphor (`icono`), un logo real redondo (`logo`, de public/logos) o
 * una imagen redonda (`img`, de public: una bandera, una cara). */
export type ConSimbolo = { icono?: NombreIcono; logo?: string; img?: string };

/** El ícono, logo o imagen de `ConSimbolo`, solo, de `tam` px: para ponerlo delante de un texto en una pieza propia. */
export const Simbolo: React.FC<ConSimbolo & { tam: number }> = ({ icono, logo, img, tam }) => {
  if (icono) return <Glifo nombre={icono} tam={tam} />;
  const src = logo ? `logos/${logo}.png` : img;
  if (!src) return null;
  return <Img src={staticFile(src)} style={{ width: tam, height: tam, borderRadius: tam, background: logo ? "#fff" : undefined, objectFit: "cover", flexShrink: 0 }} />;
};

/** La píldora: un nombre, un lugar o una etiqueta, con su ícono, logo o bandera delante. `apagado` (0–1) la pasa a gris. */
export const Pildora: React.FC<ConSimbolo & { children: React.ReactNode; color?: string; fondo?: string; tam?: number; apagado?: number; style?: React.CSSProperties }> = ({
  children,
  color,
  fondo,
  tam = 34,
  apagado = 0,
  style,
  ...simbolo
}) => {
  const c = useColores();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: tam * 0.3,
        padding: `${tam * 0.35}px ${tam * 0.7}px`,
        borderRadius: 999,
        background: fondo ?? c.tarjeta2,
        border: `2px solid ${color ?? c.borde}`,
        color: color ?? c.texto,
        fontFamily: LETRA,
        fontSize: tam,
        fontWeight: 700,
        whiteSpace: "nowrap",
        filter: apagado ? `grayscale(${apagado})` : undefined,
        opacity: 1 - apagado * 0.55,
        ...style,
      }}
    >
      <Simbolo {...simbolo} tam={tam * 1.1} />
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
