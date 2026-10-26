# Un personaje propio

Cuando el usuario elige «uno nuevo», se hace una vez, dentro del primer video, y se guarda en su biblioteca
(`personajes/<id>/`, junto a `marca.json`) para todos los siguientes. `<proyecto>` es la carpeta del video;
`<marca>`, la de `marca.py` (`python -B -X utf8 <skill>/scripts/marca.py`).

1. **Con o sin ChatGPT.** `codex login status` (sale 0 si hay sesión). Sin sesión no hay poses ni boca: el personaje
   es su foto, quieta, recortada como sticker. Díselo al usuario en una frase, con lo que gana si conecta ChatGPT en
   Sloth (Opciones → Codex): poses que actúan cada frase y la boca que se mueve con su voz.
2. **El id y el proyecto limpio.** Un id corto del personaje (`gata-luna`, `profe-memo`) y `<marca> personaje <id>
   <proyecto>`: deja el proyecto sin las poses del perro.
3. **La foto base**, en `<proyecto>/perro/perro.png` (la carpeta se llama `perro` aunque sea otro: es la pose
   `normal`). Medio pecho para arriba, de frente, cuadrada, con fondo liso.
   - Con ChatGPT: Codex con [`pedidos/base.txt`](pedidos/base.txt) (su foto con `-i`, o solo la descripción). Míralo
     antes de seguir: de esta foto salen todas las poses.
   - Sin ChatGPT: su foto tal cual. Si el fondo no es liso, el recorte se nota: pídele una con fondo liso.
4. **Las poses** (con ChatGPT): `ladea`, `feliz`, `susto`, `pata` y `celular`, con [`pedidos/pose.txt`](pedidos/pose.txt),
   todas a la vez (la descripción de cada una, en la tabla de [`POSES.md`](POSES.md); la de `celular` pide la pantalla
   lisa y oscura). Luego la boca de cada pose y de `normal` (`pedidos/boca.txt`) y `python -B scripts/bocas.py <pose>`,
   como en "Una pose nueva" de `POSES.md`. Las demás poses, cuando un video las pida.
5. **Recortar**: `python -B scripts/perro.py`. Si hizo `celular`, mide su ancla (dónde está la pantalla: centro, ancho y
   alto en fracciones del lienzo de 900 px, y el radio de las esquinas) en `src/datos/personaje.json`, como la del perro
   en `personaje/personaje.json`.
6. **Guardar**: `<marca> guardar-personaje <id> <proyecto> "<cómo es, en inglés, para Codex>"` (p. ej. «a real orange
   tabby cat with a tiny blue bow tie»). Copia sus poses, su índice y su foto base a `personajes/<id>/` y lo pone en la
   marca. Listo cuando `marca.py ver` dice `"personaje": "<id>"` y el proyecto se ve con él.

Para las poses de los siguientes videos, la foto de referencia es `personajes/<id>/base.png` y la descripción,
`personajes/<id>/descripcion.txt`. Una pose que sirva para otros videos se guarda en su biblioteca: sus dos `.webp` a
`personajes/<id>/poses/` y su entrada a `personajes/<id>/personaje.json`.
