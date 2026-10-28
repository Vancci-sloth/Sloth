// El reel: el gancho (el clip real de la situación, el comentario y él a cámara) y el sketch, donde cada frase de
// public/voz.json se ve literal mientras se dice. Lo de abajo es un sketch de ejemplo que enseña cada movimiento del
// estilo (entrar caminando, la patada que la manda a volar, el corte al escenario donde aterriza, el impacto, cargarla,
// quedarse quieto al final): cámbialo entero por el de tu guion. Cómo se compone: ESCENAS.md de la skill.
// El ejemplo trae los dos formatos, con `segun(vertical, horizontal)`; tu reel es de uno solo (FORMATO en datos.ts):
// escribe directo sus coordenadas.
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { ESCALA, H, HORIZONTAL, W, ini, palabra, segun } from "./datos";
import { Comentario, Grupo, Recorte, Salpicadura, arco, recorrido, temblor, type Punto } from "./piezas";
import { pose, type NombrePose } from "./poses";

// ---------------------------------------------------------------- lo que cambia en cada reel

const CLIP = "clip.mp4"; // el clip real de la situación, recortado al momento clave; si es una foto, "img/<foto>.jpg"
// Sin video, la página oficial (en vertical, en el celular: `captura.py <url> <png> 390`; en horizontal, en la
// computadora: `captura.py <url> <png> 1280`) que baja sola como grabación de pantalla: CLIP = "img/pagina.png", y
// BAJA, de dónde a dónde va su borde de arriba (empieza abajo del comentario).
// Con una página: en vertical, [170, -1010] y el comentario en `y 240`; en horizontal, [300, -900].
const BAJA: [number, number] = [0, 0];
const COMENTARIO = { usuario: "fer.garza_", texto: "y aquí qué se supone que haces 💀😭", hace: "4 d", likes: "2,318" };
const PRIMERA_DEL_SKETCH = 2; // la frase donde termina el gancho

// Los escenarios: una foto real por lugar, del formato del reel (vertical o horizontal, nunca estirada), con la línea
// de los pies (`piso`) y, si hace falta, qué parte de la foto se queda (`encuadre`, el object-position de CSS: "50% 100%"
// guarda el piso). El primero, la imagen de fondo que mandó el usuario, si la mandó.
type Foto = { src: string; piso: number; encuadre?: string };
const ESCENARIOS = {
  fondo: { src: "img/fondo.jpg", piso: segun(1560, 960) },
  pared: { src: "img/escenario-2.jpg", piso: segun(1600, 980) },
} satisfies Record<string, Foto>;
type Escenario = keyof typeof ESCENARIOS;

// La criatura (el tema con cuerpo): su recorte y su alto de pie en px.
const CRIATURA = { src: "img/criatura.png", alto: 520 * ESCALA };

// ---------------------------------------------------------------- los tiempos del sketch, de la voz

const PATADA = palabra(3, "patea"); // en el verbo, no al empezar la frase
const SALE = PATADA + 12; // sale del cuadro por la derecha
const CHOCA = SALE + 10; // entra al otro escenario y choca con la pared
const CARGA = palabra(4, "carga");
// Corte seco a cada escenario, en el fotograma en que la acción lo pide.
const TOMAS: [number, Escenario][] = [[ini(PRIMERA_DEL_SKETCH), "fondo"], [SALE, "pared"]];

// ---------------------------------------------------------------- piezas de este reel

/** Una pose de la biblioteca. Cuando vuela o da una vuelta, `origen="50% 50%"` para que gire sobre su centro. */
const Persona: React.FC<Partial<Punto> & { p: NombrePose; espejo?: boolean; piso?: number; origen?: string }> = ({ p, x = segun(780, 1240), y, piso = segun(1560, 960), giro, escala = 1, espejo, origen }) => {
  const d = pose(p);
  return <Recorte src={d.src} x={x} y={(y ?? piso) + (d.bajar ?? 0)} alto={d.alto * escala} giro={giro} espejo={espejo ?? d.espejo} origen={origen} />;
};

/** Él a cámara sobre el clip: entra en seco cuando empieza a hablar y rebota con el volumen de su voz. Abajo a la
 * derecha en vertical; en horizontal, en el tercio derecho, con el comentario a su izquierda. */
const Gancho: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audio = useAudioData(staticFile("voz.wav"));
  const v = audio ? visualizeAudio({ fps, frame: f, audioData: audio, numberOfSamples: 16 }) : [];
  const nivel = Math.min(1, (v.slice(0, 6).reduce((a, b) => a + b, 0) / 6) * 9);
  const p = pose("hablando");
  const fondo = { position: "absolute", width: W, height: H, objectFit: "cover" } as const;
  const baja = interpolate(f, [ini(0) - 6, ini(0) + 50], BAJA, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      {CLIP.endsWith(".mp4")
        // el clip suena solo hasta que él habla; luego, debajo de la voz
        ? <OffthreadVideo src={staticFile(CLIP)} volume={(k) => (k < ini(0) ? 1 : 0.25)} style={fondo} />
        : BAJA[0] === BAJA[1]
          ? <Img src={staticFile(CLIP)} style={fondo} />
          : <Img src={staticFile(CLIP)} style={{ position: "absolute", left: 0, top: baja, width: W }} />}
      <Comentario {...COMENTARIO} />
      {f >= ini(0) && (
        <div style={{
          position: "absolute", left: HORIZONTAL ? undefined : p.x ?? 0, right: segun(undefined, 150), bottom: 0, transformOrigin: "50% 100%",
          transform: `translateY(${-nivel * 10}px) rotate(${Math.sin(f / 7) * 0.8 + nivel * 1.2}deg) scale(${1 + nivel * 0.012})`,
        }}>
          <Img src={staticFile(p.src)} style={{ height: p.alto, display: "block" }} />
        </div>
      )}
    </AbsoluteFill>
  );
};

const Escena: React.FC = () => {
  const f = useCurrentFrame();
  const en = (a: number, b: number) => f >= a && f < b;
  const toma = [...TOMAS].reverse().find(([desde]) => f >= desde)![1];
  const { src, piso, encuadre }: Foto = ESCENARIOS[toma];
  // 2: la criatura entra caminando por la izquierda, con un rebote por paso
  const llega = ini(2) + 40;
  const entra = recorrido(f, [[ini(2), { x: -300, y: piso }], [llega, { x: segun(330, 700), y: piso }]]);
  const paso = f < llega ? Math.abs(Math.sin(f / 3)) * 12 : 0;
  return (
    <AbsoluteFill style={{ transform: temblor(f, CHOCA) }}>
      <Img src={staticFile(src)} style={{ position: "absolute", width: W, height: H, objectFit: "cover", objectPosition: encuadre }} />

      {toma === "fondo" && <>
        {f < PATADA
          ? <Recorte {...CRIATURA} {...entra} y={entra.y - paso} />
          // 3: la patada, en el verbo: sale girando por la derecha, y el siguiente escenario la recibe por la izquierda
          : <Recorte {...CRIATURA} {...arco(f, PATADA, SALE, { x: segun(330, 700), y: piso }, { x: segun(1450, 2250), y: segun(700, 560), giro: 150 }, segun(250, 160))} origen="50% 50%" />}
        {/* él la espera a la derecha (en horizontal, en el otro tercio); una pose por acción, con corte seco */}
        <Persona p={f < PATADA ? "parado" : "heroe"} x={f < PATADA ? segun(780, 1240) : segun(560, 980)} piso={piso} />
      </>}

      {toma === "pared" && <>
        {f < CHOCA && <Recorte {...CRIATURA} {...arco(f, SALE, CHOCA, { x: -250, y: segun(700, 560), giro: 150 }, { x: segun(900, 1440), y: segun(900, 560), giro: 260 }, segun(80, 60))} origen="50% 50%" />}
        {/* choca y cae; vencida es el mismo recorte, patas arriba */}
        {en(CHOCA, CARGA) && <Recorte {...CRIATURA} {...recorrido(f, [[CHOCA, { x: segun(900, 1440), y: segun(900, 560), giro: 260 }], [CHOCA + 9, { x: segun(820, 1360), y: piso, giro: 180 }]])} origen="50% 50%" />}
        <Salpicadura x={segun(960, 1500)} y={segun(880, 540)} t={CHOCA} tipo="polvo" />
        {en(CHOCA, CARGA) && <Persona p="parado" x={segun(260, 560)} piso={piso} espejo />}
        {/* 4: él la carga sobre la cabeza: los dos son un Grupo que camina junto */}
        {f >= CARGA && (
          <Grupo {...recorrido(f, [[CARGA, { x: segun(620, 1060), y: piso }], [CARGA + 30, { x: segun(540, 960), y: piso }]])}>
            <Recorte {...CRIATURA} x={0} y={-640 * ESCALA} giro={180} origen="50% 50%" />
            <Persona p="heroe" x={0} y={0} />
          </Grupo>
        )}
      </>}
    </AbsoluteFill>
  );
};

export const Reel: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "black", overflow: "hidden" }}>
      <Sequence durationInFrames={ini(PRIMERA_DEL_SKETCH)}><Gancho /></Sequence>
      {f >= ini(PRIMERA_DEL_SKETCH) && <Escena />}
      <Audio src={staticFile("voz.wav")} />
    </AbsoluteFill>
  );
};
