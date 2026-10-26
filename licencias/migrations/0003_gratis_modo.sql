-- Los lugares gratis de por vida: filas con `plan` y `estado` 'gratis', sin suscripción de Mercado Pago.
-- `modo` es el MP_MODO con que se creó cada una: los lugares de fundador y la cuenta de personas solo cuentan las
-- pagadas de verdad ('produccion'), no las de prueba. Las que ya había son de prueba.
ALTER TABLE licencias ADD COLUMN modo TEXT NOT NULL DEFAULT 'prueba';
