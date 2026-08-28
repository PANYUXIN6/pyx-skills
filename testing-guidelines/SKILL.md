---
name: testing-guidelines
description: Design, add, modify, or review automated tests and test strategies using risk-driven evidence selection. Use for unit, integration, regression, and end-to-end test work, including as the test-design companion to TDD. Do not use merely to run existing tests or report their results; this skill does not impose test-first sequencing.
license: MIT
---

# Build the Smallest Credible Test Evidence

Protect observable behavior and material risk rather than implementation detail. Treat test quality, not test count or coverage percentage, as the goal. Apply repository-specific test commands and constraints when they are stronger or more specific than these guidelines.

## Start from Behavior and Risk

Before adding or changing a test:

1. Identify the independent behavior, contract, invariant, or confirmed regression to protect.
2. Identify the realistic defect or consequential failure the test could expose.
3. Inspect existing tests and static guarantees before assuming new evidence is needed.
4. Choose a stable observation boundary with sufficient fidelity at reasonable cost.
5. Select the smallest test set that distinguishes the intended behavior from the failures that matter.

Derive expected results from requirements, contracts, known examples, invariants, or historical regressions instead of restating the production algorithm. Tests are evidence for established behavior, not a source of new requirements. Treat existing tests, snapshots, and assertions as possible contract evidence until repository authority shows that the expected behavior changed.

If a proposed test protects no distinct behavior, contract, or material failure, do not add it.

## Prioritize Valuable Coverage

Prioritize:

- confirmed acceptance criteria and the core successful path;
- boundaries where crossing the boundary changes the result;
- failure paths with real product, operational, or user impact;
- permissions, security, privacy, and data integrity;
- complex business rules and state transitions;
- regressions for defects that have already occurred.

Avoid tests for:

- trivial accessors, simple pass-throughs, or facts already guaranteed by types or static tooling;
- framework behavior that the project does not own;
- private implementation details that can change without observable impact;
- mock call counts or internal ordering unless the interaction itself is a contract;
- repeated inputs that exercise the same behavior and failure mechanism;
- unsupported speculative extremes or cases added only to increase coverage.

## Control the Evidence Set

Choose representative cases from behaviorally distinct equivalence classes rather than enumerating inputs. Test boundary values only where the boundary changes behavior. Use parameterized or table-driven cases when they keep one rule legible.

If two tests would fail for the same defect and protect no different contract, consolidate or remove one. Add evidence at more than one level only when each level protects a distinct risk.

## Choose the Observation Level

Use the lowest-cost level that provides sufficient confidence:

- Use static checks for guarantees that types, lint rules, schemas, or builds can establish reliably.
- Use unit tests for isolated business logic with meaningful inputs and outputs.
- Use integration tests when the important behavior or failure exists in collaboration between modules, persistence, serialization, or infrastructure boundaries.
- Reserve end-to-end tests for a small number of critical user journeys; do not use them to enumerate edge cases.

Do not create unit tests merely so every function has one. Prefer real, cheap, deterministic dependencies. Use fakes, stubs, or mocks when isolation, controllable failures, determinism, or cost justifies their reduced fidelity. Do not use extensive mocks to repeat internal relationships already protected by higher-fidelity evidence.

## Verify and Stop

Run the focused new or changed tests and the directly affected existing tests. Expand to broader suites only when coupling, risk, or repository rules justify the cost.

Use coverage reports to locate possible blind spots, not as completion targets. Do not manufacture low-value cases for a percentage, simple branch, or 100% coverage. Prefer credible protection of core behavior and consequential failures over a higher aggregate number.

Keep tests isolated from paid or production services, production data, and difficult-to-reverse external actions unless the user clearly authorizes that impact. Keep the change tied to the requested behavior and record unrelated issues instead of expanding the diff.

## Ask Only for User-Owned Decisions

Investigate first, then ask when available evidence cannot resolve:

- conflicting specifications, existing tests, and current behavior;
- a change to a public contract or user-visible behavior;
- acceptance thresholds or residual risk for security, payments, privacy, permissions, or data migration;
- whether to remove or weaken a test that may still represent a valid requirement;
- a substantial production-architecture change made primarily for testability;
- a test strategy with materially different external impact or execution cost.

Handle ordinary seams, cases, assertions, test doubles, and local test refactors without a separate approval round.
