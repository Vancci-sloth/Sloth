# La marca

Qué se le pregunta al usuario cuando a `marca.json` le falta algo, y cómo se guarda.

`marca.json`, en la carpeta de la card (la de los proyectos), es lo que hace suyos los videos: el `nicho` del canal,
cómo `habla` (su país, de tú o de usted), el `personaje` que narra (`perro`, uno propio o `ninguno`) y el `cierre` (a
qué red invita, con qué nombre, qué frase dice y qué foto lleva la tarjeta). Se lee y se guarda con
`python -B -X utf8 <skill>/scripts/marca.py` (`ver`, `guardar '<json>'`, `aplicar <proyecto>`; el formato, en su
cabecera). Es la misma para todos los videos: se pregunta una vez.

Si `marca.py ver` dice `Falta:`, pregúntaselo al usuario en un solo mensaje, antes de investigar:

- **De qué habla su canal**, si falta `nicho`. `habla` no se pregunta: sale de cómo escribe.
- **A dónde invita el final** de cada video (su Telegram, WhatsApp, Instagram, TikTok, YouTube, X, una página o
  ningún lado), con qué nombre de cuenta o canal y, si quiere, una foto para la tarjeta (sin ella va la cara del
  personaje). La frase la propones tú («Si quieres más así, sígueme en Instagram: @cocina.facil.») y se la enseñas.
- **Quién narra**, al final del mensaje, con el bloque de opciones: «El perro salchicha», «Uno nuevo» (desde su foto o
  una descripción: [`personaje/NUEVO.md`](personaje/NUEVO.md)) o «Ninguno».

Lo que conteste va con `marca.py guardar` (una foto adjunta, con su ruta: la copia a `marca/`). Si después pide cambiar
algo, `guardar` y `aplicar <proyecto>` en el video que está haciendo.

## Varias marcas

Quien tiene varios canales tiene una marca por canal: la de siempre en `marca.json` y las demás en
`marcas/<nombre>.json`. Si el mensaje trae `Marca: <nombre>`, todo va con `--marca <nombre>` (`ver`, `guardar`, `nuevo.py`).
Si pide una marca nueva («otra para mi canal de cocina»), dale un nombre corto, hazle las mismas preguntas y guárdala
con `marca.py guardar --marca <nombre> '<json>'`; desde ese momento la elige en «Marca», junto a «Serie».
