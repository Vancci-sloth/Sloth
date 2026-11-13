-- Un reparto por persona y mes, aunque tenga varias claves, apoyos o computadoras.
-- `enviando` y `revisar` no se repiten solos: el proveedor pudo haber recibido la suma.
CREATE TABLE voz_mensual (
  externo TEXT NOT NULL,
  periodo TEXT NOT NULL,
  creditos INTEGER NOT NULL,
  email TEXT NOT NULL,
  clave TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  intento TEXT,
  entregado TEXT,
  correo TEXT,
  error TEXT,
  PRIMARY KEY (externo, periodo)
);
