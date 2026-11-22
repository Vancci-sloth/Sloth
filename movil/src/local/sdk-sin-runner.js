// En el celular, el SDK de Anthropic va sin su «tool runner» ni sus «threads» (metro.config.js): esos dos módulos se
// importan en círculo con `resources/beta` y React Native, en desarrollo, los lee a medio cargar y la app no abre. El
// agente del celular lleva su propio bucle (`agente.ts`) y no los usa; si algo los pidiera, dice por qué no están.
'use strict'
Object.defineProperty(exports, '__esModule', { value: true })

class NoEnElCelular {
  constructor() {
    throw new Error('El tool runner y los threads del SDK de Anthropic no van en la app del celular: usa el bucle de movil/src/local/agente.ts.')
  }
}

exports.BetaToolRunner = NoEnElCelular
exports.BetaMessageThread = NoEnElCelular
