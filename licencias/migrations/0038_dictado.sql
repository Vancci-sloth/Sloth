-- El dictado con las llaves de Deepgram de Sloth (src/dictado.ts). `dictado_uso`: cuántos segundos dictó cada quien
-- cada día (UTC), para su tope, y si tiene uno abierto (`abierto`, en ms; 0 si no). No se guarda el audio ni lo dicho.
CREATE TABLE dictado_uso (
  externo TEXT NOT NULL,
  dia TEXT NOT NULL,
  segundos INTEGER NOT NULL DEFAULT 0,
  abierto INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (externo, dia)
);

-- Las llaves que Deepgram rechazó (sin saldo, revocadas): su id (`idDe`, no la llave) y desde cuándo, en ms.
CREATE TABLE dictado_llaves (
  id TEXT PRIMARY KEY,
  agotada INTEGER NOT NULL
);
