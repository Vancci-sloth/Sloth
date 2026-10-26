import React from "react";
import { Composition } from "remotion";
import { ALTO, ANCHO, FPS } from "./tema";
import { DURACION } from "./tiempo";
import { Video } from "./Video";

export const Root: React.FC = () => (
  <Composition id="Video" component={Video} durationInFrames={DURACION} fps={FPS} width={ANCHO} height={ALTO} />
);
