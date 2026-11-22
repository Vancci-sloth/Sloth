# Montaje musical, cámara y profundidad

## Comparación local que origina esta mejora

Se inspeccionaron cuadros de los dos MP4 aportados por el usuario. Resultado Deezer:
20 s, 1920×1080, 30 fps. Referencia Apple Music `9eCbazSUZYA`: 16,73 s, 3840×2160, 60 fps.
Los tiempos siguientes son aproximados, tomados de 24 cuadros distribuidos por archivo.
No son un análisis auditivo ni una medición de beats. La diferencia no se arregla exportando a 60 fps.

Deezer mantiene cinco poses principales: titular violeta (0–3 s), titular y portadas (4–7 s),
texto y teléfono (7,5–12 s), tres portadas alineadas (13–17 s), cierre (17,5–20 s).
Hay entradas y variaciones leves, pero después cada plano conserva casi el mismo encuadre.
La imagen generada dentro de una portada puede representar un objeto 3D sin que el montaje tenga profundidad real.

En Apple Music se observan otras relaciones:

- 0–1,4 s: bandas gráficas y marca pasan a un campo oscuro; contraste de densidad.
- 2,1–3,5 s: promesa breve, repetición de un retrato en profundidad y una portada aislada sobre fondo cromático.
- 3,5–4,2 s: el contenido gana un segundo foco con letras; cambia la distribución del encuadre.
- 4,9–6,3 s: palabras de gran tamaño y paneles ocupan y atraviesan el cuadro. El recorte es expresivo.
- 7–9,1 s: portadas repartidas a distintas escalas se convierten en una composición más densa de descubrimiento.
- 9,8–11,2 s: un panel audiovisual grande toma el protagonismo; no compite con otro gran titular lateral.
- 11,9–14 s: grupos de tarjetas, frase aislada y palabra final cambian el ritmo y la densidad.
- 14,6–16,7 s: cierre de marca con mucho menos contenido.

Transferir esa gramática, no copiar carátulas, artistas, funciones de Apple ni su diseño literal a otra marca.
La muestra permite observar profundidad y perspectiva; no demuestra qué software o técnica 3D usó su autor.

## Decidir antes de dibujar

Para un anuncio sin voz, el guion es visual. Elige una promesa y dos o tres demostraciones, con frases que
puedan leerse sin narrador. Verifica las funciones actuales del producto si vas a afirmarlas.
No conviertas cada frase en la misma diapositiva con un objeto al lado.

Elige una pista utilizable, conserva su procedencia y uso permitido en `direccion.md`. No extraigas la música
de la referencia para reutilizarla sin autorización. Mide su duración y escucha sus cambios cuando sea posible.
Una forma de onda o detector de energía propone acentos; no confirma por sí solo el compás o un BPM.
Registra tiempos de acentos y frases musicales. Si no puedes escuchar, declara esa limitación y no inventes
un análisis sonoro. Puedes preparar un animatic, pero no presentar su mezcla como auditivamente revisada.

En `direccion.md`, cada plano lleva: intervalo, texto visible, acción del protagonista, cámara, profundidad,
estado al llegar, pausa de lectura y objeto que conecta con el siguiente. Ajusta la duración a la música real.
En un montaje rápido pueden servir planos de 1–2,5 s y puentes de 0,3–0,7 s; son puntos de partida,
no una regla que obligue a cortar cada beat. Deja respirar los planos que necesitan lectura.

Ejemplo de `momentos.json` sin voz (sustituye tiempos y duración por los de la pieza):

```json
{
  "motor": "html", "sonido": "musica", "formato": "horizontal", "duracion": 8,
  "composicion": "composicion/index.html", "audio": "fuentes/audio/mezcla.wav",
  "portada": "Encuentra tu sonido",
  "momentos": [
    {"segundo": 0, "titulo": "Explora", "detalle": "La cámara recorre portadas a distintas profundidades"},
    {"segundo": 2.4, "titulo": "Elige", "detalle": "Una portada se adelanta y su color revela el titular"},
    {"segundo": 5.2, "titulo": "Escucha", "detalle": "El titular abre un mosaico; cierre de marca sobre el último acento"}
  ]
}
```

## Construcción: del movimiento decorativo a la transformación

Estudia `../ejemplos/montaje-musical.html` en el navegador. Es un laboratorio visual de 8 s sin música,
sin marca y sin recursos remotos: muestra galería con profundidad, acercamiento, máscara tipográfica y mosaico.
No es un anuncio terminado ni una plantilla obligatoria. Copia solo los mecanismos útiles al proyecto.
Abre con `?render=1` para capturar mediante el contrato `__mg`; fuera de él permite recorrer el tiempo.

**Galería que se convierte en protagonista.** Coloca portadas en x/y/z, con tamaños y distancias coherentes.
Mueve la cámara o su contenedor común, no todos los elementos independientemente sin relación.
Lleva la portada elegida al centro; las otras salen por perspectiva u oclusión. Su color, forma o contenido
debe reconocerse al transformarse en el plano siguiente. Mantén los textos de lectura sobre una capa frontal.

**Tipografía que dirige el plano.** Separa palabras en contenedores con máscara. Revela por desplazamiento
con una curva rápida al inicio y frenado al llegar. Usa una palabra grande como composición completa,
no cinco titulares pequeños. El recorte deliberado puede afectar letras decorativas; la frase comercial
necesita un momento legible completo. Mide los límites con la fuente cargada, también durante el movimiento.

**Mosaico y match cut.** Define posiciones iniciales y finales de las mismas portadas. Interpola sus centros,
escala y rotación; conserva una como ancla mientras las demás forman la cuadrícula. Evita ocultar una escena
y mostrar otra sin puente cuando el concepto pide continuidad. Un corte fuerte sigue siendo válido en un acento.

**Peso y ritmo.** Anticipación corta → desplazamiento principal → frenado → lectura. Desfasa elementos
relacionados unas centésimas, no toda una pantalla letra a letra. Reserva rebote para materiales elásticos;
el texto editorial y la cámara suelen necesitar curvas sin overshoot. El desenfoque solo acompaña una
aceleración breve, se retira antes de leer y no sustituye una trayectoria bien diseñada.

## Profundidad 2.5D y geometría 3D

Para portadas y paneles planos, CSS `perspective`, `transform-style: preserve-3d`, `translate3d` y `rotateY`
resuelven profundidad 2.5D. Separa `cámara → mundo → objeto → texto`: no animes el mismo transform desde dos
relojes. Evita un `filter` en el padre que aplane el contexto 3D. Sombra y brillo deben corresponder a la orientación.
Una portada plana no se convierte en un sólido por girarla; no la anuncies como render 3D real.

Para objetos con volumen, oclusión y luz que cambian al girar, usa Three.js o una secuencia renderizada en Blender.
Prepara dependencias locales y carga geometría/texturas antes de `ready=true`. En cada `seek(t)` asigna
posición, rotación, cámara y materiales a valores absolutos calculados desde t; termina con `renderer.render`.
No uses `rotation.y += …`, un bucle propio ni simulación física dependiente del historial.
En Three.js, una `PerspectiveCamera` que recorre una curva precalculada y mira a un objetivo interpolado
permite un travelling reproducible. Usa luces y materiales compatibles con la misma dirección de arte.
Si una pieza necesita volumen real, no sustituyas todo por PNG flotantes: reduce el alcance del plano o
prepara el objeto. Texturas/imágenes generadas con Flow son material, no fotogramas completos que deban quedarse quietos.

## Revisión de oficio

Antes del render largo, exporta un tramo de 3–5 s que contenga la transformación más difícil, no solo el cierre.
Revisa ida, vuelta y seek aleatorio: una posición temporal debe producir el mismo cuadro.
Compara hojas de contacto con la referencia para juzgar densidad y escala; después mira la reproducción para
juzgar aceleración, pausas y continuidad. Ninguna de las dos revisiones sustituye a la otra.

Si cuatro cuadros separados por medio segundo tienen prácticamente la misma composición, identifica si es
lectura intencional o un plano que no desarrolla ninguna acción. No añadas ruido o un flotado imperceptible
para engañar un detector de congelación. Compara el tamaño del protagonista y su recorrido, no solo píxeles cambiados.
Comprueba texto, assets, duración completa de música, ausencia de voz cuando no se pidió, cierre sin corte
brusco y restricciones reales del producto. La validación técnica no certifica calidad publicitaria.
