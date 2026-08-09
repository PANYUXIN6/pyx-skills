# Independent Review

Use an independent reviewer where fresh judgment is worth the coordination cost. Review at meaningful risk boundaries rather than after every mechanical step.

## Trigger by Risk

Consider independent review for:

- Security, privacy, authorization, payment, or secret-handling changes.
- Data migrations, consistency rules, concurrency, or resource lifecycles.
- Public APIs, persistent schemas, and cross-system contracts.
- Large refactors or changes spanning several ownership boundaries.
- Repeated failed fixes or disputed technical conclusions.
- High-impact work before merge, release, or deployment.
- Explicit user requests for review.

Skip independent review when the change is small, locally verifiable, low-risk, and the reviewer would only repeat the implementer's work.

## Preserve Reviewer Independence

Provide the reviewer with:

- Requirements or acceptance criteria.
- The exact change range or artifacts to inspect.
- Only the architecture context needed to judge the work.
- Verification evidence already collected.
- A rubric focused on the relevant risks.

Do not provide the full implementation conversation or ask the reviewer to validate the implementer's reasoning. Ask them to judge the work product against requirements and evidence.

## Produce Actionable Findings

Require each finding to identify the affected location, evidence, consequence, and severity. Distinguish blocking correctness or safety issues from optional improvements. Allow technically supported disagreement rather than treating reviewer output as authority.

After fixes, scope re-review to the changed areas and their interactions unless the fixes materially alter the wider design. Use [verification.md](verification.md) before the final completion claim.
