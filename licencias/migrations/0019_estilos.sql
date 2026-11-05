-- Los estilos de la comunidad (sección Estilos): uno nuevo, o uno al que le cambian el paquete, no se ve hasta que el
-- creador lo aprueba. Lo que ya estaba publicado queda aprobado.
ALTER TABLE publicaciones ADD COLUMN aprobada INTEGER NOT NULL DEFAULT 1;
