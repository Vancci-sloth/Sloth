/**
 * La app que se vende (`npm run compilar`, `scripts/compilar.mjs`) no lleva lo que solo sirve en la computadora del
 * dueño: Ideas y lo que edita o actualiza la propia app. El compilador cambia `__VENTA__`
 * por `true`; aquí, en el repo, no existe y vale `false`.
 */
declare const __VENTA__: boolean | undefined
export const VENTA: boolean = typeof __VENTA__ !== 'undefined' && __VENTA__
