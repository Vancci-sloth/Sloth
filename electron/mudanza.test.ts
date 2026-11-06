import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { copiar, destinoDe, junto, mudar, pesadas, porQueNo, recuperar } from './mudanza.ts'

/** Una Sloth de mentira: su app, su %APPDATA% y su %LOCALAPPDATA%, con algo en cada carpeta pesada. */
function sloth(t: { after(f: () => void): void }) {
  const base = mkdtempSync(join(tmpdir(), 'mudanza-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const app = join(base, 'Programs', 'Sloth', 'app')
  const env = { APPDATA: join(base, 'Roaming'), LOCALAPPDATA: join(base, 'Local') }
  const lista = pesadas(app, env)
  for (const p of lista) {
    mkdirSync(join(p.enlace, 'dentro'), { recursive: true })
    writeFileSync(join(p.enlace, 'dentro', `${p.nombre}.txt`), p.nombre)
  }
  return { base, app, env, lista }
}

const esEnlace = (ruta: string) => lstatSync(ruta).isSymbolicLink()

test('lo pesado pasa a <elegida>/Sloth y en su sitio queda un enlace que lleva allí', async (t) => {
  const { base, lista } = sloth(t)
  const destino = destinoDe(join(base, 'D'))
  assert.equal(destino, join(base, 'D', 'Sloth'))
  assert.equal(porQueNo(destino, lista, []), null)
  await mudar(destino, lista, () => {})
  for (const p of lista) {
    assert.ok(esEnlace(p.enlace), p.nombre)
    assert.equal(realpathSync(p.enlace), realpathSync(join(destino, p.nombre)))
    assert.equal(readFileSync(join(p.enlace, 'dentro', `${p.nombre}.txt`), 'utf8'), p.nombre)
    assert.ok(!existsSync(`${p.enlace}.mudando`))
  }

  // Y otra vez, a otro sitio: el enlace cambia de destino y lo de antes se va.
  const otro = destinoDe(join(base, 'E', 'Sloth'))
  await mudar(otro, lista, () => {})
  for (const p of lista) assert.equal(readFileSync(join(otro, p.nombre, 'dentro', `${p.nombre}.txt`), 'utf8'), p.nombre)
  assert.ok(!existsSync(join(destino, 'trabajo')))
})

test('no se lleva dentro de lo que se mueve, ni a la instalación, ni encima de otra carpeta con cosas', (t) => {
  const { base, app, lista } = sloth(t)
  assert.match(porQueNo(join(app, 'trabajo', 'Sloth'), lista, []) ?? '', /dentro de lo que se va a mover/)
  assert.match(porQueNo(join(base, 'Programs', 'Sloth', 'Sloth'), lista, [join(base, 'Programs', 'Sloth')]) ?? '', /instalación/)
  const ocupada = join(base, 'F', 'Sloth')
  mkdirSync(join(ocupada, 'trabajo', 'otra'), { recursive: true })
  assert.match(porQueNo(ocupada, lista, []) ?? '', /Ya hay una carpeta «trabajo»/)
})

test('la copia entre discos guarda las fechas y los enlaces de dentro', async (t) => {
  const { base } = sloth(t)
  const de = join(base, 'origen')
  const modulos = join(base, 'modulos-de-un-video')
  mkdirSync(join(de, 'video'), { recursive: true })
  mkdirSync(modulos)
  writeFileSync(join(modulos, 'm.js'), 'm')
  writeFileSync(join(de, 'video', 'final.mp4'), 'cuadros')
  utimesSync(join(de, 'video', 'final.mp4'), new Date('2026-06-15'), new Date('2026-06-15'))
  symlinkSync(modulos, join(de, 'video', 'node_modules'), 'junction')
  let bytes = 0
  await copiar(de, join(base, 'copia'), (b) => (bytes += b))
  assert.equal(bytes, 'cuadros'.length)
  assert.equal(statSync(join(base, 'copia', 'video', 'final.mp4')).mtime.getFullYear(), 2026)
  assert.ok(esEnlace(join(base, 'copia', 'video', 'node_modules')))
  assert.equal(readFileSync(join(base, 'copia', 'video', 'node_modules', 'm.js'), 'utf8'), 'm')
})

test('instalada en otro disco, lo que aún no existe nace junto a la app; lo que ya estaba no se toca', (t) => {
  const { app, lista } = sloth(t)
  rmSync(lista[1].enlace, { recursive: true }) // la IA local aún no se bajó
  junto(app, lista)
  // En la misma unidad (como aquí) no hace nada: solo cuando la app está en otra.
  assert.ok(!existsSync(lista[1].enlace))
  assert.ok(!esEnlace(lista[2].enlace))
})

test('si se cortó a media mudanza, lo apartado vuelve a su sitio', (t) => {
  const { lista } = sloth(t)
  const trabajo = lista[0].enlace
  renameSync(trabajo, `${trabajo}.mudando`)
  recuperar(lista)
  assert.equal(readFileSync(join(trabajo, 'dentro', 'trabajo.txt'), 'utf8'), 'trabajo')
})
