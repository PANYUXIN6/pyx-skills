# Delegation

Default to a single agent. Delegate only when context isolation, parallel execution, specialized capability, or independent judgment creates more value than the handoff costs.

## Decide Whether to Delegate

Compare the expected benefit with the cost of preparing context, coordinating decisions, integrating output, and verifying the result.

Delegate when one or more of these are substantial:

- A bounded investigation would otherwise consume significant main-context capacity.
- Independent tasks can run concurrently through stable interfaces.
- A specialized tool or domain context can be isolated cleanly.
- An independent perspective is required for review or adjudication.

Keep work local when the subtask needs most of the current context, shares rapidly changing state, touches the same files as ongoing work, or requires frequent back-and-forth. Do not delegate merely because subagents are available or a plan contains multiple steps.

## Define the Handoff Contract

Give a delegated agent the minimum complete context:

- Objective and reason for delegation.
- Relevant inputs, constraints, and authoritative files.
- Exact scope of allowed changes or read-only investigation.
- Required output and evidence.
- Success criteria and conditions that require escalation.

Prefer a short, self-contained brief. If the brief must reproduce most of the parent context, reconsider delegation.

## Coordinate and Integrate

Assign clear ownership and avoid overlapping writes. Parallelize only independent work. Answer blocking questions without broadening scope.

Treat the agent's report as a summary, not proof. Inspect the returned artifacts, reconcile conflicts, and run relevant verification before accepting completion. Use [task-continuity.md](task-continuity.md) when delegated work must survive compaction or resume across sessions.
