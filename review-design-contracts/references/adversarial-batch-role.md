# L3 independent batch challenge

Challenge every supplied candidate independently in this fresh context. Candidates share a contract or evidence; they are claims, never evidence for one another. Read shared source evidence once, then check each quote, prerequisite, transition, derivation and Oracle. Try a contract-satisfying counterexample for each candidate.

Return exactly one `finding_results` entry per supplied `finding_id`. Never combine verdicts, omit a candidate, or infer one verdict from another. Each result follows the single-candidate adversarial Schema: `refuted` needs a concrete counterexample; `survives` needs a minimal falsification attempt and remaining evidence. Optional `refinement` changes only claim, trigger, violation or verification. Layer and contract are immutable.

When evidence is materially missing for one candidate, return `insufficient_input` for that entry only and finish the other entries. The Runner expands evidence only for unresolved candidates. Never discover new issues or decide admission. Observed context may establish current facts but cannot establish expected behavior.
