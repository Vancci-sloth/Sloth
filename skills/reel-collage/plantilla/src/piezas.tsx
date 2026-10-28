import React from "react";
import { Easing, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/** Dónde está un recorte en un fotograma: x es su centro, y su piso (los pies); giro en grados. */
export type Punto = { x: number; y: number; giro?: number; escala?: number };

/** Un recorte (persona, criatura, utilería) apoyado por los pies en (x, y). Limpio, sin borde ni sombra, como en los
 * reels de referencia. `origen` es el punto sobre el que gira: los pies para una pose, "50% 50%" para lo que vuela. */
export const Recorte: React.FC<Punto & {
  src: string; alto: number; espejo?: boolean; sombra?: boolean; estilo?: React.CSSProperties; origen?: string;
}> = ({ src, x, y, alto, espejo, giro = 0, escala = 1, sombra = false, estilo, origen = "50% 100%" }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -100%)" }}>
    {sombra && (
      <div style={{
        position: "absolute", left: "50%", bottom: -alto * 0.03, width: alto * 0.42 * escala, height: alto * 0.07 * escala,
        transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(rgba(20,30,10,0.45), rgba(20,30,10,0) 70%)",
      }} />
    )}
    <Img src={staticFile(src)} style={{
      height: alto, display: "block", transformOrigin: origen,
      transform: `scale(${escala}) rotate(${giro}deg) scaleX(${espejo ? -1 : 1})`, ...estilo,
    }} />
  </div>
);

/** Varios recortes que se mueven como uno (él con la criatura agarrada, cargada o entre las piernas). Los hijos se
 * colocan con coordenadas relativas a (x, y), que es también el punto sobre el que gira el grupo. */
export const Grupo: React.FC<Punto & { children: React.ReactNode }> = ({ x, y, giro = 0, escala = 1, children }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${giro}deg) scale(${escala})`, transformOrigin: "0 0" }}>
    {children}
  </div>
);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Un lanzamiento: de `de` a `a` entre los fotogramas `desde` y `hasta`, en arco de `altura` px por encima del punto
 * más alto, dando `vueltas` (negativas, al otro lado). Antes de `desde` está en `de`; después, en `a`. Para que salga
 * del cuadro, pon `a` fuera (x < -300 o > 1380) y que el siguiente escenario lo reciba con otro `arco`. */
export const arco = (f: number, desde: number, hasta: number, de: Punto, a: Punto, altura = 300, vueltas = 0): Punto => {
  const t = interpolate(f, [desde, hasta], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cima = Math.min(de.y, a.y) - altura;
  // parábola que pasa por de.y, cima y a.y: un vuelo con gravedad
  const y = (1 - t) * (1 - t) * de.y + 2 * (1 - t) * t * (2 * cima - (de.y + a.y) / 2) + t * t * a.y;
  return {
    x: lerp(de.x, a.x, t), y,
    giro: lerp(de.giro ?? 0, a.giro ?? 0, t) + 360 * vueltas * t,
    escala: lerp(de.escala ?? 1, a.escala ?? 1, t),
  };
};

/** Un recorrido por claves `[fotograma, punto]`, con arranque y frenado suaves en cada tramo (caminar, arrastrar,
 * hundirse, subir nadando). Antes de la primera clave está en ella; después de la última, en la última. */
export const recorrido = (f: number, claves: [number, Punto][]): Punto => {
  if (f <= claves[0][0]) return claves[0][1];
  for (let k = 1; k < claves.length; k++) {
    const [f1, b] = claves[k];
    if (f <= f1) {
      const [f0, a] = claves[k - 1];
      const t = Easing.inOut(Easing.quad)((f - f0) / Math.max(1, f1 - f0));
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), giro: lerp(a.giro ?? 0, b.giro ?? 0, t), escala: lerp(a.escala ?? 1, b.escala ?? 1, t) };
    }
  }
  return claves[claves.length - 1][1];
};

const SALPICADURAS = {
  sangre: { colores: ["#8e0b0b", "#b3140f", "#d4261c"], tam: 22, fuerza: 26, gravedad: 1.6, vida: 22, nube: false },
  agua: { colores: ["#ffffff", "#d8efff", "#a9d6f5"], tam: 18, fuerza: 30, gravedad: 1.8, vida: 20, nube: false },
  polvo: { colores: ["#cbb48c", "#b59c74", "#e0d2b4"], tam: 70, fuerza: 9, gravedad: -0.1, vida: 34, nube: true },
  arena: { colores: ["#e4d3a8", "#cdb98a", "#f3e7c8"], tam: 60, fuerza: 8, gravedad: 0.05, vida: 40, nube: true },
  humo: { colores: ["#8e0b0b", "#6e0909", "#a3150f"], tam: 90, fuerza: 6, gravedad: -0.05, vida: 45, nube: true },
  chispas: { colores: ["#fff6c2", "#ffd34d", "#ffb020"], tam: 9, fuerza: 34, gravedad: 0.9, vida: 14, nube: false },
} as const;

/** Lo que salta en un impacto, desde el fotograma `t` en (x, y): gotas (sangre, agua, chispas) o una nube que se
 * abre (polvo, arena, humo: la nube roja bajo el agua). Con `temblor` en el mismo fotograma. */
export const Salpicadura: React.FC<{ x: number; y: number; t: number; tipo: keyof typeof SALPICADURAS; n?: number; semilla?: string }> = ({ x, y, t, tipo, n = 26, semilla = "s" }) => {
  const f = useCurrentFrame();
  const s = SALPICADURAS[tipo];
  const k = f - t;
  if (k < 0 || k > s.vida) return null;
  const vivo = 1 - k / s.vida;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const r = (c: string) => random(`${semilla}${c}${i}`);
        // las gotas salen hacia arriba y a los lados; las nubes, hacia todos lados
        const ang = s.nube ? r("a") * Math.PI * 2 : -Math.PI / 2 + (r("a") - 0.5) * Math.PI * 1.3;
        const v = s.fuerza * (0.4 + r("v"));
        const px = x + Math.cos(ang) * v * k * (s.nube ? 1 / (1 + k * 0.08) : 1);
        const py = y + Math.sin(ang) * v * k * (s.nube ? 1 / (1 + k * 0.08) : 1) + 0.5 * s.gravedad * k * k;
        const tam = s.tam * (0.5 + r("t")) * (s.nube ? 0.6 + k / s.vida : 1);
        return (
          <div key={i} style={{
            position: "absolute", left: px - tam / 2, top: py - tam / 2, width: tam, height: tam, borderRadius: "50%",
            background: s.colores[i % s.colores.length], opacity: s.nube ? vivo * 0.75 : Math.min(1, vivo * 1.6),
            filter: s.nube ? `blur(${tam * 0.12}px)` : undefined,
          }} />
        );
      })}
    </>
  );
};

/** Aplasta lo de adentro contra el piso en (x, y), de `k` 0 (nada) a 1 (a la mitad). Es como se ve vencida una
 * criatura simétrica (un logo), que girada de cabeza se ve igual. */
export const Aplastada: React.FC<{ k: number; x: number; y: number; children: React.ReactNode }> = ({ k, x, y, children }) => (
  <div style={{ position: "absolute", inset: 0, transformOrigin: `${x}px ${y}px`, transform: `scaleY(${1 - 0.5 * k})` }}>{children}</div>
);

/** Un chorro de objetos (fichas, monedas, papeles) que caen desde `de()` entre `desde` y `hasta` y se apilan en un
 * montón alrededor de `centro`, sobre `piso`: "sacudirla hasta sacarle X". `de` es una función porque lo que suelta
 * los objetos puede ir moviéndose (sacudido). Va antes de quien la sostiene, para que el chorro caiga detrás de él. */
export const Chorro: React.FC<{
  src: string; desde: number; hasta: number; de: () => Punto; piso: number; centro: number; n?: number; tam?: number; ancho?: number;
}> = ({ src, desde, hasta, de, piso, centro, n = 60, tam = 84, ancho = 300 }) => {
  const f = useCurrentFrame();
  if (f < desde) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t0 = desde + random(`t${i}`) * (hasta - desde);
        if (f < t0) return null;
        const o = de();
        const k = f - t0;
        const dx = (random(`x${i}`) - 0.5) * ancho;
        // el montón tiene forma de loma: más alto al centro
        const final = { x: centro + dx, y: piso - (1 - Math.abs(dx) / (ancho / 2)) * 50 * random(`y${i}`) };
        const vuelo = { x: o.x + (random(`v${i}`) - 0.5) * 9 * k, y: o.y + 2.2 * k * k };
        const cae = vuelo.y >= final.y;
        const p = cae ? final : vuelo;
        return (
          <Img key={i} src={staticFile(src)} style={{
            position: "absolute", left: p.x - tam / 2, top: p.y - tam / 2, width: tam, height: tam,
            transform: `rotate(${cae ? random(`g${i}`) * 360 : k * 30}deg) scaleY(${cae ? 0.7 : 1})`,
          }} />
        );
      })}
    </>
  );
};

/** Temblor de cámara que dura `n` fotogramas desde `t`, para un impacto. Escala un poco: sin eso se ven bordes negros. */
export const temblor = (f: number, t: number, fuerza = 26, n = 9) => {
  const k = f - t;
  if (k < 0 || k > n) return "";
  const a = fuerza * (1 - k / n);
  return `translate(${Math.sin(k * 2.7) * a}px, ${Math.cos(k * 3.3) * a}px) scale(1.06)`;
};

/** Escala de 0 a 1 con rebote, desde el fotograma `desde`: lo que aparece de golpe (las crías que nacen). */
export const usePop = (desde: number, rigidez = 220) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - desde, fps, config: { damping: 11, stiffness: rigidez, mass: 0.6 } });
};

const SISTEMA = "'Segoe UI', Roboto, Arial, sans-serif";

/** El comentario de Instagram en modo oscuro, arriba del clip del gancho, como en los reels de referencia: avatar,
 * usuario con palomita, hace cuánto, el texto como lo escribe la gente, "Responder" y el corazón con sus likes. */
export const Comentario: React.FC<{ usuario: string; texto: string; hace?: string; likes?: string; y?: number }> = ({ usuario, texto, hace = "5 d", likes, y = 300 }) => (
  <div style={{
    position: "absolute", left: 40, right: 40, top: y, background: "rgba(18,18,18,0.94)", borderRadius: 18,
    padding: "22px 26px", display: "flex", gap: 20, fontFamily: SISTEMA, color: "#f5f5f5",
  }}>
    <div style={{
      width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
      background: "radial-gradient(circle at 35% 30%, #c9a27e, #6b4a33)", border: "2px solid #333",
    }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 27, lineHeight: 1.2 }}>
        <b>{usuario}</b>
        <span style={{
          display: "inline-block", width: 24, height: 24, borderRadius: "50%", background: "#3897f0", color: "white",
          fontSize: 17, textAlign: "center", lineHeight: "24px", margin: "0 8px", verticalAlign: "1px",
        }}>✓</span>
        <span style={{ color: "#a8a8a8" }}>{hace}</span>
      </div>
      <div style={{ fontSize: 31, lineHeight: 1.25, marginTop: 4 }}>{texto}</div>
      <div style={{ fontSize: 24, color: "#a8a8a8", marginTop: 10, fontWeight: 600 }}>Responder</div>
    </div>
    <div style={{ textAlign: "center", color: "#a8a8a8", fontSize: 22, flexShrink: 0, paddingTop: 6 }}>
      <div style={{ fontSize: 34, lineHeight: 1 }}>♡</div>
      {likes && <div style={{ marginTop: 4 }}>{likes}</div>}
    </div>
  </div>
);
