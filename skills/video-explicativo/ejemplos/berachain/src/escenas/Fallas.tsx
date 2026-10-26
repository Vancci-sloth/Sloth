// «Entonces qué falló» – «si lo hizo», oscuro: qué falló, en tres cosas. La cámara recorre el camino de la cadena hacia
// atrás (mundo/guion.ts) y en cada parada pasa algo en 3D (Escena3D.tsx); aquí va lo 2D, clavado en el mundo junto a
// lo que explica: arriba, fijo, el índice 1 · 2 · 3; lo que la cadena imprime contra lo que le vuelve (y la frase del
// foro, con su flecha al número chico); el regalo de 79 M y el calendario junto a la moneda que cae; la bóveda con los
// porcentajes y el BERA que sobra; la confianza que se vacía con el hackeo; el tuit de la cadena detenida (con su
// flecha al bloque que no llega); y el plazo de Brevan Howard.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { V3 } from "../mundo/camara";
import { EnMundo } from "../mundo/EnMundo";
import { L, monedaEn, T } from "../mundo/guion";
import { Pildora } from "../piezas/diagrama";
import { Glifo, Icono, NombreIcono } from "../piezas/iconos";
import { Calendario, Plazo, Prueba } from "../piezas/tarjetas";
import { Ancla, Contador, Entra, Flecha, useColores } from "../piezas/ui";
import { fin } from "../tiempo";
import { LETRA, MIEL, MONO, NARANJA, ROJO, SIGNIFICA, VERDE } from "../tema";
import { Hueco, Numero, PrecioPegado } from "./comun";
import { FichaBera } from "./Explica";

const ICONOS: NombreIcono[] = ["Printer", "ChartLineDown", "Handshake"];

/** El índice de las tres cosas: grande al decir «tres cosas», y luego chico arriba con la que va encendida. */
const Indice: React.FC<{ inicios: number[] }> = ({ inicios }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = useColores();
  if (f < T.tres) return null;
  const sube = spring({ frame: f - inicios[0], fps, config: { damping: 18, stiffness: 110 } });
  const activa = inicios.findLastIndex((t) => t <= f);
  return (
    <div style={{ position: "absolute", left: 0, width: 1080, top: interpolate(sube, [0, 1], [780, 488]), display: "flex", justifyContent: "center", gap: interpolate(sube, [0, 1], [40, 18]) }}>
      {ICONOS.map((icono, i) => {
        const p = spring({ frame: f - T.tres - i * 4, fps, config: { damping: 14, stiffness: 150 } });
        const encendida = i === activa;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: interpolate(sube, [0, 1], [30, 10]) + "px " + interpolate(sube, [0, 1], [44, 22]) + "px",
              borderRadius: 999,
              background: encendida ? NARANJA : c.tarjeta2,
              border: `2px solid ${encendida ? NARANJA : c.borde}`,
              color: encendida ? "#1a0f00" : i <= activa ? c.texto : c.tenue,
              fontFamily: LETRA,
              fontWeight: 800,
              fontSize: interpolate(sube, [0, 1], [96, 38]),
              transform: `scale(${p})`,
              opacity: p * (encendida || activa < 0 ? 1 : 0.6),
            }}
          >
            {i + 1}
            <Glifo nombre={icono} tam={interpolate(sube, [0, 1], [96, 38]) * 0.9} />
          </div>
        );
      })}
    </div>
  );
};

/** La confianza, como una barra de vida que se vacía sola. */
const Confianza: React.FC<{ desde: number }> = ({ desde }) => {
  const f = useCurrentFrame();
  const c = useColores();
  const v = 100 - 85 * (1 - Math.exp(-Math.max(0, f - desde) / 120));
  const color = v > 60 ? VERDE : v > 35 ? NARANJA : ROJO;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: LETRA, color: c.texto }}>
      <Icono nombre="Handshake" tam={96} color={color} />
      <div style={{ width: 480, height: 80, borderRadius: 22, background: c.tarjeta2, border: `3px solid ${c.borde}`, overflow: "hidden", padding: 7 }}>
        <div style={{ width: `${v}%`, height: "100%", borderRadius: 15, background: color, opacity: 0.85 + 0.15 * Math.sin(f / 3) }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 46, fontWeight: 700, color, width: 110 }}>{Math.round(v)}%</div>
    </div>
  );
};

/** Dónde queda el bloque que no llega cuando la cadena se detiene (el mismo cálculo que la Cadena). */
const fantasma = (): V3 => {
  const cada = 24;
  const paso = 1.5;
  const para = T.apagaron + 3;
  const avance = ((para - Math.floor(para / cada) * cada) / cada) * paso;
  return [L.cabeza[0], L.cabeza[1], L.cabeza[2] - avance + paso];
};

export const Fallas: React.FC = () => {
  const f = useCurrentFrame();
  const m = monedaEn(f).e;
  const halt = fantasma();
  const imprime = Math.max(0, f - T.mas) * 2467;
  const vuelve = Math.max(0, f - T.ganaba) * 2467 * 0.28;
  return (
    <>
      {/* «¿Entonces qué falló?» sobre el camino de noche. */}
      <EnMundo p={[-0.8, 2.6, -5]}>
        <Entra en={0} sale={T.tres - 2} desde={{ escala: 1.3 }}>
          <div style={{ fontFamily: LETRA, fontWeight: 800, fontSize: 420, lineHeight: 1, color: ROJO, transform: `rotate(${Math.sin(f / 7) * 4}deg)` }}>?</div>
        </Entra>
      </EnMundo>

      {/* 1 · Lo que imprime (el montón de BGT) contra lo que le vuelve (las pocas monedas de oro). */}
      <EnMundo p={[-1.7, 1.05, 0.6]} origen={[0.5, 1]}>
        <Entra en={T.mas} sale={T.t2 - 2}>
          <Ancla id="imprime">
            <Numero color={SIGNIFICA.segundo}>
              <Glifo nombre="Printer" tam={52} />+{Math.floor(imprime).toLocaleString("es-MX")}
            </Numero>
          </Ancla>
        </Entra>
      </EnMundo>
      <EnMundo p={[1.1, 1.05, 0.5]} origen={[0.5, 1]}>
        <Entra en={T.ganaba} sale={T.t2 - 2}>
          <Ancla id="vuelve">
            <Numero color={SIGNIFICA.protagonista}>
              <Glifo nombre="ArrowUUpLeft" tam={52} />+{Math.floor(vuelve).toLocaleString("es-MX")}
            </Numero>
          </Ancla>
        </Entra>
      </EnMundo>
      <EnMundo p={[-0.5, 1.95, 0.05]} origen={[0.5, 1]}>
        <Entra en={T.admitio} sale={T.t2 - 2}>
          <Ancla id="foro-menos">
            <Prueba logo="berachain" fuente="Foro de Berachain · 21 may 2026" partes={["«…receive ", { t: "less value back", en: T.menos, subraya: true }, " than it emits.»"]} ancho={660} tam={44} />
          </Ancla>
        </Entra>
      </EnMundo>
      {f < T.t2 - 2 ? <Flecha en={T.menos + 10} de="foro-menos" a="vuelve" /> : null}

      {/* 2 · El regalo de 79 M; cuatro días después, la moneda cae 69 % (su precio pegado) y el calendario avanza. */}
      <EnMundo p={[L.regalo[0], 1.75, L.regalo[2]]} origen={[0.5, 1]}>
        <Entra en={T.barata} sale={T.cuatro - 6}>
          <Numero color={SIGNIFICA.protagonista} tam={64}>
            <Glifo nombre="Gift" tam={60} />
            79M
          </Numero>
        </Entra>
      </EnMundo>
      <PrecioPegado />
      {m.escala > 0.05 && f >= T.cuatro - 6 && f < T.feb ? (
        <EnMundo p={m.pos} origen={[0, 0.5]} desplaza={[250, -60]}>
          <Entra en={T.cuatro - 4} sale={T.feb - 4}>
            <Calendario
              ancho={250}
              fechas={[
                [T.cuatro, "2025-02-06"],
                [T.cuatro + 8, "2025-02-07"],
                [T.cuatro + 16, "2025-02-08"],
                [T.cuatro + 24, "2025-02-09"],
                [T.cuatro + 32, "2025-02-10"],
              ]}
            />
          </Entra>
        </EnMundo>
      ) : null}

      {/* El 6 de febrero se abre la bóveda: inversionistas y equipo; 43 % más BERA en un día. */}
      <EnMundo p={[L.boveda[0], 0.75, L.boveda[2]]} origen={[0.5, 0.5]} desplaza={[300, -230]}>
        <Entra en={T.feb} sale={T.t3 - 4}>
          <Calendario ancho={220} fechas={[[T.feb, "2026-02-06"]]} />
        </Entra>
      </EnMundo>
      <EnMundo p={[L.boveda[0], 0, L.boveda[2] + 0.7]} origen={[0.5, 0]}>
        <div style={{ display: "flex", gap: 18 }}>
          <Entra en={T.inv - 2} sale={T.t3 - 4}>
            <Numero color={ROJO} tam={48}>
              <Icono nombre="Bank" tam={64} color={ROJO} />
              34%
            </Numero>
          </Entra>
          <Entra en={T.yEquipo - 2} sale={T.t3 - 4}>
            <Numero color={NARANJA} tam={48}>
              <Icono nombre="UsersThree" tam={64} color={NARANJA} />
              17%
            </Numero>
          </Entra>
        </div>
      </EnMundo>
      <EnMundo p={[L.boveda[0] + 0.9, 1.2, L.boveda[2] + 1.8]} origen={[0.5, 1]}>
        <Entra en={T.t43 - 3} sale={T.t3 - 4}>
          <Numero color={SIGNIFICA.protagonista} tam={64}>
            <FichaBera tam={64} />
            <Contador de={147.6} a={211.4} desde={T.t43} hasta={T.t43 + 24} decimales={1} sufijo="M" />
          </Numero>
        </Entra>
      </EnMundo>

      {/* 3 · La confianza se vacía; el hackeo de Balancer llega a su exchange. */}
      <EnMundo p={[-2.3, 0.2, -14.2]} origen={[0.5, 0]}>
        <Entra en={T.t3} sale={T.valid - 4}>
          <Confianza desde={T.t3 + 8} />
        </Entra>
      </EnMundo>
      <EnMundo p={[L.balancer[0], L.balancer[1] - 0.85, L.balancer[2]]} origen={[0.5, 0]}>
        <Entra en={T.hack + 6} sale={T.valid - 4}>
          <div style={{ fontFamily: MONO, fontSize: 52, fontWeight: 700, color: ROJO }}>−$128M</div>
        </Entra>
      </EnMundo>

      {/* Los validadores detienen la cadena: el tuit oficial, con su flecha al bloque que no llega; recuperan 12 M. */}
      {f >= T.apagaron - 4 && f < T.acuerdo ? <Hueco id="bloque-que-falta" p={halt} radio={0.45} /> : null}
      <EnMundo p={[0.2, 2.3, 0.4]} origen={[0.5, 1]}>
        <Entra en={T.apagaron - 4} sale={T.acuerdo - 4}>
          <Ancla id="tuit-halt">
            <Prueba logo="berachain" fuente="@berachain · 3 nov 2025" partes={["«validators have coordinated to ", { t: "purposefully halt", en: T.apagaron + 2, subraya: true }, " the network»"]} ancho={660} tam={44} />
          </Ancla>
        </Entra>
      </EnMundo>
      {f >= T.apagaron && f < T.acuerdo - 4 ? <Flecha en={T.apagaron + 12} de="tuit-halt" a="bloque-que-falta" /> : null}
      <EnMundo p={[halt[0] + 0.9, 0.3, halt[2] + 0.4]} origen={[0, 0.5]}>
        <Entra en={T.doce - 2} sale={T.acuerdo - 4} desde={{ escala: 1.3 }}>
          <Pildora color={VERDE} fondo="#10261a" style={{ fontSize: 50 }}>
            <Glifo nombre="ArrowUUpLeft" tam={48} peso="bold" />
            $12M
          </Pildora>
        </Entra>
      </EnMundo>

      {/* Brevan Howard podía pedir de vuelta sus 25 millones durante un año. ¿Lo hizo? */}
      <EnMundo p={[L.casa[0] + 0.3, L.brevan[1] + 0.5, L.casa[2]]} origen={[0.5, 1]}>
        <Entra en={T.acuerdo} sale={T.julio - 4}>
          <Prueba logo="theblock" fuente="The Block · 24 nov 2025" partes={["«", { t: "$25 million", en: T.veinti, subraya: true }, " refund right»"]} ancho={660} tam={44} />
        </Entra>
      </EnMundo>
      <EnMundo p={[L.casa[0], 0, L.casa[2] + 0.9]} origen={[0.5, 0]}>
        <Entra en={T.anio - 4} sale={T.julio - 4}>
          <Plazo desde={T.anio} hasta={fin("lanzamiento", 2)} inicio="feb 2025" fin="feb 2026" color={MIEL} ancho={660} />
        </Entra>
      </EnMundo>
      <EnMundo p={[L.brevan[0] + 0.85, L.brevan[1] - 0.2, L.brevan[2]]}>
        <Entra en={T.sabe} sale={T.julio - 4} desde={{ escala: 1.6 }}>
          <div style={{ fontFamily: LETRA, fontWeight: 800, fontSize: 200, color: "#fff", transform: `rotate(${10 + Math.sin(f / 6) * 5}deg)` }}>?</div>
        </Entra>
      </EnMundo>

      <Indice inicios={[T.t1, T.t2, T.t3]} />
    </>
  );
};
