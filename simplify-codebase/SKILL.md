---
name: simplify-codebase
description: Find and, when mutation is explicitly authorized and repository-aware evidence supports it, remove redundant production surface such as dead or superseded code, duplicated state, unused APIs, speculative abstractions, obsolete compatibility paths, dependencies, packages, tests, and documentation. Use for explicit cleanup or simplification requests, or when an already-observed candidate needs structured consumer tracing beyond the current lines. Supports bounded light cleanup and subsystem- or repository-level deep simplification. Do not trigger merely because code review is running, for ordinary lint findings, isolated unused imports, stylistic refactoring, or complexity without consumer evidence.
---

# Simplify the Codebase

Reduce owned surface area without guessing about product intent. Prefer a few proven removals over aesthetic cleanup.

## Keep the Workflow Independent

Keep simplification independent from code review. Let routine review report unnecessary code as an ordinary finding without loading this Skill. Use this Skill only for an explicit simplification request or an observed candidate that needs broader consumer tracing.

Do not add a simplification stage to every review or broaden a read-only workflow into cleanup. Select `audit` whenever mutation authority is absent or another active workflow requires the target to remain unchanged. Preserve unrelated user changes.

## Establish the Repository Contract

Before judging candidates:

1. Read applicable repository instructions and inspect current worktree state when available.
2. Discover repository-owned simplification, defensive-pattern, compatibility, generated-file, migration, architecture, and decision records relevant to the scope.
3. Inspect manifests, task scripts, CI, analyzer configuration, and test configuration to confirm real entry points, exclusions, generated surfaces, and validation commands.
4. Verify that declared paths, entries, owners, and commands still exist before relying on them. Use observed maps to locate evidence, not to override current source or confirmed contracts.

Let the repository own language conventions, tool selection, coverage policy, protected surfaces, and gate commands. A repository rule may require stronger protection, but it cannot grant mutation authority or downgrade a globally high-impact consequence. If no repository policy exists, infer conservatively and report the missing boundary. Do not install tools or create policy files merely because this Skill was invoked.

## Select Operation and Depth

Choose one operation and one depth:

| Dimension | Mode | Select when |
| --- | --- | --- |
| Operation | `audit` | The user asks to find, assess, investigate, or propose candidates; another workflow is read-only; or mutation authority is unclear. |
| Operation | `apply` | The user explicitly requests modification or removal within a bounded scope. |
| Depth | `light` | The scope is a current task, current change, or named local candidate whose proof needs only direct consumers and companion artifacts. |
| Depth | `deep` | The scope is a subsystem or repository, or proof crosses packages, dynamic loading, public contracts, persistence, wire formats, or lifecycle ownership. |

Read [Light Workflow](references/light-workflow.md) completely for `light`. Read [Deep Workflow](references/deep-workflow.md) completely for `deep`. Do not load both for completeness.

If light work reaches a deep boundary outside the authorized scope, stop at an evidence-backed recommendation. Do not equate a large diff with deep work, or deep work with a mandatory pause.

## Apply Safety Once

Before any `apply`, read [Layered Safety Controls](references/layered-safety.md) completely and follow it as the single mutation authority. For deep work or whenever repository analyzers and aggregate gates matter, also read [Layered Tool Evidence](references/layered-tool-evidence.md) completely.

## Establish Consumer Evidence

Classify every plausible reference:

- **Production**: runtime entries, application code, loaders, registries, configuration, jobs, shipped examples, and operational scripts.
- **Non-production**: tests, docs, comments, snapshots, fixtures, generated expectations, and historical notes.
- **Ambiguous**: reflection, dependency injection, string dispatch, plugins, generated code, examples, and conditional build inputs.
- **External or contractual**: published APIs, extension points, persisted data, wire formats, migrations, CLI behavior, and consumers outside the repository.

Search symbols, exports, filenames, event names, configuration keys, package names, wire strings, and registration paths. Read call sites instead of counting matches. Treat analyzers as candidate detectors, never as proof that dynamic or external consumers are absent.

Strong candidates have no production consumer, mirror a fact owned elsewhere, preserve a superseded path, or carry generality with no current owner. Tests and docs as sole consumers strengthen a candidate only when they do not protect remaining behavior. Isolated imports, formatting, routine warnings, style preferences, and complexity without consumer evidence belong to normal development, not this workflow.

## Decide and Act

Give each candidate exactly one disposition:

- `remove`: evidence supports deletion within current authority and scope.
- `keep`: a current consumer, contract, owner, or distinct responsibility survives.
- `defer`: product, migration, external-consumer, runtime, or ownership evidence is missing.

Retain or defer when a production caller exists, a current defensive rationale survives, compatibility remains, or removal would make a product decision. Do not treat tests or historical decisions as permanent immunity, but require stronger current evidence before discarding their rationale.

Prefer direct removal over replacement. Do not turn simplification into redesign by introducing a new architecture, dependency, replacement implementation, temporary path, or speculative abstraction merely to make a candidate removable. If deletion requires choosing one beyond the proven obsolete closure, `defer` or hand the work to the normal development workflow.

When an internal compatibility path is explicitly deprecated and semantic evidence shows its production consumers have migrated, remove its complete closure instead of adding or retaining a shim, fallback, or migration solely for hypothetical compatibility. Keep public or external contracts, persisted data, wire formats, and migrations under their existing impact and evidence rules.

For `apply`, edit only candidates admitted by Layered Safety Controls. Remove the complete obsolete closure across implementation, imports, exports, registrations, exclusive tests, documentation, configuration, snapshots, generated inventories, package metadata, and dependencies as applicable. Preserve tests for remaining contracts, follow repository-owned generation and migration procedures, search for residual names, run the selected gates, and inspect the final diff.

## Report the Result

For `audit`, report mode, scope, candidate dispositions with evidence, exclusions, executed checks, and residual uncertainty. For `apply`, report the candidate-to-change mapping, impact class, evidence layers, mutation authority, repository policy used, preserved pre-existing work, validation, and recovery path.

If no strong candidate survives, say so and name representative evidence checked. Do not manufacture cleanup to justify invoking the Skill.
