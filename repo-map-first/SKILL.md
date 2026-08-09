---
name: repo-map-first
description: Resolve code placement and repository-map trust from repository evidence. Use automatically for existing-repository behavior changes with unclear ownership, cross-boundary impact, entry-point or dependency changes, unfamiliar non-local scope, or missing or stale maps. Also use for dependent-skill repository-context bootstrap and every explicit request to create, repair, update, inspect, or use repository maps; explicit requests always complete the map workflow.
---

# Place Changes with Repository Evidence

Resolve where a change belongs before implementing it when placement mistakes could cross responsibilities or spread through the wrong layer. Keep repository maps evidence-based and update them only when the task or an explicit request justifies the documentation work.

## Select the Invocation Mode

### Explicit Map Mode

Use this mode whenever the user names this skill or asks to create, repair, update, inspect, or use repository map documents.

- Stay in explicit map mode even when the task is local or placement appears clear.
- Inspect `docs/REPO_MAP.md` and `docs/ARCHITECTURE.md` when they exist.
- Ensure both documents cover the requested scope unless the user explicitly limits the document scope.
- Create missing documents or repair stale relevant sections from repository evidence before implementation.
- If the request is map-only, finish after producing or repairing the requested map and reporting its evidence and limitations.
- Leave accurate map sections unchanged.

Map work for the requested scope is complete when relevant owners, entry points, call or data flows, and dependency direction are locatable; claims are supported by repository evidence; unknowns and limitations are explicit; and no material placement ambiguity remains.

### Automatic Placement-Risk Mode

Use this mode only when an existing-repository behavior change has a real placement risk, such as:

- responsibility ownership or the implementation location remains unclear from the request and known context;
- the change crosses module or layer boundaries;
- entry points, dependency direction, public contracts, or key call flows may change;
- the repository is unfamiliar and the work is non-local;
- a relevant map appears missing, stale, contradictory, or insufficient for a cross-boundary decision.

Cross-file work alone is not enough. A local, well-specified change within one clear responsibility does not need this skill.

If brief inspection shows that placement is clear, no boundary is crossed, and no durable structure changes, release this skill and continue through the normal implementation workflow without placement analysis or map creation.

When maps are absent in automatic mode, resolve placement from the relevant source first. Create or repair repository documents only when they are necessary for safe placement or the task will change durable repository structure.

### Repository-Context Bootstrap

Use this mode only when another skill explicitly requests repository context because `docs/REPO_MAP.md` or `docs/ARCHITECTURE.md` is missing.

1. Identify which documents are missing and preserve any existing companion document.
2. Read applicable repository rules and existing documentation.
3. Inspect the repository with `rg --files`, `rg`, and targeted reads. Locate manifests, workspaces, entry points, relevant modules, public contracts, callers, dependencies, and tests.
4. Preserve the dependent skill's target artifact.
5. Create only the missing documents and begin each generated file with:

```yaml
---
generated_by: repo-map-first
authority_status: observed
---
```

6. Include only claims supported by repository evidence. Mark unknown relationships as unknown.
7. If the repository lacks enough evidence for the minimum content below, report `INSUFFICIENT_INPUT` instead of creating a misleading map.

The minimum `REPO_MAP.md` content is:

- Relevant top-level directories and modules
- One-sentence responsibility for each relevant module
- Primary entry points
- Key call chains or flows
- Locations of public contracts and tests used as evidence

The minimum `ARCHITECTURE.md` content is:

- Observed layers or module boundaries
- Observed dependency direction
- Main control or data flows
- Ownership of important state or data
- External systems and operational boundaries when present

Return control to the dependent skill after the requested documents exist. Generated documents remain observed context until the user explicitly changes `authority_status` to `confirmed`.

## Keep These Boundaries

- Begin implementation only after responsibility ownership and code placement are materially resolved.
- Verify stale or contradictory map claims against the relevant source and current behavior.
- In explicit map mode, complete the requested map work before implementation.
- Reuse existing modules, boundaries, and extension points; introduce a layer only when the requested behavior establishes a durable responsibility.
- Keep refactoring to boundary corrections required by the requested behavior. Explain the root cause and make the smallest justified correction.
- Preserve `generated_by` and `authority_status` provenance unless the user explicitly confirms a different authority status.

## Placement Workflow

The automatic fast exit above is the only route around this workflow. Repository-context bootstrap follows its own closed workflow instead.

1. Read applicable repository rules and inspect enough source to locate the current entry point, owner, call flow, and dependency direction.
2. Read the relevant portions of `docs/REPO_MAP.md` and then `docs/ARCHITECTURE.md` when present.
3. Use [staleness-checklist.md](./references/staleness-checklist.md) to decide whether the maps are trustworthy and what the current invocation mode requires.
4. State the placement decision using [placement-analysis.md](./references/placement-analysis.md) as a quality rubric, not a fixed template. Keep it brief unless the task crosses several independent subsystems or has high placement uncertainty.
5. Make the smallest viable change within the resolved responsibility boundary.
6. Use [map-sync-checklist.md](./references/map-sync-checklist.md) after implementation. Update `REPO_MAP.md` when responsibilities, files, entry points, or flows changed; also update `ARCHITECTURE.md` when layers, dependencies, or cross-system relationships changed.
7. Report whether responsibilities, entry points, or key flows changed and whether map documents were synchronized.

## Working Principles

- Prefer repository evidence over remembered or intended architecture.
- Discover context before asking generic placement questions.
- Use the least map detail needed to place the current change safely.
- Keep explicit user control stronger than automatic routing judgment.
- Distinguish responsibility boundaries from file count.
- Keep placement analysis concise and implementation-focused.
