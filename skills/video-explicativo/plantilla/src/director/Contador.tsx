// El contador vivo (`contador` y `cuenta` de momentos.json): un número que corre con la historia, entre el texto y la
// escena, como el «GOLPES 99» o la población que baja de los videos de 3D que pegan. Corre de un valor al siguiente en
// cada paso que trae `cuenta`, y entra con el primero.
import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { LETRA, MONO, PALETA, SIGNIFICA, ZONA } from "../tema";
import { CUENTAS, DESDE_CIERRE, enTramos, GUION, TRAMOS_CIFRA } from "./guion";
import { TITULAR } from "./Titular";

export const ContadorVivo: React.FC = () => {
  const f = useCurrentFrame();
  const c = GUION.contador;
  // Entra cuando ya salió el titular del gancho: los dos en el mismo sitio se encimaban.
  const entraEn = Math.max(CUENTAS[0]?.desde ?? 0, TITULAR ? TITULAR.hasta + 6 : 0);
  if (!c || !CUENTAS.length || f < entraEn || (DESDE_CIERRE !== null && f >= DESDE_CIERRE)) return null;
  let valor = CUENTAS[0].valor;
  for (let k = 1; k < CUENTAS.length; k++) {
    const { desde, valor: a } = CUENTAS[k];
    if (f < desde) break;
    valor = interpolate(f, [desde, desde + 24], [CUENTAS[k - 1].valor, a], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  }
  // Con una cifra en pantalla se esconde: dos números a la vez no se leen (guion.ts, `TRAMOS_CIFRA`).
  const entra = interpolate(f, [entraEn, entraEn + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * (1 - enTramos(TRAMOS_CIFRA, f));
  const color = c.color ? ((SIGNIFICA as Record<string, string>)[c.color] ?? c.color) : PALETA.luz;
  const texto = valor.toLocaleString("es-MX", { minimumFractionDigits: c.decimales ?? 0, maximumFractionDigits: c.decimales ?? 0 });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: ZONA.escena.arriba + 6, textAlign: "center", opacity: entra, marginLeft: ZONA.texto.x - 540 }}>
      <div style={{ fontFamily: LETRA, fontWeight: 800, fontSize: 30, letterSpacing: "0.18em", color: "#ffffff", opacity: 0.7, textTransform: "uppercase" }}>{c.nota}</div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 120, lineHeight: 1, color, fontVariantNumeric: "tabular-nums", textShadow: `0 0 30px ${color}66` }}>
        {(c.prefijo ?? "") + texto + (c.sufijo ?? "")}
      </div>
    </div>
  );
};
