/**
 * La edición documental en Remotion. No se edita a mano: `build.py` la escribe en `edicion.json` con los dispositivos de
 * la skill (`components/ev1_devices.py`, `ev1_more.py`), que dejan cada capa como HTML con su tramo de cuadros y toda la
 * animación como una línea de tiempo de GSAP. Aquí cada capa se enseña solo en su tramo, la línea se lleva al cuadro que
 * toca y los clips de video van con `OffthreadVideo`, para que el render los tenga cuadro a cuadro.
 *
 * Así lo que se midió en las referencias (la skill venía para HyperFrames) se ve igual en el monitor de Sloth, en vivo,
 * y en el render. Las rutas son de `public/`.
 */
import gsap from "gsap";
import { memo, useLayoutEffect, useRef, useState, type CSSProperties, type FC, type HTMLAttributes } from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import json from "./edicion.json";

type Capa = { id: string; f0: number; f1: number; z: number; cls: string; style: string; pieza: string };
type Clip = Capa & { html: string };
type Video = Capa & { src: string; desde: number };
type Escena = { nombre: string; f0: number; f1: number };
type Datos = {
  titulo: string;
  fps: number;
  ancho: number;
  alto: number;
  duracion: number;
  css: string;
  clips: Clip[];
  videos: Video[];
  pre: string;
  js: string;
  escenas: Escena[];
  audio: string | null;
};

export const datos = json as unknown as Datos;

/** Una ruta de public/ (con su `?v=` si lo trae) como la sirve Remotion; las de fuera, tal cual. */
function ruta(s: string) {
  if (/^(https?:|data:|blob:|\/)/.test(s)) return s;
  const [archivo, version] = s.split("?");
  return staticFile(archivo) + (version ? `?${version}` : "");
}

const conRutas = (html: string) => html.replace(/(\ssrc=")([^"]+)"/g, (_, a: string, s: string) => `${a}${ruta(s)}"`);

/** Las fuentes del estilo viven en public/assets/ev1/fonts. */
const css = datos.css.replace(/url\("fonts\/([^"]+)"\)/g, (_, f: string) => `url("${staticFile(`assets/ev1/fonts/${f}`)}")`);

/** El `style` de una capa, de texto CSS al objeto de React, con su z-index. */
function estilo(texto: string, z: number): CSSProperties {
  const o: Record<string, string | number> = { zIndex: z };
  for (const d of texto.split(";")) {
    const i = d.indexOf(":");
    const k = d.slice(0, i).trim();
    if (i < 0 || !k) continue;
    o[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase())] = d.slice(i + 1).trim();
  }
  return o as CSSProperties;
}

/**
 * Cada capa se dibuja con un componente que se llama como su dispositivo (`tile_reveal`, `broll`…): es lo que el estudio
 * de Sloth dice de lo que se elige en el cuadro.
 */
type Props = HTMLAttributes<HTMLDivElement> & { "data-f0": number; "data-f1": number };
const piezas = new Map<string, FC<Props>>();
function pieza(nombre: string) {
  let P = piezas.get(nombre);
  if (!P) {
    P = (p) => <div {...p} />;
    P.displayName = nombre;
    piezas.set(nombre, P);
  }
  return P;
}

/**
 * Todas las capas, montadas siempre (GSAP las busca por su id al armar la línea) y sin volver a dibujarse: lo que cambia
 * con el cuadro lo pone `Edicion` directamente en el DOM.
 */
const Capas = memo(() => (
  <>
    {datos.clips.map((c) => {
      const P = pieza(c.pieza);
      return <P key={c.id} id={c.id} className={c.cls} style={estilo(c.style, c.z)} data-f0={c.f0} data-f1={c.f1} dangerouslySetInnerHTML={{ __html: conRutas(c.html) }} />;
    })}
    {datos.videos.map((v) => {
      const P = pieza(v.pieza);
      return (
        <P key={v.id} id={v.id} className={v.cls} style={estilo(v.style, v.z)} data-f0={v.f0} data-f1={v.f1}>
          <Sequence from={v.f0} durationInFrames={Math.max(1, v.f1 - v.f0)} premountFor={30} showInTimeline={false} name={v.pieza}>
            <OffthreadVideo
              src={ruta(v.src)}
              trimBefore={v.desde > 0 ? v.desde : undefined}
              muted
              transparent={/\.webm$/i.test(v.src)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Sequence>
        </P>
      );
    })}
  </>
));

export const Edicion: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const raiz = useRef<HTMLDivElement>(null);
  const linea = useRef<gsap.core.Timeline | null>(null);
  const [fuentes] = useState(() => delayRender("Las fuentes del estilo"));

  // La línea de tiempo, una vez. Con `gsap.context`, los `#id` se buscan solo dentro de este video: el estudio de Sloth
  // monta otro reproductor del mismo video, escondido, para recorrerlo.
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      new Function("gsap", datos.pre)(gsap);
      const tl = gsap.timeline({ paused: true });
      new Function("gsap", "tl", datos.js)(gsap, tl);
      linea.current = tl;
    }, raiz.current!);
    const caras = [...document.fonts].filter((f) => f.family.replace(/["']/g, "").startsWith("EV1"));
    Promise.all(caras.map((f) => f.load()))
      .catch(() => {})
      .finally(() => continueRender(fuentes));
    return () => {
      ctx.revert();
      linea.current = null;
    };
  }, [fuentes]);

  // Cada cuadro: la línea en su tiempo (un pelo después: los tiempos de los dispositivos van redondeados a 4 decimales y
  // 2/30 queda en 0.0667, que si no caería en el cuadro siguiente), cada capa visible solo en su tramo y, en el render,
  // esperar a las imágenes que entran.
  useLayoutEffect(() => {
    linea.current?.seek(frame / fps + 1e-4, true);
    const pendientes: HTMLImageElement[] = [];
    for (const el of raiz.current!.querySelectorAll<HTMLElement>(":scope > [data-f0]")) {
      const dentro = frame >= Number(el.dataset.f0) && frame < Number(el.dataset.f1);
      el.style.display = dentro ? "" : "none";
      if (dentro) for (const img of el.querySelectorAll("img")) if (!img.complete) pendientes.push(img);
    }
    if (!pendientes.length) return;
    const espera = delayRender("Las imágenes del cuadro");
    const cargada = (img: HTMLImageElement) =>
      new Promise((listo) => {
        img.addEventListener("load", listo, { once: true });
        img.addEventListener("error", listo, { once: true });
      });
    void Promise.all(pendientes.map(cargada)).then(() => continueRender(espera));
  }, [frame, fps]);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <style>{css}</style>
      {/* En vertical (1080×1920), .ev1-vertical cambia el tamaño del cuadro y los subtítulos de tokens.css. */}
      <div ref={raiz} className={datos.alto > datos.ancho ? "ev1-frame ev1-vertical" : "ev1-frame"} style={{ width: datos.ancho, height: datos.alto }}>
        <Capas />
      </div>
      {datos.audio && <Audio src={ruta(datos.audio)} />}
      {datos.escenas.map((e, i) => (
        <Sequence key={i} from={e.f0} durationInFrames={Math.max(1, e.f1 - e.f0)} name={e.nombre} layout="none">
          {null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
