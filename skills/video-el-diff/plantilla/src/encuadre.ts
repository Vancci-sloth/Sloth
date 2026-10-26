/**
 * Encuadre vertical de una captura: qué parte de la imagen cabe en la zona de la escena (1080x1156, `VERTICAL` en
 * subtitulos.tsx) para cada rectángulo de cámara del episodio (`vista` o `toma`).
 *
 * - **Texto** (`ajusta`): la toma se ajusta al ancho de la zona y la altura extra muestra más renglones. Si lo citado
 *   (las marcas) se vería más chico que `LEGIBLE`, la cámara se acerca a lo citado, sin cortarlo. Con los renglones del
 *   OCR (`src/lineas.json`), los de la columna de lo citado se ven completos aunque la letra quede más chica, mientras
 *   se sigan leyendo (`MIN_RENGLON`); uno más largo que eso se corta en la orilla.
 * - **Video** (`cubre`): un clip o el video de un tuit llena la zona (recorte tipo cover), centrado en el `foco` si hay
 *   uno, si no en la toma; lo marcado dentro nunca queda fuera.
 *
 * Todo en píxeles de la imagen. Devuelve un rectángulo con la forma de la zona; `Captura` lo pone en pantalla.
 */

export type Rect = [number, number, number, number];

/** Alto mínimo, en px del lienzo de 1080, de un renglón citado (la caja del OCR, casi la altura de las mayúsculas). */
export const LEGIBLE = 40;
/** Lo más que se acerca la cámara (más, y una captura chica se ve borrosa). */
const KMAX = 2.6;
/** Margen alrededor de lo citado, en px de la imagen. */
const PAD = 36;
/** Un renglón es de la columna de lo citado si se cruza a lo ancho con lo citado y empieza a menos de esto a su izquierda (px de la imagen). */
const COLUMNA = 160;
/** Alto mínimo (px del lienzo) de un renglón para protegerlo completo: más chico ya no se lee aunque se vea entero. */
const MIN_RENGLON = 18;

export type Contexto = {
  /** Tamaño de la imagen (o del clip). */
  W: number;
  H: number;
  /** Tamaño de la zona de contenido, en px del lienzo. */
  ZW: number;
  ZH: number;
  esClip: boolean;
  /** El rectángulo del video encima de la captura (`video.r`). */
  video?: Rect;
  /** Lo que no puede quedar fuera: las marcas y focos de la imagen (de todo el episodio) y `importante`. */
  importantes: Rect[];
  /** Las marcas sobre texto: su altura dice qué tan chico se ve lo citado. */
  textos: Rect[];
  /** Renglones del OCR de la imagen. */
  lineas: Rect[];
  /** El foco del beat: en un video, la cámara se centra en él. */
  foco?: Rect;
  /** Fuerza el modo: "cubre" (llena la zona) o "ajusta" (cabe a lo ancho). */
  modo?: "cubre" | "ajusta";
};

const cx = (r: Rect) => r[0] + r[2] / 2;
const cy = (r: Rect) => r[1] + r[3] / 2;
const dentro = (m: Rect, r: Rect) => cx(m) >= r[0] && cx(m) <= r[0] + r[2] && cy(m) >= r[1] && cy(m) <= r[1] + r[3];
const corte = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
};
export const union = (rs: Rect[]): Rect | null => {
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r[0]));
  const y0 = Math.min(...rs.map((r) => r[1]));
  const x1 = Math.max(...rs.map((r) => r[0] + r[2]));
  const y1 = Math.max(...rs.map((r) => r[1] + r[3]));
  return [x0, y0, x1 - x0, y1 - y0];
};
const entre = (x: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.min(b, Math.max(a, x)));

/** Si `r` es (casi todo) un video: un clip, o la toma que baja al video de un tuit. */
export const esVideo = (r: Rect, c: Contexto) => {
  if (c.modo) return c.modo === "cubre";
  if (c.esClip) return true;
  if (!c.video) return false;
  const k = corte(r, c.video);
  return !!k && (k[2] * k[3]) / (r[2] * r[3]) > 0.8;
};

/**
 * Los renglones de la misma columna que lo citado (se cruzan a lo ancho con lo citado) entre `y0` y `y1`: esos se ven
 * completos. Los de otras columnas (la barra lateral de GitHub, la fecha de un commit) pueden quedar cortados.
 */
const columna = (lineas: Rect[], I: Rect, y0: number, y1: number, ZW: number) =>
  lineas.filter((l) => {
    if (!(cy(l) > y0 && cy(l) < y1 && l[0] < I[0] + I[2] && l[0] + l[2] > I[0] && l[0] >= I[0] - COLUMNA)) return false;
    // Solo si completo todavía se lee: un renglón de 1600 px no se protege (dejaría todo ilegible); se corta.
    const ancho = Math.max(I[0] + I[2], l[0] + l[2]) - Math.min(I[0], l[0]) + 2 * PAD;
    return (l[3] * ZW) / ancho >= MIN_RENGLON;
  });

export const encuadre = (r: Rect, c: Contexto): Rect => {
  const { ZW, ZH, W, H } = c;
  const cubre = esVideo(r, c);
  const imp = c.importantes.filter((m) => dentro(m, r));
  const I = union(imp);
  const foco = c.foco && dentro(c.foco, r) ? c.foco : undefined;

  let k: number;
  if (cubre) {
    const base = c.esClip || !c.video ? r : corte(r, c.video) ?? r;
    k = Math.max(ZW / base[2], ZH / base[3]);
  } else {
    k = Math.min(ZW / r[2], ZH / r[3]);
    const txt = c.textos.filter((m) => dentro(m, r));
    if (txt.length) k = Math.max(k, LEGIBLE / Math.min(...txt.map((m) => m[3])));
  }
  if (I) k = Math.min(k, ZW / (I[2] + 2 * PAD), ZH / (I[3] + 2 * PAD));
  k = Math.min(k, KMAX);

  let w = ZW / k;
  let h = ZH / k;
  const centro = (n: number, largo: number, dim: 0 | 1) => {
    // En un video, el foco manda; si la cámara se acerca más que la toma, lo citado; si no, la toma.
    const rc = dim === 0 ? cx(r) : cy(r);
    let x = foco && cubre ? (dim === 0 ? cx(foco) : cy(foco)) : I && n < largo ? (dim === 0 ? cx(I) : cy(I)) : rc;
    if (I) x = entre(x, I[dim] + I[dim + 2] + PAD - n / 2, I[dim] - PAD + n / 2);
    return x;
  };
  let x = centro(w, r[2], 0);
  let y = centro(h, r[3], 1);

  // En un video, la ventana no sale del video (la orilla de un tuit no se asoma bajo el video).
  if (cubre && c.video && !c.esClip) {
    const V = corte(r, c.video) ?? c.video;
    if (w <= V[2]) x = entre(x, V[0] + w / 2, V[0] + V[2] - w / 2);
    if (h <= V[3]) y = entre(y, V[1] + h / 2, V[1] + V[3] - h / 2);
  }

  // Los renglones de la columna de lo citado se ven completos: si uno pasa del borde, la ventana crece (y la letra
  // se achica) hasta que cabe.
  if (!cubre && I && c.lineas.length) {
    for (let i = 0; i < 3; i++) {
      const U = union([I, ...columna(c.lineas, I, y - h / 2, y + h / 2, ZW)])!;
      const nw = Math.min(W, Math.max(w, U[2] + 2 * PAD));
      if (nw <= w + 1 && x - w / 2 <= U[0] - PAD && x + w / 2 >= U[0] + U[2] + PAD) break;
      w = nw;
      h = (w * ZH) / ZW;
      x = entre(x, U[0] + U[2] + PAD - w / 2, U[0] - PAD + w / 2);
      y = entre(y, I[1] + I[3] + PAD - h / 2, I[1] - PAD + h / 2);
    }
  }
  return [x - w / 2, y - h / 2, w, h];
};
