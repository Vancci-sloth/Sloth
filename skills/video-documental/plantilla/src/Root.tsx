import { Composition } from "remotion";
import { Edicion, datos } from "./Edicion";

export const Root = () => (
  <Composition
    id="Documental"
    component={Edicion}
    durationInFrames={Math.max(1, datos.duracion)}
    fps={datos.fps}
    width={datos.ancho}
    height={datos.alto}
  />
);
