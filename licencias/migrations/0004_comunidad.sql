-- La comunidad (src/comunidad.ts). `miembros`: una fila por licencia que entró alguna vez (`clave`) y la del creador
-- (`clave` = 'admin', que entra con la llave PUBLICAR). Los demás ven su `id`, nunca su clave. `foto`: su llave en R2.
CREATE TABLE miembros (
  id TEXT PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL DEFAULT '',
  foto TEXT,
  creado TEXT NOT NULL,
  visto TEXT NOT NULL
);

-- `adjuntos`: JSON con las imágenes y el video, llaves de R2 (`DESCARGAS`, bajo comunidad/). `estado`, solo en Mejoras:
-- null (una idea), 'haciendo' o 'hecha', y lo pone el creador. `actividad`: cuándo se publicó o se comentó por última
-- vez; ordena el feed. `comentarios`, `likes` y `reportes` se cuentan al cambiar, para no contarlos en cada página.
CREATE TABLE publicaciones (
  id TEXT PRIMARY KEY,
  autor TEXT NOT NULL,
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  adjuntos TEXT NOT NULL DEFAULT '[]',
  fijada INTEGER NOT NULL DEFAULT 0,
  estado TEXT,
  creada TEXT NOT NULL,
  editada TEXT,
  actividad TEXT NOT NULL,
  comentarios INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  reportes INTEGER NOT NULL DEFAULT 0,
  ultimo_comentario TEXT
);
CREATE INDEX publicaciones_orden ON publicaciones (fijada, actividad);
CREATE INDEX publicaciones_categoria ON publicaciones (categoria, fijada, actividad);
CREATE INDEX publicaciones_autor ON publicaciones (autor, creada);

-- `responde`: el comentario de primer nivel al que responde (las respuestas no se anidan más).
CREATE TABLE comentarios (
  id TEXT PRIMARY KEY,
  publicacion TEXT NOT NULL,
  autor TEXT NOT NULL,
  texto TEXT NOT NULL,
  creada TEXT NOT NULL,
  responde TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  reportes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX comentarios_publicacion ON comentarios (publicacion, creada);
CREATE INDEX comentarios_autor ON comentarios (autor, creada);

CREATE TABLE likes (
  publicacion TEXT NOT NULL,
  miembro TEXT NOT NULL,
  PRIMARY KEY (publicacion, miembro)
);
CREATE TABLE likes_comentarios (
  comentario TEXT NOT NULL,
  miembro TEXT NOT NULL,
  PRIMARY KEY (comentario, miembro)
);

-- Un reporte por miembro y cosa reportada (`objeto`: una publicación o un comentario).
CREATE TABLE reportes (
  objeto TEXT NOT NULL,
  miembro TEXT NOT NULL,
  motivo TEXT NOT NULL,
  creado TEXT NOT NULL,
  PRIMARY KEY (objeto, miembro)
);

-- Los avisos de cada miembro (`para`): quién (`de`) hizo qué (`tipo`) en cuál publicación. Se borran a los 60 días.
CREATE TABLE avisos (
  id TEXT PRIMARY KEY,
  para TEXT NOT NULL,
  de TEXT NOT NULL,
  tipo TEXT NOT NULL,
  publicacion TEXT NOT NULL,
  comentario TEXT,
  texto TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL,
  leido INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX avisos_para ON avisos (para, leido, creado);
CREATE INDEX avisos_publicacion ON avisos (publicacion);
