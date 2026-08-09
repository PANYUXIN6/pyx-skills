# Specification Compliance Review

Use this module only to determine whether the implementation faithfully follows confirmed sources of truth. Do not judge whether the specification itself is reasonable.

## Establish Traceability

Locate corresponding implementation and test evidence for every specification item, ticket, and acceptance criterion. Classify each as implemented, partially implemented, not implemented, incorrectly implemented, or unverifiable.

## Checks

- Requirements that are missing or only partially implemented.
- Implementations that appear present but fail to match required behavior, boundaries, or error paths.
- Unsatisfied ticket dependencies, prerequisites, or acceptance criteria.
- Behavior, interfaces, or configuration that the user did not request and no confirmed source supports. Call it change-set scope creep only when comparison evidence or confirmed implementation history shows that the reviewed change introduced it.
- Specification changes made during implementation without user confirmation.
- Tests that cover only internal implementation details without proving acceptance behavior.

## Evidence Requirements

Cite all of the following for every finding:

1. The exact location and content of the relevant specification, ticket, or acceptance criterion.
2. The file location of the corresponding implementation or missing implementation.
3. The input, state, or flow that reproduces the discrepancy.

Do not treat unconfirmed comments, commit messages, or implementation notes as approved requirements. Do not guess expected behavior when no source of truth exists.
