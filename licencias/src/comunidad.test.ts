import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { adjuntosDe, consultaBuscar, consultaFeed, consultaIndice, estiloEnSuSitio, fotosDeComentario, palabrasDe } from './comunidad.ts'

const imagen = (n: number) => ({ tipo: 'imagen', llave: `${String(n).padStart(20, 'a')}.png` })
const video = { tipo: 'video', llave: 'bbbbbbbbbbbbbbbbbbbb.mp4', poster: 'cccccccccccccccccccc.webp', vertical: true }

/**
 * D1 no acepta más de 100 niveles entre una expresión y las de sus subconsultas, y SQLite solo trae 1000: sin esto, una
 * consulta que en producción falla aquí pasaba (el buscador, con `sinAcentos` dentro de un `IN (SELECT …)`).
 */
const COMO_D1 = { limits: { exprDepth: 100 } } as ConstructorParameters<typeof DatabaseSync>[1]

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
  // El adelanto del video de un estilo es otro MP4 de la comunidad; lo que no lo sea, no se guarda.
  assert.deepEqual(adjuntosDe([{ ...video, previa: 'dddddddddddddddddddd.mp4' }]), [{ ...video, previa: 'dddddddddddddddddddd.mp4' }])
  assert.deepEqual(adjuntosDe([{ ...video, previa: 'dddddddddddddddddddd.webp' }]), [video])
  assert.deepEqual(adjuntosDe([{ ...video, previa: 'https://otro.com/x.mp4' }]), [video])
  assert.deepEqual(adjuntosDe([{ ...imagen(1), previa: 'dddddddddddddddddddd.mp4' }]), [imagen(1)])
})

test('un estilo es un paquete de la comunidad, uno solo, con su nombre, y va en Estilos', () => {
  const estilo = { tipo: 'estilo', llave: 'ffffffffffffffffffff.estilo', nombre: 'Receta rápida' }
  assert.deepEqual(adjuntosDe([estilo, { ...estilo, llave: 'gggggggggggggggggggg.estilo' }, imagen(1)]), [estilo, imagen(1)])
  // Con otra extensión no es un estilo, ni un estilo es una imagen.
  assert.deepEqual(adjuntosDe([{ ...estilo, llave: 'ffffffffffffffffffff.png' }, { tipo: 'imagen', llave: estilo.llave }]), [])
  assert.deepEqual(adjuntosDe([{ tipo: 'estilo', llave: estilo.llave }]), [{ tipo: 'estilo', llave: estilo.llave, nombre: 'Estilo' }])
  assert.throws(() => estiloEnSuSitio('estilos', adjuntosDe([imagen(1)]), 'Algo'), /se comparte un estilo/)
  assert.throws(() => estiloEnSuSitio('general', adjuntosDe([estilo]), 'Algo'), /sección Estilos/)
  assert.doesNotThrow(() => estiloEnSuSitio('general', adjuntosDe([imagen(1)]), ''))
})

test('un estilo no se publica sin lo que lleva todo estilo: qué hace, su guía completa, un video entero y su prueba', () => {
  const guia = { das: 'Solo el tema del video.', entrega: 'Un vertical de 30 segundos.', ejemplo: 'Hazme un video del ciclo del agua.', herramientas: ['codigo', 'tu-voz'], agentes: ['claude'] }
  const prueba = { agente: 'claude', modelo: 'claude-opus-5-5', costo: 0.49, segundos: 222, evidencia: 'hhhhhhhhhhhhhhhhhhhh.hilo' }
  const video = { tipo: 'video', llave: 'eeeeeeeeeeeeeeeeeeee.mp4' }
  const estilo = { tipo: 'estilo', llave: 'ffffffffffffffffffff.estilo', nombre: 'Receta rápida' }
  const con = (g: unknown) => adjuntosDe([{ ...estilo, guia: g }])
  /** Como lo manda «Compartir»: el estilo con su guía y su prueba, y su video. */
  const completo = (g: unknown = guia, p: unknown = prueba) => adjuntosDe([{ ...estilo, guia: g, prueba: p }, video])
  // La guía se guarda limpia: recortada, sin lo que no es suyo ni los campos vacíos.
  assert.deepEqual(con({ ...guia, das: `  Solo el
 tema del video.  `, necesita: ' ', otro: 'x', ejemplo: 'e'.repeat(900) }), [{ ...estilo, guia: { ...guia, ejemplo: 'e'.repeat(400) } }])
  assert.deepEqual(con('nada'), [estilo])
  // La prueba también se guarda limpia, y una que no dice con qué se hizo no se guarda.
  assert.deepEqual(adjuntosDe([{ ...estilo, prueba: { ...prueba, costo: 0.487, otro: 'x' } }]), [{ ...estilo, prueba }])
  assert.deepEqual(adjuntosDe([{ ...estilo, prueba: { costo: 1, segundos: 60 } }]), [estilo])
  assert.doesNotThrow(() => estiloEnSuSitio('estilos', completo({ ...guia, necesita: 'Google Flow con créditos.' }), 'Recetas en 30 segundos.'))
  assert.doesNotThrow(() => estiloEnSuSitio('estilos', completo(), 'Recetas en 30 segundos.'))
  // Una Sloth de antes no manda todo: dice qué falta, todo de una vez, y que se actualice.
  assert.throws(() => estiloEnSuSitio('estilos', adjuntosDe([estilo]), 'Recetas.'), /falta: Qué le das; Un video entero hecho con él; La prueba de con qué agente.*actualízala/)
  assert.throws(() => estiloEnSuSitio('estilos', completo({ ...guia, ejemplo: 'x' }), 'Recetas.'), /falta: Ejemplo de lo que le escribes\./)
  assert.throws(() => estiloEnSuSitio('estilos', completo({ ...guia, herramientas: [] }), 'Recetas.'), /falta: Con qué lo hace\./)
  // El agente de su prueba y lo que su hilo usó van en su guía sin que los marque; y lo que llega con los acentos rotos se guarda bien.
  assert.deepEqual(completo({ ...guia, agentes: ['uno-inventado'] })[0].guia?.agentes, ['claude'])
  const usada = { ...prueba, agente: 'antigravity', hilo: { pedido: 'Hazme uno.', turnos: [{ segundos: 60, costo: 0, herramientas: 2 }], usa: ['flow-imagenes'] } }
  assert.deepEqual(completo({ ...guia, necesita: 'Google Flow con crÃ©ditos.' }, usada)[0].guia, { ...guia, necesita: 'Google Flow con créditos.', herramientas: ['codigo', 'tu-voz', 'flow-imagenes'], agentes: ['claude', 'antigravity'] })
  assert.throws(() => estiloEnSuSitio('estilos', adjuntosDe([{ ...estilo, guia: { ...guia, agentes: [] } }, video]), 'Recetas.'), /falta: Con qué agentes funciona bien; La prueba/)
  // El hilo de una prueba no se adjunta suelto, ni como video: va dentro de la prueba.
  assert.deepEqual(adjuntosDe([{ tipo: 'video', llave: prueba.evidencia }]), [])
  assert.throws(() => estiloEnSuSitio('estilos', completo(guia, { ...prueba, evidencia: undefined }), 'Recetas.'), /falta: La prueba de con qué agente/)
  assert.throws(() => estiloEnSuSitio('estilos', completo(guia, null), 'Recetas.'), /falta: La prueba de con qué agente se hizo, cuánto costó y cuánto tardó\./)
  assert.throws(() => estiloEnSuSitio('estilos', adjuntosDe([{ ...estilo, guia, prueba }]), 'Recetas.'), /falta: Un video entero hecho con él\./)
  assert.throws(() => estiloEnSuSitio('estilos', completo(), ''), /falta: Qué hace\./)
  assert.deepEqual(fotosDeComentario([estilo]), [])
})

test('un comentario lleva solo imágenes de la comunidad, a lo más cuatro', () => {
  assert.deepEqual(fotosDeComentario([video, imagen(1)]), [imagen(1)])
  assert.equal(fotosDeComentario(Array.from({ length: 7 }, (_, i) => imagen(i))).length, 4)
  assert.deepEqual(fotosDeComentario(undefined), [])
  assert.deepEqual(fotosDeComentario([{ tipo: 'imagen', llave: 'https://otro.com/x.png' }]), [])
})

test('el feed por actividad, por lo más reciente y, para el creador, lo que no ha contestado', () => {
  const db = new DatabaseSync(':memory:', COMO_D1)
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
  const db = new DatabaseSync(':memory:', COMO_D1)
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
  // Con todas las palabras que admite, para quien menos ve: cabe en el límite de D1.
  assert.deepEqual(ids('la voz clonada suena robotica grabe segundos'), ['a'])
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
  const db = new DatabaseSync(':memory:', COMO_D1)
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

test('los estilos de otros le salen a cualquiera, apoye o no: en el feed, en el buscador y en su índice', () => {
  const db = new DatabaseSync(':memory:', COMO_D1)
  for (const m of ['0004_comunidad', '0009_comentarios_adjuntos', '0019_estilos', '0026_comunidad_recientes']) db.exec(readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url), 'utf8'))
  const pub = db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, creada, actividad) VALUES (?, ?, ?, ?, '', ?, ?)")
  pub.run('g', 'ana', 'general', 'Hola receta', '2026-11-01', '2026-11-01')
  pub.run('e1', 'ana', 'estilos', 'Receta rápida', '2026-11-02', '2026-11-02')
  pub.run('e2', 'beto', 'estilos', 'Receta lenta', '2026-11-03', '2026-11-03')
  const ver = (yo: { id: string; creador: boolean }) => {
    const feed = consultaFeed(yo, { categoria: '', antes: '', orden: 'recientes' })
    const buscar = consultaBuscar(yo, 'receta')
    const indice = consultaIndice(yo)
    return [feed, buscar, indice].map((c) => (db.prepare(c.sql).all(...c.valores) as { id: string }[]).map((f) => f.id).sort().join())
  }
  // Las consultas ya no preguntan si apoyas: lo que es de quien apoya es instalarlos (el paquete, `servirArchivo`).
  assert.deepEqual(ver({ id: 'caro', creador: false }), ['e1,e2,g', 'e1,e2,g', 'e1,e2,g'])
  assert.deepEqual(ver({ id: 'yo', creador: true }), ['e1,e2,g', 'e1,e2,g', 'e1,e2,g'])
  assert.deepEqual(ver({ id: 'ana', creador: false }), ['e1,e2,g', 'e1,e2,g', 'e1,e2,g'])
  // Y la sección Estilos, con los de todos.
  const estilos = consultaFeed({ id: 'caro', creador: false }, { categoria: 'estilos', antes: '', orden: '' })
  assert.deepEqual((db.prepare(estilos.sql).all(...estilos.valores) as { id: string }[]).map((f) => f.id).sort(), ['e1', 'e2'])
})
