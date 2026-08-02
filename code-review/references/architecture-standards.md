# Architecture and Standards Review

Apply explicit repository standards, architecture, and ADRs first; they override the general guidance in this module. Report only issues that create real coupling, extension, comprehension, or regression costs.

## SOLID and Boundaries

- **Single Responsibility**: Check whether a module has unrelated reasons to change or mixes transport, persistence, and domain rules.
- **Open/Closed**: Check whether adding a real variant requires modifying multiple stable branches. Do not create extension points in advance for hypothetical needs.
- **Liskov Substitution**: Check whether a subtype weakens preconditions, strengthens postconditions, rejects base-type behavior, or forces callers to inspect concrete types.
- **Interface Segregation**: Check whether implementers are forced to depend on or implement methods they do not need.
- **Dependency Inversion**: Check whether high-level rules are unnecessarily coupled to concrete I/O, storage, or network implementations.

## Code Smell Baseline

Check for Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, and Refused Bequest.

Treat these smells as investigation prompts, not automatic violations. Do not duplicate rules that formatters or static analysis tools already enforce reliably.

## Minimal Improvement Principles

- Split by responsibility, not file size.
- Introduce an abstraction only when a real second use case or stable boundary exists.
- Provide incrementally verifiable steps for non-trivial refactoring; do not recommend a one-shot rewrite.
- Explain how an improvement reduces coupling or increases cohesion, and identify the existing behavior and tests that must be protected.
- Distinguish issues introduced by the current change from existing debt. Usually mention pre-existing issues that the change does not worsen only as residual risks.
