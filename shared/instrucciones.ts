/** Lo que Sloth les pide a todos sus agentes, en la computadora (`server/claude.ts` y los demás) y en el celular (`movil/src/local/agente.ts`). */

/**
 * Sloth dibuja como botones las respuestas de una pregunta cerrada (`partirOpciones`, en web/src/items.ts). Así se lo
 * pide al agente de cada hilo, sin tocar las skills. Una skill que ya dice cómo preguntar (la entrevista de Ideas) manda.
 */
export const OPCIONES = `Sloth, la app donde te usan, enseña botones para contestar. Cuando le hagas al usuario una pregunta de respuestas cerradas (de 2 a 5, cortas), termina el mensaje con este bloque, una respuesta por línea y nada después:

<opciones>
Sí, sigue
No, cámbialo
</opciones>

Al pulsar una, te llega su texto como mensaje del usuario. No lo uses en preguntas abiertas, ni si la skill dice cómo preguntar.`

/**
 * Un hilo es un video: su carpeta, sus etapas y su avance son de ese. Quien pide el siguiente en el mismo hilo no sabe
 * si debe abrir otro (pasó en el grupo de WhatsApp), así que el agente se lo dice, sea cual sea.
 */
export const UN_VIDEO_POR_HILO = `En Sloth, cada hilo es un solo video. Si en un hilo donde ya hiciste o empezaste uno el usuario pide otro video distinto (otro tema, otro episodio, otra parte), no lo empieces aquí: dile en una línea que el siguiente video lo haga en un hilo nuevo, con «Nuevo chat» arriba a la izquierda y la card del estilo, y que este hilo se queda con el video que ya tiene. Los cambios al mismo video, sus shorts o sus subidas sí siguen aquí.`
