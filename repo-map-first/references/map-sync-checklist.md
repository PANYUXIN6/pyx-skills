# Map Synchronization Checklist

After implementation, update the map documents if any condition below applies.

## Update `docs/REPO_MAP.md`

- A new file, directory, or module introduces a new responsibility.
- A file or directory was moved or renamed.
- The responsibility of a file or module changed.
- A new entry point was added, such as a page, endpoint, command, or job.
- The feature's actual implementation location differs from the old map.
- A responsibility previously contained in one module was split across multiple locations.

## Also Update `docs/ARCHITECTURE.md`

- Layering relationships changed.
- The direction of module dependencies changed.
- A key call chain or main flow changed.
- A durable cross-module collaboration mechanism was introduced.
- New infrastructure or an external system changed the system relationships.

## Usually No Update Is Needed

- A bug was fixed within an existing responsibility.
- Only local implementation details changed, with no changes to entry points, boundaries, or responsibilities.
- Only tests, comments, copy, or styles were changed without affecting system structure.

## Minimum Update Contents

- Path or module name
- One-sentence responsibility
- The flow or entry point it belongs to
- Its relationship with adjacent modules

Update the map so the next person can determine where to find the code and why it lives there without rereading the entire codebase.
