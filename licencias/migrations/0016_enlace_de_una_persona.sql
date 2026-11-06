-- Cada enlace de Fundador es de una sola persona: la fila que se abrió con él (`enlace_fundador`) y, al confirmarse su
-- primer pago, `usado` (el id de esa fila), desde cuando ya no sirve a nadie más.
ALTER TABLE licencias ADD COLUMN enlace_fundador TEXT;
ALTER TABLE enlaces_fundador ADD COLUMN usado TEXT;
