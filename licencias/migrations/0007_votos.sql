-- La votación del roadmap (src/comunidad.ts, `METAS`): un voto por miembro, que puede cambiar. El de un Fundador cuenta
-- doble al sumarlos; eso no se guarda aquí, se calcula con su insignia.
CREATE TABLE votos (
  miembro TEXT PRIMARY KEY,
  meta TEXT NOT NULL,
  creado TEXT NOT NULL
);
