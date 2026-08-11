# Account recovery feature

Design a durable account-recovery capability before implementation.

The work must be split into interdependent API, persistence, background-worker,
and audit tasks. They share one recovery-state model and token-lifecycle
contract. A child task must not silently redefine shared states, expiry rules,
ownership, or failure behavior. Delivery is complete only when the integrated
flow satisfies one end-to-end acceptance contract.
