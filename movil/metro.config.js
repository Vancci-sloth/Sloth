// La app del celular usa lo que comparte con la de escritorio (`../shared`, y de `../web/src` lo que no dibuja: cómo se
// juntan los eventos de un hilo y los trazos de los iconos). Ninguno de esos archivos importa paquetes, así que todo lo de
// node_modules sale de esta carpeta.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const repo = path.resolve(__dirname, '..')
const config = getDefaultConfig(__dirname)
config.watchFolders = [path.join(repo, 'shared'), path.join(repo, 'web', 'src')]
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')]

// El «tool runner» y los «threads» del SDK de Anthropic se importan en círculo con el resto del SDK, y la app no abre en
// desarrollo. El agente del celular no los usa: van por uno que avisa si alguien los pide (`src/local/sdk-sin-runner.js`).
const SIN_RUNNER = /[\\/]@anthropic-ai[\\/]sdk[\\/]lib[\\/](tools[\\/]BetaToolRunner|threads[\\/]BetaMessageThread)\.m?js$/
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const r = context.resolveRequest(context, moduleName, platform)
  if (r.type === 'sourceFile' && SIN_RUNNER.test(r.filePath)) return { type: 'sourceFile', filePath: path.join(__dirname, 'src', 'local', 'sdk-sin-runner.js') }
  return r
}

module.exports = config
