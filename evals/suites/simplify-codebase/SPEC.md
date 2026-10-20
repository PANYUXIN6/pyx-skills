# Simplify Codebase Routing Evaluation

This suite checks the Skill's activation boundary, light/deep workflow selection, repository-policy discovery, and adaptive mutation boundary. It does not grade whether every removable surface was found or whether a proposed deletion is globally optimal.

The seven smoke cases verify that:

- an explicit bounded simplification audit loads only the light workflow;
- an explicit repository-wide simplification audit loads only the deep workflow;
- an already-observed candidate can be handed off from review context to a read-only, policy-backed simplification audit without making routine review a dependency;
- an explicitly read-only repository cleanup keeps candidates unchanged;
- an authorized deep cleanup can directly remove a high-confidence, repository-local, reversible candidate without candidate-by-candidate approval or a replacement compatibility layer;
- a routine correctness review does not load simplification;
- an isolated lint issue does not load simplification.

The cleanup fixture supplies `DEFENSIVE_PATTERNS.md`; bounded light work, repository-wide audit, and authorized deep apply must read it before deciding what to retain or remove.

The handoff case grades activation, a selected workflow, repository-policy discovery, preservation of the candidate and its test/documentation, and a consumer-based verdict. It does not prescribe light or deep: its request requires tracing exports and runtime callers beyond the reviewed lines without fixing that proof boundary. The dedicated bounded-light and repository-deep cases retain their depth-specific expectations; routine-review and isolated-lint cases retain their negative routing expectations.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/simplify-codebase static
python3 evals/scripts/run_eval.py --suite-root evals/suites/simplify-codebase smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/simplify-codebase smoke --max-codex-calls 7
```

Use the `case` command for one-call diagnostics. The suite validates observable routing, repository-policy loading, preservation under read-only authority, and one reversible autonomous removal; it does not prove semantic completeness or safety for every possible deletion.
