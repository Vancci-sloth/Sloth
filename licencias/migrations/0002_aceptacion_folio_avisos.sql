-- Lo que pide la Ley Federal de Protección al Consumidor (art. 76 Bis VIII y IX) para un cobro recurrente:
-- `acepto` es cuándo aceptó el cliente el cobro automático y los términos, y `terminos`, qué versión aceptó;
-- `folio` y `cancelada`, el comprobante de su cancelación; `avisado_para`, el cobro del que ya se le avisó por correo.
ALTER TABLE licencias ADD COLUMN acepto TEXT;
ALTER TABLE licencias ADD COLUMN terminos TEXT;
ALTER TABLE licencias ADD COLUMN folio TEXT;
ALTER TABLE licencias ADD COLUMN cancelada TEXT;
ALTER TABLE licencias ADD COLUMN avisado_para TEXT;
