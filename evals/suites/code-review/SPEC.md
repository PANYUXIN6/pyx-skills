# Code Review Minimal Routing Evaluation

This suite checks stable workflow and module-routing boundaries. It does not grade
whether every possible defect was found or whether a review is globally optimal.

The four smoke cases verify that:

- a routine patch review loads the routine workflow and correctness module;
- a security-only request loads the focused workflow and security module without
  expanding into the default correctness module;
- a current-state acceptance review proceeds without a Git baseline, checks the
  confirmed specification, and discloses the historical limitation;
- a comparison-mode acceptance review stops when its required baseline is invalid.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review static
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review smoke --max-codex-calls 4
```

Use the `case` command for a one-call diagnostic. The suite validates routing and
fail-fast behavior, not semantic review completeness.
