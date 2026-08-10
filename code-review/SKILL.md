---
name: code-review
description: Evidence-backed code review for uncommitted workspace changes, a current feature implementation, Git diffs or ranges, final acceptance against confirmed requirements, and focused security, reliability, architecture, SOLID, performance, correctness, or removal reviews. Route by the conclusion requested; require a Git baseline only for comparison claims, report findings, and wait for separate authorization before fixing them.
license: MIT
---

# Code Review

Use this skill as the single entry point for code reviews. Determine the review target and user intent first, then load the matching workflow and only the necessary review modules. Keep code, specifications, and commit history read-only until the user separately authorizes fixes after the review.

## 1. Read Repository Context

Find and read all repository rules that govern the review target, such as applicable `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and `CODING_STANDARDS.md`. Then load only architecture documents and ADRs relevant to the changed modules, contracts, or call paths. Expand the search when the diff shows broader impact; do not load the repository's entire documentation set by default. Repository-specific rules take precedence over this skill's general baseline.

Determine the review scope:

- Use the commit, branch, tag, PR, or comparison range specified by the user.
- For a routine request to review current changes, inspect both staged and unstaged tracked changes, plus relevant untracked files shown by `git status`.
- For a feature review without specification acceptance, identify the current implementation from the named feature, its entry points, callers, tests, and repository evidence.
- For acceptance against confirmed requirements, review either the current implementation state or a comparison against a fixed Git baseline, according to the conclusion the user requests.
- Require a fixed baseline only when the review must attribute changes, regressions, omissions, or scope expansion to a particular change set.
- Ask the user to resolve a review target that repository evidence cannot identify.

When a diff exceeds roughly 500 lines, summarize it by module or feature, then review it in batches. Group mixed concerns by logical function rather than mechanically following file order.

## 2. Route to a Workflow

Select exactly one primary workflow and read its file completely:

| Scenario | Primary workflow |
|---|---|
| Current workspace, routine PR, commit, range, or named feature review without specification acceptance | [Routine review](references/routine-review.md) |
| Verify whether the current implementation or a defined change set satisfies confirmed specifications, tickets, or acceptance criteria | [Acceptance review](references/acceptance-review.md) |
| The user explicitly restricts the review to security, reliability, architecture, SOLID, performance, correctness, specification compliance, or removal candidates | [Focused review](references/focused-review.md) |

If the user only asks for a code review and the target is resolvable, default to a routine review. Clarify intent only when interpreting the request as routine versus acceptance review would materially change the result.

## 3. Dispatch Review Modules

Use this table as the single source of truth: load the default modules for the selected workflow, then add modules based on the request and signals in the diff:

| Module | Load when |
|---|---|
| [Correctness and quality](references/correctness-quality.md) | Load by default for routine reviews; load for focused reviews of correctness, performance, error handling, or edge cases; load for acceptance reviews when the change carries those risks |
| [Security and reliability](references/security-reliability.md) | The change involves authentication, authorization, user input, payments, secrets, data writes, transactions, concurrency, external calls, or resource consumption |
| [Architecture and standards](references/architecture-standards.md) | Load by default for acceptance reviews; the change crosses modules or affects public contracts, inheritance, new abstractions, or large-scale refactoring; a focused review requests architecture or SOLID |
| [Specification compliance](references/spec-compliance.md) | Load by default for acceptance reviews; a focused review requests comparison against specifications, tickets, or acceptance criteria |
| [Removal plan](references/removal-plan.md) | The review identifies deprecated paths, replacement implementations, permanently disabled feature flags, or unused code; a focused review requests cleanup candidates |

Load only modules justified by the primary workflow, the user's requested dimensions, or concrete signals in the diff. For focused reviews, keep coverage to the explicitly requested modules.

## 4. Shared Review Rules

- Report only actionable, evidence-backed findings and cite tight file and line ranges.
- Explain the input, state, or call path that triggers each issue, and distinguish possibilities from verified facts.
- State the impact and the smallest safe fix direction. Recommend a larger refactor only when evidence shows that a local fix cannot resolve the issue safely.
- Inspect relevant callers, consumers, contracts, and tests until there is enough evidence to confirm or rule out a finding.
- Omit stylistic differences with no practical effect on correctness, security, or maintainability.
- Report tests and checks as executed only when current tool evidence supports that claim; label repository evidence as observed.
- When no issues are found, still state the coverage, unreviewed areas, and residual risks.
- After reporting, wait for the user to authorize any fixes.

## 5. Exceptional Cases

- Empty diff: State the scope that was checked. If another reasonable scope remains unchecked, ask whether to switch to it.
- Invalid fixed baseline in comparison mode: Stop that acceptance review and do not issue a pass or fail conclusion about the change set.
- Current-state acceptance without a baseline: Review the present implementation and disclose that historical regressions, change attribution, and change-set scope cannot be concluded.
- No repository-specific standards: Use the general engineering baseline from the loaded modules and disclose this explicitly.
- No acceptance source of truth: Ask where to find it. Omit the specification axis only after the user confirms that none exists.
