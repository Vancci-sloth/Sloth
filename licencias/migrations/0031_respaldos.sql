-- Tu Sloth en otra computadora (src/respaldo.ts, ADR 0020): la copia que cada Sloth guarda con su clave, una por clave y
-- computadora (`equipo`). El paquete va en R2 (respaldos/<clave>/<equipo>); aquí, su ficha: el nombre de la computadora,
-- cuánto pesa (con lo que se cuida el tope de todas juntas), qué trae (`resumen`, un JSON con sus estilos y cuántos
-- chats) y cuándo se guardó, con lo que se borran las que nadie renueva.
CREATE TABLE respaldos (
  clave TEXT NOT NULL,
  equipo TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL,
  resumen TEXT NOT NULL DEFAULT '{}',
  guardado TEXT NOT NULL,
  PRIMARY KEY (clave, equipo)
);
CREATE INDEX respaldos_guardado ON respaldos (guardado);
