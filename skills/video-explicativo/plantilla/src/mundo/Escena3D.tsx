// Lo que hay en el mundo 3D de este video y cuándo está en escena (los tiempos y lugares salen de guion.ts). Solo está
// lo que se está diciendo: cada cosa entra cuando se habla de ella y sale cuando ya no (`EnEscena` con sus ventanas), y
// vuelve a su mismo sitio si se vuelve a hablar de ella. De fondo solo queda el escenario, quieto y gris.
// Los modelos salen de la biblioteca (skills/modelos-3d: `modelos.py buscar` y `usar`) y viven en src/modelos/.
// Se reescribe en cada video; el de Berachain está en ejemplos/berachain/src/mundo/Escena3D.tsx de la skill.
import React from "react";
import { useCurrentFrame } from "remotion";
import { Moneda } from "../modelos/moneda";
import { monedaEn } from "./guion";

export const Escena3D: React.FC = () => {
  const f = useCurrentFrame();
  const m = monedaEn(f);
  return (
    <>
      {/* La protagonista. Sus caras las hace Codex (texturas/pedido-*.txt) a public/img y se le pasan con
          frente="img/moneda_frente.png" atras="img/moneda_atras.png"; mientras, lleva las lisas de la biblioteca. */}
      {m.e.escala > 0.01 ? <Moneda e={m.e} rota={m.rota} /> : null}
    </>
  );
};
