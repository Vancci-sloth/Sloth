-- Los enlaces de invitación de Fundador que da el creador (`npm run fundador -- nuevo`): con uno, sloth.vancci.org
-- ofrece el apoyo de Fundador mientras queden lugares. `nota` es para quién o dónde se dio; `revocado`, desde cuándo ya
-- no sirve.
CREATE TABLE enlaces_fundador (
  codigo TEXT PRIMARY KEY,
  nota TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL,
  revocado TEXT
);
