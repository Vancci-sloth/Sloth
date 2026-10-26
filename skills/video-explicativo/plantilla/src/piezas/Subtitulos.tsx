// El texto de arriba, palabra por palabra al ritmo de la voz: el relleno en gris, lo que carga
// sentido en negrita, y una palabra por frase con la caja de selección de Figma (borde azul y dos tiradores). Cada
// palabra entra con desenfoque en ~5 cuadros y el renglón se recentra poco a poco mientras entra. La frase nueva borra
// la anterior; el primer renglón no se mueve y el segundo cae debajo.
import { measureText } from "@remotion/layout-utils";
import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { cuadro, FRASES, PALABRAS } from "../tiempo";
import { ANCHO, AZUL, LETRA, ZONA } from "../tema";
import { esIcono, Glifo } from "./iconos";

const TAM = 74;
const RENGLON = 86;
const ENTRA = 5; // cuadros
const ANTES = 1; // la palabra asoma un cuadro antes de oírse
const ESPACIO = TAM * 0.27;
const ICONO = TAM * 1.12;

const suave = Easing.bezier(0.2, 0.7, 0.2, 1);

type Ficha = { texto: string; icono?: string | null; clave: boolean; caja: boolean; desde: number; ancho: number };

/** El ícono delante de una palabra: un nombre de Phosphor («LockSimpleOpen») o una imagen de public («logos/x.png»). */
const IconoPalabra: React.FC<{ valor: string; color: string }> = ({ valor, color }) => (
  <span style={{ display: "inline-flex", verticalAlign: "-0.12em", marginRight: TAM * 0.2 }}>
    {esIcono(valor) ? (
      <Glifo nombre={valor} tam={TAM * 0.92} color={color} />
    ) : (
      <Img src={staticFile(valor)} style={{ width: TAM * 0.92, height: TAM * 0.92, borderRadius: TAM, display: "block" }} />
    )}
  </span>
);

const medir = (texto: string, clave: boolean) =>
  measureText({ text: texto, fontFamily: LETRA, fontSize: TAM, fontWeight: clave ? "700" : "500", letterSpacing: "-0.01em" })
    .width;

const inicio = (i: number) => cuadro(PALABRAS[i].s) - ANTES;

export const Subtitulos: React.FC<{ texto: string; tenue: string }> = ({ texto, tenue }) => {
  const f = useCurrentFrame();
  const n = FRASES.findLastIndex((fr) => inicio(fr.palabras[0].i) <= f);
  if (n < 0) return null;
  const fichas: Ficha[] = FRASES[n].palabras.map((p) => ({
    texto: p.t,
    icono: p.icono,
    clave: p.clave,
    caja: p.caja,
    desde: inicio(p.i),
    ancho: medir(p.t, p.clave) + (p.icono ? ICONO : 0),
  }));

  // Los renglones salen de la frase entera, así no cambian mientras aparecen las palabras.
  const renglones: Ficha[][] = [[]];
  let usado = 0;
  for (const ficha of fichas) {
    const extra = (renglones.at(-1)!.length ? ESPACIO : 0) + ficha.ancho;
    if (usado + extra > ZONA.texto.ancho && renglones.at(-1)!.length) {
      renglones.push([]);
      usado = 0;
    }
    renglones.at(-1)!.push(ficha);
    usado += (renglones.at(-1)!.length > 1 ? ESPACIO : 0) + ficha.ancho;
  }

  const avance = (fi: Ficha) => interpolate(f, [fi.desde, fi.desde + ENTRA], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: suave });

  return (
    <>
      {renglones.map((renglon, r) => {
        // Ancho de lo que ya se ve: la palabra que entra suma su ancho poco a poco, y el renglón se recentra solo.
        let visible = 0;
        renglon.forEach((fi, k) => (visible += avance(fi) * (fi.ancho + (k ? ESPACIO : 0))));
        let x = (ANCHO - visible) / 2;
        const y = ZONA.texto.centro - TAM / 2 + r * RENGLON;
        return renglon.map((fi, k) => {
          const a = avance(fi);
          const izquierda = x + (k ? ESPACIO * a : 0);
          x += a * (fi.ancho + (k ? ESPACIO : 0));
          if (a <= 0) return null;
          const color = fi.clave ? texto : tenue;
          return (
            <div key={`${r}-${k}`} style={{ position: "absolute", left: izquierda, top: y, height: TAM * 1.15, whiteSpace: "nowrap" }}>
              {fi.caja ? <Caja ancho={fi.ancho} alto={TAM * 1.12} avance={a} /> : null}
              <span
                style={{
                  display: "inline-block",
                  fontFamily: LETRA,
                  fontSize: TAM,
                  fontWeight: fi.clave ? 700 : 500,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.12,
                  color,
                  opacity: a,
                  filter: `blur(${(1 - a) * 12}px)`,
                  transform: `translateY(${(1 - a) * 10}px)`,
                }}
              >
                {fi.icono ? <IconoPalabra valor={fi.icono} color={color} /> : null}
                {fi.texto}
              </span>
            </div>
          );
        });
      })}
    </>
  );
};

const Caja: React.FC<{ ancho: number; alto: number; avance: number }> = ({ ancho, alto, avance }) => {
  const pad = 10;
  const tirador = (estilo: React.CSSProperties) => (
    <div
      style={{
        position: "absolute",
        width: 17,
        height: 17,
        borderRadius: 9,
        background: AZUL,
        transform: `scale(${interpolate(avance, [0.3, 1], [0, 1], { extrapolateLeft: "clamp" })})`,
        ...estilo,
      }}
    />
  );
  return (
    <div
      style={{
        position: "absolute",
        left: -pad,
        top: -2,
        width: ancho + pad * 2,
        height: alto + 4,
        border: `3px solid ${AZUL}`,
        background: "rgba(47,128,237,0.16)",
        opacity: avance,
      }}
    >
      {tirador({ left: -10, top: -10 })}
      {tirador({ right: -10, bottom: -10 })}
    </div>
  );
};
