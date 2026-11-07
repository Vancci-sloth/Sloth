# Proyectos

En Sloth cada hilo puede ser de un **proyecto** (una marca o un canal) y de una **serie** de ese
proyecto. Cada uno tiene su memoria, un `MEMORIA.md` en `data/proyectos/<id>/` (la de la serie, en
`series/<serie>/MEMORIA.md`), con la marca, el tono, el público, las reglas y el cierre. Si el hilo es de un proyecto,
el primer mensaje trae estas líneas (y el texto de las memorias llega al principio, en `<contexto-del-proyecto>`):

```
Proyecto: <nombre>[ · serie <nombre de la serie>]
MemoriaProyecto: <ruta absoluta a MEMORIA.md>
MemoriaSerie: <ruta absoluta a la MEMORIA.md de la serie>   (solo si hay serie)
```

- **Léela y respétala.** Si el texto no te llegó entero, lee los archivos de esas rutas antes de investigar. Lo que dice
  la memoria manda sobre lo general del estilo en marca, nicho, tono, público, reglas y cierre; la forma y la imagen
  siguen siendo las del estilo. La de la serie manda sobre la del proyecto en lo que diga de su formato.
- Si además viene `Serie:` (una del banco de la skill, ver `SERIES.md`), sigue las dos: el archivo de la serie del banco
  para elegir el tema y la memoria para la marca y el cierre.
- **No escribas en la memoria.** Al cerrar el video, en tu último mensaje, propón en una lista corta qué agregar o cambiar
  en la memoria (lo que aprendiste del usuario, una regla nueva, un cierre que funcionó) para que él lo pegue desde
  «Editar memoria» en Sloth. Si no hay nada nuevo, no propongas nada.
- Sin la línea `Proyecto:`, el hilo no es de ningún proyecto: haz lo de siempre.
