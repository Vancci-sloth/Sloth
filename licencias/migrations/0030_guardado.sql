-- Lo que es igual para todos y sale de recorrer tablas enteras (src/guardado.ts): los miembros y activos de la
-- comunidad, los conteos del precio, los votos del roadmap y los créditos de la página. Se calcula una vez cada tanto y
-- cualquier copia del Worker lo lee de aquí con una sola fila. `valor`: su JSON. `hasta`: hasta cuándo vale (ms).
CREATE TABLE guardado (
  nombre TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  hasta INTEGER NOT NULL
);
