-- Desde el 19 de noviembre de 2026 todo estilo de la comunidad lleva lo mismo (`shared/guia.ts`): su guía de uso con qué
-- herramientas de Sloth usa y con qué agentes funciona, un video entero hecho con él y la prueba de con qué agente se
-- hizo, cuánto costó y cuánto tardó, con el hilo donde se hizo como evidencia. Los que ya estaban aprobados sin eso dejan de verse en la tienda (`aprobada = 0`,
-- como uno por aprobar) hasta que su autor los complete con «Compartir»; él los ve en rojo, con lo que les falta
-- (`PublicacionComunidad.incompleto`). Los del creador de Sloth se quedan: los completa él.
-- A cada autor le llega un aviso a su campana (`incompleto`), del creador; va antes de esconderlos, que usa la misma cuenta.
INSERT INTO avisos (id, para, de, tipo, publicacion, creado)
SELECT lower(hex(randomblob(6))), p.autor, m.id, 'incompleto', p.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM publicaciones p JOIN miembros m ON m.clave = 'admin'
WHERE p.categoria = 'estilos' AND p.aprobada = 1 AND p.autor != m.id
  AND NOT (
    EXISTS (SELECT 1 FROM json_each(p.adjuntos) j WHERE json_extract(j.value, '$.tipo') = 'video')
    AND EXISTS (
      SELECT 1 FROM json_each(p.adjuntos) j
      WHERE json_extract(j.value, '$.tipo') = 'estilo'
        AND json_array_length(coalesce(json_extract(j.value, '$.guia.herramientas'), '[]')) > 0
        AND json_array_length(coalesce(json_extract(j.value, '$.guia.agentes'), '[]')) > 0
        AND coalesce(json_extract(j.value, '$.prueba.segundos'), 0) > 0
        AND json_extract(j.value, '$.prueba.evidencia') IS NOT NULL
    )
  );

UPDATE publicaciones SET aprobada = 0
WHERE categoria = 'estilos' AND aprobada = 1
  AND autor NOT IN (SELECT id FROM miembros WHERE clave = 'admin')
  AND NOT (
    EXISTS (SELECT 1 FROM json_each(publicaciones.adjuntos) j WHERE json_extract(j.value, '$.tipo') = 'video')
    AND EXISTS (
      SELECT 1 FROM json_each(publicaciones.adjuntos) j
      WHERE json_extract(j.value, '$.tipo') = 'estilo'
        AND json_array_length(coalesce(json_extract(j.value, '$.guia.herramientas'), '[]')) > 0
        AND json_array_length(coalesce(json_extract(j.value, '$.guia.agentes'), '[]')) > 0
        AND coalesce(json_extract(j.value, '$.prueba.segundos'), 0) > 0
        AND json_extract(j.value, '$.prueba.evidencia') IS NOT NULL
    )
  );
