# Placement Analysis Rubric

Before implementation, communicate enough evidence to show that the change has a resolved owner and boundary. Use the relevant lenses below; do not force them into fixed headings or repeat information that is already obvious.

- **Map status:** whether relevant map information is usable, missing, stale, or unnecessary in automatic mode.
- **Responsibility:** which module owns the changed behavior and why.
- **Entry and flow:** where the behavior enters and the relevant call or data path.
- **Placement:** the files or layer to change and why the logic belongs there.
- **Boundary:** adjacent modules or responsibilities that should remain unchanged.
- **Risk and evidence:** the likely regression points and the narrowest credible verification.

For a local but explicitly invoked map-first task, a few concise sentences may be enough. For work spanning several independent subsystems, expand the analysis to make ownership, interfaces, dependency direction, and failure boundaries clear.

Do not begin implementation while two materially different placements remain plausible. Ask the user only when repository evidence cannot resolve a choice that depends on product intent, ownership policy, or risk tolerance.
