import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Card, CambiosCard, Serie } from '../shared/types.ts'
import type { SkillRef } from './agent.ts'
import { guardar } from './disco.ts'
import { cambiosDe, nombreCopia, respaldar, restaurar } from './originales.ts'

const ROOT = join(homedir(), '.claude', 'skills')

/**
 * La app que se vende trae sus skills en `<app>/skills`, y Claude las busca en ~/.claude/skills: enlaza ahí, con una unión
 * como la del repo, cada una que falte. Las que ya están no se tocan, que pueden ser del usuario; solo se rehace la unión
 * que apunta a una carpeta que ya no existe (Sloth se movió de sitio).
 */
export function enlazarSkills(app: string) {
  mkdirSync(ROOT, { recursive: true })
  for (const nombre of readdirSync(join(app, 'skills'))) {
    const destino = join(ROOT, nombre)
    if (existsSync(destino)) continue
    try {
      try {
        if (lstatSync(destino).isSymbolicLink()) unlinkSync(destino)
      } catch { /* No había nada. */ }
      symlinkSync(join(app, 'skills', nombre), destino, 'junction')
    } catch (error) {
      console.error(`No se pudo enlazar la skill ${nombre} en ${ROOT}: ${error instanceof Error ? error.message : error}`)
    }
  }
}

/**
 * Codex no mira ~/.claude/skills: busca en las suyas (`$CODEX_HOME/skills` y `~/.agents/skills`), y si dos skills se
 * llaman igual no gana ninguna. Cada skill de Sloth se enlaza en las dos a la misma de Claude, para que los dos agentes
 * lean los mismos archivos y un cambio valga para ambos; Codex cuenta una sola vez lo que lleva al mismo sitio. Una copia
 * suelta con el nombre de una skill de Sloth (la de una versión de antes) sale a `skills-viejas`, donde Codex ya no la ve.
 */
export function enlazarSkillsCodex(app: string, bases = [process.env.CODEX_HOME || join(homedir(), '.codex'), join(homedir(), '.agents')]) {
  for (const base of bases) {
    const carpeta = join(base, 'skills')
    mkdirSync(carpeta, { recursive: true })
    for (const nombre of readdirSync(join(app, 'skills'))) {
      // También las que no son una skill sino lo que comparten (`video-base`), que las demás leen a su lado.
      const de = carpetaSkill(nombre)
      if (!de || !statSync(de).isDirectory()) continue
      const destino = join(carpeta, nombre)
      try {
        const origen = realpathSync(de)
        let enlace = false
        try {
          enlace = lstatSync(destino).isSymbolicLink()
        } catch { /* No había nada. */ }
        if (enlace && existsSync(destino) && realpathSync(destino) === origen) continue
        if (enlace) unlinkSync(destino)
        else if (existsSync(destino)) {
          mkdirSync(join(base, 'skills-viejas'), { recursive: true })
          renameSync(destino, join(base, 'skills-viejas', `${nombre}-${Date.now()}`))
        }
        symlinkSync(origen, destino, 'junction')
      } catch (error) {
        console.error(`No se pudo enlazar la skill ${nombre} en ${carpeta}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }
}

/**
 * La carpeta de la skill que usan los agentes (la de ~/.claude/skills), si está. Lo que una skill guarda al trabajar va
 * ahí, que puede no ser `<app>/skills`: en la máquina del repo es el repo, o la de una instalación de antes.
 */
export function carpetaSkill(name: string): string | undefined {
  const dir = join(ROOT, name)
  return existsSync(dir) ? dir : undefined
}

/** La skill, si está instalada. `undefined` si no. */
export function skillRef(name: string): SkillRef | undefined {
  const path = join(ROOT, name, 'SKILL.md')
  return existsSync(path) ? { name, path } : undefined
}

/** En la app que se vende, las skills como las trae esta versión (`server/originales.ts`). En el repo no hay. */
const ORIGINALES = process.env.SLOTH_SKILLS_ORIGINALES

/**
 * Las skills de una card que tienen original: la suya y las bases que nombra su SKILL.md (video-base, modelos-3d), que
 * no son de ninguna card. Un cambio en video-base también cambia sus videos.
 */
function skillsDeCard(card: Card, todas: Card[]): string[] {
  if (!ORIGINALES || !card.skill || !existsSync(join(ORIGINALES, card.skill))) return []
  const deCards = new Set(todas.flatMap((c) => (c.skill ? [c.skill] : [])))
  let texto = ''
  try {
    texto = readFileSync(join(ORIGINALES, card.skill, 'SKILL.md'), 'utf8')
  } catch { /* Sin SKILL.md no nombra ninguna. */ }
  const bases = readdirSync(ORIGINALES, { withFileTypes: true }).filter((d) => d.isDirectory() && !deCards.has(d.name) && texto.includes(d.name))
  return [card.skill, ...bases.map((d) => d.name)]
}

/** Lo que cambiaste en las skills de una card y tu copia más nueva de ellas. `null` sin original con qué comparar. */
export function cambiosDeCard(card: Card, todas: Card[], datos: string): CambiosCard | null {
  if (!ORIGINALES) return null
  const skills = skillsDeCard(card, todas)
  const cambios = skills.flatMap((s) => {
    const dir = carpetaSkill(s)
    return dir ? cambiosDe(join(ORIGINALES, s), dir, s) : []
  })
  const tuyas = join(datos, 'skills-tuyas')
  const copia = existsSync(tuyas)
    ? readdirSync(tuyas).sort().reverse().find((c) => skills.some((s) => existsSync(join(tuyas, c, s))))
    : undefined
  return { cambios, ...(copia ? { copia: join(tuyas, copia) } : {}) }
}

/**
 * Vuelve a la original las skills de una card, o solo `uno` de sus archivos. Lo que se pisa se copia antes a
 * `data/skills-tuyas`, por si te arrepientes.
 */
export function volverAOriginal(card: Card, todas: Card[], datos: string, uno?: { skill: string; archivo: string }) {
  const cambios = (cambiosDeCard(card, todas, datos)?.cambios ?? []).filter((c) => !uno || (c.skill === uno.skill && c.archivo === uno.archivo))
  if (!ORIGINALES || !cambios.length) return
  respaldar(cambios, (s) => carpetaSkill(s)!, join(datos, 'skills-tuyas', nombreCopia('antes de volver a la original')))
  for (const s of new Set(cambios.map((c) => c.skill))) {
    restaurar(join(ORIGINALES, s), carpetaSkill(s)!, cambios.filter((c) => c.skill === s).map((c) => c.archivo))
  }
}

/** Las series de una skill: cada `series/<id>.md` de su carpeta, con el título de su primera línea `# `. */
export function seriesDe(skill: string): Serie[] {
  const dir = join(ROOT, skill, 'series')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ id: f.slice(0, -3), nombre: /^# (.+)$/m.exec(readFileSync(join(dir, f), 'utf8'))?.[1].trim() ?? f.slice(0, -3) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function readCards(file: string, appDir: string): Card[] {
  const cards = JSON.parse(readFileSync(file, 'utf8')) as Partial<Card>[]
  // Sin `cwd`, la card trabaja dentro de Sloth, en su propia carpeta. Una etapa sin `muestra` enseña lo de `listo`.
  return cards.map((c) => ({
    ...c,
    cwd: (c.cwd ?? `{app}/trabajo/${c.id}`).replace('{app}', appDir),
    ...(c.etapas ? { etapas: c.etapas.map((e) => ({ ...e, muestra: e.muestra ?? e.listo })) } : {})
  }) as Card)
}

/** Copia la card justo después de la original, con un id libre (`<id>-2`, `<id>-3`…). La skill es la misma. */
export function duplicateCard(file: string, id: string): string {
  const cards = JSON.parse(readFileSync(file, 'utf8')) as Partial<Card>[]
  const i = cards.findIndex((c) => c.id === id)
  if (i < 0) throw new Error('No existe esa card')
  let n = 2
  while (cards.some((c) => c.id === `${id}-${n}`)) n++
  const copy = { ...cards[i], id: `${id}-${n}`, title: `${cards[i].title} (copia)` }
  cards.splice(i + 1, 0, copy)
  guardar(file, JSON.stringify(cards, null, 2) + '\n')
  return copy.id
}

/** Quita la card de cards.json. La skill y los hilos que se hicieron con ella se quedan. */
export function removeCard(file: string, id: string) {
  const cards = JSON.parse(readFileSync(file, 'utf8')) as Partial<Card>[]
  if (!cards.some((c) => c.id === id)) throw new Error('No existe esa card')
  guardar(file, JSON.stringify(cards.filter((c) => c.id !== id), null, 2) + '\n')
}
