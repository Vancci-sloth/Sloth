-- Desde el 18 de noviembre de 2026 el apoyo sube con la gente y a cada quien le baja con el tiempo (`src/escalera.ts`).
-- `piso`: hasta dónde baja el cobro de cada mes de esta suscripción, en su moneda; vacío, no baja (las de antes, lo
-- pagado de una vez y quien eligió su monto). `bajado`: el `pagado_hasta` del mes con que ya bajó, para bajar una sola
-- vez por cada mes pagado.
ALTER TABLE licencias ADD COLUMN piso REAL;
ALTER TABLE licencias ADD COLUMN bajado TEXT;
