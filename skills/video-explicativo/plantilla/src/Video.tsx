// El video entero: el mundo 3D (uno solo, que la cámara recorre de principio a fin), lo 2D del capítulo clavado en ese
// mundo, el texto de arriba, el personaje y la voz. Los capítulos (oscuro o claro) repintan el mismo mundo; el cambio
// desenfoca todo el cuadro y pasa por gris en ~6 cuadros (capitulos.ts). Al moverse rápido la cámara, el mundo se
// desenfoca un poco (el barrido).
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { temaEn } from "./capitulos";
import { CAPITULOS, PERSONAJE } from "./escenas";
import { CON_PERSONAJE } from "./marca";
import { CamaraContexto, camaraDe, rapidezDe } from "./mundo/camara";
import { Escena3D } from "./mundo/Escena3D";
import { PLANOS } from "./mundo/guion";
import { Mundo } from "./mundo/Mundo";
import { Personaje } from "./piezas/Personaje";
import { Subtitulos } from "./piezas/Subtitulos";
import { TemaContexto } from "./piezas/ui";
import { FUENTES } from "./tema";

export const Video: React.FC = () => {
  const [espera] = useState(() => delayRender("Cargando las fuentes"));
  const [listo, setListo] = useState(false);
  useEffect(() => {
    FUENTES.then(() => {
      setListo(true);
      continueRender(espera);
    });
  }, [espera]);
  return listo ? <Cuadro /> : null;
};

const Cuadro: React.FC = () => {
  const f = useCurrentFrame();
  const t = temaEn(f);
  const Escena = CAPITULOS[t.n].Escena;
  const camara = camaraDe(PLANOS, f);
  const rapidez = rapidezDe(PLANOS, f);
  const barrido = rapidez > 7 ? Math.min(6, (rapidez - 7) * 0.12) : 0;
  const fondo = t.color("fondo");
  const conPerro = CON_PERSONAJE && f >= PERSONAJE.entra;
  return (
    <AbsoluteFill style={{ backgroundColor: fondo }}>
      <AbsoluteFill style={{ filter: t.borroso ? `blur(${t.borroso * 14}px)` : undefined }}>
        <CamaraContexto.Provider value={camara}>
          <AbsoluteFill style={{ filter: barrido ? `blur(${barrido}px)` : undefined }}>
            <Mundo planos={PLANOS}>
              <Escena3D />
            </Mundo>
            {/* El mundo se funde con el fondo arriba (el texto) y abajo (el personaje). */}
            <AbsoluteFill
              style={{
                background: `linear-gradient(${fondo} 0%, ${fondo} 11%, transparent 25%, transparent ${conPerro ? 74 : 88}%, ${fondo} ${conPerro ? 96 : 100}%)`,
              }}
            />
            <TemaContexto.Provider value={t.tema}>
              <Escena />
            </TemaContexto.Provider>
          </AbsoluteFill>
        </CamaraContexto.Provider>
        <Subtitulos texto={t.color("texto")} tenue={t.color("tenue")} />
        {CON_PERSONAJE ? <Personaje {...PERSONAJE} /> : null}
        {t.borroso ? <AbsoluteFill style={{ backgroundColor: "#7a7a7a", opacity: t.borroso * 0.25 }} /> : null}
      </AbsoluteFill>
      <Audio src={staticFile("voz.wav")} />
    </AbsoluteFill>
  );
};
