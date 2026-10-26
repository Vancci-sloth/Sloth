# Seguridad

## Reportar un problema

Si encuentras una vulnerabilidad, **no abras un issue público**: escríbenos a
[soporte@vancci.org](mailto:soporte@vancci.org) con los pasos para reproducirla. Te respondemos en un máximo de
3 días hábiles y te avisamos cuando esté arreglada.

## Lo que debes saber antes de usar Sloth

**Los agentes de Sloth trabajan con todos los permisos en tu computadora.** Para hacer un video sin pedirte permiso a
cada paso, corren con `bypassPermissions` (`server/claude.ts`): pueden leer, escribir y borrar archivos, y ejecutar
programas, con tu usuario.

- **Instala solo estilos (skills) en los que confíes.** Un estilo es un conjunto de instrucciones y scripts, y el agente
  hace lo que digan. Uno malicioso puede ejecutar lo que quiera en tu computadora. Revisa su carpeta antes de usarlo.
- **Cuidado con lo que le pides que lea.** Una página web o un archivo con instrucciones escondidas puede intentar
  desviar al agente. Revisa lo que hace en el hilo, que se ve paso a paso.
- **Tus cuentas son tuyas.** Sloth entra con tu cuenta de Claude (y, si quieres, de ChatGPT) en el flujo oficial de
  cada una, y no guarda tus contraseñas.

## Lo que sí cuida Sloth

- El servidor escucha solo en tu computadora (`localhost`).
- La clave de apoyo llega firmada (Ed25519) por el cobro, y editar el archivo no la alarga.
- Los datos de tu tarjeta los ven solo Mercado Pago o Stripe.
