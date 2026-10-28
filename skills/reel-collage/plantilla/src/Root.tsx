import { Composition } from "remotion";
import { DURACION, FPS, H, W } from "./datos";
import { Reel } from "./Reel";

export const Root = () => (
  <Composition id="Reel" component={Reel} durationInFrames={DURACION} fps={FPS} width={W} height={H} />
);
