# L2 architecture merge role

Use the target Contract Ledger, the Runner-validated cross-shard signals, and the complete set of bounded shard results. Trace only the supplied signals and discover only new cross-shard architecture violations that no single shard could establish. Do not repeat, rewrite, rank, reject, or drop shard candidates; the Runner preserves those losslessly.

Every candidate must cite an exact contract quote already present in a supplied ledger entry, include the smallest exact `evidence_sections` set including every target heading whose contract must change to close the path, and provide a concrete finite trigger across at least two shard boundaries. The Runner derives the immutable repair scope from those target sections. Return an empty candidate list when the signals establish no additional path. Return `insufficient_input` only when the supplied signal or shard result set is structurally incomplete.
