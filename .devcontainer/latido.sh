#!/usr/bin/env bash
# El latido de Sloth en la nube (server/nube.ts): lo corre `postAttachCommand` en una terminal de la pestaña del
# Codespace. GitHub no cuenta como uso lo que haces en Sloth por su dirección, pero sí lo que escribe esta terminal:
# mientras usas Sloth o algo trabaja, sale aquí una línea por minuto y el Codespace no se detiene. Sin uso, calla.
LATIDO=/workspaces/.sloth-nube/latido.log
echo "Sloth en la nube. Deja abierta esta pestaña (puede quedar atrás): mientras usas Sloth o algo trabaja, aquí sale"
echo "una línea por minuto y GitHub no detiene tu Codespace. Si la cierras, GitHub lo detiene tras un rato sin uso."
touch "$LATIDO" 2>/dev/null
exec tail -n 0 -F "$LATIDO" 2>/dev/null
