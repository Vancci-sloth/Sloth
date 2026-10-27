// Icono3D: un ícono de Phosphor o un logo en SVG, extruido, de 1 de alto y centrado en el origen, de plástico brillante.
// `icono` es el nombre de un ícono de Phosphor (lee public/iconos/<nombre>.svg, que deja `modelos.py iconos <nombre>`)
// o la ruta de un SVG en public (`img/logo.svg`). Con `color`, todo de ese color (un ícono); sin él, cada trazo con el
// suyo (un logo), y lo que viene en degradado toma `degradado`. Cada trazo va `capa` más adelante que el anterior (0.03);
// un logo de muchas piezas que no se enciman (el zorro de MetaMask) va mejor con una capa casi nula (0.002).
import { useLoader } from "@react-three/fiber";
import React, { useMemo } from "react";
import { staticFile } from "remotion";
import * as THREE from "three";
import { SVGLoader, type SVGResult } from "three/examples/jsm/loaders/SVGLoader.js";
import { conGris } from "./comun";

type Pieza = { geo: THREE.ExtrudeGeometry; fill?: string; z: number };
const hechas = new Map<string, Pieza[]>();

/** Las piezas extruidas de un SVG: una por trazo, centradas y a 1 de alto. */
const piezasDe = (url: string, datos: SVGResult, capa: number): Pieza[] => {
  const clave = `${url}|${capa}`;
  const ya = hechas.get(clave);
  if (ya) return ya;
  const caja = new THREE.Box2();
  const crudas: { shapes: THREE.Shape[]; fill?: string }[] = [];
  for (const path of datos.paths) {
    const fill = path.userData?.style?.fill as string | undefined;
    if (fill === "none") continue;
    // El SVG mide hacia abajo: se voltea la y (al voltear, la extrusión ajusta sola el sentido de cada contorno).
    const shapes = SVGLoader.createShapes(path).map((s) => {
      const voltea = (pts: THREE.Vector2[]) => pts.map((p) => new THREE.Vector2(p.x, -p.y));
      const nueva = new THREE.Shape(voltea(s.getPoints(16)));
      nueva.holes = s.holes.map((h) => new THREE.Path(voltea(h.getPoints(16))));
      nueva.getPoints(1).forEach((p) => caja.expandByPoint(p));
      return nueva;
    });
    crudas.push({ shapes, fill });
  }
  const tam = caja.getSize(new THREE.Vector2());
  const centro = caja.getCenter(new THREE.Vector2());
  const k = 1 / Math.max(tam.x, tam.y);
  const piezas = crudas.map((c, i) => {
    const geo = new THREE.ExtrudeGeometry(c.shapes, { depth: 0.16 / k, bevelEnabled: true, bevelThickness: 0.03 / k, bevelSize: 0.02 / k, bevelSegments: 3, curveSegments: 16 });
    geo.translate(-centro.x, -centro.y, 0);
    geo.scale(k, k, k);
    geo.computeVertexNormals();
    return { geo, fill: c.fill, z: i * capa };
  });
  hechas.set(clave, piezas);
  return piezas;
};

export const Icono3D: React.FC<{ icono: string; color?: string; degradado?: string; gris?: number; capa?: number }> = ({ icono, color, degradado = "#f5a524", gris = 0, capa = 0.03 }) => {
  const url = staticFile(icono.endsWith(".svg") ? icono : `iconos/${icono}.svg`);
  const datos = useLoader(SVGLoader, url);
  const lista = piezasDe(url, datos, capa);
  const mats = useMemo(
    () =>
      lista.map((p) => {
        const propio = p.fill?.startsWith("url") ? degradado : p.fill && p.fill !== "currentColor" ? p.fill : "#d0d0d0";
        return conGris(new THREE.MeshPhysicalMaterial({ color: color ?? propio, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15 }));
      }),
    [lista, color, degradado],
  );
  mats.forEach((x) => (x.gris.value = gris));
  return (
    <group>
      {lista.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={mats[i].m} position={[0, 0, p.z]} castShadow />
      ))}
    </group>
  );
};

/** Tres íconos de Phosphor, cada uno de un color. */
export const Muestra: React.FC = () => (
  <>
    {(
      [
        ["shield-check", "#2f80ed", -1.25],
        ["user", "#22c55e", 0],
        ["warning", "#ef4444", 1.25],
      ] as const
    ).map(([icono, color, x]) => (
      <group key={icono} position={[x, 0.6, 0]}>
        <Icono3D icono={icono} color={color} />
      </group>
    ))}
  </>
);
