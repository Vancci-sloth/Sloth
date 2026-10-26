// Lo 2D que comparten los capítulos: el precio que la moneda lleva pegado (el indicador que cambia con la historia),
// los botones que dicen que no (parpadean y se quedan rojos), el cursor que pulsa, el número en su píldora, el hueco
// que marca un objeto 3D para que una Flecha lo encuentre, y el cierre: la cuenta o el canal al que manda el video, en
// su red (`MARCA`: la tarjeta, y en chiquito en el celular del personaje). Si el cierre es otro (comentar una palabra),
// se hace su pieza.
import React from "react";
import { interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { proyectar, useCamara, V3 } from "../mundo/camara";
import { EnMundo } from "../mundo/EnMundo";
import { monedaEn, precioEn } from "../mundo/guion";
import { Pildora, useNegado } from "../piezas/diagrama";
import { Glifo } from "../piezas/iconos";
import { MARCA } from "../marca";
import { colorDeRed, TarjetaCierre } from "../piezas/tarjetas";
import { Ancla, Aparece, Pulso, sujeta, suave, useColores } from "../piezas/ui";
import { LETRA, MONO, ROJO } from "../tema";

const dinero = (v: number) => `$${v.toFixed(2)}`;

/** El precio pegado debajo de la moneda, cuando la historia habla de él (precioEn en guion.ts). */
export const PrecioPegado: React.FC = () => {
  const f = useCurrentFrame();
  const c = useColores();
  const p = precioEn(f);
  const m = monedaEn(f).e;
  if (!p || p.visible <= 0.01 || m.escala < 0.05) return null;
  const grande = p.tam >= 120;
  const color = p.rojo ? ROJO : c.texto;
  return (
    // En el gancho el precio baja un poco más: entre la moneda y él se ve el montón de cubos.
    <EnMundo p={[m.pos[0], m.pos[1] - m.escala * 1.12, m.pos[2]]} origen={[0.5, 0]} desplaza={[0, grande ? 70 : 0]}>
      <div
        style={{
          opacity: p.visible,
          textAlign: "center",
          fontFamily: LETRA,
          ...(grande ? {} : { background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 28, boxShadow: c.sombra, padding: "14px 30px 16px" }),
        }}
      >
        <div style={{ fontSize: p.tam, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color, fontVariantNumeric: "tabular-nums" }}>{dinero(p.valor)}</div>
        <div style={{ fontSize: grande ? 34 : 26, fontWeight: 600, color: c.tenue, marginTop: grande ? 12 : 6 }}>{p.nota}</div>
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

/** Un número grande en su píldora, del color de lo que cuenta. */
export const Numero: React.FC<{ color: string; tam?: number; children: React.ReactNode }> = ({ color, tam = 56, children }) => {
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
 * fija en la pantalla, arriba del personaje (que enseña el canal en su celular). Sin red de cierre no dibuja nada.
 */
export const Canal: React.FC<{ nombre?: string; avatar?: string; pero: number; unete: number; enlace: number }> = ({ nombre = MARCA.nombre, avatar = MARCA.avatar, pero, unete, enlace }) => {
  const red = MARCA.red;
  if (red === "ninguna") return null;
  const { color, fondo } = colorDeRed(red);
  return (
    <>
      <Aparece en={pero} desde={{ escala: 1.1 }} style={{ left: 540 - 420, top: 470 }}>
        <TarjetaCierre red={red} clic={unete + 4} avatar={avatar} nombre={nombre} ancho={840} />
      </Aparece>
      <Pulso x={540} y={888} desde={pero + 8} hasta={unete + 4} color={color} radio={300} cada={24} />
      <Aparece en={enlace} style={{ left: 60, width: 960, top: 1150, display: "flex", justifyContent: "center" }}>
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
 * a un objeto del mundo (la moneda, el bloque que falta) sin coordenadas a mano. Va solo mientras la flecha lo necesita.
 */
export const Hueco: React.FC<{ id: string; p: V3; radio: number }> = ({ id, p, radio }) => {
  const cam = useCamara();
  const lado = (2 * radio * 3348) / Math.max(0.5, proyectar(cam, p).prof);
  return (
    <EnMundo p={p}>
      <Ancla id={id}>
        <div style={{ width: lado, height: lado }} />
      </Ancla>
    </EnMundo>
  );
};
