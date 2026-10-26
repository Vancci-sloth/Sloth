import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { FUENTE } from "./estilo";
import marca from "./marca.json";
import type { Palabra } from "./piezas";

/**
 * Los subtítulos de la voz, palabra por palabra, en vertical (1080 de ancho). Solo los lleva el episodio vertical
 * (`Video` con `formato: "vertical"`).
 */

const { fontFamily: INTER } = inter("normal", { weights: ["900"], subsets: ["latin", "latin-ext"] });

const ANCHO = 1080;
const ACTIVA = "#ffd23f";

/** Una palabra de los subtítulos: su texto ya limpio, cuándo se dice y de qué tramo es (con una sola voz, todas del 0). */
export type Dicha = { t: string; s: number; e: number; tramo: number };

export const limpia = (t: string) => t.replace(/^[\"“”«»'(\[]+|[\"“”«»')\].,;:…]+$/g, "").toUpperCase();

/**
 * Las cifras leídas en palabras ("ochenta y ocho por ciento") le llegan al alineador como un solo token ("88%"), y
 * sus palabras quedan apretadas en unas centésimas: el resaltado se adelantaría a la voz. Una racha de 3 o más palabras
 * que empiezan con menos de 0.07 s entre sí se reparte, por letras, hasta la palabra siguiente (como mucho 0.07 s por
 * letra, lo que dura decirla).
 */
export const repartir = (palabras: Palabra[]): Palabra[] => {
  const ws = [...palabras].sort((x, y) => x.s - y.s).map((w) => ({ ...w }));
  for (let i = 0; i < ws.length; ) {
    let j = i;
    while (j + 1 < ws.length && ws[j + 1].s - ws[j].s < 0.07) j++;
    if (j - i >= 2) {
      const racha = ws.slice(i, j + 1);
      const letras = racha.map((w) => Math.max(1, w.t.replace(/[^\p{L}\p{N}]/gu, "").length));
      const total = letras.reduce((a, b) => a + b, 0);
      const fin = Math.min(ws[j + 1] ? ws[j + 1].s - 0.08 : Infinity, racha[0].s + total * 0.07);
      const dura = Math.max(fin, racha[racha.length - 1].e) - racha[0].s;
      let t = racha[0].s;
      racha.forEach((w, k) => {
        w.s = t;
        t += (dura * letras[k]) / total;
        w.e = t;
      });
    }
    i = j + 1;
  }
  return ws;
};

const MAX_PALABRAS = 4;
const TAM_SUBS = 70;
/** Ancho de los subtítulos: centrados y lejos de la columna de botones de TikTok y Reels (a la derecha). */
const SUBS_W = 820;
/** Una página cabe en dos renglones; `textWrap: balance` los empareja. */
const MAX_ANCHO = 2 * SUBS_W * 0.92;

/** Ancho aproximado de un texto en Inter 900 mayúsculas, en px a `TAM_SUBS` (el espacio cuenta los márgenes de cada palabra). */
const ancho = (t: string) =>
  [...t].reduce((s, c) => s + (c === " " ? 0.42 : /[IÍ1.,:;!¡'|]/.test(c) ? 0.34 : /[MWÑ%@]/.test(c) ? 0.92 : /[0-9]/.test(c) ? 0.68 : 0.72), 0) * TAM_SUBS;

/**
 * Agrupa en páginas de hasta 4 palabras. Primero parte en frases (puntuación, pausas y uniones de tramos) y luego
 * reparte cada frase en partes parejas: una de 5 palabras va en 3 + 2, no en 4 + 1 con una palabra suelta.
 * `crudas` son los textos sin limpiar (con su puntuación), uno por palabra.
 */
export const paginar = (ws: Dicha[], crudas: string[]): Dicha[][] => {
  const frases: Dicha[][] = [];
  let cur: Dicha[] = [];
  ws.forEach((w, i) => {
    cur.push(w);
    const sig = ws[i + 1];
    if (!sig || sig.tramo !== w.tramo || /[.,;:?!…]["”»]?$/.test(crudas[i]) || sig.s - w.e > 0.45) {
      frases.push(cur);
      cur = [];
    }
  });
  const cabe = (p: Dicha[]) => p.length <= MAX_PALABRAS && ancho(p.map((x) => x.t).join(" ")) <= MAX_ANCHO;
  return frases.flatMap((f) => {
    for (let n = Math.ceil(f.length / MAX_PALABRAS); ; n++) {
      const partes: Dicha[][] = [];
      let k = 0;
      for (let i = 0; i < n; i++) {
        const largo = Math.floor(f.length / n) + (i < f.length % n ? 1 : 0);
        partes.push(f.slice(k, k + largo));
        k += largo;
      }
      if (partes.every((p) => p.length <= 1 || cabe(p))) return partes.filter((p) => p.length);
    }
  });
};

/** Las páginas de una voz entera: todas sus palabras, en segundos del video. */
export const paginasDe = (palabras: Palabra[]): Dicha[][] => {
  const voz = repartir(palabras).filter((w) => limpia(w.t));
  return paginar(
    voz.map((w) => ({ t: limpia(w.t), s: w.s, e: w.e, tramo: 0 })),
    voz.map((w) => w.t)
  );
};

/** La página que se está diciendo, centrada a lo alto en `y`, con la palabra que suena en amarillo. */
export const Subtitulos: React.FC<{ paginas: Dicha[][]; hasta: number; y: number }> = ({ paginas, hasta, y }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const k = paginas.findIndex((p, i) => {
    const ini = p[0].s - 0.06;
    const fin = Math.min(paginas[i + 1] ? paginas[i + 1][0].s - 0.06 : Infinity, p[p.length - 1].e + 0.6, hasta);
    return t >= ini && t < fin;
  });
  if (k < 0) return null;
  const pag = paginas[k];
  const desde = Math.round((pag[0].s - 0.06) * fps);
  const pop = interpolate(f - desde, [0, 3], [0.88, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  let activa = 0;
  pag.forEach((w, i) => {
    if (t >= w.s - 0.03) activa = i;
  });
  return (
    <div
      style={{
        position: "absolute",
        left: (ANCHO - SUBS_W) / 2,
        width: SUBS_W,
        top: y,
        transform: `translateY(-50%) scale(${pop})`,
        textWrap: "balance",
        fontFamily: INTER,
        fontWeight: 900,
        fontSize: TAM_SUBS,
        lineHeight: 1.12,
        textAlign: "center",
      }}
    >
      {pag.map((w, i) => (
        <span
          key={i}
          style={{
            color: i === activa ? ACTIVA : "white",
            WebkitTextStroke: "12px black",
            paintOrder: "stroke fill",
            textShadow: "0 6px 0 rgba(0,0,0,0.85), 0 10px 26px rgba(0,0,0,0.6)",
            transform: `scale(${i === activa ? 1.06 : 1})`,
            display: "inline-block",
            margin: "0 0.2em",
          }}
        >
          {w.t}
        </span>
      ))}
    </div>
  );
};

/** El sello del programa (`sello` de `src/marca.json`) en un recuadro blanco. */
export const SelloDiff: React.FC<{ tam?: number }> = ({ tam = 30 }) => (
  <div
    style={{
      border: `${Math.round(tam / 6)}px solid white`,
      padding: `${Math.round(tam * 0.18)}px ${Math.round(tam * 0.55)}px`,
      fontFamily: FUENTE.codigo,
      fontWeight: 700,
      fontSize: tam,
      lineHeight: 1,
      letterSpacing: tam * 0.12,
      color: "white",
      whiteSpace: "nowrap",
    }}
  >
    {marca.sello}
  </div>
);

export const C = { crema: "#f3ead3", rojo: "#e8322b" };

/**
 * El lienzo vertical (1080x1920) del episodio (`Video.tsx`), de arriba abajo: la zona
 * segura de las pestañas de la app (0-120), el gancho (124-338), la escena (344-1500), los subtítulos y la zona segura
 * de la descripción y los botones (los 250 px de abajo).
 */
const SEGURA_ARRIBA = 120;
const SEGURA_ABAJO = 250;
const ZONA_Y = 344;
const ZONA_H = 1156;
export const VERTICAL = { ganchoY: SEGURA_ARRIBA + 4, zonaY: ZONA_Y, zonaH: ZONA_H, subsY: Math.round((ZONA_Y + ZONA_H + 1920 - SEGURA_ABAJO) / 2) };
const TAM_GANCHO = 84;

/**
 * El gancho: el sello del programa y el rótulo fijo de arriba, dos renglones separados por \n (el primero en crema, el
 * segundo en rojo). Sin texto, solo el sello.
 */
export const Gancho: React.FC<{ texto: string }> = ({ texto }) => {
  const renglones = texto.split("\n").filter(Boolean).slice(0, 2);
  const largo = Math.max(1, ...renglones.map((r) => r.length));
  // Anton mide ~0.47 em por letra en mayúsculas: el renglón más largo cabe en 980 px; a lo alto, dos renglones de
  // `TAM_GANCHO` caben entre el sello y la zona de contenido.
  const tam = Math.min(TAM_GANCHO, Math.floor(980 / (largo * 0.47)));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: VERTICAL.ganchoY, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <SelloDiff tam={22} />
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FUENTE.titulo, fontSize: tam, lineHeight: 1.0, textAlign: "center" }}>
        {renglones.map((r, i) => (
          <div key={i} style={{ color: i === 0 ? C.crema : C.rojo, textShadow: "0 6px 0 rgba(0,0,0,0.7), 0 0 40px rgba(0,0,0,0.6)", whiteSpace: "nowrap" }}>
            {r}
          </div>
        ))}
      </div>
    </div>
  );
};
