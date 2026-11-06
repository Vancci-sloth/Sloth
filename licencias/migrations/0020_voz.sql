-- Cada llamada a Voices Cloning que pasa por el cobro (`src/voz.ts`): quién (`externo`, el usuario en Voices Cloning;
-- `creador` para el creador), qué (`accion`: alta, sesion, tts, tarea, creditos, estado), con qué voz y cuántas letras,
-- lo que gastó y le quedó, y cómo respondió (`status`, y si falló, `codigo` y `error`). `ms`, lo que tardó. Lo de más de
-- 180 días lo borra el cron.
CREATE TABLE voz_registro (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuando TEXT NOT NULL,
  externo TEXT NOT NULL,
  accion TEXT NOT NULL,
  voz TEXT,
  letras INTEGER,
  creditos INTEGER,
  restantes INTEGER,
  tarea TEXT,
  status INTEGER NOT NULL,
  codigo TEXT,
  error TEXT,
  ms INTEGER
);
CREATE INDEX voz_registro_cuando ON voz_registro (cuando);
CREATE INDEX voz_registro_externo ON voz_registro (externo, id);
