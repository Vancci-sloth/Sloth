// «Pero primero» – «y vender el BERA», claro: qué es Berachain y su truco. Lo 3D (la cadena que se arma como un
// camino, Ethereum, el escudo de quien vigila, tú, el panal de las apps, el aro de Proof of Liquidity y la moneda que
// llega a ti como BGT) está en mundo/Escena3D.tsx. Aquí, clavado en el mundo: el nombre del aro y, bajo la moneda, lo
// que se puede hacer con ella (BGT: vender y regalar parpadean en rojo; se cambia 1:1 por BERA y el BERA se vende).
import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { proyectar, useCamara, V3 } from "../mundo/camara";
import { EnMundo } from "../mundo/EnMundo";
import { T } from "../mundo/guion";
import { Glifo } from "../piezas/iconos";
import { Entra, useColores } from "../piezas/ui";
import { AZUL, LETRA, MONO, VERDE } from "../tema";
import { Boton, Cursor } from "./comun";

/** La moneda de BERA (o de BGT) chica: la cara de la moneda 3D. */
export const FichaBera: React.FC<{ tam: number; bgt?: boolean }> = ({ tam, bgt }) => (
  <Img
    src={staticFile(bgt ? "img/moneda_bgt.png" : "img/moneda_cara.png")}
    style={{ width: tam, height: tam, borderRadius: tam, boxShadow: `0 ${tam / 10}px ${tam / 4}px #0004`, display: "block" }}
  />
);

export const Explica: React.FC = () => {
  const f = useCurrentFrame();
  const c = useColores();
  const cam = useCamara();
  // Debajo de donde la moneda llega a ti (fijo: cuando se vende, la moneda se va y el botón se queda).
  const bajo: V3 = [2.0, 3.5 - 0.38 * 1.2, 1.6];
  const tClic = T.unoAUno + 10;
  const tVende = T.yVender + 10;
  // Dónde queda el botón en la pantalla, para que el cursor llegue a él.
  const boton = proyectar(cam, bajo);
  return (
    <>
      {/* Proof of Liquidity: su nombre, al frente del aro. */}
      <EnMundo p={[2.2, 0.05, -0.8]} origen={[0.5, 0.5]}>
        <Entra en={T.pol + 4} sale={T.recompensa - 4}>
          <div style={{ fontFamily: LETRA, fontWeight: 800, fontSize: 54, color: AZUL, background: c.fondo, borderRadius: 999, padding: "4px 26px" }}>Proof of Liquidity</div>
        </Entra>
      </EnMundo>

      {/* BGT no se puede vender ni regalar; solo cambiar 1:1 por BERA… y vender el BERA. */}
      {f >= T.vender - 4 && f < T.fallo ? (
        <EnMundo p={bajo} origen={[0.5, 0]}>
          {f < T.solo ? (
            <div style={{ display: "flex", gap: 22 }}>
              <Entra en={T.vender - 3}>
                <Boton no={T.vender + 2}>Vender</Boton>
              </Entra>
              <Entra en={T.regalar - 3}>
                <Boton no={T.regalar + 2}>Regalar</Boton>
              </Entra>
            </div>
          ) : f < T.yVender ? (
            <Entra en={T.solo}>
              <Boton color={AZUL} clic={tClic}>
                <FichaBera tam={60} bgt />
                <Glifo nombre="ArrowRight" tam={44} peso="bold" />
                <FichaBera tam={60} />
                <span style={{ fontFamily: MONO }}>1:1</span>
              </Boton>
            </Entra>
          ) : (
            <Entra en={T.yVender - 2}>
              <Boton color={VERDE} clic={tVende}>
                <FichaBera tam={60} />
                Vender
              </Boton>
            </Entra>
          )}
        </EnMundo>
      ) : null}
      {f >= T.unoAUno - 8 && f < T.fallo ? (
        <Cursor de={[boton.x + 330, boton.y + 330]} a={[boton.x + 60, boton.y + 50]} desde={f < T.yVender ? T.unoAUno - 8 : T.yVender} hasta={f < T.yVender ? tClic : tVende} />
      ) : null}
    </>
  );
};
