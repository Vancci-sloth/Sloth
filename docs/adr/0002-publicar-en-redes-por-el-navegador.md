# Publicar en redes por su página web, no por su API

Fecha: 2026-10-08

## Contexto

Se quería subir a TikTok (la cuenta de Sloth) los videos verticales de El Diff, programados a un ritmo (5 al día desde las 12:00,
uno por hora), y que Sloth lo hiciera solo con cada video nuevo, en todos los estilos y, más adelante, también en
YouTube e Instagram.

La Content Posting API de TikTok pide una app en developers.tiktok.com (OAuth, permisos `video.upload` o
`video.publish`). Mientras la app no pase la auditoría de TikTok, todo lo que publica directo sale en privado y la cuenta
tiene que estar en privado. La otra vía de la API manda el video a borradores: llega a la bandeja del celular, sin
texto, y hay que publicarlo a mano, con un máximo de unos 5 pendientes a la vez.

## Decisión

Sloth publica desde la página web de cada red (TikTok Studio), en un Edge con su propio perfil (`data/redes/perfil`),
manejado por CDP con `playwright-core`. Hace lo mismo que harías a mano: elige el archivo, escribe el texto, elige cada
hashtag de las sugerencias, marca «Programación» con día y hora, y comprueba en la lista de publicaciones que el video
salga con su hora.

- Cada red es un módulo (`server/redes/tiktok.ts`) que cumple `ModuloRed`. Para YouTube o Instagram se añade otro
  archivo; la cola, el calendario y los textos (`server/redes/index.ts`) son de todas.
- El texto lo escribe Claude (Sonnet, sin herramientas) con los archivos de la carpeta del video. Se puede cambiar
  antes de programar, y cada estilo tiene hashtags fijos.
- Lo programado vive en `data/redes/redes.json`. Cada video se reconoce por su contenido: una huella (sha256 del
  tamaño, el primer MiB y el último MiB), calculada una vez por versión del archivo. Un video copiado en otra carpeta es
  el mismo; otro del mismo tamaño, o una versión nueva en la misma ruta, no (ver *Cambio del 2026-10-10*).

## Consecuencias

- Sale público sin auditoría ni borradores, pero depende de la página: si TikTok cambia TikTok Studio, el módulo se
  rompe y hay que ajustarlo. Cada subida comprueba el resultado en la lista, así que un cambio así se ve como «Falló» y
  no como un video mal publicado.
- Automatizar la página va contra los términos de TikTok. El riesgo es bajo con una ventana visible, la sesión del
  usuario y un video cada minuto o dos, pero no es cero.
- Si TikTok no ha terminado de revisar el video, pregunta «¿Seguir con la publicación?» con un botón «Publicar ahora».
  Se probó el 2026-10-08 que respeta la hora programada, y el usuario prefirió no esperar la revisión.
- TikTok Studio guarda en IndexedDB una copia de cada video subido (1,4 GB tras 32 videos). Se borra después de cada
  subida; la sesión no se pierde.
- TikTok deja programar hasta 10 días antes. Lo que cae más lejos espera en la cola de Sloth, sin error, hasta que entra.
- Cuando el módulo falla, el error dice en qué paso («Al poner la hora: …») y guarda lo que se veía en la página
  (`data/redes/fallos/`), que se abre desde el «Falló» del video.

## Cambio del 2026-10-10: el video se reconoce por su contenido, no por su tamaño

Al principio un video era el mismo si tenía la misma ruta o el mismo tamaño. Así se reconocía la copia de un episodio en
otra carpeta, pero dos videos distintos del mismo tamaño se confundían (el segundo salía como ya programado, o con el
texto del primero), y una versión nueva exportada en la misma ruta heredaba lo que se hizo con la de antes.

Ahora cada publicación guarda la huella del video. Leer 2 MiB por versión es barato y basta: en un MP4 ahí van el
índice, que cambia con cualquier cuadro distinto, y el final de los datos.

- Una versión nueva en la misma ruta cuenta como otro video. La de antes ya está en la red: sale como «Versión nueva, sin
  programar», y va con «Programar los que faltan» si la quieres.
- Lo que cambia mientras espera en la cola no se sube: su texto era de la otra versión, y puede estar a medio escribir.
- Lo que descartas (la ✕ de lo que espera en la cola o falló) queda como `descartado`, con su huella: «Programar los que
  faltan» no lo vuelve a poner hasta que lo deshagas. Una versión nueva es otro video: no lo hereda.
- Los registros de antes ganaron su huella al arrancar, con su archivo aún igual: los 70 que había la tienen. El respaldo
  por tamaño para los que no la tuvieran, y esa migración, se quitaron el mismo día: no cubrían ninguno.

## Cambio del 2026-10-10: sin automático, y el ritmo fijo

Cada estilo tenía un automático que programaba solo cada video vertical nuevo, con el texto que escribía Claude sin que
lo vieras. Se encendió una vez y se apagó; se quitó, con lo que solo le servía a él (la espera a que el video dejara de
cambiar y los textos que no pudo escribir). Todo va con «Programar los que faltan», que deja revisar cada texto antes.

También se quitaron el editor del ritmo de cada red y las indicaciones para Claude de cada estilo, que nunca se usaron.
El ritmo es fijo (`RITMO` en `server/redes/index.ts`): 5 al día, de 12:00 a 16:00, uno por hora, en cada red.

## Cambio del 2026-10-24: en el navegador integrado, no en otra ventana

Cada subida a TikTok abría una ventana de Edge encima de Sloth. Ahora, con la ventana de Sloth abierta, se hace en una
página del navegador integrado (`electron/navegador.ts`), la `redes`, escondida y sin sonido: Sloth la maneja por el
mismo relevo CDP que usan los agentes. Para iniciar sesión, Opciones → Redes la enseña debajo de TikTok.

- Tiene su propio perfil (`persist:redes`): la cuenta con la que publicas no la tiene ningún agente.
- Es una sola página: la subida la usa y al acabar la deja en blanco. Sin uso, se cierra sola como las de los hilos.
- La sesión de Edge no pasa a la app: hay que iniciar sesión una vez en ella.
- Sin la ventana de Sloth (abierto en un navegador), sigue el Edge con `data/redes/perfil`. Una ventana de antes de este
  cambio, también, hasta que se reinicie: no anota `redes` en `data/navegador-integrado.json`.
