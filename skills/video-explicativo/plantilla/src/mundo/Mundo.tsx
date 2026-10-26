// El lienzo del mundo 3D, uno solo para todo el video: la cámara de los planos, la luz de estudio (un cuarto que se
// refleja en el metal, una luz principal que da sombra y un contraluz del color `PALETA.luz`), el piso con su cuadrícula y la niebla
// del color del fondo, para que el mundo se funda con él a lo lejos. El tema del capítulo repinta todo (piso, niebla,
// luces): el mundo no cambia de sitio al pasar de oscuro a claro.
//
// Lo de adentro (los actores) va como hijos. El lienzo es una raíz aparte de React: no ve los contextos de fuera, por eso
// la cámara se calcula aquí otra vez con los mismos planos.
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import React, { useLayoutEffect, useMemo } from "react";
import { useCurrentFrame } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { temaEn } from "../capitulos";
import { ALTO, ANCHO, PALETA, REJILLA } from "../tema";
import { camaraDe, CENTRO_Y, FOV, Plano, vistaEn } from "./camara";

const Rodaje: React.FC<{ planos: Plano[] }> = ({ planos }) => {
  const f = useCurrentFrame();
  const { camera, scene, gl } = useThree();
  const t = temaEn(f);
  const entorno = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return tex;
  }, [gl]);
  const niebla = useMemo(() => new THREE.Fog("#000", 10, 40), []);
  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
    const c = camaraDe(planos, f);
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.copy(c.position);
    cam.quaternion.copy(c.quaternion);
    cam.fov = c.fov;
    cam.aspect = ANCHO / ALTO;
    cam.setViewOffset(ANCHO, ALTO, 0, ALTO / 2 - CENTRO_Y, ANCHO, ALTO);
    cam.updateMatrixWorld();
    scene.environment = entorno;
    scene.environmentIntensity = 0.75 + 0.25 * t.claridad;
    // La niebla empieza un poco detrás de lo que se mira y se come el mundo a ~2.5 veces esa distancia.
    const d = c.position.distanceTo(vistaEn(planos, f).mira);
    niebla.color.set(t.color("fondo"));
    niebla.near = d * 1.05;
    niebla.far = d * 2.3 + 4;
    scene.fog = niebla;
  });
  return null;
};

/** Las luces siguen a lo que se mira, para que la sombra siempre caiga cerca y nítida. */
const Luces: React.FC<{ planos: Plano[] }> = ({ planos }) => {
  const f = useCurrentFrame();
  const t = temaEn(f);
  const mira = vistaEn(planos, f).mira;
  const blanco = useMemo(() => new THREE.Object3D(), []);
  blanco.position.copy(mira);
  blanco.updateMatrixWorld();
  const k = t.claridad;
  return (
    <>
      <primitive object={blanco} />
      <directionalLight
        position={[mira.x + 3.5, mira.y + 9, mira.z + 6]}
        target={blanco}
        intensity={2.4 - 0.6 * k}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
      <directionalLight position={[mira.x - 6, mira.y + 3, mira.z - 6]} target={blanco} intensity={2.6 - 1.8 * k} color={PALETA.luz} />
      <hemisphereLight args={["#ffffff", "#d8d8d8", 0.25 + 0.6 * k]} />
    </>
  );
};

const LADO = 240;

/** El piso: del color del fondo (sin luz, así se funde con la niebla), con la cuadrícula (si `REJILLA`) y la sombra encima. */
const Piso: React.FC = () => {
  const f = useCurrentFrame();
  const t = temaEn(f);
  const rejilla = useMemo(() => {
    const puntos: number[] = [];
    for (let i = -LADO / 2; i <= LADO / 2; i += 1) {
      puntos.push(i, 0, -LADO / 2, i, 0, LADO / 2, -LADO / 2, 0, i, LADO / 2, 0, i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));
    return g;
  }, []);
  return (
    <>
      {/* Va empujado hacia atrás (polygonOffset): si el lugar trae su propio piso a ras de este, de lejos no le gana
          por un cuadro (el parpadeo de z-fighting). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[LADO, LADO]} />
        <meshBasicMaterial color={t.color("fondo")} polygonOffset polygonOffsetFactor={4} polygonOffsetUnits={4} />
      </mesh>
      {REJILLA ? (
        <lineSegments geometry={rejilla} position={[0, 0.002, 0]}>
          <lineBasicMaterial color={t.color("rejilla")} />
        </lineSegments>
      ) : null}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <planeGeometry args={[LADO, LADO]} />
        <shadowMaterial opacity={0.5 - 0.3 * t.claridad} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
    </>
  );
};

export const Mundo: React.FC<{ planos: Plano[]; children: React.ReactNode }> = ({ planos, children }) => (
  <ThreeCanvas
    width={ANCHO}
    height={ALTO}
    style={{ position: "absolute", inset: 0 }}
    camera={{ fov: FOV, near: 0.05, far: 400 }}
    gl={{ alpha: true, antialias: true }}
    shadows="soft"
  >
    <Rodaje planos={planos} />
    <Luces planos={planos} />
    <Piso />
    {children}
  </ThreeCanvas>
);
