-- Las rifas del creador (`src/rifa.ts`). Se abren sin decir qué se rifa; al sortear se guarda qué fue (`premio`),
-- cuántos ganaron y los créditos de voz de cada uno (0: un premio que el creador da a mano). Solo una abierta a la vez.
CREATE TABLE rifas (
  id TEXT PRIMARY KEY,
  premio TEXT NOT NULL DEFAULT '',
  creditos INTEGER NOT NULL DEFAULT 0,
  ganadores INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'abierta',
  creada TEXT NOT NULL,
  sorteada TEXT
);
CREATE UNIQUE INDEX rifas_una_abierta ON rifas (estado) WHERE estado = 'abierta';

-- Quién participa: una persona por correo (`externo`, el id de la primera licencia de su correo, como en las voces), con
-- el miembro de la comunidad que pulsó el botón.
CREATE TABLE rifa_participantes (
  rifa TEXT NOT NULL,
  externo TEXT NOT NULL,
  miembro TEXT NOT NULL,
  desde TEXT NOT NULL,
  PRIMARY KEY (rifa, externo)
);

-- Quién ganó y cómo va su premio. `estado`: `pendiente`, `preparando`, `enviando` (se pidió la suma al proveedor),
-- `entregado`, `revisar` (la suma pudo haber llegado: no se repite sola) o `a-mano` (sin créditos: lo da el creador).
-- `correo`, cuándo salió el suyo; `visto`, cuándo cerró el aviso en su Sloth.
CREATE TABLE rifa_ganadores (
  rifa TEXT NOT NULL,
  externo TEXT NOT NULL,
  miembro TEXT NOT NULL,
  email TEXT NOT NULL,
  creditos INTEGER NOT NULL,
  estado TEXT NOT NULL,
  intento TEXT,
  entregado TEXT,
  correo TEXT,
  visto TEXT,
  error TEXT,
  PRIMARY KEY (rifa, externo)
);
CREATE INDEX rifa_ganadores_miembro ON rifa_ganadores (miembro, visto);
