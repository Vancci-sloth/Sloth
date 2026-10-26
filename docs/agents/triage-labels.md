# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

<!-- gasera-fix -->
## Status labels

The five roles above answer _is this specified well enough?_. These two answer different
questions, so they sit alongside them on the same issue.

| Label | Meaning |
| ----- | ------- |
| `especificacion` | Umbrella: not implemented. Closes when its tickets close |
| `bloqueado` | Has open blockers; cannot be started yet |

A spec **must not** carry `ready-for-agent`. That label means someone may pick the issue up
and build it, and an umbrella is never built — it closes when its children close. Give it
`especificacion` and hang its tickets off it as sub-issues, so the progress badge says how
much is left without anyone maintaining it.

