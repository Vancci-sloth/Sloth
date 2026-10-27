import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// skills.ts fija ~/.claude/skills al cargarse: el inicio va a una carpeta de prueba antes de importarlo.
const casa = mkdtempSync(join(tmpdir(), 'sloth-skills-'))
process.env.HOME = casa
process.env.USERPROFILE = casa
const { enlazarSkills, enlazarSkillsCodex } = await import('./skills.ts')

test('Codex lee las mismas skills que Claude, y una copia vieja sale de sus carpetas', (t) => {
  t.after(() => rmSync(casa, { recursive: true, force: true }))
  const app = join(casa, 'app')
  for (const s of ['video-el-diff', 'reel-collage', 'otra']) {
    mkdirSync(join(app, 'skills', s), { recursive: true })
    writeFileSync(join(app, 'skills', s, 'SKILL.md'), `# ${s} de ahora`)
  }
  mkdirSync(join(app, 'skills', 'video-base'))
  writeFileSync(join(app, 'skills', 'LEEME.md'), '')
  enlazarSkills(app)
  const codex = join(casa, '.codex')
  const agents = join(casa, '.agents')
  // Una copia vieja suelta en cada carpeta, un enlace a otro sitio y una skill propia de Codex con otro nombre.
  for (const base of [codex, agents]) {
    mkdirSync(join(base, 'skills', 'video-el-diff'), { recursive: true })
    writeFileSync(join(base, 'skills', 'video-el-diff', 'SKILL.md'), '# vieja')
  }
  mkdirSync(join(casa, 'otro-sitio'))
  writeFileSync(join(casa, 'otro-sitio', 'SKILL.md'), '# de otro sitio')
  symlinkSync(join(casa, 'otro-sitio'), join(codex, 'skills', 'reel-collage'), 'junction')
  mkdirSync(join(codex, 'skills', 'propia'))

  enlazarSkillsCodex(app, [codex, agents])
  enlazarSkillsCodex(app, [codex, agents])

  for (const base of [codex, agents]) {
    for (const s of ['video-el-diff', 'reel-collage', 'otra']) {
      assert.equal(realpathSync(join(base, 'skills', s)), realpathSync(join(app, 'skills', s)))
      assert.equal(readFileSync(join(base, 'skills', s, 'SKILL.md'), 'utf8'), `# ${s} de ahora`)
    }
    assert.equal(realpathSync(join(base, 'skills', 'video-base')), realpathSync(join(app, 'skills', 'video-base')))
    assert.ok(!existsSync(join(base, 'skills', 'LEEME.md')))
    const viejas = readdirSync(join(base, 'skills-viejas'))
    assert.equal(viejas.length, 1)
    assert.equal(readFileSync(join(base, 'skills-viejas', viejas[0], 'SKILL.md'), 'utf8'), '# vieja')
  }
  assert.ok(existsSync(join(codex, 'skills', 'propia')))
  assert.ok(existsSync(join(casa, 'otro-sitio', 'SKILL.md')))
})
