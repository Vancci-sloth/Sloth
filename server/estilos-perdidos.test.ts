import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import type { Card } from '../shared/types.ts'
import { conservarAnterior } from './anteriores.ts'
import { cuidarEstilos, mudarTuyas } from './estilos-perdidos.ts'

function escribir(archivo: string, texto: string) {
  mkdirSync(dirname(archivo), { recursive: true })
  writeFileSync(archivo, texto)
}

const EXPLICATIVO = { id: 'video-explicativo', title: 'Video explicativo', description: 'Explica.', skill: 'video-explicativo', icon: 'pizarra', etapas: [{ nombre: 'Guion', listo: 'guion.md', fase: 'guion' }] }
const NUEVO = { id: 'nuevo-estilo', title: 'Nuevo estilo', description: '', skill: 'crear-estilo', cwd: '{app}/skills' }

/** Una Sloth instalada recién actualizada: cards.json de la versión nueva y, en sus skills, las de Sloth y las tuyas. */
function sloth() {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-perdidos-'))
  const app = join(raiz, 'app')
  const originales = join(raiz, 'resources', 'skills')
  for (const s of ['video-explicativo', 'video-base', 'crear-estilo']) escribir(join(originales, s, 'SKILL.md'), `# ${s}\n`)
  escribir(join(app, 'skills', 'video-explicativo', 'SKILL.md'), '# Explicativo\n')
  escribir(join(app, 'skills', 'video-explicativo', 'plantilla', 'src', 'Video.tsx'), 'export {}\n')
  escribir(join(app, 'skills', 'video-explicativo', 'scripts', 'hacer.py'), '')
  escribir(join(app, 'skills', 'video-base', 'VOZ.md'), '')
  const tuyo = (id: string, titulo: string) => {
    escribir(join(app, 'skills', id, 'SKILL.md'), `---\nname: ${id}\ndescription: "Hace un video de ${titulo}. Úsala cuando pidan otro."\n---\n\n# ${titulo}\n\nLa voz, como dice ../video-base/VOZ.md.\n`)
    escribir(join(app, 'skills', id, 'plantilla', 'src', 'Video.tsx'), 'export {}\n')
    escribir(join(app, 'skills', id, 'scripts', 'hacer.py'), '')
  }
  escribir(join(app, 'cards.json'), JSON.stringify([EXPLICATIVO, NUEVO]))
  const tusCards = join(app, 'data', 'tus-cards.json')
  const tus = () => JSON.parse(readFileSync(tusCards, 'utf8')) as Partial<Card>[]
  return { raiz, app, originales, tuyo, tusCards, tus, fin: () => rmSync(raiz, { recursive: true, force: true }) }
}

test('un estilo tuyo que se quedó sin card la recupera de su hilo de «Nuevo estilo», tal como la escribió', () => {
  const s = sloth()
  try {
    s.tuyo('receta-rapida', 'Receta rápida')
    const card = { id: 'receta-rapida', title: 'Receta rápida', description: 'Una receta en 30 s.', skill: 'receta-rapida', version: '1.1', icon: 'claqueta', etapas: [{ nombre: 'Video', listo: 'out/*.mp4', fase: 'video' }] }
    const sesiones = join(s.app, 'data', 'sessions')
    escribir(join(sesiones, 'abc.json'), JSON.stringify({ id: 'abc', cardId: 'nuevo-estilo', createdAt: 1 }))
    // Primero una versión vieja de la card y después la buena, cada una en una herramienta distinta.
    const vieja = { ...card, title: 'Receta', version: '1.0' }
    escribir(join(sesiones, 'abc.jsonl'), [
      { t: 'text', delta: 'hola' },
      { t: 'tool', name: 'Write', input: { file_path: 'C:/x/data/tus-cards.json', content: JSON.stringify([vieja], null, 2) } },
      { t: 'tool', name: 'Edit', input: { file_path: 'C:/x/data/tus-cards.json', old_string: '"version": "1.0"', new_string: '"version": "1.1"' } },
      { t: 'tool', name: 'Bash', input: { command: `node -e "x" && cat > ../data/tus-cards.json <<'F'\n${JSON.stringify([card], null, 2)}\nF` } }
    ].map((e) => JSON.stringify(e)).join('\n'))
    assert.deepEqual(cuidarEstilos({ app: s.app, originales: s.originales }), ['receta-rapida'])
    assert.deepEqual(s.tus(), [card])
    // Ya tiene su card: la siguiente vez no hace nada.
    assert.deepEqual(cuidarEstilos({ app: s.app, originales: s.originales }), [])
  } finally {
    s.fin()
  }
})

test('sin hilo, la card se rehace con su SKILL.md y el estilo de Sloth del que partió; no toca las demás ni lo que no es estilo', () => {
  const s = sloth()
  try {
    s.tuyo('receta-rapida', 'Receta rápida')
    s.tuyo('ya-tiene', 'Ya tiene')
    escribir(join(s.app, 'skills', 'otra-cosa', 'SKILL.md'), '# Una skill que no es un estilo\n')
    escribir(s.tusCards, '\uFEFF' + JSON.stringify([{ id: 'ya-tiene', title: 'La mía', description: '', skill: 'ya-tiene' }]))
    assert.deepEqual(cuidarEstilos({ app: s.app, originales: s.originales }), ['receta-rapida'])
    const [mia, rehecha] = s.tus()
    assert.equal(mia.title, 'La mía')
    assert.deepEqual(rehecha, {
      title: 'Receta rápida',
      description: 'Hace un video de Receta rápida.',
      icon: 'pizarra',
      etapas: EXPLICATIVO.etapas,
      version: '1.0',
      basadoEn: 'video-explicativo',
      id: 'receta-rapida',
      skill: 'receta-rapida'
    })
  } finally {
    s.fin()
  }
})

test('una card tuya que un agente puso en cards.json pasa a tus-cards.json, que la siguiente versión no reemplaza', () => {
  const s = sloth()
  try {
    s.tuyo('receta-rapida', 'Receta rápida')
    const card = { id: 'receta-rapida', title: 'Receta rápida', description: 'x', skill: 'receta-rapida', cwd: 'C:/x', etapas: [] }
    escribir(join(s.app, 'cards.json'), JSON.stringify([EXPLICATIVO, NUEVO, card]))
    escribir(s.tusCards, JSON.stringify([{ id: 'otra', title: 'Otra', skill: 'otra' }]))
    assert.deepEqual(mudarTuyas({ app: s.app, originales: s.originales }), ['receta-rapida'])
    assert.deepEqual(JSON.parse(readFileSync(join(s.app, 'cards.json'), 'utf8')), [EXPLICATIVO, NUEVO])
    const { cwd: _, ...sinCwd } = card
    assert.deepEqual(s.tus(), [{ id: 'otra', title: 'Otra', skill: 'otra' }, sinCwd])
  } finally {
    s.fin()
  }
})

test('«Guardar también el de antes» no pisa un tus-cards.json que no se lee: lo aparta', () => {
  const s = sloth()
  try {
    const datos = join(s.app, 'data')
    escribir(join(datos, 'estilos-anteriores', 'video-explicativo', 'SKILL.md'), '---\nname: video-explicativo\ndescription: Explica.\n---\n')
    escribir(join(datos, 'estilos-anteriores', 'video-explicativo.json'), JSON.stringify({ fecha: '2026-11-07', texto: 't', card: { title: 'Video explicativo' }, adaptar: [] }))
    escribir(s.tusCards, '[{"id": "mio", "title": "Mío", "skill": "mio"},]')
    conservarAnterior({ card: { ...EXPLICATIVO, cwd: '' } as Card, datos, skills: join(s.app, 'skills'), tusCards: s.tusCards })
    assert.deepEqual(s.tus().map((c) => c.id), ['video-explicativo-2026-11-07'])
    const apartado = readdirSync(datos).find((f) => f.startsWith('tus-cards ') && f.endsWith('que no se leía.json'))
    assert.ok(apartado, 'El tus-cards.json que no se leía debe quedar aparte')
    assert.match(readFileSync(join(datos, apartado), 'utf8'), /"Mío"/)
  } finally {
    s.fin()
  }
})
