# Safe Operations

Preserve user control and recoverability when an action changes external state or is difficult to undo.

## Assess the Operation

Before acting, determine:

- The exact resources, files, branches, records, or environments affected.
- Whether the action is local or external, reversible or irreversible.
- Whether the user authorized this specific action and scope.
- Whether another tool, process, or person owns the target.
- What recovery path exists if the action fails or was mistaken.

Resolve targets with read-only checks. Avoid broad paths, unresolved variables, ambiguous globs, or inferred ownership for destructive operations.

## Match Protection to Risk

Use ordinary implementation judgment for local, reversible changes. Add safeguards as impact or uncertainty increases:

- Preview or dry-run the operation when supported.
- Back up or snapshot state when recovery would otherwise be difficult.
- Use a worktree or isolated environment for long-running, parallel, or high-risk changes when its isolation benefit exceeds setup cost.
- Require explicit authorization before deletion, destructive migration, force push, publication, production changes, or other difficult-to-reverse external actions.

A direct user request supplies that authorization when the exact target, scope, and material consequence are already clear. Ask for confirmation only when one of them remains ambiguous; do not infer destructive authority from a general request to fix, clean up, or finish work.

## Execute and Close Out

Recheck the resolved target immediately before execution when state may have changed. Stop on unexpected scope, ownership, or precondition changes.

When an external operation returns an ambiguous result, inspect the current state before retrying so a timeout or lost response does not create a duplicate action.

Afterward, verify the resulting state and report what changed, what was preserved, and how recovery works when relevant. Clean up only resources demonstrably created or owned by the current task.
