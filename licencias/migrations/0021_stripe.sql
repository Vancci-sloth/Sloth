-- La tarjeta, con Stripe (`src/stripe.ts`). La columna `stripe` de `licencias` ya existe (de cuando se probó en octubre):
-- es la sesión de Checkout (`cs_…`) y, pagado el mensual, su suscripción (`sub_…`).
-- Lo pagado de cada sesión del año o del apoyo de una vez (la primera y cada renovación), con los nombres de estado de
-- Mercado Pago (`approved`, `refunded`…): de aquí sale hasta cuándo vale, como de `paypal_pagos`. `intento` es su
-- PaymentIntent, que traen los avisos de reembolso y de contracargo.
CREATE TABLE stripe_pagos (
  pago TEXT PRIMARY KEY,
  licencia TEXT NOT NULL,
  intento TEXT,
  estado TEXT NOT NULL,
  monto REAL NOT NULL,
  moneda TEXT NOT NULL,
  aprobado TEXT
);
CREATE INDEX stripe_pagos_licencia ON stripe_pagos (licencia);
CREATE INDEX stripe_pagos_intento ON stripe_pagos (intento);
