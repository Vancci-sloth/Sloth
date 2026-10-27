import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import type { Card } from '../shared/types.ts'

// skills.ts fija ~/.claude/skills y la original al cargarse: van a una carpeta de prueba antes de importarlo.
const casa = mkdtempSync(join(tmpdir(), 'sloth-originales-'))
process.env.HOME = casa
process.env.USERPROFILE = casa
const originales = join(casa, 'resources', 'skills')
process.env.SLOTH_SKILLS_ORIGINALES = originales
const { cambiosDeCard, volverAOriginal } = await import('./skills.ts')

const escribir = (f: string, texto: string) => (mkdirSync(dirname(f), { recursive: true }), writeFileSync(f, texto))

test('la card dice qué cambiaste en su skill y en video-base, y vuelve a la original sin perder lo tuyo', (t) => {
  t.after(() => rmSync(casa, { recursive: true, force: true }))
  for (const raiz of [originales, join(casa, '.claude', 'skills')]) {
    escribir(join(raiz, 'video-el-diff', 'SKILL.md'), '# El Diff\nLee video-base.\n')
    escribir(join(raiz, 'video-el-diff', 'guion', 'tono.md'), 'seco\n')
    escribir(join(raiz, 'video-el-diff', 'logo.png'), 'png')
    escribir(join(raiz, 'video-base', 'PORTADA.md'), 'portada\n')
    escribir(join(raiz, 'otra', 'SKILL.md'), '# otra\n')
  }
  const skills = join(casa, '.claude', 'skills')
  // Lo que le pidió el usuario a su agente, un CRLF que no cambia nada, lo que guarda la skill y una skill que no es suya.
  writeFileSync(join(skills, 'video-el-diff', 'guion', 'tono.md'), 'alegre\n')
  writeFileSync(join(skills, 'video-el-diff', 'SKILL.md'), '# El Diff\r\nLee video-base.\r\n')
  rmSync(join(skills, 'video-el-diff', 'logo.png'))
  writeFileSync(join(skills, 'video-base', 'PORTADA.md'), 'portada roja\n')
  escribir(join(skills, 'video-el-diff', 'huellas', 'registro.jsonl'), '{}\n')
  escribir(join(skills, 'video-el-diff', 'node_modules', 'x.js'), '')
  writeFileSync(join(skills, 'otra', 'SKILL.md'), '# cambiada\n')

  const cards = [{ id: 'el-diff', skill: 'video-el-diff' }, { id: 'otra', skill: 'otra' }] as Card[]
  const datos = join(casa, 'data')
  const cambios = () => cambiosDeCard(cards[0], cards, datos)!.cambios
  assert.deepEqual(new Set(cambios()), new Set([
    { skill: 'video-el-diff', archivo: 'guion/tono.md' },
    { skill: 'video-el-diff', archivo: 'logo.png', borrado: true },
    { skill: 'video-base', archivo: 'PORTADA.md' }
  ]))

  // Un archivo solo: los demás siguen cambiados, y lo que tenías queda en la copia.
  volverAOriginal(cards[0], cards, datos, { skill: 'video-base', archivo: 'PORTADA.md' })
  assert.equal(readFileSync(join(skills, 'video-base', 'PORTADA.md'), 'utf8'), 'portada\n')
  assert.equal(cambios().length, 2)
  const { copia } = cambiosDeCard(cards[0], cards, datos)!
  assert.match(copia!, /antes de volver a la original$/)
  assert.equal(readFileSync(join(copia!, 'video-base', 'PORTADA.md'), 'utf8'), 'portada roja\n')

  // Entera: vuelve lo borrado, lo de tus videos se queda y la otra skill no se toca.
  volverAOriginal(cards[0], cards, datos)
  assert.deepEqual(cambios(), [])
  assert.equal(readFileSync(join(skills, 'video-el-diff', 'guion', 'tono.md'), 'utf8'), 'seco\n')
  assert.ok(existsSync(join(skills, 'video-el-diff', 'logo.png')))
  assert.ok(existsSync(join(skills, 'video-el-diff', 'huellas', 'registro.jsonl')))
  assert.equal(readFileSync(join(skills, 'otra', 'SKILL.md'), 'utf8'), '# cambiada\n')
  const copias = readdirSync(join(datos, 'skills-tuyas'))
  assert.ok(copias.some((c) => existsSync(join(datos, 'skills-tuyas', c, 'video-el-diff', 'guion', 'tono.md'))))
})
