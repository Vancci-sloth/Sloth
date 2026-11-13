import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

/**
 * El motor común de los estilos que se hacen con `momentos.json` (`skills/video-base/MOTOR.md`): lo que comparten sus
 * `hacer.py` (`skills/video-base/scripts/momentos.py`) y el `--revisa` del documental, que dice todo lo que falla de una
 * vez. Con el Python del sistema; sin él (o sin numpy y OpenCV, que pide el documental) se saltan.
 */
const REPO = join(import.meta.dirname, '..')
const BASE = join(REPO, 'skills', 'video-base', 'scripts')
const python = ['python', 'python3'].find((p) => spawnSync(p, ['--version']).status === 0)
const py = (codigo: string, cwd = REPO) => spawnSync(python!, ['-I', '-B', '-X', 'utf8', '-c', codigo], { cwd, encoding: 'utf8' })
const conNumpy = python && py('import numpy, cv2').status === 0

test('momentos.py ancla cada momento a su palabra y dice lo que falla', { skip: !python }, () => {
  const r = py(`
import json, sys
sys.path.insert(0, r"${BASE}")
from momentos import anclar, busca, normal, palabras_de
dichas = palabras_de("Tu tamal lleva cal. Sí, la de pintar paredes. Y tu tamal, feliz.")
indices, errores = anclar([{"palabra": "Tu tamal"}, {"palabra": "la de pintar"}, {"palabra": "tu tamal", "vez": 2},
                           {"palabra": "paredes"}, {"palabra": "no se dice"}], dichas, "el guion")
print(json.dumps({"normal": normal("¿Niñez, CAFÉ al 50 %?"), "busca": busca(dichas, "tu tamal", 2), "indices": indices, "errores": errores}))
`)
  assert.equal(r.status, 0, r.stderr)
  const d = JSON.parse(r.stdout)
  assert.equal(d.normal, 'ninezcafeal50%')
  assert.equal(d.busca, 10)
  assert.deepEqual(d.indices, [0, 5, 10, -1, -1])
  assert.equal(d.errores.length, 2, 'un momento fuera de orden y una palabra que no se dice')
  assert.match(d.errores[0], /momento 4 .*antes que el momento anterior/)
  assert.match(d.errores[1], /momento 5 .*no dice «no se dice»/)
})

test('Reloj deja los segundos de cada paso en revision/tiempos.json, acabe bien o mal', { skip: !python }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-reloj-'))
  try {
    const r = py(`
import sys
from pathlib import Path
sys.path.insert(0, r"${BASE}")
from momentos import Reloj
r = Reloj(Path("."))
r.paso("material")
r.nota("espera", "la GPU")
r.paso("render")
sys.exit("✗ falló")
`, dir)
    assert.equal(r.status, 1)
    const t = JSON.parse(readFileSync(join(dir, 'revision', 'tiempos.json'), 'utf8'))
    assert.equal(t.listo, false)
    assert.deepEqual(t.pasos.map((p: { paso: string }) => p.paso), ['material', 'render'])
    assert.equal(t.pasos[0].espera, 'la GPU')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('el --revisa del documental dice todo lo que falla de una vez, y ✓ cuando está bien', { skip: !conNumpy }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-doc-'))
  try {
    mkdirSync(join(dir, 'work', 'tx'), { recursive: true })
    writeFileSync(join(dir, 'remotion.config.ts'), '')
    // Veintiuna palabras, una cada 0,4 s: 8,3 s de grabación.
    const dicho = 'Hoy tres empresas pelean por lo mismo y nadie gana nada pero yo creo que la respuesta es otra muy distinta'.split(' ')
    writeFileSync(join(dir, 'work', 'tx', 'words.json'), JSON.stringify(dicho.map((w, k) => ({ w, s: k * 0.4, e: k * 0.4 + 0.3 }))))
    const hacer = (m: unknown) => {
      writeFileSync(join(dir, 'momentos.json'), JSON.stringify(m))
      return spawnSync(python!, ['-I', '-B', '-X', 'utf8', join(REPO, 'skills', 'video-documental', 'scripts', 'hacer.py'), '--revisa'], { cwd: dir, encoding: 'utf8' })
    }
    const material = { carrera: { clip: 'mixkit:9024' }, sede: { foto: 'commons:File:Sede.jpg' } }
    const mal = hacer({
      // `sobra` no la usa nadie: no se baja ni es un error.
      material: { ...material, sobra: { foto: 'https://example.com/a.jpg' }, raro: { clip: 'https://example.com/pagina' } },
      momentos: [
        { palabra: 'Hoy', ve: ['carrera', 'raro'] },
        { palabra: 'empresas', ve: 'no-existe' },
        { palabra: 'nadie gana', ve: 'negro', grande: 'un eslogan' },
        { palabra: 'pelean', ve: 'sede' },
        { palabra: 'yo creo', ve: 'cara', forma: 'espiral' },
      ],
    })
    assert.equal(mal.status, 1)
    const errores = mal.stderr.split('\n').filter((l) => l.startsWith('  '))
    for (const esperado of [/no hay «no-existe» en `material`/, /«un eslogan»\) no se dice/, /momento 4 .*antes que el momento anterior/, /no hay forma «espiral»/,
      /material «raro»: `clip` con una URL/])
      assert.ok(errores.some((e) => esperado.test(e)), `falta ${esperado} en:\n${mal.stderr}`)
    const bien = hacer({
      material: { carrera: material.carrera, marca: { pagina: 'https://example.com/precios', marca: 'veinte' } },
      momentos: [
        { palabra: 'Hoy', ve: 'carrera' },
        { palabra: 'empresas', ve: 'marca', grande: 'empresas' },
        { palabra: 'nadie gana', ve: 'negro' },
        { palabra: 'nada pero', ve: 'cara', mega: 'yo' },
        // Una referencia puesta tal cual en `ve` es una cosa más, sin nombrarla en `material`.
        { palabra: 'la respuesta', ve: 'mixkit:4939' },
      ],
    })
    assert.equal(bien.status, 0, bien.stderr)
    assert.match(bien.stdout, /^✓ momentos\.json bien: 5 momentos/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('el --revisa de Low-Poly dice todo lo que falla de una vez, y ✓ cuando está bien', { skip: !python }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-lowpoly-'))
  try {
    writeFileSync(join(dir, 'guion.md'), '# El ciclo del agua\n\nEl sol calienta el mar. El vapor sube y se junta en una nube. Llueve en el monte y un río lo devuelve al mar otra vez.\n')
    const hacer = (m: unknown) => {
      writeFileSync(join(dir, 'momentos.json'), JSON.stringify(m))
      return spawnSync(python!, ['-I', '-B', '-X', 'utf8', join(REPO, 'skills', 'video-low-poly', 'scripts', 'hacer.py'), '--revisa'], { cwd: dir, encoding: 'utf8' })
    }
    const mal = hacer({
      momentos: [
        { palabra: 'el mar', en: 'mar', bandera: 'Una bandera demasiado larga', entra: ['vapor'] },
        { palabra: 'se junta', en: 'cielo', entra: ['casas', 'dragon'] },
        { palabra: 'Llueve', en: 'montaña', entra: [{ tipo: 'camion', a: 'mar' }] },
        { palabra: 'no se dice', en: 'rio' },
      ],
    })
    assert.equal(mal.status, 1)
    const errores = mal.stderr.split('\n').filter((l) => l.startsWith('  '))
    for (const esperado of [/momento 1 .*su palabra va al principio/, /bandera «Una bandera demasiado larga» es larga/, /«casas» no va en «cielo»/, /no hay cosa «dragon»/,
      /«camion» no va en «montaña»/, /el camión dice `a`/, /momento 4 .*no dice «no se dice»/, /el último momento va `en: "todo"`/])
      assert.ok(errores.some((e) => esperado.test(e)), `falta ${esperado} en:\n${mal.stderr}`)
    const bien = hacer({
      formato: 'horizontal',
      momentos: [
        { palabra: 'El sol', en: 'mar', bandera: 'Evaporación', entra: ['vapor'] },
        { palabra: 'se junta', en: 'cielo', bandera: 'Condensación', entra: ['nube'] },
        { palabra: 'Llueve', en: 'montaña', bandera: 'Lluvia', entra: ['lluvia'] },
        { palabra: 'un río', en: 'río', bandera: 'Río', entra: ['rio'] },
        { palabra: 'otra vez', en: 'todo', entra: ['anillo'] },
      ],
    })
    assert.equal(bien.status, 0, bien.stderr)
    assert.match(bien.stdout, /^✓ momentos\.json bien: 5 momentos, de mar → cielo → montaña → rio → todo/)
    // Sin voz, como la referencia: cada momento en su segundo, sin palabras del guion.
    const sinVoz = hacer({ voz: false, momentos: [{ segundo: 0, en: 'mar', bandera: 'Evaporación', entra: ['vapor'] }, { segundo: 1.2, en: 'cielo', entra: ['nube'] }, { segundo: 1.0, en: 'todo' }] })
    assert.equal(sinVoz.status, 1)
    assert.match(sinVoz.stderr, /momento 3: su `segundo` \(1\) va antes que el del anterior/)
    const sinVozBien = hacer({ voz: false, momentos: [{ segundo: 0, en: 'mar', bandera: 'Evaporación', entra: ['vapor'] }, { segundo: 1.2, en: 'cielo', entra: ['nube'] }, { segundo: 6.85, en: 'todo', entra: ['anillo'] }] })
    assert.equal(sinVozBien.status, 0, sinVozBien.stderr)
    assert.match(sinVozBien.stdout, /8\.5 s sin voz/)
    // Una pieza a la medida: tiene que estar su archivo, con registrarPieza.
    const conPieza = { voz: false, momentos: [{ segundo: 0, en: 'llanura', bandera: 'Taza', entra: [{ pieza: 'taza' }] }, { segundo: 2, en: 'todo' }] }
    assert.match(hacer(conPieza).stderr, /falta piezas\/taza\.js/)
    mkdirSync(join(dir, 'piezas'))
    writeFileSync(join(dir, 'piezas', 'taza.js'), "registrarPieza('taza', { crear() { return { objeto: null } } })")
    assert.equal(hacer(conPieza).status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
