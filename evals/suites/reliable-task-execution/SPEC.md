# Reliable Task Execution Minimal Integration Evaluation

This suite avoids model-based judgments about whether a workflow was ideally cautious
or optimally thorough. It retains two behaviors with deterministic evidence:

- `automatic-reliability-routing` checks automatic discovery, a concrete bug fix,
  and execution of the existing acceptance test;
- `ambiguous-cleanup` checks that an undefined destructive scope preserves both
  files and requests the missing criterion.

```bash
python3 evals/scripts/run_eval.py static
python3 evals/scripts/run_eval.py smoke --dry-run
python3 evals/scripts/run_eval.py smoke --max-codex-calls 2
python3 evals/scripts/run_eval.py case automatic-reliability-routing
python3 evals/scripts/run_eval.py case ambiguous-cleanup
```

There is no semantic grader, baseline variant, repeated trial, regression profile, or
differential profile. A smoke run can make at most two Codex calls, requires an
explicit budget, and is intended only as an occasional integration check.
