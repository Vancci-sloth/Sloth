import React, { createContext, useContext } from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { Video, type VideoObjectFit } from "@remotion/media";
import { COLOR, FUENTE, RELLENO } from "./estilo";

export type Palabra = { t: string; s: number; e: number };
export type Beat = { id: string; inicio: number; fin: number; palabras: Palabra[]; v: Record<string, any> };

/** El beat que se está dibujando, con sus palabras en segundos desde que empieza el beat. */
const BeatCtx = createContext<Beat | null>(null);
export const BeatProvider = BeatCtx.Provider;

/**
 * El lienzo donde se dibuja la escena. En vertical es la zona de contenido, `W`x`H`
 * (1080x1156), y `vertical` es true: cada escena que lo lee se acomoda a esa zona. Las que no lo leen se dibujan en
 * 1920x1080 escaladas al ancho (el respaldo de `Video.tsx`).
 */
export type Formato = { vertical: boolean; W: number; H: number };
export const HORIZONTAL: Formato = { vertical: false, W: 1920, H: 1080 };
const FormatoCtx = createContext<Formato>(HORIZONTAL);
export const FormatoProvider = FormatoCtx.Provider;
export const useFormato = () => useContext(FormatoCtx);

export const useBeat = () => {
  const beat = useContext(BeatCtx)!;
  const { fps } = useVideoConfig();
  // Al menos un cuadro: un beat que la voz aún no dice (faltan escenas o no coincide el `say`) dura 0, y con 0 las
  // animaciones de [0, duracion] truenan.
  const duracion = Math.max(1, Math.round((beat.fin - beat.inicio) * fps));
  /** Fotograma (relativo al beat) en que empieza la palabra i; negativo cuenta desde el final. */
  const palabra = (i: number) => {
    const p = beat.palabras[i < 0 ? beat.palabras.length + i : i];
    return p ? Math.max(0, Math.round((p.s - beat.inicio) * fps)) : 0;
  };
  /** Fotograma de la primera palabra que empieza por `texto` (sin tildes ni mayúsculas). */
  const en = (texto: string, desde = 0) => {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const i = beat.palabras.findIndex((p, k) => k >= desde && norm(p.t).startsWith(norm(texto)));
    return i < 0 ? Math.round(duracion / 2) : palabra(i);
  };
  return { beat, v: beat.v, duracion, palabra, en, fps };
};

/**
 * Un video de public/ sin sonido, desde su fotograma `desde`. Es el <Video> de @remotion/media: lo decodifica el propio
 * navegador, así que sale igual en la vista en vivo, en el render de siempre y en el render web de final.py, que no
 * acepta <OffthreadVideo>. El `objectFit` del estilo pasa a su prop; sin él, llena la caja, como el <img> que dibujaba
 * OffthreadVideo.
 */
export const VideoMudo: React.FC<{ src: string; desde?: number; vel?: number; style?: React.CSSProperties }> = ({ src, desde = 0, vel = 1, style }) => {
  const { objectFit = "fill", ...resto } = style ?? {};
  return <Video src={staticFile(src)} trimBefore={desde} muted playbackRate={vel} objectFit={objectFit as VideoObjectFit} style={resto} />;
};

/** Un clip de public/ desde su fotograma `inicio`. */
export const Metraje: React.FC<{ src: string; inicio: number; vel?: number; style?: React.CSSProperties }> = ({ src, inicio, vel = 1, style }) => (
  <VideoMudo src={src} desde={inicio} vel={vel} style={style} />
);

/** Un resorte que arranca en `desde`. */
export const useResorte = (desde = 0, config: Partial<{ damping: number; stiffness: number; mass: number }> = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - desde, fps, config: { damping: 13, stiffness: 170, mass: 0.9, ...config } });
};

export const Lleno: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: "absolute", inset: 0, ...style }}>{children}</div>
);

/** Empuje lento de cámara para que nada se quede quieto. */
export const Camara: React.FC<{ children: React.ReactNode; desde?: number; hasta?: number }> = ({ children, desde = 1, hasta = 1.045 }) => {
  const frame = useCurrentFrame();
  const { duracion } = useBeat();
  const z = interpolate(frame, [0, Math.max(1, duracion)], [desde, hasta], { extrapolateRight: "clamp" });
  return <Lleno style={{ transform: `scale(${z})` }}>{children}</Lleno>;
};

/** Titular grande con relleno degradado, borde grueso y sombra dura, como un rótulo de miniatura. */
export const Rotulo: React.FC<{
  texto: string;
  color?: string;
  tam?: number;
  fuente?: string;
  style?: React.CSSProperties;
  espaciado?: number;
}> = ({ texto, color = "crema", tam = 200, fuente, style, espaciado = 0 }) => {
  const r = RELLENO[color] ?? RELLENO.crema;
  const fam = fuente ?? (color === "crema" ? FUENTE.titulo : FUENTE.gorda);
  const base: React.CSSProperties = {
    fontFamily: fam,
    fontSize: tam,
    lineHeight: 0.95,
    letterSpacing: espaciado,
    whiteSpace: "pre",
    textAlign: "center",
  };
  if (color === "crema") {
    return (
      <div style={{ ...base, color: COLOR.crema, textShadow: `0 ${tam * 0.04}px 0 rgba(0,0,0,0.55)`, ...style }}>{texto}</div>
    );
  }
  const grosor = Math.max(6, tam * 0.07);
  return (
    <div style={{ position: "relative", ...style }}>
      <div
        style={{
          ...base,
          position: "absolute",
          inset: 0,
          color: r.borde,
          WebkitTextStroke: `${grosor * 2}px ${r.borde}`,
          transform: `translateY(${tam * 0.06}px)`,
          filter: `drop-shadow(0 ${tam * 0.04}px 0 ${r.sombra})`,
        }}
      >
        {texto}
      </div>
      <div style={{ ...base, position: "relative", background: r.fondo, WebkitBackgroundClip: "text", color: "transparent" }}>{texto}</div>
    </div>
  );
};

/** Texto de meme: blanco, condensado, con contorno negro. */
export const TextoMeme: React.FC<{ texto: string; tam?: number; rojo?: boolean; style?: React.CSSProperties }> = ({
  texto,
  tam = 64,
  rojo,
  style,
}) =>
  rojo ? (
    <div
      style={{
        fontFamily: FUENTE.titulo,
        fontSize: tam,
        color: "white",
        background: COLOR.rojo,
        padding: `${tam * 0.08}px ${tam * 0.3}px`,
        boxShadow: "0 8px 0 rgba(0,0,0,0.6)",
        whiteSpace: "pre",
        ...style,
      }}
    >
      {texto}
    </div>
  ) : (
    <div
      style={{
        fontFamily: FUENTE.titulo,
        fontSize: tam,
        color: "white",
        WebkitTextStroke: `${tam * 0.09}px black`,
        paintOrder: "stroke fill",
        textShadow: "0 6px 0 rgba(0,0,0,0.7)",
        whiteSpace: "pre",
        letterSpacing: 1,
        ...style,
      }}
    >
      {texto}
    </div>
  );

/** Un emoji 3D que entra con rebote y luego flota. */
export const Emoji: React.FC<{
  src: string;
  tam?: number;
  desde?: number;
  x?: number;
  y?: number;
  rot?: number;
  flotar?: boolean;
  style?: React.CSSProperties;
}> = ({ src, tam = 220, desde = 0, x, y, rot = 0, flotar = true, style }) => {
  const frame = useCurrentFrame();
  const s = useResorte(desde, { damping: 9, stiffness: 160 });
  const f = flotar ? Math.sin((frame - desde) / 9) * 8 : 0;
  const pos: React.CSSProperties = x !== undefined ? { position: "absolute", left: x - tam / 2, top: (y ?? 0) - tam / 2 } : {};
  return (
    <Img
      src={staticFile(src)}
      style={{
        width: tam,
        height: tam,
        transform: `translateY(${f}px) scale(${s}) rotate(${rot + (1 - s) * -30}deg)`,
        filter: "drop-shadow(0 14px 18px rgba(0,0,0,0.5))",
        ...pos,
        ...style,
      }}
    />
  );
};

/** La mano que señala, entrando desde su lado y empujando hacia lo que señala. */
export const Mano: React.FC<{ x: number; y: number; dir?: "derecha" | "izquierda" | "abajo"; desde?: number; tam?: number }> = ({
  x,
  y,
  dir = "derecha",
  desde = 0,
  tam = 170,
}) => {
  const frame = useCurrentFrame();
  const s = useResorte(desde, { damping: 11, stiffness: 140 });
  if (frame < desde) return null;
  const empuje = Math.sin((frame - desde) / 4) * 12;
  const src = dir === "derecha" ? "emoji/mano_derecha.png" : dir === "izquierda" ? "emoji/mano_izquierda.png" : "emoji/mano_abajo.png";
  const entrada = (1 - s) * 400;
  const [dx, dy] = dir === "derecha" ? [-entrada + empuje, 0] : dir === "izquierda" ? [entrada - empuje, 0] : [0, -entrada + empuje];
  return (
    <Img
      src={staticFile(src)}
      style={{
        position: "absolute",
        left: x - tam / 2,
        top: y - tam / 2,
        width: tam,
        height: tam,
        transform: `translate(${dx}px, ${dy}px)`,
        opacity: Math.min(1, s * 2),
        filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.6))",
      }}
    />
  );
};

/** Rectángulo rojo que se dibuja alrededor de algo. */
export const Caja: React.FC<{ x: number; y: number; w: number; h: number; desde?: number; color?: string; grosor?: number }> = ({
  x,
  y,
  w,
  h,
  desde = 0,
  color = COLOR.rojo,
  grosor = 7,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [desde, desde + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  if (frame < desde) return null;
  return (
    <svg style={{ position: "absolute", left: x - 20, top: y - 20, overflow: "visible" }} width={w + 40} height={h + 40}>
      <rect x={20} y={20} width={w} height={h} rx={6} fill="none" stroke={color} strokeWidth={grosor} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
    </svg>
  );
};

/** Sello de goma que cae girado y rebota. */
export const Sello: React.FC<{ texto: string; desde?: number; color?: string; tam?: number; rot?: number; style?: React.CSSProperties }> = ({
  texto,
  desde = 0,
  color = COLOR.rojo,
  tam = 90,
  rot = -12,
  style,
}) => {
  const frame = useCurrentFrame();
  const s = useResorte(desde, { damping: 14, stiffness: 260 });
  if (frame < desde) return null;
  const escala = interpolate(s, [0, 1], [2.6, 1]);
  return (
    <div
      style={{
        fontFamily: FUENTE.titulo,
        fontSize: tam,
        color,
        border: `${tam * 0.09}px solid ${color}`,
        borderRadius: tam * 0.12,
        padding: `${tam * 0.02}px ${tam * 0.25}px`,
        transform: `rotate(${rot}deg) scale(${escala})`,
        opacity: Math.min(1, s * 1.6),
        whiteSpace: "pre",
        letterSpacing: 2,
        mixBlendMode: "normal",
        background: "rgba(0,0,0,0.25)",
        ...style,
      }}
    >
      {texto}
    </div>
  );
};

/** Marco con sombra y leve giro para imágenes y capturas. */
export const Tarjeta: React.FC<{ children: React.ReactNode; rot?: number; desde?: number; style?: React.CSSProperties; desdeAbajo?: boolean }> = ({
  children,
  rot = -1.5,
  desde = 0,
  style,
  desdeAbajo = true,
}) => {
  const s = useResorte(desde, { damping: 15, stiffness: 150 });
  const frame = useCurrentFrame();
  if (frame < desde) return null;
  const y = desdeAbajo ? (1 - s) * 500 : 0;
  const esc = desdeAbajo ? 1 : interpolate(s, [0, 1], [0.6, 1]);
  return (
    <div
      style={{
        transform: `translateY(${y}px) rotate(${rot * s}deg) scale(${esc})`,
        boxShadow: "0 30px 80px rgba(0,0,0,0.65)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Texto que se escribe letra por letra. */
export const Tecleo: React.FC<{ texto: string; desde?: number; cps?: number; cursor?: boolean; style?: React.CSSProperties }> = ({
  texto,
  desde = 0,
  cps = 28,
  cursor = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(0, Math.floor(((frame - desde) / fps) * cps));
  const visible = texto.slice(0, n);
  const parpadeo = Math.floor(frame / 8) % 2 === 0;
  return (
    <span style={style}>
      {visible}
      {cursor && <span style={{ opacity: parpadeo || n < texto.length ? 1 : 0 }}>▌</span>}
    </span>
  );
};

/** Fecha en letra de píxeles, como un rótulo de videojuego. */
export const FechaPixel: React.FC<{ texto: string; desde?: number; tam?: number; color?: string; style?: React.CSSProperties }> = ({
  texto,
  desde = 0,
  tam = 76,
  color = COLOR.crema,
  style,
}) => (
  <div style={{ fontFamily: FUENTE.pixel, fontWeight: 700, fontSize: tam, color, textShadow: "0 6px 0 rgba(0,0,0,0.7)", ...style }}>
    <Tecleo texto={texto} desde={desde} cps={30} cursor={false} />
  </div>
);

/** Número en círculo para listas ("1", "2"). */
export const Numero: React.FC<{ n: string; desde?: number; style?: React.CSSProperties }> = ({ n, desde = 0, style }) => {
  const s = useResorte(desde, { damping: 10, stiffness: 200 });
  return (
    <div
      style={{
        width: 170,
        height: 170,
        borderRadius: 85,
        background: COLOR.amarillo,
        color: "#111",
        fontFamily: FUENTE.titulo,
        fontSize: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${s}) rotate(${(1 - s) * 90}deg)`,
        boxShadow: "0 10px 0 rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      {n}
    </div>
  );
};

/** Sacudida de pantalla que decae. */
export const useSacudida = (desde: number, fuerza = 18, dura = 12) => {
  const frame = useCurrentFrame();
  const t = frame - desde;
  if (t < 0 || t > dura) return "translate(0px,0px)";
  const a = fuerza * (1 - t / dura);
  return `translate(${Math.sin(t * 2.7) * a}px, ${Math.cos(t * 3.3) * a}px)`;
};
