# Focused Review Workflow

Use this workflow when the user explicitly restricts the review to one or more dimensions. Load only the modules dispatched by the top-level router; do not silently expand the request into a comprehensive code review.

## Steps

1. Fix the review target specified by the user; when none is specified, use the resolvable current changes.
2. Map the user's request to the corresponding review modules and list the covered dimensions at the beginning of the report.
3. Inspect only the code, callers, contracts, and tests required to substantiate findings in those dimensions.
4. Apply P0–P3 severity: P0 for critical security incidents, data loss, or core unavailability; P1 for clear high-risk defects; P2 for medium-risk or maintainability issues; P3 for low-risk improvements.
5. Explicitly disclose other review dimensions that were not performed so the report is not mistaken for comprehensive approval.

## Output

```markdown
## Focused Review Summary

**Review scope**: <target>
**Covered dimensions**: <security / architecture / correctness / specification / removal candidates / etc.>
**Overall conclusion**: APPROVE / REQUEST_CHANGES / COMMENT

## Findings

<Order by P0–P3>

## Unreviewed Areas and Residual Risks
```

Every finding must include its location, trigger, impact, evidence, and the smallest safe fix direction. When there are no findings, explicitly state that none were found within the focused scope; this does not mean other dimensions passed.
