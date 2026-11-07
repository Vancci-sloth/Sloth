import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Card, CambiosCard, Serie } from '../shared/types.ts'
import { VENTA } from '../shared/venta.ts'
import type { SkillRef } from './agent.ts'
import { guardar } from './disco.ts'
import { carpetaTrabajo } from './trabajo.ts'
import { cambiosDe, nombreCopia, respaldar, restaurar } from './originales.ts'

/**
 * Donde los agentes buscan las skills. En la app que se vende, ~/.claude/skills, donde las enlaza `enlazarSkills`. Desde
 * el repo, las del repo: su Claude tiene su propia configuración (`configClaude`) y no toca ~/.claude, que es de la
 * Sloth instalada en esta computadora; así esa funciona igual que en la de cualquier cliente. `SLOTH_SKILLS`, si ya viene
 * puesta, manda (las pruebas imitan así la app que se vende).
 */
/** Donde la app que se vende enlaza sus skills (`enlazarSkills`, `enlazarSkillsCodex`): la carpeta de Claude del usuario. */
const CASA = join(homedir(), '.claude', 'skills')
export const SKILLS = process.env.SLOTH_SKILLS || (VENTA ? CASA : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills'))

/**
 * ¿Claude trabaja con la configuración propia de Sloth (`configClaude`) o con la `~/.claude` del usuario? Desde el repo,
 * siempre con la propia. En la app que se vende, por omisión con la del usuario, como siempre; `SLOTH_CLAUDE_PROPIO=1`
 * la cambia a la propia, y es la que menos gasta: medido en un lote de 12 videos, el contexto de arranque pasó de 63 959 a
 * 18 130 tokens, porque cada hilo dejó de cargar los plugins, hooks, CLAUDE.md global y MCP del Claude Code del usuario
 * (unas 400 llamadas por video). Para que sea el modo de siempre, cambia el `=== '1'` por `!== '0'`.
 */
export const CLAUDE_PROPIO = VENTA ? process.env.SLOTH_CLAUDE_PROPIO === '1' : true

/**
 * La configuración de Claude propia de Sloth (`CLAUDE_CONFIG_DIR`), en `<app>/data/claude`. Solo trae las skills,
 * enlazadas: en el repo, a las del repo; en la que se vende, a ~/.claude/skills (`CASA`), donde `enlazarSkills` deja las
 * suyas y `guardarSkillTuya` las de cada quien. Su cuenta se conecta aparte, una vez, desde Sloth.
 *
 * En la que se vende, la sesión no se pierde: la primera vez se copian de ~/.claude solo las credenciales y la cuenta
 * (`heredarSesion`), nunca settings, plugins ni hooks; y `projects` apunta a ~/.claude/projects, para que los hilos de
 * antes se puedan seguir (`resume`).
 */
export function configClaude(app: string, venta = VENTA, casa = join(homedir(), '.claude')): string {
  const dir = join(app, 'data', 'claude')
  mkdirSync(dir, { recursive: true })
  enlazar(venta ? join(casa, 'skills') : join(app, 'skills'), join(dir, 'skills'))
  if (venta) {
    if (existsSync(join(casa, 'projects'))) enlazar(join(casa, 'projects'), join(dir, 'projects'))
    heredarSesion(dir, casa)
  }
  return dir
}

/** Una unión de `destino` a `origen`, si `destino` no existe aún. */
function enlazar(origen: string, destino: string) {
  try {
    if (existsSync(destino)) return
    mkdirSync(origen, { recursive: true })
    symlinkSync(origen, destino, 'junction')
  } catch (error) {
    console.error(`No se pudo enlazar ${origen} en ${destino}: ${error instanceof Error ? error.message : error}`)
  }
}

/**
 * Si la configuración de Sloth (`dir`) aún no tiene sesión, copia la del Claude Code del usuario (`casa`, ~/.claude): el
 * archivo de credenciales (`.credentials.json`, en Windows y Linux; en Mac viven en el llavero y se conecta una vez desde
 * Opciones) y, de `~/.claude.json` (al lado de `casa`), solo la cuenta (`oauthAccount`, `userID`) y que ya pasó la
 * bienvenida. Nada de settings, plugins, hooks ni MCP. Una sola vez: si ya hay credenciales, no se tocan. Devuelve si
 * copió algo.
 */
export function heredarSesion(dir: string, casa = join(homedir(), '.claude')): boolean {
  const credenciales = join(dir, '.credentials.json')
  if (existsSync(credenciales) || !existsSync(join(casa, '.credentials.json'))) return false
  try {
    copyFileSync(join(casa, '.credentials.json'), credenciales)
    const estado = join(dir, '.claude.json')
    const suyo = join(dirname(casa), '.claude.json')
    if (!existsSync(estado) && existsSync(suyo)) {
      const d = JSON.parse(readFileSync(suyo, 'utf8'))
      const cuenta = Object.fromEntries(['oauthAccount', 'userID', 'hasCompletedOnboarding', 'lastOnboardingVersion'].filter((k) => k in d).map((k) => [k, d[k]]))
      writeFileSync(estado, JSON.stringify(cuenta, null, 2))
    }
    return true
  } catch (error) {
    console.error(`No se pudo copiar la sesión de Claude a ${dir}: ${error instanceof Error ? error.message : error}`)
    return false
  }
}

/**
 * La app que se vende trae sus skills en `<app>/skills`, y Claude las busca en ~/.claude/skills: enlaza ahí, con una
 * unión, cada una que falte. Las que ya están no se tocan, que pueden ser del usuario; solo se rehace la unión que apunta
 * a una carpeta que ya no existe (Sloth se movió de sitio).
 */
export function enlazarSkills(app: string) {
  mkdirSync(CASA, { recursive: true })
  for (const nombre of readdirSync(join(app, 'skills'))) {
    const destino = join(CASA, nombre)
    if (existsSync(destino)) continue
    try {
      try {
        if (lstatSync(destino).isSymbolicLink()) unlinkSync(destino)
      } catch { /* No había nada. */ }
      symlinkSync(join(app, 'skills', nombre), destino, 'junction')
    } catch (error) {
      console.error(`No se pudo enlazar la skill ${nombre} en ${CASA}: ${error instanceof Error ? error.message : error}`)
    }
  }
}

/**
 * Codex no mira ~/.claude/skills: busca en las suyas (`$CODEX_HOME/skills` y `~/.agents/skills`), y si dos skills se
 * llaman igual no gana ninguna. Cada skill de Sloth se enlaza en las dos a la misma de Claude, para que los dos agentes
 * lean los mismos archivos y un cambio valga para ambos; Codex cuenta una sola vez lo que lleva al mismo sitio. Una copia
 * suelta con el nombre de una skill de Sloth (la de una versión de antes) sale a `skills-viejas`, donde Codex ya no la ve.
 */
export function enlazarSkillsCodex(app: string, bases = basesCodex()) {
  for (const base of bases) {
    const carpeta = join(base, 'skills')
    mkdirSync(carpeta, { recursive: true })
    for (const nombre of readdirSync(join(app, 'skills'))) {
      // También las que no son una skill sino lo que comparten (`video-base`), que las demás leen a su lado.
      const de = join(CASA, nombre)
      if (!existsSync(de) || !statSync(de).isDirectory()) continue
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

/** Donde busca Codex sus skills. */
const basesCodex = () => [process.env.CODEX_HOME || join(homedir(), '.codex'), join(homedir(), '.agents')]

/**
 * Al borrar un estilo tuyo, su skill sale de `<app>/skills` a una copia en `data/skills-tuyas`, por si te arrepientes, y
 * se quitan los enlaces de Claude y Codex que se quedaron sin ella. Una que trae Sloth no se toca. Devuelve la copia.
 */
export function guardarSkillTuya(app: string, skill: string, datos: string, enlaces = VENTA ? [CASA, ...basesCodex().map((b) => join(b, 'skills'))] : []) {
  const dir = join(app, 'skills', skill)
  if (!existsSync(dir) || (ORIGINALES && existsSync(join(ORIGINALES, skill)))) return undefined
  const copia = join(datos, 'skills-tuyas', nombreCopia(`estilo borrado ${skill}`))
  mkdirSync(copia, { recursive: true })
  try {
    renameSync(dir, join(copia, skill))
  } catch (error) {
    rmdirSync(copia)
    throw new Error(`No se pudo quitar su skill: algo tiene abierto un archivo de ${dir}. Ciérralo y vuelve a intentarlo. (${error instanceof Error ? error.message : error})`)
  }
  for (const carpeta of enlaces) {
    const enlace = join(carpeta, skill)
    try {
      if (lstatSync(enlace).isSymbolicLink() && !existsSync(enlace)) unlinkSync(enlace)
    } catch { /* No había enlace. */ }
  }
  return copia
}

/**
 * La carpeta de la skill que usan los agentes (la de `SKILLS`), si está. Lo que una skill guarda al trabajar va ahí, que
 * en la app que se vende puede no ser `<app>/skills`: la de una instalación de antes, o una del usuario con ese nombre.
 */
export function carpetaSkill(name: string): string | undefined {
  const dir = join(SKILLS, name)
  return existsSync(dir) ? dir : undefined
}

/** La skill, si está instalada. `undefined` si no. */
export function skillRef(name: string): SkillRef | undefined {
  const path = join(SKILLS, name, 'SKILL.md')
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
export async function cambiosDeCard(card: Card, todas: Card[], datos: string): Promise<CambiosCard | null> {
  if (!ORIGINALES) return null
  const skills = skillsDeCard(card, todas)
  const cambios = (await Promise.all(skills.map((s) => {
    const dir = carpetaSkill(s)
    return dir ? cambiosDe(join(ORIGINALES, s), dir, s) : []
  }))).flat()
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
export async function volverAOriginal(card: Card, todas: Card[], datos: string, uno?: { skill: string; archivo: string }) {
  const cambios = ((await cambiosDeCard(card, todas, datos))?.cambios ?? []).filter((c) => !uno || (c.skill === uno.skill && c.archivo === uno.archivo))
  if (!ORIGINALES || !cambios.length) return
  respaldar(cambios, (s) => carpetaSkill(s)!, join(datos, 'skills-tuyas', nombreCopia('antes de volver a la original')))
  for (const s of new Set(cambios.map((c) => c.skill))) {
    restaurar(join(ORIGINALES, s), carpetaSkill(s)!, cambios.filter((c) => c.skill === s).map((c) => c.archivo))
  }
}

/**
 * Las series de una skill: cada `series/<id>.md` de su carpeta, con el título de su primera línea `# `. Un estilo de
 * video tiene además las de `video-base/series` (`video-base/SERIES.md`); con el mismo id, la suya manda.
 */
export function seriesDe(skill: string, estilo: boolean): Serie[] {
  const series = new Map<string, Serie>()
  for (const carpeta of [...(estilo ? ['video-base'] : []), skill]) {
    const dir = join(SKILLS, carpeta, 'series')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const id = f.slice(0, -3)
      const nombre = /^# (.+)$/m.exec(readFileSync(join(dir, f), 'utf8'))?.[1].trim() ?? id
      series.set(id, { id, nombre, archivo: `${carpeta}/series/${f}` })
    }
  }
  return [...series.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function readCards(file: string, appDir: string): Card[] {
  const cards = JSON.parse(readFileSync(file, 'utf8')) as Partial<Card>[]
  if (!Array.isArray(cards)) throw new Error(`${file} no es una lista de cards`)
  // Sin `cwd`, la card trabaja en su propia carpeta de `carpetaTrabajo`. Una etapa sin `muestra` enseña lo de `listo`.
  // Una sin `id` (a medio escribir por un agente) no cuenta.
  return cards.filter((c) => typeof c?.id === 'string' && c.id).map((c) => ({
    ...c,
    cwd: c.cwd ? c.cwd.replace('{app}', appDir) : join(carpetaTrabajo(appDir), c.id!),
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

/** Quita la card de su archivo (cards.json o tus-cards.json). La skill y los hilos que se hicieron con ella se quedan. */
export function removeCard(file: string, id: string) {
  const cards = JSON.parse(readFileSync(file, 'utf8')) as Partial<Card>[]
  if (!cards.some((c) => c.id === id)) throw new Error('No existe esa card')
  guardar(file, JSON.stringify(cards.filter((c) => c.id !== id), null, 2) + '\n')
}
