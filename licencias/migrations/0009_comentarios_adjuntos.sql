-- Las imágenes de un comentario (src/comunidad.ts): JSON como el de `publicaciones.adjuntos`, solo imágenes.
ALTER TABLE comentarios ADD COLUMN adjuntos TEXT NOT NULL DEFAULT '[]';
