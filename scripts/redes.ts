// Mira y mueve la cola de las redes sin escribir otro script cada vez (ver docs/agents/redes.md). Lee `data/redes/redes.json` y
// la nube de Instagram con las mismas variables que el servidor; lo que cambia algo pasa por la API de Sloth, que es la
// que sabe quitarlo también de la red.
//   npm run redes                                  la cola de cada red, de hoy en adelante, y lo que falló
//   npm run redes -- estado --todo                 también lo ya publicado y lo descartado
//   npm run redes -- nube [--todo]                 lo que espera o falló en la nube de Instagram (sale con la computadora apagada)
//   npm run redes -- quitar <red> <ref>            sacarla de la cola (y de la red, si ya llegó)
//   npm run redes -- reintentar <red> <ref>        una que falló vuelve a la cola, con hueco nuevo
//   npm run redes -- deshacer <red> <ref>          olvidar una descartada: vuelve a faltar en esa red
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Publicacion } from '../shared/types.ts'
import { leer } from '../server/opciones.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const REDES = join(REPO, 'data', 'redes', 'redes.json')
const PORT = process.env.PORT ?? '4848'
const [orden = 'estado', ...resto] = process.argv.slice(2)
/** Sale con el mensaje, sin la pila: lo que falla aquí es de uso o de la red, no del script. */
function fallar(mensaje: string): never {
  console.error(mensaje)
  process.exit(1)
}
/** La carpeta del video y su archivo, que es como se reconoce. */
const video = (ruta: string) => `${basename(dirname(dirname(ruta)))}/${basename(ruta)}`

if (orden === 'estado') {
  if (!existsSync(REDES)) fallar(`No existe ${REDES}: aún no se programó nada.`)
  const todo = resto.includes('--todo')
  const { publicaciones } = JSON.parse(readFileSync(REDES, 'utf8')) as { publicaciones: Publicacion[] }
  const hoy = new Date().toLocaleString('sv').slice(0, 10)
  for (const red of [...new Set(publicaciones.map((p) => p.red))]) {
    const suyas = publicaciones.filter((p) => p.red === red)
    const cuenta = [...new Set(suyas.map((p) => p.estado))].map((e) => `${e} ${suyas.filter((p) => p.estado === e).length}`)
    console.log(`\n${red}: ${cuenta.join(' · ')}`)
    const ver = suyas
      .filter((p) => todo || p.estado === 'error' || ((p.estado === 'cola' || p.estado === 'subiendo' || p.estado === 'programado') && (p.cuando ?? '') >= hoy))
      .sort((a, b) => (a.cuando ?? '').localeCompare(b.cuando ?? ''))
    for (const p of ver)
      console.log(`  ${(p.cuando ?? '—').padEnd(16)} ${p.estado.padEnd(10)} ${(p.cardId ?? '').padEnd(17)} ${video(p.ruta)}  ref ${p.ref ?? '—'}${p.error ? `\n      ${p.error.slice(0, 200)}` : ''}`)
  }
} else if (orden === 'nube') {
  const url = leer('SLOTH_NUBE')
  if (!url) fallar('Falta SLOTH_NUBE en las variables del usuario (ver nube/wrangler.jsonc).')
  const res = await fetch(`${url}/publicaciones`, { headers: { authorization: `Bearer ${leer('SLOTH_NUBE_SECRETO')}` } })
  if (!res.ok) fallar(`La nube respondió ${res.status}: ${await res.text()}`)
  const items = (await res.json()) as { ref: string; cuando: number; estado: string; error?: string; caption: string }[]
  // Sin `--todo`, solo lo que aún no sale o falló.
  for (const i of items.filter((i) => resto.includes('--todo') || i.estado !== 'publicado').sort((a, b) => a.cuando - b.cuando))
    console.log(`${new Date(i.cuando).toLocaleString('sv').slice(0, 16)}  ${i.estado.padEnd(10)} ${i.ref}  ${i.caption.replace(/\s+/g, ' ').slice(0, 60)}${i.error ? `\n    ${i.error}` : ''}`)
} else if (['quitar', 'reintentar', 'deshacer'].includes(orden)) {
  const [red, ref] = resto
  if (!red || !ref) fallar(`Uso: npm run redes -- ${orden} <tiktok|instagram> <ref>`)
  const res = await fetch(`http://127.0.0.1:${PORT}/api/redes/${orden}`, { method: 'POST', body: JSON.stringify({ red, ref, ruta: '' }) }).catch(() => fallar(`Sloth no responde en el puerto ${PORT} (el de este servidor está en $PORT).`))
  console.log(res.status, await res.text())
  if (!res.ok) process.exitCode = 1
} else {
  console.error('Órdenes: estado [--todo] · nube · quitar|reintentar|deshacer <red> <ref>')
  process.exitCode = 1
}
