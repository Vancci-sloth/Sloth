# El motor en vivo: Sloth reproduce el video sin renderizar

Fecha: 2026-10-22

## Contexto

El estudio solo enseñaba en vivo los videos de El Diff, y eso porque su skill armaba su propia página con el Player de
Remotion (`vivo.mjs`) cuando el agente se acordaba de correrla. El Video explicativo y el Reel de comedia solo se veían al
renderizar. La línea de tiempo era una regla sin arrastre, el cabezal saltaba solo a la escena del agente, y para pedir
un cambio había que describir de palabra qué y dónde.

La referencia fue Creatorize (video «Build a VIRAL Faceless Youtube Channel With Opus 5.5», g russ): mientras Claude
escribe las escenas, el video se puede recorrer en tiempo real, cada cambio aparece solo, y se elige con el ratón un
elemento, una toma o un tramo para pedir el arreglo. Su motor es propio (Three.js); los estilos de Sloth son proyectos de
Remotion, y el usuario no quería tocar las skills.

## Decisión

Sloth arma él solo la vista en vivo de cualquier carpeta de video que sea un proyecto de Remotion (`server/motor.ts`):

- **Con lo que trae el proyecto.** Usa su esbuild y su `@remotion/player` (ya vienen con `@remotion/cli`), así que Sloth
  no añade paquetes y la versión de Remotion es siempre la del video. La página (`server/motor-pagina.jsx`) se arma desde
  la carpeta del video; la app compilada la copia aparte.
- **Sin pedirle nada a la skill.** Al proyecto le llega un `remotion` igual al suyo salvo `registerRoot` y
  `<Composition>`, que solo anotan qué video es. Las escenas son las secuencias que registra Remotion (las mismas de su
  Studio), y los audios, sus `<Audio>`: de ahí salen la pista de escenas y la onda.
- **Se rehace solo.** Vigila la carpeta: lo que entró en la última versión (o `src/`) se vuelve a armar en incremental
  (~100 ms a 1 s); lo de `public/` solo recarga. Un error de sintaxis deja a la vista la versión anterior con el aviso.
- **Sin parpadeo.** El monitor carga la versión nueva en un segundo marco, la pone en el mismo segundo (y sonando si
  sonaba) y solo entonces la cambia por la que se ve. Si falla al cargar, se queda la anterior.

La vista en vivo de la skill (la de El Diff) queda para cuando el motor no puede (una carpeta sin `node_modules`), y el
render, para verlo si se pide o en la Entrega.

## Consecuencias

- Todo estilo nuevo hecho con Remotion se ve en vivo y se elige con el ratón sin hacer nada.
- Un estilo que no marque sus escenas con `<Sequence>` (el Reel y el Explicativo hoy) se ve y se recorre igual, pero su
  pista de escenas sale vacía; El Diff las toma de su guion, con miniatura.
- Lo elegido viaja como texto delante del mensaje (segundo, escena, qué es, dónde está y de qué componente sale): el
  agente lo encuentra sin captura.
- Abiertos a la vez, como mucho seis motores; el que lleva más tiempo sin mirarse se cierra.
