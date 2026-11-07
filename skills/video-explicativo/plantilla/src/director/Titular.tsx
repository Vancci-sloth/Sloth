// El titular del gancho: la primera frase de la voz (o `titular` de momentos.json), enorme y en mayúsculas, donde van
// los subtítulos, una palabra tras otra con un golpe al decirse. Lo que se lee en el primer segundo y medio decide si el
// que va pasando videos se queda; con la letra de los subtítulos, el gancho se oía pero no se veía.
import React from "react";
import { interpolate, spring, useCurrentFrame } from "remotion";
import { measureText } from "@remotion/layout-utils";
import { cuadro, PALABRAS } from "../tiempo";
import { LETRA, PALETA, ZONA } from "../tema";
import { GUION } from "./guion";

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ%$]/g, "");

/** Las palabras del titular, con el cuadro en que se dice cada una, y hasta cuándo se ve. */
export const TITULAR = (() => {
  if (!PALABRAS.length) return null;
  const texto = GUION.titular;
  let n: number;
  if (texto) n = texto.split(/\s+/).filter((w) => normal(w)).length;
  else {
    // La primera frase de la voz, si es corta: hasta su punto.
    n = PALABRAS.findIndex((p) => /[.!?¿¡]$/.test(p.w)) + 1;
    if (n <= 0 || n > 10) return null;
  }
  const palabras = (texto ? texto.split(/\s+/).filter((w) => normal(w)) : PALABRAS.slice(0, n).map((p) => p.w)).map((w, k) => ({
    t: w.replace(/[.,;:!?¿¡«»"]/g, "").toUpperCase(),
    // Entero en el primer medio segundo, una palabra cada 3 cuadros, aunque la voz vaya más lenta: el revisor a ciegas
    // leyó «ESE TRONIDO NO / ES» en el cuadro del gancho y no supo de qué iba; el que va pasando no espera a la voz.
    desde: Math.min(cuadro(PALABRAS[Math.min(k, PALABRAS.length - 1)].s) - 1, k * 3),
  }));
  return { palabras, hasta: cuadro(PALABRAS[Math.min(n, PALABRAS.length) - 1].e) + 10 };
})();

const TAM = 132;
/** La letra del titular: 132 px, o la que lo deja en dos renglones (el del doctor falso, de seis palabras, salió en cuatro). */
const tamDe = () => {
  if (!TITULAR) return TAM;
  const ancho = (k: number) => TITULAR.palabras.reduce((s, p) => s + measureText({ text: p.t, fontFamily: LETRA, fontSize: k, fontWeight: "800" }).width + k * 0.28, 0);
  let k = TAM;
  while (k > 70 && ancho(k) > ZONA.texto.ancho * 1.75) k -= 4;
  return k;
};

export const Titular: React.FC = () => {
  const f = useCurrentFrame();
  if (!TITULAR || f > TITULAR.hasta + 6) return null;
  const TAM = tamDe();
  const sale = interpolate(f, [TITULAR.hasta, TITULAR.hasta + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Los renglones, del ancho del texto: las palabras que caben en uno, a tamaño fijo.
  const renglones: { t: string; desde: number; ancho: number }[][] = [[]];
  let usado = 0;
  const espacio = TAM * 0.28;
  for (const p of TITULAR.palabras) {
    const ancho = measureText({ text: p.t, fontFamily: LETRA, fontSize: TAM, fontWeight: "800" }).width;
    if (usado + ancho > ZONA.texto.ancho && renglones.at(-1)!.length) {
      renglones.push([]);
      usado = 0;
    }
    renglones.at(-1)!.push({ ...p, ancho });
    usado += ancho + espacio;
  }
  const ultima = TITULAR.palabras.length - 1;
  let k = -1;
  return (
    // En dos renglones sube medio renglón: bajando, el segundo se encimaba con la foto del gancho.
    <div style={{ position: "absolute", left: 0, right: 0, top: ZONA.texto.centro - TAM * 0.62 - (renglones.length > 1 ? TAM * 0.6 : 0), opacity: sale, transform: `scale(${0.9 + 0.1 * sale})` }}>
      {renglones.map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "center", gap: espacio, height: TAM * 1.05, marginLeft: ZONA.texto.x - 540 }}>
          {r.map((p) => {
            k++;
            const a = spring({ frame: f - p.desde, fps: 30, config: { damping: 11, stiffness: 220, mass: 0.6 } });
            if (f < p.desde) return <span key={k} style={{ width: p.ancho }} />;
            return (
              <span
                key={k}
                style={{
                  display: "inline-block",
                  fontFamily: LETRA,
                  fontWeight: 800,
                  fontSize: TAM,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  // La última palabra, la que remata, del color de la luz del video.
                  color: k === ultima ? PALETA.luz : "#ffffff",
                  WebkitTextStroke: `${Math.round(TAM * 0.076)}px #111111`,
                  paintOrder: "stroke fill",
                  textShadow: "0 10px 30px rgba(0,0,0,0.45)",
                  // Entra un 25 % más grande y desde abajo: con 1.6 tapaba a la de al lado («TU PIERNADORMIDA», «RETENIDOPAGA»).
                  transform: `translateY(${(1 - a) * TAM * 0.25}px) scale(${interpolate(a, [0, 1], [1.25, 1])}) rotate(${(1 - a) * -4}deg)`,
                  opacity: Math.min(1, a * 2),
                }}
              >
                {p.t}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
