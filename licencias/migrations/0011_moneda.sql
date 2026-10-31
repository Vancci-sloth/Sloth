-- La moneda en que se cobra cada apoyo. Desde el 30 de octubre de 2026 los nuevos van en dólares; los de antes siguen en
-- pesos, con su monto.
ALTER TABLE licencias ADD COLUMN moneda TEXT NOT NULL DEFAULT 'MXN';
