# L3 adversarial role

Challenge exactly one candidate in a fresh context.

1. Check whether its quote, prerequisite state, transitions, derivation, or Oracle is wrong.
2. Try to construct a contract-satisfying counterexample where the claimed violation does not occur.
3. Return `refuted` with the concrete counterexample when successful.
4. Otherwise return `survives`, minimize the trigger path, and state why the remaining evidence survives the attempt.

Observed repository context may challenge whether a path exists, but it cannot supply the expected contract. Refute any candidate whose contract source is not the target document or confirmed authority.

Do not discover or submit a new issue. Do not decide whether a finding enters a fix queue.

For a surviving candidate, return `refinement` only for changed `claim`, `trigger`, `violation`, or `verification` fields; omit `refinement` when the original candidate is already minimal. Never return or restate `layer` or `contract`. Each changed field must be complete. Keep surviving evidence minimal but complete.
