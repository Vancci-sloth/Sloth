-- Los avisos por correo a quienes apoyan (src/aviso-correo.ts): a quién le llegó cada uno (`aviso`, su id en `AVISOS`)
-- y cuándo, para no mandárselo dos veces y seguir donde se quedó si el envío se corta.
CREATE TABLE avisos_correo (
  aviso TEXT NOT NULL,
  email TEXT NOT NULL,
  enviado TEXT NOT NULL,
  PRIMARY KEY (aviso, email)
);
