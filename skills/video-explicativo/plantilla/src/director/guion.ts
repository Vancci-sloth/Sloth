// El director: de momentos.json (lo único que escribe el agente, además del guion) saca todo lo que antes se escribía a
// mano en cada video: cuándo pasa cada cosa (en la palabra que la dice), dónde vive cada cosa del mundo, las tomas de
// la cámara, los capítulos, las poses del personaje y los sonidos. Escena.tsx lo dibuja.
//
// El mundo es una fila: cada cosa nueva entra a la derecha de la anterior (unos pasos más allá, un poco más al fondo o
// más adelante) y la cámara la sigue de lado, desde delante, sin cruzar nunca por encima de nada. Lo que ya se dijo se
// queda atrás, gris y medio fundido; si se vuelve a nombrar, la cámara regresa a él. Al cierre, la cámara se aleja y se
// ve la fila entera: la historia de un vistazo.
import datos from "../datos/momentos.json";
import { cuadro, DURACION, en, indice, PALABRAS } from "../tiempo";
import type { V3 } from "../mundo/camara";
import { planosDe, type Cosa as CosaToma, type Toma } from "../mundo/encuadra";
import { ALTO, ANCHO, ZONA, type Tema } from "../tema";
import { CAJAS } from "./modelos";

/** Un objeto del mundo: un modelo de la biblioteca (`modelo`, su id) o un ícono de Phosphor extruido (`icono`). */
export type Cosa = {
  modelo?: string;
  icono?: string;
  color?: string;
  /** Lo alto (o lo ancho, lo que sea más grande) que se ve, en metros: 1.6 por omisión, 1.1 un ícono. */
  tam?: number;
  /** Sus props al entrar (las del modelo: `abierto`, `nivel`, `color`…). */
  props?: Record<string, unknown>;
  /** Cuánto gira sobre su eje, en grados (0 mira a la cámara). */
  giro?: number;
  /** Dónde va dentro de su escena, en metros desde su centro: [x, z] (x a la derecha, z hacia la cámara), o [x, z, y]. */
  en?: [number, number] | [number, number, number];
  /** Se va al acabar su momento, aunque la escena siga: lo de un chiste (el corazón de la cebolla se quedaba tapando un letrero). */
  sale?: boolean;
};

/** Lo 2D de un momento, clavado sobre su cosa (o solo, si el momento no tiene cosa). */
export type Tarjeta =
  | { tipo: "cifra"; valor: string; nota?: string; fuente?: string; icono?: string; color?: string; cuenta?: [number, number]; prefijo?: string; sufijo?: string }
  | { tipo: "prueba"; fuente: string; logo?: string; icono?: string; antes?: string; frase: string; despues?: string; subraya?: string }
  | { tipo: "iconos"; iconos: string[]; color?: string; tachados?: boolean }
  | { tipo: "boton"; texto: string; icono?: string; no?: string }
  | { tipo: "post"; sub: string; fecha?: string; titulo: string; votos?: number; comentarios?: number }
  | { tipo: "logos"; logos: string[] }
  | { tipo: "versus"; a: string; b: string; color?: string }
  /** Una foto o una captura real (en public/), con su pie y de dónde sale. `w` y `h` los pone hacer.py. */
  | { tipo: "imagen"; src: string; pie?: string; fuente?: string; w?: number; h?: number }
  | { tipo: "pieza"; nombre: string; props?: Record<string, unknown>; w: number; h: number };

export type Momento = {
  /** Las palabras de la voz que lo disparan, tal como están en guion.md. */
  palabra: string;
  /** Qué vez las dice (1 por omisión). */
  vez?: number;
  /** El id de una cosa de `cosas`: entra (o vuelve) aquí. */
  cosa?: string;
  tarjeta?: Tarjeta;
  pose?: string;
  /** Props de la cosa que cambian aquí, con un resorte: `{ "abierto": 1 }`. */
  anima?: Record<string, number>;
  /** La cosa se pone gris desde aquí (lo desmentido, lo que se acaba) y así se queda. */
  gris?: boolean;
  /** Desde aquí, el otro fondo. */
  tema?: Tema;
  /** La cámara: `cerca` (al detalle) o `lejos` (con aire). */
  plano?: "cerca" | "lejos";
  /** Lo que la cosa hace una y otra vez mientras se habla de ella: el martillo que pega, el corazón que late. */
  accion?: Accion;
  /** El valor del contador desde aquí (corre desde el que tenía). */
  cuenta?: number;
  /** La escena donde pasa desde aquí (un id de `escenas`): se queda la misma hasta que otro momento pida otra. */
  escena?: string;
  /** Cómo se filma este momento (CINE.md): el plano, el ángulo, la lente y el movimiento. */
  camara?: Camara;
};

/** El plano de un momento, como en cine. Sin `camara`, el director elige uno distinto en cada momento. */
export type Camara = {
  /** `general` (la escena entera), `medio` (la cosa y su tarjeta), `primer` (la cosa llena el cuadro), `detalle` (una parte). */
  plano?: "general" | "medio" | "primer" | "detalle";
  /** `frente`, `tres-cuartos`, `lado`, `picado` (desde arriba), `contrapicado` (desde abajo), `cenital` (encima). */
  angulo?: "frente" | "tres-cuartos" | "lado" | "picado" | "contrapicado" | "cenital";
  /** `angular` (24 mm: mucha profundidad, exagera), `normal` (50 mm), `tele` (135 mm: aplana, aísla). */
  lente?: "angular" | "normal" | "tele";
  /** Lo que hace mientras sostiene el plano: `fijo`, `dolly` (se acerca), `alejar`, `orbita`, `grua` (sube), `travelling`. */
  movimiento?: "fijo" | "dolly" | "alejar" | "orbita" | "grua" | "travelling";
  /** Corte seco en vez de viajar hasta el plano nuevo. */
  corte?: boolean;
};

/** Una escena: un lugar con su luz. Sus cosas se quedan puestas mientras dura, y se va armando. */
export type EscenaConf = { luz?: Luz; fondo?: string };
export type Luz = "estudio" | "dia" | "atardecer" | "noche" | "vela" | "neon";

export type Accion = "golpea" | "late" | "tiembla" | "gira" | "salta" | "quieta";

/** El contador vivo: un número que corre con la historia, bajo el texto («GOLPES 99», la población que baja). */
export type ContadorVivo = { nota: string; color?: string; prefijo?: string; sufijo?: string; decimales?: number };

export type Guion = {
  paleta?: { oscuro?: string; claro?: string; luz?: string };
  rejilla?: boolean;
  tema?: Tema;
  cosas: Record<string, Cosa>;
  momentos: Momento[];
  contador?: ContadorVivo;
  /** Los lugares del video (`{ "cocina": { "luz": "vela" } }`), para los momentos con `escena`. */
  escenas?: Record<string, EscenaConf>;
  /** El titular del gancho, si no es la primera frase de la voz: de dos a cinco palabras. */
  titular?: string;
  /** Las primeras palabras de la frase de cierre de la marca (lo pone hacer.py). */
  cierre?: string;
};

export const GUION = datos as unknown as Guion;

/** Las poses con que el personaje remata un chiste o un dato que pega: entran con más golpe, y la cámara se acerca. */
export const REMATES = new Set(["ladra", "lentes", "susto", "tapa"]);

/** Con contador vivo, lo que se explica empieza debajo de él. */
const CON_CONTADOR = Boolean(GUION.contador && GUION.momentos.some((m) => m.cuenta !== undefined));
const ZONA_CONTADOR = ZONA.escena.arriba + 175;

/** Un momento ya en cuadros: desde cuándo y hasta cuándo manda. */
/** `esquina`: el personaje se va chico a su esquina y deja el cuadro a la cosa. */
export type Paso = Momento & { i: number; desde: number; hasta: number; esquina: boolean };

const CIERRE = GUION.cierre ? en(GUION.cierre) : null;
const FIN = CIERRE ?? DURACION;
// Lo que cae en el cierre no es un momento: el cierre lo arma el director. Un momento en «sígueme en Instagram» (el del
// microondas) terminaba antes de empezar y tumbaba el render.
const ordenados = GUION.momentos
  .map((m) => ({ ...m, desde: en(m.palabra, m.vez ?? 1) }))
  .sort((a, b) => a.desde - b.desde)
  .filter((m, i) => i === 0 || m.desde < FIN);
// El primero arranca el video: el cuadro cero ya enseña algo (es la portada).
if (ordenados.length) ordenados[0].desde = 0;

// Un primer plano o un detalle no enseña tarjeta. Si el momento trae una, la tarjeta gana y el plano pasa a medio: en el
// tamal, el rodillo de «la de pintar paredes» y el candado de «bajo llave» se perdían sin aviso.
const cierra = (m: Momento) => Boolean(m.tarjeta) && (m.camara?.plano === "primer" || m.camara?.plano === "detalle");
// Lo alto y delgado (un celular, una botella) en un plano medio: con el personaje en su sitio, la cosa y su tarjeta
// cabían en la franja de arriba, una sobre otra, y el celular del gancho quedaba diminuto, parado en su cabeza.
const alta = (id?: string) => {
  const caja = id && GUION.cosas[id]?.modelo ? CAJAS[GUION.cosas[id].modelo!] : undefined;
  return Boolean(caja && caja[1] >= 1.5 * Math.max(caja[0], caja[2]));
};
export const PASOS: Paso[] = ordenados.map((m, i) => ({
  ...m,
  ...(cierra(m) ? { camara: { ...m.camara, plano: "medio" as const } } : {}),
  // También con una tarjeta sobre un modelo: el perro en su sitio tapaba lo que la tarjeta explica (la tabla de la cebolla
  // quedaba «un punto detrás del perro», dijo el revisor a ciegas).
  esquina: m.camara?.plano === "primer" || m.camara?.plano === "detalle" || ((m.camara?.plano ?? "medio") === "medio" && (alta(m.cosa) || (Boolean(m.tarjeta) && Boolean(m.cosa && GUION.cosas[m.cosa]?.modelo)))),
  i,
  hasta: ordenados[i + 1]?.desde ?? FIN,
}));

const ICONO = 1.1;
const MODELO = 1.6;
export const tamDe = (c: Cosa) => c.tam ?? (c.icono ? ICONO : MODELO);
/**
 * El radio con que la cámara encuadra una cosa: algo más de la mitad de su lado, por lo ancho de un metate o una tina.
 * Con su caja (modelos.ts), lo alto y delgado se encuadra por su silueta: en vertical cabe 16/9 más alto que ancho, y
 * con la esfera el celular quedaba en un tercio del cuadro, con su mensaje ilegible, aun en primer plano.
 */
export const radioDe = (c: Cosa) => {
  const caja = c.modelo ? CAJAS[c.modelo] : undefined;
  if (!caja) return tamDe(c) * 0.62;
  const [x, y, z] = caja;
  const lado = Math.max(x, y, z);
  return tamDe(c) * 0.62 * Math.min(1, Math.max(Math.max(x, z) / lado, (y / lado) * (ANCHO / ALTO)));
};
/** Los íconos flotan un poco sobre el piso, con su sombra debajo. */
export const alzaDe = (c: Cosa) => (c.icono ? 0.35 : 0);

/**
 * Dónde vive cada cosa: en el orden en que entra, una fila hacia la derecha. Cada visita es un hueco nuevo: si el guion
 * vuelve al protagonista, entra otra vez al frente de la fila, junto a lo último que se dijo. Cuando volvía a su hueco
 * viejo, la cámara cruzaba volando la fila entera (35 m en el del tamal) y lo que dejaba atrás pasaba un solo cuadro por
 * la pantalla: parpadeos de hasta el 13 % y cuadros vacíos a medio viaje.
 */
/** `tapa`: los tramos en que estorba entre la cámara y lo que se dice; ahí se quita. */
export type Visita = { desde: number; hasta: number; p: V3; focos: [number, number][]; escena?: string; sale?: number; tapa?: [number, number][] };
export const VISITAS: Record<string, Visita[]> = {};
const huecos: V3[] = [];
const hueco = () => {
  const k = huecos.length;
  const p: V3 = [k * 4.4, 0, k % 2 ? -2.2 : 0];
  huecos.push(p);
  return p;
};
/**
 * La escena de cada paso: la que pide, o la del anterior. Una escena es un lugar: su centro es un hueco de la fila (a 14 m
 * del siguiente, para que no se vean entre sí), sus cosas van donde dice su `en` (o alrededor del centro, en el orden en
 * que entran) y se quedan puestas, con su luz, mientras dura: la escena se arma, como la trinchera que se va cavando.
 */
export const ESCENA_DE: (string | null)[] = [];
{
  let actual: string | null = null;
  for (const p of PASOS) {
    if (p.escena) actual = p.escena;
    ESCENA_DE.push(actual);
  }
}
/** Dónde empieza y acaba cada escena (desde su primer paso hasta el que trae otra). */
export const TRAMOS_ESCENA: { escena: string; desde: number; hasta: number; centro: V3 }[] = [];
const ALREDEDOR: [number, number][] = [[0, 0], [-1.8, 0.2], [1.8, 0.2], [0, -1.9], [-2.6, -1.6], [2.6, -1.6], [-1.2, 1.4], [1.2, 1.4]];
const enEscena: Record<string, number> = {};
/** El hueco de cada paso: el de su cosa en esa visita, o el suyo si solo trae tarjeta. */
const LUGAR: Record<number, V3> = {};
{
  let actual: string | null = null;
  for (const p of PASOS) {
    const esc = ESCENA_DE[p.i];
    const tramo = TRAMOS_ESCENA.at(-1);
    if (esc && (!tramo || tramo.escena !== esc)) {
      // Una escena nueva, en un hueco libre y lejos del anterior: se llega con un corte, no viajando.
      hueco();
      TRAMOS_ESCENA.push({ escena: esc, desde: p.desde, hasta: p.hasta, centro: hueco() });
      hueco();
    }
    if (esc) TRAMOS_ESCENA.at(-1)!.hasta = p.hasta;
    if (p.cosa) {
      if (!GUION.cosas[p.cosa]) throw new Error(`momentos.json: el momento «${p.palabra}» pide la cosa «${p.cosa}», que no está en "cosas"`);
      const visitas = (VISITAS[p.cosa] ??= []);
      const ultima = visitas.at(-1);
      if (esc && ultima?.escena === esc && ultima.desde >= TRAMOS_ESCENA.at(-1)!.desde) {
        // En su escena, vuelve a su sitio: la escena no se mueve.
        ultima.hasta = p.hasta;
        ultima.focos.push([p.desde, p.hasta]);
      } else if (esc) {
        const tramo = TRAMOS_ESCENA.at(-1)!;
        const c = tramo.centro;
        const k = (enEscena[esc] = (enEscena[esc] ?? -1) + 1);
        // Un sitio ya ocupado en la escena (el agente puso la pierna, el celular y el estetoscopio en [0, 0]: se metían uno
        // en otro) pasa al siguiente libre de ALREDEDOR.
        const r = radioDe(GUION.cosas[p.cosa]);
        const ocupado = (o: number[]) =>
          Object.entries(VISITAS).some(([otro, vs]) => otro !== p.cosa && vs.some((v) => v.escena === esc && v.desde >= tramo.desde && Math.hypot(v.p[0] - c[0] - o[0], v.p[2] - c[2] - o[1]) < (r + radioDe(GUION.cosas[otro])) * 0.9));
        let o: number[] = GUION.cosas[p.cosa].en ?? ALREDEDOR[k % ALREDEDOR.length];
        for (let j = 0; ocupado(o) && j < ALREDEDOR.length * 2; j++) o = ALREDEDOR[(k + j) % ALREDEDOR.length].map((x) => x * (j < ALREDEDOR.length ? 1 : 1.6));
        visitas.push({ desde: p.desde, hasta: p.hasta, p: [c[0] + o[0], o[2] ?? 0, c[2] + o[1]], focos: [[p.desde, p.hasta]], escena: esc });
      } else if (p.cosa !== actual) visitas.push({ desde: p.desde, hasta: p.hasta, p: hueco(), focos: [[p.desde, p.hasta]] });
      else {
        visitas.at(-1)!.hasta = p.hasta;
        visitas.at(-1)!.focos.at(-1)![1] = p.hasta;
      }
      actual = p.cosa;
      LUGAR[p.i] = visitas.at(-1)!.p;
    } else if (actual) {
      // Un paso sin cosa (una pose, una tarjeta sobre la misma) deja al frente la que estaba.
      const v = VISITAS[actual].at(-1)!;
      v.hasta = p.hasta;
      v.focos.at(-1)![1] = p.hasta;
      if (p.tarjeta) LUGAR[p.i] = v.p;
    }
    if (p.tarjeta && !LUGAR[p.i]) LUGAR[p.i] = hueco();
  }
  // Lo de una escena se queda puesto hasta que la escena acaba.
  for (const vs of Object.values(VISITAS))
    for (const v of vs) if (v.escena) v.sale = TRAMOS_ESCENA.find((t) => t.escena === v.escena && v.desde >= t.desde && v.desde < t.hasta)?.hasta;
  for (const [id, vs] of Object.entries(VISITAS)) if (GUION.cosas[id].sale) for (const v of vs) v.sale = v.hasta + 8;
}
/** La cosa que tiene al frente un paso: la suya o, si no trae, la del paso anterior que sí. */
const cosaDe = (p: Paso) => {
  for (let k = p.i; k >= 0; k--) if (PASOS[k].cosa) return PASOS[k].cosa!;
  return null;
};
/** Si la tarjeta de un paso va sobre una cosa (y cuál) o sola en su hueco. */
const sobreDe = (p: Paso) => {
  const id = cosaDe(p);
  return id && VISITAS[id].some((v) => v.p === LUGAR[p.i]) ? id : null;
};

/** El centro de una cosa en un hueco (para la cámara y para poner su tarjeta encima). */
export const centroDe = (id: string, [x, y, z]: V3): V3 => {
  const c = GUION.cosas[id];
  return [x, y + alzaDe(c) + tamDe(c) / 2, z];
};

/**
 * Lo más ancho que puede ser una tarjeta (px): la zona útil, 900 en vertical, menos el margen del encuadre. Una más
 * ancha nunca cabía, y la cámara se iba hasta el fondo a buscarla: en el de la caja que cura el cáncer, «$500 mil» y
 * «Prometer ≠ Demostrar» salían diminutos.
 */
export const ANCHO_TARJETA = Math.min(820, ZONA.escena.derecha - ZONA.escena.izquierda - 80);
/** El tamaño de la cifra: 150 px, o menos si no cabe. */
export const tamCifra = (t: Extract<Tarjeta, { tipo: "cifra" }>) =>
  Math.min(150, ANCHO_TARJETA / (t.valor.length * 0.62 + (t.icono ? 1 : 0) + 0.94), ANCHO_TARJETA / Math.max(1, (t.nota?.length ?? 0) * 0.165 + 0.94));
/** La letra del versus: 66 px, o menos si no cabe. */
export const tamVersus = (t: Extract<Tarjeta, { tipo: "versus" }>) => Math.min(66, ANCHO_TARJETA / ((t.a.length + t.b.length) * 0.56 + 3.6));

/**
 * Lo que mide la foto de una tarjeta `imagen`: la que dejó hacer.py, o menos si con su pie no cabe en la zona útil (con
 * contador, la zona empieza más abajo y la foto del metate quedaba encima del número).
 */
export const tamImagen = (t: Extract<Tarjeta, { tipo: "imagen" }>) => {
  const w = t.w ?? ANCHO_TARJETA;
  const h = t.h ?? 500;
  const cabe = ZONA.escena.abajo - 70 - (CON_CONTADOR ? ZONA_CONTADOR : ZONA.escena.arriba + 30) - 60 - (t.pie || t.fuente ? 96 : 0) - 24;
  const k = Math.min(1, cabe / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
};

/** Lo que mide una tarjeta en la pantalla, a su tamaño de diseño (px): para encuadrarla. */
export const cajaDe = (t: Tarjeta): { w: number; h: number } => {
  switch (t.tipo) {
    case "cifra": {
      const k = tamCifra(t);
      return { w: Math.max(k * 0.62 * t.valor.length, (t.nota?.length ?? 0) * k * 0.165) + (t.icono ? k : 0) + k * 0.94, h: k * 1.5 + (t.nota ? k * 0.36 : 0) + (t.fuente ? k * 0.26 : 0) };
    }
    case "prueba": {
      const letras = (t.antes?.length ?? 0) + t.frase.length + (t.despues?.length ?? 0);
      return { w: ANCHO_TARJETA, h: 150 + Math.ceil(letras / 23) * 73 };
    }
    case "iconos":
      return { w: Math.min(ANCHO_TARJETA, t.iconos.length * 276), h: 260 };
    case "boton":
      return { w: Math.min(ANCHO_TARJETA, 160 + t.texto.length * 31), h: 126 };
    case "post":
      return { w: ANCHO_TARJETA, h: 230 + Math.ceil(t.titulo.length / 28) * 58 };
    case "logos":
      return { w: Math.min(ANCHO_TARJETA, t.logos.length * 180), h: 160 };
    case "versus": {
      const k = tamVersus(t);
      return { w: (t.a.length + t.b.length) * k * 0.56 + k * 3.6, h: k * 1.9 };
    }
    case "imagen": {
      const { w, h } = tamImagen(t);
      return { w, h: h + (t.pie || t.fuente ? 96 : 0) + 24 };
    }
    case "pieza":
      return { w: Math.min(ANCHO_TARJETA, t.w), h: t.h };
  }
};

/** Dónde se clava la tarjeta de un paso: sobre la cosa que está al frente, o sola en su hueco. */
export const tarjetaEn = (p: Paso): { p: V3; origen: [number, number] } => {
  const id = sobreDe(p);
  const [x, y, z] = LUGAR[p.i];
  if (id) {
    const c = GUION.cosas[id];
    return { p: [x, y + alzaDe(c) + tamDe(c) + 0.12, z], origen: [0.5, 1] };
  }
  return { p: [x, 1.3, z], origen: [0.5, 0.5] };
};

/** Lo que tiene que verse en la toma de un paso. */
const cosasDe = (p: Paso): CosaToma[] => {
  const fuera: CosaToma[] = [];
  const id = p.cosa ?? (p.tarjeta ? sobreDe(p) : null);
  // Con una foto, la cámara la encuadra sola: con su cosa debajo, la foto y la cosa quedaban chicas (el tamal del gancho
  // salía diminuto bajo su foto).
  if (id && p.tarjeta?.tipo !== "imagen") fuera.push({ n: id, p: centroDe(id, LUGAR[p.i]), r: radioDe(GUION.cosas[id]) });
  if (p.tarjeta) {
    const { p: punto, origen } = tarjetaEn(p);
    fuera.push({ n: `tarjeta${p.i}`, p: punto, caja: { ...cajaDe(p.tarjeta), origen } });
  }
  return fuera;
};

// Desde dónde mira cada toma: cambia de lado, de altura y de distancia en cada una, para que nunca se quede quieta.
const AZ = [26, -24, 34, -30, 16, -36, 22, -18];
// Una de cada tantas, desde muy arriba (48°) o casi a ras del piso (4°): con alturas parecidas, el medio se sentía igual.
const EL = [12, 24, 8, 48, 16, 4, 30, 14];
// Con 0.95–1.08 se encimaba con el perro (el metate y la tina del tamal); con 1.1–1.22 quedaba chico.
const LEJOS = [1.05, 1.12, 1.02, 1.15, 1.08, 1.04];
// Una toma que dura más que esto se parte en dos: con 4 s, el de estafas quedó 35 % quieto (medir.py pide 25 %).
const LARGA = 75;
// Cuánto rodea lo que mira mientras sostiene la toma, un lado y otro: con los 22° del motor seguía quieto.
const DERIVA_TOMA = 40;


/** El contador en cada cuadro: el valor al que va y desde cuándo (los pasos con `cuenta`). */
export const CUENTAS: { desde: number; valor: number }[] = CON_CONTADOR
  ? PASOS.filter((p) => p.cuenta !== undefined).map((p) => ({ desde: p.desde, valor: p.cuenta! }))
  : [];

const tomas: Toma[] = [];
const toma = (n: string, enCuadro: number, cosas: CosaToma[], extra: Partial<Toma> = {}) => {
  const k = tomas.length;
  tomas.push({ n, en: enCuadro, az: AZ[k % AZ.length], el: EL[k % EL.length], lejos: LEJOS[k % LEJOS.length], deriva: k % 2 ? -DERIVA_TOMA : DERIVA_TOMA, cosas, ...(CON_CONTADOR ? { arriba: ZONA_CONTADOR } : {}), ...extra });
};
/** Lo que está puesto en la escena de un paso en ese momento: para el plano general. */
const puestasEn = (p: Paso): CosaToma[] => {
  const esc = ESCENA_DE[p.i];
  if (!esc) return [];
  const fuera: CosaToma[] = [];
  for (const [id, vs] of Object.entries(VISITAS))
    for (const v of vs) if (v.escena === esc && v.desde <= p.desde && (v.sale ?? v.hasta) > p.desde) fuera.push({ n: id, p: centroDe(id, v.p), r: radioDe(GUION.cosas[id]) });
  return fuera;
};

const ANGULO = { frente: { az: 0, el: 8 }, "tres-cuartos": { az: 38, el: 18 }, lado: { az: 78, el: 10 }, picado: { az: 20, el: 48 }, contrapicado: { az: 18, el: 3 }, cenital: { az: 0, el: 80 } };
const LENTE = { angular: 52, normal: 32, tele: 16 };
// `fijo` respira: quieto del todo, el de los dedos (8 de 15 momentos en `fijo`) quedó 34 % quieto.
const MOVIMIENTO: Record<NonNullable<Camara["movimiento"]>, { deriva: number; empuja: number; grua?: number }> = { fijo: { deriva: 10, empuja: 0.06 }, dolly: { deriva: 0, empuja: 0.28 }, alejar: { deriva: 0, empuja: -0.3 }, orbita: { deriva: 70, empuja: 0 }, grua: { deriva: 8, empuja: 0.05, grua: 22 }, travelling: { deriva: 28, empuja: 0 } };

/** La toma de un paso con `camara`: qué enseña según el plano, desde dónde, con qué lente y qué hace. */
const conCamara = (p: Paso, cosas: CosaToma[], k: number): { cosas: CosaToma[]; extra: Partial<Toma> } => {
  const c = p.camara!;
  let cuales = cosas;
  let lejos = 1.05;
  if (c.plano === "general") {
    // Todo lo puesto en la escena, y la tarjeta del paso si la trae: sin ella, la foto del gancho del tamal quedaba
    // flotando arriba, encima del titular.
    const todas = puestasEn(p);
    if (todas.length) cuales = [...todas, ...cosas.filter((x) => x.caja)];
    lejos = 1.12;
  } else if (c.plano === "primer" || c.plano === "detalle") {
    // La cosa llena el cuadro (o una parte de ella), sin su tarjeta (que no sale en estos planos): con la tarjeta dentro,
    // la tarjeta del NIP llenaba el «detalle» y el candado quedaba diminuto.
    // La del paso (o la que tiene al frente), aunque el paso traiga una foto: con foto, las cosas de la toma eran solo la
    // tarjeta, y como aquí no sale, la cámara apuntaba a una tarjeta invisible (el «no es Bienestar» salió vacío).
    const id = p.cosa ?? cosaDe(p);
    const cosa = id ? { n: id, p: centroDe(id, LUGAR[p.i] ?? VISITAS[id].at(-1)!.p), r: radioDe(GUION.cosas[id]) } : cosas.find((x) => x.r !== undefined);
    if (cosa?.r) {
      // Con 0.8 del radio y 0.9 de distancia, el grano y la olla del tamal se metían detrás del perro.
      // El detalle mira la cara de la cosa, apenas arriba del centro: con +0.35 del radio enseñaba lo alto, bien para la
      // boca de la olla del tamal pero no para el microondas (segundos de su techo blanco). Lo de arriba se ve con `picado`.
      cuales = [c.plano === "detalle" ? { ...cosa, p: [cosa.p[0], cosa.p[1] + cosa.r * 0.1, cosa.p[2]] as V3, r: cosa.r * 0.55 } : { ...cosa, r: cosa.r * 0.92 }];
      lejos = 1;
    }
  }
  const lado = k % 2 ? -1 : 1;
  const a = c.angulo ? ANGULO[c.angulo] : null;
  const m = c.movimiento ? MOVIMIENTO[c.movimiento] : null;
  return {
    cosas: cuales,
    extra: {
      lejos,
      ...(a ? { az: a.az * lado, el: a.el } : {}),
      ...(c.lente ? { fov: LENTE[c.lente] } : {}),
      ...(m ? { deriva: m.deriva * lado, empuja: m.empuja, grua: m.grua } : {}),
      ...(c.corte ? { dura: 1 } : {}),
      ...(p.esquina ? { abajo: ZONA.escena.abajo + 260 } : {}),
    },
  };
};

let ultimas: CosaToma[] = [];
for (const p of PASOS) {
  const cosas = cosasDe(p);
  if (cosas.length) ultimas = cosas;
  if (!ultimas.length) continue;
  // Entrar a una escena nueva es un corte: viajar 14 m de una a otra se ve como un error.
  const nueva = p.i > 0 && ESCENA_DE[p.i] && ESCENA_DE[p.i] !== ESCENA_DE[p.i - 1];
  if (p.camara || nueva) {
    const { cosas: cuales, extra } = p.camara ? conCamara(p, ultimas, tomas.length) : { cosas: ultimas, extra: {} };
    toma(`c${p.i}`, Math.max(0, p.i === 0 ? 0 : p.desde - (extra.dura === 1 || nueva ? 0 : 6)), cuales, { dura: nueva ? 1 : 22, ...extra });
    // Un plano largo, con su movimiento, no se parte: el movimiento ya lo sostiene. `fijo` sí: la tarjeta del estudio
    // del sueño se quedó 2.8 s quieta.
    if (!p.camara?.movimiento || p.camara.movimiento === "fijo") for (let f = p.desde + LARGA; f < p.hasta - 30; f += LARGA) toma(`c${p.i}+`, f, cuales, { dura: 36, ...extra, ...(extra.dura === 1 ? { dura: 36 } : {}) });
    continue;
  }
  // Un remate (su pose lo dice) llega de golpe y un poco más cerca, como el corte a la cara en un video de humor; con
  // 0.9, lo que tira piezas alrededor (las escamas del grano cocido) tapaba al perro.
  const remate = p.pose && REMATES.has(p.pose) && !p.plano;
  const lejos = p.plano === "cerca" ? 0.92 : remate ? 0.98 : p.plano === "lejos" ? 1.45 : undefined;
  const abajo = p.esquina ? { abajo: ZONA.escena.abajo + 260 } : {};
  if (p.i === 0) {
    // El gancho: el primer cuadro ya de cerca, y la cámara se abre de golpe.
    toma("gancho", 0, ultimas, { dura: 1, lejos: 0.86, az: -14, el: 6, ...abajo });
    toma("gancho2", 3, ultimas, { dura: 26, lejos: lejos ?? 1.1, ...abajo });
  } else toma(`m${p.i}`, Math.max(1, p.desde - 6), ultimas, { dura: remate ? 16 : 22, ...(lejos ? { lejos } : {}), ...abajo });
  for (let f = p.desde + LARGA; f < p.hasta - 30; f += LARGA) toma(`m${p.i}+`, f, ultimas, { dura: 36, ...abajo });
}
// El cierre: se aleja y enseña la fila entera, mirándola de punta para que quepa a lo alto.
const quedan = Object.keys(VISITAS).filter((id) => GUION.cosas[id].modelo);
if (CIERRE !== null && (quedan.length || ultimas.length)) {
  const todas = quedan.length ? quedan.map((id) => ({ n: id, p: centroDe(id, VISITAS[id].at(-1)!.p), r: radioDe(GUION.cosas[id]) })) : ultimas;
  toma("cierre", CIERRE - 8, todas, { dura: 40, az: 62, el: 26, lejos: 1.15, deriva: -10 });
}
if (!tomas.length) toma("vacio", 0, [{ n: "centro", p: [0, 1, 0], r: 1 }]);

// Lo que queda entre la cámara y la cosa de un paso se quita mientras dura: en una escena con siete cosas, el banco del
// Buen Fin tapaba la laptop de «escribe tú la dirección».
for (const p of PASOS) {
  const id = p.cosa ?? cosaDe(p);
  const t = tomas.find((x) => x.n === `c${p.i}` || x.n === `m${p.i}`) ?? (p.i === 0 ? tomas.find((x) => x.n === "gancho2") : undefined);
  const donde = LUGAR[p.i] ?? (id ? VISITAS[id]?.at(-1)?.p : undefined);
  if (!id || !t || !donde) continue;
  const a = (t.az * Math.PI) / 180;
  const e = (t.el * Math.PI) / 180;
  const dir = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  const f = centroDe(id, donde);
  const rf = radioDe(GUION.cosas[id]);
  for (const [otro, vs] of Object.entries(VISITAS)) {
    if (otro === id) continue;
    for (const v of vs) {
      if (v.desde - 5 > p.hasta || (v.sale ?? v.hasta) < p.desde) continue;
      const o = centroDe(otro, v.p);
      const d = [o[0] - f[0], o[1] - f[1], o[2] - f[2]];
      const frente = d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2];
      if (frente < 0.3) continue;
      const lado = Math.hypot(d[0] - frente * dir[0], d[1] - frente * dir[1], d[2] - frente * dir[2]);
      if (lado < radioDe(GUION.cosas[otro]) + rf * 0.7) (v.tapa ??= []).push([p.desde, p.hasta]);
    }
  }
}

export const TOMAS = tomas;
export const PLANOS = planosDe(TOMAS);

/** Los capítulos: el fondo del principio y cada cambio que pide un momento. */
export const TEMAS: { desde: number; tema: Tema }[] = [{ desde: 0, tema: GUION.tema ?? "oscuro" }];
for (const p of PASOS) if (p.tema && p.tema !== TEMAS.at(-1)!.tema) TEMAS.push({ desde: Math.max(1, p.desde), tema: p.tema });

/** Las poses del personaje: la de cada momento que la pide y, al cierre, el celular. */
export const POSES: { desde: number; pose: string; celular?: boolean }[] = [{ desde: 0, pose: PASOS[0]?.pose ?? "normal" }];
for (const p of PASOS.slice(1)) if (p.pose && p.pose !== POSES.at(-1)!.pose) POSES.push({ desde: p.desde, pose: p.pose });
if (CIERRE !== null) POSES.push({ desde: CIERRE, pose: "celular", celular: true });

/** El cierre de la marca: cuándo entra la tarjeta, cuándo se pulsa y cuándo sale dónde está. */
export const CANAL = (() => {
  if (CIERRE === null || !GUION.cierre) return null;
  const i0 = indice(GUION.cierre);
  const n = PALABRAS.length - i0;
  const a = (k: number) => cuadro(PALABRAS[Math.min(PALABRAS.length - 1, i0 + Math.round(n * k))].s);
  return { pero: CIERRE, unete: a(0.45), enlace: a(0.75) };
})();

/** Cuándo sale la tarjeta de un paso: cuando otro paso trae algo nuevo que enseñar. */
export const saleTarjeta = (p: Paso) => {
  for (const q of PASOS.slice(p.i + 1)) if (q.cosa || q.tarjeta) return q.desde;
  return FIN;
};

/** Los tramos en que se ve una tarjeta de ese tipo (de cada cosa, con `cosa`). */
export const tramosDe = (tipo: Tarjeta["tipo"], cosa?: string): [number, number][] =>
  PASOS.filter((p) => p.tarjeta?.tipo === tipo && (cosa === undefined || p.cosa === cosa)).map((p) => [p.desde, saleTarjeta(p)]);
/**
 * Mientras se ve una foto, lo de detrás no se mueve y lo que hay bajo ella se va: el rayo que saltaba detrás de la de la
 * adrenalina distraía de la foto (el usuario, 6-nov). Mientras se ve una cifra, el contador se esconde: con «$6,000
 * pesos pagados» encima de «$12,500 M perdidos en fraudes», ninguno se entendía.
 */
export const TRAMOS_FOTO = tramosDe("imagen");
export const TRAMOS_CIFRA = tramosDe("cifra");
/** Cuánto se está dentro de algún tramo en el cuadro `f` (0 fuera, 1 dentro), con `borde` cuadros para entrar y salir. */
export const enTramos = (tramos: [number, number][], f: number, borde = 6) =>
  tramos.reduce((m, [a, b]) => Math.max(m, Math.min(1, Math.max(0, Math.min((f - a + borde) / borde, (b - f) / borde)))), 0);

/** Los sonidos: un golpe suave cuando entra algo, un clic con cada tarjeta y un barrido cuando la cámara viaja. */
export type Sonido = { f: number; s: "pop" | "clic" | "barrido" };
export const SONIDOS: Sonido[] = (() => {
  const fuera: Sonido[] = [];
  const entradas = new Set(Object.values(VISITAS).flatMap((vs) => vs.map((v) => v.desde)));
  for (const p of PASOS) {
    if (p.cosa && entradas.has(p.desde)) fuera.push({ f: p.desde, s: "pop" });
    else if (p.tarjeta) fuera.push({ f: p.desde, s: "clic" });
  }
  let antes: V3 | null = null;
  for (const t of TOMAS) {
    const c = t.cosas[0].p;
    if (antes && Math.hypot(c[0] - antes[0], c[2] - antes[2]) > 3) fuera.push({ f: t.en, s: "barrido" });
    antes = c;
  }
  return fuera.sort((a, b) => a.f - b.f);
})();

export const DESDE_CIERRE = CIERRE;

/**
 * La luz de cada escena (`luz` de `escenas`), como en un set: la principal (de dónde viene, su color y su fuerza), el
 * contraluz que recorta, y el cielo que rellena. Cambia en ~20 cuadros al pasar de una escena a otra. Son siempre las
 * mismas tres luces: cambiar cuántas hay recompila los materiales de toda la escena (el render pasó de 49 a 93 s).
 */
export type Iluminacion = { principal: string; fuerza: number; contra: string; contraFuerza: number; cielo: number; alto: number };
const LUCES: Record<Luz, Iluminacion> = {
  estudio: { principal: "#fff4e6", fuerza: 2.4, contra: "", contraFuerza: 2.6, cielo: 0.25, alto: 9 },
  dia: { principal: "#fff1da", fuerza: 2.8, contra: "#bcd7ff", contraFuerza: 1.2, cielo: 0.9, alto: 11 },
  atardecer: { principal: "#ffab5e", fuerza: 2.3, contra: "#7a5cff", contraFuerza: 1.6, cielo: 0.35, alto: 3.5 },
  noche: { principal: "#9fb6ff", fuerza: 0.9, contra: "#ffb347", contraFuerza: 2.6, cielo: 0.12, alto: 8 },
  vela: { principal: "#ffb067", fuerza: 1.5, contra: "#ff7a2e", contraFuerza: 1.1, cielo: 0.06, alto: 2.5 },
  neon: { principal: "#6ef7ff", fuerza: 1.2, contra: "#ff3df2", contraFuerza: 2.8, cielo: 0.1, alto: 7 },
};
export const luzEn = (f: number, luzVideo: string): Iluminacion => {
  const de = (t?: { escena: string }) => {
    const l = LUCES[(t && GUION.escenas?.[t.escena]?.luz) || "estudio"];
    return { ...l, contra: l.contra || luzVideo };
  };
  const k = TRAMOS_ESCENA.findLastIndex((t) => t.desde <= f);
  const ahora = de(TRAMOS_ESCENA[k]);
  if (k <= 0 || f - TRAMOS_ESCENA[k].desde >= 20) return ahora;
  const antes = de(TRAMOS_ESCENA[k - 1]);
  const t = (f - TRAMOS_ESCENA[k].desde) / 20;
  const mezcla = (a: string, b: string) => "#" + [0, 1, 2].map((i) => Math.round(parseInt(a.slice(1 + 2 * i, 3 + 2 * i), 16) * (1 - t) + parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16) * t).toString(16).padStart(2, "0")).join("");
  return {
    principal: mezcla(antes.principal, ahora.principal),
    fuerza: antes.fuerza + (ahora.fuerza - antes.fuerza) * t,
    contra: mezcla(antes.contra, ahora.contra),
    contraFuerza: antes.contraFuerza + (ahora.contraFuerza - antes.contraFuerza) * t,
    cielo: antes.cielo + (ahora.cielo - antes.cielo) * t,
    alto: antes.alto + (ahora.alto - antes.alto) * t,
  };
};

/** El fondo de la escena de este cuadro (`fondo` de `escenas`), con ~12 cuadros de paso entre una y otra; o null. */
export const fondoEn = (f: number): string | null => {
  const k = TRAMOS_ESCENA.findLastIndex((t) => t.desde <= f);
  const ahora = k >= 0 ? GUION.escenas?.[TRAMOS_ESCENA[k].escena]?.fondo : undefined;
  if (!ahora) return null;
  const antes = k > 0 ? GUION.escenas?.[TRAMOS_ESCENA[k - 1].escena]?.fondo : undefined;
  const t = Math.min(1, (f - TRAMOS_ESCENA[k].desde) / 12);
  if (!antes || t >= 1) return ahora;
  return "#" + [0, 1, 2].map((i) => Math.round(parseInt(antes.slice(1 + 2 * i, 3 + 2 * i), 16) * (1 - t) + parseInt(ahora.slice(1 + 2 * i, 3 + 2 * i), 16) * t).toString(16).padStart(2, "0")).join("");
};

/** Si la tarjeta de un paso se ve: no en un primer plano ni en un detalle, que son de la cosa sola. */
export const conTarjeta = (p: Paso) => Boolean(p.tarjeta) && p.camara?.plano !== "primer" && p.camara?.plano !== "detalle";

/**
 * Cuánto está el personaje en su esquina en este cuadro (0 en su sitio, 1 en la esquina): en los primeros planos, los
 * detalles y los medios de algo alto (`esquina`) se va chico abajo a la derecha, como la cámara del que reacciona, y deja el cuadro a lo que se enseña. En su
 * sitio tapaba el tercio de abajo de esos planos (la olla y el grano del tamal se metían detrás de él).
 */
// Los pasos seguidos que lo mandan a la esquina son un solo tramo: con uno por paso, entre dos volvía a su sitio unos
// cuadros y regresaba de golpe (los «parpadea» del 3–5 % del celular que se calienta).
const TRAMOS_ESQUINA = PASOS.reduce<[number, number][]>((t, p) => {
  if (!p.esquina) return t;
  const ultimo = t.at(-1);
  if (ultimo && ultimo[1] >= p.desde) ultimo[1] = p.hasta;
  else t.push([p.desde, p.hasta]);
  return t;
}, []);
export const esquinaEn = (f: number) => {
  let v = 0;
  for (const [desde, hasta] of TRAMOS_ESQUINA) {
    const sube = Math.min(1, Math.max(0, (f - desde + 4) / 8));
    const baja = Math.min(1, Math.max(0, (hasta - f) / 8));
    v = Math.max(v, Math.min(sube, baja));
  }
  return v;
};
