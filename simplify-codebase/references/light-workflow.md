# Light Simplification Workflow

Use this workflow for a current task, current change, or named local candidate. Limit the investigation to that surface, direct production consumers, and companion tests, documentation, configuration, snapshots, and generated files.

## Establish the Bound

1. Apply the repository contract discovered through `SKILL.md`.
2. Inspect the current diff when the task concerns recent changes, separating pre-existing work where needed.
3. Name the candidate and why it may be obsolete, duplicated, or over-built.
4. List direct runtime entries and callers before non-production references.

A Git baseline helps attribute task-created residue but is not required for a named current-state candidate. Do not absorb unrelated nearby cleanup.

## Trace the Local Closure

Search old and replacement symbols, imports, exports, filenames, calls, registrations, event names, configuration keys, tests, docs, snapshots, generated inventories, and compatibility branches tied to the candidate. Read every plausible production call site and classify non-production references separately.

Good light candidates include a replacement's orphaned helper, branch, export, dependency, test path, temporary shim, duplicated local fact, or companion artifact that describes removed behavior. Handle isolated imports, variables, formatting, and routine analyzer warnings through normal implementation or lint.

## Stop at a Deep Boundary

Stop when proof requires repository-wide consumer discovery, dynamic registration, a package deletion, downstream compatibility, persistence or wire decisions, or cross-module lifecycle ownership. Record the concrete boundary and recommend deep work unless that scope is already authorized.

## Finish the Selected Operation

For `audit`, keep the workspace unchanged and report `remove`, `keep`, or `defer`.

For `apply`, use Layered Safety Controls as the only admission rule. Remove the proven local closure, search for stale names, and run repository-owned checks targeted to the remaining behavior. Report unrelated residue without fixing it.
