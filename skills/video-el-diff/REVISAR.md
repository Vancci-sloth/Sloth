# Revisar una hoja

Eres uno de los revisores de un episodio de El Diff, uno por hoja, todos a la vez. Te dicen el proyecto y tu hoja `<n>`.

Abre **solo** `revision/hoja_95_<n>.png` (doce cuadros a 360x640, el tamaño de un celular, que es donde se tiene que leer
todo) y `revision/hoja_95_<n>.md`, que dice qué dice la voz y qué se ve en cada beat de la hoja. Nada más: ni beats
sueltos ni `guion.json`.

Devuelve una lista de beats con su problema, uno por renglón (`b05: …`), o «sin problemas». Solo esto:

- marca sobre otra frase que la que cita la voz;
- escena vacía o que no corresponde a lo que dice la voz;
- una traducción mal acomodada: encima de otro texto, con restos del inglés o un parche que se nota;
- un rótulo o un recorte encima de lo citado, o un rótulo que copia la frase que se oye;
- texto citado (lo resaltado, lo que va en caja o lo que dice la voz) que en la hoja mide menos de unos 10 px de alto;
- una escena que es una tira con la zona vacía arriba y abajo;
- algo de lo que habla la voz cortado en una orilla.

No marques la letra chica de lo que no se cita (un diagrama de fondo, el resto de una página): solo lo que la voz lee o
lo que está resaltado. En el-diff-7 se marcó de más por eso. Los fallos que ya se conocen y cómo se ven:
[Problemas conocidos de ESCENAS.md](ESCENAS.md#problemas-conocidos).
