# Brainstorming Minimal Integration Evaluation

This suite deliberately does not grade whether a design is globally optimal. That
judgment is context-dependent and model-based grading did not add reliable signal.

The two smoke cases check only stable basics:

- an ordinary design request discovers `brainstorming` without preselection;
- the skill leads Codex to read the supplied repository constraint;
- the response recommends the design directly implied by that constraint;
- a Full Design spanning dependent tasks establishes shared governing contracts,
  dependency order, and integration acceptance without imposing that workflow on
  the ordinary design case.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/brainstorming static
python3 evals/scripts/run_eval.py --suite-root evals/suites/brainstorming smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/brainstorming smoke --max-codex-calls 2
```

Use `case automatic-brainstorm-routing` or
`case automatic-full-design-coordinates-dependent-tasks` for a one-call
diagnostic of either boundary.

The visual companion has a separate zero-Codex local smoke test because it binds a
loopback port:

```bash
RUN_VISUAL_COMPANION_SMOKE=1 python3 -m unittest \
  evals.tests.test_runner.IsolationTests.test_visual_companion_starts_serves_and_stops
```
