// Lo 2D que vive en el mundo 3D: una tarjeta, un número o una etiqueta se clavan en un punto del mundo y se mueven con
// la cámara (se acercan, se alejan, pasan de lado), en vez de flotar pegados a la pantalla. `d0` es la distancia a la
// que se ven a su tamaño de diseño (la del plano en que se leen); `origen` es qué punto de la caja va en el punto del
// mundo ([0.5, 0.5] el centro, [0.5, 0] el centro de arriba), y `desplaza` la corre unos px en la pantalla (para dejarla
// al lado de su objeto sin taparlo). Con `en` (y `sale`), entra y sale como `Entra`: lo de todos los días.
import React from "react";
import { Entra } from "../piezas/ui";
import { proyectar, useCamara, V3 } from "./camara";

/**
 * Algo 2D (una tarjeta, una píldora, un número) clavado en el punto `p` del mundo. `origen`: qué punto de su caja va en
 * `p` ([0.5, 1], el centro de abajo, para dejarlo encima de su objeto); `desplaza`: unos px de lado. Con `en` y `sale`,
 * entra y sale solo. `d0`: la distancia en metros a la que se ve a su tamaño de diseño, la de la toma en que se lee
 * (`encuadra(toma).d`); sin él no cambia de tamaño con la cámara. Una pantalla 2D sobre un modelo 3D (la del celular):
 * ese `d0`, y de ancho el de la pantalla en metros × `K` / `d0` px (`import { K } from "./camara"`: a d m de la
 * cámara, 1 m mide K / d px).
 */
export const EnMundo: React.FC<{
  p: V3;
  d0?: number;
  origen?: [number, number];
  desplaza?: [number, number];
  en?: number;
  sale?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ p, d0, origen = [0.5, 0.5], desplaza = [0, 0], en, sale, style, children }) => {
  const cam = useCamara();
  const { x, y, prof } = proyectar(cam, p);
  if (prof < 0.4) return null;
  const k = d0 ? d0 / prof : 1;
  return (
    <div style={{ position: "absolute", left: x + desplaza[0], top: y + desplaza[1], width: 0, height: 0 }}>
      <div
        data-en-mundo
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "max-content",
          transform: `translate(${-origen[0] * 100}%, ${-origen[1] * 100}%) scale(${k})`,
          transformOrigin: `${origen[0] * 100}% ${origen[1] * 100}%`,
          ...style,
        }}
      >
        {en === undefined ? children : <Entra en={en} sale={sale}>{children}</Entra>}
      </div>
    </div>
  );
};
