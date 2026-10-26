-- Stripe, junto a Mercado Pago. `stripe` es la sesión de Stripe Checkout (`cs_…`) mientras no se paga, y la
-- suscripción (`sub_…`) desde que existe. Una fila con `stripe` cobra con Stripe; sin él, con Mercado Pago.
ALTER TABLE licencias ADD COLUMN stripe TEXT;
CREATE UNIQUE INDEX licencias_stripe ON licencias (stripe);
