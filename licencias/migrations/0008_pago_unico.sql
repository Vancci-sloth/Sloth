-- El plan anual con Mercado Pago se paga de una vez en Checkout Pro (tarjeta, meses sin intereses, OXXO, SPEI…) y no
-- se renueva solo. `preferencia` es el último pago que se abrió para la fila (al apoyar, o al renovar); lo pagado se lee
-- de sus pagos en Mercado Pago, que llevan la fila en `external_reference`. Una fila con `preferencia` es un año pagado
-- de una vez; las suscripciones anuales de antes siguen con su `preapproval`.
ALTER TABLE licencias ADD COLUMN preferencia TEXT;
