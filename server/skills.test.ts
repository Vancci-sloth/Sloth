import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// skills.ts fija ~/.claude/skills al cargarse: el inicio va a una carpeta de prueba antes de importarlo.
const casa = mkdtempSync(join(tmpdir(), 'sloth-skills-'))
process.env.HOME = casa
process.env.USERPROFILE = casa
// Y las skills como las trae Sloth, que `guardarSkillTuya` no toca.
const originales = mkdtempSync(join(tmpdir(), 'sloth-originales-'))
mkdirSync(join(originales, 'video-base'))
process.env.SLOTH_SKILLS_ORIGINALES = originales
const { configClaude, enlazarSkills, enlazarSkillsCodex, guardarSkillTuya, heredarSesion } = await import('./skills.ts')

test('la configuración propia de Claude: en la que se vende, sus skills y la sesión de ~/.claude, sin settings, plugins ni hooks', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-config-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const usuario = join(raiz, 'usuario')
  const suya = join(usuario, '.claude')
  for (const d of ['skills/video-el-diff', 'projects/hilo-viejo', 'plugins/otro']) mkdirSync(join(suya, d), { recursive: true })
  writeFileSync(join(suya, '.credentials.json'), '{"claudeAiOauth":{"accessToken":"a"}}')
  writeFileSync(join(suya, 'settings.json'), '{"hooks":{"PreToolUse":[]},"enabledPlugins":{"otro":true}}')
  writeFileSync(join(suya, 'CLAUDE.md'), 'reglas globales')
  writeFileSync(join(usuario, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c' }, userID: 'u', hasCompletedOnboarding: true, mcpServers: { x: {} }, projects: {} }))
  const app = join(raiz, 'app')
  mkdirSync(join(app, 'skills'), { recursive: true })

  const dir = configClaude(app, true, suya)
  assert.equal(dir, join(app, 'data', 'claude'))
  assert.deepEqual(readdirSync(dir).sort(), ['.claude.json', '.credentials.json', 'projects', 'skills'])
  assert.equal(realpathSync(join(dir, 'skills')), realpathSync(join(suya, 'skills')))
  assert.ok(existsSync(join(dir, 'projects', 'hilo-viejo')), 'los hilos de antes se pueden seguir')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.claude.json'), 'utf8')), { oauthAccount: { emailAddress: 'a@b.c' }, userID: 'u', hasCompletedOnboarding: true })
  // Una vez: si ya hay sesión (otra cuenta, o el token ya se renovó aquí), no se pisa.
  writeFileSync(join(dir, '.credentials.json'), '{"propia":true}')
  assert.equal(heredarSesion(dir, suya), false)
  assert.equal(readFileSync(join(dir, '.credentials.json'), 'utf8'), '{"propia":true}')

  // En el repo, las skills son las del repo y no se copia ninguna sesión.
  const repo = join(raiz, 'repo')
  mkdirSync(join(repo, 'skills'), { recursive: true })
  const dev = configClaude(repo, false, suya)
  assert.deepEqual(readdirSync(dev), ['skills'])
  assert.equal(realpathSync(join(dev, 'skills')), realpathSync(join(repo, 'skills')))
})

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

test('borrar un estilo tuyo guarda su skill en una copia y quita sus enlaces, sin tocar las de Sloth', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-tuya-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  t.after(() => rmSync(originales, { recursive: true, force: true }))
  const app = join(raiz, 'app')
  for (const s of ['mio', 'video-base']) {
    mkdirSync(join(app, 'skills', s), { recursive: true })
    writeFileSync(join(app, 'skills', s, 'SKILL.md'), `# ${s}`)
  }
  const enlaces = join(raiz, 'enlaces')
  mkdirSync(enlaces)
  for (const s of ['mio', 'video-base']) symlinkSync(join(app, 'skills', s), join(enlaces, s), 'junction')

  const copia = guardarSkillTuya(app, 'mio', join(app, 'data'), [enlaces])
  assert.ok(copia && /estilo borrado mio$/.test(copia))
  assert.equal(readFileSync(join(copia, 'mio', 'SKILL.md'), 'utf8'), '# mio')
  assert.ok(!existsSync(join(app, 'skills', 'mio')))
  assert.ok(!readdirSync(enlaces).includes('mio'))

  assert.equal(guardarSkillTuya(app, 'video-base', join(app, 'data'), [enlaces]), undefined)
  assert.ok(existsSync(join(app, 'skills', 'video-base', 'SKILL.md')))
  assert.ok(existsSync(join(enlaces, 'video-base', 'SKILL.md')))
})
