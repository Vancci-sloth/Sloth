// 0 – «pero primero», oscuro y sin perro, con la moneda iluminada en 3D. Lo 3D (la moneda en
// su casa, los fondos que la rodean, los cubos que vuelan a Brevan Howard) está en mundo/Escena3D.tsx; aquí va lo 2D
// clavado en el mundo: el precio pegado a la moneda (de 3 dólares a 0.18), la ficha del token y lo que vuelve a Brevan.
import React from "react";
import { useCurrentFrame } from "remotion";
import { EnMundo } from "../mundo/EnMundo";
import { L, monedaEn, T } from "../mundo/guion";
import { Ficha } from "../piezas/diagrama";
import { Glifo } from "../piezas/iconos";
import { Entra } from "../piezas/ui";
import { LETRA, MIEL } from "../tema";
import { PrecioPegado } from "./comun";

export const Gancho: React.FC = () => {
  const f = useCurrentFrame();
  const m = monedaEn(f).e;
  return (
    <>
      <PrecioPegado />

      {/* La ficha del token, pegada a la moneda. */}
      {f < T.uno + 8 ? (
        <EnMundo p={[m.pos[0] + 0.5 * m.escala, m.pos[1] + 0.95 * m.escala, m.pos[2]]} origen={[0, 1]}>
          <Entra en={T.bera} sale={T.uno}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#1a1a1a", border: "2px solid #2e2e2e", borderRadius: 999, padding: "10px 26px 10px 10px", boxShadow: "0 12px 30px #000a" }}>
              <Ficha texto="" img="img/berachain-icono.svg" color={MIEL} tam={62} />
              <span style={{ fontFamily: LETRA, fontWeight: 800, fontSize: 42, color: "#fff" }}>BERA</span>
            </div>
          </Entra>
        </EnMundo>
      ) : null}

      {/* Lo que vuelve a Brevan Howard, en una píldora oscura: los cubos le pasan por detrás. */}
      <EnMundo p={[L.brevan[0], L.brevan[1] - 0.36, L.brevan[2]]} origen={[0.5, 0]}>
        <Entra en={T.devuelve + 14} sale={T.pero}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 26px 6px 20px", borderRadius: 999, background: "#141414", border: `3px solid ${MIEL}`, boxShadow: "0 12px 30px #000c", fontFamily: LETRA, fontWeight: 800, fontSize: 58, color: MIEL }}>
            <Glifo nombre="ArrowUUpLeft" tam={52} peso="bold" />
            $25M
          </div>
        </Entra>
      </EnMundo>
    </>
  );
};
