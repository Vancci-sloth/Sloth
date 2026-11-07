import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import type { Card } from '../shared/types.ts'
import { anteriorDe, conservarAnterior, guardarAnteriores, olvidarAnterior, renombrar } from './anteriores.ts'
import { huella } from './originales.ts'

function escribir(archivo: string, texto: string) {
  mkdirSync(dirname(archivo), { recursive: true })
  writeFileSync(archivo, texto)
}

/** Una Sloth con el explicativo de antes puesto y la versión nueva por poner. */
function sloth() {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-anteriores-'))
  const skills = join(raiz, 'skills')
  const nuevas = join(raiz, 'resources', 'skills')
  const datos = join(raiz, 'data')
  escribir(join(skills, 'video-explicativo', 'SKILL.md'), '---\nname: video-explicativo\ndescription: Hace un video explicativo.\n---\n\nLee video-base/VOZ.md y video-base/LOTE.md.\n')
  escribir(join(skills, 'video-explicativo', 'plantilla', 'node_modules', 'x', 'index.js'), '')
  escribir(join(skills, 'video-explicativo', 'huellas', 'uno.json'), '{}')
  escribir(join(skills, 'video-base', 'VOZ.md'), 'la voz de antes')
  escribir(join(skills, 'video-base', 'LOTE.md'), 'el lote')
  escribir(join(nuevas, 'video-base', 'VOZ.md'), 'la voz nueva')
  escribir(join(nuevas, 'video-base', 'LOTE.md'), 'el lote')
  const originales = { 'video-base/VOZ.md': huella(join(skills, 'video-base', 'VOZ.md')), 'video-base/LOTE.md': huella(join(skills, 'video-base', 'LOTE.md')) }
  const card = {
    id: 'video-explicativo',
    skill: 'video-explicativo',
    title: 'Video explicativo',
    description: 'Explica cualquier tema.',
    icon: 'pizarra',
    etapas: [{ nombre: 'Revisión', listo: 'revision/hoja.png' }],
    modelos: { principal: { model: 'claude-sonnet-5-5', effort: 'medium' } },
    cambio: { fecha: '2026-11-07', texto: 'Sale en 5 min.', compara: 'https://ejemplo.org/compara', antes: { etapas: [{ nombre: 'Revisión', listo: 'revision/borrador-*.png' }], icon: null } }
  } as unknown as Card
  return { raiz, skills, nuevas, datos, originales, card }
}

test('al actualizar se guarda el estilo que cambia, sin lo que se rehace ni lo de cada quien, y una sola vez', () => {
  const s = sloth()
  try {
    assert.deepEqual(guardarAnteriores({ cards: [s.card], ...s }), ['video-explicativo'])
    const copia = join(s.datos, 'estilos-anteriores', 'video-explicativo')
    assert.ok(existsSync(join(copia, 'SKILL.md')))
    assert.ok(!existsSync(join(copia, 'plantilla', 'node_modules')))
    assert.ok(!existsSync(join(copia, 'huellas')))
    const g = JSON.parse(readFileSync(`${copia}.json`, 'utf8'))
    assert.deepEqual(g.card.etapas, [{ nombre: 'Revisión', listo: 'revision/borrador-*.png' }])
    assert.equal(g.card.icon, undefined)
    assert.equal(g.card.modelos, undefined)
    assert.deepEqual(g.adaptar, ['VOZ.md'])
    // Con las skills nuevas ya puestas, al abrir otra vez no se guarda el nuevo como si fuera el de antes.
    writeFileSync(join(s.skills, 'video-explicativo', 'SKILL.md'), '---\nname: video-explicativo\n---\nel nuevo')
    assert.deepEqual(guardarAnteriores({ cards: [s.card], ...s }), [])
    assert.match(readFileSync(join(copia, 'SKILL.md'), 'utf8'), /Hace un video explicativo/)
  } finally {
    rmSync(s.raiz, { recursive: true, force: true })
  }
})

test('quien instala de cero no tiene estilo de antes', () => {
  const s = sloth()
  try {
    rmSync(join(s.skills, 'video-explicativo'), { recursive: true })
    assert.deepEqual(guardarAnteriores({ cards: [s.card], ...s }), [])
    // Pero el aviso le sale igual, solo para leerlo, hasta que lo lee.
    assert.equal(anteriorDe(s.card, s.datos)?.guardado, false)
    olvidarAnterior(s.card, s.datos)
    assert.equal(anteriorDe(s.card, s.datos), null)
    // Y al volver a crear la carpeta (la versión ya puesta), tampoco: ese cambio ya lo tenía.
    escribir(join(s.skills, 'video-explicativo', 'SKILL.md'), 'el nuevo')
    assert.deepEqual(guardarAnteriores({ cards: [s.card], ...s }), [])
  } finally {
    rmSync(s.raiz, { recursive: true, force: true })
  }
})

test('guardar el de antes lo pone entre tus estilos con otro nombre, y el aviso se va', () => {
  const s = sloth()
  try {
    guardarAnteriores({ cards: [s.card], ...s })
    assert.deepEqual(anteriorDe(s.card, s.datos), { fecha: '2026-11-07', texto: 'Sale en 5 min.', compara: 'https://ejemplo.org/compara', titulo: 'Video explicativo (hasta el 7 nov 2026)', guardado: true })
    const tusCards = join(s.datos, 'tus-cards.json')
    const r = conservarAnterior({ card: s.card, datos: s.datos, skills: s.skills, tusCards })
    assert.deepEqual(r, { id: 'video-explicativo-2026-11-07', titulo: 'Video explicativo (hasta el 7 nov 2026)', adaptar: ['VOZ.md'] })
    const md = readFileSync(join(s.skills, r.id, 'SKILL.md'), 'utf8')
    assert.match(md, /^name: video-explicativo-2026-11-07$/m)
    assert.match(md, /^description: "Versión de «Video explicativo» de hasta el 7 nov 2026, .* Hace un video explicativo\."$/m)
    const [card] = JSON.parse(readFileSync(tusCards, 'utf8'))
    assert.equal(card.id, r.id)
    assert.equal(card.skill, r.id)
    assert.equal(card.basadoEn, 'video-explicativo')
    assert.equal(card.title, r.titulo)
    assert.equal(anteriorDe(s.card, s.datos), null)
    assert.throws(() => conservarAnterior({ card: s.card, datos: s.datos, skills: s.skills, tusCards }), /Ya no está guardado/)
  } finally {
    rmSync(s.raiz, { recursive: true, force: true })
  }
})

test('usar solo el nuevo borra la copia', () => {
  const s = sloth()
  try {
    guardarAnteriores({ cards: [s.card], ...s })
    olvidarAnterior(s.card, s.datos)
    assert.equal(anteriorDe(s.card, s.datos), null)
    assert.ok(!existsSync(join(s.datos, 'estilos-anteriores', 'video-explicativo')))
  } finally {
    rmSync(s.raiz, { recursive: true, force: true })
  }
})

test('renombrar cambia el name y antepone a la descripción, también entre comillas o sin frontmatter', () => {
  assert.equal(renombrar('---\nname: a\ndescription: "Hace: cosas"\n---\nx', 'b', 'Copia.'), '---\nname: b\ndescription: "Copia. Hace: cosas"\n---\nx')
  assert.equal(renombrar('# Sin cabeza', 'b', 'Copia.'), '---\nname: b\ndescription: Copia.\n---\n\n# Sin cabeza')
})
