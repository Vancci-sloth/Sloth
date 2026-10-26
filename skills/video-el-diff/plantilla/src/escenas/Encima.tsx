import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLOR, FUENTE } from "../estilo";
import { Mano, useBeat, useFormato, useResorte } from "../piezas";

/**
 * Lo que se pega encima de cualquier escena en la palabra que lo dice:
 *   - `rotulo`: la cifra, el apodo, la fecha, el término nuevo o la ironía que la voz calla, en la letra gruesa con
 *     contorno negro. Crema para nombrar, rojo para golpear, sobre una banda de color para lo más fuerte, y la placa
 *     crema para el nombre de una persona que no se reconoce.
 *   - `pegado`: el recorte (PNG con transparencia, en `public/recortes/`) de una persona, un animal o un objeto, que
 *     entra de golpe o sube desde una orilla y se queda encima del material, sin sombra.
 *   - `senal`: el 👉 que entra desde un lado y señala algo.
 * Lo pide `encima=[...]` en cualquier beat (helpers `rotulo()`, `pegado()` y `senal()` de guion.py). `x` e `y` son el
 * centro en fracciones de la escena, así que valen igual en horizontal (1920x1080) y en la zona del vertical (1080x1156).
 * Cada cosa se queda hasta el final del beat, o hasta la palabra de `hasta`.
 */
export const Encima: React.FC = () => {
  const { v } = useBeat();
  if (!v.encima) return null;
  return (
    <>
      {(v.encima as any[]).map((e, i) =>
        e.tipo === "rotulo" ? <Rotulo key={i} e={e} /> : e.tipo === "pegado" ? <Pegado key={i} e={e} /> : e.tipo === "senal" ? <Senal key={i} e={e} /> : null,
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

const Rotulo: React.FC<{ e: any }> = ({ e }) => {
  const frame = useCurrentFrame();
  const { W, H } = useFormato();
  const k = useEscala();
  const { desde, hasta } = useTramo(e);
  const s = useResorte(desde, { damping: 15, stiffness: 420, mass: 0.6 });
  if (frame < desde || frame >= hasta) return null;
  const estilo: string = e.estilo ?? "crema";
  const caja = estilo === "banda" || estilo === "placa";
  // Cabe en la escena: en la zona del vertical, un rótulo largo se achica hasta caber, y el centro se corre para que no
  // se salga por una orilla. El ancho se estima por letras (Lilita One en mayúsculas: ~0.62 em).
  const renglones = String(e.texto).split("\n");
  const letras = Math.max(...renglones.map((r) => r.length));
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
