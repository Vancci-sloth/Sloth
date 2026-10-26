// Busca los tirones de "la primera vez": shaders que se compilan o texturas que se suben a mitad de la animación.
// Lo correcto es 0 y 0: todo se prepara en warmUp(), detrás de la pantalla de carga.
// Uso: node herramientas/tirones.mjs <invitacion>
import { abrir, uso } from "./navegador.mjs";

const [ruta] = process.argv.slice(2);
if (!ruta) uso("Uso: node herramientas/tirones.mjs <invitacion>");
const { browser, page } = await abrir(ruta, {
  query: "auto&fixed", dpr: 2,
  antes: (page) => page.addInitScript(() => {
    const cuenta = (window.__gl = { programas: 0, texturas: 0 });
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const link = C.prototype.linkProgram;
      C.prototype.linkProgram = function (...a) { cuenta.programas++; return link.apply(this, a); };
      for (const k of ["texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D", "compressedTexSubImage2D"]) {
        const f = C.prototype[k];
        if (f) C.prototype[k] = function (...a) { if (a.some((x) => x && typeof x === "object")) cuenta.texturas++; return f.apply(this, a); };
      }
    }
  }),
});
const antes = await page.evaluate(() => ({ ...window.__gl, lista: window.__programs?.() ?? [] }));
const ms = ((await page.evaluate(() => window.__tiempos?.DURATION ?? 6.5)) + 2) * 1000;
await page.waitForTimeout(ms);
const despues = await page.evaluate(() => ({ ...window.__gl, lista: window.__programs?.() ?? [] }));
const progs = despues.programas - antes.programas, tex = despues.texturas - antes.texturas;
console.log(`preparados al cargar: ${antes.programas} programas, ${antes.texturas} subidas de textura`);
console.log(`durante la animación: ${progs} programas nuevos ${progs ? "✗" : "✓"}, ${tex} subidas de textura ${tex ? "✗" : "✓"}`);
const nuevos = despues.lista.filter((x) => !antes.lista.some((y) => y.split(" ")[0] === x.split(" ")[0]));
if (nuevos.length) console.log("programas que aparecieron:", nuevos);
await browser.close();
