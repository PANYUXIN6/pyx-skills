---
name: code-review
description: Unified code review entry point that routes routine change reviews, final acceptance reviews against specifications or tickets, and focused reviews for security, reliability, architecture, SOLID, performance, correctness, or removal candidates. Use when the user asks to review the current Git diff, a PR, or a commit range; verify whether a complete implementation satisfies specs, tickets, or acceptance criteria; or restrict the review to specific dimensions. Report findings by default and do not fix them automatically.
---

# Code Review

Use this skill as the single entry point for code reviews. Determine the review target and user intent first, then load the matching workflow and only the necessary review modules. Do not modify code, specifications, or commit history unless the user separately authorizes changes after the review.

## 1. Read Repository Context

Find and read all applicable `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CODING_STANDARDS.md`, architecture documents, and ADRs. Repository-specific rules take precedence over this skill's general baseline.

Determine the review scope:

- Use the commit, branch, tag, PR, or comparison range specified by the user.
- For a routine request to review current changes, inspect both staged and unstaged tracked changes, plus relevant untracked files shown by `git status`.
- Use a fixed baseline provided or confirmed by the user for acceptance reviews.
- Stop and ask when the review target cannot be resolved. Do not guess.

When a diff exceeds roughly 500 lines, summarize it by module or feature, then review it in batches. Group mixed concerns by logical function rather than mechanically following file order.

## 2. Route to a Workflow

Select exactly one primary workflow and read its file completely:

| Scenario | Primary workflow |
|---|---|
| Current workspace, routine PR, commit, or range review without specification acceptance | [Routine review](references/routine-review.md) |
| Verify whether a complete implementation satisfies confirmed specifications, tickets, or acceptance criteria | [Acceptance review](references/acceptance-review.md) |
| The user explicitly restricts the review to security, reliability, architecture, SOLID, performance, correctness, specification compliance, or removal candidates | [Focused review](references/focused-review.md) |

If the user only asks for a code review and the target is resolvable, default to a routine review. Clarify intent only when interpreting the request as routine versus acceptance review would materially change the result.

## 3. Dispatch Review Modules

Read every module required by the primary workflow, then add modules based on the request and signals in the diff:

| Module | Load when |
|---|---|
| [Correctness and quality](references/correctness-quality.md) | Load by default for routine reviews; load for focused reviews of correctness, performance, error handling, or edge cases; load for acceptance reviews when the change carries those risks |
| [Security and reliability](references/security-reliability.md) | The change involves authentication, authorization, user input, payments, secrets, data writes, transactions, concurrency, external calls, or resource consumption |
| [Architecture and standards](references/architecture-standards.md) | Load by default for acceptance reviews; the change crosses modules or affects public contracts, inheritance, new abstractions, or large-scale refactoring; a focused review requests architecture or SOLID |
| [Specification compliance](references/spec-compliance.md) | Load by default for acceptance reviews; a focused review requests comparison against specifications, tickets, or acceptance criteria |
| [Removal plan](references/removal-plan.md) | The review identifies deprecated paths, replacement implementations, permanently disabled feature flags, or unused code; a focused review requests cleanup candidates |

Do not load irrelevant modules merely to appear comprehensive. For focused reviews, load only the modules explicitly requested by the user.

## 4. Shared Review Rules

- Report only actionable, evidence-backed findings and cite tight file and line ranges.
- Explain the input, state, or call path that triggers each issue, and distinguish possibilities from verified facts.
- State the impact and the smallest safe fix direction. Do not present an unnecessary large refactor as the only solution.
- Inspect relevant callers, consumers, contracts, and tests until there is enough evidence to confirm or rule out a finding.
- Do not report purely stylistic differences with no practical effect on correctness, security, or maintainability.
- Do not claim to have run tests or checks that were not actually executed. Distinguish executed checks from evidence merely observed in the repository.
- When no issues are found, still state the coverage, unreviewed areas, and residual risks.
- After reporting, wait for the user to decide whether to fix the findings. Do not implement fixes automatically.

## 5. Exceptional Cases

- Empty diff: State the scope that was checked. If another reasonable scope remains unchecked, ask whether to switch to it.
- Invalid fixed baseline: Stop the acceptance review and do not issue a pass or fail conclusion.
- No repository-specific standards: Use the general engineering baseline from the loaded modules and disclose this explicitly.
- No acceptance source of truth: Ask where to find it. Omit the specification axis only after the user confirms that none exists.
