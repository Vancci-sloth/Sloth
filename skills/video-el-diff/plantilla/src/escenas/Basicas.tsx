import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLOR, FUENTE } from "../estilo";
import marca from "../marca.json";
import { Camara, Emoji, FechaPixel, Lleno, Numero, Rotulo, Sello, Tarjeta, TextoMeme, useBeat, useFormato, useResorte, useSacudida } from "../piezas";

/**
 * Lo que mide una letra de `Rotulo`, en em: Anton (crema) es condensada; Lilita One (los demás colores) es más ancha y
 * lleva además un contorno de 0.07 em por lado. Con 0.56 para todas, los titulares de color tocaban las orillas del
 * vertical, y seis episodios del lote del 7 de octubre los achicaron a mano con espacios invisibles (`holgura`).
 */
const letra = (color?: string) => (!color || color === "crema" ? { em: 0.5, contorno: 0 } : { em: 0.62, contorno: 0.14 });

/**
 * Parte un titular en renglones para el vertical: prueba los renglones originales (`\n`) y repartos parejos de sus
 * palabras, y se queda con el que deja la letra más grande dentro de `ancho` x `alto`, con la letra de su `color`.
 */
export const renglonesVerticales = (texto: string, ancho: number, alto: number, max = 260, color?: string) => {
  const { em, contorno } = letra(color);
  const tamDe = (ls: string[]) =>
    Math.min(max, Math.floor(ancho / (Math.max(...ls.map((l) => l.length)) * em + contorno)), Math.floor(alto / (ls.length * 0.97)));
  const original = texto.split("\n");
  const palabras = texto.replace(/\n/g, " ").split(/\s+/).filter(Boolean);
  let mejor = { ls: original, tam: tamDe(original) };
  // Todas las formas de partir las palabras en renglones seguidos (un titular tiene pocas palabras).
  const n = Math.min(palabras.length, 12);
  for (let cortes = 0; cortes < 1 << (n - 1); cortes++) {
    const ls: string[] = [];
    let cur = [palabras[0]];
    for (let i = 1; i < palabras.length; i++) {
      if (i < n && cortes & (1 << (i - 1))) {
        ls.push(cur.join(" "));
        cur = [];
      }
      cur.push(palabras[i]);
    }
    ls.push(cur.join(" "));
    const tam = tamDe(ls);
    // A igual tamaño, el reparto más parejo (que no deje una palabra corta sola en un renglón).
    const corto = (x: string[]) => Math.min(...x.map((l) => l.length));
    if (tam > mejor.tam * 1.08 || (tam > mejor.tam && ls.length <= mejor.ls.length) || (tam === mejor.tam && ls.length === mejor.ls.length && corto(ls) > corto(mejor.ls)))
      mejor = { ls, tam };
  }
  return mejor;
};

/** Un titular solo, a pantalla completa. */
export const Titular: React.FC = () => (useFormato().vertical ? <TitularVertical /> : <TitularHorizontal />);

/**
 * En vertical: el texto en los renglones que lo dejan más grande (`renglonesVerticales`), los emojis arriba o abajo del
 * texto (donde quepan, sin taparlo) y el sello debajo. Con `img` (una persona), la persona va abajo y el texto arriba.
 */
const TitularVertical: React.FC = () => {
  const { v, duracion } = useBeat();
  const { W, H } = useFormato();
  const frame = useCurrentFrame();
  const s = useResorte(0, { damping: 9, stiffness: 190 });
  const temblor = useSacudida(0, 22, 10);
  const conImg = !!v.img;
  const { ls, tam } = renglonesVerticales(String(v.texto), W - 90, conImg ? H * 0.4 : v.sello ? H * 0.5 : H * 0.62, 260, v.color);
  const altoTexto = ls.length * tam * 0.97;
  const centroY = conImg ? H * 0.27 : v.sello ? H * 0.44 : H * 0.5;
  const arriba = centroY - altoTexto / 2;
  const abajo = centroY + altoTexto / 2;
  const tamSello = Math.min(80, Math.floor((W - 120) / (String(v.sello ?? "").length * 0.5 + 1)));
  // Los emojis van fuera del texto, arriba o abajo de él (donde quepan): en una esquina tapaban la primera palabra.
  const fuera = (medio: number, prefiereArriba: boolean) => {
    const sobre = arriba - medio - 10;
    const bajo = abajo + medio + 10;
    const cabeSobre = sobre - medio >= 0;
    const cabeBajo = bajo + medio <= H;
    if (prefiereArriba) return cabeSobre ? sobre : cabeBajo ? bajo : Math.max(medio, sobre);
    return cabeBajo ? bajo : cabeSobre ? sobre : Math.min(H - medio, bajo);
  };
  return (
    <Camara hasta={1.06}>
      <Lleno style={{ transform: temblor }}>
        {conImg && (
          <Img
            src={staticFile(v.img)}
            style={{ position: "absolute", left: "50%", bottom: 0, height: H * 0.5, transform: `translateX(calc(-50% + ${interpolate(frame, [0, 10], [-700, 0], { extrapolateRight: "clamp" })}px))` }}
          />
        )}
        <div style={{ position: "absolute", left: 0, right: 0, top: arriba, height: altoTexto, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ transform: `scale(${interpolate(s, [0, 1], [1.8, 1])})`, opacity: Math.min(1, s * 3) }}>
            <Rotulo texto={ls.join("\n")} color={v.color} tam={tam} />
          </div>
        </div>
        {v.emoji && <Emoji src={v.emoji} tam={190} desde={5} x={W - 140} y={fuera(95, true)} rot={14} />}
        {v.emoji2 && <Emoji src={v.emoji2} tam={160} desde={Math.round(duracion * 0.3)} x={130} y={fuera(80, !!(conImg || v.sello))} rot={-12} />}
        {v.sello && (
          <div style={{ position: "absolute", left: 0, right: 0, top: conImg ? 20 : abajo + 50, display: "flex", justifyContent: "center" }}>
            <Sello texto={v.sello} desde={Math.round(duracion * 0.45)} tam={tamSello} rot={-6} color={COLOR.amarillo} />
          </div>
        )}
      </Lleno>
    </Camara>
  );
};

const TitularHorizontal: React.FC = () => {
  const { v, duracion } = useBeat();
  const frame = useCurrentFrame();
  const s = useResorte(0, { damping: 9, stiffness: 190 });
  const temblor = useSacudida(0, 22, 10);
  // Que quepa: en Anton cada letra mide algo más de media eme, y la línea más larga no debe pasar del ancho útil.
  const lineas = String(v.texto).split("\n");
  const largo = Math.max(...lineas.map((l) => l.length));
  const ancho = v.img ? 1250 : 1640;
  const tam = Math.min(lineas.length > 1 ? 220 : 300, Math.floor(ancho / (largo * 0.56)));
  return (
    <Camara hasta={1.08}>
      <Lleno style={{ transform: temblor }}>
        {v.img && (
          <Img
            src={staticFile(v.img)}
            style={{ position: "absolute", left: 40, bottom: 0, height: 760, transform: `translateX(${interpolate(frame, [0, 10], [-700, 0], { extrapolateRight: "clamp" })}px)` }}
          />
        )}
        <Lleno style={{ display: "flex", alignItems: "center", justifyContent: "center", left: v.img ? 520 : 0 }}>
          <div style={{ transform: `scale(${interpolate(s, [0, 1], [1.8, 1])})`, opacity: Math.min(1, s * 3) }}>
            <Rotulo texto={v.texto} color={v.color} tam={tam} />
          </div>
        </Lleno>
        {v.emoji && <Emoji src={v.emoji} tam={240} desde={5} x={v.img ? 1660 : 1580} y={250} rot={14} />}
        {v.emoji2 && <Emoji src={v.emoji2} tam={190} desde={Math.round(duracion * 0.3)} x={v.img ? 900 : 360} y={820} rot={-12} />}
        {v.sello && (
          <Lleno style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", top: 110, left: v.img ? 520 : 0 }}>
            <Sello texto={v.sello} desde={Math.round(duracion * 0.45)} tam={80} rot={-8} color={COLOR.amarillo} />
          </Lleno>
        )}
      </Lleno>
    </Camara>
  );
};

/** Un meme con etiquetas que van apareciendo. */
export const Meme: React.FC = () => {
  const { v, duracion } = useBeat();
  const { vertical, W, H } = useFormato();
  const frame = useCurrentFrame();
  const etiquetas: any[] = v.etiquetas ?? [];
  const normales = etiquetas.filter((e) => !e.tarde);
  const zoom = v.zoomLento ? interpolate(frame, [0, duracion], [1, 1.18]) : 1;
  const alto = v.recorte ? 760 : 860;
  if (vertical) {
    // A lo ancho de la zona (o a lo alto, si el meme es más alto que ancho); las etiquetas van en fracciones de la imagen.
    return (
      <Camara>
        <Lleno style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Tarjeta rot={0} style={v.recorte ? { boxShadow: "none" } : { border: "6px solid white", overflow: "hidden" }} desdeAbajo={!v.recorte}>
            <div style={{ position: "relative", overflow: "hidden" }}>
              <Img src={staticFile(v.img)} style={{ width: W - 40, display: "block", transform: `scale(${zoom})` }} />
              {etiquetas.map((e, i) => {
                const k = normales.indexOf(e);
                const desde = e.tarde ? Math.round(duracion * 0.62) : Math.round(4 + (k * duracion * 0.55) / Math.max(1, normales.length));
                return <Etiqueta key={i} e={e} desde={desde} />;
              })}
            </div>
          </Tarjeta>
        </Lleno>
        {v.num && <Numero n={v.num} style={{ position: "absolute", left: 30, top: 30, transform: "scale(0.7)" }} />}
      </Camara>
    );
  }
  return (
    <Camara>
      <Lleno style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Tarjeta rot={v.recorte ? 0 : -1.2} style={v.recorte ? { boxShadow: "none" } : { border: "6px solid white", overflow: "hidden" }} desdeAbajo={!v.recorte}>
          <div style={{ position: "relative", overflow: "hidden" }}>
            <Img src={staticFile(v.img)} style={{ height: alto, display: "block", transform: `scale(${zoom})` }} />
            {etiquetas.map((e, i) => {
              const k = normales.indexOf(e);
              const desde = e.tarde ? Math.round(duracion * 0.62) : Math.round(4 + (k * duracion * 0.55) / Math.max(1, normales.length));
              return <Etiqueta key={i} e={e} desde={desde} />;
            })}
          </div>
        </Tarjeta>
      </Lleno>
      {v.num && <Numero n={v.num} style={{ position: "absolute", left: 90, top: 80 }} />}
    </Camara>
  );
};

const Etiqueta: React.FC<{ e: any; desde: number }> = ({ e, desde }) => {
  const frame = useCurrentFrame();
  const s = useResorte(desde, { damping: 10, stiffness: 220 });
  if (frame < desde) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: `${e.x * 100}%`,
        top: `${e.y * 100}%`,
        transform: `translate(-50%, -50%) rotate(${e.rot ?? 0}deg) scale(${s})`,
      }}
    >
      <TextoMeme texto={e.texto} tam={e.tam ?? 70} rojo={e.rojo} />
    </div>
  );
};

/**
 * El logo del programa, con su `lema` debajo como dos líneas de diff (lo que quita y lo que trae). El nombre, el lema y
 * los rótulos del cierre salen de `src/marca.json`. `invitacion` (o `newsletter`, en los guiones de antes) es el último
 * beat: la invitación de la marca.
 */
export const Logo: React.FC = () => {
  const { v, duracion } = useBeat();
  const { vertical } = useFormato();
  const frame = useCurrentFrame();
  const s = useResorte(2, { damping: 12, stiffness: 150 });
  const invitacion = v.invitacion || v.newsletter;
  const glitch = frame < 9 || ((v.final || invitacion) && frame > duracion - 8);
  const corte = glitch ? Math.sin(frame * 13.1) * 40 : 0;
  const lineas = [
    { signo: "-", texto: marca.lema?.[0], color: COLOR.rojo },
    { signo: "+", texto: marca.lema?.[1], color: COLOR.verde },
  ].filter((l) => l.texto);
  const [rotulo, pie] = marca.invitacion_rotulo ?? [];
  return (
    <AbsoluteFill style={{ background: vertical ? undefined : COLOR.fondo }}>
      <Lleno style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${interpolate(frame, [0, duracion], [1, 1.06])})` }}>
        <div style={{ position: "relative", transform: `scale(${s})` }}>
          {[COLOR.rojo, "#29d3ff"].map((c, i) =>
            glitch ? (
              <div key={c} style={{ position: "absolute", inset: 0, transform: `translateX(${(i ? 1 : -1) * (8 + Math.abs(corte) / 3)}px)`, mixBlendMode: "screen", opacity: 0.8 }}>
                <LogoCaja color={c} />
              </div>
            ) : null
          )}
          <div style={{ position: "relative", clipPath: glitch ? `inset(${Math.abs(corte)}% 0 ${Math.abs(corte) / 2}% 0)` : undefined }}>
            <LogoCaja color="white" />
          </div>
        </div>
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 8, fontFamily: FUENTE.codigo, fontSize: 38 }}>
          {lineas.map((l, i) => (
            <div key={i} style={{ color: l.color, opacity: interpolate(frame, [10 + i * 6, 16 + i * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              {l.signo} {l.texto}
            </div>
          ))}
        </div>
        {v.fecha && <FechaPixel texto={v.fecha} desde={18} tam={64} color={COLOR.rojo} style={{ marginTop: 30 }} />}
        {v.final && marca.despedida_rotulo && <FechaPixel texto={marca.despedida_rotulo} desde={18} tam={60} color={COLOR.verde} style={{ marginTop: 30 }} />}
        {/* La invitación de la marca: el último beat del episodio. Sin `invitacion_rotulo`, nada. */}
        {invitacion && rotulo && <FechaPixel texto={rotulo} desde={14} tam={56} color={COLOR.verde} style={{ marginTop: 34 }} />}
        {invitacion && pie && (
          <div style={{ marginTop: 22, fontFamily: FUENTE.codigo, fontWeight: 700, fontSize: 52, color: COLOR.rojo, opacity: interpolate(frame, [20, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            {pie}
          </div>
        )}
      </Lleno>
    </AbsoluteFill>
  );
};

/**
 * El nombre del logo: `logo[0]` chico arriba (puede ir vacío) y `logo[1]` grande en el recuadro. La letra baja con lo
 * largo de la palabra: «DIFF» va a 250 px, y una de 9 letras cabe en el ancho del video.
 */
const LogoCaja: React.FC<{ color: string }> = ({ color }) => {
  const [arriba, grande = marca.nombre] = marca.logo ?? [];
  const tam = Math.min(250, Math.floor(860 / (Math.max(1, grande.length) * 0.5)));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      {arriba && <div style={{ fontFamily: FUENTE.titulo, fontSize: Math.round(tam * 0.32), color, lineHeight: 1, marginBottom: 8 }}>{arriba}</div>}
      <div style={{ border: `${Math.round(tam / 15.6)}px solid ${color}`, padding: `${Math.round(tam * 0.024)}px ${Math.round(tam * 0.16)}px 0` }}>
        <div style={{ fontFamily: FUENTE.titulo, fontSize: tam, color, lineHeight: 1.05, letterSpacing: Math.round(tam * 0.024), whiteSpace: "nowrap" }}>{grande}</div>
      </div>
    </div>
  );
};

/** Interferencia de transición: franjas desplazadas y ruido de color durante unos fotogramas. */
export const Interferencia: React.FC<{ dura?: number }> = ({ dura = 8 }) => {
  const frame = useCurrentFrame();
  const { H } = useFormato();
  if (frame >= dura) return null;
  const franjas = Array.from({ length: 14 }, (_, i) => {
    const r = Math.sin(i * 91.7 + frame * 37.3);
    return { y: ((i * H) / 14) | 0, h: 30 + Math.abs(r) * 70, dx: r * 260, c: i % 3 === 0 ? COLOR.rojo : i % 3 === 1 ? "#29d3ff" : "white" };
  });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {franjas.map((f, i) => (
        <div key={i} style={{ position: "absolute", left: f.dx, top: f.y, width: 1920, height: f.h, background: f.c, opacity: 0.18 + 0.15 * (i % 2), mixBlendMode: "screen" }} />
      ))}
      <AbsoluteFill style={{ background: "white", opacity: frame < 2 ? 0.25 : 0 }} />
    </AbsoluteFill>
  );
};
