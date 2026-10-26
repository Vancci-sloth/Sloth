import React from "react";
import { Composition } from "remotion";
import { ALTO, ANCHO, DURACION, FPS, Video } from "./Video";

export const Root: React.FC = () => (
  <>
    {/* El episodio, en el formato de `FORMATO` en guion.py. Lo renderiza <skill>/scripts/final.py. */}
    <Composition id="ElDiff" component={Video} durationInFrames={DURACION} fps={FPS} width={ANCHO} height={ALTO} />
  </>
);
