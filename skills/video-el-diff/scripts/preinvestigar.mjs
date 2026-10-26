// Lo primero de un episodio, antes de pensar nada: lee los enlaces que trajo el usuario y, después, todo lo que esos
// enlazan (lo que enlaza un post, su cita, su hilo y las respuestas de su autor; el sitio de un repo). Así el modelo
// empieza con las fuentes primarias ya en el disco, en vez de buscarlas una por una. Tarda segundos.
//
//   node <skill>/scripts/preinvestigar.mjs <url> [<url> ...]
//
// Deja los textos en `fuentes/textos/` (ver leer.mjs) y un resumen en `fuentes/investigacion.md`: cada fuente con su
// título, fecha, archivo y el principio del texto. El video de YouTube del tema lo baja y transcribe `fuente.py`.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { leerTodas, linea } from './leer.mjs'

const urls = process.argv.slice(2).filter((u) => /^https?:\/\//.test(u))
if (!urls.length) {
  console.error('Uso: node preinvestigar.mjs <url> [<url> ...]')
  process.exit(1)
}
const t0 = Date.now()
// YouTube lo trae fuente.py (video y transcripción); aquí solo lo demás.
const yt = (u) => /youtube\.com|youtu\.be/.test(u)
const primeros = await leerTodas(urls.filter((u) => !yt(u)))
const vistos = new Set(urls)
const segundos = [...new Set(primeros.flatMap((r) => r.enlaces ?? []))].filter((u) => !vistos.has(u) && !yt(u)).slice(0, 30)
const enlazados = segundos.length ? await leerTodas(segundos) : []

const resumen = (r) => {
  if (r.error) return `- ERROR ${r.url}: ${r.error}`
  const texto = readFileSync(r.archivo, 'utf8').split('\n---\n')[1] ?? ''
  const principio = texto.replace(/\s+/g, ' ').trim().slice(0, 400)
  return `- **${r.titulo ?? r.url}** · ${r.fecha ?? 'sin fecha'} · \`${r.archivo}\` · ${r.palabras} palabras\n  ${r.url}\n  > ${principio}…`
}
const md = [
  '# Pre-investigación',
  '',
  `Leído el ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC con preinvestigar.mjs. Cada texto completo está en su archivo.`,
  '',
  '## Lo que trajo el usuario',
  '',
  ...primeros.map(resumen),
  '',
  '## Lo que esas fuentes enlazan',
  '',
  ...(enlazados.length ? enlazados.map(resumen) : ['(nada)']),
  ''
].join('\n')
mkdirSync('fuentes', { recursive: true })
writeFileSync(join('fuentes', 'investigacion.md'), md)
console.log([...primeros, ...enlazados].map(linea).join('\n'))
console.log(`\n${primeros.length + enlazados.length} fuentes en ${((Date.now() - t0) / 1000).toFixed(1)} s · resumen en fuentes/investigacion.md`)
