// La gráfica de precio con datos reales: la línea se dibuja de izquierda a derecha entre dos cuadros, con un punto
// brillante en la punta y su precio al lado, que corre con ella. Las marcas (máximo, mínimo, una fecha) aparecen cuando
// la línea pasa por ellas.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { LETRA, MONO } from "../tema";
import { Subrayado, sujeta, suave, useColores } from "./ui";

export type Punto = [number, number]; // [ms, precio]

const FECHA = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** El cursor sobre la gráfica: la raya, el punto y la etiqueta con la fecha y el valor de ese día. */
const Cursor: React.FC<{ datos: Punto[]; t: number; x: (t: number) => number; y: (v: number) => number; alto: number; formato: (v: number) => string }> = ({
  datos,
  t,
  x,
  y,
  alto,
  formato,
}) => {
  const k = Math.max(1, datos.findIndex((d) => d[0] >= t));
  const [a, b] = [datos[k - 1], datos[k] ?? datos[k - 1]];
  const v = b[0] === a[0] ? a[1] : a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
  const px = x(t);
  const py = y(v);
  const derecha = px < x(datos.at(-1)![0]) * 0.62;
  return (
    <>
      <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: alto, overflow: "visible" }}>
        <line x1={px} x2={px} y1={0} y2={alto} stroke="#7a7a7a" strokeWidth={3} strokeDasharray="8 8" />
        <circle cx={px} cy={py} r={13} fill="#fff" stroke="#111" strokeWidth={5} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: px + (derecha ? 26 : -26),
          top: Math.min(alto - 120, Math.max(0, py - 130)),
          transform: derecha ? undefined : "translateX(-100%)",
          background: "#111",
          color: "#fff",
          borderRadius: 16,
          padding: "12px 20px",
          fontFamily: LETRA,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 600, color: "#a0a0a0" }}>{FECHA.format(t)}</div>
        <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700 }}>{formato(v)}</div>
      </div>
    </>
  );
};
/** Una marca sobre la línea; con `subraya` (un cuadro), además se subraya en rojo a mano en ese cuadro. */
export type Marca = { t: number; texto: string; arriba?: boolean; color?: string; subraya?: number };

const dinero = (v: number) =>
  v >= 1 ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${v.toFixed(v < 0.1 ? 3 : 2)}`;

export const Grafica: React.FC<{
  datos: Punto[];
  desde: number;
  hasta: number;
  ancho: number;
  alto: number;
  color: string;
  marcas?: Marca[];
  etiquetaPunta?: boolean;
  /** Cuando ya se dibujó, un cursor la recorre despacio con la fecha y el valor (como pasar el mouse). */
  cursor?: boolean;
  formato?: (v: number) => string;
}> = ({ datos, desde, hasta, ancho, alto, color, marcas = [], etiquetaPunta = true, cursor = false, formato = dinero }) => {
  const f = useCurrentFrame();
  const c = useColores();
  const p = interpolate(f, [desde, hasta], [0, 1], { ...sujeta, easing: suave });
  const t0 = datos[0][0];
  const t1 = datos.at(-1)![0];
  const max = Math.max(...datos.map((d) => d[1]));
  const x = (t: number) => ((t - t0) / (t1 - t0)) * ancho;
  const y = (v: number) => alto - (v / (max * 1.06)) * alto;

  // Hasta dónde llega la línea en este cuadro, con el último tramo interpolado para que la punta no salte de día en día.
  const tPunta = t0 + (t1 - t0) * p;
  const visibles = datos.filter((d) => d[0] <= tPunta);
  const sig = datos.find((d) => d[0] > tPunta);
  const ult = visibles.at(-1) ?? datos[0];
  const vPunta = sig ? ult[1] + ((sig[1] - ult[1]) * (tPunta - ult[0])) / (sig[0] - ult[0]) : ult[1];
  const puntos: Punto[] = [...visibles, [tPunta, vPunta]];
  const linea = puntos.map((d, i) => `${i ? "L" : "M"}${x(d[0]).toFixed(1)},${y(d[1]).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(tPunta).toFixed(1)},${alto} L0,${alto} Z`;
  const id = `g${Math.round(ancho)}${Math.round(alto)}`;

  return (
    <div style={{ position: "relative", width: ancho, height: alto }}>
      <svg width={ancho} height={alto} style={{ overflow: "visible", position: "absolute" }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((k) => (
          <line key={k} x1={0} x2={ancho} y1={alto * k} y2={alto * k} stroke={c.borde} strokeWidth={2} strokeDasharray="4 8" />
        ))}
        {p > 0 ? (
          <>
            <path d={area} fill={`url(#${id})`} />
            <path d={linea} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(tPunta)} cy={y(vPunta)} r={11} fill={color} />
            <circle cx={x(tPunta)} cy={y(vPunta)} r={24} fill={color} opacity={0.25} />
            {/* La punta sigue viva aunque la línea ya llegó: una onda que sale cada segundo. */}
            <circle cx={x(tPunta)} cy={y(vPunta)} r={14 + ((f % 30) / 30) * 46} fill="none" stroke={color} strokeWidth={4} opacity={(1 - (f % 30) / 30) * 0.8} />
          </>
        ) : null}
      </svg>
      {marcas.map((m) => {
        if (p <= 0 || m.t > tPunta) return null;
        const v = datos.reduce((a, b) => (Math.abs(b[0] - m.t) < Math.abs(a[0] - m.t) ? b : a))[1];
        const arriba = m.arriba ?? true;
        return (
          <div
            key={m.texto}
            style={{
              position: "absolute",
              left: x(m.t),
              top: y(v) + (arriba ? -26 : 26),
              transform: `translate(-50%, ${arriba ? "-100%" : "0"})`,
              fontFamily: LETRA,
              fontSize: 38,
              fontWeight: 800,
              color: m.color ?? c.texto,
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            {m.subraya === undefined ? m.texto : <Subrayado en={m.subraya}>{m.texto}</Subrayado>}
          </div>
        );
      })}
      {cursor && f > hasta + 6 ? <Cursor datos={datos} t={t0 + (t1 - t0) * (0.12 + 0.8 * (0.5 - 0.5 * Math.cos((f - hasta - 6) / 34)))} x={x} y={y} alto={alto} formato={formato} /> : null}
      {etiquetaPunta && p > 0 ? (
        <div
          style={{
            position: "absolute",
            left: x(tPunta) + 30,
            top: y(vPunta),
            transform: "translateY(-50%)",
            fontFamily: MONO,
            fontSize: 42,
            fontWeight: 700,
            color,
            whiteSpace: "nowrap",
          }}
        >
          {dinero(vPunta)}
        </div>
      ) : null}
    </div>
  );
};
