# Routine Review Workflow

Use this workflow for engineering reviews of the current workspace, routine PRs, commits, or explicit ranges. Read `correctness-quality.md` completely by default, then add risk modules according to the top-level routing table.

## Steps

1. Fix the review scope using `git status -sb`, diff statistics, and the actual diff. For the current workspace, cover staged changes, unstaged changes, and relevant untracked files.
2. Identify entry points, ownership boundaries, and critical paths. Search relevant callers, types, tests, and external contracts as needed.
3. Verify correctness and regression risk first, then perform dispatched security, architecture, or removal checks.
4. Keep only findings with explainable triggers and practical impact. Do not report personal preferences as issues.
5. Record tests that were actually executed or observed. Do not infer that a change is correct merely because tests exist.

## Severity

Classify all findings as P0–P3:

| Level | Meaning | Merge guidance |
|---|---|---|
| P0 | Can cause a critical security incident, data loss, or core feature unavailability | Must block the merge |
| P1 | Clear logic defect, authorization issue, or major reliability or performance regression | Fix before merging |
| P2 | Design or quality issue with real maintenance cost or medium risk | Fix in the current change or create an explicit follow-up |
| P3 | Low-risk, evidence-backed local improvement | Optional |

## Output

```markdown
## Code Review Summary

**Review scope**: <files and line count or commit range>
**Overall conclusion**: APPROVE / REQUEST_CHANGES / COMMENT

## Findings

### P0
### P1
### P2
### P3

## Removal and Iteration Plan
<Include only when removal-plan.md was loaded and contains relevant items>

## Coverage and Residual Risks
<Executed checks, unreviewed areas, and recommended additional tests>
```

Every finding must include its location, trigger, impact, evidence, and the smallest safe fix direction. Explicitly state when no findings exist, and retain the Coverage and Residual Risks section.
