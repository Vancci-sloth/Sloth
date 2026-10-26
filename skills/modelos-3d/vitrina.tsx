// La vitrina de la biblioteca: la miniatura de cada modelo (su `Muestra`, quieta en su `cuadro`) con la luz de estudio
// de los videos, sobre fondo transparente (Sloth le pone detrás su foco) y con su sombra. La cámara, a tres cuartos, se
// mece de un lado a otro en un ciclo que se repite sin salto: el cuadro 0 es la foto (vista.webp) y el ciclo entero, el
// video que se ve al pasar el ratón (vista.webm). `modelos.py vista` la copia al proyecto como src/modelos/_vitrina_<pid>.tsx,
// con _muestras_<pid>.ts (una composición por modelo), saca las dos y la borra.
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { Composition, Freeze, registerRoot, useCurrentFrame } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MUESTRAS } from "./_muestras";

export const LADO = 640;
/** Cuadros de un vaivén completo de la cámara. */
export const CICLO = 120;
const MIEL = "#f5a524";
const AZIMUT = THREE.MathUtils.degToRad(28);
/** Cuánto se mece la cámara a cada lado. */
const VAIVEN = THREE.MathUtils.degToRad(24);
const ELEVACION = THREE.MathUtils.degToRad(18);
/** Cuánto del cuadro ocupa lo más ancho del modelo, en el peor punto del vaivén. */
const OCUPA = 0.9;

const direccion = (azimut: number) =>
  new THREE.Vector3(Math.sin(azimut) * Math.cos(ELEVACION), Math.sin(ELEVACION), Math.cos(azimut) * Math.cos(ELEVACION));

/** Cuánto se sale del cuadro (1 = justo al borde) lo más ancho de la caja, mirada desde `dir` a distancia `d`. */
const ancho = (cam: THREE.PerspectiveCamera, centro: THREE.Vector3, esquinas: THREE.Vector3[], dir: THREE.Vector3, d: number) => {
  cam.position.copy(centro).addScaledVector(dir, d);
  cam.lookAt(centro);
  cam.updateMatrixWorld();
  let a = 0;
  for (const e of esquinas) {
    const p = e.clone().project(cam);
    a = Math.max(a, Math.abs(p.x), Math.abs(p.y));
  }
  return a;
};

/** La cámara, la luz y la sombra, puestas sobre el modelo: a la distancia en que cabe entero en todo el vaivén. */
const Estudio: React.FC<{ modelo: React.RefObject<THREE.Group | null> }> = ({ modelo }) => {
  const f = useCurrentFrame();
  const { camera, scene, gl } = useThree();
  const entorno = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return tex;
  }, [gl]);
  const blanco = useMemo(() => new THREE.Object3D(), []);
  const luz = useRef<THREE.DirectionalLight>(null);
  const contra = useRef<THREE.DirectionalLight>(null);
  const relleno = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
    scene.environment = entorno;
    scene.environmentIntensity = 0.8;
    const g = modelo.current;
    if (!g) return;
    g.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(g, true);
    if (caja.isEmpty()) return;
    const centro = caja.getCenter(new THREE.Vector3());
    const radio = caja.getSize(new THREE.Vector3()).length() / 2;
    const esquinas = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (i) => new THREE.Vector3(i & 1 ? caja.max.x : caja.min.x, i & 2 ? caja.max.y : caja.min.y, i & 4 ? caja.max.z : caja.min.z),
    );
    const cam = camera as THREE.PerspectiveCamera;
    cam.aspect = 1;
    cam.updateProjectionMatrix();
    // La distancia a la que cabe en el peor punto del vaivén: así no se acerca ni se aleja mientras se mece.
    let d = radio / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
    for (let i = 0; i < 4; i++) {
      let peor = 0;
      for (let k = 0; k <= 8; k++) peor = Math.max(peor, ancho(cam, centro, esquinas, direccion(AZIMUT + VAIVEN * (k / 4 - 1)), d));
      d *= peor / OCUPA;
    }
    const azimut = AZIMUT + VAIVEN * Math.sin((f / CICLO) * Math.PI * 2);
    cam.position.copy(centro).addScaledVector(direccion(azimut), d);
    cam.lookAt(centro);
    cam.updateMatrixWorld();
    // La luz principal casi encima, un poco a la izquierda (su sombra cae al pie, donde se ve), un relleno frío a la
    // izquierda y el contraluz de miel detrás.
    const k = Math.max(1, radio);
    blanco.position.copy(centro);
    blanco.updateMatrixWorld();
    if (luz.current) {
      luz.current.position.set(centro.x - 2.5 * k, centro.y + 10 * k, centro.z + 3 * k);
      const s = luz.current.shadow.camera;
      s.left = s.bottom = -2.5 * k;
      s.right = s.top = 2.5 * k;
      s.far = 30 * k;
      s.updateProjectionMatrix();
    }
    relleno.current?.position.set(centro.x - 7 * k, centro.y + 2 * k, centro.z + 4 * k);
    contra.current?.position.set(centro.x - 4 * k, centro.y + 4 * k, centro.z - 7 * k);
  });
  return (
    <>
      <primitive object={blanco} />
      <directionalLight ref={luz} target={blanco} intensity={2.4} color="#fff4e6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-radius={8} />
      <directionalLight ref={relleno} target={blanco} intensity={0.6} color="#dfe8ff" />
      <directionalLight ref={contra} target={blanco} intensity={2.6} color={MIEL} />
      <hemisphereLight args={["#ffffff", "#3a3228", 0.35]} />
    </>
  );
};

/** Solo la sombra en el piso: el fondo lo pone Sloth. */
const Sombra: React.FC = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
    <planeGeometry args={[200, 200]} />
    <shadowMaterial opacity={0.42} />
  </mesh>
);

const Vitrina: React.FC<{ id: string; cuadro: number }> = ({ id, cuadro }) => {
  const Muestra = MUESTRAS[id];
  const modelo = useRef<THREE.Group>(null);
  return (
    <ThreeCanvas width={LADO} height={LADO} camera={{ fov: 30, near: 0.05, far: 400 }} gl={{ alpha: true, antialias: true }} shadows="soft">
      <Sombra />
      <group ref={modelo}>
        <Freeze frame={cuadro}>
          <Muestra />
        </Freeze>
      </group>
      <Estudio modelo={modelo} />
    </ThreeCanvas>
  );
};

const Raiz: React.FC = () => (
  <>
    {Object.keys(MUESTRAS).map((id) => (
      <Composition key={id} id={id} component={Vitrina} defaultProps={{ id, cuadro: 0 }} width={LADO} height={LADO} fps={30} durationInFrames={CICLO} />
    ))}
  </>
);

registerRoot(Raiz);
