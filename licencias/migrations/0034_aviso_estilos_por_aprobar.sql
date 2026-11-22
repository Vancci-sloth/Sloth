-- La 0033 le avisó a su campana (`incompleto`) solo al autor de un estilo que ya estaba en la tienda. Los que seguían por
-- aprobar se quedaron sin aviso: 36 estilos de 15 autores, el 19 de noviembre de 2026. Tampoco les contesta la revisión
-- automática, que no lee un estilo incompleto, así que solo se enteraban al entrar a Estilos. Aquí les llega el mismo
-- aviso, uno por estilo, a quien no lo tiene ya: correrla dos veces no repite ninguno. No hace falta otra después: desde
-- la 0033 el cobro no publica un estilo al que le falte algo.
INSERT INTO avisos (id, para, de, tipo, publicacion, creado)
SELECT lower(hex(randomblob(6))), p.autor, m.id, 'incompleto', p.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM publicaciones p JOIN miembros m ON m.clave = 'admin'
WHERE p.categoria = 'estilos' AND p.autor != m.id
  AND NOT EXISTS (SELECT 1 FROM avisos a WHERE a.publicacion = p.id AND a.tipo = 'incompleto')
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
