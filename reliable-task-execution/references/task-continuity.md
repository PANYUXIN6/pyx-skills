# Task Continuity

Preserve enough factual state to resume long-running work after interruption, context compaction, session changes, or multi-agent execution.

## Decide Whether to Persist State

Keep work in conversation and repository state when the task is short and coherent. Create persistent task state only when losing context would cause material rediscovery, duplicate work, or unsafe assumptions.

Use persistence when work spans long sessions, multiple agents, likely compaction, or several similarly named plans. Follow an existing repository workflow when one exists. Otherwise use a task-scoped location with a stable identity rather than a shared global ledger.

## Record the Minimum Recovery Set

Capture only facts needed to resume:

- Task identity and objective.
- Confirmed constraints and decisions.
- Completed work with authoritative references such as commits or file paths.
- Current work and the next safe action.
- Open blockers or unresolved decisions.
- Verification already performed and the state it covered.

Do not copy full conversations, speculative reasoning, or information that can be cheaply rediscovered.

## Resume Safely

Confirm that persisted state belongs to the current task. Reconcile it with Git history, files, tool output, and external systems; prefer those sources over model memory or stale notes.

Do not redispatch completed work merely because the conversation no longer remembers it. Do not trust a completion marker whose referenced artifact or commit does not exist.

Remove temporary task state when the task is complete and durable history exists. Preserve decisions that remain useful in the repository's normal documentation rather than in a private ledger.
