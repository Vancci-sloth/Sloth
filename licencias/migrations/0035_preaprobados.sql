-- Los estilos pre-aprobados por Sloth (ADR 0024) y la versión que sigue a la vista mientras se revisa otra.
--
-- `aprobada` pasa a tener tres valores: 0, en revisión (solo lo ven su autor y el creador); 1, aprobado; y 2,
-- pre-aprobado por Sloth: el creador le hizo la prueba, le completó lo que faltaba y le arregló sus errores, y ya lo ve
-- toda la comunidad. Su autor lo deja así («Así está bien», pasa a 1) o manda otra versión.
--
-- `publica`: lo que sigue viendo la comunidad de un estilo que ya estaba a la vista cuando su autor mandó otro paquete
-- (`{titulo, texto, adjuntos, aprobada}`, en JSON), hasta que el nuevo se apruebe. Sin ella, nada.
ALTER TABLE publicaciones ADD COLUMN publica TEXT;
