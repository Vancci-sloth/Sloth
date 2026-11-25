# Imágenes y videos con Meta Muse, por su página y con la cuenta de cada quien

Fecha: 2026-11-23

## Contexto

Muse (muse.ai) es el agente de Meta. En su chat hace imágenes y videos de 10 s con sonido y voces, con la cuenta de
Meta de cada quien y lo que su plan da cada semana (el gratis también genera). Meta no vende API para eso: su Model
API solo tiene Muse Image. useapi.net lo vende como servicio (github.com/useapi/muse-api): $15 al mes, y guarda el
correo y la contraseña de Meta en sus servidores. Por lo mismo que con Flow (ADR 0014 y 0015), se hace en Sloth.

Se probó el 23 de noviembre de 2026 con una cuenta gratis, en el Edge sin ventana:

- Abre con la sesión del perfil (cookie `hatch_sess`), y el chat no se dibuja distinto sin ventana.
- Una imagen tardó unos 20 s (1600×1600 en 1:1, 1152×2048 en 9:16, WebP); un video, de 40 a 60 s (10 s, unos 720p,
  con audio y lo dicho entre comillas). Con la imagen adjunta, el video empieza en ella.
- Lo gastado lo dice Configuración → General: un porcentaje de la semana. Una imagen gastó del 0 al 1 %; un video, del
  8 al 9 %.
- El agente corre en una máquina de Meta y habla con la página por un WebSocket cifrado (Noise): no hay peticiones que
  copiar. La página sí tiene atributos estables (`data-testid`, `data-message-role`, `data-pel-click`) en cualquier
  idioma.

## Decisión

- **Como Flow:** lo genera el servidor (`server/meta/`), cada cuenta en un Edge con su perfil
  (`data/meta/cuentas/<id>/`; `edgeDe` de `server/flow/cuentas.ts`), y los agentes lo piden con el MCP `meta`. Ningún
  agente tiene la sesión.
- **Varias cuentas, como en Flow (ADR 0015):** hasta 50, y hasta dos pedidos a la vez de cuentas distintas, con 5 s
  entre uno y otro. Cada pedido va a la libre con menos usado de la semana (`elegirCuentaMeta`), y entre iguales a la
  que lleva más sin generar. Como cada pedido lee el uso antes de pedir, una cuenta con la semana gastada o sin sesión
  no gasta nada: descansa (6 h o 10 min; volver a probar tampoco gasta) y el pedido pasa a otra. Si ninguna puede,
  falla diciendo por qué y cuándo vuelven.
- **El correo de cada cuenta** sale del Centro de cuentas de Meta, que abre con la misma sesión: Muse no lo enseña.
- Cada pedido va en un chat nuevo de Muse: no se mezcla con el chat principal ni con el pedido anterior. El mensaje
  (`mensajeMeta`) pide uno solo, la proporción «exactamente» y que no pregunte.
- **El archivo se saca de la página**, sin descargas: el video del `blob:` de su burbuja; la imagen, la grande del
  visor. Se guarda en el formato de `salida`; un PNG o JPEG se convierte ahí mismo con un lienzo.
- **Nada de gastar a ciegas:** se lee el uso antes y después de cada pedido. Con el 100 % no se pide nada, y la
  respuesta dice cuánto gastó y cuánto lleva. Un pedido igual al último de esa ruta no se repite (`.huella`).
- Si Muse contesta sin el archivo, el error lleva lo que dijo y avisa que pudo gastar: el agente no lo repite igual.
- Se agregan en Opciones → Meta Muse con una ventana normal; Sloth solo mira por CDP si ya está la cookie
  (`hatch_sess`). Sin ella, un pedido sabe al momento que no hay sesión.

## Consecuencias

- Muse solo abre cuentas en Estados Unidos, Canadá, Japón y Singapur (octubre de 2026). Opciones lo dice.
- Los pedidos quedan como chats paralelos en el muse.ai del usuario.
- Si Muse cambia su página, el pedido falla con una captura en `data/meta/error.png`.
- Sin comprobar: qué dice Muse con la semana gastada o al negarse. Se trata como respuesta sin archivo.
- Usar la página de forma automática no está dicho en los términos de Meta: es la misma zona gris que Flow. Usar varias
  cuentas para tener más uso puede hacer que Meta limite alguna; Opciones pide agregar solo cuentas propias.
- Queda para después: Meta en el estudio de Imágenes y en los menús «Imágenes» y «Clips» del compositor.
