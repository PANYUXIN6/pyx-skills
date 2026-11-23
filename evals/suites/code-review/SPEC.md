# Code Review Minimal Routing Evaluation

This suite checks stable workflow and module-routing boundaries. It does not grade
whether every possible defect was found or whether a review is globally optimal.

The eight smoke cases verify that:

- a concrete low-risk logic question finds the partial-page defect without Runtime artifacts or approval;
- a correct local boundary check returns a bounded no-finding answer without reviewing unrelated functions;

- a routine patch review loads the routine workflow and correctness module, then
  prepares, validates, challenges, and finalizes through the deterministic Runtime without
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
- a request that only asks to inspect an implementation approach does not become a
  code review merely because it uses neutral wording such as `检查一下`, and creates
  no Finding artifacts.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review static
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/code-review smoke --model gpt-6.2-sol --reasoning-effort xhigh --max-codex-calls 8
```

Use the `case` command for a one-call diagnostic. The suite validates routing,
local versus formal routing, formal Runtime prepare/mark/validate/challenge/finalize use, and fail-fast behavior, not whether the
Agent actually performed complete semantic analysis. The Runtime's mechanical
contracts have separate Node.js regression tests.
