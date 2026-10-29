-- PayPal en lugar de Mercado Pago para los apoyos nuevos; los de Mercado Pago siguen con su `preapproval` o su
-- `preferencia`. `paypal` es la suscripción mensual (`I-…`); `orden`, la última orden de PayPal que se abrió para un
-- año pagado de una vez (al apoyar o al renovar).
ALTER TABLE licencias ADD COLUMN paypal TEXT;
CREATE UNIQUE INDEX licencias_paypal ON licencias (paypal);
ALTER TABLE licencias ADD COLUMN orden TEXT;

-- Lo cobrado de cada orden de un año pagado de una vez, con los nombres de estado de Mercado Pago (`approved`,
-- `refunded`…): de aquí sale hasta cuándo vale, como de los pagos de Checkout Pro.
CREATE TABLE paypal_pagos (
  orden TEXT PRIMARY KEY,
  licencia TEXT NOT NULL,
  estado TEXT NOT NULL,
  monto REAL NOT NULL,
  moneda TEXT NOT NULL,
  aprobado TEXT
);
CREATE INDEX paypal_pagos_licencia ON paypal_pagos (licencia);

-- Los ids que PayPal da una vez y se reusan: el producto «Sloth» y el plan mensual de cada monto, por modo.
CREATE TABLE paypal_ids (
  llave TEXT PRIMARY KEY,
  id TEXT NOT NULL
);
