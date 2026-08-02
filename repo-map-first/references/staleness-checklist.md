# Repository Map Staleness Checklist

If any condition below applies, do not treat the current map as reliable input. Update it before modifying code.

## Clearly Missing

- `docs/REPO_MAP.md` does not exist.
- The document lists only directory names without responsibilities, entry points, or relationships.
- The document covers only part of the repository and omits the module relevant to the current task.

## Clearly Stale

- The code contains new directories, modules, services, pages, or job flows that are absent from the map.
- Files or directories were renamed or moved, but the map still uses the old paths.
- Entry points changed, but the map still points to the old ones.
- A key flow changed course, but the map still describes the old call chain.
- Responsibility ownership in the documentation clearly differs from the code.
- `REPO_MAP` and `ARCHITECTURE` contradict each other.

## Insufficient for the Current Task

- The map does not make clear which layer should change.
- The map does not reveal where the existing logic begins.
- The map does not describe relationships between modules relevant to the current task.
- The task adds a capability, but the map identifies no module that should own it.

## Minimum Update Standard

If the map is missing or stale, update it enough to support the current task by documenting:

- Relevant module or directory paths.
- A one-sentence responsibility for each relevant module.
- Entry points relevant to the current task.
- The main call chain relevant to the current task.
- The files or layers where the planned changes will live.

Do not document the entire repository merely to update the map. Add only enough detail to place the current change safely.
