import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// El director de El Diff (skills/video-el-diff/scripts/director.py) parte el guion en beats desde momentos.json. Lo que
// comprueba en un segundo, sin material, es lo que evita que un episodio falle después de pagar la voz.
const DIRECTOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'video-el-diff', 'scripts', 'director.py')
const python = spawnSync('python', ['--version']).status === 0

const GUION = `# El título

El lunes, Acme publicó su plan. Acme dijo que el plan era gratis, y el martes Acme lo cobró.

Es 10 de noviembre de 2026, y estás viendo El Noticiero.

## El cobro

Acme cobra 5 dólares al mes desde ese martes.

Gracias por ver.
`
const MARCA = { nombre: 'El Noticiero', despedida: 'Gracias por ver.', invitacion: '' }
const FUENTES = { acme: { url: 'https://acme.test/plan', pie: 'acme.test · 9 nov 2026' } }

function revisar(momentos: object[]) {
  const raiz = mkdtempSync(join(tmpdir(), 'el-diff-director-'))
  mkdirSync(join(raiz, 'src'))
  writeFileSync(join(raiz, 'guion.md'), GUION)
  writeFileSync(join(raiz, 'src', 'marca.json'), JSON.stringify(MARCA))
  writeFileSync(join(raiz, 'src', 'formato.json'), '{"formato": "vertical"}')
  writeFileSync(join(raiz, 'momentos.json'), JSON.stringify({ gancho: 'GRATIS / HASTA EL MARTES', fuentes: FUENTES, momentos }))
  const r = spawnSync('python', ['-B', '-X', 'utf8', DIRECTOR, 'revisa'], { cwd: raiz, encoding: 'utf8' })
  rmSync(raiz, { recursive: true, force: true })
  return r.stdout + r.stderr
}

test('el director ancla cada momento después del anterior y pone el logo y la despedida de la marca', { skip: !python }, () => {
  // «Acme» se dice tres veces: sin `vez`, cada momento toma la primera después del anterior.
  const salida = revisar([
    { palabra: 'El lunes', fuente: 'acme', cita: 'Acme presenta su plan', rotulo: 'LUN 9 NOV' },
    { palabra: 'Acme dijo', rotulo: 'GRATIS' },
    { palabra: 'Acme lo cobró', titular: 'YA NO', color: 'rojo' },
    { palabra: 'Acme cobra', fuente: 'acme', cita: 'El plan cuesta 5 dólares al mes', sello: 'COBRADO' },
  ])
  // Cuatro momentos, la tarjeta de la fecha y la despedida.
  assert.match(salida, /✓ momentos\.json bien: 6 beats/)
})

test('un momento fuera de orden cuya palabra se dice una sola vez va a su sitio; si se repite, lo dice', { skip: !python }, () => {
  const primero = { palabra: 'El lunes', fuente: 'acme', cita: 'Acme presenta su plan' }
  const cobro = { palabra: 'Acme cobra', fuente: 'acme', cita: 'El plan cuesta 5 dólares al mes' }
  const gratis = { palabra: 'Acme dijo', rotulo: 'GRATIS' }
  const enOrden = revisar([primero, gratis, cobro, { palabra: 'el martes Acme', titular: 'YA NO' }])
  assert.match(enOrden, /✓ momentos\.json bien: 6 beats/)
  assert.match(enOrden, /1 momento\(s\) venían fuera de orden/)
  // «Acme» se dice cuatro veces: después del último momento ya no, y no se adivina cuál.
  assert.match(revisar([primero, gratis, cobro, { palabra: 'Acme', rotulo: 'X' }]), /no dice «Acme» después del momento anterior/)
})

test('el director dice todo lo que falla de una vez', { skip: !python }, () => {
  const salida = revisar([
    { palabra: 'El lunes', fuente: 'otra', cita: 'Acme presenta su plan' },
    { palabra: 'no se dice', rotulo: 'X' },
    { palabra: 'Acme cobra', fuente: 'acme', cita: 'The plan is free until it is not', ovalo: '5 dollars' },
  ])
  assert.match(salida, /la fuente «otra» no está en `fuentes`/)
  assert.match(salida, /el guion no dice «no se dice»/)
  assert.match(salida, /la cita está en inglés y no lleva `es`/)
  assert.match(salida, /`ovalo` «5 dollars» no está en la cita que se ve/)
})
