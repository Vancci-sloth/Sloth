# Estilos compartidos: un paquete cerrado, y nada sale sin el creador

Fecha: 2026-11-05

## Contexto

En la comunidad pidieron poder compartir los estilos que cada quien hace con «Nuevo estilo» («Estilos de la
comunidad»). Un estilo es una skill: instrucciones que un agente sigue con permisos amplios y scripts que corren en la
computadora de quien lo instala. Los miedos eran tres: lo que cuesta el servidor, las dependencias que un estilo pueda
traer y que deje de funcionar con otra versión de Sloth.

## Decisión

- **Un estilo viaja como un archivo `.sloth-estilo`** (`server/estilos.ts`): gzip con un manifiesto y los archivos de su
  skill, nada más. Sin lo que cada quien junta (huellas, banco, poses del reel) ni lo que se rehace (`node_modules`,
  `out`), y solo archivos de texto, imágenes, fuentes y audio: ningún programa. Hasta 15 MB. Sin dependencias nuevas
  para Sloth: el formato es suyo.
- **Instalar escribe solo en `skills/<id>` y en `data/tus-cards.json`.** Uno con el nombre de un estilo de Sloth o de uno
  tuyo no se instala; uno que vino de lo mismo se pone al día, con lo de antes en `data/skills-tuyas`. La card que llega
  no trae `cwd`: trabaja donde todos los tuyos, y sus etapas no buscan fuera de su carpeta.
- **Las dependencias no entran.** Su `package.json` solo usa paquetes de npm que ya usan los estilos de Sloth (se mira al
  empaquetar y al instalar). Los de Python son los del estilo de Sloth del que partió (`basadoEn`), que
  `server/requisitos.ts` instala como para ese.
- **Las versiones se apuntan, y el agente adapta.** El manifiesto dice la versión de Sloth donde se hizo (la mínima para
  instalarlo) y la huella de cada archivo de `video-base` que nombra. Si al instalar alguno cambió, se ofrece «Adaptar a
  tu versión», que le pide a «Nuevo estilo» ajustar la skill. No se guardan versiones de `video-base`.
- **En la comunidad, nada sale sin que el creador lo apruebe.** La sección Estilos vive en el Worker de siempre (el
  paquete en R2, como las imágenes). Un estilo nuevo, o uno al que le cambian el paquete, queda `aprobada = 0`: solo lo
  ven quien lo compartió y el creador, a quien le llega un aviso. «Revisar» lo abre en una carpeta, sin instalarlo, y le
  pide a «Nuevo estilo» que lo lea y diga qué hace y qué podría dañar. La decisión es del creador: «Aprobar».

## Consecuencias

- El servidor casi no cuesta: un estilo pesa cientos de KB, y R2 no cobra la descarga.
- Mientras el creador no aprueba la versión nueva de un estilo, la publicación deja de verse para los demás.
- Un estilo que necesita algo que Sloth no trae no se comparte hasta que eso entre a Sloth.
- Lo que un script hace al correr no se puede impedir desde el paquete: por eso la revisión del creador es obligatoria.
