# Las imágenes nuevas

Cómo se generan las poses del personaje, sus bocas y las caras o texturas del protagonista.

## Con Codex

Codex usa la cuenta de ChatGPT del usuario. Antes de la primera imagen de cada video, `codex login status` (sale 0 si
hay sesión). Sin sesión no se genera ninguna: se usa lo que ya hay (las poses que tiene el personaje, el logo real en
vez de una textura) y se le dice al usuario una vez, en una frase llana, qué quedó sin hacer y que conectando ChatGPT
en Sloth (Opciones → Codex) sale completo.

Con su `image_gen` (no dibuja con código). El pedido va en un `.txt`, en inglés, y dice qué archivo dejar:

```
codex exec --skip-git-repo-check -s workspace-write -C <carpeta> -i <referencia.png> - < pedido.txt
```

El pedido empieza con «Use your built-in image_gen tool (do not draw with code). Generate one image with image_gen,
then copy the PNG from $CODEX_HOME/generated_images/... into this working directory as <nombre>.png. Reply only with
the file name.» y sigue con la imagen. `-i` le pasa una referencia (la pose del personaje, la otra cara de la moneda)
para que salga igual. Tarda 30–85 s y se pueden lanzar varios a la vez. Si no copió el archivo, se vuelve a pedir.
Pedidos que funcionaron: `pedidos/moneda-frente.txt` y `moneda-atras.txt` de la skill (las caras de una moneda o
medalla, a `public/img/moneda_frente.png` y `moneda_atras.png`) y `personaje/pedidos/` (las poses
y la boca).

## Poses nuevas

El perro tiene 19 poses; uno propio, las que se le hicieron ([`personaje/POSES.md`](personaje/POSES.md)): elige la que
dice lo mismo que la frase. Si el guion pide una que no está y hay ChatGPT, o Flow si lo trae la línea `Imágenes:`
(los mismos pasos, con `<base>/FLOW.md` en vez de Codex):

1. Codex la hace con la foto base del personaje de referencia (el perro: `<skill>/personaje/perro.png`; uno propio:
   `personajes/<id>/base.png`) y `personaje/pedidos/pose.txt` (la misma foto, el mismo personaje, solo cambia la pose)
   a `perro/pose_<nombre>.png` del proyecto.
2. Codex le abre la boca (`personaje/pedidos/boca.txt`) a `perro/bocas/boca_<nombre>.png`, y
   `python -B scripts/bocas.py <nombre>` pega solo la boca sobre la pose, para que al hablar no tiemble.
3. `python -B scripts/perro.py` la recorta como sticker (cerrada y abierta con la misma silueta) y la suma a
   `src/datos/personaje.json`. Si sostiene algo, mide su `ancla` (dónde va lo que enseña).

Si sirve para otros videos, súmala a la biblioteca de su personaje ("Una pose nueva" en `POSES.md`).
