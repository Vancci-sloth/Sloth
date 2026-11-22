# Spotify: acciones conectadas y dirección de cámara

Referencia local: `Motion-Graphics-Spotify-AD`, identificador `cxA-qJsJL30`.
Inspección visual de 24 cuadros repartidos por aproximadamente 21,1 segundos.
Los intervalos son aproximados: permiten reconocer composiciones y cambios, pero no medir
curvas de aceleración, beats ni sincronía sonora. No se escuchó el audio en esta revisión.

## Qué se observa

- 0–4,4 s: cursor grande, frase, barra de búsqueda y panel translúcido. La interfaz tiene un
  protagonista y una acción; una cuadrícula tenue y luces verdes mantienen el espacio común.
- 5,3–6,2 s: pared inclinada de retratos y portadas, con profundidad y un titular breve.
  Cambian la escala, el encuadre y la densidad respecto de la búsqueda.
- 7–8,8 s: dos portadas escalonadas, cursor y frase sobre crear listas. Formas circulares
  grandes estructuran el fondo sin competir con el mensaje.
- 9,7–13,2 s: teléfono inclinado que cambia de posición y contenido entre cuadros;
  el titular conserva una estructura y sustituye la palabra protagonista.
- 14–15,8 s: composición tipográfica de descarga, iconos y círculos a distintas escalas.
- 16,7–21,1 s: símbolo, nombre y firma aparecen con menos elementos. El cierre respira.

No se infiere el software utilizado ni que todas las superficies sean geometría 3D real.
La referencia Apple Music de MONTAJE-MUSICAL.md aporta más contraste editorial y mosaicos;
esta aporta continuidad de producto, interacción y materiales. Elegir según el mensaje,
sin convertir la combinación de ambas en una secuencia obligatoria para todos los anuncios.

## Convertir la referencia en planos propios

Antes de programar, escribir en `direccion.md` para cada plano:

1. **Qué demuestra:** beneficio concreto y texto visible, normalmente una frase breve.
2. **Estado inicial → acción → estado final:** por ejemplo, buscar → elegir → reproducir.
3. **Objeto que continúa:** portada, cursor, forma o palabra reconocible en el siguiente plano.
4. **Trayectoria:** recorrido del objeto y de cámara, profundidad, oclusión y punto de llegada.
5. **Lectura y enlace:** cuándo se estabiliza el mensaje y cómo entrega el foco al siguiente.

Si el plan solo dice «aparece texto, entra tarjeta», aún falta la acción. Un teléfono girando
sin demostrar nada tampoco sustituye la dirección. No inventar botones o funciones comerciales
del producto para justificar una transición; una interfaz conceptual debe presentarse como tal.

## Recetas adaptables de movimiento

**Búsqueda → descubrimiento.** El cursor llega, presiona y libera; la respuesta empieza después
de la pulsación. El panel se expande y revela resultados mediante máscara. Una portada elegida
permanece como ancla mientras las demás ocupan profundidad. Programar las fases con tiempos
absolutos, evitando que el cursor y la respuesta ocurran simultáneamente sin relación causal.

**Pared → portada.** Distribuir planos en un mundo con perspectiva y mover su contenedor común.
Acercar una portada mientras las vecinas la enmarcan y después salen por oclusión. Separar
el titular en una capa legible. La selección termina en una composición distinta del inicio;
no basta mantener una cuadrícula y desplazarla unos píxeles durante varios segundos.

**Portada → reproductor.** Conservar la misma imagen en ambos estados. Interpolar su posición
y escala hacia la pantalla del dispositivo; revelar controles después de llegar. Para un giro
que muestre canto o reverso, construir volumen o usar un recurso renderizado con ese volumen.
Una imagen plana inclinada sirve para una vista frontal en perspectiva, no para simular todas
las caras. Cambiar reflejos y sombra coherentemente con el giro, sin deformar textos ni logos.

**Palabra → palabra.** Mantener estable la parte común del titular, sustituir el término variable
dentro de una máscara y vincularlo al cambio visible del producto. Dar tiempo a leer cada estado.
Puede acompañarse de un cambio de encuadre; evitar animar todas las letras y el dispositivo
con rebote a la vez. El foco debe seguir siendo inequívoco.

**Producto → firma.** Reducir densidad, resolver la acción y dar paso a marca y llamada breve.
El cierre puede sostenerse: no necesita movimiento permanente. No añadir un formulario o una
pantalla de editor genérica si el anuncio trata sobre escuchar música.

## Prueba antes de producir toda la pieza

Construir primero el puente más difícil en un animatic de 3–5 segundos. Puede usar portadas
provisionales, pero debe mostrar trayectoria, continuidad, escala y ritmo reales. Luego sustituir
los recursos y volver a comprobar dimensiones. No usar capturas completas de la referencia
como escenas finales ni reutilizar su música sin permiso.

Revisar el inicio, centro y final de cada transformación y también su reproducción normal.
Comparar contra la referencia: ¿cambia el encuadre?, ¿hay un protagonista claro?, ¿los elementos
se relacionan?, ¿el texto tiene una llegada legible?, ¿hay profundidad con oclusión coherente?
Registrar en `revision.md` lo observado y lo pendiente, sin declarar que una hoja de cuadros
certifica fluidez o que pasar las comprobaciones técnicas garantiza un acabado publicitario.
