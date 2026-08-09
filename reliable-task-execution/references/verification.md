# Verification

Use current evidence to support factual claims about completion, correctness, or system state.

## Match the Evidence to the Claim

Identify what would directly prove the claim before choosing a command or check.

| Claim | Direct evidence |
|---|---|
| Tests pass | The relevant test command completes with no failures |
| Build succeeds | The full build command exits successfully |
| Static checks pass | The configured lint or type-check command reports no errors |
| A bug is fixed | The original reproduction no longer fails, preferably with a regression check |
| Requirements are satisfied | Each acceptance criterion is checked against the implementation |
| Delegated work is complete | The resulting changes and verification output are independently inspected |

Do not substitute adjacent evidence. A passing linter does not prove a build succeeds, and a changed diff does not prove a bug is fixed.

## Verify the Current State

1. Select the narrowest check that directly proves the claim.
2. Run it against the current files and state.
3. Read the complete relevant output and exit status.
4. Run broader regression checks when the change could affect neighboring behavior.
5. State only the conclusion supported by the evidence.

Prefer project-defined commands and repository conventions. Do not rerun expensive checks without reason, but do not rely on stale results after relevant state has changed.

## Close the Loop

When a relevant check fails and the failure is caused by the current work or is otherwise within scope, diagnose the supported cause, correct it, and rerun the check against the new state. Continue until the claim is supported or a genuine blocker remains.

Distinguish current regressions from unrelated pre-existing failures with evidence. Stop and report the gap when proceeding would require new authority, a material scope expansion, unavailable infrastructure, or an unresolved consequential decision. Use [diagnosis-and-recovery.md](diagnosis-and-recovery.md) when the cause is not already clear or repair attempts repeat.

## Report Accurately

Include the command or observable used, its result, and any remaining gap. If verification is unavailable or incomplete, say so directly and avoid language that implies success.

Treat reports from subagents, CI summaries, and earlier turns as leads to verify, not as substitutes for inspecting the current result.
