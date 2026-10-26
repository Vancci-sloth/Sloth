// Las piezas 2D: cómo entra cada cosa, la tarjeta, el crédito de la fuente, el contador, el resaltado, el subrayado y
// la flecha. Todas toman los colores del tema del capítulo (TemaContexto, lo pone Video.tsx).
import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORES, LETRA, MONO, ROJO, Tema } from "../tema";

export const TemaContexto = createContext<Tema>("oscuro");
export const useColores = () => COLORES[useContext(TemaContexto)];

export const sujeta = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const suave = Easing.bezier(0.2, 0.7, 0.2, 1);

/** Un giro de -max a max grados que depende de `semilla`, no del azar: el mismo en cada render (el perro chueco). */
export const chueco = (semilla: number, max = 3.5) => {
  const x = Math.sin(semilla * 12.9898 + 78.233) * 43758.5453;
  return ((x - Math.floor(x)) * 2 - 1) * max;
};

/** 0 → 1 con un resorte que se asienta sin rebotar de más, desde el cuadro `desde`. */
export const useEntrada = (desde: number, rigidez = 140) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - desde, fps, config: { damping: 17, stiffness: rigidez, mass: 0.8 } });
};

/**
 * Cómo entra una cosa: desenfocada, un poco más grande y girada, y se
 * asienta en ~6 cuadros. `sale` la desvanece con desenfoque.
 */
export const Aparece: React.FC<{
  en: number;
  sale?: number;
  giro?: number;
  desde?: { x?: number; y?: number; escala?: number };
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ en, sale, giro = 0, desde = {}, style, children }) => {
  const f = useCurrentFrame();
  const a = useEntrada(en);
  if (f < en) return null;
  const s = sale === undefined ? 0 : interpolate(f, [sale, sale + 6], [0, 1], sujeta);
  if (s >= 1) return null;
  const escala = interpolate(a, [0, 1], [desde.escala ?? 1.08, 1]);
  return (
    <div
      style={{
        position: "absolute",
        opacity: Math.min(1, a * 1.6) * (1 - s),
        filter: a < 0.98 || s > 0 ? `blur(${(1 - Math.min(1, a * 1.15)) * 14 + s * 12}px)` : undefined,
        transform: `translate(${(1 - a) * (desde.x ?? 0)}px, ${(1 - a) * (desde.y ?? 24)}px) scale(${escala}) rotate(${(1 - a) * giro}deg)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Tarjeta: React.FC<{ ancho?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ ancho, style, children }) => {
  const c = useColores();
  return (
    <div
      style={{
        width: ancho,
        background: c.tarjeta,
        border: `2px solid ${c.borde}`,
        borderRadius: 24,
        boxShadow: c.sombra,
        fontFamily: LETRA,
        color: c.texto,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** El crédito chico bajo cada prueba: de dónde sale lo que se ve. */
export const Fuente: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const c = useColores();
  return <div style={{ fontFamily: LETRA, fontSize: 25, fontWeight: 500, color: c.tenue, marginTop: 14, ...style }}>{children}</div>;
};

/** Un número que corre de `de` a `a` entre dos cuadros. */
export const Contador: React.FC<{
  de: number;
  a: number;
  desde: number;
  hasta: number;
  decimales?: number;
  prefijo?: string;
  sufijo?: string;
  style?: React.CSSProperties;
}> = ({ de, a, desde, hasta, decimales = 0, prefijo = "", sufijo = "", style }) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [desde, hasta], [de, a], { ...sujeta, easing: Easing.out(Easing.cubic) });
  const texto = v.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{prefijo + texto + sufijo}</span>;
};

/** El marcador amarillo sobre una frase citada (el «porting» del README, 77 s). */
export const Resaltado: React.FC<{ en: number; color?: string; children: React.ReactNode }> = ({ en, color = "rgba(250,204,21,0.55)", children }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [en, en + 8], [0, 100], { ...sujeta, easing: suave });
  return (
    <span style={{ backgroundImage: `linear-gradient(${color}, ${color})`, backgroundSize: `${p}% 100%`, backgroundRepeat: "no-repeat", borderRadius: 4, padding: "0 2px" }}>
      {children}
    </span>
  );
};

/** Texto de código o de terminal que se escribe letra por letra. */
export const Tecleo: React.FC<{ texto: string; desde: number; hasta: number; style?: React.CSSProperties }> = ({ texto, desde, hasta, style }) => {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [desde, hasta], [0, texto.length], sujeta));
  const cursor = f >= desde && (n < texto.length || Math.floor(f / 8) % 2 === 0);
  return (
    <span style={{ fontFamily: MONO, whiteSpace: "pre", ...style }}>
      {texto.slice(0, n)}
      {cursor ? <span style={{ opacity: 0.8 }}>▍</span> : null}
    </span>
  );
};

/** Ondas que salen de un punto cada `cada` cuadros, como un radar: lo que está pasando ahora. */
export const Pulso: React.FC<{ x: number; y: number; desde: number; hasta?: number; color: string; radio?: number; cada?: number; grosor?: number }> = ({
  x,
  y,
  desde,
  hasta = Infinity,
  color,
  radio = 120,
  cada = 36,
  grosor = 4,
}) => {
  const f = useCurrentFrame();
  if (f < desde || f > hasta + cada) return null;
  const ondas = [];
  for (let k = 0; k < 2; k++) {
    const t = (((f - desde) / cada + k / 2) % 1 + 1) % 1;
    const nace = desde + Math.floor((f - desde) / cada - k / 2) * cada + (k * cada) / 2;
    if (nace < desde || nace > hasta) continue;
    ondas.push(
      <div
        key={k}
        style={{
          position: "absolute",
          left: x - radio,
          top: y - radio,
          width: radio * 2,
          height: radio * 2,
          borderRadius: radio * 2,
          border: `${grosor}px solid ${color}`,
          transform: `scale(${0.35 + t * 0.85})`,
          opacity: (1 - t) * 0.7,
        }}
      />,
    );
  }
  return <>{ondas}</>;
};


/**
 * El subrayado rojo bajo el dato exacto que prueba lo que dice la voz (un círculo a mano no cierra y estorba). Se
 * dibuja de izquierda a derecha en ~8 cuadros, apenas inclinado, como un plumón. Va en un tramo de una sola línea.
 */
export const Subrayado: React.FC<{ en: number; color?: string; grosor?: number; children: React.ReactNode }> = ({ en, color = ROJO, grosor = 7, children }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [en, en + 8], [0, 1], { ...sujeta, easing: suave });
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {children}
      {p > 0 ? (
        <span
          style={{
            position: "absolute",
            left: "-2%",
            bottom: -2,
            width: `${104 * p}%`,
            height: grosor,
            borderRadius: grosor,
            background: color,
            transform: "rotate(-0.7deg)",
            transformOrigin: "0 50%",
          }}
        />
      ) : null}
    </span>
  );
};

type Caja = { x: number; y: number; w: number; h: number };

/** Marca algo para que una Flecha lo encuentre. El `id` es único en todo el video. */
export const Ancla: React.FC<{ id: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ id, style, children }) => (
  <div data-ancla={id} style={{ display: "inline-block", ...style }}>
    {children}
  </div>
);

const HUECO = 16; // lo que la flecha se queda antes de cada borde
const ORILLA = 36; // ni sale ni llega pegada a una esquina

const entre = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * De dónde a dónde va la flecha: del borde de `o` que mira a `d` al borde de `d` que mira a `o`, sin entrar en ninguno.
 * Si las cajas se enciman de lado, la flecha va recta por lo que comparten; si no, de lo más cercano a lo más cercano.
 * `sale` y `llega` (0–1) eligen el punto a lo largo de cada borde.
 */
const tramo = (o: Caja, d: Caja, sale?: number, llega?: number): [number, number, number, number] => {
  const sepV = Math.max(d.y - (o.y + o.h), o.y - (d.y + d.h));
  const sepH = Math.max(d.x - (o.x + o.w), o.x - (d.x + d.w));
  // Lo mismo en los dos ejes: [inicio, largo] de cada caja a lo largo del borde, y dónde se cruzan.
  const punto = (oa: number, ol: number, da: number, dl: number): [number, number] => {
    const ini = Math.max(oa, da) + ORILLA;
    const fin = Math.min(oa + ol, da + dl) - ORILLA;
    let p2 = llega !== undefined ? da + dl * llega : fin > ini ? (ini + fin) / 2 : entre(oa + ol / 2, da + ORILLA, da + dl - ORILLA);
    let p1 = sale !== undefined ? oa + ol * sale : entre(p2, oa + ORILLA, oa + ol - ORILLA);
    if (llega === undefined && sale !== undefined) p2 = entre(p1, da + ORILLA, da + dl - ORILLA);
    return [p1, p2];
  };
  if (sepV >= sepH) {
    const baja = d.y > o.y;
    const [x1, x2] = punto(o.x, o.w, d.x, d.w);
    return [x1, baja ? o.y + o.h + HUECO : o.y - HUECO, x2, baja ? d.y - HUECO : d.y + d.h + HUECO];
  }
  const derecha = d.x > o.x;
  const [y1, y2] = punto(o.y, o.h, d.y, d.h);
  return [derecha ? o.x + o.w + HUECO : o.x - HUECO, y1, derecha ? d.x - HUECO : d.x + d.w + HUECO, y2];
};

/**
 * La flecha roja de una prueba a lo que prueba. No lleva coordenadas a mano: busca en pantalla sus dos `Ancla` (`de` y
 * `a`) cada cuadro y va de borde a borde, así apunta justo aunque las cosas floten y no entra a tapar su texto. Si una
 * de las dos no está en pantalla, no se dibuja: nada apunta a la nada. Se dibuja desde `en` en ~10 cuadros.
 */
export const Flecha: React.FC<{ en: number; de: string; a: string; curva?: number; sale?: number; llega?: number; color?: string }> = ({
  en,
  de,
  a,
  curva = 0.12,
  sale,
  llega,
  color = ROJO,
}) => {
  const f = useCurrentFrame();
  const ref = useRef<SVGSVGElement>(null);
  const [cajas, setCajas] = useState<[Caja, Caja] | null>(null);
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const base = svg.getBoundingClientRect();
    const k = base.width / 1080;
    const medir = (id: string): Caja | null => {
      const el = document.querySelector(`[data-ancla="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const n = (v: number) => Math.round(v * 10) / 10;
      return { x: n((r.left - base.left) / k), y: n((r.top - base.top) / k), w: n(r.width / k), h: n(r.height / k) };
    };
    const o = medir(de);
    const d = medir(a);
    const nuevas: [Caja, Caja] | null = o && d ? [o, d] : null;
    if (JSON.stringify(nuevas) !== JSON.stringify(cajas)) setCajas(nuevas);
  });
  const p = interpolate(f, [en, en + 10], [0, 1], { ...sujeta, easing: suave });
  if (p <= 0) return null;
  let dibujo: React.ReactNode = null;
  if (cajas) {
    const [x1, y1, x2, y2] = tramo(cajas[0], cajas[1], sale, llega);
    const cx = (x1 + x2) / 2 - (y2 - y1) * curva;
    const cy = (y1 + y2) / 2 + (x2 - x1) * curva;
    // La punta mira hacia donde llega la curva.
    const ang = Math.atan2(y2 - cy, x2 - cx);
    const punta = interpolate(p, [0.8, 1], [0, 1], sujeta);
    const L = 30 * punta;
    const A = 18 * punta;
    const bx = x2 - Math.cos(ang) * L;
    const by = y2 - Math.sin(ang) * L;
    dibujo = (
      <>
        <path d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p * 0.97} />
        <circle cx={x1} cy={y1} r={8} fill={color} />
        {punta > 0 ? (
          <polygon
            points={`${x2},${y2} ${bx - Math.sin(ang) * A},${by + Math.cos(ang) * A} ${bx + Math.sin(ang) * A},${by - Math.cos(ang) * A}`}
            fill={color}
            stroke={color}
            strokeWidth={5}
            strokeLinejoin="round"
          />
        ) : null}
      </>
    );
  }
  return (
    <svg ref={ref} style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, overflow: "visible", pointerEvents: "none" }}>
      {dibujo}
    </svg>
  );
};

/** Como Aparece, pero sin posición propia: para lo que va clavado en el mundo 3D (EnMundo) o dentro de otra caja. */
export const Entra: React.FC<{ en: number; sale?: number; desde?: { y?: number; escala?: number }; children: React.ReactNode }> = ({ en, sale, desde = {}, children }) => {
  const f = useCurrentFrame();
  const a = useEntrada(en);
  if (f < en) return null;
  const s = sale === undefined ? 0 : interpolate(f, [sale, sale + 6], [0, 1], sujeta);
  if (s >= 1) return null;
  return (
    <div
      style={{
        opacity: Math.min(1, a * 1.6) * (1 - s),
        filter: a < 0.98 || s > 0 ? `blur(${(1 - Math.min(1, a * 1.15)) * 14 + s * 12}px)` : undefined,
        transform: `translateY(${(1 - a) * (desde.y ?? 24)}px) scale(${interpolate(a, [0, 1], [desde.escala ?? 1.08, 1])})`,
      }}
    >
      {children}
    </div>
  );
};
