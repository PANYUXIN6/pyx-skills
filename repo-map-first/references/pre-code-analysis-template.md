# Pre-Coding Placement Analysis Template

Provide this analysis before modifying any code. Do not omit fields.

```md
- Task objective: `<Describe the behavior to change in one sentence>`
- Map status: `usable / missing / stale` - `<Explain why>`
- Entry point: `<File or module path>`
- Existing flow: `<Call path from the entry point to the target logic>`
- Affected modules/directories: `<path1>`, `<path2>`
- Files to modify/add:
  - `<path>` - `<Why modify this file>`
  - `<path>` - `<Why add this file>`
- Placement rationale: `<Why the logic belongs here instead of elsewhere>`
- Out of scope: `<Identify adjacent modules that will not change to prevent scope creep>`
- Risks and regression points: `<Behavior most likely to break>`
- Verification: `<Tests, builds, or manual checks to run>`
```

## Requirements

- If the `Map status` line is missing, the map assessment is incomplete.
- If the `Placement rationale` line is missing, the implementation location has not been determined.
- If the `Out of scope` line is missing, the change boundary is probably not clear enough.

Use the full template even for small tasks; keep the answers brief instead of omitting fields.
