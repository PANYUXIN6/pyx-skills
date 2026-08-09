---
name: reliable-task-execution
description: Apply lightweight safeguards when task execution involves completion claims, destructive or external-state changes, debugging, long-running or resumable work, subagent delegation, or high-risk review. Use to preserve evidence, recoverability, and user control without imposing a fixed development workflow.
---

# Reliable Task Execution

Use the least ceremony that preserves correctness, recoverability, and user control. Apply only the modules relevant to the current risk.

## Core Invariants

- Base factual claims on current evidence.
- Resolve exact targets and authority before irreversible actions.
- Treat repository state, tool output, and external systems as more reliable than memory.
- Re-evaluate assumptions when repeated attempts fail instead of stacking speculative fixes.
- Use persistent state, delegation, and independent review only when their benefits exceed their coordination cost.

## Load Modules Just in Time

Read only the reference needed for the current situation:

| Situation | Module |
|---|---|
| About to claim work is complete, fixed, correct, or passing | [verification.md](references/verification.md) |
| About to delete, overwrite, publish, merge, deploy, force push, or change difficult-to-reverse external state | [safe-operations.md](references/safe-operations.md) |
| Investigating a bug, failure, performance problem, or repeated unsuccessful fix | [diagnosis-and-recovery.md](references/diagnosis-and-recovery.md) |
| Work may span compaction, interruption, sessions, or multiple agents | [task-continuity.md](references/task-continuity.md) |
| Considering subagent delegation or parallel execution | [delegation.md](references/delegation.md) |
| A change crosses a meaningful correctness, security, data, or integration risk boundary | [independent-review.md](references/independent-review.md) |

Load more than one module only when the task genuinely crosses multiple boundaries. For example, a long delegated migration may need continuity, delegation, safe operations, review, and final verification; a small local edit may need only final verification.

## Keep Judgment Adaptive

Treat these as hard boundaries:

- Support success claims with current evidence.
- Resolve target, impact, authority, and recovery before an irreversible action.
- Inspect delegated results before accepting them as complete.
- Revisit the diagnosis when a repair loop stops producing useful evidence.
- Confirm persisted state belongs to the current task before reusing it.

Use a worktree, written state, subagents, independent review, or a particular test strategy only when its risk reduction exceeds its coordination cost.

## Stay Within Scope

This skill adds no fixed development stages. Activate brainstorming, written plans, test-driven development, worktrees, subagents, code review, or commits only when another applicable workflow or the user requires them.
