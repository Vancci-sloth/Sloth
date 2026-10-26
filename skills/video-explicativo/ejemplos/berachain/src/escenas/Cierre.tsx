// «Ahora dice» al final, oscuro: de vuelta a la casa de la moneda, como en el gancho. Su página promete un «growth
// engine»; la moneda se enciende… y se apaga (lo 3D, en Escena3D.tsx), con su precio de hoy pegado; «no te digo que
// compres ni que vendas» (los dos botones parpadean y se quedan rojos); y el canal del cierre, que el perro también
// enseña en su celular.
import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { EnMundo } from "../mundo/EnMundo";
import { L, monedaEn, T } from "../mundo/guion";
import { Navegador } from "../piezas/tarjetas";
import { Entra, Resaltado } from "../piezas/ui";
import { LETRA } from "../tema";
import { Boton, Canal, PrecioPegado } from "./comun";

export const Cierre: React.FC = () => {
  const f = useCurrentFrame();
  const m = monedaEn(f).e;
  return (
    <>
      {/* Lo que promete: su página, sobre la moneda. */}
      <EnMundo p={[L.casa[0], L.casa[1] + 1.15, L.casa[2]]} origen={[0.5, 1]}>
        <Entra en={T.ahora + 2} sale={T.revive - 2}>
          <Navegador url="berachain.com" ancho={860}>
            <div style={{ padding: "50px 40px 60px", background: "#0b0b0b", textAlign: "center" }}>
              <Img src={staticFile("img/berachain-logo-blanco.svg")} style={{ width: 400 }} />
              <div style={{ fontFamily: LETRA, fontWeight: 800, fontSize: 72, color: "#fff", lineHeight: 1.06, marginTop: 34 }}>
                A <Resaltado en={T.motor} color="rgba(245,165,36,0.5)">growth engine</Resaltado>
              </div>
            </div>
          </Navegador>
        </Entra>
      </EnMundo>

      <PrecioPegado />

      {/* «No te digo que compres ni que vendas». */}
      {f >= T.compres - 4 && f < T.pero2 ? (
        <EnMundo p={[m.pos[0], m.pos[1] - m.escala * 1.15, m.pos[2]]} origen={[0.5, 0]}>
          <div style={{ display: "flex", gap: 24 }}>
            <Entra en={T.compres - 3}>
              <Boton no={T.compres + 3} tam={58}>
                Comprar
              </Boton>
            </Entra>
            {f >= T.vendas - 3 ? (
              <Entra en={T.vendas - 3}>
                <Boton no={T.vendas + 3} tam={58}>
                  Vender
                </Boton>
              </Entra>
            ) : null}
          </div>
        </EnMundo>
      ) : null}

      {/* El cierre de la marca. */}
      <Canal pero={T.pero2} unete={T.unete} enlace={T.enlace} />
    </>
  );
};
