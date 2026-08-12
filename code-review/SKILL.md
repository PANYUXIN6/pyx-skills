---
name: code-review
description: Evidence-backed review of source code and machine-consumed software implementation artifacts, including tests, configuration, schemas, migrations, build scripts, and Git workspaces, diffs, commits, PRs, or ranges. Use only when the requested review target is code or implementation behavior, including evaluating code against requirements. Do not use to review prose documents themselves, such as Markdown design documents, specifications, PRDs, plans, reports, or contracts, even when the request says review, audit, or acceptance. Pair semantic LLM review with the bundled deterministic Runner for input manifests, declared disposition accounting, exact source-anchor validation, and approval gating; report findings and wait for separate authorization before fixing them.
---

# Code Review

Use this Skill as the thin orchestration layer for code review. Let Codex understand
intent, contracts, behavior, and risk; let `scripts/review.mjs` own mechanically
decidable target membership, snapshots, evidence coordinates, declared dispositions,
input freshness, and conclusion consistency. The Runner does not dispatch the model
and cannot prove that an Agent understood an item; a successful command proves only
the frozen inputs and recorded process state, not semantic completeness or correctness.

Keep target code, specifications, and Git history read-only until the user separately
authorizes fixes. Runtime and candidate artifacts may be written only outside the
target repository unless the user explicitly chooses another location.

The review target must contain at least one software implementation artifact. Treat
prose requirements and design documents only as authority or context for evaluating
that implementation. If the user asks to review a document's own clarity, structure,
consistency, or design quality, this Skill and its Runner are out of scope.

## 1. Establish authority and target

Read all repository rules governing the target, such as applicable `AGENTS.md`,
`CLAUDE.md`, `CONTRIBUTING.md`, and coding standards. Load only architecture documents
and ADRs relevant to the changed modules, contracts, or call paths. Repository rules
and confirmed requirements override this general baseline.

Resolve the requested target:

- For current changes, freeze `HEAD -> index` staged changes and `index -> worktree`
  unstaged changes as independent items, plus untracked files. Never collapse them
  into one `HEAD -> worktree` net diff.
- For a branch, commit, range, or PR comparison, resolve the fixed comparison point
  once. A three-dot comparison uses its merge base.
- For a current-state feature review, semantically discover the complete file scope
  from entry points, callers, contracts, configuration, and tests before freezing it
  as explicit files. This mode does not require Git, a diff, or a baseline.
- Require a Git baseline only for change attribution, regression, omission, or
  change-set scope conclusions. Ask when repository evidence cannot identify the
  requested target.

Use `node <skill-directory>/scripts/review.mjs prepare --repo <repository>` for a
workspace, add `--base <ref> --head <ref>` for a fixed range, or repeat `--file
<path>` for a current-state scope. Read the returned `queue_path`, not the full
Manifest: the queue contains only the item IDs, paths, changed ranges, metadata, and
exclusions needed for semantic review. Frozen source is available relative to the
queue directory as `snapshots/<item_id>.before|after`. The Runner retains the full
integrity data outside model context.

Read [Deterministic Review Runtime Protocol](references/review-runtime-protocol.md)
only when a command fails, an input is excluded or invalidated, the run must be
resumed or diagnosed, or the trust boundary matters. If Node.js or the Runner is
unavailable, or the target is only remote/pasted and cannot be represented, disclose
`UNMANAGED_REVIEW`; continue only when useful, never issue `APPROVE`, and do not
claim complete coverage.

When a diff exceeds roughly 500 lines, summarize and batch the review queue by module or
feature. Group mixed concerns by logical function rather than file order. Every item
must still receive an explicit disposition.

## 2. Select one primary workflow

Read exactly one primary workflow completely:

| Scenario | Primary workflow |
|---|---|
| Current workspace, routine PR, commit, range, or named feature review without specification acceptance | [Routine review](references/routine-review.md) |
| Verify whether current implementation or a defined change set satisfies confirmed specifications, tickets, or acceptance criteria | [Acceptance review](references/acceptance-review.md) |
| User explicitly restricts review to security, reliability, architecture, SOLID, performance, correctness, specification compliance, or removal candidates | [Focused review](references/focused-review.md) |

Default a resolvable general code-review request to routine review. Clarify only when
routine versus acceptance review would materially change the conclusion.

## 3. Load justified review modules

Load the workflow defaults, then only modules justified by the request or concrete
signals:

| Module | Load when |
|---|---|
| [Correctness and quality](references/correctness-quality.md) | Default for routine; focused correctness, performance, error handling, or edge cases; acceptance changes carrying those risks |
| [Security and reliability](references/security-reliability.md) | Authentication, authorization, input, payments, secrets, writes, transactions, concurrency, external calls, or resource consumption |
| [Architecture and standards](references/architecture-standards.md) | Default for acceptance; module or public-contract boundaries, inheritance, new abstractions, large refactors, architecture, or SOLID |
| [Specification compliance](references/spec-compliance.md) | Default for acceptance; focused specification, ticket, or acceptance-criteria comparison |
| [Removal plan](references/removal-plan.md) | Deprecated, superseded, disabled, or unused paths; explicit cleanup-candidate review |

Focused reviews stay inside the requested dimensions. Do not load checklist modules
as a substitute for tracing the actual code path.

## 4. Review semantically and account deterministically

For each pending queue item:

1. Inspect the relevant change or current-state file, callers, consumers, contracts,
   and tests required by the selected modules.
2. Form and challenge concrete defect hypotheses. Distinguish verified behavior from
   possibility and omit claims without a reproducible trigger or contract violation.
3. Record the item as `reviewed` only after that work. This is an Agent declaration,
   not mechanical proof that the analysis occurred. Record `skipped` or `failed` with
   the real reason; never use disposition state to exaggerate semantic coverage.

If a current-state feature scope expands, discard the old run and prepare a new
run with the complete explicit file set. Repository context read only to explain
a changed item need not become a finding target; any file used as a finding location
must belong to the Manifest.

## 5. Validate findings and gate the conclusion

Create one schema-version-2 candidate document conforming to
[findings.schema.json](references/findings.schema.json). Bind every Finding to its
exact Manifest `item_id`. Use a line anchor with path, side, range, and
`existing_code`, or a file anchor containing exact frozen Git metadata changes when
the change has no text hunk. Also include P0-P3 severity, trigger, impact, evidence,
and the smallest safe fix direction.

After all dispositions are current, run `validate`; correct rejected anchors from
the frozen snapshot or omit the Finding. Any later `mark` invalidates the validated
set, so validate again before finalization. Never relocate a comment by guesswork.
Run `finalize` with the intended workflow conclusion and use only the Runner-allowed
result. Do not translate
`PARTIAL`, `INVALIDATED`, excluded inputs, or a blocked conclusion into approval.

Render the selected workflow's user-facing report from the validated findings. State
the frozen scope, workflow and dimensions, executed versus merely observed checks,
excluded or incomplete items, unreviewed areas, and residual risks. When no findings
survive, say so without implying more than the frozen target and declared
dispositions prove. `APPROVE` is bounded to that process state; it is not proof that
the model performed complete semantic analysis. Then wait for separate authorization
before fixing anything.

## Exceptional cases

- Empty scope: report what was checked and remain non-approving; ask about another
  reasonable scope when one exists.
- Invalid required baseline: stop comparison review without pass/fail attribution.
- Current-state acceptance without baseline: disclose that history, regression, and
  change-set attribution were not reviewed.
- Missing confirmed acceptance source: ask where to find it; omit that axis only
  after the user confirms none exists.
- Input drift: treat the run as `INVALIDATED`, prepare a fresh run, and do not reuse
  prior anchors or coverage.
