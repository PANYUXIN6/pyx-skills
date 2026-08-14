# Layered Safety Controls

Read this file completely before any `apply`. Scale protection to impact, uncertainty, and recoverability instead of requiring the same approval ceremony for every deletion.

## Classify Impact and Reversibility

Use the highest applicable class:

| Class | Typical surface | Application rule |
| --- | --- | --- |
| Low | Private task-local residue, an internal helper or branch with resolved direct callers, Git-tracked and easily reversible | Apply when mutation is requested and semantic proof plus focused validation agree. |
| Moderate | Cross-module internal API, package, dependency, registry, configuration, generated inventory, or duplicated lifecycle machinery; still repository-local and recoverable | Apply without candidate-by-candidate confirmation only when mutation scope is explicit, ownership is resolved, detection, semantic, behavior-validation, and recovery evidence agree, and relevant aggregate gates are known. |
| High | Public or external contract, persisted data, wire format, migration, user-visible capability, production or external state, irreversible artifact, security boundary, disputed ownership, or overlapping user work | Require specific acceptance of the candidate and consequence plus the repository's recovery or migration procedure; otherwise `defer`. |

A broad request to modify and simplify a bounded repository can authorize low- and moderate-impact application. It does not silently authorize high-impact consequences the user could not identify from the request.

Repository policy may classify additional surfaces as protected or require stronger gates. It cannot grant mutation authority, waive unresolved evidence, or downgrade a globally high-impact consequence.

## Build the Evidence Stack

Use independent layers rather than one universal gate:

1. **Detection**: searches and repository analyzers identify a candidate, duplicated surface, coverage gap, dependency, or suspicious branch.
2. **Semantic proof**: call sites, runtime entry paths, consumer classification, ownership, current decisions, compatibility, and defensive rationale establish what the surface does and whether it is still needed.
3. **Behavior validation**: focused tests, snapshots, type or lint checks, builds, module or package checks, and documentation or generated-file gates exercise what remains.
4. **Recovery evidence**: repository state and change scope show that the edit is reviewable and can be reverted without discarding unrelated work.

Detection never substitutes for semantic proof. Multiple tools built on the same static reference graph count as one supporting layer, not independent agreement. A green test or coverage gate proves only its declared corpus and cannot establish the absence of external or dynamic consumers.

## Resolve Workspace and Scope

- Name the candidate and expected removal closure before editing.
- Inspect staged, unstaged, and untracked work when available. Preserve pre-existing changes and stop on overlap that cannot be separated safely.
- Identify the recovery path. Keep ordinary Git changes as a reviewable diff; use repository backup, migration, or rollback procedures for data, generated state, or external resources.
- Do not use broad recursive deletion, repository cleaning, destructive Git commands, or ambiguous globs for source cleanup.

## Apply and Reassess

- Edit only the candidate and its proven closure. Do not include adjacent pre-existing cleanup.
- Do not delete tests merely to make a gate pass. Remove a test only when it exclusively protects deleted behavior; preserve or adapt tests for every remaining contract.
- Update generated output through its owning source and generator when repository policy requires it.
- Stop and reclassify when an unexpected caller, registration, decision record, migration, data format, defensive pattern, or user change appears. New evidence may move a candidate from low to moderate or high.

After editing, run residual searches, execute the relevant repository-owned gates, inspect the final diff and status, and report the impact class, evidence layers, preserved surfaces, failures, residual risk, and recovery path.
