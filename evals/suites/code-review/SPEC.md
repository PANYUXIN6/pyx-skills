# Code Review Minimal Routing Evaluation

This suite checks stable workflow and module-routing boundaries. It does not grade
whether every possible defect was found or whether a review is globally optimal.

The five smoke cases verify that:

- a routine patch review loads the routine workflow and correctness module, then
  prepares, validates, and finalizes through the deterministic Runtime without
  loading the diagnostic protocol on the happy path;
- a security-only request loads the focused workflow and security module without
  expanding into the default correctness or diagnostic protocol modules, while
  retaining Runtime gates;
- a current-state acceptance review proceeds without a Git baseline, checks the
  confirmed specification, uses an explicit-file Manifest, and discloses the
  historical limitation;
- a comparison-mode acceptance review stops when its required baseline is invalid.
- a request to review a prose Markdown document itself does not load `code-review`
  or start its deterministic Runtime.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review static
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review smoke --max-codex-calls 5
```

Use the `case` command for a one-call diagnostic. The suite validates routing,
Runtime prepare/mark/validate/finalize use, and fail-fast behavior, not whether the
Agent actually performed complete semantic analysis. The Runtime's mechanical
contracts have separate Node.js regression tests.
