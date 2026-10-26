// En GitHub, antes de compilar la rama `venta` (.github/workflows/venta.yml): si la versión de package.json no es más
// nueva que la publicada, sube la última cifra de la publicada (0.2.2 → 0.2.3). Así cada push a `venta` sale como versión
// nueva sin tocar package.json a mano. Solo cambia la copia de GitHub; para saltar a 0.3.0, ponla en package.json. La
// calcula una vez el primer paso del flujo, y cada sistema la recibe en `VERSION`: si no, el que publicara antes
// cambiaría la que ven los demás.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const COBRO = 'https://api.sloth.vancci.org'
const PAQUETE = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')

const cifras = (v) => v.split('.').map(Number)
const masNueva = (a, b) => {
  const [x, y] = [cifras(a), cifras(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

const texto = readFileSync(PAQUETE, 'utf8')
const propia = JSON.parse(texto).version
let version = process.env.VERSION
if (!version) {
  const r = await fetch(`${COBRO}/version`)
  const publicada = r.ok ? (await r.json()).version : '0.0.0'
  const [a, b, c] = cifras(publicada)
  version = masNueva(propia, publicada) ? propia : `${a}.${b}.${c + 1}`
  console.error(`Publicada: ${publicada}. Esta sale como ${version}.`)
}
writeFileSync(PAQUETE, texto.replace(/"version": "[^"]+"/, `"version": "${version}"`))
// Para $GITHUB_OUTPUT: los tres sistemas salen con la misma.
console.log(`version=${version}`)
