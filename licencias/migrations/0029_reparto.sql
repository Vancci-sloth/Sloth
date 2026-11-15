-- El reparto del fondo de la comunidad (src/reparto.ts). Quien quiere su parte pone su Binance ID: ahí se le paga; sin
-- él no participa. Uno por persona: el mismo no va en dos cuentas. `binance_desde`: cuándo lo puso o lo cambió.
ALTER TABLE miembros ADD COLUMN binance TEXT;
ALTER TABLE miembros ADD COLUMN binance_desde TEXT;
CREATE UNIQUE INDEX miembros_binance ON miembros (binance) WHERE binance IS NOT NULL;

-- Cada vez que alguien lo pone, lo cambia o lo quita (`binance` vacío), con la conexión de donde llegó, cifrada como en
-- estilo_usos: para ver, antes de pagar, si alguien lo cambió hace poco.
CREATE TABLE binance_cambios (
  miembro TEXT NOT NULL,
  binance TEXT NOT NULL,
  red TEXT NOT NULL DEFAULT '',
  cuando TEXT NOT NULL
);
CREATE INDEX binance_cambios_miembro ON binance_cambios (miembro, cuando);

-- Un periodo ya cerrado: las cuentas del fondo (JSON de `FondoComunidad`) y los puntos entre los que se repartió, tal
-- como estaban al cerrarlo. Lo que se descarte o cambie después ya no mueve lo que se pagó.
CREATE TABLE repartos (
  periodo TEXT PRIMARY KEY,
  cerrado TEXT NOT NULL,
  fondo TEXT NOT NULL,
  puntos INTEGER NOT NULL
);

-- La parte de cada quien en un periodo cerrado: el Binance ID que tenía entonces, sus puntos, lo que le toca por moneda
-- (`montos`), de qué estilos salió (`estilos`) y lo que conviene mirar antes de pagarle (`avisos`), en JSON. `pagado`:
-- cuándo dijo el creador que ya se lo mandó, con su `referencia` (el número de la orden de Binance).
CREATE TABLE reparto_partes (
  periodo TEXT NOT NULL,
  miembro TEXT NOT NULL,
  binance TEXT NOT NULL,
  puntos INTEGER NOT NULL,
  montos TEXT NOT NULL,
  estilos TEXT NOT NULL,
  avisos TEXT NOT NULL DEFAULT '[]',
  pagado TEXT,
  referencia TEXT,
  PRIMARY KEY (periodo, miembro)
);
CREATE INDEX reparto_partes_miembro ON reparto_partes (miembro, periodo);
