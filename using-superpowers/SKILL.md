---
name: using-superpowers
description: Route substantive tasks to the smallest set of explicitly requested or strongly matching skills. Use at task start when skill selection can materially change the process.
---

<SUBAGENT-STOP>
A subagent with a bounded assignment follows its assigned workflow directly; this router belongs to the primary agent.
</SUBAGENT-STOP>

# Route to the Right Skills

At the start of a substantive task, decide whether an available skill would materially improve how the task is performed.

Select a skill when:

- The user explicitly asks to apply it.
- The request strongly matches its description.
- It is a necessary prerequisite for another selected workflow.

Treat topic-only or weakly related mentions as source context rather than invocation. When the user asks to explain, compare, or audit skills, inspect them as source material; when the user asks to change a skill, use the relevant skill-authoring workflow.

## Select the Minimum Useful Set

Prefer the smallest set of skills that fully covers the task.

Use process skills when they materially change the approach. Use domain or implementation skills for specialized knowledge and execution. When both are needed, apply them in dependency order rather than repeatedly re-routing.

After selecting skills:

1. Briefly tell the user which skills are being used and why.
2. Let each selected skill own its relevant workflow.
3. Keep the selection for the current task and re-route only after a substantial task change.

## Resolve Conflicts

Follow user instructions and repository-specific instructions over skill defaults.

When multiple skill instructions overlap, prefer the more specific instruction and keep each gate or checklist owned by one skill.

## Use Judgment

A skill is useful when it changes a decision or action by adding specialized knowledge, a meaningful decision framework, a fragile procedure, or a required tool workflow. If removing the skill would leave the task's process materially unchanged, treat it as unnecessary for that task.

If context inspection shows that a selected skill changes no decision or action, release it and continue with the remaining workflow.
