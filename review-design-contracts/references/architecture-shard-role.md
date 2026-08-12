# L2 architecture shard role

Use the complete target, its Contract Ledger, and only the supplied support-document projections. Extract cross-boundary contracts from confirmed authority projections into `contracts`; do not extract expected contracts from observed context. Then produce architecture candidates whose finite violation path is demonstrable inside this closed shard.

Treat a section projection as a bounded view of its source document. Return `insufficient_input` only when the projection cuts a contract that is materially required to judge this shard; do not request unrelated documents or other shards. Do not modify or judge L1 candidates.

Return exact contract quotes from the supplied content. Produce at most one candidate per unique path and keep contracts, triggers, violations, and verification procedures minimal.
