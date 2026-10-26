// Los íconos: SVG de Phosphor (@phosphor-icons/react), nunca emojis (se ven mal). `Glifo` es el ícono suelto, del color
// del texto, para ir junto a un número; `Icono` es el grande en su azulejo de color, como el ícono de una app: lo que en
// un diagrama sería «Validadores», «Tú» o «Apps». Para uno nuevo, se importa aquí y se suma a ICONOS.
import {
  ArrowFatUp,
  ArrowRight,
  ArrowsLeftRight,
  ArrowUUpLeft,
  Bank,
  ChartLineDown,
  ChatCircle,
  Check,
  Gift,
  Globe,
  HandCoins,
  Handshake,
  InstagramLogo,
  Link,
  LockSimple,
  LockSimpleOpen,
  Printer,
  ShieldCheck,
  Skull,
  SquaresFour,
  TelegramLogo,
  TiktokLogo,
  TrendDown,
  User,
  UsersThree,
  Warning,
  WhatsappLogo,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react/ssr";
import type { IconWeight } from "@phosphor-icons/react";
import React from "react";
import { interpolateColors } from "remotion";
import { useColores } from "./ui";

export const ICONOS = {
  ArrowFatUp,
  ArrowRight,
  ArrowsLeftRight,
  ArrowUUpLeft,
  Bank,
  ChartLineDown,
  ChatCircle,
  Check,
  Gift,
  Globe,
  HandCoins,
  Handshake,
  InstagramLogo,
  Link,
  LockSimple,
  LockSimpleOpen,
  Printer,
  ShieldCheck,
  Skull,
  SquaresFour,
  TelegramLogo,
  TiktokLogo,
  TrendDown,
  User,
  UsersThree,
  Warning,
  WhatsappLogo,
  XLogo,
  YoutubeLogo,
};
export type NombreIcono = keyof typeof ICONOS;

export const esIcono = (nombre: string): nombre is NombreIcono => nombre in ICONOS;

/** El ícono suelto, del color de lo que lo rodea (o `color`). */
export const Glifo: React.FC<{ nombre: NombreIcono; tam: number; color?: string; peso?: IconWeight; style?: React.CSSProperties }> = ({
  nombre,
  tam,
  color = "currentColor",
  peso = "fill",
  style,
}) => {
  const Svg = ICONOS[nombre];
  return <Svg size={tam} color={color} weight={peso} style={{ display: "block", flexShrink: 0, ...style }} />;
};

const mezcla = (color: string, con: string, k: number) => interpolateColors(k, [0, 1], [color, con]);

/** El ícono grande en su azulejo: degradado del color, brillo arriba, sombra del mismo color y el glifo en blanco. */
export const Icono: React.FC<{ nombre: NombreIcono; tam?: number; color: string; apagado?: number }> = ({ nombre, tam = 180, color, apagado = 0 }) => {
  const c = useColores();
  return (
    <div
      style={{
        width: tam,
        height: tam,
        borderRadius: tam * 0.27,
        background: `linear-gradient(155deg, ${mezcla(color, "#ffffff", 0.32)} 0%, ${color} 52%, ${mezcla(color, "#000000", 0.22)} 100%)`,
        boxShadow: `inset 0 ${tam * 0.025}px 0 rgba(255,255,255,0.45), inset 0 -${tam * 0.04}px 0 rgba(0,0,0,0.16), 0 ${tam * 0.09}px ${tam * 0.22}px ${color}61, ${c.sombra}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: apagado ? `grayscale(${apagado})` : undefined,
        opacity: 1 - apagado * 0.6,
      }}
    >
      <Glifo nombre={nombre} tam={tam * 0.56} color="#ffffff" style={{ filter: `drop-shadow(0 ${tam * 0.02}px ${tam * 0.03}px rgba(0,0,0,0.25))` }} />
    </div>
  );
};
