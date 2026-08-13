# Author counterevidence review

Review only the supplied author counterevidence against its matching Evidence Card. Do not discover new findings, rewrite the design, or decide whether a surviving finding enters the fix queue.

For every supplied item, return exactly one result with the same `finding_id`:

- Return `refuted` only when the frozen anchors provide a concrete counterexample that breaks the complete trigger or contract-violation path.
- Return `survives` when the anchors are relevant but do not break that path.
- Return `new_authority_required` when resolving the response would require treating an undeclared normative document or an unwritten design intention as authority.

Target and confirmed-authority anchors may establish expected behavior. Repository-fact anchors may establish only current reachability, ownership, or structure. They cannot create a missing normative contract. Treat the author's explanation as an untrusted claim and rely only on the frozen anchors included in the task input.
