-- La app del celular (src/celular.ts): los celulares de cada clave, contados aparte de sus computadoras (`equipos`).
CREATE TABLE celulares (
  clave TEXT NOT NULL,
  equipo TEXT NOT NULL,
  visto TEXT NOT NULL,
  PRIMARY KEY (clave, equipo)
);
