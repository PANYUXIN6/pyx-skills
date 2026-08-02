# Review Design Contracts Migration Design

## Goal

Migrate `review-design-contracts` from the project-local `.agents/skills/` directory into this personal skills repository and keep it Codex-specific. Preserve its layered native-subagent review protocol, pinned model configuration, deterministic evidence gates, human arbitration, and fix-queue behavior.

Remove the hard runtime requirement that every reviewed repository already contains `docs/REPO_MAP.md` and `docs/ARCHITECTURE.md`. When either file is missing, use the sibling `repo-map-first` skill to inspect the repository and create the missing observed-context document before starting the review run.

## Scope

### In scope

- Migrate all functional `review-design-contracts` files except `.DS_Store`.
- Keep the existing `gpt-5.6-sol` model and reasoning-effort configuration unchanged.
- Make skill-script invocation independent of the original `.agents/skills/` path.
- Add an explicit repository-context bootstrap mode to `repo-map-first`.
- Classify generated maps as observed context rather than confirmed authority.
- Extend the Runner to carry observed context separately from authority documents.
- Preserve input-digest invalidation for every reviewed document.
- Update and extend automated tests.

### Out of scope

- Supporting non-Codex agent frameworks.
- Replacing Native `spawn_agent`, `wait_agent`, or `interrupt_agent`.
- Changing the L1/L2/L3 review semantics, schemas, human arbitration, or fix queue.
- Replacing the Node.js Runner or adding npm dependencies.
- Renaming the `.superpowers/design-reviews/` run-artifact directory.
- Automatically treating generated documentation as a confirmed project contract.

## Skill Dependency

`review-design-contracts` has a conditional dependency on the sibling `repo-map-first` skill:

- If both repository documents exist, proceed without invoking `repo-map-first`.
- If either document is missing, invoke `repo-map-first` in repository-context bootstrap mode before running `prepare`.
- If the dependency is unavailable when bootstrap is required, stop before creating a review run and report the missing dependency.
- If bootstrap cannot establish enough evidence to describe the current repository, stop with `INSUFFICIENT_INPUT`.

The dependency is documented in the skill body because AgentSkill frontmatter supports only `name` and `description`.

## Repository Context Bootstrap

Add an explicitly invoked bootstrap mode to `repo-map-first`. This mode is allowed during a review preflight even though ordinary review-only tasks remain outside the skill's normal trigger conditions.

Bootstrap behavior:

1. Read applicable repository rules and existing documentation.
2. Inspect the actual repository with `rg --files`, `rg`, and targeted file reads.
3. Locate project manifests, workspaces, entry points, relevant modules, public contracts, callers, dependencies, and tests.
4. Create only the missing `docs/REPO_MAP.md` or `docs/ARCHITECTURE.md`.
5. Do not overwrite an existing document merely because the other document is missing.
6. Keep the reviewed design document unchanged.
7. Mark each generated document with provenance:

```yaml
---
generated_by: repo-map-first
authority_status: observed
---
```

The generated content describes observable repository structure. It does not claim to be a human-approved architecture contract.

The normal `repo-map-first` map synchronization workflow must preserve this provenance until a user explicitly changes `authority_status` to `confirmed`.

## Authority and Context Classification

The Runner classifies default repository documents as follows:

- Existing document without an `authority_status` marker: authority, for backward compatibility.
- Document marked `authority_status: confirmed`: authority.
- Document marked `authority_status: observed`: repository context.
- Explicit `--authority <path>`: authority, because the user deliberately supplied it. Explicit authority classification takes precedence when the same path is also discovered as observed context.

The run manifest records target, authority, and repository-context documents as distinct roles. All are content-addressed and participate in invalidation.

L2 receives:

- the complete target design;
- the Contract Ledger;
- every confirmed authority document;
- every observed repository-context document.

Architecture L3 tasks receive the same document evidence and complete Contract Ledger needed to challenge an L2 candidate independently. Self-consistency L3 tasks retain their current narrower evidence package.

A finding may use observed context to establish that a file, entry point, dependency, or call path exists. Its expected contract must still come from the target design or a confirmed authority source. When no confirmed architecture authority exists, the human-facing report discloses that architecture coverage is based on the target design and observed repository structure.

## Model and Native Task Behavior

Preserve `review.config.json` model settings exactly:

- L1 self-consistency: `gpt-5.6-sol`, `high` reasoning effort.
- L2 architecture: `gpt-5.6-sol`, `max` reasoning effort.
- L3 adversarial: `gpt-5.6-sol`, `max` reasoning effort.

Continue returning `model` and `reasoning_effort` in every task descriptor and pass them unchanged to Native `spawn_agent`. Preserve `fork_turns: none`, timeout handling, bounded L3 concurrency, and the prohibition on CLI or API model fallbacks.

## Portable Invocation

Replace commands that assume `.agents/skills/review-design-contracts/` with instructions to resolve the directory containing the active `review-design-contracts/SKILL.md` and invoke its Runner by absolute path:

```text
node <review-design-contracts-skill-directory>/scripts/review-design.mjs <command> ...
```

The Runner already resolves its configuration and references relative to its own script directory, so no internal path redesign is required.

## Error Handling

- Missing default map or architecture document: invoke the bootstrap dependency before `prepare`.
- Missing `repo-map-first` when bootstrap is required: stop without creating a run.
- Bootstrap lacks enough repository evidence: return `INSUFFICIENT_INPUT`.
- Invalid explicit authority path: fail immediately.
- Generated or confirmed input changes after packing: transition the run to `INVALIDATED` before consuming a task response.
- Native tool unavailability, subagent error, timeout, or missing response: preserve the existing `fail-task` behavior.
- Invalid model output: preserve the single fresh retry and subsequent terminal failure.

## File Changes

### `review-design-contracts`

- Migrate 17 functional files and exclude `.DS_Store`.
- Update `SKILL.md` for portable invocation and bootstrap orchestration.
- Update `review-protocol.md` with authority/context provenance rules.
- Update the Runner to classify and package observed context.
- Update tests and evaluation assertions without changing existing review schemas unless the new manifest role requires it.

### `repo-map-first`

- Add the explicit repository-context bootstrap exception and workflow.
- Define the minimum evidence required to create each missing document.
- Add provenance requirements.
- Preserve provenance during future map synchronization.
- Keep ordinary review-only tasks outside normal triggering unless a dependent skill explicitly requests bootstrap.

## Verification

Run the existing `review-design.test.mjs` suite and retain all current behavioral guarantees. Add tests for:

1. Both default documents exist and remain confirmed authority.
2. One default document is observed while the other remains authority.
3. Both default documents are observed context.
4. An explicitly supplied authority overrides observed classification.
5. Changed observed context invalidates the run.
6. Architecture L2 and L3 receive context separately from authority.
7. The pinned model and reasoning-effort mappings remain unchanged.
8. No `.agents/skills/` invocation path remains in the migrated skill.
9. Skill validation and packaging succeed without `.DS_Store`.

Also run the AgentSkill quick validator and package the migrated skill into a temporary directory. Verify that only the design document is included in its dedicated design commit and that unrelated untracked skill files remain untouched.
