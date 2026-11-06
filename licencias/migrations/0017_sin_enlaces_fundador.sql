-- Los lugares de Fundador ya no van por enlace de invitación: los toma quien paga el precio de Fundador mientras queden.
DROP TABLE enlaces_fundador;
ALTER TABLE licencias DROP COLUMN enlace_fundador;
