-- Los créditos de sloth.vancci.org: un Fundador que lo pide sale ahí con el nombre de su perfil (`GET /creditos`).
ALTER TABLE miembros ADD COLUMN creditos INTEGER NOT NULL DEFAULT 0;
