import assert from 'node:assert/strict'
import test from 'node:test'
import { adjuntosDe, fotosDeComentario } from './comunidad.ts'

const imagen = (n: number) => ({ tipo: 'imagen', llave: `${String(n).padStart(20, 'a')}.png` })
const video = { tipo: 'video', llave: 'bbbbbbbbbbbbbbbbbbbb.mp4', poster: 'cccccccccccccccccccc.webp', vertical: true }

test('solo guarda archivos de la comunidad, cada uno con su tipo', () => {
  assert.deepEqual(adjuntosDe([imagen(1), video]), [imagen(1), video])
  assert.deepEqual(adjuntosDe('nada'), [])
  // Una ruta, una URL de fuera o una llave con otro tipo no pasan.
  assert.deepEqual(adjuntosDe([{ tipo: 'imagen', llave: '../licencias.png' }, { tipo: 'imagen', llave: 'https://otro.com/x.png' }, { tipo: 'imagen', llave: 'bbbbbbbbbbbbbbbbbbbb.mp4' }, { tipo: 'video', llave: 'aaaaaaaaaaaaaaaaaaaa.png' }]), [])
  // Lo que llega de más (la URL que manda la interfaz) se descarta.
  assert.deepEqual(adjuntosDe([{ ...imagen(2), url: 'https://x' }]), [imagen(2)])
})

test('un solo video, a lo más diez adjuntos, y la portada solo si es una imagen', () => {
  const otro = { ...video, llave: 'dddddddddddddddddddd.webm' }
  assert.deepEqual(adjuntosDe([video, otro]), [video])
  assert.equal(adjuntosDe(Array.from({ length: 14 }, (_, i) => imagen(i))).length, 10)
  assert.deepEqual(adjuntosDe([{ ...video, poster: 'eeeeeeeeeeeeeeeeeeee.mp4' }]), [{ tipo: 'video', llave: video.llave, vertical: true }])
})

test('un comentario lleva solo imágenes de la comunidad, a lo más cuatro', () => {
  assert.deepEqual(fotosDeComentario([video, imagen(1)]), [imagen(1)])
  assert.equal(fotosDeComentario(Array.from({ length: 7 }, (_, i) => imagen(i))).length, 4)
  assert.deepEqual(fotosDeComentario(undefined), [])
  assert.deepEqual(fotosDeComentario([{ tipo: 'imagen', llave: 'https://otro.com/x.png' }]), [])
})
