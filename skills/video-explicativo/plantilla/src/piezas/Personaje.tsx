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
import { esquinaEn, REMATES } from "../director/guion";

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

/**
 * ¿Boca abierta en cada cuadro? La sílaba que suena en este cuadro o el siguiente (la boca se adelanta un poco al
 * sonido). Abre con más voz de la que la cierra y cada estado dura al menos dos cuadros: sin eso, la boca abría o cerraba
 * un solo cuadro de 16 a 48 veces por video, y se veía como un parpadeo.
 */
const ABIERTA = (() => {
  const fuera: boolean[] = [];
  let abre = false;
  let desde = -2;
  for (let f = 0; f < BOCA.length; f++) {
    const nivel = ((BOCA[f] ?? 0) + (BOCA[f + 1] ?? 0)) / 2;
    if ((abre ? nivel < 0.2 : nivel > 0.35) && f - desde >= 2) {
      abre = !abre;
      desde = f;
    }
    fuera.push(abre);
  }
  return fuera;
})();
const abierta = (f: number) => ABIERTA[f] ?? false;

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
  // Las poses de un remate (`REMATES`) pegan más fuerte: más grandes y más giradas al llegar.
  const fuerte = REMATES.has(tramo.pose) ? 2 : 1;
  const giro = chueco(actual + 3, 3) + (1 - golpe) * 6 * fuerte;
  const nivel = voz(f);
  // Y en un remate, el zoom a su cara: crece y sube un instante (~0.8 s) y vuelve, como el corte al que reacciona en un
  // video de humor.
  // En el gancho no: taparía la foto o la cosa del primer cuadro, que es lo que tiene que verse.
  const zoom = actual > 0 && REMATES.has(tramo.pose) && !tramo.objeto ? interpolate(f - tramo.desde, [0, 5, 20, 28], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }) : 0;
  // 1.18 y 70 px: con 1.32 y 120 tapaba lo que se estaba explicando (el agua del 5 de noviembre).
  const escala = interpolate(golpe, [0, 1], [1 + 0.12 * fuerte, 1]) * (1 + nivel * 0.035) * (1 + 0.18 * zoom);
  const rebote = -nivel * 16 - zoom * 70;

  const xDe = (t: Tramo) => t.x ?? ZONA.personaje.x;
  const enSitio = previo ? interpolate(paso, [0, 1], [xDe(previo), xDe(tramo)]) : xDe(tramo);
  // En los primeros planos, chico en la esquina de abajo a la derecha (esquinaEn del director).
  const rincon = esquinaEn(f);
  const x = enSitio + rincon * (ALTO > 1200 ? 330 : 120);
  const ancla = ANCLAS[tramo.pose];
  const foto = bocas.abierta && abierta(f) ? bocas.abierta : bocas.cerrada;

  return (
    <div
      data-perro
      style={{
        position: "absolute",
        left: x - lado / 2,
        top: y + rebote,
        width: lado,
        height: lado,
        transform: `translateY(${rincon * lado * 0.06}px) rotate(${giro}deg) scale(${escala * (1 - 0.32 * rincon)})`,
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
