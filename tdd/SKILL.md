---
name: tdd
description: Execute test-driven development through coherent red-green-refactor slices. Use when the user explicitly asks for TDD, test-first, red-green-refactor, or a regression test before fixing a bug. Always pair it with testing-guidelines when adding or changing tests; ordinary test requests use testing-guidelines without this skill.
license: MIT
---

# Drive Implementation Test First

Own the sequencing between confirmed behavior, failing evidence, implementation, and local refactoring. Use `testing-guidelines` to select and validate test evidence; this skill owns only the test-first development loop.

## Establish Behavior Before RED

Start from a requirement, contract, acceptance criterion, invariant, or confirmed regression. Resolve ambiguities that would materially change public or user-visible behavior before entering the loop. Do not let a test invent new requirements.

Use this progression for each coherent slice:

`Requirement -> Acceptance Criteria -> Test Cases -> RED -> GREEN -> REFACTOR`

## Keep the TDD Gates

- **Observe a meaningful RED.** Run the selected evidence before implementation and accept the red only when the intended behavior is absent or broken. Treat build, fixture, import, and environment failures as setup failures.
- **Implement a reasonable GREEN.** Add only the production behavior required by the current slice, while preserving existing architecture and contracts. Do not trade maintainability or correctness for the fastest possible pass.
- **Refactor locally.** Improve only what the current implementation justifies, keep all relevant evidence green, and avoid unrelated cleanup or broader redesign.

## Work in Coherent Vertical Slices

For each remaining behavior:

1. Use `testing-guidelines` to select the smallest credible evidence for that behavior.
2. Add the evidence and observe a valid red.
3. Implement only what that slice requires.
4. Run the focused evidence and keep it green.
5. Refactor only when it improves the current slice, then verify green again.

A slice is one coherent behavior or contract, not necessarily one test function. Finish a slice before starting an independent behavior so each red and green has a clear cause.

## Handle Cases Without a Genuine RED

For characterization tests or behavior-preserving refactors, a genuine red may be unsafe or impossible because the intended behavior already exists. Explain the alternative evidence, preserve current behavior, and do not simulate a meaningless failure merely to imitate the TDD sequence.

Ask the user only when unresolved authority, public behavior, or a substantial architecture change for testability could materially change the implementation. Handle ordinary sequencing, seams, and local refactors without a separate approval round.
