-- El 13 de noviembre de 2026 el apoyo bajó a $10 USD (199 MXN) al mes, y lo que cada quien pagó de más se le dio como
-- tiempo (`src/bajar-apoyo.ts`). `extra_dias`: los días que se le sumaron (en lo pagado de una vez, se suman a lo que dan
-- sus pagos). `extra_hasta`: hasta cuándo vale con ellos; una suscripción no baja de ahí al volver a leerse. `reanudar`:
-- la suscripción de PayPal o de Mercado Pago que se pausó para no cobrar antes, y que el cron reanuda ese día.
-- `extra_avisado`: cuándo salió su correo.
ALTER TABLE licencias ADD COLUMN extra_dias INTEGER NOT NULL DEFAULT 0;
ALTER TABLE licencias ADD COLUMN extra_hasta TEXT;
ALTER TABLE licencias ADD COLUMN reanudar TEXT;
ALTER TABLE licencias ADD COLUMN extra_avisado TEXT;
CREATE INDEX licencias_reanudar ON licencias (reanudar) WHERE reanudar IS NOT NULL;
