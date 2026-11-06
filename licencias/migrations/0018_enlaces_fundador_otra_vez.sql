-- Vuelven los enlaces de invitación de Fundador (`npm run fundador -- nuevo`), junto a los 25 lugares públicos: cada uno
-- es de una sola persona, la hace Fundadora aunque los 25 estén ocupados y deja de servir con su primer pago (`usado`,
-- el id de esa fila). `enlace_fundador`: el enlace con que se abrió cada fila.
CREATE TABLE enlaces_fundador (
  codigo TEXT PRIMARY KEY,
  nota TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL,
  revocado TEXT,
  usado TEXT
);
ALTER TABLE licencias ADD COLUMN enlace_fundador TEXT;
