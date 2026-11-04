-- El apoyo con cripto, en NOWPayments: `cripto` es la última factura que se abrió para la fila (al apoyar o al renovar).
-- Con cripto no hay cobro automático: el mes, el año o el apoyo de una vez se pagan cada uno con su factura.
ALTER TABLE licencias ADD COLUMN cripto TEXT;

-- Lo pagado de cada factura (un pago de NOWPayments por moneda que se eligió), con los nombres de estado de Mercado Pago
-- (`approved`, `refunded`…): de aquí sale hasta cuándo vale, como de `paypal_pagos`.
CREATE TABLE cripto_pagos (
  pago TEXT PRIMARY KEY,
  licencia TEXT NOT NULL,
  estado TEXT NOT NULL,
  monto REAL NOT NULL,
  moneda TEXT NOT NULL,
  aprobado TEXT
);
CREATE INDEX cripto_pagos_licencia ON cripto_pagos (licencia);
