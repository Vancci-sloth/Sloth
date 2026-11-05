# Flow con calma: «actividad inusual» y lo que gasta un rechazo

Fecha: 2026-11-04

## Contexto

Al día siguiente de salir las varias cuentas (ADR 0015), un usuario hizo una frutinovela y Flow rechazó tres clips con
el aviso de «actividad inusual», mientras los demás seguían. El aviso salió en la tarjeta del clip, ya empezado, y no
antes de empezar. Sloth solo reconocía la frenada cuando Flow no empezaba: un rechazo en la tarjeta era un error más, la
cuenta seguía recibiendo pedidos y el agente no sabía si se habían cobrado créditos.

En el foro de Google hay quejas del mismo aviso, también de cuentas de pago, y Google no ha dicho la causa. Se habla de
pedidos a la vez, de VPN y de lotes. Varios cuentan que Flow cobró créditos por clips que no hizo.

## Decisión

- **Un rechazo en la tarjeta es `Rechazado`.** Antes de pedir un video se lee el saldo de la cuenta. Si Flow lo rechaza,
  se espera un poco, se recarga y se vuelve a leer: así se sabe si cobró (`gastoDeRechazo`).
- **Si el aviso es de frenada (`AVISO_FRENADA`), la cuenta descansa**, como si Flow no hubiera empezado. Si no gastó, el
  pedido pasa a otra cuenta. Si gastó, o no se supo, falla diciéndolo, y lo cobrado se apunta en el uso del día.
- **Una cuenta frenada otra vez descansa el doble** (30 min, 1 h, 2 h… hasta 8 h). Lo olvida si pasan 6 h sin que la
  frenen.
- **Con ritmo:** dos pedidos a la vez (eran tres), de 15 a 30 s entre uno y otro, y 30 s de pausa en la cuenta que acaba.
  Tras cualquier frenada, durante una hora va uno a la vez y con cuatro veces más espacio: las cuentas salen de la misma
  conexión, y Google puede verlas juntas.

## Consecuencias

- Un lote tarda más: una frutinovela de 12 clips, unos 12 min con dos cuentas o más.
- Leer el saldo añade unos segundos a cada video, y a un rechazo, una recarga.
- Si Flow devuelve los créditos más tarde de lo que se espera, el rechazo dirá que cobró: es lo que menos riesgo tiene,
  porque así no se repite solo.
- Sigue sin comprobarse qué texto exacto pone Flow en español, y si devuelve los créditos de un rechazo.
