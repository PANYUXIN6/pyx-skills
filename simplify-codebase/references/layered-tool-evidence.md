# Layered Tool Evidence

Use repository-owned analyzers and gates as complementary evidence. Let the repository own tool choice, entries, exclusions, thresholds, and command composition. Do not install a favorite tool, copy another repository's policy, or run every available command merely because this Skill was invoked.

## Discover the Repository Portfolio

Read repository instructions, package or task scripts, CI workflows, analyzer configuration, test configuration, architecture maps, and documented defensive patterns. Prefer an existing aggregate command when it owns dependency order, platform differences, generated prerequisites, or package validation.

Record explicit entry points, project scopes, ignored workspaces, exclusions, and allowlists. They are part of a tool's claim boundary: an unconfigured dynamic entry can create a false dead-code report, while an excluded file has not passed that gate. Preserve justified exceptions; challenge only stale, overly broad, or unexplained ones.

## Interpret Each Signal

| Signal | Examples | Useful evidence | Does not prove |
| --- | --- | --- | --- |
| Unused surface and dependency analysis | Knip, vulture, dead-code or dependency graph tools | Candidate files, exports, packages, and dependencies | Dynamic, reflective, generated, external, or configuration-driven absence |
| Duplication analysis | jscpd, clone detectors, identical-function rules | Repeated implementation or lifecycle ownership worth tracing | That intentional twins, fixtures, generated code, or distinct responsibilities should merge |
| Lint and type-aware rules | Oxlint, ESLint, Ruff, Clippy, compiler diagnostics | Unused locals, impossible branches, redundant type operations, identical conditions, lost promises | Repository-wide API deadness or safe behavior removal |
| Coverage | Vitest, pytest, language coverage tools | Executed and unexecuted paths inside the declared corpus | Whether an uncovered path is dead versus insufficiently tested, or whether excluded code is safe |
| Focused tests and snapshots | Unit, integration, replay, UI or protocol snapshots | Remaining behavior, lifecycle, output, and real entry paths | External consumers or unmodeled environments |
| Structural and artifact gates | Typecheck, build, module graph, package lint, consumer smoke, generated catalogs | Imports, exports, artifacts, package boundaries, and downstream assembly remain coherent | Product intent by themselves |
| Documentation and defensive records | Docs checks, ADRs, incident-derived defensive patterns | Current contracts, protected negative guarantees, and reasons apparently redundant machinery exists | Permanent immunity when stronger current evidence supersedes the rationale |

Coverage creates a decision point, not an automatic instruction: either the path is supported and needs credible coverage, or semantic evidence shows it should be deleted. Follow the repository's coverage policy and justified exemptions. When no policy exists, use coverage only as diagnostic evidence and do not introduce thresholds as a cleanup side effect.

## Compose and Run Gates

For an audit, run non-mutating discovery tools only when they materially improve the survey. Read their configuration before trusting findings, and classify each result through production, ambiguous, external, and non-production consumers.

For an apply:

1. Select focused checks for the candidate's remaining behavior and real entry path.
2. Add structural, generated, documentation, package, or aggregate gates when the removal crosses those surfaces.
3. Use the repository's exhaustive aggregate only for a genuinely broad change, an explicit request, or when the repository declares it mandatory. Let CI own platform matrices and other exhaustive lanes when repository policy says so.
4. Treat a dependency-skipped gate as not executed. Preserve every independent failure fact and distinguish a current regression from an evidenced pre-existing failure.

Never delete code solely because one analyzer reports it, never add tests solely to silence a coverage threshold for behavior with no owner, and never weaken an analyzer configuration or exclusion merely to make the cleanup pass.
