# Gemini CLI con llave de API, aparte de Antigravity

Fecha: 2026-11-01

## Contexto

Se pidió conectar Gemini sin pasar por Antigravity (ADR 0012). T3 Code no tiene proveedor propio de Gemini: lo ofrece
por su registro genérico de ACP, que lanza `gemini --acp`. Y desde el 18-jun-2026 Google ya no deja entrar a Gemini CLI con
cuentas personales (gratis, AI Pro, Ultra): esas cuentas van a Antigravity. Siguen las llaves de API y las licencias
Enterprise de Code Assist.

## Decisión

- **Gemini es un agente más de ACP con llave de AI Studio** (`server/gemini.ts`), no un registro genérico: para un solo
  agente sobra. No hay inicio de sesión, aunque ACP siga anunciando `oauth-personal`, que ya no sirve.
- **No se reusa el truco de DeepSeek**: Google no tiene una API compatible con la de Anthropic.
- **La llave es la guardada en Sloth** (`server/acceso.ts`), que se prueba contra `/models` al guardarla: Google acepta
  abrir sesión con una llave falsa y solo falla en el primer mensaje. Las credenciales de Google del entorno se quitan,
  para no cobrar en otra cuenta sin que se elija.
- **Se confía en la carpeta del hilo** (`GEMINI_CLI_TRUST_WORKSPACE`): sin eso no hay `yolo` ni MCP de Sloth, y
  `--approval-mode yolo` se ignora. El precio es que lee el `.gemini/` y el `.env` de esa carpeta. Va con lo de siempre:
  los agentes de Sloth corren sin permisos.
- **Versión fijada, sin actualizador ni estadísticas**: 0.66.0 de npm, en `data/gemini` (`GEMINI_CLI_HOME`), sin tocar
  el `~/.gemini` del usuario. Corre con el Node de Sloth, un proceso por hilo (arranca en unos 3 s; Antigravity, en 40).

## Consecuencias

- Sale en beta. Se baja al guardar la llave: la pide el catálogo de modelos (`modelosGemini`).
- Sin dólares en el hilo, solo tokens: Sloth no sabe si la llave es gratis o de pago, y una cifra podría ser falsa.
  Tampoco hay esfuerzos (ACP no los ofrece) ni botón de compactar (comprime solo).
- La llave gratis alcanza para probar, y Opciones lo dice: cada paso del agente gasta pedidos y sus límites cambian. Un
  resumen de terceros dice que, sin facturación, Google puede usar lo que se le manda para mejorar sus productos; no se
  verificó en su página oficial.
- Google concentra su desarrollo en Antigravity: fijar la versión protege de un cambio, no de que cierre también esto.
- Probado de punta a punta en Windows con una llave real: bajarlo con el código de Sloth, rechazar una llave falsa, un
  turno con lectura de archivo y MCP del navegador, retomar la sesión y una llave mala guardada con otra en el entorno.
  El límite 429 se tradujo sin haberlo visto en vivo; Mac y Linux no se probaron. El cliente se prueba con un agente de
  mentira que contesta como Gemini (`server/acp.test.ts`).
