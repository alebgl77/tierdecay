# Repo Playbook (auto-distilled)

## PATTERNS

### PB-1 · add-adapter-cli
provenance: T2 2026-09 · hits: 0
floor: T1
WHEN: adding an adapter.
DO: preserve invariants.
VERIFY: run tests.

## QUARANTINE

### PB-2 · fix-api-client
provenance: T3 2026-09 · hits: 0
floor: T2
WHEN: changing a critical client.
DO: keep it quarantined.
VERIFY: review.
