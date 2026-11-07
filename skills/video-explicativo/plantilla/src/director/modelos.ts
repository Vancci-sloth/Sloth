// Lo escribe hacer.py con lo que pide momentos.json: cada modelo 3D (de la biblioteca o de src/modelos) y cada pieza
// propia (src/piezas) por su id. No se edita a mano.
import type React from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODELOS: Record<string, React.FC<any>> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PIEZAS: Record<string, React.FC<any>> = {};
/** La caja de cada modelo que la trae en su modelo.json: ancho, alto y fondo, en cualquier unidad. */
export const CAJAS: Record<string, [number, number, number]> = {};
/** Los modelos con cara (`frente` en su modelo.json): la cámara los ve de frente o de tres cuartos, nunca de lado. */
export const FRENTES = new Set<string>([]);
