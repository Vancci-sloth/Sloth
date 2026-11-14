import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agrupar, ass, corregir, nombreArchivo, srt, tiempoAss, tiempoSrt, tiempos, type Palabra } from './subtitulos.ts'

const dichas = (texto: string, desde = 0, paso = 0.3): Palabra[] =>
  texto.split(' ').map((text, i) => ({ text, start: desde + i * paso, end: desde + i * paso + 0.25 }))

test('la palabra resaltada va de tres en tres y corta en cada signo y cada silencio', () => {
  const palabras = [...dichas('hola a todos, hoy les cuento algo muy raro'), ...dichas('otra frase', 10)]
  const renglones = agrupar(palabras, 'resaltada').map((r) => r.palabras.map((p) => p.text).join(' '))
  assert.deepEqual(renglones, ['hola a todos,', 'hoy les cuento', 'algo muy raro', 'otra frase'])
})

test('los clásicos juntan la frase entera y solo cortan al acabarla', () => {
  const renglones = agrupar(dichas('hola a todos, hoy les cuento algo. Y otra cosa'), 'clasicos').map((r) => r.palabras.map((p) => p.text).join(' '))
  assert.deepEqual(renglones, ['hola a todos, hoy les cuento algo.', 'Y otra cosa'])
})

test('corregir conserva el tiempo de cada palabra si son las mismas, y si no lo reparte', () => {
  const r = agrupar(dichas('ola a todos'), 'resaltada')
  assert.deepEqual(corregir(r, ['hola a todos'])[0].palabras, [
    { text: 'hola', start: 0, end: 0.25 },
    { text: 'a', start: 0.3, end: 0.55 },
    { text: 'todos', start: 0.6, end: 0.85 }
  ])
  const repartidas = corregir(r, ['hola'])[0].palabras
  assert.deepEqual(repartidas, [{ text: 'hola', start: 0, end: 0.85 }])
  assert.deepEqual(corregir(r, ['  ']), [])
})

test('un renglón dura hasta el siguiente si el hueco es corto, y si no, un poco más que su última palabra', () => {
  const r = [{ palabras: dichas('a b', 0) }, { palabras: dichas('c', 0.8) }, { palabras: dichas('d', 5) }]
  assert.deepEqual(tiempos(r), [
    { inicio: 0, fin: 0.8 },
    { inicio: 0.8, fin: 1.35 },
    { inicio: 5, fin: 5.55 }
  ])
})

test('los tiempos del .srt y del .ass', () => {
  assert.equal(tiempoSrt(3725.5), '01:02:05,500')
  assert.equal(tiempoSrt(0.0004), '00:00:00,000')
  assert.equal(tiempoAss(3725.506), '1:02:05.51')
  assert.equal(srt([{ palabras: dichas('hola mundo') }]), '1\n00:00:00,000 --> 00:00:00,850\nhola mundo\n')
})

test('el .ass resalta en ámbar la palabra que se dice y limpia lo que ASS leería como órdenes', () => {
  const texto = ass([{ palabras: dichas('hola {mundo}') }], { estilo: 'resaltada', tamano: 'mediano', posicion: 'abajo' }, { ancho: 1080, alto: 1920 })
  const eventos = texto.split('\n').filter((l) => l.startsWith('Dialogue:'))
  assert.equal(eventos.length, 2)
  assert.match(eventos[0], /\{\\c&H3DA3E8&\}HOLA\{\\c&HFFFFFF&\} MUNDO$/)
  assert.match(eventos[1], /HOLA \{\\c&H3DA3E8&\}MUNDO\{\\c&HFFFFFF&\}$/)
  // Abajo en un vertical: por encima de los botones de TikTok.
  assert.match(texto, /Style: Sloth,Arial Black,86,.*,2,86,86,384,1$/m)
  const clasicos = ass([{ palabras: dichas('hola mundo') }], { estilo: 'clasicos', tamano: 'mediano', posicion: 'arriba' }, { ancho: 1920, alto: 1080 })
  assert.equal(clasicos.split('\n').filter((l) => l.startsWith('Dialogue:')).length, 1)
  assert.match(clasicos, /,8,154,154,86,1$/m)
})

test('el nombre de los archivos sale del video subido', () => {
  assert.equal(nombreArchivo('Mi Video (1).MOV'), 'mi-video-1')
  assert.equal(nombreArchivo('Canción ñoña.mp4'), 'cancion-nona')
  assert.equal(nombreArchivo('.mp4'), 'video')
})
