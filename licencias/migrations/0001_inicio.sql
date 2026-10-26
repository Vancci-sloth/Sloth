-- Una fila por suscripción de Mercado Pago. `id` es su external_reference; `clave`, lo que guarda Sloth; `preapproval`,
-- el id de la suscripción en Mercado Pago. `pagado_hasta` es su próximo cobro la última vez que estuvo autorizada:
-- cancelada, Sloth sigue abierta hasta ahí. `autorizada`, la primera vez que se pagó (cuenta los lugares de fundador).
CREATE TABLE licencias (
  id TEXT PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  plan TEXT NOT NULL,
  monto INTEGER NOT NULL,
  fundador INTEGER NOT NULL DEFAULT 0,
  preapproval TEXT UNIQUE,
  enlace TEXT,
  estado TEXT NOT NULL DEFAULT 'pending',
  pagado_hasta TEXT,
  autorizada TEXT,
  creada TEXT NOT NULL,
  revisada TEXT
);
CREATE INDEX licencias_email ON licencias (email);

-- Las computadoras que usan cada clave, con la última vez que preguntaron.
CREATE TABLE equipos (
  clave TEXT NOT NULL,
  equipo TEXT NOT NULL,
  visto TEXT NOT NULL,
  PRIMARY KEY (clave, equipo)
);
