import React from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import linea from "./timeline.json";
import { COLOR } from "./estilo";
import { Beat, BeatProvider, Formato, FormatoProvider, HORIZONTAL } from "./piezas";
import type { Rect } from "./encuadre";
import { Interferencia, Logo, Meme, Titular } from "./escenas/Basicas";
import { Captura, Duelo, encadena, Tarjetas } from "./escenas/Reales";
import { Encima } from "./escenas/Encima";
import { Gancho, paginasDe, Subtitulos, VERTICAL } from "./subtitulos";

export const FPS = linea.fps;
export const DURACION = Math.ceil(linea.duracion * FPS);

/**
 * El formato del episodio, el de `FORMATO` en `guion.py` (lo pone nuevo.py): vertical (1080x1920), compuesto para el
 * celular, u horizontal (1920x1080). Ver «Formato» en el SKILL.
 */
export const ES_VERTICAL = (linea as { formato?: string }).formato === "vertical";
export const ANCHO = ES_VERTICAL ? 1080 : 1920;
export const ALTO = ES_VERTICAL ? 1920 : 1080;

/**
 * El lienzo vertical (`VERTICAL` en subtitulos.tsx): arriba el gancho (el sello y el rótulo de
 * `GANCHO` en guion.py), la escena en una zona de 1080x1156 acomodada a lo vertical (las ramas `vertical` de cada
 * escena) y debajo los subtítulos, que así no tapan lo citado.
 */
export const ZONA = { y: VERTICAL.zonaY, alto: VERTICAL.zonaH };
const GANCHO = (linea as { gancho?: string }).gancho ?? "";
/** Los beats con `sigue` continúan la toma del anterior (ver `encadena`). */
const BEATS = encadena(linea.beats as Beat[], FPS);

/**
 * Los beats en vertical: en cada captura sus `citas`, todo lo marcado en esa imagen en el episodio (marcas y focos), que
 * el encuadre vertical no deja fuera (ver `encuadre.ts`). En un clip cuentan solo las marcas del beat.
 */
const conCitas = (beats: Beat[]): Beat[] => {
  const textoDe = (m: any) => m.tipo === "marcador" || (m.r as Rect)[3] <= 70;
  const por: Record<string, { imp: Rect[]; txt: Rect[] }> = {};
  beats.forEach((b) => {
    if (b.v.tipo !== "captura" || !b.v.img) return;
    const c = (por[b.v.img] ??= { imp: [], txt: [] });
    ((b.v.marcas ?? []) as any[]).forEach((m) => {
      c.imp.push(m.r, ...((m.es?.lineas ?? []) as any[]).map((l) => l.r));
      if (textoDe(m)) c.txt.push(m.r);
    });
    if (b.v.foco) c.imp.push(b.v.foco.r);
  });
  return beats.map((b) => {
    if (b.v.tipo !== "captura") return b;
    const propias = (b.v.marcas ?? []) as any[];
    const citas = b.v.img
      ? por[b.v.img]
      : { imp: [...propias.map((m) => m.r), ...(b.v.foco ? [b.v.foco.r] : [])], txt: propias.filter(textoDe).map((m) => m.r) };
    return { ...b, v: { ...b.v, citas } };
  });
};
const BEATS_VERTICAL = conCitas(BEATS);

const ESCENAS: Record<string, React.FC> = {
  titular: Titular,
  meme: Meme,
  logo: Logo,
  captura: Captura,
  tarjetas: Tarjetas,
  duelo: Duelo,
};

/**
 * Los tipos que se acomodan solos al vertical (leen `useFormato`). Los demás (los gags propios de un episodio que no lo
 * leen) se dibujan en 1920x1080 y se escalan al ancho de la zona (`Respaldo`).
 */
const VERTICALES = new Set(["captura", "titular", "tarjetas", "duelo", "meme", "logo"]);

/** Una escena que no se acomoda al vertical: en 1920x1080, escalada al ancho de la zona y centrada. */
const Respaldo: React.FC<{ W: number; H: number; children: React.ReactNode }> = ({ W, H, children }) => {
  const e = W / 1920;
  return (
    <div style={{ position: "absolute", left: 0, top: (H - 1080 * e) / 2, width: 1920, height: 1080, transform: `scale(${e})`, transformOrigin: "0 0", overflow: "hidden", background: COLOR.fondo }}>
      <FormatoProvider value={HORIZONTAL}>{children}</FormatoProvider>
    </div>
  );
};

/** Los beats donde empieza una sección (`seccion` en el guion): llevan interferencia. */
const SECCIONES = new Set(BEATS.filter((b) => b.v.seccion).map((b) => b.id));

const Grano: React.FC = () => {
  const frame = useCurrentFrame();
  const dx = (frame * 137) % 512;
  const dy = (frame * 251) % 512;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile("img/grano.png")})`, backgroundPosition: `${dx}px ${dy}px`, opacity: 0.05, mixBlendMode: "overlay" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};

const MUSICA = 0.08;

/** Cada beat en su momento, con la escena de su tipo dibujada en `formato`. */
const Escenas: React.FC<{ beats: Beat[]; formato: Formato }> = ({ beats, formato }) => (
  <>
    {beats.map((b) => {
      const desde = Math.round(b.inicio * FPS);
      const dura = Math.max(1, Math.round(b.fin * FPS) - desde);
      const Escena = ESCENAS[b.v.tipo];
      const escena = Escena ? <Escena /> : <div style={{ color: "red", fontSize: 80 }}>{b.v.tipo}</div>;
      return (
        <Sequence key={b.id} from={desde} durationInFrames={dura} name={`${b.id} · ${b.v.tipo}`}>
          <BeatProvider value={b}>
            <FormatoProvider value={formato}>
              {formato.vertical && !VERTICALES.has(b.v.tipo) ? <Respaldo W={formato.W} H={formato.H}>{escena}</Respaldo> : escena}
              <Encima />
              {SECCIONES.has(b.id) && <Interferencia />}
            </FormatoProvider>
          </BeatProvider>
        </Sequence>
      );
    })}
  </>
);

/**
 * La voz y la música. La voz es mono: el <Audio> de @remotion/media la pone entera en los dos canales, y el de remotion
 * la repartía a -3 dB. Va a 1/√2 para que la mezcla quede como antes (medido: 0.00 dB de diferencia).
 */
const Sonido: React.FC = () => (
  <>
    {(linea.parrafos as { id: string; src: string; inicio: number }[]).map((p) => (
      <Sequence key={p.id} from={Math.round(p.inicio * FPS)} name={`voz ${p.id}`} layout="none">
        <Audio src={staticFile(p.src)} volume={Math.SQRT1_2} />
      </Sequence>
    ))}
    <Audio src={staticFile("audio/musica.wav")} volume={MUSICA} />
  </>
);

const FondoEpisodio: React.FC = () => <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 40%, #1a1a22 0%, #0d0d10 70%)" }} />;

/** Las páginas de subtítulos del episodio en vertical: toda la voz. */
const PAGINAS = ES_VERTICAL ? paginasDe((linea.beats as Beat[]).flatMap((b) => b.palabras)) : [];

/** El episodio en vertical: cada escena en su zona, el gancho arriba y los subtítulos abajo, sobre el fondo. */
const Vertical: React.FC<{ audio: boolean }> = ({ audio }) => (
  <AbsoluteFill style={{ background: COLOR.fondo }}>
    <FondoEpisodio />
    <div style={{ position: "absolute", left: 0, top: ZONA.y, width: ANCHO, height: ZONA.alto, overflow: "hidden" }}>
      <Escenas beats={BEATS_VERTICAL} formato={{ vertical: true, W: ANCHO, H: ZONA.alto }} />
    </div>
    <Gancho texto={GANCHO} />
    <Subtitulos paginas={PAGINAS} hasta={DURACION / FPS} y={VERTICAL.subsY} />
    <Grano />
    {audio && <Sonido />}
  </AbsoluteFill>
);

/** `audio={false}` la monta sin voz ni música. */
export const Video: React.FC<{ audio?: boolean }> = ({ audio = true }) => {
  if (ES_VERTICAL) return <Vertical audio={audio} />;
  return (
    <AbsoluteFill style={{ background: COLOR.fondo }}>
      <FondoEpisodio />
      <Escenas beats={BEATS} formato={HORIZONTAL} />
      <Grano />
      {audio && <Sonido />}
    </AbsoluteFill>
  );
};
