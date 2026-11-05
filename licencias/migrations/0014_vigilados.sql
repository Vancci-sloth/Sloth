-- A quién se le avisó por correo que se vio actividad sospechosa en su cuenta (`tipo` 'vigilada') o que se bloqueó
-- ('bloqueada', una licencia con estado 'vetada'), por qué y cuándo: se le vuelve a avisar a la semana, no antes.
CREATE TABLE vigilados (
  email TEXT NOT NULL,
  tipo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  avisado TEXT NOT NULL,
  PRIMARY KEY (email, tipo)
);
