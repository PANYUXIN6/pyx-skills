# Diagnosis and Recovery

Use evidence-driven diagnosis for bugs, failures, performance problems, and unexpected behavior. Prevent repeated guesses from accumulating into an unreliable repair.

## Establish the Failure

- Reproduce the problem consistently when possible.
- Read the full error, logs, stack trace, and relevant tool output.
- Inspect recent changes, environmental differences, and nearby working examples.
- Trace incorrect values or behavior back to the earliest supported source.

If the issue cannot be reproduced, gather discriminating evidence instead of inventing a cause.

## Test a Root-Cause Hypothesis

1. State one specific hypothesis and the evidence supporting it.
2. Choose the smallest experiment that could disprove it.
3. Change one principal variable at a time.
4. Interpret the result before attempting another change.
5. Fix the supported root cause with the smallest scoped change.

Add a regression test or durable reproduction when it meaningfully protects the behavior. Do not force test-first ceremony for artifacts where it adds no reliable signal.

## Bound the Repair Loop

Track what each failed attempt disproved or revealed. Do not stack another patch when the previous attempt produced no new understanding.

Stop and reassess when repeated attempts target the same symptom, evidence stops improving, or the proposed change expands beyond the original diagnosis. Revisit requirements, system boundaries, environment, and architectural assumptions. Escalate to an independent reviewer, a more capable model, or the user when a consequential uncertainty remains.

Use [verification.md](verification.md) after the repair to prove the original failure is resolved and relevant behavior still works.
