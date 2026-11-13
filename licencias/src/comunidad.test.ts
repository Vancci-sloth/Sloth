import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { adjuntosDe, consultaBuscar, consultaFeed, consultaIndice, estiloEnSuSitio, fotosDeComentario, palabrasDe } from './comunidad.ts'

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

test('el buscador encuentra cada palabra sin importar acentos ni mayúsculas, en el título, el texto o un comentario', () => {
  const db = new DatabaseSync(':memory:')
  for (const m of ['0004_comunidad', '0009_comentarios_adjuntos', '0019_estilos', '0026_comunidad_recientes']) db.exec(readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url), 'utf8'))
  const pub = db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, creada, actividad, reportes, aprobada) VALUES (?, ?, 'ayuda', ?, ?, ?, ?, ?, ?)")
  pub.run('a', 'ana', 'La voz clonada suena ROBÓTICA', 'Grabé 30 segundos.', '2026-11-01', '2026-11-01', 0, 1)
  pub.run('b', 'beto', 'Música que no se oye', 'En el mp4 no suena; parece robótica la mezcla', '2026-11-02', '2026-11-09', 0, 1)
  pub.run('c', 'ana', 'El año del niño', 'Sin nada más', '2026-11-03', '2026-11-03', 0, 1)
  pub.run('d', 'beto', 'Robótica escondida', 'reportada', '2026-11-04', '2026-11-04', 3, 1)
  pub.run('e', 'beto', 'Otra cosa', 'nada', '2026-11-05', '2026-11-05', 0, 1)
  db.prepare("INSERT INTO comentarios (id, publicacion, autor, texto, creada) VALUES ('e1', 'e', 'ana', 'a mí me sonó robotica también', '2026-11-06')").run()
  const ids = (q: string, yo = { id: 'ana', creador: false }) => {
    const { sql, valores } = consultaBuscar(yo, q)
    return sql ? db.prepare(sql).all(...valores).map((f) => f.id) : []
  }
  // Primero la del título; luego por actividad. La reportada por tres no sale (salvo al creador).
  assert.deepEqual(ids('robotica'), ['a', 'b', 'e'])
  assert.deepEqual(ids('Robótica', { id: 'yo', creador: true }), ['d', 'a', 'b', 'e'])
  assert.deepEqual(ids('voz robot'), ['a'])
  assert.deepEqual(ids('niño'), ['c'])
  assert.deepEqual(ids('nino'), [])
  assert.deepEqual(ids('  '), [])
  // Un comentario oculto por reportes no delata su texto: solo lo encuentran su autor y el creador.
  db.prepare("INSERT INTO comentarios (id, publicacion, autor, texto, creada, reportes) VALUES ('c1', 'c', 'beto', 'palabra secreta', '2026-11-07', 3)").run()
  assert.deepEqual(ids('secreta'), [])
  assert.deepEqual(ids('secreta', { id: 'beto', creador: false }), ['c'])
  assert.deepEqual(ids('secreta', { id: 'yo', creador: true }), ['c'])
  // Otros acentos (portugués, francés) se quitan igual en el SQL y en las palabras.
  pub.run('f', 'ana', 'Ação em português', 'Ça va', '2026-11-08', '2026-11-08', 0, 1)
  assert.deepEqual(ids('acao portugues'), ['f'])
  assert.deepEqual(ids('AÇÃO'), ['f'])
  assert.deepEqual(palabrasDe('¿La MÚSICA, pingüino… año? 100%'), ['la', 'musica', 'pinguino', 'año', '100'])
})

test('el índice del buscador trae lo que cada quien ve, sin lo oculto ni lo que no se aprobó', () => {
  const db = new DatabaseSync(':memory:')
  for (const m of ['0004_comunidad', '0009_comentarios_adjuntos', '0019_estilos', '0026_comunidad_recientes']) db.exec(readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url), 'utf8'))
  db.prepare("INSERT INTO miembros (id, clave, nombre, creado, visto) VALUES ('ana', 'k1', 'Ana', '2026-11-01', '2026-11-01')").run()
  const pub = db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, creada, actividad, reportes, aprobada) VALUES (?, ?, 'general', ?, ?, ?, ?, ?, ?)")
  pub.run('a', 'ana', 'Visible', 'x'.repeat(500), '2026-11-01', '2026-11-03', 0, 1)
  pub.run('b', 'beto', 'Reportada', '', '2026-11-02', '2026-11-02', 3, 1)
  pub.run('c', 'beto', 'Sin aprobar', '', '2026-11-03', '2026-11-01', 0, 0)
  const filas = (yo: { id: string; creador: boolean }) => {
    const { sql, valores } = consultaIndice(yo)
    return db.prepare(sql).all(...valores) as { id: string; autor: string; texto: string }[]
  }
  const ana = filas({ id: 'ana', creador: false })
  assert.deepEqual(ana.map((f) => f.id), ['a'])
  assert.equal(ana[0].autor, 'Ana')
  assert.equal(ana[0].texto.length, 300)
  assert.deepEqual(filas({ id: 'beto', creador: false }).map((f) => f.id), ['a', 'b', 'c'])
  assert.deepEqual(filas({ id: 'yo', creador: true }).map((f) => f.id), ['a', 'b', 'c'])
})
