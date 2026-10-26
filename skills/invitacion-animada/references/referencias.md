# Referencias

Antes de construir, entiende qué hay que igualar o superar. La referencia puede ser el demo de un competidor, una imagen
(un render, una foto, un pin) o una invitación nuestra que se quiere repetir.

## El demo de un competidor

Su sitio se visita **una sola vez**, con la herramienta de captura, y de ahí en adelante se trabaja con la captura. Ya
pasó: después de que capturamos el demo de la carroza, un sitio de invitaciones nos bloqueó la IP (403 en todo
su sitio, octubre de 2026).

- **Busca primero la captura** en `referencias/` del taller. Cada demo tiene su carpeta, `<sitio>-<demo>` (por ejemplo,
  `referencias/competencia-pinata`). Si ya está, trabaja con ella.
- **Si falta, captúralo como lo vería un invitado en su teléfono:**

  ```
  node herramientas/referencia.mjs "<url>" referencias/<sitio>-<demo> 14
  ```

  Deja en esa carpeta:
  - `video.mp4`;
  - una captura cada medio segundo (`s012-6.0s.png`);
  - `pagina.html`;
  - `recursos.txt`, con los videos, imágenes y scripts que carga. Ahí se ve si su "animación" es un video o 3D de
    verdad.

  En una carpeta que ya tiene captura, la herramienta se niega. `DE_NUEVO=1` la repite, solo si el dueño pide una nueva.
- **Si se abre con un toque,** añade `TOQUE=centro` (o `TOQUE=x,y`).
- **Lo que la captura no tenga, pídeselo al dueño:** una grabación de la pantalla de su celular con el demo. Lo mismo si
  la herramienta avisa que su sitio respondió 403: ya bloqueó esta IP, y cada intento puede alargar el bloqueo.
- **Solo mira:** no llenes formularios ni inicies sesión en su sitio.

Después, escribe sus tiempos en una tabla (segundo, qué pasa) y, junto a cada uno, qué hará el nuestro mejor:

- **Detalle.** Más capas, un objeto con filigrana y no una forma lisa.
- **Profundidad.** Paralaje, niebla, reflejo.
- **Luz.** Bloom controlado, luz que sale del héroe y toca el suelo.
- **Ritmo.** Anticipación, clímax corto, transformación en ola, revelado en cascada.
- **Final.** El nombre llega sobre una escena tranquila y el ambiente sigue vivo.
- **Técnica.** Carga con pantalla de espera, sin tirones, fluida en cualquier teléfono.

## Una imagen de referencia

- **Si el dueño manda una imagen ("algo como así"), la meta es el nivel de detalle de esa imagen, no una aproximación.**
- **Recorta las zonas clave a tamaño grande** y estúdialas: la puerta, una rueda, la corona.
- **Haz la lista de lo que tiene:**
  - materiales (cristal escarchado, oro, perlas, gemas);
  - adornos y cómo se reparten;
  - la paleta;
  - de dónde viene la luz.
- **Construye y compara lado a lado**, con el mismo encuadre y a la misma escala (ver `verificar.md`). Repite hasta que
  la comparación no muestre algo que la referencia tenga y la nuestra no.

## Inspiración desde cero

Si no hay referencia y el tema lo pide, busca imágenes con la skill `pinterest-references`. Elige la paleta, el escenario
y el héroe con eso, antes de escribir código.

## El guion

Escríbelo en `<inv>/guion.md` antes de construir. Es corto:

```
# <Tema> para <nombre>

Historia: <una frase, con el momento que sorprende>
Estilo: <noche cinematográfica, día luminoso, caricatura, papel, acuarela, neón, minimalista…>
Protagonista: <qué es y cómo se construye>
Mecánica: <transformación, sobre, libro, telón…>
Escenario: <capas, de atrás hacia adelante>
Textos y tipografía: intro «…», arriba «…», nombre «…», abajo «…», pista «…»; fuentes
Paleta: <3–5 colores>
Extras: <fecha, lugar, botones, música, o ninguno>
Formato: <vertical 9:16 u otro>

| s | Qué pasa |
| --- | --- |
| 0 – 1.0 | Espera: … |
| 1.0 | Toque: … |
| … | Magia: … |
| FLASH | Destello: … |
| … | Transformación y revelado: … |
| … | Título |
| final | Ambiente vivo: … |

Mejor que la referencia en: …
```

`TAP`, `FLASH` y `DURATION` en el HTML salen de esta tabla.
