# Security and Reliability Review

Use this module for changes involving trust boundaries, sensitive data, persistence, concurrency, or external systems. For every finding, explain exploitability or trigger conditions and the practical impact.

## Input, Output, and Access Control

- Check XSS, SQL/NoSQL/command injection, SSRF, path traversal, prototype pollution, and unsafe deserialization.
- Check authentication, authorization, tenant isolation, object ownership, and IDOR. Do not trust roles, identities, or permission flags supplied by clients.
- Check whether new endpoints, background jobs, or event consumers omit equivalent access controls.
- Check whether CORS, security response headers, error responses, or logs expose internal information.

## Secrets, Tokens, and Cryptography

- Check for keys, tokens, credentials, or personal information leaked through code, configuration, logs, client bundles, or errors.
- Check validation of token expiration, issuer, audience, algorithm, and session lifecycle.
- Check weak algorithms, hard-coded IVs or salts, unauthenticated encryption, and unsafe defaults.
- Check dependency provenance, version pinning, and supply-chain boundaries. Report known vulnerabilities only when supported by evidence.

## Runtime Reliability

- Check timeouts, retries, backoff, circuit breakers, rate limits, and failure propagation for external calls.
- Check unbounded loops, recursion, request bodies, buffers, connections, file handles, CPU, and memory consumption.
- Check whether retries require idempotency keys and whether partial failures leave inconsistent state.

## Concurrency and Data Integrity

- Check shared state, non-thread-safe collections, lazy initialization, and missing synchronization.
- Check check-then-act, TOCTOU, read-modify-write sequences, and lost updates.
- Check whether balances, inventory, counters, uniqueness, and permission checks use atomic operations, constraints, or appropriate locks.
- Check transaction boundaries, isolation levels, partial writes, event ordering, and cache-invalidation races.
- Check duplicate delivery, out-of-order execution, distributed locks, and failure recovery for distributed jobs.

## Evidence Requirements

Do not merely list vulnerability categories. Explain what an attacker or concurrent participant controls, which prerequisites must hold, how the execution path reaches the dangerous operation, and the impact on confidentiality, integrity, or availability.
