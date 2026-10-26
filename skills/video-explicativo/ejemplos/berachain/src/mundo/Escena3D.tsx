// Lo que hay en el mundo 3D de este video y cuándo está en escena (los tiempos y lugares salen de guion.ts). Solo está
// lo que se está diciendo: cada cosa entra cuando se habla de ella y sale cuando ya no, y vuelve a su mismo sitio si
// se vuelve a hablar de ella. De fondo solo queda la cadena, quieta y sin color.
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { temaEn } from "../capitulos";
import { DECORATIVOS, MIEL, ROJO, SIGNIFICA } from "../tema";
import { Aro } from "../modelos/aro";
import { Boveda } from "../modelos/boveda";
import { Cadena } from "../modelos/cadena";
import { EnEscena, presencia } from "../modelos/comun";
import { Disco } from "../modelos/disco";
import { Eter } from "../modelos/eter";
import { Flujo, Lluvia } from "../modelos/fichas";
import { Icono3D } from "../modelos/icono-3d";
import { Moneda } from "../modelos/moneda";
import { Panal } from "../modelos/panal";
import { Regalo } from "../modelos/regalo";
import { V3 } from "./camara";
import { L, monedaEn, nivelPanal, SALE, T } from "./guion";

// Los fondos de la Serie B, con su logo: sin nombres escritos.
const FONDOS = ["framework", "brevan", "polychain", "hackvc", "samsungnext", "laserdigital", "hashkey", "arrington"];

/** El anillo de fondos del gancho: llegan en enjambre y giran alrededor de la moneda; Brevan Howard se queda. */
const Fondos: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < T.anillo) return null;
  const llega = spring({ frame: f - T.anillo, fps, config: { damping: 15, stiffness: 60 } });
  const aparta = spring({ frame: f - T.uno, fps, config: { damping: 18, stiffness: 100 } });
  const recibe = f >= T.devuelve ? interpolate(f, [T.devuelve + 8, T.devuelve + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const refund = f >= T.veinti ? interpolate(f, [T.veinti, T.veinti + 10, T.sabe, T.sabe + 10], [0, 1, 1, 0.3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const giro = (f - T.anillo) / 80;
  // Brevan Howard se queda en el gancho y vuelve cuando se habla del acuerdo.
  const brevan = presencia(f, [[-100, T.pero + 20], [T.acuerdo - 6, T.julio - 4]], fps);
  return (
    <>
      {FONDOS.map((logo, i) => {
        const a = giro + (i / FONDOS.length) * Math.PI * 2;
        const elegido = logo === "brevan";
        let pos: V3 = [L.casa[0] + Math.cos(a) * 1.3 * llega, L.casa[1] + 0.05, L.casa[2] + Math.sin(a) * 1.0 * llega];
        let escala = 0.4 + 0.6 * llega;
        if (elegido) {
          pos = pos.map((v, k) => v + (L.brevan[k] - v) * aparta) as V3;
          escala += (1.45 - escala) * aparta;
          // En el acuerdo se hace grande: es de lo que se habla.
          if (f >= T.pero) escala = f < T.acuerdo - 6 ? 1.45 : 2.6;
          escala *= brevan;
        } else if (aparta > 0.98) return null;
        return (
          <Disco
            key={logo}
            logo={logo}
            pos={pos}
            radio={0.17}
            escala={escala}
            borde={elegido && aparta > 0.3 ? MIEL : "#2e2e2e"}
            luz={elegido ? Math.max(recibe * (1 - interpolate(f, [T.pero, T.pero + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })), refund) : 0}
            opacidad={elegido ? 1 : 1 - aparta}
          />
        );
      })}
    </>
  );
};

export const Escena3D: React.FC = () => {
  const f = useCurrentFrame();
  const t = temaEn(f);
  const m = monedaEn(f);
  const tuArriba: V3 = [L.tu[0], L.tu[1] + 0.55, L.tu[2]];
  const panalCentro: V3 = [L.panal[0], 1.4, L.panal[2] + 0.3];
  return (
    <>
      <Fondos />
      {m.e.escala > 0.01 ? <Moneda e={m.e} rota={m.rota} frente="img/moneda_cara.png" atras="img/moneda_bgt.png" canto={["#d9a62e", "#e2681e"]} luz={SIGNIFICA.protagonista} /> : null}

      {/* La cadena y Ethereum. */}
      <Cadena
        cabeza={L.cabeza}
        dir={[0, 0, -1]}
        aparece={T.blockchain - 8}
        corre={[
          [T.blockchain - 8, T.bera2 + 10],
          [T.t1 - 2, T.t2 - 4],
          [T.valid - 6, T.acuerdo - 4],
        ]}
        para={T.apagaron + 3}
        sigue={T.acuerdo - 4}
        union={t.claridad > 0.5 ? "#cfcfcf" : "#3a3a3a"}
        fondo={t.color("fondo")}
        colores={DECORATIVOS}
        rojo={ROJO}
      />
      <EnEscena ventanas={[[T.eth - 2, T.casi + 6]]} pos={L.eter} escala={0.9}>
        <Eter giro={(f - T.eth) / 22} />
      </EnEscena>

      {/* Casi todas las cadenas: cada bloque imprime una moneda y se la da a quien vigila la red. */}
      <Flujo de={SALE} a={L.escudo} desde={T.imprimen} hasta={T.bera2 - 6} cada={24} viaje={26} color={SIGNIFICA.ajeno} alto={0.6} tam={0.3} />
      <EnEscena
        ventanas={[
          [T.dan - 6, T.bera2 + 14],
          [T.valid - 6, T.acuerdo - 4],
        ]}
        pos={L.escudo}
        escala={1.05}
      >
        <Icono3D icono="shield-check" color={SIGNIFICA.regla} gris={f >= T.valid - 6 ? 0 : interpolate(f, [T.bera2, T.bera2 + 10], [0, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      </EnEscena>

      {/* Berachain: a quien pone su dinero en las apps (tú), y tu dinero va al panal. */}
      <Flujo de={SALE} a={tuArriba} desde={T.bera2 + 4} hasta={T.recompensa - 10} cada={24} viaje={28} color={SIGNIFICA.segundo} alto={1.1} tam={0.26} />
      <EnEscena
        ventanas={[
          [T.pone - 6, T.recompensa - 8],
          [T.julio - 4, T.jubilaron + 4],
        ]}
        pos={L.tu}
        escala={1.1}
      >
        <Icono3D icono="user" color={SIGNIFICA.dinero} />
      </EnEscena>
      <Flujo de={SALE} a={tuArriba} desde={T.julio} hasta={T.jubilaron - 6} cada={14} viaje={28} color={SIGNIFICA.segundo} alto={1.1} tam={0.26} />
      <Flujo de={[L.tu[0] + 0.4, L.tu[1] + 0.2, L.tu[2]]} a={panalCentro} desde={T.apps - 2} hasta={T.pol + 20} cada={10} viaje={22} color={SIGNIFICA.dinero} marca="$" alto={0.7} tam={0.15} />
      <EnEscena
        ventanas={[
          [T.apps - 8, T.recompensa - 8],
          [T.llego - 4, T.ahora - 2],
        ]}
        pos={L.panal}
      >
        <Panal nivel={nivelPanal(f)} aparece={T.apps - 8} filas={6} r={0.28} miel={SIGNIFICA.protagonista} />
      </EnEscena>
      <Aro
        color={SIGNIFICA.regla}
        centro={[2.2, 0, -0.8]}
        rx={1.6}
        rz={2.8}
        p={interpolate(f, [T.pol, T.pol + 16, T.recompensa - 14, T.recompensa - 6], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />

      {/* 1 · Imprime mucho más de lo que le vuelve. */}
      <Lluvia de={SALE} desde={T.mas} hasta={T.t2 - 20} sale={T.t2 - 4} cada={2} color={SIGNIFICA.segundo} fuerza={[-1.3, 2.6, 0.5]} abre={0.9} tam={0.12} />
      <Flujo de={[2.4, 2.6, -2.2]} a={SALE} desde={T.ganaba} hasta={T.t2} cada={14} viaje={34} color={SIGNIFICA.protagonista} alto={1} tam={0.15} />

      {/* 2 · El regalo (el airdrop) y los que vendieron. */}
      <EnEscena ventanas={[[T.t2 - 4, T.cuatro - 6]]} pos={L.regalo}>
        <Regalo abre={T.barata} />
      </EnEscena>
      <Lluvia de={[L.regalo[0], 1.0, L.regalo[2]]} desde={T.barata + 2} hasta={T.barata + 28} sale={T.cuatro - 6} color={SIGNIFICA.protagonista} vuelan={{ en: T.vendieron + 2, a: [-7.5, 4.5, -3] }} />

      {/* El 6 de febrero se abre la bóveda: inversionistas y equipo. */}
      <EnEscena ventanas={[[T.feb - 4, T.t3 - 4]]} pos={L.boveda}>
        <Boveda abre={T.libero} />
      </EnEscena>
      <Lluvia de={[L.boveda[0] + 0.1, 0.9, L.boveda[2] + 0.8]} desde={T.libero + 4} hasta={T.libero + 80} sale={T.t3 - 4} color={SIGNIFICA.protagonista} fuerza={[0.6, 1.6, 2.2]} abre={1.6} />

      {/* 3 · La confianza: hackean Balancer, que usaba su exchange (BEX). */}
      <EnEscena ventanas={[[T.hack - 4, T.valid - 6]]} pos={L.balancer}>
        <Disco logo="balancer" pos={[0, 0, 0]} radio={0.75} borde={ROJO} luz={0.5} />
        <group position={[0.62, 0.62, 0.2]} scale={0.5}>
          <Icono3D icono="warning" color={ROJO} />
        </group>
      </EnEscena>
      <EnEscena ventanas={[[T.exchange - 6, T.valid - 6]]} pos={L.bex} escala={1.2}>
        <Icono3D icono="arrows-left-right" color={SIGNIFICA.regla} />
      </EnEscena>
      <Flujo de={[L.balancer[0] + 0.5, L.balancer[1] - 0.5, L.balancer[2] + 0.3]} a={[L.bex[0] - 0.5, L.bex[1] + 0.2, L.bex[2]]} desde={T.exchange} hasta={T.valid - 16} cada={6} viaje={18} color={SIGNIFICA.pierde} marca="×" alto={0.5} tam={0.14} />

      {/* Brevan Howard puede pedir de vuelta sus 25 millones. */}
      <Flujo de={[-4.2, 0.9, 3.6]} a={L.brevan} desde={T.veinti - 4} hasta={T.sabe} cada={8} viaje={20} color={SIGNIFICA.dinero} marca="$" alto={0.5} tam={0.1} />

      {/* La empresa del Nasdaq que pagó 70 millones por su BERA. */}
      <EnEscena ventanas={[[T.empresa - 4, T.llego - 4]]} pos={L.nasdaq}>
        <Disco logo="nasdaq" pos={[0, 0, 0]} radio={0.7} borde="#0996c7" />
      </EnEscena>
      <Flujo de={L.nasdaq} a={[5.2, 1.0, -3.4]} desde={T.pago} hasta={T.valia + 10} cada={6} viaje={18} color={SIGNIFICA.dinero} marca="$" alto={0.6} tam={0.12} />
    </>
  );
};
