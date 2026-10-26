# Issue tracker: GitHub

Las issues y las especificaciones de este repo viven en GitHub. Usa `gh` con la cuenta indicada en `AGENTS.md`;
el repo se deduce de `git remote -v`.

## Operaciones

- Crear: `gh issue create --title "..." --body-file <archivo.md>`. El archivo conserva los saltos de línea del cuerpo.
- Leer: `gh issue view <n> --comments`; consulta también sus etiquetas.
- Listar: `gh issue list --state open --json number,title,body,labels,comments`, con los filtros de estado y etiqueta
  necesarios. Extrae solo los campos que hagan falta antes de imprimir.
- Comentar: `gh issue comment <n> --body-file <archivo.md>`.
- Etiquetar: `gh issue edit <n> --add-label "..."` / `--remove-label "..."`.
- Cerrar: `gh issue close <n> --comment "..."`.

Cuando una skill diga «publicar en el tracker», crea una issue. Para «leer el ticket», usa
`gh issue view <n> --comments`. Las etiquetas y su significado están en [triage-labels.md](triage-labels.md).

## Pull requests como entrada de triage

**PRs as a request surface: no.** Cambia a `yes` si el repo empieza a tratar PR externas como solicitudes de funciones.

Con `yes`, `/triage` usa los mismos estados y etiquetas mediante `gh pr`:

- Leer: `gh pr view <n> --comments` y `gh pr diff <n>`.
- Listar: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` y conservar solo
  autores `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` o `NONE`.
- Comentar, etiquetar y cerrar: `gh pr comment`, `gh pr edit` y `gh pr close`.

GitHub comparte la numeración entre issues y PR. Resuelve un `#42` ambiguo con `gh pr view 42` y, si no es PR,
`gh issue view 42`.

## Jerarquía y bloqueos: una sola fuente

Las relaciones nativas de GitHub son la fuente de verdad tanto para los tickets normales como para `/wayfinder`.
Los cuerpos explican el trabajo; los sub-issues y las dependencias determinan la jerarquía, el progreso y los bloqueos.

- **Comprobar disponibilidad:** consulta `gh api repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by` y
  `gh api repos/<owner>/<repo>/issues/<n>/sub_issues`. Una respuesta `[]` confirma disponibilidad sin relaciones.
  Ante un error, comprueba que la issue exista y que la cuenta tenga acceso; un 404 aislado no demuestra incompatibilidad.
- **Jerarquía:** vincula cada ticket como sub-issue de su especificación o mapa con la mutación GraphQL
  `addSubIssue(input: {issueId: <parent-node-id>, subIssueId: <child-node-id>})`.
  Obtén cada `node_id` con `gh api repos/<owner>/<repo>/issues/<n> --jq .node_id`.
  GitHub calcula el progreso del padre a partir de sus hijos.
- **Bloqueos:** `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Usa el `.id` numérico de la issue bloqueante, obtenido con `gh api repos/<owner>/<repo>/issues/<n> --jq .id`;
  no su número visible ni su `node_id`. `-F` conserva el tipo numérico que requiere la API.
- **Etiquetas:** `especificacion` identifica el padre y `bloqueado` refleja que un ticket tiene bloqueantes abiertos.
  Al cerrar un ticket, consulta las dependencias y retira `bloqueado` de los que haya liberado.
  Estas etiquetas reflejan las relaciones; no las sustituyen.

No mantengas copias de estas relaciones como `Part of #<n>`, secciones `Blocked by` o listas de tareas del padre.
Si, tras comprobar cuenta y acceso, la API sigue sin estar disponible, informa de la operación pendiente y continúa el
trabajo independiente. No inventes un bloqueo en texto ni consideres libre un ticket cuyo estado no pudiste consultar.

## Operaciones de /wayfinder

El mapa es una issue y sus tickets son sub-issues. Todos usan las reglas nativas anteriores; no hay otra representación
para este flujo.

- **Mapa:** issue con la etiqueta `wayfinder:map`; su cuerpo contiene notas, decisiones y dudas pendientes.
- **Ticket:** sub-issue del mapa con etiqueta `wayfinder:<tipo>` (`research`, `prototype`, `grilling` o `task`).
  Al tomarlo, asígnalo a quien lo conduce.
- **Frontera:** consulta `gh api repos/<owner>/<repo>/issues/<map>/sub_issues --paginate`, conserva los hijos abiertos
  sin asignar y consulta sus dependencias. Descarta cualquiera con `issue_dependencies_summary.blocked_by > 0`
  (cuenta bloqueantes abiertos); el primero restante en el orden del mapa es el siguiente.
- **Tomar:** `gh issue edit <n> --add-assignee @me`, la primera escritura de ese trabajo.
- **Resolver:** comenta la respuesta, cierra el ticket y añade al mapa una decisión con su motivo y enlace al resultado.
  Revisa las etiquetas de los tickets que haya desbloqueado.
