import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import type { Card } from '../shared/types.ts'

// skills.ts fija ~/.claude/skills y la original al cargarse: van a una carpeta de prueba antes de importarlo. Como en la
// app que se vende, los agentes leen las skills de ~/.claude/skills (`SLOTH_SKILLS`).
const casa = mkdtempSync(join(tmpdir(), 'sloth-originales-'))
process.env.HOME = casa
process.env.USERPROFILE = casa
process.env.SLOTH_SKILLS = join(casa, '.claude', 'skills')
const originales = join(casa, 'resources', 'skills')
process.env.SLOTH_SKILLS_ORIGINALES = originales
const { cambiosDeCard, volverAOriginal } = await import('./skills.ts')
const { cambiosDe, huellas, quitarViejos } = await import('./originales.ts')

const escribir = (f: string, texto: string) => (mkdirSync(dirname(f), { recursive: true }), writeFileSync(f, texto))

test('la card dice qué cambiaste en su skill y en video-base, y vuelve a la original sin perder lo tuyo', async (t) => {
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
  const cambios = async () => (await cambiosDeCard(cards[0], cards, datos))!.cambios
  assert.deepEqual(new Set(await cambios()), new Set([
    { skill: 'video-el-diff', archivo: 'guion/tono.md' },
    { skill: 'video-el-diff', archivo: 'logo.png', borrado: true },
    { skill: 'video-base', archivo: 'PORTADA.md' }
  ]))

  // Un archivo solo: los demás siguen cambiados, y lo que tenías queda en la copia.
  await volverAOriginal(cards[0], cards, datos, { skill: 'video-base', archivo: 'PORTADA.md' })
  assert.equal(readFileSync(join(skills, 'video-base', 'PORTADA.md'), 'utf8'), 'portada\n')
  assert.equal((await cambios()).length, 2)
  const { copia } = (await cambiosDeCard(cards[0], cards, datos))!
  assert.match(copia!, /antes de volver a la original$/)
  assert.equal(readFileSync(join(copia!, 'video-base', 'PORTADA.md'), 'utf8'), 'portada roja\n')

  // Entera: vuelve lo borrado, lo de tus videos se queda y la otra skill no se toca.
  await volverAOriginal(cards[0], cards, datos)
  assert.deepEqual(await cambios(), [])
  assert.equal(readFileSync(join(skills, 'video-el-diff', 'guion', 'tono.md'), 'utf8'), 'seco\n')
  assert.ok(existsSync(join(skills, 'video-el-diff', 'logo.png')))
  assert.ok(existsSync(join(skills, 'video-el-diff', 'huellas', 'registro.jsonl')))
  assert.equal(readFileSync(join(skills, 'otra', 'SKILL.md'), 'utf8'), '# cambiada\n')
  const copias = readdirSync(join(datos, 'skills-tuyas'))
  assert.ok(copias.some((c) => existsSync(join(datos, 'skills-tuyas', c, 'video-el-diff', 'guion', 'tono.md'))))
})

test('ver qué cambió no detiene el servidor, y ve lo que cambia después aunque mida lo mismo', async (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-huellas-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  for (const base of ['original', 'actual']) for (let i = 0; i < 200; i++) escribir(join(raiz, base, `${i}.md`), `texto ${i}\n`)
  const ver = async () => {
    let vueltas = 0
    let acabo = false
    const girar = () => {
      vueltas++
      if (!acabo) setImmediate(girar)
    }
    girar()
    const cambios = await cambiosDe(join(raiz, 'original'), join(raiz, 'actual'), 'skill').finally(() => (acabo = true))
    return { cambios, vueltas }
  }
  const primera = await ver()
  assert.deepEqual(primera.cambios, [])
  // Cuántas depende de la máquina, de 3 a miles; de golpe serían 1 o 2.
  assert.ok(primera.vueltas > 2, 'el servidor sigue atendiendo mientras tanto')

  const f = join(raiz, 'actual', '7.md')
  writeFileSync(f, 'cambiado\n'.padEnd(statSync(f).size))
  utimesSync(f, new Date(), new Date(Date.now() + 5000))
  assert.deepEqual((await ver()).cambios, [{ skill: 'skill', archivo: '7.md' }])
  rmSync(f)
  assert.deepEqual((await ver()).cambios, [{ skill: 'skill', archivo: '7.md', borrado: true }])
})

test('al estrenar una versión se va lo que ya no trae, pero no lo que cambiaste ni lo tuyo', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-viejos-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const vieja = join(raiz, 'vieja')
  const nueva = join(raiz, 'nueva')
  const actual = join(raiz, 'actual')
  for (const base of [vieja, actual]) {
    escribir(join(base, 'video-el-diff', 'SKILL.md'), '# el diff\n')
    escribir(join(base, 'video-el-diff', 'scripts', 'costo.py'), 'print(1)\n')
    escribir(join(base, 'video-el-diff', 'scripts', 'voz.py'), 'print(2)\n')
    escribir(join(base, 'video-el-diff', 'viejo', 'solo.md'), 'nada\n')
  }
  escribir(join(nueva, 'video-el-diff', 'SKILL.md'), '# el diff nuevo\n')
  // El usuario cambió uno de los que se van, y tiene lo suyo (sus huellas), que ninguna versión trajo.
  escribir(join(actual, 'video-el-diff', 'scripts', 'voz.py'), 'print(3)\n')
  escribir(join(actual, 'video-el-diff', 'huellas', 'registro.jsonl'), '{}\n')

  const quitados = quitarViejos(huellas(vieja), nueva, actual)
  assert.deepEqual(new Set(quitados), new Set(['video-el-diff/scripts/costo.py', 'video-el-diff/viejo/solo.md']))
  assert.ok(!existsSync(join(actual, 'video-el-diff', 'scripts', 'costo.py')))
  // La carpeta que quedó vacía se va; la de la skill, no.
  assert.ok(!existsSync(join(actual, 'video-el-diff', 'viejo')))
  assert.ok(existsSync(join(actual, 'video-el-diff', 'scripts')))
  assert.equal(readFileSync(join(actual, 'video-el-diff', 'scripts', 'voz.py'), 'utf8'), 'print(3)\n')
  assert.ok(existsSync(join(actual, 'video-el-diff', 'huellas', 'registro.jsonl')))
  assert.ok(existsSync(join(actual, 'video-el-diff', 'SKILL.md')))
  // Sin la lista de la versión de antes, no se sabe qué era de Sloth: no se quita nada.
  assert.deepEqual(quitarViejos({}, nueva, actual), [])
})
