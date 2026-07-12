# Repo Playbook (auto-distilled)

<!-- HARD CAP: 150 lines. Eviction: lowest hits, oldest first.      -->
<!-- Written ONLY during DISTILL. Executors read, apply, report.    -->

Apply a PATTERN when a task matches its WHEN. Report
`PLAYBOOK: PB-<n> applied → pass|fail` or `PB-<n> stale: <why>`.
Never apply anything under QUARANTINE.

## Entry format
### PB-<n> · <class-signature>
provenance: T<x> <YYYY-MM> · hits: <k>
WHEN: <conditions matching a task to this class>
DO:   <3–10 imperative steps / invariants, order matters>
VERIFY: <the check that proves it worked>

## PATTERNS
(none yet — first entry appears after the first high-tier success on a
recurring class)

## QUARANTINE
(entries that caused an acceptance failure — revise before reuse)
