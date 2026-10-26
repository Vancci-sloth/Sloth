# Rendimiento

La invitación se abre en teléfonos de todo tipo, en cualquier lugar. Debe verse fluida y con la misma calidad en
todos. Esto dice cuánto es "fluida", cómo medirlo y qué hacer cuando no lo es.

## Metas

| Medida | Herramienta | Meta | La carroza |
| --- | --- | --- | --- |
| ms por cuadro a 810×1440 en la GPU de esta PC | `medir.mjs` | ≤ 4 ms en el peor instante | 1.7 – 3.1 ms |
| Llamadas de dibujo | `medir.mjs` | < 100 | 62 – 85 |
| Shaders y texturas que se preparan a mitad de la animación | `tirones.mjs` | 0 y 0 | 0 y 0 |
| Procesador ×4: teléfono de gama media | `fluidez.mjs <inv> 4` | ≥ 60 fps, casi ningún cuadro > 33 ms, calidad nivel 0 | 88 fps, 3 de 754 |
| Procesador ×6: gama baja | `fluidez.mjs <inv> 6` | ≥ 40 fps, cuadros > 33 ms por debajo del 15 % | 44 fps, 47 de 381 |
| GPU débil (`SW=1`) | `fluidez.mjs` con `SW=1` | La calidad baja de nivel sola (termina en un nivel mayor que 0) | baja al nivel 5 |

Chromium sin pantalla no limita a 60 fps: verás 90 o 140. Lo que importa es que pase de 60 y que casi no haya cuadros de
más de 33 ms.

## Reglas

Cada una nació de un problema medido.

1. **Una llamada de dibujo para muchas piezas.**
   - Las piezas fijas van en `mergeParts` y se revelan con `revealUntil`.
   - Las repetidas (hojas, vidrios), en `InstancedMesh`.
   - Los halos y el bokeh, en `quadBatch`.
2. **Prepararlo todo antes de mostrar nada.** Es `warmUp()`:
   - sube todas las texturas (`initTexture`);
   - vuelve visible todo lo oculto;
   - compila con `compileAsync` dentro de `composer.renderTarget1`, que es donde se dibuja de verdad. Compilar contra
     la pantalla deja shaders sin preparar.
   - Si un material cambia de variante a mitad de la animación, compila las dos. La iridiscencia que pasa de 0 a más es
     otro shader: la carroza repite `compileAsync` con `bodyMat.iridescence = 0.5` y con `0`.
   - Mientras tanto se ve el destello de la pantalla de carga.
3. **El reflejo, fuera del render principal.** Separa `onBeforeRender` del `Reflector` y llámalo desde
   `renderFrame()`. Anidado, Three.js revisaba programas cada cuadro y el procesador se iba en eso.
4. **Capa 1 para lo que no hace falta en el reflejo:** follaje, gemas, marcos y calcomanías del suelo. El reflejo se
   dibuja con la mitad de cosas.
5. **Sin MSAA.** `antialias: false` y `multisample: 0`. La escena se dibuja en los buffers del posproceso, donde el
   MSAA del lienzo no aplica, y en el reflejo no se nota.
6. **Resolución con tope y calidad adaptable.**
   - La resolución llega como mucho a 2×.
   - `watchPerf` mide ventanas de tiempo e ignora el tope exacto de 30 Hz (ahorro de batería).
   - Si va lenta, primero mira dónde está el límite:
     - si nuestro JS se come más del 70 % del cuadro, es el procesador: el reflejo pasa a cuadro por medio
       (`mirrorEvery = 2`);
     - si no, es la GPU: baja la resolución por niveles (`LEVELS`), saltando dos si va a menos de la mitad.
   - Si va sobrada por un rato, sube de nuevo.
   - Comparar "antes y después" de bajar engaña, porque la escena cuesta distinto en cada momento. La carroza todavía
     lo hace; la plantilla ya no.
7. **Lo caro, solo donde se ve.**
   - `if` alrededor del fbm del cielo.
   - `discard` en la niebla fuera de su envolvente.
   - Planos recortados al contenido (`trimmedPlane`).
   - Partículas apagadas con tamaño 0.
8. **El follaje, con luz por vértice** que imita a `MeshStandard`. Miles de hojas con luz por píxel eran lo más caro de
   la escena.
9. **El texto no obliga a recalcular la página.**
   - Solo `transform` y `opacity`.
   - `setStyle` escribe solo lo que cambió.
   - Letras en `span`.
   - El resplandor en una copia fija.
   - Nada de `backdrop-filter` ni sombras animadas.
10. **Lienzos pintados una vez.** Se pintan al cargar, se suben a la GPU y se liberan, salvo con `?t=`, que los
    conserva para revisarlos.
11. **Fuentes cargadas antes del primer cuadro** con `document.fonts.load`, para que el título no salte de tipografía.
12. **Transparentes de doble cara, en una sola pasada.** Un material `transparent` con `side: DoubleSide` se dibuja
    en dos pasadas. En cada objeto, Three.js marca `needsUpdate` y vuelve a revisar su shader, cada cuadro.
    - Si la pieza es plana (alas, hojas, papeles), ponle `forceSinglePass: true`: se ve igual.
    - En Halloween, las alas de 36 murciélagos se comían así el procesador.

## Cuando algo va lento

1. `medir.mjs <inv>`: ¿qué instante es el peor?
2. `PIEZAS=1 node herramientas/medir.mjs <inv>`: cuánto ahorra apagar cada pieza de `window.__parts`. Agrega ahí las
   piezas nuevas.
3. Si la GPU va sobrada pero `fluidez.mjs` con procesador lento falla, el problema es el procesador.
   `perfil.mjs <inv> 4` dice qué funciones se lo comen.
   - Si arriba salen `getParameters` o `getProgram`, Three.js está revisando shaders en cada cuadro. Busca un reflejo
     anidado (regla 3) o transparentes de doble cara (regla 12).
4. `tirones.mjs <inv>`: un programa o una textura que aparece a mitad de la animación es un tirón de la primera vez.
   Agrégalo al calentamiento.
5. `consola.mjs <inv> "__info(3)"` da las llamadas de dibujo y los triángulos de un instante.

Después de cada arreglo, vuelve a medir y compara con el número de antes. Si no bajó, deshazlo.
