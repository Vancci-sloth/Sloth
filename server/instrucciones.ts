import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillRef } from './agent.ts'
import { OPCIONES } from './claude.ts'
import { mcpVoz } from './voz/index.ts'
import { navegadorAgente } from './navegador-agente.ts'
import { SKILLS } from './skills.ts'

/**
 * Lo que Sloth le dice a los agentes que no son Claude (Codex lo recibe en `developerInstructions`; OpenCode, Grok,
 * Antigravity, Cursor, Muse y Pi, como instrucciones de su sesión o al principio del primer mensaje): los botones de las
 * respuestas, el español, sin preguntas interactivas y dónde están las skills de Sloth.
 */
export const INSTRUCCIONES = `${OPCIONES}
La interfaz y tus respuestas van en español, también lo que dices mientras trabajas (en una prueba con Big Pickle, las notas de avance salían en inglés). Haz las preguntas en mensajes normales, sin herramientas de preguntas interactivas. Las skills de Sloth están en ${SKILLS}. La skill invocada es siempre la de esa carpeta: si ves otra con el mismo nombre, es una copia vieja y no se usa. Respeta la skill invocada y lee sus referencias cuando hagan falta.`

/** La ruta del SKILL.md de la skill que invoca el mensaje. Falla si no está. */
function rutaSkill(skill: SkillRef): string {
  const path = skill.path ?? join(SKILLS, skill.name, 'SKILL.md')
  if (!existsSync(path)) throw new Error(`No se encontró la skill ${skill.name}.`)
  return path
}

/**
 * El mensaje con la skill que invoca, por su ruta, como con Codex y OpenCode: los agentes que no conocen las skills de
 * Sloth la leen de ahí, y los que las conocen no usan otra copia con ese nombre.
 */
export const conSkill = (text: string, skill?: SkillRef) => (skill ? `Usa la skill ${skill.name} de Sloth, la de ${rutaSkill(skill)} (no otra copia con ese nombre).\n\n${text}` : text)

/** El MCP de stdio, como lo dan `navegadorAgente` y `mcpVoz`. */
interface McpLocal {
  command: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * Los MCP de Sloth para el agente de un hilo: su navegador y la voz de AI Studio. Las herramientas de Ideas corren dentro
 * del servidor de Sloth: como con Codex, solo llegan a Claude.
 */
export function mcpSloth(lote?: boolean, hilo?: string): Record<string, McpLocal> {
  const todos = { ...navegadorAgente(lote, hilo), ...mcpVoz() } as Record<string, { command: string; args?: string[]; env?: Record<string, string | undefined> }>
  return Object.fromEntries(
    Object.entries(todos).map(([nombre, s]) => [
      nombre,
      { command: s.command, args: s.args ?? [], env: Object.fromEntries(Object.entries(s.env ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string')) }
    ])
  )
}
