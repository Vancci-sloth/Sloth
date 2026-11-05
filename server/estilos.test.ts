import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import type { Card } from '../shared/types.ts'
import { compararVersion, EstiloMalo, empaquetar, instalar, leerPaquete } from './estilos.ts'

/** Una Sloth de prueba: video-base, un estilo de Sloth y, si se pide, uno tuyo. */
function sloth(conTuyo = true) {
  const app = mkdtempSync(join(tmpdir(), 'sloth-estilos-'))
  const poner = (ruta: string, texto: string) => {
    mkdirSync(dirname(join(app, ruta)), { recursive: true })
    writeFileSync(join(app, ruta), texto)
  }
  poner('skills/video-base/PORTADA.md', '# Portada\n')
  poner('skills/video-base/scripts/hoja.mjs', 'export {}\n')
  poner('skills/video-explicativo/SKILL.md', '# Explicativo\n')
  poner('skills/video-explicativo/plantilla/package.json', JSON.stringify({ dependencies: { remotion: '4', react: '19' } }))
  poner('skills/video-explicativo/plantilla/src/Video.tsx', 'export {}\n')
  if (conTuyo) {
    poner('skills/receta-rapida/SKILL.md', '# Receta\nLa portada, como dice ../video-base/PORTADA.md. Hoja: video-base/scripts/hoja.mjs.\n')
    poner('skills/receta-rapida/plantilla/package.json', JSON.stringify({ dependencies: { remotion: '4' } }))
    poner('skills/receta-rapida/plantilla/src/Video.tsx', 'export {}\n')
    poner('skills/receta-rapida/huellas/mio.json', '{}')
    poner('skills/receta-rapida/out/video.mp4', 'x')
    poner('skills/receta-rapida/herramienta.exe', 'MZ')
  }
  const deSloth = [{ skill: 'video-explicativo', carpeta: join(app, 'skills', 'video-explicativo') }]
  const cards: Card[] = [{ id: 'video-explicativo', title: 'Explicativo', description: '', skill: 'video-explicativo', cwd: '' }]
  const tuya: Card = { id: 'receta-rapida', title: 'Receta rápida', description: 'En 30 s.', skill: 'receta-rapida', cwd: 'C:/otra/parte', tuya: true, icon: 'claqueta', etapas: [{ nombre: 'Video', listo: 'out/*.mp4', fase: 'video' }] }
  return { app, poner, deSloth, cards, tuya, base: join(app, 'skills', 'video-base'), fin: () => rmSync(app, { recursive: true, force: true }) }
}

const empacar = (s: ReturnType<typeof sloth>, version = '0.3.44') => empaquetar({ card: s.tuya, carpeta: join(s.app, 'skills', 'receta-rapida'), sloth: version, base: s.base, deSloth: s.deSloth })

test('empaqueta la skill sin lo personal, lo rehecho ni programas, y sabe de cuál partió y qué usa de video-base', () => {
  const s = sloth()
  try {
    const { paquete, manifiesto } = empacar(s)
    assert.deepEqual(manifiesto.archivos.map((a) => a.ruta), ['plantilla/package.json', 'plantilla/src/Video.tsx', 'SKILL.md'].sort())
    assert.equal(manifiesto.basadoEn, 'video-explicativo')
    assert.deepEqual(Object.keys(manifiesto.usa), ['PORTADA.md', 'scripts/hoja.mjs'])
    // La carpeta de esta computadora no viaja.
    assert.equal(manifiesto.card.cwd, undefined)
    assert.equal(manifiesto.card.tuya, undefined)
    const { archivos } = leerPaquete(paquete)
    assert.match(archivos.get('SKILL.md')!.toString(), /^# Receta/)
  } finally {
    s.fin()
  }
})

test('no empaqueta un estilo con paquetes de npm que Sloth no trae', () => {
  const s = sloth()
  try {
    s.poner('skills/receta-rapida/plantilla/package.json', JSON.stringify({ dependencies: { remotion: '4', 'paquete-raro': '1' } }))
    assert.throws(() => empacar(s), /paquete-raro/)
  } finally {
    s.fin()
  }
})

test('lo instala en otra Sloth con su card y su origen, y lo pone al día si viene de lo mismo', () => {
  const de = sloth()
  const a = sloth(false)
  try {
    const { paquete } = empacar(de)
    const tusCards = join(a.app, 'data', 'tus-cards.json')
    const r = instalar({ paquete, app: a.app, tusCards, cards: a.cards, sloth: '0.3.44', base: a.base, deSloth: a.deSloth, origen: { publicacion: 'abc', llave: 'x.estilo', autor: 'Miteh' } })
    assert.deepEqual(r, { id: 'receta-rapida', titulo: 'Receta rápida', actualizado: false, adaptar: [], sloth: '0.3.44' })
    assert.ok(existsSync(join(a.app, 'skills', 'receta-rapida', 'SKILL.md')))
    assert.ok(!existsSync(join(a.app, 'skills', 'receta-rapida', 'huellas')))
    const [card] = JSON.parse(readFileSync(tusCards, 'utf8')) as Card[]
    assert.equal(card.basadoEn, 'video-explicativo')
    assert.deepEqual(card.origen, { publicacion: 'abc', llave: 'x.estilo', autor: 'Miteh', sloth: '0.3.44' })

    // Otra vez de la misma publicación: se pone al día y lo de antes se guarda.
    const ya = [...a.cards, { ...card, cwd: '', tuya: true }]
    const otra = instalar({ paquete, app: a.app, tusCards, cards: ya, sloth: '0.3.50', base: a.base, deSloth: a.deSloth, origen: { publicacion: 'abc', llave: 'y.estilo' } })
    assert.equal(otra.actualizado, true)
    assert.equal(readdirSync(join(a.app, 'data', 'skills-tuyas')).length, 1)
    assert.equal((JSON.parse(readFileSync(tusCards, 'utf8')) as Card[]).length, 1)

    // De otra publicación, o con el nombre de uno tuyo o de Sloth, no se toca.
    assert.throws(() => instalar({ paquete, app: a.app, tusCards, cards: ya, sloth: '0.3.50', base: a.base, deSloth: a.deSloth, origen: { publicacion: 'otra', llave: 'z.estilo' } }), /Ya tienes un estilo/)
    assert.throws(() => instalar({ paquete, app: a.app, tusCards, cards: [...a.cards, { ...card, origen: undefined, cwd: '', tuya: true }], sloth: '0.3.50', base: a.base, deSloth: a.deSloth }), /Ya tienes un estilo/)
  } finally {
    de.fin()
    a.fin()
  }
})

test('pide una Sloth al menos tan nueva y avisa qué cambió de video-base desde la suya', () => {
  const de = sloth()
  const a = sloth(false)
  try {
    const { paquete } = empacar(de, '0.3.44')
    const tusCards = join(a.app, 'data', 'tus-cards.json')
    assert.throws(() => instalar({ paquete, app: a.app, tusCards, cards: a.cards, sloth: '0.3.9', base: a.base, deSloth: a.deSloth }), /actualiza Sloth/)
    a.poner('skills/video-base/PORTADA.md', '# Portada nueva\n')
    const r = instalar({ paquete, app: a.app, tusCards, cards: a.cards, sloth: '0.4.0', base: a.base, deSloth: a.deSloth })
    assert.deepEqual(r.adaptar, ['PORTADA.md'])
  } finally {
    de.fin()
    a.fin()
  }
})

test('no abre un paquete que escribe fuera de su carpeta, trae un programa o no es un estilo', () => {
  const paquete = (rutas: string[]) => {
    const m = Buffer.from(JSON.stringify({ formato: 1, id: 'malo', sloth: '0.3.44', card: { title: 'Malo' }, usa: {}, archivos: [{ ruta: 'SKILL.md', bytes: 1 }, ...rutas.map((ruta) => ({ ruta, bytes: 1 }))] }))
    const largo = Buffer.alloc(4)
    largo.writeUInt32BE(m.length)
    return gzipSync(Buffer.concat([largo, m, Buffer.alloc(1 + rutas.length)]))
  }
  assert.ok(leerPaquete(paquete(['scripts/a.py'])))
  for (const ruta of ['../fuera.md', 'a/../../fuera.md', 'C:/Windows/x.md', 'a\\b.md', 'programa.exe', '/raiz.md']) assert.throws(() => leerPaquete(paquete([ruta])), EstiloMalo, ruta)
  assert.throws(() => leerPaquete(Buffer.from('hola')), /no es un estilo/)
})

test('compara versiones por número', () => {
  assert.equal(compararVersion('0.3.9', '0.3.44'), -1)
  assert.equal(compararVersion('0.4.0', '0.3.44'), 1)
  assert.equal(compararVersion('0.3.44', '0.3.44'), 0)
})
