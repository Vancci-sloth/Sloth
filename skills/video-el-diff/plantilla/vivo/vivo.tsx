// La vista en vivo: el mismo video que renderiza final.py, reproducido en el navegador con el Player de Remotion. Sloth
// la mete en su editor y la mueve con mensajes: { vivo: "ir", t } salta al segundo t, { vivo: "play" } y
// { vivo: "pausa" }. Responde { vivo: "tiempo", t, playing } cada vez que cambia el cuadro o el estado.
import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import { ALTO, ANCHO, DURACION, FPS, Video } from "../src/Video";

// staticFile() busca en public/, que se sirve junto a esta carpeta.
(window as unknown as { remotion_staticBase: string }).remotion_staticBase = new URL("../public", location.href).pathname;

function Vivo() {
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    const avisar = () => parent.postMessage({ vivo: "tiempo", t: p.getCurrentFrame() / FPS, playing: p.isPlaying() }, "*");
    const oir = (e: MessageEvent) => {
      const m = e.data;
      // Al cuadro donde ya está no hay `frameupdate`: se responde de una vez.
      if (m?.vivo === "ir") Math.round(m.t * FPS) === p.getCurrentFrame() ? avisar() : p.seekTo(Math.round(m.t * FPS));
      if (m?.vivo === "play") p.play();
      if (m?.vivo === "pausa") p.pause();
    };
    p.addEventListener("frameupdate", avisar);
    p.addEventListener("play", avisar);
    p.addEventListener("pause", avisar);
    addEventListener("message", oir);
    parent.postMessage({ vivo: "listo", duracion: DURACION / FPS }, "*");
    return () => {
      p.removeEventListener("frameupdate", avisar);
      p.removeEventListener("play", avisar);
      p.removeEventListener("pause", avisar);
      removeEventListener("message", oir);
    };
  }, []);
  return (
    <Player
      ref={ref}
      component={Video}
      durationInFrames={DURACION}
      fps={FPS}
      compositionWidth={ANCHO}
      compositionHeight={ALTO}
      clickToPlay
      style={{ width: "100%", height: "100%" }}
    />
  );
}

createRoot(document.getElementById("raiz")!).render(<Vivo />);
