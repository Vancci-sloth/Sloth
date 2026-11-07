-- Varias llaves de socio de Voices Cloning (`src/voz.ts`), cada una su propia cuenta: en cuál vive cada usuario
-- (`llave`, el id de la llave, no el nombre de su secreto) y desde cuándo. El registro anota también con qué llave fue
-- cada llamada, para seguir una tarea en la llave donde se pidió.
CREATE TABLE voz_cuentas (
  externo TEXT PRIMARY KEY,
  llave TEXT NOT NULL,
  desde TEXT NOT NULL
);
ALTER TABLE voz_registro ADD COLUMN llave TEXT;
CREATE INDEX voz_registro_tarea ON voz_registro (tarea);
