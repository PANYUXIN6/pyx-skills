# Repository Map Staleness Checklist

Use this checklist to decide whether relevant map information is trustworthy. A stale map is evidence to investigate, not authority to follow.

## Missing or Inadequate

- `docs/REPO_MAP.md` or `docs/ARCHITECTURE.md` is absent when the active invocation mode requires it.
- The relevant document lists names without responsibilities, entry points, or relationships needed for the task.
- The module or boundary relevant to the task is omitted.
- The map does not reveal the current entry, owner, dependency direction, or cross-module relationship needed to place the change.

## Clearly Stale or Contradictory

- Current directories, modules, services, pages, endpoints, or jobs are absent from the relevant map.
- Files or directories moved or were renamed while the map still uses old paths.
- Entry points or key flows changed while the map still describes the old route.
- Responsibility ownership in the map differs from current code.
- `REPO_MAP.md` and `ARCHITECTURE.md` contradict each other.

## Respond by Invocation Mode

- **Explicit map mode:** create missing documents and repair stale relevant sections before implementation. Keep the update limited to evidence needed for the requested scope.
- **Automatic placement-risk mode:** verify placement against source. Create or repair maps before implementation only when missing or stale information prevents safe placement, or when the task will change durable structure. Otherwise do not create documentation solely because it is absent.
- **Repository-context bootstrap:** create only the missing documents. Do not repair or overwrite an existing companion unless the requesting skill explicitly expands the scope.
- **Repository-context validation:** verify only the dependent task's relevant scope. Repair stale observed claims, leave accurate sections unchanged, and report rather than overwrite a contradiction involving unmarked or confirmed authority.

Never convert `authority_status: observed` to `confirmed` without explicit user confirmation. If evidence is insufficient, state the limitation instead of inferring intended architecture.
