// «En julio» – «treinta y cuatro», claro: cómo está hoy, en el mismo mundo repintado. Lo 3D: la moneda vuelve contigo
// y enseña su cara BGT, que se pone gris (jubilado); luego el oro apagado de su mínimo; la empresa del Nasdaq que la
// compra; y el panal de las apps que se vacía. Lo 2D clavado al lado: el tuit con su flecha a la moneda y el sello,
// el precio pegado, lo que pagó la empresa contra lo que vale, y el dinero depositado que baja con la miel.
import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { proyectar, useCamara } from "../mundo/camara";
import { EnMundo } from "../mundo/EnMundo";
import { L, monedaEn, T } from "../mundo/guion";
import { Glifo } from "../piezas/iconos";
import { Barras, Prueba } from "../piezas/tarjetas";
import { Ancla, Entra, Flecha, Fuente, sujeta, useColores } from "../piezas/ui";
import { LETRA, MIEL, MONO, ROJO, VERDE } from "../tema";
import { PrecioPegado } from "./comun";

export const Hoy: React.FC = () => {
  const f = useCurrentFrame();
  const c = useColores();
  const cam = useCamara();
  const m = monedaEn(f).e;
  const lado = m.escala > 0.05 ? (2 * m.escala * 3348) / Math.max(0.5, proyectar(cam, m.pos).prof) : 0;
  const sello = interpolate(f, [T.jubilaron + 4, T.jubilaron + 9], [1.8, 1], sujeta);
  // El dinero depositado baja con la miel: de 3,307 a 34 millones.
  const tvl = interpolate(f, [T.quedan - 4, T.treinta + 10], [3307, 34], { ...sujeta, easing: Easing.inOut(Easing.cubic) });
  return (
    <>
      {/* BGT, jubilado el 8 de julio: el tuit, con su flecha a la moneda, y el sello encima. */}
      <EnMundo p={[m.pos[0], m.pos[1] + m.escala * 1.15, m.pos[2]]} origen={[0.5, 1]}>
        <Entra en={T.julio + 2} sale={T.agosto - 4}>
          <Ancla id="tuit-bgt">
            <Prueba logo="berachain" fuente="@berachain · 8 jul 2026" partes={["«BGT emissions have ", { t: "officially stopped", en: T.jubilaron, subraya: true }, "»"]} ancho={660} tam={44} />
          </Ancla>
        </Entra>
      </EnMundo>
      {f >= T.julio && f < T.agosto - 4 ? (
        <EnMundo p={m.pos}>
          <Ancla id="moneda-bgt">
            <div style={{ width: lado, height: lado }} />
          </Ancla>
        </EnMundo>
      ) : null}
      {f >= T.jubilaron && f < T.agosto - 4 ? <Flecha en={T.jubilaron + 10} de="tuit-bgt" a="moneda-bgt" /> : null}
      {f >= T.jubilaron + 4 && f < T.agosto - 4 ? (
        <EnMundo p={m.pos} desplaza={[0, lado * 0.18]}>
          <div
            style={{
              transform: `rotate(-14deg) scale(${sello})`,
              border: `8px solid ${ROJO}`,
              color: ROJO,
              borderRadius: 16,
              padding: "4px 24px",
              fontFamily: LETRA,
              fontWeight: 800,
              fontSize: 72,
              letterSpacing: "0.06em",
              background: "rgba(255,255,255,0.9)",
              whiteSpace: "nowrap",
            }}
          >
            JUBILADO
          </div>
        </EnMundo>
      ) : null}

      {/* El mínimo: el precio pegado a la moneda. */}
      <PrecioPegado />

      {/* La empresa del Nasdaq: pagó 70.2 M por BERA que valía 16.4 M. */}
      <EnMundo p={[L.nasdaq[0], L.nasdaq[1] - 0.62, L.nasdaq[2]]} origen={[0.5, 0]}>
        <Entra en={T.empresa + 4} sale={T.llego - 4}>
          <div style={{ fontFamily: MONO, fontSize: 56, fontWeight: 700, color: c.texto }}>GNLN</div>
        </Entra>
      </EnMundo>
      <EnMundo p={[L.nasdaq[0] - 0.6, L.nasdaq[1] + 0.75, L.nasdaq[2]]} origen={[0.5, 1]}>
        <Entra en={T.pago - 2} sale={T.llego - 4}>
          <div style={{ background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 26, boxShadow: c.sombra, padding: "22px 28px 16px" }}>
            <Barras
              ancho={620}
              max={70.2}
              filas={[
                { etiqueta: <><Glifo nombre="HandCoins" tam={44} /> Pagó</>, valor: 70.2, color: VERDE, en: T.pago, texto: (v) => `$${v.toFixed(1)}M` },
                { etiqueta: <><Glifo nombre="TrendDown" tam={44} /> Vale</>, valor: 16.4, color: ROJO, en: T.valia, texto: (v) => `$${v.toFixed(1)}M` },
              ]}
            />
            <Fuente>SEC · Greenlane 8-K, 14 ago 2026</Fuente>
          </div>
        </Entra>
      </EnMundo>

      {/* El dinero depositado en la cadena, que baja con la miel del panal. */}
      <EnMundo p={[L.panal[0], 1.6, L.panal[2] + 0.4]} origen={[0.5, 0.5]}>
        <Entra en={T.llego} sale={T.ahora}>
          <div style={{ textAlign: "center", fontFamily: LETRA, background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 30, boxShadow: c.sombra, padding: "18px 34px 14px" }}>
            <div style={{ fontSize: 100, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: f >= T.quedan ? ROJO : MIEL, fontVariantNumeric: "tabular-nums" }}>
              ${Math.round(tvl).toLocaleString("en-US")}M
            </div>
            <Fuente style={{ fontSize: 26 }}>DefiLlama · dinero depositado (TVL)</Fuente>
          </div>
        </Entra>
      </EnMundo>
    </>
  );
};
