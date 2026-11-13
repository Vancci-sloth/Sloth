import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLOR, FUENTE } from "../estilo";
import { useBeat, useFormato, useResorte } from "../piezas";

/**
 * El diagrama que se arma con la voz: cajas de color y flechas con su etiqueta, cada pieza en la palabra que la nombra.
 * Es lo que más se repite en los Code Report que El Diff no tenía (8 de 10, de 10 a 50 s cada uno: REFERENCIAS.md): el
 * mecanismo explicado sin un renglón técnico, y el único gráfico propio que se sostiene lo que dura la explicación.
 *
 *   { "tipo": "diagrama", "titulo": "CÓMO TE CAMBIAN EL BUSCADOR",
 *     "nodos": [{ "id": "tu", "texto": "Tú", "en": "buscas" }, { "id": "op", "texto": "El operador", "color": "rojo", "logo": "logos/x.png" }],
 *     "flechas": [{ "de": "tu", "a": "op", "texto": "tu búsqueda", "en": "pasa" }],
 *     "cambios": [{ "id": "op", "en": "decide", "color": "rojo", "texto": "Decide a dónde vas" }] }
 *
 * Los nodos se acomodan solos: en una columna (hasta cuatro) o en dos en zigzag, de arriba abajo en vertical; en fila en
 * horizontal. `en` es la palabra del beat en que entra cada pieza; sin ella, los nodos entran en orden a lo largo de la
 * primera mitad y cada flecha, cuando ya están sus dos puntas. `cambios` vuelve a pintar un nodo cuando la voz lo dice
 * (se pone rojo al fallar, cambia su texto). Lo escribe el director desde `"diagrama"` de momentos.json.
 */

const TINTA: Record<string, string> = { crema: COLOR.crema, rojo: COLOR.rojo, verde: COLOR.verde, azul: COLOR.azul, amarillo: COLOR.amarillo, naranja: COLOR.naranja, morado: COLOR.morado, gris: COLOR.gris };

type Nodo = { id: string; texto: string; color?: string; logo?: string; en?: string; nota?: string };
type Caja = { x: number; y: number; w: number; h: number };

/** Dónde va cada nodo: el centro y el tamaño, en píxeles de la escena. */
const acomodo = (n: number, W: number, H: number, vertical: boolean, conTitulo: boolean): Caja[] => {
  const arriba = conTitulo ? H * 0.15 : H * 0.05;
  const alto = H * 0.95 - arriba;
  if (vertical) {
    const cols = n <= 4 ? 1 : 2;
    const filas = Math.ceil(n / cols);
    const w = cols === 1 ? W * 0.7 : W * 0.42;
    const h = Math.min(190, (alto / filas) * 0.62);
    return Array.from({ length: n }, (_, i) => {
      const fila = Math.floor(i / cols);
      // En dos columnas, zigzag: cada fila alterna de lado para que las flechas no se crucen.
      const col = cols === 1 ? 0 : fila % 2 === 0 ? i % cols : cols - 1 - (i % cols);
      return { x: cols === 1 ? W / 2 : W * (0.27 + 0.46 * col), y: arriba + (alto * (fila + 0.5)) / filas, w, h };
    });
  }
  const filas = n <= 4 ? 1 : 2;
  const cols = Math.ceil(n / filas);
  // En fila: cada caja toma su parte del ancho menos el hueco de la flecha y su etiqueta.
  const w = Math.min(560, (W * 0.92) / cols - 110);
  return Array.from({ length: n }, (_, i) => {
    const fila = Math.floor(i / cols);
    const col = fila % 2 === 0 ? i % cols : cols - 1 - (i % cols);
    return { x: W * 0.04 + ((W * 0.92) * (col + 0.5)) / cols, y: arriba + (alto * (fila + 0.5)) / filas, w, h: filas === 1 ? 300 : 230 };
  });
};

/** De la orilla de una caja a la de la otra, por el lado que las separa más. */
const puntas = (a: Caja, b: Caja): [number, number, number, number] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) * a.w >= Math.abs(dx) * a.h) {
    const s = Math.sign(dy) || 1;
    return [a.x, a.y + (s * a.h) / 2 + s * 10, b.x, b.y - (s * b.h) / 2 - s * 18];
  }
  const s = Math.sign(dx) || 1;
  return [a.x + (s * a.w) / 2 + s * 10, a.y, b.x - (s * b.w) / 2 - s * 18, b.y];
};

export const Diagrama: React.FC = () => {
  const { v, en, duracion } = useBeat();
  const { vertical, W, H } = useFormato();
  const frame = useCurrentFrame();
  const nodos = (v.nodos ?? []) as Nodo[];
  const cajas = acomodo(nodos.length, W, H, vertical, !!v.titulo);
  const lugar = Object.fromEntries(nodos.map((n, i) => [n.id, cajas[i]]));
  // Cuándo entra cada pieza: en su palabra o, sin ella, repartidas en la primera mitad del beat.
  const entrada = Object.fromEntries(nodos.map((n, i) => [n.id, n.en ? en(n.en) : Math.round((duracion * 0.5 * i) / Math.max(1, nodos.length))]));
  const k = Math.min(1, W / 1080);

  return (
    <AbsoluteFill>
      {v.titulo && (
        <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.035, textAlign: "center", fontFamily: FUENTE.pixel, fontWeight: 700, fontSize: 44 * k, letterSpacing: 3, color: COLOR.gris }}>
          {String(v.titulo).toUpperCase()}
        </div>
      )}
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={W} height={H}>
        {((v.flechas ?? []) as any[]).map((f, i) => {
          const [a, b] = [lugar[f.de], lugar[f.a]];
          if (!a || !b) return null;
          const desde = f.en ? en(f.en) : Math.max(entrada[f.de], entrada[f.a]) + 4;
          if (frame < desde) return null;
          const p = interpolate(frame, [desde, desde + 9], [0, 1], { extrapolateRight: "clamp" });
          const [x1, y1, x2, y2] = puntas(a, b);
          const [x, y] = [x1 + (x2 - x1) * p, y1 + (y2 - y1) * p];
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const ala = (d: number) => `${x - Math.cos(ang + d) * 30},${y - Math.sin(ang + d) * 30}`;
          const color = TINTA[f.color ?? "crema"] ?? COLOR.crema;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x} y2={y} stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={f.punteada ? "4 20" : undefined} />
              <polyline points={`${ala(0.5)} ${x},${y} ${ala(-0.5)}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>
      {((v.flechas ?? []) as any[]).map((f, i) => {
        const [a, b] = [lugar[f.de], lugar[f.a]];
        if (!f.texto || !a || !b) return null;
        return <Etiqueta key={i} texto={f.texto} desde={(f.en ? en(f.en) : Math.max(entrada[f.de], entrada[f.a]) + 4) + 6} puntas={puntas(a, b)} k={k} />;
      })}
      {nodos.map((n, i) => {
        // El último cambio que ya se dijo manda sobre el color y el texto del nodo.
        const dichos = ((v.cambios ?? []) as any[]).filter((c) => c.id === n.id && frame >= en(c.en));
        const cambio = dichos[dichos.length - 1];
        return <Pieza key={n.id} n={{ ...n, ...(cambio ? { color: cambio.color ?? n.color, texto: cambio.texto ?? n.texto, nota: cambio.nota ?? n.nota } : {}) }} c={cajas[i]} desde={entrada[n.id]} golpe={cambio ? en(cambio.en) : -100} k={k} />;
      })}
    </AbsoluteFill>
  );
};

const Pieza: React.FC<{ n: Nodo; c: Caja; desde: number; golpe: number; k: number }> = ({ n, c, desde, golpe, k }) => {
  const frame = useCurrentFrame();
  const s = useResorte(desde, { damping: 13, stiffness: 240, mass: 0.7 });
  const g = useResorte(golpe, { damping: 9, stiffness: 300, mass: 0.5 });
  if (frame < desde) return null;
  const color = TINTA[n.color ?? "crema"] ?? COLOR.crema;
  const renglones = String(n.texto).split("\n");
  const largo = Math.max(...renglones.map((r) => r.length));
  // Una caja alta (en fila, en horizontal) lleva su logo arriba del texto; una ancha, al lado.
  const apilada = !!n.logo && c.h > c.w * 0.5;
  const lado = n.logo ? (apilada ? c.h * 0.42 : Math.min(c.h * 0.58, c.w * 0.26)) : 0;
  const libre = c.w - (lado && !apilada ? lado + 18 : 0) - 44;
  const alto = c.h * 0.74 - (apilada ? lado + 14 : 0);
  const tam = Math.min(c.h > 200 ? 84 : 62 * k, libre / (largo * 0.56), alto / renglones.length);
  return (
    <div
      style={{
        position: "absolute",
        left: c.x - c.w / 2,
        top: c.y - c.h / 2,
        width: c.w,
        height: c.h,
        transform: `scale(${interpolate(s, [0, 1], [0.6, 1]) * (frame >= golpe && golpe >= 0 ? interpolate(g, [0, 1], [1.12, 1]) : 1)})`,
        opacity: Math.min(1, s * 3),
        display: "flex",
        flexDirection: apilada ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: apilada ? 14 : 18,
        padding: "0 22px",
        boxSizing: "border-box",
        borderRadius: 26,
        background: "#16161c",
        border: `7px solid ${color}`,
        boxShadow: `0 16px 40px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.04)`,
      }}
    >
      {n.logo && <Img src={staticFile(n.logo)} style={{ height: lado, width: lado, objectFit: "contain", borderRadius: 16, background: "white", padding: 6, boxSizing: "border-box" }} />}
      <div style={{ fontFamily: FUENTE.ui, fontWeight: 800, fontSize: tam, lineHeight: 1.08, color, whiteSpace: "pre", textAlign: "center" }}>{n.texto}</div>
      {n.nota && (
        <div style={{ position: "absolute", left: "50%", top: "100%", transform: "translate(-50%, 8px)", fontFamily: FUENTE.codigo, fontSize: 30 * k, color: COLOR.gris, whiteSpace: "pre" }}>{n.nota}</div>
      )}
    </div>
  );
};

/** La etiqueta de una flecha, a su lado: junto a una vertical, encima de una horizontal. */
const Etiqueta: React.FC<{ texto: string; desde: number; puntas: [number, number, number, number]; k: number }> = ({ texto, desde, puntas: [x1, y1, x2, y2], k }) => {
  const frame = useCurrentFrame();
  if (frame < desde) return null;
  const vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
  const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
  return (
    <div
      style={{
        position: "absolute",
        left: mx,
        top: my,
        transform: vertical ? "translate(22px, -50%)" : "translate(-50%, calc(-100% - 14px))",
        opacity: interpolate(frame - desde, [0, 5], [0, 1], { extrapolateRight: "clamp" }),
        fontFamily: FUENTE.codigo,
        fontWeight: 700,
        fontSize: 34 * k,
        color: COLOR.amarillo,
        background: "rgba(13,13,16,0.9)",
        padding: "4px 12px",
        borderRadius: 8,
        whiteSpace: "pre",
      }}
    >
      {texto}
    </div>
  );
};
