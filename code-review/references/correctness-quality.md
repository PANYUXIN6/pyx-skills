# Correctness and Quality Review

Focus on issues that may cause incorrect behavior, silent failures, performance regressions, or real maintenance costs.

## Correctness and Edge Cases

- Check null values, empty collections, first and last elements, zero values, negative numbers, maximum values, and off-by-one errors.
- Distinguish valid `0`, empty-string, and `false` values to avoid incorrect truthiness checks.
- Check division by zero, numeric precision, overflow, pagination boundaries, Unicode, and oversized inputs.
- Check the completeness of state transitions, defaults, enum branches, retries, and idempotent behavior.
- Check whether changes to return values, exceptions, types, or side effects break caller contracts.

## Error Handling

- Flag swallowed exceptions, log-and-continue behavior, overly broad catches, and unhandled asynchronous errors.
- Check whether errors are transformed or propagated at the correct boundary and whether callers can detect failure.
- Prevent exposure of stack traces, internal paths, or sensitive context to users.
- Watch for unnecessary fallbacks added to trusted paths that conceal invariant violations.
- Check whether recovery strategies preserve data consistency and provide enough diagnostic context.

## Performance and Resources

- Check repeated computation, synchronous I/O, expensive parsing, regular expressions, and cryptographic operations on hot paths.
- Check N+1 queries, unpaginated reads, over-fetching, missing batching, and potentially missing indexes.
- Check unbounded collections, caches, queues, recursion, buffers, and whole-file loading.
- Check cache keys, TTLs, invalidation strategies, and accidental sharing of user data.
- Report performance issues only when call frequency and data scale support the conclusion.

## Types and Local Quality

- Check whether `any`, forced assertions, or `unknown as T` bypass real type problems.
- Check whether deep nesting, repeated branches, or inconsistent local patterns make correctness difficult to verify.
- Flag duplicated code, mysterious names, and comments that conflict with behavior, but do not nitpick stylistic differences with no practical impact.
- Accept a new abstraction only when it reduces real duplication or coupling. Do not recommend speculative generalization.

## Evidence Requirements

For every finding, answer: What input or state triggers it? What is the current behavior? What is the expected contract? Who is affected? What is the smallest fix? Continue investigating or omit the finding when these questions cannot be answered.
