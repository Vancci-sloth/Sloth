-- Sloth en la web (src/web.ts, ADR 0025): dónde está ahora el túnel de cada computadora que encendió la web. `llave` es
-- el resumen (SHA-256) de la llave que solo esa computadora tiene: sin ella no se cambia su dirección. `url` es NULL con
-- la web apagada. Las que no avisan en 90 días se borran (`olvidarWeb`).
CREATE TABLE web_equipos (
  equipo TEXT PRIMARY KEY,
  llave TEXT NOT NULL,
  url TEXT,
  nombre TEXT NOT NULL DEFAULT '',
  visto TEXT NOT NULL,
  creado TEXT NOT NULL
);
CREATE INDEX web_equipos_visto ON web_equipos (visto);
-- Los códigos cortos para conectar un dispositivo escribiéndolo en la entrada: su resumen, de qué computadora son y
-- cuándo vencen (10 minutos). Se borran al usarse.
CREATE TABLE web_codigos (
  corto TEXT PRIMARY KEY,
  equipo TEXT NOT NULL,
  vence TEXT NOT NULL
);
