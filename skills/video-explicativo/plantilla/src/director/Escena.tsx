// Lo que dibuja el director (guion.ts): las cosas del mundo 3D, las tarjetas 2D clavadas sobre ellas y los sonidos.
// Cada cosa entra en la palabra que la nombra con un golpe de resorte, se queda al frente mientras se habla de ella y
// después se queda atrás, gris y medio fundida (un ícono, en cambio, se va). Un modelo de la biblioteca viene de su
// tamaño: aquí se mide una vez y se lleva a `tam` metros, apoyado en el piso, para que la cámara sepa encuadrarlo.
import React, { useLayoutEffect, useRef } from "react";
import { Audio, Freeze, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import * as THREE from "three";
import { temaEn } from "../capitulos";
import { Boton } from "../escenas/comun";
import { vistaEn } from "../mundo/camara";
import { EnMundo } from "../mundo/EnMundo";
import { encuadra } from "../mundo/encuadra";
import { EnEscena } from "../modelos/comun";
import { Icono3D } from "../modelos/icono-3d";
import { Insignia } from "../piezas/diagrama";
import { esIcono, Glifo, Icono, type NombreIcono } from "../piezas/iconos";
import { Post } from "../piezas/reddit";
import { Cifra, Prueba } from "../piezas/tarjetas";
import { Contador, useColores } from "../piezas/ui";
import { FPS, LETRA, PALETA, SIGNIFICA } from "../tema";
import { en } from "../tiempo";
import { ANCHO_TARJETA, alzaDe, conTarjeta, enTramos, GUION, PASOS, saleTarjeta, SONIDOS, tamDe, tarjetaEn, tamCifra, tamImagen, tamVersus, PLANOS, TOMAS, TRAMOS_FOTO, tramosDe, VISITAS, type Paso, type Tarjeta, type Visita } from "./guion";
import { FRENTES, MODELOS, PIEZAS } from "./modelos";

/** Un color por su significado (`pierde`, `dinero`, `regla`, `protagonista`…) o en #rrggbb. */
export const colorDe = (c?: string, otro: string = SIGNIFICA.protagonista) => (c ? (SIGNIFICA as Record<string, string>)[c] ?? c : otro);

/** El nombre de Phosphor en PascalCase («ShieldCheck») como lo pide Icono3D («shield-check»). */
const kebab = (n: string) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
const icono = (n?: string) => (n && esIcono(n) ? (n as NombreIcono) : undefined);

// ——— El mundo 3D ———

const medidas = new Map<string, { k: number; off: THREE.Vector3 }>();

/**
 * Mide una copia oculta de la cosa, quieta en el cuadro 0 y con las props con que entra: así sale la misma medida en
 * cada pestaña de Chrome del render. Medida en el cuadro en que estaba cada pestaña, la olla del tamal (que hierve)
 * cambiaba de tamaño de una pestaña a otra, y parpadeaba cada pocos cuadros.
 */
const Medida: React.FC<{ clave: string; alto: number; children: React.ReactNode }> = ({ clave, alto, children }) => {
  const g = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (medidas.has(clave) || !g.current) return;
    g.current.updateWorldMatrix(true, true);
    const inversa = g.current.matrixWorld.clone().invert();
    const cajas: THREE.Box3[] = [];
    g.current.traverse((o) => {
      const malla = o as THREE.Mesh;
      if (!malla.isMesh || !malla.geometry || !malla.visible) return;
      const m = malla.material as THREE.Material | THREE.Material[];
      if (!Array.isArray(m) && m.transparent && m.opacity < 0.1) return;
      const instancias = malla as unknown as THREE.InstancedMesh;
      let local: THREE.Box3;
      if (instancias.isInstancedMesh) {
        instancias.computeBoundingBox();
        local = instancias.boundingBox!.clone();
      } else {
        if (!malla.geometry.boundingBox) malla.geometry.computeBoundingBox();
        local = malla.geometry.boundingBox!.clone();
      }
      cajas.push(local.applyMatrix4(inversa.clone().multiply(malla.matrixWorld)));
    });
    if (!cajas.length) return;
    // Alrededor de la pieza más grande: lo suelto que queda lejos (las escamas que el grano cocido tira al piso, la masa
    // al pie del metate) no cuenta. Con todo dentro, esos modelos salían chicos en medio de su caja.
    const volumen = (b: THREE.Box3) => b.getSize(new THREE.Vector3()).toArray().reduce((a, x) => a * Math.max(x, 0.01), 1);
    const nucleo = cajas.reduce((a, b) => (volumen(b) > volumen(a) ? b : a));
    const medio = nucleo.getCenter(new THREE.Vector3());
    const alcance = Math.max(...nucleo.getSize(new THREE.Vector3()).toArray());
    const caja = new THREE.Box3();
    for (const b of cajas) if (b.getCenter(new THREE.Vector3()).distanceTo(medio) <= alcance) caja.union(b);
    // Y lo que toca a lo ya dentro, hasta que no crezca: un modelo de dos partes iguales (las dos tablas del duelo de
    // cuchillos) se medía por una sola y la cámara dejaba la otra fuera del cuadro. Lo suelto y lejos sigue fuera.
    for (let creció = true; creció; ) {
      creció = false;
      for (const b of cajas)
        if (!caja.containsBox(b) && caja.distanceToPoint(b.getCenter(new THREE.Vector3())) <= alcance * 0.35) {
          caja.union(b);
          creció = true;
        }
    }
    const lado = caja.getSize(new THREE.Vector3());
    const centro = caja.getCenter(new THREE.Vector3());
    medidas.set(clave, { k: alto / Math.max(lado.x, lado.y, lado.z), off: new THREE.Vector3(-centro.x, -caja.min.y, -centro.z) });
  });
  if (medidas.has(clave)) return null;
  return (
    <Freeze frame={0}>
      <group ref={g} visible={false}>
        {children}
      </group>
    </Freeze>
  );
};

/** Lleva lo de adentro a la medida de su `Medida`: `alto` metros su lado más grande, centrado y apoyado en el piso. */
const AlTamano: React.FC<{ clave: string; children: React.ReactNode }> = ({ clave, children }) => {
  const fuera = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const m = medidas.get(clave);
    if (!m || !fuera.current) return;
    fuera.current.scale.setScalar(m.k);
    fuera.current.position.copy(m.off).multiplyScalar(m.k);
  });
  const m = medidas.get(clave);
  return (
    <group ref={fuera} scale={m ? m.k : 0.0001} position={m ? m.off.clone().multiplyScalar(m.k).toArray() : [0, 0, 0]}>
      {children}
    </group>
  );
};

/** Un valor que cambia en cada paso que lo pide, con un resorte desde el valor que tenía. */
const animado = (id: string, prop: string, inicio: number, f: number) => {
  let v = inicio;
  for (const p of PASOS) {
    if (p.cosa !== id || p.anima?.[prop] === undefined || f < p.desde) continue;
    const r = spring({ frame: f - p.desde, fps: FPS, config: { damping: 15, stiffness: 90 } });
    v = v + (p.anima[prop] - v) * r;
  }
  return v;
};

/** Una cosa en una de sus visitas: entra en su hueco, se queda al frente y luego atrás, gris (un ícono, se va). */
const EnSuHueco: React.FC<{ id: string; v: Visita; sale: number; children: (gris: number, apaga: number) => React.ReactNode }> = ({ id, v, sale, children }) => {
  const f = useCurrentFrame();
  const c = GUION.cosas[id];
  // Al frente, con su color; fuera de su tramo, gris y medio fundido. Cambia en ~8 cuadros.
  const alFrente = v.focos.reduce((m, [a, b]) => Math.max(m, interpolate(f, [a - 4, a + 4, b - 2, b + 6], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })), 0);
  // Entre la cámara y lo que se dice, se encoge hasta desaparecer (guion.ts, `tapa`): apagado, quedaba su silueta oscura.
  // Lo que está bajo una foto también se va mientras ella se ve: asomaba por sus lados y distraía (guion.ts, `TRAMOS_FOTO`).
  const tapa = Math.max(
    enTramos(tramosDe("imagen", id), f),
    (v.tapa ?? []).reduce((m, [a, b]) => Math.max(m, interpolate(f, [a - 6, a + 4, b - 2, b + 6], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })), 0),
  );
  // En su escena, lo que no se está diciendo sigue puesto y con su color, solo un poco apagado: es la escenografía.
  const deEscena = Boolean(v.escena);
  const desde = PASOS.find((p) => p.cosa === id && p.gris)?.desde;
  const desmentido = desde === undefined ? 0 : spring({ frame: f - desde, fps: FPS, config: { damping: 16, stiffness: 80 } });
  const [x, y, z] = v.p;
  const tam = tamDe(c);
  // Con una foto en pantalla, nada de detrás se mueve: se para en unos cuadros y vuelve al salir.
  const m0 = accionEn(id, v, f);
  const foto = 1 - enTramos(TRAMOS_FOTO, f, 8);
  const mueve = { alza: m0.alza * foto, inclina: m0.inclina * foto, gira: m0.gira * foto, ladea: m0.ladea * foto, ancho: 1 + (m0.ancho - 1) * foto, alto: 1 + (m0.alto - 1) * foto };
  // Un ícono es plano y lo que tiene cara (el despertador, el celular: `frente` en su modelo.json) se lee de frente: de
  // lado no se entendían la cama del café, la silla de la pierna ni el reloj. Giran lo justo para que la cámara no los
  // vea a más de 20° (el ícono) o 40° (el modelo) de su cara.
  const tope = c.icono ? 20 : c.modelo && FRENTES.has(c.modelo) ? 40 : null;
  const base = ((c.giro ?? 0) * Math.PI) / 180;
  let giro = base;
  if (tope !== null) {
    const cam = vistaEn(PLANOS, f).pos;
    const rel = Math.atan2(Math.sin(Math.atan2(cam.x - x, cam.z - z) - base), Math.cos(Math.atan2(cam.x - x, cam.z - z) - base));
    const l = (tope * Math.PI) / 180;
    giro = base + rel - Math.max(-l, Math.min(l, rel));
  }
  // Entra unos cuadros antes de su palabra: la cámara ya va hacia ella, y llegar a un hueco vacío se ve como un error.
  return (
    <>
      {alFrente > 0.01 ? <Foco p={v.p} radio={tam * 0.95} fuerza={alFrente} /> : null}
      <EnEscena ventanas={[[v.desde - 5, sale]]} pos={[x, y + alzaDe(c), z]} giro={giro}>
        <group position={[0, mueve.alza, 0]} rotation={[mueve.inclina, mueve.gira, mueve.ladea]} scale={[mueve.ancho * (1 - tapa), mueve.alto * (1 - tapa), mueve.ancho * (1 - tapa)]}>
          <AlTamano clave={id}>{children(Math.max(desmentido, deEscena ? (1 - alFrente) * 0.25 : 1 - alFrente), (1 - alFrente) * (deEscena ? 0.18 : 0.45))}</AlTamano>
        </group>
      </EnEscena>
    </>
  );
};

/**
 * La acción de una cosa en este cuadro, si el paso que la tiene al frente la pide: el golpe que se repite (aplasta y
 * rebota cada 10 cuadros), el latido, el temblor, el giro o el salto. En los videos de 3D que pegan, la cosa hace algo
 * todo el tiempo (el martillo pega cada 3 cuadros, el soldado cava) y la cámara casi no se mueve.
 */
const accionEn = (id: string, v: Visita, f: number) => {
  const quieta = { alza: 0, inclina: 0, gira: 0, ladea: 0, ancho: 1, alto: 1 };
  // La acción sigue hasta que otro momento de la misma cosa pide otra (o `quieta`): con una por momento, el protagonista
  // se paraba entre una frase y la siguiente, y el revisor a ciegas no dio más de 7 en «entretiene» a ningún video
  // («una acción que no para», como el martillo de las referencias).
  let p: (typeof PASOS)[number] | undefined;
  for (const q of PASOS) if (q.accion && q.desde <= f && q.desde >= v.desde && q.desde < v.hasta && (q.cosa ?? id) === id) p = q;
  if (p?.accion === "quieta") p = undefined;
  // Lo de más de 1.8 m es la escenografía (la mesa, el cuarto): no hace acciones. La mesa del tamal temblando movía el
  // cuadro entero y parpadeaba hasta el 34 %.
  if (!p || tamDe(GUION.cosas[id]) > 1.8) return quieta;
  const t = f - p.desde;
  // Lo grande se mueve menos: con todo el set temblando (la mesa del tamal, de 2.2 m), el cuadro entero parpadeaba.
  const entra = Math.min(1, t / 6) * Math.min(1, 1.2 / tamDe(GUION.cosas[id]));
  switch (p.accion) {
    case "golpea": {
      const fase = (t % 10) / 10;
      const aplasta = fase < 0.25 ? fase / 0.25 : Math.max(0, 1 - (fase - 0.25) / 0.45);
      return { ...quieta, ancho: 1 + 0.1 * aplasta * entra, alto: 1 - 0.16 * aplasta * entra };
    }
    case "late": {
      const l = Math.pow(Math.max(0, Math.sin((t / 30) * Math.PI * 2.4)), 6);
      return { ...quieta, ancho: 1 + 0.09 * l * entra, alto: 1 + 0.09 * l * entra };
    }
    case "tiembla":
      // Unas 5 vibraciones por segundo: con 11 cada cuadro salía en otra posición y se veía como un salto.
      return { ...quieta, ladea: Math.sin(t * 1.05) * 0.05 * entra, gira: Math.sin(t * 0.8) * 0.04 * entra };
    case "gira":
      return { ...quieta, gira: (t / 30) * Math.PI * 0.9 };
    case "salta": {
      const fase = (t % 18) / 18;
      return { ...quieta, alza: Math.sin(fase * Math.PI) * 0.35 * entra, ancho: fase < 0.08 ? 1.08 : 1, alto: fase < 0.08 ? 0.9 : 1 };
    }
  }
  return quieta;
};

/** Un círculo de luz difuminado, para el piso bajo lo que se está diciendo. */
let mancha: THREE.CanvasTexture | null = null;
const textura = () => {
  if (mancha) return mancha;
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 128;
  const g = lienzo.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.45, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  mancha = new THREE.CanvasTexture(lienzo);
  return mancha;
};

/**
 * El foco de lo que se está diciendo: un círculo de luz del color `luz` del video en el piso. Sin él, cada cosa flotaba
 * sobre un piso vacío y parejo. Sin luz de verdad encima: cada luz que entra o sale recompila los materiales de toda la
 * escena, y el render del tamal pasó de 49 a 93 s.
 */
const Foco: React.FC<{ p: [number, number, number]; radio: number; fuerza: number }> = ({ p, radio, fuerza }) => (
  <>
    <mesh position={[p[0], 0.012, p[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[radio * 2.6, radio * 2.6]} />
      <meshBasicMaterial map={textura()} color={PALETA.luz} transparent opacity={0.55 * fuerza} depthWrite={false} />
    </mesh>
  </>
);

/** La luminancia relativa de un color (WCAG). */
const luz = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/**
 * El color de un ícono, con contraste contra el fondo de su escena: la caja de `ajeno` (gris claro) sobre la escena
 * clara del iPhone casi no se veía (el usuario, 6-nov: «ojo con estos contrastes, se pierden los objetos»). Si no llega
 * a 4.5:1 (7:1 en un fondo claro: la luz del día lo aclara, y a 3:1 o 4.5:1 la caja seguía gris claro), se oscurece (o se aclara, en un fondo oscuro) hasta llegar.
 */
const conContraste = (color: string, fondo: string) => {
  const c = new THREE.Color(color);
  const f = new THREE.Color(fondo);
  const razon = (a: THREE.Color) => (Math.max(luz(a), luz(f)) + 0.05) / (Math.min(luz(a), luz(f)) + 0.05);
  const hacia = new THREE.Color(luz(f) > 0.4 ? "#262b33" : "#f2f4f7");
  const meta = luz(f) > 0.4 ? 7 : 4.5;
  for (let k = 0; k < 14 && razon(c) < meta; k++) c.lerp(hacia, 0.2);
  return `#${c.getHexString()}`;
};

const PasoCosa: React.FC<{ id: string }> = ({ id }) => {
  const f = useCurrentFrame();
  const c = GUION.cosas[id];
  const visitas = VISITAS[id];
  const fondo = temaEn(f).color("fondo");
  const props: Record<string, unknown> = { ...c.props };
  for (const p of PASOS) for (const k of Object.keys(p.cosa === id ? p.anima ?? {} : {})) props[k] = animado(id, k, Number(c.props?.[k] ?? 0), f);
  const Modelo = c.modelo ? MODELOS[c.modelo] : null;
  if (c.modelo && !Modelo) throw new Error(`Falta el modelo «${c.modelo}»: corre hacer.py, que lo trae de la biblioteca`);
  const dibuja = (gris: number, apaga: number) =>
    Modelo ? <Modelo {...props} gris={gris} apaga={apaga} fondo={fondo} /> : <Icono3D icono={kebab(c.icono!)} color={conContraste(colorDe(c.color), fondo)} gris={gris} apaga={apaga} fondo={fondo} />;
  return (
    <>
      <Medida clave={id} alto={tamDe(c)}>
        {Modelo ? <Modelo {...c.props} /> : <Icono3D icono={kebab(c.icono!)} />}
      </Medida>
      {visitas.map((v, j) => (
        // Un modelo se queda de fondo hasta que vuelve a entrar en otro hueco; un ícono se va con su tramo.
        <EnSuHueco key={j} id={id} v={v} sale={v.sale ?? (c.modelo ? (visitas[j + 1]?.desde ?? 999999) : v.hasta)}>
          {dibuja}
        </EnSuHueco>
      ))}
    </>
  );
};

/** Lo 3D del video: cada cosa en sus huecos de la fila. */
export const Cosas3D: React.FC = () => (
  <>
    {Object.keys(VISITAS).map((id) => (
      <PasoCosa key={id} id={id} />
    ))}
  </>
);

// ——— Lo 2D ———

/**
 * Una cifra que corre desde cero al entrar («600+», «$14.5 M», «31 155»): ver correr un número engancha más que verlo
 * quieto. No las de un dígito, ni un año («1781»), que corriendo no dicen nada.
 */
const cuentaDe = (valor: string) => {
  const m = valor.replace(/(\d)\s+(?=\d{3})/g, "$1").match(/^(\D*?)(\d+(?:[.,]\d+)?)(\D*)$/);
  if (!m) return null;
  const numero = Number(m[2].replace(",", "."));
  const anio = !m[1] && !m[3].trim() && numero >= 1000 && numero <= 2100 && Number.isInteger(numero);
  if (numero < 10 || anio) return null;
  return { de: 0, a: numero, prefijo: m[1], sufijo: m[3], decimales: (m[2].split(/[.,]/)[1] ?? "").length };
};

const FichaIcono: React.FC<{ nombre: string; color: string }> = ({ nombre, color }) => {
  const n = icono(nombre);
  return n ? <Icono nombre={n} color={color} tam={230} /> : null;
};

const DibujaTarjeta: React.FC<{ t: Tarjeta; p: Paso }> = ({ t, p }) => {
  const c = useColores();
  const desde = p.desde;
  switch (t.tipo) {
    case "cifra": {
      const corre = t.cuenta ? { de: t.cuenta[0], a: t.cuenta[1], prefijo: t.prefijo ?? "", sufijo: t.sufijo ?? "", decimales: 0 } : cuentaDe(t.valor);
      const valor = corre ? <Contador de={corre.de} a={corre.a} desde={desde + 2} hasta={desde + 26} prefijo={corre.prefijo} sufijo={corre.sufijo} decimales={corre.decimales} /> : t.valor;
      return <Cifra valor={valor} nota={t.nota} fuente={t.fuente} icono={icono(t.icono)} color={colorDe(t.color, c.texto)} tam={tamCifra(t)} />;
    }
    case "prueba": {
      const marca = t.subraya ? en(t.subraya) : desde + 14;
      return (
        <Prueba
          logo={t.logo}
          icono={icono(t.icono)}
          fuente={t.fuente}
          ancho={ANCHO_TARJETA}
          tam={58}
          partes={[t.antes ?? "", { t: t.frase, en: marca, subraya: true }, t.despues ?? ""]}
        />
      );
    }
    case "iconos":
      return (
        <div style={{ display: "flex", gap: 46 }}>
          {t.iconos.map((n) => (
            <FichaIcono key={n} nombre={n} color={colorDe(t.color)} />
          ))}
        </div>
      );
    case "boton":
      // El «no se puede» parpadea cuando ya entró: si parpadea mientras entra, se ve como un error.
      return (
        <Boton no={t.no ? Math.max(en(t.no), desde + 12) : undefined} tam={56}>
          {icono(t.icono) ? <Glifo nombre={icono(t.icono)!} tam={56} /> : null}
          {t.texto}
        </Boton>
      );
    case "post":
      return (
        <Post ancho={ANCHO_TARJETA} sub={t.sub} fecha={t.fecha ?? ""} votos={t.votos ? [desde + 4, desde + 40, t.votos] : undefined} comentarios={t.comentarios ? [desde + 4, desde + 40, t.comentarios] : undefined}>
          {t.titulo}
        </Post>
      );
    case "logos":
      return (
        <div style={{ display: "flex", gap: 40 }}>
          {t.logos.map((l) => (
            <Insignia key={l} logo={l} tam={140} />
          ))}
        </div>
      );
    case "versus": {
      // Dos palabras grandes, cada una en su tarjeta, y el ≠ en el color de lo que significa.
      const k = tamVersus(t);
      const lado = (texto: string) => (
        <div style={{ background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 30, boxShadow: c.sombra, padding: `${k * 0.33}px ${k * 0.5}px`, fontFamily: LETRA, fontWeight: 800, fontSize: k, color: c.texto, whiteSpace: "nowrap" }}>{texto}</div>
      );
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          {lado(t.a)}
          <span style={{ fontFamily: LETRA, fontSize: k * 1.45, fontWeight: 800, color: colorDe(t.color, c.texto) }}>≠</span>
          {lado(t.b)}
        </div>
      );
    }
    case "imagen": {
      // La foto con su marco de tarjeta: lo real (la página, el producto, el anuncio) se reconoce más que un ícono.
      const { w, h } = tamImagen(t);
      return (
        <div style={{ width: w, background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 30, boxShadow: c.sombra, padding: 12, fontFamily: LETRA, color: c.texto }}>
          <Img src={staticFile(t.src)} style={{ width: "100%", height: h, objectFit: "cover", borderRadius: 20, display: "block" }} />
          {t.pie || t.fuente ? (
            <div style={{ padding: "14px 10px 6px" }}>
              {t.pie ? <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{t.pie}</div> : null}
              {t.fuente ? <div style={{ fontSize: 26, fontWeight: 600, color: c.tenue, marginTop: 4 }}>{t.fuente}</div> : null}
            </div>
          ) : null}
        </div>
      );
    }
    case "pieza": {
      const Pieza = PIEZAS[t.nombre];
      if (!Pieza) throw new Error(`Falta la pieza «${t.nombre}» en src/piezas: corre hacer.py`);
      return <Pieza {...t.props} en={desde} hasta={saleTarjeta(p)} />;
    }
  }
};

/** La distancia de la toma en que se lee la tarjeta de un paso: ahí se ve a su tamaño de diseño. */
const distancias = new Map<number, number>();
const d0De = (p: Paso) => {
  if (!distancias.has(p.i)) {
    const t = TOMAS.find((x) => x.en >= p.desde - 8 && x.cosas.some((c) => c.n === `tarjeta${p.i}`));
    distancias.set(p.i, t ? encuadra(t).d : 6);
  }
  return distancias.get(p.i)!;
};

/** Las tarjetas de todos los pasos, cada una sobre su cosa, entrando en su palabra. */
export const Tarjetas: React.FC = () => (
  <>
    {PASOS.filter(conTarjeta).map((p) => {
      const { p: punto, origen } = tarjetaEn(p);
      return (
        <EnMundo key={p.i} p={punto} origen={origen} d0={d0De(p)} en={p.desde} sale={saleTarjeta(p)}>
          <DibujaTarjeta t={p.tarjeta!} p={p} />
        </EnMundo>
      );
    })}
  </>
);

// ——— Los sonidos ———

const ARCHIVO = { pop: "sfx/pop.wav", clic: "sfx/clic.wav", barrido: "sfx/barrido.wav" };
const VOLUMEN = { pop: 0.32, clic: 0.22, barrido: 0.16 };

/** Debajo de la voz, bajitos: el golpe de lo que entra, el clic de cada tarjeta y el barrido de la cámara. */
export const Sonidos: React.FC = () => (
  <>
    {SONIDOS.map((s, i) => (
      <Sequence key={i} from={Math.max(0, s.f - (s.s === "barrido" ? 4 : 0))} durationInFrames={45} layout="none">
        <Audio src={staticFile(ARCHIVO[s.s])} volume={VOLUMEN[s.s]} />
      </Sequence>
    ))}
  </>
);
