---
name: repo-map-first
description: Use when implementing or modifying behavior in an existing repository, adding capabilities, making cross-file changes, taking over an unfamiliar codebase, or deciding where code should live. Read docs/REPO_MAP.md and docs/ARCHITECTURE.md when present, determine whether the repository map is missing or stale, provide a pre-coding placement analysis, make the smallest viable change, and update the map when file responsibilities, entry points, module boundaries, or key flows change. Also use when a dependent skill explicitly requests repository-context bootstrap for missing map or architecture documents. Do not otherwise use for explanation-only, review-only, test-only, or other non-behavioral tasks.
---

# Repo Map First

Treat the repository map as a guide for code placement, not as documentation to patch up afterward.

This skill has only three goals:

1. Determine where code belongs before writing it instead of guessing along the way.
2. Keep changes within the correct boundaries instead of letting them spread opportunistically.
3. Update the map after responsibilities change so the next task does not have to rediscover the structure from source code.

## When to Use

Use this skill when any of the following applies:

- Implementing a new feature or modifying existing behavior.
- Adding a capability, extending an interface, adding configuration, or introducing a new flow.
- Deciding where a change belongs in an unfamiliar repository.
- Making a change that crosses files or modules, or may affect entry points or call chains.
- Locating the correct implementation point when the user has not specified one.

## When Not to Use

Do not use this skill by default for:

- Explaining code or answering questions without making changes.
- Reviewing code or identifying issues without implementing changes.
- Running tests, formatting, or building without changing behavior.
- Editing comments, copy, README files, or other content that does not affect runtime behavior.

If an analysis-only task turns into a behavioral change, switch to this skill immediately.

The only review-only exception is an explicit repository-context bootstrap request from a dependent skill. Follow the bootstrap workflow below instead of the normal implementation workflow.

## Hard Constraints

- Do not modify code before reading the repository map.
- Do not modify code before providing the pre-coding placement analysis.
- When the map is missing or clearly stale, create the smallest usable map before modifying code.
- Reuse existing modules, boundaries, and extension points. Do not invent a new layer solely for the current task.
- Do not perform opportunistic refactoring unless the user explicitly requests it. If avoiding a refactor would block implementation, explain why before proceeding.
- Preserve `generated_by` and `authority_status` provenance in generated maps unless the user explicitly confirms a different authority status.

## Repository-Context Bootstrap

Use this mode only when another skill explicitly requests it because `docs/REPO_MAP.md` or `docs/ARCHITECTURE.md` is missing.

1. Identify which of the two documents are missing. Do not overwrite an existing document merely because its companion is absent.
2. Read applicable repository rules and existing documentation.
3. Inspect the repository with `rg --files`, `rg`, and targeted file reads. Locate manifests, workspaces, entry points, relevant modules, public contracts, callers, dependencies, and tests.
4. Keep the dependent skill's target document unchanged.
5. Create only the missing documents and begin each generated file with:

```yaml
---
generated_by: repo-map-first
authority_status: observed
---
```

6. Include only claims supported by repository evidence. Mark unknown relationships as unknown rather than inferring intended architecture from the current implementation.
7. If the repository does not contain enough evidence for the minimum content below, stop and report `INSUFFICIENT_INPUT` instead of creating a misleading map.

The minimum `REPO_MAP.md` content is:

- Relevant top-level directories and modules
- One-sentence responsibility for each relevant module
- Primary entry points
- Key call chains or flows
- Locations of the public contracts and tests used as evidence

The minimum `ARCHITECTURE.md` content is:

- Observed layers or module boundaries
- Observed dependency direction
- Main control or data flows
- Ownership of important state or data
- External systems and operational boundaries when present

Return control to the dependent skill after both documents exist. Generated documents remain observed repository context until a user explicitly changes `authority_status` to `confirmed`.

## Workflow

### 1. Confirm Applicability

Determine whether the task implements or modifies behavior.

- If it does, continue with this workflow.
- If it does not, use the normal workflow instead of forcing this skill onto the task.

### 2. Read the Map, Then the Architecture

Read these files in order:

1. `docs/REPO_MAP.md`
2. `docs/ARCHITECTURE.md` when present

Answer only these four questions while reading:

- Where is the entry point?
- Which module owns the target responsibility?
- How does the existing call chain flow?
- In which layer should the change be contained?

### 3. Determine Whether the Map Is Missing or Stale

Use [staleness-checklist.md](./references/staleness-checklist.md) to make this determination.

If any mandatory-update condition applies, update the map before modifying code. Do not continue making blind changes after discovering that the map is inaccurate.

If the repository has no map at all, create a minimal usable version that documents at least:

- The top-level directories or core modules
- The responsibility of each core module
- The primary entry points
- The key call chains or main flows

### 4. Provide the Pre-Coding Placement Analysis

Follow the structure in [pre-code-analysis-template.md](./references/pre-code-analysis-template.md) exactly.

Cover at least:

- Task objective
- Entry point
- Existing flow
- Affected modules
- Files to modify or add
- Reasons for choosing those locations
- Risks and test plan
- Map status

The purpose is not to restate the user's request, but to demonstrate that the implementation location has been determined.

### 5. Modify the Code

Follow these principles while making changes:

- Look for existing extension points, adapters, services, and composition points before creating a new abstraction.
- Keep behavioral changes within existing responsibility boundaries; do not push logic across layers.
- Before adding a file, explain why the logic cannot live in an existing file.
- If the root problem is an incorrect boundary design, do not conceal it with a patch. Explain the root cause, then make the smallest necessary adjustment.

### 6. Determine Whether to Update the Map

Use [map-sync-checklist.md](./references/map-sync-checklist.md) to make this determination.

If any mandatory-update condition applies, update:

- `docs/REPO_MAP.md`
- `docs/ARCHITECTURE.md` when architectural relationships, layers, or key flows change

### 7. Report Map Synchronization

At completion, explicitly state:

- Whether the change altered module responsibilities, entry points, or key flows.
- Whether the map documents were updated; if not, why no update was necessary.

## Output Requirements

Keep the output concise, direct, and actionable. Do not turn the placement analysis into a long background explanation.

Lead with conclusions, then provide only the minimum necessary evidence.
