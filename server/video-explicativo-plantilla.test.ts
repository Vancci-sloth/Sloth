// Ejecuta el director completo y llama a centroDe, su exportación pública, sin extraer ni copiar su fórmula.
// Remotion y Three viven en cada video: aquí se sustituyen el encuadre, el tema y el reloj; no se prueba el render.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";

const fuente = readFileSync(new URL("../skills/video-explicativo/plantilla/src/director/guion.ts", import.meta.url), "utf8");
const { code } = transformSync(fuente, { loader: "ts", format: "cjs", target: "es2022" });
type V3 = [number, number, number];
type Cosa = { modelo?: string; icono?: string; tam?: number };

/** Datos como los que deja hacer.py, sin escribir en la plantilla ni necesitar modelos de otro proyecto. */
const centro = (cosa: Cosa, caja?: V3, p: V3 = [0, 0, 0]) => {
  const modulos: Record<string, unknown> = {
    "../datos/momentos.json": { cosas: { cosa }, momentos: [] },
    "./modelos": { CAJAS: caja ? { m: caja } : {} },
    "../tiempo": { DURACION: 30 },
    "../tema": { ANCHO: 1080, ALTO: 1920, ZONA: { escena: { arriba: 470, abajo: 1390, izquierda: 90, derecha: 990 } } },
    "../mundo/encuadra": { planosDe: () => [] },
  };
  const ctx = {
    module: { exports: {} as { centroDe: (id: string, p: V3) => V3 } },
    require: (id: string) => {
      assert.ok(Object.hasOwn(modulos, id), `importación inesperada: ${id}`);
      return modulos[id];
    },
  };
  vm.runInNewContext(code, ctx);
  return Array.from(ctx.module.exports.centroDe("cosa", p));
};

test("una cosa chica apunta a la mitad de su tam, tenga la caja que tenga", () => {
  for (const tam of [1.6, 4.9]) {
    assert.deepEqual(centro({ modelo: "m", tam }, [4, 1, 2]), [0, tam / 2, 0]);
    assert.deepEqual(centro({ modelo: "m", tam }, [1, 4, 1]), [0, tam / 2, 0]);
    assert.deepEqual(centro({ modelo: "m", tam }), [0, tam / 2, 0]);
  }
});

test("un escenario plano apunta a la mitad de su alto de verdad desde 5 metros", () => {
  for (const tam of [5, 16]) {
    assert.deepEqual(centro({ modelo: "m", tam }, [28, 6, 70]), [0, (tam * 6) / 70 / 2, 0]);
    assert.deepEqual(centro({ modelo: "m", tam }, [70, 6, 28], [3, 2, -4]), [3, 2 + (tam * 6) / 70 / 2, -4]);
  }
});

test("sin caja o con un modelo alto, el escenario conserva la mitad de su tam", () => {
  assert.deepEqual(centro({ modelo: "m", tam: 16 }), [0, 8, 0]);
  assert.deepEqual(centro({ modelo: "m", tam: 16 }, [2, 8, 3]), [0, 8, 0]);
});

test("los tamaños por omisión y la elevación de los iconos no cambian", () => {
  assert.deepEqual(centro({ modelo: "m" }, [4, 1, 2]), [0, 0.8, 0]);
  assert.deepEqual(centro({ icono: "Star" }, undefined, [3, 2, -4]), [3, 2 + 0.35 + 1.1 / 2, -4]);
  assert.deepEqual(centro({ icono: "Star", tam: 6 }, [28, 6, 70]), [0, 0.35 + 3, 0]);
});
