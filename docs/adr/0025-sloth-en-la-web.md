# Sloth en la web: tu misma Sloth desde otro navegador, por un túnel de Cloudflare

Fecha: 2026-11-21

## Contexto

El creador pidió la versión web de Sloth: que se pueda usar desde el navegador y que sea igual que en la computadora.
Lo que hace Sloth no cabe en una página: los agentes corren en la computadora con la cuenta de cada quien, los videos se
arman con Python, FFmpeg, Chrome y a veces la GPU, y todo lo de cada quien (hilos, estilos, videos, cuentas) vive en su
disco. Una Sloth en servidores nuestros, una por persona, costaría por cada quien y obligaría a pasar sus cuentas a la
nube; la app es gratis y el cobro corre en el plan gratis de Cloudflare.

La interfaz ya es una página web (React servido por el servidor de Sloth); la ventana de Electron solo la enseña. Lo que
falta es llegar a ese servidor desde otro dispositivo, de forma segura y sin abrir puertos del router. T3 Code lo
resuelve igual (T3 Connect y app.t3.codes): la máquina sigue trabajando y los demás dispositivos la ven por un túnel.

## Decisión

- **La web es tu misma Sloth.** Mismos hilos, agentes, estilos y videos, en vivo; nada se copia. La computadora tiene
  que estar encendida, con internet y con Sloth abierto. Se enciende en Opciones → Sloth en la web.
- **Un túnel rápido de Cloudflare por computadora** (`server/web.ts`): `cloudflared tunnel --url`, sin cuenta ni DNS
  nuestros, que da `https://<algo>.trycloudflare.com`. cloudflared no viene en el instalador: se baja al encender la web
  la primera vez (como los agentes, ADR 0009), de su versión fija en GitHub y comprobado con su SHA-256. Su dirección
  cambia cada vez que arranca.
- **El cobro es solo el directorio** (`licencias/src/web.ts`, migración 0036): la Sloth de cada computadora le deja la
  dirección de ahora con una llave que solo ella tiene, y `api.sloth.vancci.org/web` (la entrada fija) manda ahí. El
  tráfico no pasa por el Worker: va directo del navegador a la computadora por Cloudflare. Al cobro le cuesta una
  petición al abrir el túnel, otra por hora y dos por cada entrada.
- **Solo entra un dispositivo que conectaste desde la computadora.** Opciones da un código de un solo uso y de 10
  minutos: un enlace, o un código corto de 10 letras para escribir en la entrada, `web.sloth.vancci.org`. Ese dominio es
  del mismo Worker pero no sirve nada más: ninguna página de pagos comparte su origen. La entrada crea en ese navegador
  una llave ECDSA P-256 que no se puede sacar de él (WebCrypto, no exportable, en IndexedDB); la computadora guarda su
  parte pública. Para entrar, la computadora da un reto de un solo uso y el dispositivo lo firma junto con el host del
  túnel: la firma no sirve dos veces ni en otro túnel, así que una dirección falsa en el directorio no le saca nada a
  nadie. Entrar da una cookie de sesión del túnel (`HttpOnly`, `Secure`, `SameSite=Strict`), y sin ella el servidor no
  atiende nada por el túnel salvo la entrada. Quitar un dispositivo en Opciones lo saca al momento.
- **Se confía en quien maneja el Worker como en la app.** El Worker sirve la página que usa las llaves: un despliegue
  malicioso podría usarlas mientras está abierta. Es la misma confianza que ya se le da a quien publica Sloth, cuyas
  versiones corren en la computadora con todos sus permisos.
- **Lo que la web no puede hacer igual, lo hace a su manera.** Abrir un archivo en el Explorador lo baja al dispositivo;
  «Descargar» en Mis videos baja al dispositivo y no a Descargas de la computadora; la vista en vivo del estudio y el
  visor 3D van en la misma dirección (en la ventana van en `127.0.0.1` para no frenar la interfaz).
- **Las cuentas también se conectan desde la web** (`server/ventanas-remotas.ts`, `web/src/VentanasRemotas.tsx`). Lo
  que en la computadora abre algo en su pantalla, desde la web sale en el panel «En tu computadora»: el inicio de sesión
  que va en su propia terminal (Claude Code, Grok, Muse, Pi) corre sin ventana y el panel enseña lo que dice, su enlace
  para abrirlo en el dispositivo y dónde pegar el código que pide, como se escribiría en esa terminal; las ventanas de
  Edge con que se entra con Google (la voz, Flow, el navegador integrado) o a las redes se ven y se usan a distancia, como
  el navegador del hilo. Codex usa su código de dispositivo, y OpenCode ya lo hacía. Lo que vuelve a `localhost` (YouTube,
  Antigravity) no carga en el dispositivo: se pega esa dirección en Opciones y la computadora la termina.
- **El navegador de cada hilo también se ve y se usa.** La página vive en la ventana de la computadora; la web la ve en
  capturas seguidas mientras el panel está a la vista y le manda los clics, la rueda y el teclado (en el celular, con una
  barra para escribir), por el mismo servidor local del relevo del agente (`electron/navegador.ts`,
  `server/navegador-remoto.ts`, `web/src/NavegadorWeb.tsx`). En pantallas angostas el panel tapa el chat.
- **Lo grande sube por trozos.** Cloudflare corta una petición de más de 100 MB; `/api/upload` junta los trozos de 50 MB
  que manda la web (una voz larga en WAV, un video).
- **Lo que guarda el navegador viaja con cada dispositivo.** `localStorage` es de cada dirección, y la del túnel cambia:
  cada dispositivo lo sube a la computadora y la entrada lo pone de vuelta. La ventana de la computadora sube lo suyo y
  cada dispositivo empieza con eso, así lo ya leído allá (avisos, la bienvenida) no sale otra vez.

## Consecuencias

- Al reiniciarse Sloth (actualizar, «Reiniciar backend») el túnel cambia de dirección: la web dice que se perdió la
  conexión y «Volver a entrar» lleva a la nueva, a la misma vista.
- Los túneles rápidos de Cloudflare no tienen garantía de servicio y Cloudflare los recomienda para pruebas. Si se
  vuelven un problema, el siguiente paso es un túnel con nombre por computadora (`<id>.web.sloth.vancci.org`), que el
  cobro crearía con un token de Cloudflare con permiso de túneles y DNS, como T3 Connect; la entrada y los
  dispositivos no cambian.
- Quien tenga un dispositivo conectado tiene la computadora con todos sus permisos, como la ventana. Por eso el código es
  de un solo uso; adivinar uno corto (31^10) choca con los topes del Worker (por conexión y por bloque /48 al día) y de
  la computadora (20 equivocados en 10 minutos por conexión cierran los códigos un rato, sin tocar a los dispositivos
  ya conectados), y Opciones lista y quita dispositivos.
- Si una computadora pasa 90 días sin encender la web, el directorio la olvida y otro podría tomar su id: al volver,
  la computadora lo ve (403) y estrena otro; sus dispositivos se conectan de nuevo.
- Sin la computadora no hay web. Una Sloth que corra sola en la nube sería otra decisión: servidores pagados por cada
  quien y sus cuentas fuera de su computadora.
