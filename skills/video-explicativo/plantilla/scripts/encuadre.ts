// Encuadres sin renderizar. Las tomas viven en src/mundo/guion.ts (TOMAS: qué tiene que verse en cada idea y desde
// dónde) y src/mundo/encuadra.ts saca de cada una su cámara (PLANOS). Esto imprime el plano de cada toma y, con
// --revisa, dice para cada una qué se sale de la zona útil (entre el texto de arriba y el perro) cuando la cámara ya
// llegó, y si la cámara se mueve bastante (el ritmo: ver "Que se mueva" en MUNDO.md).
//   npm run encuadre            (o `npm run encuadre -- --revisa`)
// Siempre con npm run: vuelve a empaquetar antes de correr. Con `node out/encuadre.cjs` solo, mide los planos viejos.
import { camaraDe, rapidezDe, vistaEn } from "../src/mundo/camara";
import { cajaDe, encuadra, zona } from "../src/mundo/encuadra";
import { PLANOS, TOMAS } from "../src/mundo/guion";
import { FPS } from "../src/tema";
import { DURACION } from "../src/tiempo";

const revisa = process.argv.includes("--revisa");
for (const t of TOMAS) {
  const llega = t.en + (t.dura ?? 30);
  if (!revisa) {
    const { pos, mira, d } = encuadra(t);
    console.log(`${t.n.padEnd(15)} f${String(t.en).padStart(4)}  pos [${pos.join(", ")}]  mira [${mira.join(", ")}]  (d ${d.toFixed(1)})`);
    continue;
  }
  const z = zona(t);
  const cam = camaraDe(PLANOS, llega);
  const partes = t.cosas.map((c) => {
    const [x0, y0, x1, y1] = cajaDe(cam, c);
    const fuera = x0 < z.x0 - 4 || x1 > z.x1 + 4 || y0 < z.y0 - 4 || y1 > z.y1 + 4;
    return `${fuera ? "✗" : "✓"} ${c.n} [${[x0, y0, x1, y1].map(Math.round).join(" ")}]`;
  });
  console.log(`${t.n.padEnd(15)} f${String(llega).padStart(4)}  ${partes.join("  ")}`);
}

/**
 * El ritmo de la cámara en todo el video. Los mínimos salen de comparar el de Berachain (se sintió vivo: 2.7 planos
 * por 10 s, 80° de lados, 5.8× de lejos a cerca, 5.5× de alto a bajo, barrido de 308 px) con el de SQUID (se sintió
 * quieto: 1.7, 22°, 2.3×, 2.2×, 71 px y planos sostenidos de hasta 9 s).
 */
if (revisa) {
  const az: number[] = [], dist: number[] = [], alto: number[] = [];
  let barrido = 0;
  let fBarrido = 0;
  for (let f = 0; f < DURACION; f++) {
    const v = vistaEn(PLANOS, f);
    const d = v.pos.clone().sub(v.mira);
    az.push((Math.atan2(d.x, d.z) * 180) / Math.PI);
    dist.push(d.length());
    alto.push(v.pos.y);
    const r = rapidezDe(PLANOS, f);
    if (r > barrido) [barrido, fBarrido] = [r, f];
  }
  const sostiene = Math.max(...PLANOS.map((p, i) => (PLANOS[i + 1]?.en ?? DURACION) - (i ? p.en + (p.dura ?? 30) : 0))) / FPS;
  const rango = (a: number[]) => Math.max(...a) / Math.max(0.1, Math.min(...a));
  const mide = (n: string, valor: number, bien: boolean, u: string) => `${bien ? "✓" : "✗"} ${n} ${valor.toFixed(1)}${u}`;
  const planos = ((PLANOS.length - 1) / DURACION) * FPS * 10;
  console.log(
    "ritmo  " +
      [
        mide("planos por 10 s", planos, planos >= 2.5, ""),
        mide("plano sostenido más largo", sostiene, sostiene <= 6.5, " s"),
        mide("lados", Math.max(...az) - Math.min(...az), Math.max(...az) - Math.min(...az) >= 60, "°"),
        mide("lejos/cerca", rango(dist), rango(dist) >= 3, "×"),
        mide("alto/bajo", rango(alto), rango(alto) >= 3, "×"),
        mide("barrido", barrido, barrido >= 150, ` px (f${fBarrido})`),
      ].join("  "),
  );
}
