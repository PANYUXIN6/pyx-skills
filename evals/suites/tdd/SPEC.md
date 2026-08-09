# TDD Minimal Routing Evaluation

This suite checks routing boundaries only. It does not grade whether a generated test
strategy is globally optimal or count test cases as a quality signal.

The two smoke cases verify that:

- an explicit test-first request discovers `tdd` without preselection;
- an ordinary integration-test request does not discover `tdd`.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/tdd static
python3 evals/scripts/run_eval.py --suite-root evals/suites/tdd smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/tdd smoke --max-codex-calls 2
```

Use the `case` command for a one-call diagnostic. There is no semantic grader,
baseline, repeated trial, regression profile, or differential profile.
