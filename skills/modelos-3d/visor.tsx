// El visor 3D de la biblioteca: el modelo de verdad (su `Muestra`, con el mismo código de los videos y quieta en su
// `cuadro`) en una escena con la luz de estudio de la vitrina, que se gira, se acerca y se mueve con el ratón (o con
// el dedo) en todos los ejes. Sloth lo tiene abierto en un iframe mientras está en «Modelos 3D» y le dice qué modelo
// enseñar (`mostrar`): cambiar de modelo no vuelve a cargar el visor. Tiene montados, escondidos, hasta 16: el que se
// enseña, los que preparó el ratón y los que se ven en la rejilla (`precalentar`); con el visor quieto les compila los
// materiales y les sube las texturas, así que enseñar uno de esos es solo encuadrarlo. Va dentro del Player de Remotion para que el
// modelo tenga su cuadro (`useCurrentFrame`), con `ThreeCanvas` en vista previa. Dibuja solo cuando algo cambia
// (`frameloop="demand"`): quieto, no gasta. Abre encuadrado como su foto (vitrina.tsx) y en el ángulo que Sloth le diga,
// para que al ponerse encima del giro no salte. Doble clic: como estaba. Mayús y las flechas: lo gira 10°.
// `modelos.py visor` lo arma para toda la biblioteca con `scripts/visor.mjs` (un trozo por modelo, lo demás compartido).
//
// Mensajes. De Sloth: `mostrar` (el id, y `azimut` en grados), `girar` ([de lado, de arriba abajo]), `angosto` y
// `precalentar` (los ids que se ven en la rejilla: se montan y se preparan de fondo) y `pausa` (mientras se desplaza la
// rejilla, nada de fondo). A Sloth
// (con `visor3d: true`): `hola` cuando ya oye, `listo` (con el id) cuando el modelo ya se ve, `falta`, `toca` al primer arrastre, `tecla` con
// Esc, las flechas y Tab (la ficha las usa) y `rueda` en angosto, donde la rueda desplaza la ficha y no acerca (salvo con
// Ctrl). En `window.__visor`, lo que miden los evals: los ángulos de la cámara, su distancia y cuándo respondió.
import { Player, type PlayerRef } from "@remotion/player";
import { useFrame, useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MODELOS } from "./_visor_lista";

const MIEL = "#f5a524";
/** Como la foto (vitrina.tsx): a tres cuartos, un poco desde arriba, y cabe entero en todo su vaivén ocupando el 90 %. */
const AZIMUT = THREE.MathUtils.degToRad(28);
const VAIVEN = THREE.MathUtils.degToRad(24);
const ELEVACION = THREE.MathUtils.degToRad(18);
const OCUPA = 0.9;
/** La foto y el giro se ven en la ficha en un cuadrado del 92 % del lado más corto (Modelos3D.css): aquí, igual. */
const CUADRO = 0.92;
const FOV = 30;
const parametros = new URLSearchParams(location.search);
let angosto = parametros.get("angosto") === "1";

type Medidas = { id: string; listo: number; respondio: number; azimut: number; polar: number; distancia: number; fases: Record<string, number>; precalentados: string[] };
const medidas: Medidas = { id: "", listo: 0, respondio: 0, azimut: 0, polar: 0, distancia: 0, fases: {}, precalentados: [] };
/** Cuándo pasó cada etapa del último modelo pedido (ms desde que se pidió): para saber dónde se va el tiempo. */
const fase = (nombre: string) => (medidas.fases[nombre] = Math.round(performance.now() - (medidas.fases.desde ?? 0)));
(window as unknown as { __visor: Medidas }).__visor = medidas;
const avisar = (m: Record<string, unknown>) => window.parent !== window && window.parent.postMessage({ visor3d: true, ...m }, "*");
/** Lo que pide Sloth y aún no se aplica (el ángulo con que abre el siguiente modelo, un giro con el teclado). */
const pedidos: { azimut: number | null; girar: [number, number] | null; reencuadrar: boolean; despertar: () => void } = {
  azimut: null,
  girar: null,
  reencuadrar: false,
  despertar: () => {},
};

const direccion = (azimut: number) =>
  new THREE.Vector3(Math.sin(azimut) * Math.cos(ELEVACION), Math.sin(ELEVACION), Math.cos(azimut) * Math.cos(ELEVACION));

/** Cuánto se sale del cuadro (1 = justo al borde) lo más ancho de la caja, mirada desde `dir` a distancia `d` (vitrina.tsx). */
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

/** La cámara que se gira, la luz de estudio y el encuadre de cada modelo. */
const Estudio: React.FC<{ id: string }> = ({ id }) => {
  const { camera, gl, scene, invalidate, size } = useThree();
  const controles = useRef<OrbitControls | null>(null);
  const estado = useRef<"esperando" | "compilando" | "listo">("esperando");
  /** Cada compilación lleva su turno: si mientras tanto se pidió otro modelo, la de antes ya no enseña nada. */
  const turno = useRef(0);
  const arrastrando = useRef(false);
  const tocado = useRef(false);
  const luz = useRef<THREE.DirectionalLight>(null);
  const relleno = useRef<THREE.DirectionalLight>(null);
  const contra = useRef<THREE.DirectionalLight>(null);
  const blanco = useMemo(() => new THREE.Object3D(), []);
  const entorno = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return tex;
  }, [gl]);
  // La proyección de la foto: su cuadrado (el 92 % del lado corto) se ve igual que en la ficha.
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const lado = Math.min(size.width, size.height) * CUADRO;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (size.height / lado)));
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);
  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
    scene.environment = entorno;
    scene.environmentIntensity = 0.8;
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    gl.domElement.style.touchAction = "none";
    // En angosto, el dedo de arriba abajo desplaza la ficha (el iframe va fijo, fuera de ella: su desplazamiento no le
    // llega solo, se le pide a Sloth como la rueda); de lado, gira. Se decide con los primeros 8 px.
    let toque: { x: number; y: number; ultimo: number; modo: "" | "desplaza" | "gira" } | null = null;
    const baja = (e: PointerEvent) => {
      toque = angosto && e.pointerType === "touch" ? { x: e.clientX, y: e.clientY, ultimo: e.clientY, modo: "" } : null;
    };
    const mueve = (e: PointerEvent) => {
      if (!toque || e.pointerType !== "touch") return;
      if (!toque.modo && Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > 8)
        toque.modo = Math.abs(e.clientY - toque.y) > Math.abs(e.clientX - toque.x) ? "desplaza" : "gira";
      if (toque.modo !== "desplaza") return;
      e.stopImmediatePropagation();
      avisar({ que: "rueda", dy: toque.ultimo - e.clientY });
      toque.ultimo = e.clientY;
    };
    const suelta = () => (toque = null);
    gl.domElement.addEventListener("pointerdown", baja, { capture: true });
    addEventListener("pointermove", mueve, { capture: true });
    addEventListener("pointerup", suelta, { capture: true });
    addEventListener("pointercancel", suelta, { capture: true });
    c.addEventListener("start", () => {
      arrastrando.current = true;
      arrastrandoYa.ahora = true;
      if (!tocado.current) {
        tocado.current = true;
        avisar({ que: "toca" });
      }
    });
    c.addEventListener("end", () => {
      arrastrando.current = false;
      arrastrandoYa.ahora = false;
    });
    c.addEventListener("change", () => {
      invalidate();
      // La primera vez que la cámara se mueve por la mano de alguien, ya pintado: lo que mide el eval.
      if (arrastrando.current && !medidas.respondio) requestAnimationFrame(() => (medidas.respondio = performance.timeOrigin + performance.now()));
    });
    controles.current = c;
    const deNuevo = () => {
      estado.current = "esperando";
      invalidate();
    };
    gl.domElement.addEventListener("dblclick", deNuevo);
    // En angosto la rueda es de la ficha (desplazarla), salvo con Ctrl (o pellizcando el panel táctil).
    const rueda = (e: WheelEvent) => {
      if (!angosto || e.ctrlKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      avisar({ que: "rueda", dy: e.deltaY });
    };
    gl.domElement.addEventListener("wheel", rueda, { capture: true, passive: false });
    return () => {
      c.dispose();
      gl.domElement.removeEventListener("pointerdown", baja, { capture: true });
      removeEventListener("pointermove", mueve, { capture: true });
      removeEventListener("pointerup", suelta, { capture: true });
      removeEventListener("pointercancel", suelta, { capture: true });
      gl.domElement.removeEventListener("dblclick", deNuevo);
      gl.domElement.removeEventListener("wheel", rueda, { capture: true });
    };
  }, [camera, gl, scene, entorno, invalidate]);
  // Otro modelo: el de antes se esconde y este se encuadra (y se prepara, si aún no lo estaba).
  useEffect(() => {
    for (const [otro, g] of grupos) if (otro !== id) g.visible = false;
    estado.current = "esperando";
    turno.current++;
    tocado.current = false;
    medidas.respondio = 0;
    invalidate();
  }, [id, invalidate]);
  pedidos.despertar = invalidate;
  const cuadro = useCurrentFrame();
  useEffect(() => invalidate(), [cuadro, invalidate]);
  // Lo que el modelo cambie solo después de enseñarse (una textura que llega, una letra) se ve: unos cuadros más.
  const despues = useRef(0);
  useFrame(() => {
    if (despues.current > 0) {
      despues.current--;
      invalidate();
    }
  });
  useFrame(() => {
    const g = grupos.get(id);
    const c = controles.current;
    if (!g || !c) return;
    // El mismo modelo, pedido otra vez desde otro ángulo: se vuelve a encuadrar (ya está compilado).
    if (pedidos.reencuadrar && estado.current === "listo") {
      pedidos.reencuadrar = false;
      estado.current = "esperando";
    }
    // Aún no acaba de cargar: AlCargar despierta al visor cuando llegue.
    if (estado.current === "esperando" && !cargados.has(id)) return;
    if (estado.current === "esperando") {
      g.updateMatrixWorld(true);
      const caja = new THREE.Box3().setFromObject(g, true);
      // Aún no llega (su código o sus texturas): se vuelve a mirar en el cuadro siguiente.
      if (caja.isEmpty()) return invalidate();
      fase("armado");
      const centro = caja.getCenter(new THREE.Vector3());
      const radio = caja.getSize(new THREE.Vector3()).length() / 2;
      const esquinas = [0, 1, 2, 3, 4, 5, 6, 7].map(
        (i) => new THREE.Vector3(i & 1 ? caja.max.x : caja.min.x, i & 2 ? caja.max.y : caja.min.y, i & 4 ? caja.max.z : caja.min.z),
      );
      // La distancia de la foto: la del peor punto del vaivén, medida en el cuadrado de la foto (con su campo de 30°).
      const cam = camera as THREE.PerspectiveCamera;
      const fov = cam.fov;
      const aspecto = cam.aspect;
      cam.fov = FOV;
      cam.aspect = 1;
      cam.updateProjectionMatrix();
      let d = radio / Math.sin(THREE.MathUtils.degToRad(FOV / 2));
      for (let i = 0; i < 4; i++) {
        let peor = 0;
        for (let k = 0; k <= 8; k++) peor = Math.max(peor, ancho(cam, centro, esquinas, direccion(AZIMUT + VAIVEN * (k / 4 - 1)), d));
        d *= peor / OCUPA;
      }
      cam.fov = fov;
      cam.aspect = aspecto;
      cam.updateProjectionMatrix();
      const azimut = pedidos.azimut === null ? AZIMUT : THREE.MathUtils.degToRad(pedidos.azimut);
      pedidos.azimut = null;
      cam.position.copy(centro).addScaledVector(direccion(azimut), d);
      c.target.copy(centro);
      c.minDistance = d * 0.25;
      c.maxDistance = d * 3;
      c.update();
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
      contra.current?.position.set(centro.x - 4 * k, centro.y + 4 * k, centro.z - 7 * k);
      if (compilados.has(id)) {
        // Ya está listo (montado de fondo, doble clic, u otra vez el mismo desde otro ángulo): se encuadra y se enseña, y
        // se avisa cuando ya está pintado así.
        g.visible = true;
        estado.current = "listo";
        despues.current = 30;
        invalidate();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            medidas.id = id;
            medidas.listo = performance.timeOrigin + performance.now();
            avisar({ que: "listo", id });
          }),
        );
      } else {
        // Se enseña cuando ya está preparado (sus materiales compilados en paralelo y sus texturas subidas): hacerlo de golpe
        // al dibujarlo tardaba de 0,6 a 1,4 s y trababa también la página.
        estado.current = "compilando";
        const este = turno.current;
        preparar(gl, camera, scene, id, g).then(() => {
          if (este !== turno.current || estado.current !== "compilando") return;
          fase("compilado");
          estado.current = "esperando";
          invalidate();
        });
      }
    }
    if (pedidos.girar) {
      // Mayús y las flechas: 10° por paso, de lado o de arriba abajo.
      const offset = camera.position.clone().sub(c.target);
      const esfera = new THREE.Spherical().setFromVector3(offset);
      esfera.theta += THREE.MathUtils.degToRad(10 * pedidos.girar[0]);
      esfera.phi = THREE.MathUtils.clamp(esfera.phi + THREE.MathUtils.degToRad(10 * pedidos.girar[1]), 0.05, Math.PI - 0.05);
      camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(esfera));
      pedidos.girar = null;
    }
    // Con la inercia del arrastre, sigue dibujando hasta que se detiene; luego, nada.
    if (c.update()) invalidate();
    // El relleno va con la cámara: ningún lado queda a oscuras al darle la vuelta.
    relleno.current?.position.copy(camera.position).add(new THREE.Vector3(-1, 1, 0).applyQuaternion(camera.quaternion));
    medidas.azimut = c.getAzimuthalAngle();
    medidas.polar = c.getPolarAngle();
    medidas.distancia = c.getDistance();
  });
  // Con el visor quieto, los montados que no se ven se preparan, uno a la vez.
  useEffect(() => {
    let trabajando = false;
    const t = window.setInterval(() => {
      if (trabajando || estado.current !== "listo" || arrastrando.current || !fondoPuede()) return;
      const siguiente = [...grupos].find(([otro]) => otro !== id && cargados.has(otro) && !compilados.has(otro));
      if (!siguiente) return;
      trabajando = true;
      preparar(gl, camera, scene, siguiente[0], siguiente[1]).finally(() => (trabajando = false));
    }, 200);
    return () => clearInterval(t);
  }, [id, gl, camera, scene]);
  // Los pedidos de Sloth: girar con el teclado.
  useEffect(() => {
    const oir = (e: MessageEvent) => {
      const g = (e.data as { girar?: [number, number] })?.girar;
      if (!g) return;
      pedidos.girar = g;
      invalidate();
    };
    addEventListener("message", oir);
    return () => removeEventListener("message", oir);
  }, [invalidate]);
  return (
    <>
      <primitive object={blanco} />
      <directionalLight ref={luz} target={blanco} intensity={2.4} color="#fff4e6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-radius={8} />
      <directionalLight ref={relleno} target={blanco} intensity={0.9} color="#dfe8ff" />
      <directionalLight ref={contra} target={blanco} intensity={2.6} color={MIEL} />
      <hemisphereLight args={["#ffffff", "#3a3228", 0.45]} />
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

/** Los modelos montados (escondidos o el que se enseña), por id, y los que ya están preparados para enseñarse. */
const grupos = new Map<string, THREE.Group>();
/** Los que ya acabaron de cargar (su código, sus imágenes y lo que espere su Suspense): solo esos se preparan. */
const cargados = new Set<string>();
const compilados = new Set<string>();
/** Se monta cuando todo lo de su Suspense ya llegó. */
const AlCargar: React.FC<{ hecho: () => void }> = ({ hecho }) => {
  useEffect(() => hecho(), [hecho]);
  return null;
};
/** Cuántos se quedan montados: el que se enseña, los que preparó el ratón y los de la rejilla. */
const MONTADOS = 16;
/** Si alguien arrastra el modelo: mientras tanto no se monta nada de fondo. */
const arrastrandoYa = { ahora: false };
/**
 * Lo de fondo (montar y preparar) espera a que la página de Sloth esté quieta: preparar un modelo ocupa la tarjeta
 * gráfica medio segundo, y a la vez que se desplaza la rejilla, se notaba. Sloth avisa con `pausa` al desplazar, y la
 * primera vez se espera un momento desde que el visor carga.
 */
const quieta = { desde: performance.now() + 1500, pausa: false };
const fondoPuede = () => !quieta.pausa && performance.now() > quieta.desde;

/**
 * Deja un modelo listo para enseñarse sin trabar nada: compila sus materiales en paralelo (`compileAsync`), sube sus
 * texturas a la tarjeta gráfica (`initTexture`) y lo dibuja una vez fuera de la vista, solo él y sin recortes, para que
 * se compile lo que `compileAsync` no compila (los programas de su sombra y sus variantes): sin ese dibujo, su primera vez
 * a la vista trababa el visor de 0,5 a 1 s. Va en el lienzo de verdad, y enseguida se vuelve a dibujar como estaba. Lo que cada modelo arma en su código (sus lienzos) ya se hizo al montarlo.
 */
function preparar(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, id: string, g: THREE.Group) {
  return gl.compileAsync(g, camera, scene).then(() => {
    const suyas = new Set<THREE.Texture>();
    g.traverse((x) => {
      const m = (x as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : [])
        for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) suyas.add(v as THREE.Texture);
    });
    suyas.forEach((t) => gl.initTexture(t));
    if (grupos.get(id) !== g) return suyas.forEach((t) => t.dispose());
    texturas.set(id, suyas);
    const vistos = [...grupos.values()].map((otro) => [otro, otro.visible] as const);
    const recortes: [THREE.Object3D, boolean][] = [];
    for (const [otro] of vistos) otro.visible = otro === g;
    g.traverse((x) => (recortes.push([x, x.frustumCulled]), (x.frustumCulled = false)));
    // En el lienzo de verdad (a otro destino, three compila otras variantes) y enseguida otra vez como estaba, en la misma
    // tarea: el navegador solo enseña el último dibujo.
    gl.render(scene, camera);
    for (const [x, recorta] of recortes) x.frustumCulled = recorta;
    for (const [otro, visible] of vistos) otro.visible = visible;
    gl.render(scene, camera);
    if (grupos.get(id) === g) {
      compilados.add(id);
      medidas.precalentados.push(id);
    }
  });
}

/**
 * Las texturas de cada modelo preparado, para soltarlas de la tarjeta gráfica al quitarlo: React Three Fiber suelta sus
 * geometrías y materiales, pero no las texturas que cada modelo hace en su código, y al quitarlo ya le sacó los hijos al
 * grupo (recorrerlo entonces no encuentra nada). Si el modelo vuelve, three las sube otra vez.
 */
const texturas = new Map<string, Set<THREE.Texture>>();
const soltarTexturas = (id: string) => {
  texturas.get(id)?.forEach((t) => t.dispose());
  texturas.delete(id);
};

/** Un modelo montado, escondido hasta que Estudio lo enseña. Al quitarse, suelta sus texturas. */
const Modelo: React.FC<{ id: string }> = ({ id }) => {
  const [Muestra, setMuestra] = useState<React.FC | null>(null);
  const grupo = useRef<THREE.Group>(null);
  const avisaCargado = useCallback(() => {
    cargados.add(id);
    pedidos.despertar();
  }, [id]);
  useEffect(() => {
    let vale = true;
    MODELOS[id]?.carga().then(
      (m) => {
        if (id === pedido.id) fase("codigo");
        if (vale) setMuestra(() => m.Muestra as React.FC);
      },
      () => avisar({ que: "falta", id }),
    );
    return () => {
      vale = false;
    };
  }, [id]);
  useEffect(() => {
    const g = grupo.current;
    if (g) grupos.set(id, g);
    return () => {
      if (g && grupos.get(id) === g) grupos.delete(id);
      cargados.delete(id);
      compilados.delete(id);
      soltarTexturas(id);
    };
  }, [id]);
  return (
    <group ref={grupo} visible={false}>
      {Muestra && (
        <Suspense fallback={null}>
          <Muestra />
          <AlCargar hecho={avisaCargado} />
        </Suspense>
      )}
    </group>
  );
};

const Escena: React.FC<{ id: string; montados: string[] }> = ({ id, montados }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} frameloop="demand" camera={{ fov: FOV, near: 0.05, far: 400 }} gl={{ alpha: true, antialias: true }} shadows="soft">
      <Sombra />
      {montados.map((m) => (
        <Modelo key={m} id={m} />
      ))}
      <Estudio id={id} />
    </ThreeCanvas>
  );
};

/** El último modelo pedido (el que se enseña o se está armando). */
const pedido = { id: parametros.get("id") ?? "" };
/** Lo que Sloth pidió precalentar (lo último que se ve en la rejilla): se monta de fondo, uno a la vez, con el visor quieto. */
const porMontar: string[] = [];
/** Cuándo se usó cada montado (se enseñó, se pidió o se vio en la rejilla): sobran, se quita el que hace más que no. */
const usados = new Map<string, number>();
let reloj = 0;
const usar = (i: string) => usados.set(i, ++reloj);

/** El visor: el Player con el modelo que pide Sloth (y los montados de fondo), quieto en el cuadro de su foto. */
const Visor: React.FC = () => {
  const [id, setId] = useState(pedido.id);
  const [montados, setMontados] = useState<string[]>(pedido.id ? [pedido.id] : []);
  /** Pone `nuevo` entre los montados y, si sobran, quita el que hace más que no se usa (nunca el que se enseña). */
  const montar = (nuevo: string) => {
    usar(nuevo);
    setMontados((antes) => {
      if (antes.includes(nuevo)) return antes;
      const lista = [...antes, nuevo];
      while (lista.length > MONTADOS) {
        const fuera = lista.filter((m) => m !== pedido.id && m !== nuevo).sort((a, b) => (usados.get(a) ?? 0) - (usados.get(b) ?? 0))[0];
        lista.splice(lista.indexOf(fuera), 1);
        usados.delete(fuera);
      }
      return lista;
    });
  };
  const player = useRef<PlayerRef>(null);
  // Del tamaño del iframe, también si cambia (Sloth lo pone encima de la ficha).
  const [tam, setTam] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const cambia = () => setTam({ w: innerWidth, h: innerHeight });
    addEventListener("resize", cambia);
    return () => removeEventListener("resize", cambia);
  }, []);
  useEffect(() => {
    const oir = (e: MessageEvent) => {
      const d = e.data as { mostrar?: string; azimut?: number; angosto?: boolean; pausa?: boolean };
      if (typeof d?.angosto === "boolean") angosto = d.angosto;
      if (typeof d?.pausa === "boolean") {
        quieta.pausa = d.pausa;
        // Al volver a estar quieta, todavía un momento.
        if (!d.pausa) quieta.desde = performance.now() + 800;
      }
      if (!d?.mostrar) return;
      if (!MODELOS[d.mostrar]) return avisar({ que: "falta", id: d.mostrar });
      pedidos.azimut = typeof d.azimut === "number" ? d.azimut : null;
      // El que ya se enseña: solo se vuelve a encuadrar en el ángulo pedido. El que se está armando: el ángulo vale para
      // cuando esté. Otro: se cambia (primero el cuadro de su foto, para que no se arme en el del anterior).
      if (d.mostrar === pedido.id && medidas.id === d.mostrar) {
        pedidos.reencuadrar = true;
        pedidos.despertar();
      } else if (d.mostrar !== pedido.id) {
        pedido.id = d.mostrar;
        medidas.fases = { desde: performance.now() };
        player.current?.seekTo(MODELOS[d.mostrar].cuadro);
        montar(d.mostrar);
        setId(d.mostrar);
      }
    };
    // Precalentar: lo que se ve ahora reemplaza a la cola (lo de pantallas de antes ya no), y lo ya montado cuenta como
    // usado; se montan de uno en uno con el visor quieto (abajo).
    const precalentar = (e: MessageEvent) => {
      const ids = (e.data as { precalentar?: string[] })?.precalentar?.filter((i) => MODELOS[i]);
      if (!ids) return;
      ids.filter((i) => grupos.has(i)).forEach(usar);
      porMontar.splice(0, porMontar.length, ...ids.filter((i) => !grupos.has(i)));
    };
    addEventListener("message", oir);
    addEventListener("message", precalentar);
    // Ya oye: Sloth le manda lo que tenía guardado.
    avisar({ que: "hola" });
    return () => (removeEventListener("message", oir), removeEventListener("message", precalentar));
  }, []);
  // Monta el siguiente por precalentar cuando los montados ya están preparados (y nadie arrastra).
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!porMontar.length || arrastrandoYa.ahora || !fondoPuede() || [...grupos.keys()].some((m) => !compilados.has(m))) return;
      const siguiente = porMontar.shift()!;
      if (!grupos.has(siguiente)) montar(siguiente);
    }, 250);
    return () => clearInterval(t);
  }, []);
  // El cuadro de su foto.
  useEffect(() => {
    if (MODELOS[id]) player.current?.seekTo(MODELOS[id].cuadro);
  }, [id]);
  if (!MODELOS[id]) return null;
  return (
    <Player
      ref={player}
      component={Escena}
      inputProps={{ id, montados }}
      durationInFrames={100000}
      initialFrame={MODELOS[id].cuadro}
      compositionWidth={Math.max(1, Math.round(tam.w))}
      compositionHeight={Math.max(1, Math.round(tam.h))}
      fps={30}
      style={{ width: "100%", height: "100%" }}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
    />
  );
};

// Esc, las flechas y Tab son de la ficha de Sloth, también con el foco aquí dentro; con Mayús, las flechas giran el modelo.
addEventListener("keydown", (e) => {
  const flecha = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key] as [number, number] | undefined;
  if (e.shiftKey && flecha) {
    e.preventDefault();
    window.postMessage({ girar: flecha }, "*");
  } else if (e.key === "Tab") {
    // El foco no se queda aquí: vuelve a la ficha (y no sale a la rejilla de atrás).
    e.preventDefault();
    avisar({ que: "tecla", key: e.shiftKey ? "Shift+Tab" : "Tab" });
  } else if (e.key === "Escape" || ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.altKey && !e.ctrlKey && !e.metaKey)) avisar({ que: "tecla", key: e.key });
});

createRoot(document.getElementById("raiz")!).render(<Visor />);
