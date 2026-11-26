# Referencias para el editor 3D

Este documento resume ideas revisadas para ampliar el editor de `Modelos 3D`. Son referencias de diseño y de flujo, no
dependencias copiadas en VyMotion.

## Qué aprovechamos

- **AssetFurnace / image-to-3dlab** propone un flujo por pasos para crear, limpiar, hacer rig, animar y terminar un
  modelo. También separa arreglos locales, texturas, LOD y comparación de resultados.
- **img2threejs** usa una reconstrucción por etapas con inventario de detalles, materiales por región, jerarquía de
  pivotes y revisiones visuales con controles de calidad. La idea útil para VyMotion es que cada operación sea concreta y
  que el agente revise el resultado antes de cerrar.
- **prompt2rig** separa una previsualización rápida de una pasada de mayor calidad y convierte una indicación de movimiento
  en animación retargeteada. Sus restricciones de licencia para GVHMR, SMPL-X, WiLoR y MANO impiden incorporarlas sin una
  revisión comercial específica.
- **RGB MoCap** organiza la revisión alrededor del visor, la línea de tiempo, correcciones de contactos, retargeting y
  exportación. La selección de persona y los ajustes aplicados antes de exportar son patrones útiles para futuras fases.

## Decisiones para VyMotion

El editor agrupa las operaciones en creación, selección y marcado, geometría, materiales y UV, rig y animación, y salida.
La selección visual se comunica al agente como una zona marcada sobre el visor, junto con el pedido escrito. Así se puede
pedir «corrige esta cara» sin prometer todavía una edición geométrica local dentro del iframe del visor.

La próxima ampliación natural es añadir una línea de tiempo para poses y contactos, una revisión antes/después por región y
un registro de decisiones del agente. Las operaciones pesadas siguen siendo tareas de la skill `modelos-3d` para mantener
la app ligera.

## Editor profesional (fases)

Referencias de editores en el navegador, para la fase 2 (edición manual): el editor de three.js
(`threejs-editor` en npm, MIT, extraído de three.js), Mixeur (Vue + three.js, estilo Blender, MIT), el editor de
Threepipe y Tinypoly. De ellos se toman los patrones: barra de herramientas agrupada con iconos, malla y cuadrícula
como modos de vista, cifras del modelo a la vista y deshacer por operación. Los nombres de cada repo sin comprobar en
su código fuente; revisar licencia antes de copiar nada.

- Fase 1 (hecha): la barra de herramientas muestra iconos cuando es angosta, y el visor tiene una barra propia
  (Encuadrar, Malla, Cuadrícula) con triángulos y piezas del modelo que se ve (`visor.tsx` mensajes `vista`,
  `encuadrar` y `estadisticas`; `Modelos3D.tsx`, `Escena` con `herramientas`).
- Fase 2 (hecha, por piezas): en el visor, «Ver / Mover / Girar / Escalar» con el gizmo de three.js sobre una pieza
  (clic para elegirla), deshacer, rehacer y restablecer (Ctrl+Z, Ctrl+Mayús+Z). Cada cambio se guarda como diferencia
  respecto a la original, por ruta de la pieza (`0/2`), en `data/modelos3d-ediciones/<id>.json` (`server/modelos3d-ediciones.ts`,
  `web/src/modelos3d-ediciones.ts`); el visor lo aplica al abrir el modelo. No edita vértices ni caras: mueve piezas
  enteras. Si el agente regenera el código del modelo, las rutas pueden cambiar; por eso la edición vive aparte y se
  puede restablecer.

## Fuentes

- https://github.com/Bingeljell/image-to-3dlab
- https://github.com/blendi-remade/prompt2rig
- https://github.com/img2threejs/img2threejs
- https://github.com/toyxyz/toyxyz_RGBMocap
- https://github.com/mrdoob/three.js (editor; paquete npm `threejs-editor`)
- Mixeur, Threepipe editor y Tinypoly, buscados en el foro de three.js (discourse.threejs.org)
