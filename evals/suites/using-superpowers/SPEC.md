# Using Superpowers Minimal Integration Evaluation

This suite tests a small set of observable routing boundaries, not subjective routing
quality across a large prompt matrix. The eight smoke cases check that:

- one obvious requirement loads its strongly matching support skill directly, without
  an unnecessary router hop or adjacent skill;
- the same direct-selection boundary holds for a different single domain skill;
- two independent requirements load both matching skills;
- genuine ambiguity about which domain applies loads the router before selecting the
  smallest useful support set;
- a trivial self-contained request stays on the default path.
- a substantive request with no matching installed skill also stays on the default path;
- topic-only comparison treats skills as source material rather than workflows;
- an explicit request to use the router is honored.

The two support stubs exist only to make single- versus multi-skill selection observable.

```bash
python3 evals/scripts/run_eval.py --suite-root evals/suites/using-superpowers static
python3 evals/scripts/run_eval.py --suite-root evals/suites/using-superpowers smoke --dry-run
python3 evals/scripts/run_eval.py --suite-root evals/suites/using-superpowers smoke --max-codex-calls 8
```

Use the `case` command for a one-call diagnostic. This remains a bounded routing suite;
it does not claim to measure cross-model routing rates or provide a differential baseline.
