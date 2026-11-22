// Los estilos de Sloth dentro de la app del celular, para el modo «Solo en el celular» (ADR 0025): cada card de video de
// `cards.json` con el SKILL.md de su skill, que el agente del celular sigue en lo que no necesita correr programas.
// `node scripts/estilos.mjs` (en `movil/`) los escribe en `src/local/estilos.json`; `src/local/estilos.test.ts` avisa si
// quedaron atrás de las cards o las skills.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MOVIL = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(MOVIL, '..')

/** Lo que lleva cada estilo: lo que dibuja su card y lo que lee el agente. Solo los de video: «Nuevo estilo» escribe skills. */
export function estilos(repo = REPO) {
  const cards = JSON.parse(readFileSync(join(repo, 'cards.json'), 'utf8'))
  return cards
    .filter((c) => c.etapas?.length && c.skill)
    .map((c) => {
      const ruta = join(repo, 'skills', c.skill, 'SKILL.md')
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        icon: c.icon,
        version: c.version,
        voz: c.voz,
        musica: c.musica,
        guia: c.guia,
        etapas: c.etapas.map((e) => ({ nombre: e.nombre, fase: e.fase, espera: e.espera })),
        skill: c.skill,
        instrucciones: existsSync(ruta) ? readFileSync(ruta, 'utf8') : ''
      }
    })
}

export const texto = (repo = REPO) => `${JSON.stringify(estilos(repo), null, 1)}\n`

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(MOVIL, 'src', 'local', 'estilos.json'), texto())
  console.log('Estilos del celular al día: src/local/estilos.json')
}
