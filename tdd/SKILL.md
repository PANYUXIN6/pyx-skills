---
name: tdd
description: Risk-aware test-driven development. Use when the user explicitly asks for TDD, test-first, red-green-refactor, or a regression test before fixing a bug; ordinary requests that merely include tests use the normal workflow.
---

# Risk-Aware Test-Driven Development

Use tests as the smallest credible evidence that distinguishes correct behavior from the failures that matter. Test count and coverage percentage are not goals. Cover changed behavior and material risk, then stop.

## Select the Smallest Useful Evidence

Before writing a test:

1. Identify the independent behavior being added or changed.
2. Identify the most likely or consequential ways it could fail.
3. Inspect existing tests before assuming new coverage is needed.
4. Choose a stable observation boundary with sufficient fidelity at reasonable cost.
5. Select the smallest test set that can distinguish the intended behavior from those failures.

Add tests only for evidence not already supplied by an existing test. Combine examples that exercise the same rule with parameterized or table-driven tests when that keeps the behavior clear.

## Keep These Gates

- **Add discriminating evidence.** Each new test must cover a previously uncovered behavior, risk boundary, meaningful input partition, failure mode, or regression.
- **Observe a meaningful red.** For new behavior or a bug regression, run the test before the implementation when feasible and accept the red only when the target behavior is absent or broken. Treat build, fixture, import, or environment failures as setup failures. For characterization tests or behavior-preserving refactors, explain the alternative evidence when a genuine red is unsafe or unavailable.
- **Use an independent oracle.** Derive expected results from a requirement, contract, known example, invariant, historical regression, or another independent source—not by restating the production algorithm.
- **Preserve contradictory evidence.** Treat snapshots, assertions, existing tests, and meaningful dependencies as requirements until evidence establishes that the expected behavior changed; only then update them deliberately.
- **Verify current behavior.** After implementation, run the focused tests and directly affected existing tests. Expand to broader suites only when the change's risk, coupling, or repository rules justify the cost.
- **Preserve authority.** Keep tests isolated from paid or production services, production data, and difficult-to-reverse external actions unless the user clearly authorizes that impact.

## Work in Coherent Vertical Slices

For each remaining behavior or risk:

1. Add the smallest useful test set for one coherent slice.
2. Observe a valid red when the gate above applies.
3. Implement only what that slice requires.
4. Run the focused evidence and keep it green.
5. Refactor only when it improves the current slice; keep tests passing and avoid unrelated cleanup.

A slice is a behavior or risk, not necessarily one test function. One scenario may use several related assertions, and one table-driven test may cover several meaningful partitions.

## Use Judgment for Test Design

- Prefer stable observable behavior over implementation details, but use a lower-level seam when the important risk lives there or a higher-level test would be slow, vague, or unable to reproduce the failure.
- Prefer real, cheap, deterministic dependencies. Use fakes, stubs, or mocks when isolation, controllable failures, determinism, or cost justifies reduced fidelity.
- Reserve interaction assertions for calls or ordering that are themselves a contract; otherwise verify observable behavior.
- Add tests at more than one level only when each level covers a distinct risk.
- Stop when changed behaviors and material risks have credible evidence. Expand into internal paths, input permutations, or coverage targets only for a specific risk.

## Ask Only When the Decision Belongs to the User

Investigate first, then ask when available evidence cannot resolve:

- conflicting specifications, existing tests, and current behavior;
- a change to a public contract or user-visible behavior;
- acceptance thresholds or residual risk for security, payments, privacy, permissions, or data migration;
- whether to remove or weaken a test that may still represent a valid requirement;
- a substantial production-architecture change made primarily for testability;
- a test strategy with materially different external impact or execution cost.

Handle ordinary seams, cases, assertions, and local refactors without a separate approval round.
