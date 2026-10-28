// Publica un anuncio en la comunidad como el creador: va a Anuncios y a todos les llega su aviso. Lo usa el agente que
// publica una versión (docs/agents/publicacion.md), con el texto que escribió en el tono de docs/agents/anuncios.md.
// El archivo lleva el título en el primer renglón y el texto debajo. La llave es la de `npm run publicar`
// (%APPDATA%\sloth\licencias\publicar.txt). Si ya hay un anuncio tuyo con ese título, no lo repite.
//   node scripts/anuncio.mjs <archivo> [--probar]   (--probar: dice qué publicaría, sin publicar)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const COBRO = 'https://api.sloth.vancci.org'
const archivo = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!archivo) {
  console.error('Uso: node scripts/anuncio.mjs <archivo> [--probar] (el título en el primer renglón, el texto debajo)')
  process.exit(1)
}
const [primero, ...resto] = readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n').trim().split('\n')
const titulo = primero.trim()
const texto = resto.join('\n').trim()
if (!titulo || !texto) {
  console.error('Falta el título (primer renglón) o el texto (debajo).')
  process.exit(1)
}
const LLAVE = (process.env.PUBLICAR || readFileSync(join(process.env.APPDATA ?? '', 'sloth', 'licencias', 'publicar.txt'), 'utf8')).trim()

async function comunidad(ruta, cuerpo) {
  const r = await fetch(`${COBRO}/comunidad${ruta}`, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${LLAVE}`, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
    body: cuerpo && JSON.stringify(cuerpo)
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`La comunidad respondió ${r.status}: ${j.error ?? ''}`)
  return j
}

const { publicaciones } = await comunidad('?categoria=anuncios')
if (publicaciones.some((p) => p.autor.creador && p.titulo === titulo)) {
  console.log(`Ya está publicado: «${titulo}».`)
  process.exit(0)
}
if (process.argv.includes('--probar')) {
  console.log(`Publicaría en Anuncios:\n\n${titulo}\n\n${texto}`)
  process.exit(0)
}
const p = await comunidad('/publicar', { categoria: 'anuncios', titulo, texto, adjuntos: [] })
console.log(`Publicado en Anuncios: «${p.titulo}» (${p.id}).`)
