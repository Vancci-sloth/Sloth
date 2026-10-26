// Lo común de los modelos 3D de la biblioteca (skills/modelos-3d): el punto (V3), el azar fijo, el material que pasa a
// gris y se apaga, la curva de un viaje y la presencia en escena (entra con un resorte en sus ventanas de tiempo y sale).
// `modelos.py usar` lo copia a src/modelos/comun.tsx junto con los modelos. No se cambia desde un video: lo de un solo
// modelo va en su archivo.
import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";

/** Un punto del mundo, en metros. El piso es y = 0. */
export type V3 = [number, number, number];
export const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

export const sujeta = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const suave = Easing.bezier(0.2, 0.7, 0.2, 1);

/** Un número fijo entre 0 y 1 para cada (i, k): el mismo en cada render. */
export const azar = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Un material que puede pasarse a gris (`gris`, 0 → 1) sin cambiar de textura —lo jubilado, lo detenido— y apagarse
 * (`apaga`, 0 → 1): ya iluminado, se funde con el color `fondo`. Así queda lo que no es el foco: sin color y quieto, para
 * que no se confunda con lo que se está diciendo.
 */
export const conGris = <M extends THREE.MeshStandardMaterial>(m: M) => {
  const gris = { value: 0 };
  const apaga = { value: 0 };
  const fondo = { value: new THREE.Color("#0f0f0f") };
  m.onBeforeCompile = (s) => {
    s.uniforms.gris = gris;
    s.uniforms.apaga = apaga;
    s.uniforms.fondo = fondo;
    s.fragmentShader =
      "uniform float gris;\nuniform float apaga;\nuniform vec3 fondo;\n" +
      s.fragmentShader
        .replace(
          "#include <map_fragment>",
          "#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))) * 0.8, gris);",
        )
        .replace("#include <dithering_fragment>", "gl_FragColor.rgb = mix(gl_FragColor.rgb, fondo, apaga);\n#include <dithering_fragment>");
  };
  return { m, gris, apaga, fondo };
};

/** Un punto de una curva de `de` a `a` que sube `alto` en medio (t de 0 a 1). */
export const enCurva = (de: THREE.Vector3, a: THREE.Vector3, alto: number, t: number) => {
  const c = de.clone().lerp(a, 0.5).add(new THREE.Vector3(0, alto, 0));
  return de.clone().lerp(c, t).lerp(c.clone().lerp(a, t), t);
};

export type Ventana = [entra: number, sale: number];

/** Cuánto está en escena (0 → 1) lo que sale en estas ventanas: entra con un resorte y sale en 10 cuadros. */
export const presencia = (f: number, ventanas: Ventana[], fps = 30) => {
  let v = 0;
  for (const [entra, sale] of ventanas) {
    if (f < entra) continue;
    const p = spring({ frame: f - entra, fps, config: { damping: 12, stiffness: 150, mass: 0.7 } });
    const fuera = interpolate(f, [sale, sale + 10], [0, 1], { ...sujeta, easing: Easing.in(Easing.cubic) });
    v = Math.max(v, p * (1 - fuera));
  }
  return v;
};

/**
 * Lo que está en escena solo en sus ventanas de tiempo: crece desde su `pos` al entrar y se encoge al salir. Quieto: no
 * flota ni gira por su cuenta. Lo de adentro va en [0, 0, 0]: si va en su sitio del mundo, al entrar viaja desde el origen.
 */
export const EnEscena: React.FC<{ ventanas: Ventana[]; pos: V3; escala?: number; giro?: number; children: React.ReactNode }> = ({ ventanas, pos, escala = 1, giro = 0, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = escala * presencia(f, ventanas, fps);
  if (s <= 0.001) return null;
  return (
    <group position={pos} rotation={[0, giro, 0]} scale={s}>
      {children}
    </group>
  );
};
