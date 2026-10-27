// Moneda: una moneda, medalla o sello de metal con una cara de cada lado (dos imágenes cuadradas en public, que hace
// Codex) y el canto con estrías. Se voltea, se pone gris, lleva candado, brilla o se apaga, y puede deshacerse en cubos
// del color de su cara que caen y se amontonan en el piso, o vuelan a otro punto. Mide 2 de ancho (radio 1) y va
// centrada en `e.pos`; su estado en cada cuadro lo da el guion del video.
import { useLoader } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { staticFile } from "remotion";
import * as THREE from "three";
import { azar, conGris, V3, v3 } from "./comun";
import { Icono3D } from "./icono-3d";

const R = 1;
const GROSOR = 0.15;

const useCaras = (rutas: [string, string]) => {
  const [frente, atras] = useLoader(THREE.TextureLoader, rutas.map((r) => staticFile(r)));
  for (const t of [frente, atras]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    // La tapa del cilindro pone la imagen de lado: se endereza (igual en las dos caras).
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
  }
  const estrias = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 4;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 16, 0);
    grad.addColorStop(0, "#000");
    grad.addColorStop(0.5, "#fff");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 4);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(140, 1);
    return t;
  }, []);
  return { frente, atras, estrias };
};

export type EstadoMoneda = {
  pos: V3;
  escala: number;
  /** Vuelta alrededor del eje vertical (rad). Con π se ve la cara de `atras`. */
  giro: number;
  inclina: number;
  /** 1 normal; más, se enciende del color `luz`; menos, se apaga. */
  brillo?: number;
  gris?: number;
  /** 0 → 1: el candado que se le pega (no se puede vender, no se puede usar). */
  candado?: number;
};

/**
 * Deshecha: `t` y `vuelta` en segundos desde que se rompe y desde que los cubos echan a volar hacia `destino` (un punto
 * del mundo). `queda` es la parte del área que se queda en pie, del centro hacia fuera (0.06: lo que queda de 3 dólares
 * a 18 centavos).
 */
export type Rota = { t: number; vuelta: number; destino: V3; queda?: number };

/** Los cubos de la cara: un cuadriculado de N × N dentro del círculo, cada uno con el color de su celda. */
const N = 44;
type Cubo = { x: number; y: number; r: number; color: THREE.Color };
const useCubos = (cara: THREE.Texture): Cubo[] =>
  useMemo(() => {
    const img = cara.image as HTMLImageElement;
    const c = document.createElement("canvas");
    c.width = N;
    c.height = N;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, N, N);
    const px = g.getImageData(0, 0, N, N).data;
    const cubos: Cubo[] = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N) * 2 - 1;
        const y = 1 - ((j + 0.5) / N) * 2;
        const r = Math.hypot(x, y);
        if (r > 0.99) continue;
        const k = (j * N + i) * 4;
        const color = new THREE.Color().setRGB(px[k] / 255, px[k + 1] / 255, px[k + 2] / 255, THREE.SRGBColorSpace);
        cubos.push({ x: x * R, y: y * R, r, color });
      }
    }
    return cubos;
  }, [cara]);

const GRAVEDAD = 4.2;

/**
 * La moneda deshecha: los cubos caen del borde hacia el centro y se amontonan en el piso del mundo; con `vuelta` vuelan
 * en curva al `destino`. Todo en el espacio de la moneda (`grupo` es su matriz).
 */
const Pixeles: React.FC<{ cara: THREE.Texture; rota: Rota; grupo: THREE.Matrix4 }> = ({ cara, rota, grupo }) => {
  const { t, vuelta, destino, queda = 0 } = rota;
  const cubos = useCubos(cara);
  const ref = useRef<THREE.InstancedMesh>(null);
  const lado = (2 * R) / N;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const inversa = grupo.clone().invert();
    const meta = v3(destino).applyMatrix4(inversa);
    // El piso del mundo (y = 0), en el espacio de la moneda.
    const escala = new THREE.Vector3().setFromMatrixScale(grupo).x;
    const suelo = new THREE.Vector3(0, lado * escala * 0.5, 0).applyMatrix4(inversa).y;
    const radioQueda = Math.sqrt(queda);
    cubos.forEach((c, i) => {
      m.setColorAt(i, c.color);
      const sigue = c.r < radioQueda;
      const espera = (1 - c.r) * 0.45 + azar(i, 1) * 0.12;
      const sale = new THREE.Vector3(c.x, c.y, 0).normalize();
      const v = new THREE.Vector3(sale.x * (0.6 + azar(i, 2)), 0.6 + azar(i, 3) * 1.4, (azar(i, 4) - 0.3) * 2.4);
      const piso = suelo + azar(i, 11) * lado * 2.5;
      const toca = (v.y + Math.sqrt(v.y * v.y + 4 * GRAVEDAD * Math.max(0, c.y - piso))) / (2 * GRAVEDAD);
      const s = sigue ? 0 : Math.min(Math.max(0, t - espera), toca);
      const pos = new THREE.Vector3(c.x + v.x * s * 0.7, s >= toca ? piso : c.y + v.y * s - GRAVEDAD * s * s, v.z * s * 0.5);
      let tam = 1;
      if (!sigue && vuelta > 0) {
        const p = Math.min(1, Math.max(0, (vuelta - azar(i, 5) * 0.5) / 0.5));
        const q = p * p * (3 - 2 * p);
        const desde = pos.clone();
        const control = new THREE.Vector3((desde.x + meta.x) / 2 + (azar(i, 8) - 0.5) * 2, Math.max(desde.y, meta.y) + 0.8, (desde.z + meta.z) / 2 + 0.6);
        const a = desde.clone().lerp(control, q);
        const b = control.clone().lerp(meta, q);
        pos.copy(a.lerp(b, q));
        tam = p >= 1 ? 0 : 1 - q * 0.7;
      }
      o.position.copy(pos);
      o.rotation.set(s * (azar(i, 9) - 0.5) * 9, s * (azar(i, 10) - 0.5) * 9, 0);
      o.scale.setScalar(tam);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cubos, t, vuelta, destino, queda, grupo, lado]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cubos.length]} castShadow>
      <boxGeometry args={[lado * 0.96, lado * 0.96, lado * 0.96]} />
      <meshStandardMaterial metalness={0.85} roughness={0.33} />
    </instancedMesh>
  );
};

/**
 * `frente` y `atras` son sus caras (rutas en public; sin ellas, las lisas de muestra) y `canto`, el color del canto de
 * cada lado. `luz` es el color con que se enciende (brillo > 1). Con `rota` se ve deshecha.
 */
export const Moneda: React.FC<{
  e: EstadoMoneda;
  frente?: string;
  atras?: string;
  canto?: [string, string];
  luz?: string;
  rota?: Rota;
}> = ({ e, frente: rutaFrente = "modelos/moneda/frente.png", atras: rutaAtras = "modelos/moneda/atras.png", canto = ["#d9a62e", "#d9a62e"], luz = "#f5a524", rota }) => {
  const { frente, atras, estrias } = useCaras([rutaFrente, rutaAtras]);
  const mats = useMemo(() => {
    const borde = conGris(new THREE.MeshStandardMaterial({ color: "#d9a62e", metalness: 1, roughness: 0.34, bumpMap: estrias, bumpScale: 2 }));
    const cara1 = conGris(new THREE.MeshStandardMaterial({ map: frente, metalness: 0.95, roughness: 0.3, bumpMap: frente, bumpScale: 2.5 }));
    const cara2 = conGris(new THREE.MeshStandardMaterial({ map: atras, metalness: 0.95, roughness: 0.3, bumpMap: atras, bumpScale: 2.5 }));
    return [borde, cara1, cara2];
  }, [frente, atras, estrias]);
  const gris = e.gris ?? 0;
  const brillo = e.brillo ?? 1;
  for (const { m, gris: g } of mats) {
    g.value = gris;
    m.color.setScalar(Math.min(1, brillo) * (1 - gris * 0.25));
    m.emissive.set(luz).multiplyScalar(Math.max(0, brillo - 1) * 0.35);
    m.roughness = 0.3 + gris * 0.35;
  }
  // El canto toma el color de la cara que se ve, según el giro.
  const deAtras = (1 - Math.cos(e.giro)) / 2;
  mats[0].m.color.lerpColors(new THREE.Color(canto[0]), new THREE.Color(canto[1]), deAtras).multiplyScalar(Math.min(1, brillo) * (1 - gris * 0.25));
  const grupo = new THREE.Matrix4().compose(v3(e.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(e.inclina, e.giro, 0)), new THREE.Vector3(e.escala, e.escala, e.escala));
  const deshecha = rota !== undefined && rota.t > 0;
  const candado = e.candado ?? 0;
  return (
    <group position={e.pos} rotation={[e.inclina, e.giro, 0]} scale={e.escala}>
      {!deshecha ? (
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.map((x) => x.m)} castShadow>
          <cylinderGeometry args={[R, R, GROSOR, 128, 1]} />
        </mesh>
      ) : (
        <Pixeles cara={frente} rota={rota!} grupo={grupo} />
      )}
      {candado > 0.01 ? (
        // El candado va del lado de `atras` (el que se ve cuando giro = π).
        <group position={[0.72, -0.62, -0.2]} rotation={[0, Math.PI, 0]} scale={0.62 * candado}>
          <Icono3D icono="lock-simple" color="#26262a" />
        </group>
      ) : null}
    </group>
  );
};

/** Una de frente, a tres cuartos, y detrás otra enseñando la cara de atrás. */
export const Muestra: React.FC = () => (
  <>
    <Moneda e={{ pos: [0.9, 1.05, -1.4], escala: 0.8, giro: Math.PI + 0.5, inclina: 0.06 }} />
    <Moneda e={{ pos: [-0.2, 1.05, 0], escala: 1, giro: 0.42, inclina: 0.08 }} />
  </>
);
