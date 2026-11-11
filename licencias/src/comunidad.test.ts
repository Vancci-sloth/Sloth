import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { adjuntosDe, consultaFeed, estiloEnSuSitio, fotosDeComentario } from './comunidad.ts'

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

test('un estilo es un paquete de la comunidad, uno solo, con su nombre, y va en Estilos', () => {
  const estilo = { tipo: 'estilo', llave: 'ffffffffffffffffffff.estilo', nombre: 'Receta rápida' }
  assert.deepEqual(adjuntosDe([estilo, { ...estilo, llave: 'gggggggggggggggggggg.estilo' }, imagen(1)]), [estilo, imagen(1)])
  // Con otra extensión no es un estilo, ni un estilo es una imagen.
  assert.deepEqual(adjuntosDe([{ ...estilo, llave: 'ffffffffffffffffffff.png' }, { tipo: 'imagen', llave: estilo.llave }]), [])
  assert.deepEqual(adjuntosDe([{ tipo: 'estilo', llave: estilo.llave }]), [{ tipo: 'estilo', llave: estilo.llave, nombre: 'Estilo' }])
  assert.doesNotThrow(() => estiloEnSuSitio('estilos', adjuntosDe([estilo])))
  assert.throws(() => estiloEnSuSitio('estilos', adjuntosDe([imagen(1)])), /se comparte un estilo/)
  assert.throws(() => estiloEnSuSitio('general', adjuntosDe([estilo])), /sección Estilos/)
  assert.deepEqual(fotosDeComentario([estilo]), [])
})

test('un comentario lleva solo imágenes de la comunidad, a lo más cuatro', () => {
  assert.deepEqual(fotosDeComentario([video, imagen(1)]), [imagen(1)])
  assert.equal(fotosDeComentario(Array.from({ length: 7 }, (_, i) => imagen(i))).length, 4)
  assert.deepEqual(fotosDeComentario(undefined), [])
  assert.deepEqual(fotosDeComentario([{ tipo: 'imagen', llave: 'https://otro.com/x.png' }]), [])
})

test('el feed por actividad, por lo más reciente y, para el creador, lo que no ha contestado', () => {
  const db = new DatabaseSync(':memory:')
  for (const m of ['0004_comunidad', '0009_comentarios_adjuntos', '0019_estilos', '0026_comunidad_recientes']) db.exec(readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url), 'utf8'))
  const pub = db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, creada, actividad, fijada) VALUES (?, ?, 'general', '', '', ?, ?, ?)")
  const com = db.prepare("INSERT INTO comentarios (id, publicacion, autor, texto, creada) VALUES (?, ?, ?, '', ?)")
  // a: de Ana, sin comentarios. b: de Beto, ya le contestó el creador. c: de Ana, le contestó y luego Beto volvió a
  // escribir. d: un anuncio del creador, comentado por Ana. e: un anuncio del creador, sin comentarios, fijado.
  pub.run('a', 'ana', '2026-11-05', '2026-11-05', 0)
  pub.run('b', 'beto', '2026-11-04', '2026-11-08', 0)
  com.run('b1', 'b', 'yo', '2026-11-08')
  pub.run('c', 'ana', '2026-11-03', '2026-11-09', 0)
  com.run('c1', 'c', 'yo', '2026-11-06')
  com.run('c2', 'c', 'beto', '2026-11-09')
  pub.run('d', 'yo', '2026-11-02', '2026-11-07', 0)
  com.run('d1', 'd', 'ana', '2026-11-07')
  pub.run('e', 'yo', '2026-11-01', '2026-11-01', 1)
  const creador = { id: 'yo', creador: true }
  const ids = (orden: string, antes = '', yo = creador) => {
    const { sql, valores } = consultaFeed(yo, { categoria: '', antes, orden })
    return db.prepare(sql).all(...valores).map((f) => f.id)
  }
  assert.deepEqual(ids(''), ['e', 'c', 'b', 'd', 'a'])
  assert.deepEqual(ids('actividad', '2026-11-08'), ['d', 'a'])
  assert.deepEqual(ids('recientes'), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(ids('recientes', '2026-11-04'), ['c', 'd', 'e'])
  assert.deepEqual(ids('sin-contestar'), ['c', 'd', 'a'])
  assert.deepEqual(ids('sin-contestar', '2026-11-09'), ['d', 'a'])
  assert.deepEqual(ids('recientes', '', { id: 'ana', creador: false }), ['a', 'b', 'c', 'd', 'e'])
  assert.throws(() => ids('sin-contestar', '', { id: 'ana', creador: false }), /solo lo ve el creador/)
  assert.throws(() => ids('popular'), /no existe/)
})
