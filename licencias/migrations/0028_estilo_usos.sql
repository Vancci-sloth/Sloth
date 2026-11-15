-- Lo que se hace con cada estilo de la comunidad (src/tienda.ts): una descarga por computadora (`equipo`) y un video
-- terminado por computadora y archivo (`huella`, la del video; '' en una descarga). Nunca lo del autor del estilo.
-- `red`: la conexión de donde llegó, cifrada (HMAC de su prefijo de IP): las computadoras de una misma red son una
-- persona. `prueba`: la portada del video en R2 (bajo comunidad/), que solo ve el creador. `descartado`: 1 si el creador
-- dijo que no cuenta. `periodo`: el mes de Ciudad de México ('2026-11'), con el que se reparte el fondo de la comunidad.
CREATE TABLE estilo_usos (
  publicacion TEXT NOT NULL,
  tipo TEXT NOT NULL,
  equipo TEXT NOT NULL,
  huella TEXT NOT NULL DEFAULT '',
  miembro TEXT NOT NULL,
  red TEXT NOT NULL DEFAULT '',
  prueba TEXT,
  descartado INTEGER NOT NULL DEFAULT 0,
  periodo TEXT NOT NULL,
  creado TEXT NOT NULL,
  PRIMARY KEY (publicacion, tipo, equipo, huella)
);
CREATE INDEX estilo_usos_periodo ON estilo_usos (periodo, tipo, publicacion);
