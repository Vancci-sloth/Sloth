-- Lo que cada quien hizo en el último día (publicar, comentar, reportar, pedir su cuenta), para su cupo: se cuenta y se
-- anota en un solo paso, y borrar lo publicado no lo devuelve. El cron borra lo de hace más de dos días.
CREATE TABLE cupos (
  quien TEXT NOT NULL,
  tipo TEXT NOT NULL,
  creado TEXT NOT NULL
);
CREATE INDEX cupos_quien ON cupos (quien, tipo, creado);
CREATE INDEX cupos_creado ON cupos (creado);
