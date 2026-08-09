# Brainstorming Minimal Integration Evaluation

This suite deliberately does not grade whether a design is globally optimal. That
judgment is context-dependent and model-based grading did not add reliable signal.

The single smoke case checks only stable basics:

- an ordinary design request discovers `brainstorming` without preselection;
- the skill leads Codex to read the supplied repository constraint;
- the response recommends the design directly implied by that constraint.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/brainstorming static
python3 evals/scripts/run_eval.py --suite-root evals/suites/brainstorming smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/brainstorming smoke --max-codex-calls 1
```

Use `case automatic-brainstorm-routing` for the same one-call diagnostic.

The visual companion has a separate zero-Codex local smoke test because it binds a
loopback port:

```bash
RUN_VISUAL_COMPANION_SMOKE=1 python3 -m unittest \
  evals.tests.test_runner.IsolationTests.test_visual_companion_starts_serves_and_stops
```
