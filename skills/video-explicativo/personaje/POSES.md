# Las poses del personaje

El narrador es el personaje de la marca (`personaje` en `marca.json`): una foto recortada como sticker, con borde
blanco, lo único de collage del video. El que trae la skill es el perro: un salchicha real, negro y fuego, con sudadera
naranja, cadena de oro y puro. Sus 19 poses están en `perro/` (`<pose>.webp` con la boca cerrada y `<pose>-abierta.webp`
con la boca abierta, para hablar) y en `personaje.json`; míralas juntas en [`poses.jpg`](poses.jpg). Uno propio vive en
`personajes/<id>/` junto a `marca.json` y tiene las que se le hicieron ([`NUEVO.md`](NUEVO.md)). `marca.py aplicar`
copia al proyecto las del que toca, a `public/perro/` y `src/datos/personaje.json`: usa solo las que están ahí.

Elige la pose que dice lo mismo que la frase; cambia en la palabra que la pide (`PERSONAJE.tramos` en
`src/escenas/index.tsx`). Ni muy seguido ni de más: una pose por idea.

Los ejemplos entre comillas son del video de Berachain.

| Pose | Qué hace | Para cuando la voz… |
|---|---|---|
| `normal` | De frente, serio, con su puro | explica algo sin más |
| `ladea` | La cabeza ladeada, curioso | pregunta («¿qué es…?», «¿entonces qué falló?») |
| `arriba` | Mira arriba a su derecha | enumera o lee algo («tres cosas», «en julio…») |
| `lado` | Voltea a la derecha del que mira | pasa al siguiente punto, señala algo de al lado |
| `reojo` | De frente y mirando de lado, desconfiado | dice algo sospechoso («lo admitió», «vendieron») |
| `lentes` | Lentes pixelados de «deal with it» | dice algo con descaro o un truco («con un truco», «hackearon») |
| `pata` | La pata levantada, como «alto» | niega o pone un límite («no se podía», «yo no te digo») |
| `tapa` | Se tapa los ojos con la pata | algo vergonzoso o doloroso («catorce centavos») |
| `susto` | Ojos abiertos, boca abierta, se le cae el puro | un número que asusta («sesenta y nueve por ciento») |
| `triste` | Ojos de cachorro, puro caído | algo que se acaba («el corazón del invento», «se apaga») |
| `feliz` | Sonrisa con la lengua de fuera | algo bueno, o el cierre |
| `ladra` | Ladra a cámara | un remate fuerte (sin boca abierta aparte: ya la tiene) |
| `acostado` | Echado sobre la panza, derrotado | algo que ya no tiene remedio |
| `lupa` | Con lupa en un ojo, detective | algo que no se sabe o se investiga («todavía no se sabe») |
| `llave` | Enseña una llave de oro | algo que se desbloquea o se libera |
| `billetes` | Enseña un abanico de billetes | dinero que se paga o se devuelve |
| `moneda` | Sostiene una moneda lisa de oro | enseña una moneda: va encima lo que diga el video (`ancla` `moneda`) |
| `cartel` | Sostiene un cartel blanco | el remate escrito a mano (`ancla` `cartel`, con la letra `MARCADOR`) |
| `celular` | Sostiene un celular con la pantalla apagada | el canal del cierre en su pantalla (`ancla` `celular`, `PantallaCanal`) |

Las tres últimas sostienen algo: lo que enseñan se dibuja encima, en su `ancla` (centro, ancho y alto en fracciones del
lienzo, y el radio de las esquinas), con `objeto: { nodo: … }` en el tramo. Cuando el perro sostiene algo sube un poco
(`sube`), para que no lo tape el texto de TikTok.

## Una pose nueva

Con Codex, nunca con Gemini, y solo con ChatGPT conectado ("Imágenes con Codex" en `SKILL.md`). Los pedidos, en
`pedidos/`; la foto de referencia y la descripción son las del personaje (el perro: `perro.png` y la de
`pedidos/ejemplo-poses.txt`; uno propio: `base.png` y `descripcion.txt` de su carpeta):

1. La pose: `pedidos/pose.txt` con su foto de referencia (`-i`). El mismo personaje, el mismo encuadre de medio pecho
   para arriba, fondo blanco. Deja `perro/pose_<nombre>.png` en el proyecto.
2. La boca abierta: `pedidos/boca.txt` con la pose nueva de referencia. Deja `perro/bocas/boca_<nombre>.png`.
3. `python -B scripts/bocas.py <nombre>` pega solo la boca sobre la pose (Codex rehace la foto entera y alternarlas
   haría temblar al perro) y `python -B scripts/perro.py` recorta las dos con la misma silueta y la suma a
   `src/datos/personaje.json`.
4. Si sirve para otros videos, súmala a la biblioteca del personaje: del perro, sus dos `.webp` de `public/perro/` a
   `perro/` de aquí, su entrada a `personaje.json` y su fila a esta tabla; de uno propio, a su carpeta
   (`NUEVO.md`).
