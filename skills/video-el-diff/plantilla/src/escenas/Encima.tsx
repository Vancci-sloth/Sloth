import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLOR, FUENTE } from "../estilo";
import { Mano, Sello, useBeat, useFormato, useResorte } from "../piezas";

/**
 * Lo que se pega encima de cualquier escena en la palabra que lo dice:
 *   - `rotulo`: la cifra, el apodo, la fecha, el término nuevo o la ironía que la voz calla, en la letra gruesa con
 *     contorno negro. Crema para nombrar, rojo para golpear, sobre una banda de color para lo más fuerte, y la placa
 *     crema para el nombre de una persona que no se reconoce.
 *   - `pegado`: el recorte (PNG con transparencia, en `public/recortes/`) de una persona, un animal o un objeto, que
 *     entra de golpe o sube desde una orilla y se queda encima del material, sin sombra.
 *   - `senal`: el 👉 que entra desde un lado y señala algo.
 * Lo pone el director (`scripts/director.py`) con el `rotulo`, la `persona` y el `encima` de cada momento. `x` e `y` son el
 * centro en fracciones de la escena, así que valen igual en horizontal (1920x1080) y en la zona del vertical (1080x1156).
 * Cada cosa se queda hasta el final del beat, o hasta la palabra de `hasta`.
 */
export const Encima: React.FC = () => {
  const { v } = useBeat();
  if (!v.encima) return null;
  return (
    <>
      {(v.encima as any[]).map((e, i) =>
        e.tipo === "rotulo" ? <Rotulo key={i} e={e} /> : e.tipo === "pegado" ? <Pegado key={i} e={e} /> : e.tipo === "senal" ? <Senal key={i} e={e} /> : e.tipo === "logo" ? <Pegatina key={i} e={e} /> : null,
      )}
    </>
  );
};

/** Fotogramas (relativos al beat) en que entra y sale. */
const useTramo = (e: any) => {
  const { en, duracion } = useBeat();
  const desde = e.en ? en(e.en) : Math.round((e.t ?? 0) * duracion);
  const hasta = e.hasta ? en(e.hasta) : duracion + 1;
  return { desde, hasta };
};

/** La escala de la escena: 1 en 1920x1080 y en la zona del vertical (1080 de ancho). */
const useEscala = () => {
  const { W, H } = useFormato();
  return Math.min(1, Math.min(W, H) / 1080);
};

const BANDAS: Record<string, string> = { roja: COLOR.rojo, verde: COLOR.verde, amarilla: COLOR.amarillo, naranja: COLOR.naranja };
const TINTAS: Record<string, string> = { crema: COLOR.crema, rojo: COLOR.rojo, verde: COLOR.verde, amarillo: COLOR.amarillo, naranja: COLOR.naranja };

/**
 * Con `tacha`, el rótulo de dos tiempos: primero ese texto, una raya roja lo tacha y en medio segundo lo cambia el de
 * verdad («ACCIONISTAS» → «CORNUDOS»). Es el chiste que se escribe encima y la voz no dice.
 */
const CAMBIO = 16;
const CORRE = 22; // cuadros que tarda la cifra en llegar

/**
 * El número que corre: con `corre` (desde qué número), la primera cifra del rótulo cuenta hasta la suya al entrar, con
 * sus mismos separadores («$6,300 M» pasa por «$1,240 M», «27,5 %» por «9,8 %»). En los Code Report la cifra es un objeto
 * que se mueve, no un texto que aparece (REFERENCIAS.md).
 */
export const corrido = (texto: string, desde: number, avance: number): string => {
  const m = /\d[\d.,]*\d|\d/.exec(texto);
  if (!m) return texto;
  const crudo = m[0];
  const miles = /^\d{1,3}([.,])\d{3}(\1\d{3})*$/.exec(crudo)?.[1];
  const decimal = miles ? undefined : /^\d+([.,])(\d{1,2})$/.exec(crudo);
  const final = Number(miles ? crudo.split(miles).join("") : decimal ? crudo.replace(decimal[1], ".") : crudo.replace(/[.,]/g, ""));
  if (!Number.isFinite(final)) return texto;
  const p = 1 - Math.pow(1 - Math.min(1, Math.max(0, avance)), 3);
  const ahora = desde + (final - desde) * p;
  const nd = decimal ? decimal[2].length : 0;
  let s = ahora.toFixed(nd);
  if (decimal) s = s.replace(".", decimal[1]);
  if (miles) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, miles);
  return texto.slice(0, m.index) + s + texto.slice(m.index + crudo.length);
};

const Rotulo: React.FC<{ e: any }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { desde } = useTramo(e);
  const { duracion } = useBeat();
  if (typeof e.corre === "number" && !e.tacha) {
    return <RotuloSimple e={{ ...e, texto: corrido(String(e.texto), e.corre, (frame - desde) / CORRE), medida: e.texto }} />;
  }
  if (!e.tacha) return <RotuloSimple e={e} />;
  if (frame < desde + CAMBIO) return <RotuloSimple e={{ ...e, texto: e.tacha, hasta: undefined }} tachon={desde + 5} />;
  return <RotuloSimple e={{ ...e, en: undefined, t: (desde + CAMBIO) / duracion }} />;
};

const RotuloSimple: React.FC<{ e: any; tachon?: number }> = ({ e, tachon }) => {
  const frame = useCurrentFrame();
  const { W, H } = useFormato();
  const k = useEscala();
  const { desde, hasta } = useTramo(e);
  const s = useResorte(desde, { damping: 15, stiffness: 420, mass: 0.6 });
  if (frame < desde || frame >= hasta) return null;
  const estilo: string = e.estilo ?? "crema";
  if (estilo === "traduccion") return <Traduccion e={e} desde={desde} />;
  if (estilo === "sello") {
    // El sello de goma: el veredicto en una palabra («COMPROMETIDO», «FALSO»), girado, que cae de golpe.
    const tam = Math.min((e.tam ?? 120) * k, (W * 0.8) / (String(e.texto).length * 0.5 + 1));
    return (
      <div style={{ position: "absolute", left: (e.x ?? 0.5) * W, top: (e.y ?? 0.5) * H, transform: "translate(-50%, -50%)" }}>
        <Sello texto={String(e.texto).toUpperCase()} desde={desde} tam={tam} rot={e.giro ?? -9} color={BANDAS[e.color ?? "roja"] ?? COLOR.rojo} style={{ background: "rgba(13,13,16,0.82)" }} />
      </div>
    );
  }
  const caja = estilo === "banda" || estilo === "placa";
  // Cabe en la escena: en la zona del vertical, un rótulo largo se achica hasta caber, y el centro se corre para que no
  // se salga por una orilla. El ancho se estima por letras (Lilita One en mayúsculas: ~0.62 em).
  const renglones = String(e.texto).split("\n");
  // Lo ancho se mide con el texto final (`medida`): una cifra que corre no cambia de tamaño a cada cuadro.
  const letras = Math.max(...String(e.medida ?? e.texto).split("\n").map((r) => r.length));
  const anchoDe = (t: number) => letras * t * 0.62 + (caja ? t * 0.7 : t * 0.25);
  let tam = (e.tam ?? 110) * k;
  if (anchoDe(tam) > W * 0.92) tam *= (W * 0.92) / anchoDe(tam);
  const ancho = anchoDe(tam);
  const alto = renglones.length * tam + (caja ? tam * 0.3 : tam * 0.2);
  const margen = Math.min(W, H) * 0.03;
  const cx = Math.min(Math.max((e.x ?? 0.5) * W, ancho / 2 + margen), W - ancho / 2 - margen);
  const cy = Math.min(Math.max((e.y ?? 0.5) * H, alto / 2 + margen), H - alto / 2 - margen);
  const giro = e.giro ?? 0;
  // El golpe: entra más grande y se asienta en unos 4 fotogramas.
  const escala = interpolate(s, [0, 1], [1.45, 1]);
  const fondoCaja = estilo === "placa" ? COLOR.crema : BANDAS[e.color ?? "roja"] ?? COLOR.rojo;
  const tinta = caja ? (e.tinta === "crema" ? COLOR.crema : "#0d0d10") : TINTAS[estilo] ?? COLOR.crema;
  const base: React.CSSProperties = {
    fontFamily: FUENTE.gorda,
    fontSize: tam,
    lineHeight: 1,
    whiteSpace: "pre",
    textAlign: "center",
    letterSpacing: tam * 0.02,
    textTransform: e.minusculas ? "none" : "uppercase",
  };
  const contorno = Math.max(5, tam * 0.11);
  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: cy,
        transform: `translate(-50%, -50%) rotate(${giro}deg) scale(${escala})`,
        opacity: Math.min(1, s * 3),
      }}
    >
      {caja ? (
        <div style={{ ...base, color: tinta, background: fondoCaja, padding: `${tam * 0.12}px ${tam * 0.3}px ${tam * 0.06}px`, border: `${Math.max(3, tam * 0.05)}px solid #0d0d10` }}>
          {e.texto}
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div style={{ ...base, position: "absolute", inset: 0, color: "#0d0d10", WebkitTextStroke: `${contorno * 2}px #0d0d10` }}>{e.texto}</div>
          <div style={{ ...base, position: "relative", color: tinta }}>{e.texto}</div>
        </div>
      )}
      {tachon !== undefined && frame >= tachon && (
        <div style={{ position: "absolute", left: "-3%", top: "44%", height: Math.max(8, tam * 0.13), width: `${interpolate(frame, [tachon, tachon + 5], [0, 106], { extrapolateRight: "clamp" })}%`, background: COLOR.rojo, transform: "rotate(-3deg)", boxShadow: "0 0 0 3px #0d0d10" }} />
      )}
    </div>
  );
};

/**
 * La traducción de lo citado cuando no cabe limpia en su lugar (la cita es un pedazo de su oración, o el español no
 * llena sus renglones): una nota oscura con la raya del resaltador, en letra de leer, que entra sin golpe. La pone el
 * director (`scripts/director.py`), ya partida en renglones; lo citado se queda en inglés con su resaltador.
 */
const Traduccion: React.FC<{ e: any; desde: number }> = ({ e, desde }) => {
  const frame = useCurrentFrame();
  const { W, H } = useFormato();
  const k = useEscala();
  const renglones = String(e.texto).split("\n");
  const letras = Math.max(...renglones.map((r) => r.length));
  let tam = (e.tam ?? 44) * k;
  const anchoDe = (t: number) => letras * t * 0.54 + t * 1.6;
  if (anchoDe(tam) > W * 0.94) tam *= (W * 0.94) / anchoDe(tam);
  const alto = renglones.length * tam * 1.22 + tam * 0.9;
  const margen = Math.min(W, H) * 0.02;
  const cy = Math.min(Math.max((e.y ?? 0.86) * H, alto / 2 + margen), H - alto / 2 - margen);
  const entra = interpolate(frame - desde, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: W / 2,
        top: cy,
        transform: `translate(-50%, -50%) translateY(${(1 - entra) * tam * 0.5}px)`,
        opacity: entra,
        fontFamily: FUENTE.ui,
        fontWeight: 600,
        fontSize: tam,
        lineHeight: 1.22,
        whiteSpace: "pre",
        color: COLOR.crema,
        background: "rgba(13, 13, 16, 0.94)",
        borderLeft: `${Math.max(6, tam * 0.18)}px solid ${COLOR.resaltador}`,
        padding: `${tam * 0.4}px ${tam * 0.6}px`,
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.55)",
      }}
    >
      {e.texto}
    </div>
  );
};

/**
 * El logo de una empresa como pegatina: cae de golpe en su nombre, girado y con su orilla blanca, sobre lo que haya
 * (en los Code Report, más de la mitad del tiempo hay algo pegado y casi siempre es un logo: REFERENCIAS.md).
 */
const Pegatina: React.FC<{ e: any }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { W, H } = useFormato();
  const k = useEscala();
  const { desde, hasta } = useTramo(e);
  const resorte = useResorte(desde, { damping: 12, stiffness: 380, mass: 0.6 });
  if (frame < desde || frame >= hasta) return null;
  // `quieto`: ya estaba pegada en la toma (el director la repite en el beat que la sigue) y no vuelve a caer.
  const s = e.quieto ? 1 : resorte;
  const lado = (e.tam ?? 190) * k;
  return (
    <div
      style={{
        position: "absolute",
        left: (e.x ?? 0.84) * W,
        top: (e.y ?? 0.16) * H,
        width: lado,
        height: lado,
        transform: `translate(-50%, -50%) rotate(${e.giro ?? 8}deg) scale(${interpolate(s, [0, 1], [1.7, 1])})`,
        opacity: Math.min(1, s * 3),
        background: "white",
        borderRadius: lado * 0.22,
        padding: lado * 0.08,
        border: `${Math.max(3, lado * 0.03)}px solid #0d0d10`,
        boxShadow: "0 12px 34px rgba(0, 0, 0, 0.6)",
      }}
    >
      <Img src={staticFile(e.img)} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: lado * 0.14 }} />
    </div>
  );
};

const Pegado: React.FC<{ e: any }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { W, H } = useFormato();
  const { desde, hasta } = useTramo(e);
  const s = useResorte(desde, { damping: 16, stiffness: 260, mass: 0.7 });
  if (frame < desde || frame >= hasta) return null;
  const alto = (e.alto ?? 0.75) * H;
  const entra: string = e.entra ?? "sube";
  // `sube`: anclado a la orilla de abajo y entra desde abajo. `golpe`: aparece en su lugar. `izquierda`/`derecha`: entra
  // deslizando desde esa orilla.
  const abajo = entra === "sube" || e.abajo;
  const cx = (e.x ?? 0.78) * W;
  const fuera = 1 - s;
  const dx = entra === "izquierda" ? -fuera * W * 0.6 : entra === "derecha" ? fuera * W * 0.6 : 0;
  const dy = entra === "sube" ? fuera * alto : 0;
  const pop = entra === "golpe" ? interpolate(s, [0, 1], [1.15, 1]) : 1;
  return (
    <Img
      src={staticFile(e.img)}
      style={{
        position: "absolute",
        height: alto,
        left: cx,
        top: abajo ? H - alto : (e.y ?? 0.5) * H - alto / 2,
        transform: `translate(-50%, 0) translate(${dx}px, ${dy}px) scale(${(e.espejo ? -1 : 1) * pop}, ${pop}) rotate(${e.giro ?? 0}deg)`,
        transformOrigin: "50% 100%",
        opacity: entra === "golpe" ? Math.min(1, s * 4) : 1,
      }}
    />
  );
};

const Senal: React.FC<{ e: any }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { W, H } = useFormato();
  const k = useEscala();
  const { desde, hasta } = useTramo(e);
  if (frame >= hasta) return null;
  // La punta del dedo cae en (x, y): la mano se dibuja centrada, así que se corre hacia su lado.
  const tam = (e.tam ?? 150) * k;
  const dir = e.dir ?? "derecha";
  const dx = dir === "derecha" ? -tam * 0.42 : dir === "izquierda" ? tam * 0.42 : 0;
  const dy = dir === "abajo" ? -tam * 0.42 : 0;
  return <Mano x={(e.x ?? 0.5) * W + dx} y={(e.y ?? 0.5) * H + dy} dir={dir} desde={desde} tam={tam} />;
};
