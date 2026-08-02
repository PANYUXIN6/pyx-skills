# Removal and Iteration Plan

Propose removal candidates only when evidence shows that code is unused, duplicated, superseded, permanently disabled, or creates real risk. Search static references first, then consider dynamic loading, reflection, external consumers, and runtime configuration.

## Safe to Remove Immediately

Use this category only when there are provably no active consumers and the removal scope can be verified. For each item, state:

- Location and responsibility
- Evidence that it is unused or superseded
- Impact scope
- Minimal removal steps
- Tests, configuration, or documentation that must be updated
- Verification method

## Defer Removal

Do not recommend immediate removal when external consumers, migrations, monitoring, or team confirmation are prerequisites. Provide:

- The reason for deferral and current risk
- Required prerequisites
- Compatibility or migration steps
- Verification metrics and observation window
- Rollback plan

## Reporting Constraints

- Do not treat “looks unused” as evidence for removal.
- Do not recommend opportunistic deletion of pre-existing dead code unrelated to the current change; mention it separately as a residual risk if useful.
- Removal plans must protect external contracts, data migrations, and recoverability.
