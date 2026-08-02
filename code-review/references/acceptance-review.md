# Acceptance Review Workflow

Use this workflow to verify whether a complete implementation faithfully satisfies confirmed specifications, tickets, and repository standards. Read `spec-compliance.md` and `architecture-standards.md` completely by default, then add other modules based on the risks in the change.

## 1. Fix the Review Scope

Use a fixed baseline provided or confirmed by the user, such as a commit, branch, tag, or merge base. Resolve it once and keep that result fixed:

```bash
git rev-parse <fixed-point>
git diff <fixed-point>...HEAD
git log <fixed-point>..HEAD --oneline
```

Three-dot diffs compare from the merge base. Stop without issuing an acceptance conclusion if the reference is invalid or the diff is empty. For workflows spanning multiple tickets, review the complete branch and the complete set of specifications and tickets by default unless the user explicitly restricts the scope to one ticket.

## 2. Confirm Sources of Truth

Search in this order:

1. Ticket references in commit messages and the ticket system configured for the repository.
2. Specifications, PRDs, or ticket paths provided by the user.
3. Files in `docs/`, `specs/`, or `.scratch/` that match the branch or feature.

Do not treat unconfirmed implementation notes as approved specifications. If the specification changed during implementation, use the version most recently confirmed by the user and describe the change.

Ask the user when no source of truth can be found. Omit the specification axis only after the user confirms that no specification exists, and disclose the omission in the summary.

Also read repository rules, architecture documents, and relevant ADRs.

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
- Fixed baseline and reviewed commit range
- Tests and checks that were executed versus merely observed
- Unreviewed areas and residual risks
```

Keep both headings and describe what was checked even when one axis has no findings. Do not fix findings automatically.
