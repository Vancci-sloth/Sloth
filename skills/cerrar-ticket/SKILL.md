---
name: cerrar-ticket
description: Cerrar un ticket terminado de un repo con GitHub Issues nativo (mattpocock): push, PR, merge, cierre de la issue y liberar los tickets que esperaban. Úsala cuando el usuario diga "cierra el ticket", "haz el push y el merge" o "deja todo listo para los demás tickets".
---

# Cerrar ticket

Termina un ticket ya implementado y deja el repo listo para que los tickets que esperaban puedan empezar. Las reglas de parentesco y bloqueos son las de `docs/agents/issue-tracker.md` (nativas de GitHub, etiquetas como espejo); léelo si no lo tienes en contexto.

Cada paso acaba en una condición comprobable; no pases al siguiente hasta cumplirla.

## 1. Identificar el ticket y el estado de la rama

El ticket sale de la rama (`implement-issue-<n>`), del mensaje de los commits o de lo que diga el usuario. Comprueba `gh pr list --head <rama> --state all` y `gh issue view <n>`: si el PR ya está mergeado y la issue cerrada, salta al paso 5.

Hecho cuando conoces `<n>`, la rama y si existe PR.

## 2. Verificar

Working tree limpio y `npm test` en verde (tipos, núcleo y e2e). Si falla, arréglalo o informa; el merge exige verde.

## 3. Push y PR

- `git push -u origin <rama>`.
- PR contra `master`. Título: `<Título del ticket> (#<n>)`. Cuerpo: qué cambia y por qué, y `Closes #<n>` para que el merge cierre la issue.
- Registra el PR con `link_pull_request` (si el MCP `t3-code` está disponible).

## 4. Merge

`gh pr merge <pr> --squash` (el historial de `master` es un commit por PR: `Título (#n) (#pr)`). No uses `--delete-branch` desde un worktree: `gh` intenta cambiar a `master` en local y falla. Borra la rama remota con `git push origin --delete <rama>`.

Hecho cuando `gh pr view <pr> --json state` da `MERGED` y `gh issue view <n> --json state` da `CLOSED`. Si la issue sigue abierta, ciérrala con `gh issue close <n> --comment`.

## 5. Dejar libres a los que esperaban

Es lo que hace útil el cierre.

1. **Liberar**: para cada issue de `gh api repos/<owner>/<repo>/issues/<n>/dependencies/blocking` con `issue_dependencies_summary.blocked_by == 0`, quita `bloqueado` (`gh issue edit <m> --remove-label bloqueado`).
2. **Barrido**: recorre todas las issues abiertas con `bloqueado`; cualquiera con `blocked_by == 0` pierde la etiqueta aunque no dependiera de este ticket (el espejo se desfasa).
3. **Paraguas**: si el padre (`especificacion`) tiene todos sus sub-issues cerrados (`sub_issues_summary.percent_completed == 100`), ciérralo con un comentario.
4. Nunca escribas bloqueos ni parentesco en el cuerpo de ninguna issue.

Hecho cuando ninguna issue abierta lleva `bloqueado` con cero bloqueos abiertos.

## 6. Sincronizar y cerrar el worktree

`git fetch origin` y comprueba que `origin/master` contiene el commit del merge. No borres el worktree en el que estás; dilo al usuario.

## 7. Informe

Corto, con lo que el usuario tiene que hacer: PR mergeado (URL), tickets liberados (`#m título`), cuáles quedan listos para tomar (`ready-for-agent` y sin bloqueos) y si se cerró el paraguas.
