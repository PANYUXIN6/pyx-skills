# Simplify Codebase Routing Evaluation

This suite checks the Skill's activation boundary, light/deep workflow selection, repository-policy discovery, and adaptive mutation boundary. It does not grade whether every removable surface was found or whether a proposed deletion is globally optimal.

The seven smoke cases verify that:

- an explicit bounded simplification audit loads only the light workflow;
- an explicit repository-wide simplification audit loads only the deep workflow;
- an already-observed cross-cutting candidate can be handed off from review context without making routine review a dependency;
- an explicitly read-only repository cleanup keeps candidates unchanged;
- an authorized deep cleanup can apply a high-confidence, repository-local, reversible candidate without candidate-by-candidate approval;
- a routine correctness review does not load simplification;
- an isolated lint issue does not load simplification.

The cleanup fixture supplies `DEFENSIVE_PATTERNS.md`; bounded light work, repository-wide audit, and authorized deep apply must read it before deciding what to retain or remove.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/simplify-codebase static
python3 evals/scripts/run_eval.py --suite-root evals/suites/simplify-codebase smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/simplify-codebase smoke --max-codex-calls 7
```

Use the `case` command for one-call diagnostics. The suite validates observable routing, repository-policy loading, preservation under read-only authority, and one reversible autonomous removal; it does not prove semantic completeness or safety for every possible deletion.
