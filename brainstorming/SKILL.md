---
name: brainstorming
description: Resolve uncertain product or architecture decisions before implementation. Use for explicit brainstorming or design requests, or when unresolved trade-offs, blast radius, or reversal cost could materially change the implementation; clear, local, reversible work proceeds directly.
license: MIT
---

# Brainstorm Just Enough

Turn uncertain ideas into decisions that are clear enough to implement. Match the depth of design work to the uncertainty, impact, and cost of being wrong.

Send clear, reversible tasks directly to implementation. Hold implementation only while a materially consequential decision remains unresolved.

## Understand the Context

Inspect the relevant project files, conventions, documentation, and existing behavior before asking the user questions.

Determine:

- Whether the goal and success criteria are clear.
- Whether multiple approaches have meaningfully different consequences.
- How broad and reversible the change is.
- How expensive or dangerous a wrong assumption would be.
- Which decisions require user intent rather than technical inference.
- Whether independent deliverables should be separated before refining details.

Discover facts from the available context and reserve questions for information that cannot be inferred reliably.

If a request spans several independent subsystems or outcomes, decompose it only far enough to identify coherent boundaries, dependencies, and a sensible first slice before designing details.

Perform a brief blind-spot pass only when unfamiliar or high-uncertainty territory could hide a constraint that invalidates the apparent direction.

## Choose the Appropriate Depth

Choose the least intensive path justified by the available evidence. Use the Fast Path when additional design work is unlikely to change the implementation. Use a Design Brief when an unresolved choice could materially change the solution. Reserve Full Design for concrete high-impact or difficult-to-reverse decisions.

### Fast Path

Use the Fast Path when the request is clear, local, low-risk, and easy to reverse.

State only non-obvious assumptions that matter, then continue with the requested work without a design document, alternative proposals, or a separate approval round.

### Design Brief

Use a conversational design brief when some uncertainty or meaningful trade-off exists, but the change does not require a durable specification.

- Ask only questions whose answers could change the solution.
- Group closely related questions when that is clearer for the user.
- Lead with a recommendation.
- Present alternatives only when they are genuinely distinct.
- Explain the important trade-offs without manufacturing options.
- Obtain confirmation when the remaining choice belongs to the user.

Stop the brief once the remaining decision and its material trade-off are clear enough for the user to confirm.

### Full Design

Use a full design process when the work has high impact, high ambiguity, or a high cost of reversal. Examples include:

- Destructive or difficult-to-reverse data changes.
- Security, privacy, authentication, authorization, or payment boundaries.
- Public APIs, persistent schemas, or cross-system contracts.
- Changes spanning multiple independent subsystems.
- Product decisions that materially alter user-visible behavior.
- Work the user explicitly asks to design or specify before implementation.

For these cases:

1. Establish purpose, constraints, and success criteria.
2. Select and present the best design. Compare alternatives only when unresolved, materially different trade-offs remain.
3. Describe the relevant architecture, boundaries, behavior, failure handling, and verification strategy.
4. Resolve consequential ambiguities.
5. Present the design and obtain explicit approval before implementation.

Evaluate the design through the relevant lenses of clear responsibilities, explicit interfaces or contracts, dependency direction, and bounded failure behavior. Use these as quality checks, not required document sections or a fixed template.

### Coordinate Dependent Implementation Tasks

When a Full Design must be implemented through multiple tasks that share contracts or depend on one another:

1. Establish one governing design (the parent design) that owns the shared contracts, task boundaries, dependency order, constraints that child tasks may not redefine, and integration acceptance criteria.
2. Obtain approval for the governing design before treating dependent child-task designs as final.
3. Derive each child-task design from the governing design and keep it focused on its assigned responsibility and verification evidence.
4. Revise and reconfirm the governing design before implementation when a child task needs to change a shared contract.

Determine this relationship by contract ownership, not task chronology. A predecessor task's design is governing only when it owns a shared constraint that the current task must obey.

Skip this coordination for implementation tasks that are genuinely independent.

Present large designs in digestible sections, but do not require approval after every section unless incremental confirmation would genuinely reduce misunderstanding.

## Choose the Best Design

Use project context, user goals, and engineering judgment to select the best design.

If one approach clearly dominates, present it directly and briefly explain why it fits. Generate alternatives only to expose a material unresolved trade-off.

Present multiple approaches only when two or more credible options remain after inspecting the context and they involve materially different trade-offs. Show only the minimum number of options needed to explain the decision.

An alternative is credible only if a knowledgeable engineer could reasonably choose it under the current constraints. Do not include:

- Inferior or deliberately simplistic straw-man options.
- The same design expressed with different terminology.
- Options that conflict with established project conventions.
- Speculative abstractions unsupported by current requirements.

Even when multiple credible approaches exist, lead with a recommendation. Ask the user to choose only when the decision depends on product intent, risk tolerance, cost, or another preference the model cannot infer.

## Documentation

Write a design document only when it will remain useful during implementation or future collaboration, such as for long-running, cross-component, or multi-person work, or when the user requests one.

Follow the repository's existing documentation conventions. Create a specification only when it will remain useful, and make a Git commit only when the user or repository workflow calls for it.

Before handing off a written design, check it for:

- Unresolved placeholders or vague requirements.
- Internal contradictions.
- Scope that should be decomposed.
- Decisions that could still be interpreted in materially different ways.

## Visual Decisions

Offer the visual companion just in time when a concrete visual question would be easier to judge by seeing it.

If the user accepts, read `visual-companion.md` before using the companion.

## Continue After Design

At the selected depth, design work is ready to stop when:

- The intended outcome and credible success evidence are clear.
- Constraints that could invalidate the chosen direction have been resolved or made explicit.
- One recommended approach is selected, with only materially relevant trade-offs retained.
- No unresolved user-owned decision could substantially change the implementation.
- The verification strategy is proportional to the change's risk.

Use these as an internal completion check rather than a document template. Stop designing when any missing field cannot change the implementation.

Once this condition is met and any required approval has been obtained, continue according to the user's request and the needs of the task.

Add a planning skill, design artifact, handoff, or additional approval step only when it improves the outcome.
