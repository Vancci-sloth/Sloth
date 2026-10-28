// El personaje, abajo (en vertical, al centro; en horizontal, en el tercio de la derecha: `ZONA.personaje`): una foto
// recortada como sticker (lo único de collage del video). Habla como un muñeco:
// abre la boca en cada sílaba (la foto `abierta` de su pose, que solo cambia la boca; scripts/bocas.py) y
// rebota con la voz. Cambia de pose con un golpe en la palabra que la pide y, en las poses que sostienen algo (la
// moneda, el cartel, el celular), enseña encima lo que se está explicando (`objeto`, en el ancla de la pose). Cuando
// sostiene algo sube un poco, para que se vea sobre el texto de TikTok.
import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import datos from "../datos/personaje.json";
import { BOCA } from "../tiempo";
import { ALTO, ZONA } from "../tema";
import { chueco } from "./ui";

type Bocas = { cerrada: string; abierta?: string };
type Ancla = { x: number; y: number; ancho: number; alto: number; radio: number };
const POSES = datos.poses as Record<string, Bocas>;
const ANCLAS = datos.anclas as Record<string, Ancla>;

/** Lo que enseña en lo que sostiene: una imagen (`src`) o algo dibujado (`nodo`), del tamaño del ancla. */
export type Objeto = { src?: string; nodo?: React.ReactNode };
export type Tramo = { desde: number; pose: string; x?: number; objeto?: Objeto; sube?: number };

/** El nivel de la voz alrededor del cuadro, suavizado: el rebote sigue las sílabas sin temblar. */
const voz = (f: number) => {
  let suma = 0;
  for (let k = -1; k <= 2; k++) suma += BOCA[f + k] ?? 0;
  return suma / 4;
};

/** ¿Boca abierta? La sílaba que suena en este cuadro o el siguiente (la boca se adelanta un poco al sonido). */
const abierta = (f: number) => ((BOCA[f] ?? 0) + (BOCA[f + 1] ?? 0)) / 2 > 0.3;

export const Personaje: React.FC<{ tramos: Tramo[]; entra: number; sale?: number }> = ({ tramos, entra, sale }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < entra - 1 || (sale !== undefined && f > sale + 12)) return null;
  const actual = Math.max(0, tramos.findLastIndex((t) => t.desde <= f));
  const tramo = tramos[actual];
  const bocas = POSES[tramo.pose];
  if (!bocas) throw new Error(`No hay pose «${tramo.pose}»`);
  const lado = ZONA.personaje.alto;
  const previo = actual > 0 ? tramos[actual - 1] : null;
  const paso = spring({ frame: f - tramo.desde, fps, config: { damping: 16, stiffness: 140 } });

  // Entra de golpe desde abajo y sale igual.
  const subida = spring({ frame: f - entra, fps, config: { damping: 13, stiffness: 170, mass: 0.7 } });
  const bajada = sale === undefined ? 0 : interpolate(f, [sale, sale + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const sube = interpolate(paso, [0, 1], [previo?.sube ?? 0, tramo.sube ?? 0]);
  const y = ALTO - lado + 40 + (1 - subida) * lado + bajada * lado - sube;

  // Cada pose nueva se pega con un golpe: llega más grande y girada, y se asienta.
  const golpe = actual > 0 ? spring({ frame: f - tramo.desde, fps, config: { damping: 10, stiffness: 260, mass: 0.5 } }) : 1;
  const giro = chueco(actual + 3, 3) + (1 - golpe) * 6;
  const nivel = voz(f);
  const escala = interpolate(golpe, [0, 1], [1.12, 1]) * (1 + nivel * 0.035);
  const rebote = -nivel * 16;

  const xDe = (t: Tramo) => t.x ?? ZONA.personaje.x;
  const x = previo ? interpolate(paso, [0, 1], [xDe(previo), xDe(tramo)]) : xDe(tramo);
  const ancla = ANCLAS[tramo.pose];
  const foto = bocas.abierta && abierta(f) ? bocas.abierta : bocas.cerrada;

  return (
    <div
      style={{
        position: "absolute",
        left: x - lado / 2,
        top: y + rebote,
        width: lado,
        height: lado,
        transform: `rotate(${giro}deg) scale(${escala})`,
        transformOrigin: "50% 100%",
        filter: "drop-shadow(0 18px 24px rgba(0,0,0,0.5))",
      }}
    >
      <Img src={staticFile(foto)} style={{ width: lado, height: lado }} />
      {tramo.objeto && ancla ? (
        <div
          style={{
            position: "absolute",
            left: (ancla.x - ancla.ancho / 2) * lado,
            top: (ancla.y - ancla.alto / 2) * lado,
            width: ancla.ancho * lado,
            height: ancla.alto * lado,
            borderRadius: ancla.radio * lado,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {tramo.objeto.src ? <Img src={staticFile(tramo.objeto.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : tramo.objeto.nodo}
        </div>
      ) : null}
    </div>
  );
};

/** El lado del lienzo del personaje, para dibujar lo que sostiene a su escala. */
export const anchoAncla = (pose: string) => (ANCLAS[pose]?.ancho ?? 0) * ZONA.personaje.alto;
