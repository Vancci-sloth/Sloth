// Al autor de un estilo al que le falta algo le llega su aviso a la campana, también si seguía por aprobar (migración
// 0034: la 0033 solo avisó de los que ya estaban en la tienda). Con las migraciones reales sobre SQLite.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('la 0034 avisa una vez a quien tiene un estilo incompleto y no tenía aviso', () => {
  const db = new DatabaseSync(':memory:')
  const carpeta = new URL('../migrations/', import.meta.url)
  for (const m of readdirSync(carpeta).sort()) db.exec(readFileSync(new URL(m, carpeta), 'utf8'))
  const la0034 = readFileSync(new URL('0034_aviso_estilos_por_aprobar.sql', carpeta), 'utf8')

  for (const [id, clave] of [['creador', 'admin'], ['ana', 'SLOTH-ana'], ['beto', 'SLOTH-beto']])
    db.prepare("INSERT INTO miembros (id, clave, nombre, creado, visto) VALUES (?, ?, ?, '2026-11-01', '2026-11-01')").run(id, clave, id)
  const completo = { tipo: 'estilo', llave: 'x.estilo', guia: { herramientas: ['voz'], agentes: ['claude'] }, prueba: { segundos: 300, evidencia: 'y.hilo' } }
  const estilo = (id: string, autor: string, aprobada: number, adjuntos: unknown[]) =>
    db.prepare("INSERT INTO publicaciones (id, autor, categoria, titulo, texto, adjuntos, creada, actividad, aprobada) VALUES (?, ?, 'estilos', ?, 'Qué hace', ?, '2026-11-10', '2026-11-10', ?)").run(
      id,
      autor,
      id,
      JSON.stringify(adjuntos),
      aprobada
    )
  estilo('por-aprobar', 'ana', 0, [{ tipo: 'estilo', llave: 'a.estilo' }, { tipo: 'video', llave: 'a.mp4' }])
  estilo('sin-video', 'ana', 0, [completo])
  estilo('ya-avisado', 'beto', 0, [{ tipo: 'estilo', llave: 'b.estilo' }])
  estilo('completo', 'beto', 0, [completo, { tipo: 'video', llave: 'c.mp4' }])
  estilo('del-creador', 'creador', 0, [{ tipo: 'estilo', llave: 'd.estilo' }])
  db.prepare("INSERT INTO avisos (id, para, de, tipo, publicacion, creado, leido) VALUES ('antes', 'beto', 'creador', 'incompleto', 'ya-avisado', '2026-11-20', 1)").run()

  const avisos = () => db.prepare("SELECT para, de, publicacion, leido FROM avisos WHERE tipo = 'incompleto' ORDER BY publicacion").all()
  const esperado = [
    { para: 'ana', de: 'creador', publicacion: 'por-aprobar', leido: 0 },
    { para: 'ana', de: 'creador', publicacion: 'sin-video', leido: 0 },
    { para: 'beto', de: 'creador', publicacion: 'ya-avisado', leido: 1 }
  ]
  db.exec(la0034)
  assert.deepEqual(avisos().map((a) => ({ ...a })), esperado)
  // Otra vez no repite ninguno.
  db.exec(la0034)
  assert.deepEqual(avisos().map((a) => ({ ...a })), esperado)
  db.close()
})
