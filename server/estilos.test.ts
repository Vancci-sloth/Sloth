import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import type { Card } from '../shared/types.ts'
import { compararVersion, desempacar, EstiloMalo, empaquetar, instalar, leerPaquete } from './estilos.ts'

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

test('una card con los acentos rotos sale del paquete, y se instala, con ellos bien; la de su autor no se toca', () => {
  const de = sloth()
  const a = sloth(false)
  try {
    de.tuya.title = 'Cuentos 3D CinematogrÃ¡ficos'
    de.tuya.description = 'Cortos con diÃ¡logos y crÃ©ditos.'
    de.tuya.etapas = [{ nombre: 'RevisiÃ³n', listo: 'guion.md', fase: 'guion' }, { nombre: 'Video', listo: 'out/final.mp4', fase: 'video' }]
    de.tuya.guia = { das: 'Solo el tema; genera tÃº los personajes.', entrega: 'Un cuento de 60 segundos.', ejemplo: 'Hazme uno de un portal.' }
    const { paquete, manifiesto } = empacar(de)
    assert.equal(manifiesto.titulo, 'Cuentos 3D Cinematográficos')
    assert.equal(manifiesto.card.description, 'Cortos con diálogos y créditos.')
    assert.equal(manifiesto.card.etapas![0].nombre, 'Revisión')
    assert.equal(manifiesto.card.guia!.das, 'Solo el tema; genera tú los personajes.')
    assert.equal(de.tuya.etapas[0].nombre, 'RevisiÃ³n')
    // Uno que ya se compartió con ellos rotos (hecho con una Sloth de antes) queda bien al abrirlo: al instalarlo o revisarlo.
    const roto = (() => {
      const cabeza = Buffer.from(JSON.stringify({ ...manifiesto, titulo: de.tuya.title, card: { ...manifiesto.card, title: de.tuya.title, description: de.tuya.description } }), 'utf8')
      const largo = Buffer.alloc(4)
      largo.writeUInt32BE(cabeza.length)
      const { archivos } = leerPaquete(paquete)
      return gzipSync(Buffer.concat([largo, cabeza, ...manifiesto.archivos.map((x) => archivos.get(x.ruta)!)]))
    })()
    const tusCards = join(a.app, 'data', 'tus-cards.json')
    assert.equal(instalar({ paquete: roto, app: a.app, tusCards, cards: a.cards, sloth: '0.3.44', base: a.base, deSloth: a.deSloth }).titulo, 'Cuentos 3D Cinematográficos')
    const [card] = JSON.parse(readFileSync(tusCards, 'utf8')) as Card[]
    assert.equal(card.title, 'Cuentos 3D Cinematográficos')
    assert.equal(card.description, 'Cortos con diálogos y créditos.')
  } finally {
    de.fin()
    a.fin()
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

test('la guía de uso viaja limpia en su card, y al instalarlo de la comunidad manda la de su publicación', () => {
  const de = sloth()
  const a = sloth(false)
  try {
    const guia = { das: 'Solo el tema de la receta.', entrega: 'Un vertical de 30 segundos.', ejemplo: 'Hazme la receta de unos chilaquiles.' }
    de.tuya.guia = { ...guia, das: '  Solo el tema\n de la receta.  ', necesita: '' }
    const { paquete, manifiesto } = empacar(de)
    assert.deepEqual(manifiesto.card.guia, guia)
    const tusCards = join(a.app, 'data', 'tus-cards.json')
    const leer = () => (JSON.parse(readFileSync(tusCards, 'utf8')) as Card[])[0]
    // De un archivo: la de su paquete.
    instalar({ paquete, app: a.app, tusCards, cards: a.cards, sloth: '0.3.44', base: a.base, deSloth: a.deSloth })
    assert.deepEqual(leer().guia, guia)
    // De la comunidad: la que su autor revisó al publicarlo.
    const publicada = { ...guia, ejemplo: 'Hazme la receta de un pozole rojo.' }
    instalar({ paquete, app: a.app, tusCards, cards: [...a.cards, { ...leer(), cwd: '', tuya: true }], sloth: '0.3.44', base: a.base, deSloth: a.deSloth, guia: publicada })
    assert.deepEqual(leer().guia, publicada)
    // Una que no dice nada no viaja.
    de.tuya.guia = { das: ' ', entrega: '', ejemplo: '' }
    assert.equal(empacar(de).manifiesto.card.guia, undefined)
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

test('el repo instala el de una Sloth más nueva: va por delante de lo publicado aunque su package.json diga una de antes', () => {
  const de = sloth()
  const a = sloth(false)
  try {
    const { paquete } = empacar(de, '0.3.44')
    const tusCards = join(a.app, 'data', 'tus-cards.json')
    assert.equal(instalar({ paquete, app: a.app, tusCards, cards: a.cards, sloth: '0.3.9', alDia: true, base: a.base, deSloth: a.deSloth }).sloth, '0.3.44')
  } finally {
    de.fin()
    a.fin()
  }
})

test('abierto para revisarlo no se instala, y dice lo que se sabe de él frente a esta Sloth', () => {
  const de = sloth()
  const a = sloth(false)
  try {
    de.poner('skills/receta-rapida/scripts/instalar.ps1', 'echo hola\n')
    de.poner('skills/receta-rapida/scripts/subir.py', 'import requests\nrequests.post("https://otro.sitio/subir")\n')
    const { paquete } = empacar(de, '0.3.44')
    a.poner('skills/video-base/PORTADA.md', '# Portada nueva\n')
    const destino = join(a.app, 'trabajo', 'estilos-por-revisar', 'pub1')
    const { manifiesto, notas, fallas, riesgos } = desempacar(paquete, destino, { sloth: '0.4.0', base: a.base, deSloth: a.deSloth })
    assert.equal(manifiesto.id, 'receta-rapida')
    assert.ok(existsSync(join(destino, 'SKILL.md')) && existsSync(join(destino, 'estilo.json')))
    assert.ok(!existsSync(join(a.app, 'skills', 'receta-rapida')))
    const todo = notas.join('\n')
    assert.match(todo, /Se hizo con Sloth 0\.3\.44; esta es la 0\.4\.0/)
    assert.match(todo, /1 ya no son como cuando se hizo, o ya no están: PORTADA\.md/)
    // Lo de su autor: lo que cambió y lo que añadió al estilo de Sloth del que partió.
    assert.match(todo, /Frente a video-explicativo, el estilo de Sloth del que partió: 1 archivos iguales; cambiados, 2 \(SKILL\.md, plantilla\/package\.json\); nuevos, 2 \(scripts\/instalar\.ps1, scripts\/subir\.py\)/)
    assert.ok(fallas.some((f) => /scripts de consola \(scripts\/instalar\.ps1\)/.test(f)))
    assert.deepEqual(riesgos, ['scripts/subir.py:1 se conecta a internet: import requests', 'scripts/subir.py:2 se conecta a internet: requests.post("https://otro.sitio/subir")'])
  } finally {
    de.fin()
    a.fin()
  }
})

test('al empaquetarlo le dice a su autor lo que no cumple de lo que necesita todo estilo', () => {
  const s = sloth()
  try {
    const avisos = empacar(s).avisos.join('\n')
    assert.match(avisos, /tiene que empezar con `name: receta-rapida`/)
    assert.match(avisos, /no dice qué hace con «Formato: horizontal»/)
    assert.match(avisos, /Le falta la etapa de su portada/)
  } finally {
    s.fin()
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
