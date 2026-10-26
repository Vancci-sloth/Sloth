# En un lote

Si el mensaje trae `Lote: video 3 de 20. Carpeta: <nombre>` (lo pone Sloth), eres uno de varios vídeos que hacen a la
vez otros agentes, cada uno en su hilo, y nadie mira el tuyo mientras trabajas. Vale todo lo de tu skill, con estos
cambios:

- tu carpeta es `<nombre>`, exacto, dentro del directorio actual: el panel de Sloth la busca con ese nombre. Créala tú;
- no preguntes nada. Lo que preguntarías, decídelo, termina el vídeo de punta a punta y dilo al entregar;
- no escribas fuera de tu carpeta (ni la skill, ni `video-base`, ni las carpetas de los otros
  vídeos): otros agentes escriben a la vez. Las huellas sí, con `huellas.py` (si tu estilo las usa), que escribe con
  candado: así los vídeos del lote se comparan también entre sí;
- la máquina es compartida: un render o una transcripción pueden ir más lentos o esperar su turno de la GPU.
