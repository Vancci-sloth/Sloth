// Lo 2D que comparten los capítulos, en cualquier video: el indicador de cualquier tema (lo que cambia con la
// historia), los botones que dicen que no (parpadean y se quedan rojos), el cursor que pulsa, el número
// en su píldora, el hueco que marca un objeto 3D para que una Flecha lo encuentre, y el cierre: la cuenta o el canal al
// que manda el video, en su red (`MARCA`: la tarjeta, y en chiquito en el celular del personaje). Si el cierre es otro
// (comentar una palabra), se hace su pieza.
import React from "react";
import { interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { K, proyectar, useCamara, V3 } from "../mundo/camara";
import { EnMundo } from "../mundo/EnMundo";
import { type ConSimbolo, Pildora, Simbolo, useNegado } from "../piezas/diagrama";
import { Glifo } from "../piezas/iconos";
import { MARCA } from "../marca";
import { colorDeRed, TarjetaCierre } from "../piezas/tarjetas";
import { Ancla, Aparece, Pulso, sujeta, suave, useColores } from "../piezas/ui";
import { HORIZONTAL, LETRA, MONO, ROJO, ZONA } from "../tema";

/** Lo que un `Indicador` enseña en un cuadro: dónde (un punto del mundo), qué y cuánto se ve (0–1). */
export type Lectura = { p: V3; texto: string; nota?: string; color?: string; visible: number };

/**
 * El indicador de cualquier tema (la temperatura, la población, el año, los usuarios), pegado a su objeto y cambiando
 * con la historia: `de(f)` es una función de guion.ts que dice qué enseña en cada cuadro, o `null` cuando no está.
 */
export const Indicador: React.FC<{ de: (f: number) => Lectura | null; tam?: number; origen?: [number, number] }> = ({ de, tam = 56, origen = [0.5, 1] }) => {
  const f = useCurrentFrame();
  const c = useColores();
  const l = de(f);
  if (!l || l.visible <= 0.01) return null;
  return (
    <EnMundo p={l.p} origen={origen}>
      <div style={{ opacity: l.visible, textAlign: "center", fontFamily: LETRA, background: c.tarjeta, border: `2px solid ${l.color ?? c.borde}`, borderRadius: 28, boxShadow: c.sombra, padding: "12px 28px 14px" }}>
        <div style={{ fontFamily: MONO, fontSize: tam, fontWeight: 700, lineHeight: 1, color: l.color ?? c.texto, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{l.texto}</div>
        {l.nota ? <div style={{ fontSize: tam * 0.46, fontWeight: 600, color: c.tenue, marginTop: 6 }}>{l.nota}</div> : null}
      </div>
    </EnMundo>
  );
};

/** Un botón que no se puede pulsar: en `no` parpadea y se queda rojo. Sin `no`, un botón normal (de `color`). */
export const Boton: React.FC<{ no?: number; color?: string; clic?: number; tam?: number; children: React.ReactNode }> = ({ no, color, clic, tam = 44, children }) => {
  const f = useCurrentFrame();
  const c = useColores();
  const rojo = useNegado(no);
  const hunde = clic === undefined ? 1 : interpolate(f, [clic, clic + 3, clic + 8], [1, 0.92, 1], sujeta);
  const fondo = color ?? interpolateColors(rojo, [0, 1], [c.tarjeta, ROJO]);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: `${tam * 0.42}px ${tam * 0.85}px`,
        borderRadius: 999,
        background: fondo,
        border: `3px solid ${color ?? interpolateColors(rojo, [0, 1], [c.borde, ROJO])}`,
        boxShadow: c.sombra,
        color: color || rojo > 0.5 ? "#fff" : c.texto,
        fontFamily: LETRA,
        fontWeight: 800,
        fontSize: tam,
        whiteSpace: "nowrap",
        transform: `scale(${hunde})`,
      }}
    >
      {children}
    </div>
  );
};

/** El cursor que llega a un botón y lo pulsa. */
export const Cursor: React.FC<{ de: [number, number]; a: [number, number]; desde: number; hasta: number }> = ({ de, a, desde, hasta }) => {
  const f = useCurrentFrame();
  if (f < desde) return null;
  const p = interpolate(f, [desde, hasta], [0, 1], { ...sujeta, easing: suave });
  return (
    <svg width="68" height="68" viewBox="0 0 24 24" style={{ position: "absolute", left: de[0] + (a[0] - de[0]) * p, top: de[1] + (a[1] - de[1]) * p, filter: "drop-shadow(0 4px 6px #0006)" }}>
      <path d="M4 2l14 9.5-6.2 1.3 3.6 7.2-2.7 1.3-3.6-7.2L4 18.5z" fill="#fff" stroke="#000" strokeWidth="1.2" />
    </svg>
  );
};

/** Un número grande en su píldora, del color de lo que cuenta, con su ícono o logo delante. */
export const Numero: React.FC<ConSimbolo & { color: string; tam?: number; children: React.ReactNode }> = ({ color, tam = 56, children, ...simbolo }) => {
  const c = useColores();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: `${tam * 0.22}px ${tam * 0.5}px`,
        borderRadius: 999,
        background: c.tarjeta,
        border: `3px solid ${color}`,
        boxShadow: c.sombra,
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: tam,
        color,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <Simbolo {...simbolo} tam={tam} />
      {children}
    </div>
  );
};

/**
 * La pantalla del celular del personaje: el canal en chiquito (la pose `celular`, ver su ancla en datos/personaje.json).
 * Sin red de cierre, la pantalla se queda apagada.
 */
export const PantallaCanal: React.FC<{ nombre?: string; avatar?: string }> = ({ nombre = MARCA.nombre, avatar = MARCA.avatar }) => {
  const red = MARCA.red;
  return (
    <div style={{ width: 130, height: 257, overflow: "hidden", background: "#17212b" }}>
      {red === "ninguna" ? null : (
        <div style={{ width: 760, height: 1500, transform: "scale(0.1711)", transformOrigin: "0 0" }}>
          <div style={{ paddingTop: 120, display: "flex", justifyContent: "center" }}>
            <TarjetaCierre red={red} clic={1e9} avatar={avatar} nombre={nombre} ancho={700} />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * El cierre: la tarjeta de la cuenta o el canal de `MARCA` (su red, su nombre y su foto) entra en `pero` («pero si
 * quieres enterarte…»), el botón se pulsa en `unete` y en `enlace` sale dónde está («en mi perfil», o la página). Va
 * fija en la pantalla, arriba del personaje en vertical y a su izquierda en horizontal (él enseña el canal en su
 * celular). Sin red de cierre no dibuja nada. Va en el capítulo del cierre, con las palabras de la frase de la marca:
 * `<Canal pero={en("pero si quieres")} unete={en("únete")} enlace={en("el enlace")} />`.
 */
export const Canal: React.FC<{ nombre?: string; avatar?: string; pero: number; unete: number; enlace: number }> = ({ nombre = MARCA.nombre, avatar = MARCA.avatar, pero, unete, enlace }) => {
  const red = MARCA.red;
  if (red === "ninguna") return null;
  const { color, fondo } = colorDeRed(red);
  // El centro de la escena y la altura de la tarjeta: en vertical, 540 y 470; el botón queda 418 px más abajo.
  const x = (ZONA.escena.izquierda + ZONA.escena.derecha) / 2;
  const arriba = HORIZONTAL ? ZONA.escena.arriba + 30 : ZONA.escena.arriba;
  return (
    <>
      <Aparece en={pero} desde={{ escala: 1.1 }} style={{ left: x - 420, top: arriba }}>
        <TarjetaCierre red={red} clic={unete + 4} avatar={avatar} nombre={nombre} ancho={840} />
      </Aparece>
      <Pulso x={x} y={arriba + 418} desde={pero + 8} hasta={unete + 4} color={color} radio={300} cada={24} />
      <Aparece en={enlace} style={{ left: x - 480, width: 960, top: arriba + (HORIZONTAL ? 590 : 680), display: "flex", justifyContent: "center" }}>
        <Pildora color={color} fondo={fondo} style={{ fontSize: 46, padding: "16px 32px" }}>
          <Glifo nombre="Link" tam={46} peso="bold" />
          {red === "web" ? nombre : "en mi perfil"}
        </Pildora>
      </Aparece>
    </>
  );
};

/**
 * Un hueco invisible del tamaño de algo 3D (centro `p` y `radio` en metros), con su `Ancla`: para que una Flecha llegue
 * a un objeto del mundo (el protagonista, el bloque que falta) sin coordenadas a mano. Va solo mientras la flecha lo necesita.
 */
export const Hueco: React.FC<{ id: string; p: V3; radio: number }> = ({ id, p, radio }) => {
  const cam = useCamara();
  const lado = (2 * radio * K) / Math.max(0.5, proyectar(cam, p).prof);
  return (
    <EnMundo p={p}>
      <Ancla id={id}>
        <div style={{ width: lado, height: lado }} />
      </Ancla>
    </EnMundo>
  );
};
