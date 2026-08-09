# Repo Map First Minimal Routing Evaluation

This suite checks routing boundaries only. It does not grade map completeness,
architectural quality, or whether a placement recommendation is globally optimal.

The two smoke cases verify that:

- unresolved cross-module ownership in an unfamiliar repository discovers
  `repo-map-first` without preselection;
- a local change with an exact file, function, and scope does not discover the skill.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/repo-map-first static
python3 evals/scripts/run_eval.py --suite-root evals/suites/repo-map-first smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/repo-map-first smoke --max-codex-calls 2
```

Explicit invocation and repository-context bootstrap are covered by zero-call static
contract checks. There is no semantic grader, baseline, repeated trial, regression
profile, or differential profile.
