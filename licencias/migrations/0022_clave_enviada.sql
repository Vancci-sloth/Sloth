-- Cuándo aceptó Resend el correo con la clave de un apoyo (`bienvenida`). Si falla al confirmarse el pago, queda vacía
-- y el cron lo vuelve a intentar cada 10 minutos (`reenviarClaves`). Las de antes cuentan como mandadas: no se repiten.
ALTER TABLE licencias ADD COLUMN clave_enviada TEXT;
UPDATE licencias SET clave_enviada = autorizada WHERE autorizada IS NOT NULL;
