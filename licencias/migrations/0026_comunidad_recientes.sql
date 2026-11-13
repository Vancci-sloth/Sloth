-- El feed de la comunidad por «Más recientes» (`consultaFeed`, orden `recientes`) va por la fecha de publicación.
CREATE INDEX publicaciones_creada ON publicaciones (creada);
CREATE INDEX publicaciones_categoria_creada ON publicaciones (categoria, creada);
