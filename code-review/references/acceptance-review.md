# Acceptance Review Workflow

Use this workflow to verify whether a complete implementation faithfully satisfies confirmed specifications, tickets, and repository standards. The top-level router is the single source of truth for module selection; this file defines the acceptance procedure and output.

## 1. Fix the Review Scope

Choose the scope mode that matches the conclusion requested.

### Current-State Mode

Use this mode when the user asks whether the current implementation of a feature satisfies confirmed requirements without asking what changed relative to Git history.

Identify the implementation scope from the named feature, relevant entry points, callers, contracts, configuration, tests, staged and unstaged changes, and relevant untracked files. Review the current repository state as one implementation. A Git baseline is optional.

Without a baseline, disclose that the review cannot attribute behavior to a particular change set or establish historical regressions, change-set omissions, or scope expansion relative to an earlier state. This limitation does not prevent a conclusion about whether the current implementation satisfies confirmed requirements.

### Comparison Mode

Use this mode when the user asks what a branch, PR, commit range, or uncommitted change set introduced, whether that change set is complete, or whether it caused regressions or scope expansion.

Use a fixed baseline provided or confirmed by the user, such as a commit, branch, tag, or merge base. Resolve it once and keep that result fixed:

```bash
git rev-parse <fixed-point>
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

Three-dot diffs compare from the merge base. Stop without issuing a comparison-mode acceptance conclusion if the reference is invalid. If the diff is empty, report that no change set exists at that comparison point; switch to current-state mode only when that still answers the user's request.

For workflows spanning multiple tickets, review the complete requested implementation scope and the complete set of confirmed specifications and tickets by default unless the user explicitly restricts the scope to one ticket.

## 2. Confirm Sources of Truth

Search in this order:

1. Ticket references in commit messages and the ticket system configured for the repository.
2. Specifications, PRDs, or ticket paths provided by the user.
3. Files in `docs/`, `specs/`, or `.scratch/` that match the branch or feature.

Do not treat unconfirmed implementation notes as approved specifications. If the specification changed during implementation, use the version most recently confirmed by the user and describe the change.

Ask the user when no source of truth can be found. Omit the specification axis only after the user confirms that no specification exists, and disclose the omission in the summary.

## 3. Execute Two Independent Review Axes

Complete two separate review processes without allowing one to obscure the other:

- **Specification axis**: Follow `spec-compliance.md` to check omissions, incorrect implementations, scope creep, and dependency conditions.
- **Standards axis**: Follow `architecture-standards.md` and repository rules to check implementation quality; add correctness or security modules based on risk.

The specification axis determines whether the agreed requirements were implemented. The standards axis determines whether the implementation itself meets engineering requirements. Do not merge findings from the two axes into one ranking.

## 4. Output

```markdown
## Specification

<List findings individually; cite specification or ticket evidence and the implementation location for each>

## Standards

<List findings individually; cite repository standards or the general baseline and the implementation location for each>

## Summary

- Number of specification-axis findings and the most severe issue
- Number of standards-axis findings and the most severe issue
- Whether a confirmed specification exists
- Review scope mode and implementation target
- Fixed baseline and reviewed commit range when comparison mode was used
- Historical or change-attribution limitations when current-state mode had no baseline
- Tests and checks that were executed versus merely observed
- Unreviewed areas and residual risks
```

Keep both headings and describe what was checked even when one axis has no findings. Do not fix findings automatically.
