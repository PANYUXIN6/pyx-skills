# Testing Guidelines Minimal Routing Evaluation

This suite checks that test-design work discovers `testing-guidelines` while merely
running existing tests does not. It does not grade a generated test strategy or use
test count and coverage percentage as quality signals.

The two smoke cases verify that:

- an ordinary request to add unit tests discovers `testing-guidelines` without TDD;
- a run-only request does not discover `testing-guidelines`.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/testing-guidelines static
python3 evals/scripts/run_eval.py --suite-root evals/suites/testing-guidelines smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/testing-guidelines smoke --max-codex-calls 2
```

Use the `case` command for a one-call diagnostic. There is no semantic grader,
baseline, repeated trial, regression profile, or differential profile.
